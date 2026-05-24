import { NextResponse } from 'next/server';
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

    // 교사가 직접 선정한 갤러리 항목 우선 조회
    let galleryDocs = [];
    try {
      const curatedSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', '==', assignmentId)
        .where('status', '==', 'completed')
        .where('showInGallery', '==', true)
        .orderBy('score', 'desc')
        .limit(10)
        .get();
      galleryDocs = curatedSnap.docs;
    } catch (curatedError) {
      // showInGallery 복합 인덱스가 없으면 무시하고 자동 선택으로 진행
      console.warn('Gallery curated query failed (index may not exist):', curatedError?.message);
    }

    // 선정 항목 없으면 점수 상위 자동 선택
    if (galleryDocs.length === 0) {
      const topSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', '==', assignmentId)
        .where('status', '==', 'completed')
        .orderBy('score', 'desc')
        .limit(10)
        .get();
      galleryDocs = topSnap.docs;
    }

    const gallery = galleryDocs
      .map((doc) => {
        const data = doc.data();
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const lastStudentMsg = [...messages].reverse().find((m) => m.role === 'student');
        return {
          score: data.score,
          maxScore,
          studentName: anonymizeName(data.studentName),
          lastMessage: lastStudentMsg?.content || '',
          feedback: data.feedback || '',
        };
      })
      .filter((item) => Number.isFinite(item.score) && item.score > 0 && item.lastMessage.trim())
      .slice(0, 8);

    return NextResponse.json({
      success: true,
      gallery,
      assignmentTitle: assignment.title || '',
    });
  } catch (error) {
    console.error('Gallery API error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
