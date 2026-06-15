import { NextResponse } from 'next/server';

import { FieldValue, adminDb } from '@/lib/serverDb';

// 학생이 같은 과제에 다시 도전. 최고 기록과 누적 지급 포인트(paidPoints)는 보존하고
// 현재 시도만 초기화 → 점수가 오르면 그 차액만 추가로 지급된다.
export async function POST(request) {
  try {
    const { assignmentId, studentName, studentPassword } = await request.json();

    if (!assignmentId || !studentName || !studentPassword) {
      return NextResponse.json(
        { success: false, error: '과제 정보와 이름, 비밀번호가 필요합니다.' },
        { status: 400 }
      );
    }

    const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
    if (!assignmentSnap.exists || !assignmentSnap.data()?.isActive) {
      return NextResponse.json(
        { success: false, error: '참여할 수 없는 과제입니다.' },
        { status: 404 }
      );
    }

    const assignment = assignmentSnap.data();

    // 이름+비밀번호로 학생 확인 (conversations POST와 동일한 검증)
    const teacherSnap = await adminDb.collection('teachers').doc(assignment.teacherId).get();
    const teacherData = teacherSnap.exists ? teacherSnap.data() : null;
    const studentList = Array.isArray(teacherData?.students) ? teacherData.students : [];

    const matchedStudent = studentList.find(
      (s) => s.name === studentName.trim() && s.password === studentPassword
    );

    if (!matchedStudent) {
      return NextResponse.json(
        { success: false, error: '이름 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    const existingSnap = await adminDb
      .collection('conversations')
      .where('assignmentId', '==', assignmentId)
      .where('studentCode', '==', matchedStudent.code)
      .limit(1)
      .get();

    if (existingSnap.empty) {
      // 아직 답변이 없으면 그냥 바로 시작하면 됨
      return NextResponse.json({ success: true, entryCode: assignment.entryCode });
    }

    const existingDoc = existingSnap.docs[0];
    const existing = existingDoc.data();

    // 최고 기록 보존 (옛 데이터 호환: best* 없으면 현재 기록을 최고로 간주)
    const bestScore = Number.isFinite(existing.bestScore)
      ? existing.bestScore
      : (Number.isFinite(existing.score) ? existing.score : null);
    const bestMessages = Array.isArray(existing.bestMessages)
      ? existing.bestMessages
      : (Array.isArray(existing.messages) ? existing.messages : []);
    const paidPoints =
      existing.paidPoints ?? (existing.approved ? (existing.score ?? 0) : 0);

    await existingDoc.ref.update({
      status: 'in_progress',
      messages: [],
      score: null,
      originalScore: null,
      scoreAdjustmentReason: '',
      feedback: null,
      higherScoreTip: null,
      nextStepTip: null,
      studentMessageCount: 0,
      completedAt: null,
      sessionTokenHash: null,
      approvalStatus: null,
      bestScore,
      bestMessages,
      bestFeedback: existing.bestFeedback ?? existing.feedback ?? '',
      bestHigherScoreTip: existing.bestHigherScoreTip ?? existing.higherScoreTip ?? '',
      bestNextStepTip: existing.bestNextStepTip ?? existing.nextStepTip ?? '',
      paidPoints,
      retriedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, entryCode: assignment.entryCode });
  } catch (error) {
    console.error('Class retry error:', error?.message || error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
