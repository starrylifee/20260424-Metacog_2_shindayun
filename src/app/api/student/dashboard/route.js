import { NextResponse } from 'next/server';

import { adminDb } from '@/lib/serverDb';

// 통합 학생 대시보드 조회.
// 이름+비밀번호 한 번으로 (1) 우리 반(=teacher) 활성 과제 + 내 참여요약,
// (2) 내 전체 학습기록(conversations) 을 한 호출로 반환한다.
// (기존 /api/portfolio 의 학생 탐색 + /api/class/[code] 의 활성과제 집계 로직을 통합)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name')?.trim();
  const password = searchParams.get('password')?.trim();

  if (!name || !password) {
    return NextResponse.json({ success: false, error: '이름과 비밀번호를 입력해주세요.' });
  }

  try {
    // 1) 모든 교사 중 해당 학생 찾기 (= 학생이 속한 학급/교사 식별)
    const teachersSnap = await adminDb.collection('teachers').get();
    let teacherDoc = null;
    let studentCode = null;

    for (const doc of teachersSnap.docs) {
      const students = doc.data().students || [];
      const match = students.find(
        (s) => s.name === name && String(s.password) === String(password)
      );
      if (match) {
        teacherDoc = doc;
        studentCode = match.code;
        break;
      }
    }

    if (!teacherDoc) {
      return NextResponse.json({ success: false, error: '이름 또는 비밀번호가 맞지 않습니다.' });
    }

    const teacherId = teacherDoc.id;
    const teacherData = teacherDoc.data();
    const className = teacherData.className || '';
    const classCode = teacherData.classCode || '';

    // 2) 교사의 전체 과제 조회 (활성/비활성 모두 — 활성은 '우리 반 과제', 전체는 기록 매핑용)
    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('teacherId', '==', teacherId)
      .get();

    const assignmentMap = {};
    for (const doc of assignmentsSnap.docs) {
      assignmentMap[doc.id] = { id: doc.id, ...doc.data() };
    }
    const assignmentIds = Object.keys(assignmentMap);

    if (assignmentIds.length === 0) {
      return NextResponse.json({
        success: true,
        studentName: name,
        studentCode,
        className,
        classCode,
        assignments: [],
        conversations: [],
      });
    }

    // 3) 이 학생의 모든 대화 조회 (Firestore 'in' 최대 30개 → 배치)
    const myConvByAssignment = {};
    const conversations = [];

    for (let i = 0; i < assignmentIds.length; i += 30) {
      const batch = assignmentIds.slice(i, i + 30);
      const convSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', 'in', batch)
        .where('studentCode', '==', studentCode)
        .get();

      for (const doc of convSnap.docs) {
        const data = doc.data();
        const assignment = assignmentMap[data.assignmentId] || null;
        myConvByAssignment[data.assignmentId] = data;
        const attempts = Array.isArray(data.attempts) ? data.attempts : [];
        conversations.push({
          id: doc.id,
          status: data.status,
          score: data.score ?? null,
          originalScore: data.originalScore ?? null,
          approved: Boolean(data.approved),
          feedback: data.feedback || '',
          higherScoreTip: data.higherScoreTip || '',
          messages: data.messages || [],
          completedAt: data.completedAt || null,
          startedAt: data.startedAt || null,
          // 재도전 이력: 회차별 점수 추이 + 재도전 횟수
          attempts,
          scoreHistory: attempts.map((a) => a.score),
          retryCount: Number.isFinite(data.retryCount)
            ? data.retryCount
            : Math.max(0, attempts.length - 1),
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

    // 4) 활성 과제 = '우리 반 과제'. 생성순 정렬 + 참여수 집계 + 내 참여요약.
    const activeAssignments = Object.values(assignmentMap)
      .filter((a) => a.isActive)
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return aTime - bTime;
      });

    const countResults = await Promise.all(
      activeAssignments.map((a) =>
        adminDb.collection('conversations').where('assignmentId', '==', a.id).count().get()
      )
    );

    const assignments = activeAssignments.map((a, i) => {
      const mine = myConvByAssignment[a.id];
      // 최고 기록 보존 호환: bestScore 우선
      const myScore = mine
        ? (Number.isFinite(mine.bestScore) ? mine.bestScore : (mine.score ?? null))
        : null;
      const myAttempts = Array.isArray(mine?.attempts) ? mine.attempts : [];
      return {
        id: a.id,
        title: a.title || '',
        subject: a.subject || '',
        grade: a.grade || '',
        entryCode: a.entryCode || '',
        participantCount: countResults[i].data().count,
        hasParticipated: Boolean(mine),
        myScore,
        myApproved: Boolean(mine?.approved),
        // 재도전 이력: 내 점수 추이 + 재도전 횟수
        myScoreHistory: myAttempts.map((at) => at.score),
        myRetryCount: Number.isFinite(mine?.retryCount)
          ? mine.retryCount
          : Math.max(0, myAttempts.length - 1),
      };
    });

    return NextResponse.json({
      success: true,
      studentName: name,
      studentCode,
      className,
      classCode,
      assignments,
      conversations,
    });
  } catch (error) {
    console.error('Student dashboard API error:', error?.message || error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
