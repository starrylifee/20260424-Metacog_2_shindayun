import { NextResponse } from 'next/server';

import { generateAIExampleAnswer } from '@/lib/aiExampleAnswer';
import { adminDb } from '@/lib/serverDb';

function anonymizeName(name) {
  if (!name || typeof name !== 'string' || name.length < 2) return '학생';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ success: false, error: '입장 코드가 필요합니다.' });
  }

  try {
    const assignmentSnap = await adminDb
      .collection('assignments')
      .where('entryCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (assignmentSnap.empty) {
      return NextResponse.json({ success: true, gallery: [], assignmentTitle: '' });
    }

    const assignmentDoc = assignmentSnap.docs[0];
    const assignment = assignmentDoc.data();
    const assignmentId = assignmentDoc.id;
    const scoreOptions = Array.isArray(assignment.scoreOptions) ? assignment.scoreOptions : [];
    const maxScore = scoreOptions.length > 0 ? Math.max(...scoreOptions) : null;

    // assignmentId 단일 조건만 Firestore에 걸고 나머지는 JS 필터 (복합 인덱스 불필요)
    const allSnap = await adminDb
      .collection('conversations')
      .where('assignmentId', '==', assignmentId)
      .limit(200)
      .get();

    const completedDocs = allSnap.docs.filter((doc) => doc.data().status === 'completed');

    // 교사가 직접 선정한 항목 우선, 없으면 점수 상위 자동 선택
    const curatedDocs = completedDocs.filter((doc) => doc.data().showInGallery === true);
    const isCurated = curatedDocs.length > 0;
    const sourceDocs = isCurated ? curatedDocs : completedDocs;

    const gallery = sourceDocs
      .map((doc) => {
        const data = doc.data();
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const studentMessages = messages.filter((m) => m.role === 'student');
        const fullAnswer = studentMessages.map((m) => m.content).join('\n\n').trim();
        const attempts = Array.isArray(data.attempts) ? data.attempts : [];
        return {
          conversationId: doc.id,
          score: data.score,
          maxScore,
          studentName: anonymizeName(data.studentName),
          lastMessage: fullAnswer,
          feedback: data.feedback || '',
          // 재도전 노력 배지: 재도전 횟수 + 점수 추이
          retryCount: Number.isFinite(data.retryCount)
            ? data.retryCount
            : Math.max(0, attempts.length - 1),
          scoreHistory: attempts.map((a) => a.score),
        };
      })
      .filter((item) => {
        if (!item.lastMessage.trim()) return false;
        // 교사 직접 선정이면 점수 없어도 표시, 자동 선택이면 점수 있는 것만
        return isCurated ? true : (Number.isFinite(item.score) && item.score > 0);
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, 8);

    const showExampleAnswers = assignment.showExampleAnswers ?? false;
    let aiExampleAnswer = null;

    if (showExampleAnswers) {
      if (assignment.aiExampleAnswer) {
        aiExampleAnswer = assignment.aiExampleAnswer;
      } else {
        aiExampleAnswer = await generateAIExampleAnswer(assignment);
        if (aiExampleAnswer) {
          await assignmentDoc.ref.update({ aiExampleAnswer });
        }
      }
    }

    return NextResponse.json({
      success: true,
      gallery,
      assignmentTitle: assignment.title || '',
      assignmentId,
      galleryCommentsEnabled: assignment.galleryCommentsEnabled ?? false,
      showExampleAnswers,
      aiExampleAnswer,
    });
  } catch (error) {
    console.error('Gallery API error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
