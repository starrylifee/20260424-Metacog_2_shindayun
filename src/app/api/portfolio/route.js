import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/serverDb';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name')?.trim();
  const password = searchParams.get('password')?.trim();

  if (!name || !password) {
    return NextResponse.json({ success: false, error: '이름과 비밀번호를 입력해주세요.' });
  }

  try {
    // 모든 교사 중 해당 학생 찾기
    const teachersSnap = await adminDb.collection('teachers').get();
    let teacherId = null;
    let studentCode = null;

    for (const teacherDoc of teachersSnap.docs) {
      const students = teacherDoc.data().students || [];
      const match = students.find(
        (s) => s.name === name && String(s.password) === String(password)
      );
      if (match) {
        teacherId = teacherDoc.id;
        studentCode = match.code;
        break;
      }
    }

    if (!teacherId) {
      return NextResponse.json({ success: false, error: '이름 또는 비밀번호가 맞지 않습니다.' });
    }

    // 해당 교사의 전체 과제 조회
    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('teacherId', '==', teacherId)
      .get();

    const assignmentIds = assignmentsSnap.docs.map((d) => d.id);
    const assignmentMap = {};
    for (const doc of assignmentsSnap.docs) {
      assignmentMap[doc.id] = { id: doc.id, ...doc.data() };
    }

    if (assignmentIds.length === 0) {
      return NextResponse.json({ success: true, conversations: [], studentName: name });
    }

    // Firestore 'in' 연산자는 최대 30개 지원 → 배치 처리
    const conversations = [];
    const codeValue = studentCode;

    for (let i = 0; i < assignmentIds.length; i += 30) {
      const batch = assignmentIds.slice(i, i + 30);
      const convSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', 'in', batch)
        .where('studentCode', '==', codeValue)
        .get();

      for (const doc of convSnap.docs) {
        const data = doc.data();
        const assignment = assignmentMap[data.assignmentId] || null;
        conversations.push({
          id: doc.id,
          status: data.status,
          score: data.score ?? null,
          originalScore: data.originalScore ?? null,
          feedback: data.feedback || '',
          higherScoreTip: data.higherScoreTip || '',
          messages: data.messages || [],
          completedAt: data.completedAt || null,
          startedAt: data.startedAt || null,
          assignment: assignment
            ? {
                id: assignment.id,
                title: assignment.title,
                subject: assignment.subject || '수학',
                grade: assignment.grade || '',
                standards: assignment.standards || [],
                scoreOptions: assignment.scoreOptions || [],
              }
            : null,
        });
      }
    }

    return NextResponse.json({ success: true, conversations, studentName: name });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
