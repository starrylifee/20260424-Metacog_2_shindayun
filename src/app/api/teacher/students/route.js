import { NextResponse } from 'next/server';

import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import { adminDb, serializeDoc } from '@/lib/serverDb';

export async function GET(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const { searchParams } = new URL(request.url);
    const studentName = searchParams.get('student');

    // 교사의 전체 과제 조회
    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('teacherId', '==', teacher.uid)
      .get();

    if (assignmentsSnap.empty) {
      return NextResponse.json({ success: true, students: [], conversations: [] });
    }

    const assignmentMap = {};
    const assignmentIds = [];
    for (const doc of assignmentsSnap.docs) {
      assignmentMap[doc.id] = serializeDoc(doc);
      assignmentIds.push(doc.id);
    }

    // Firestore 'in' 연산자 30개 제한 → 배치 처리
    const allConversations = [];
    for (let i = 0; i < assignmentIds.length; i += 30) {
      const batch = assignmentIds.slice(i, i + 30);
      const convSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', 'in', batch)
        .get();

      for (const doc of convSnap.docs) {
        allConversations.push(serializeDoc(doc));
      }
    }

    // 학생 이름 목록 추출 (중복 제거)
    const studentSet = new Map();
    for (const conv of allConversations) {
      const name = conv.studentName || `${conv.studentCode}번`;
      if (!studentSet.has(name)) {
        studentSet.set(name, {
          name,
          studentCode: conv.studentCode,
          conversationCount: 0,
          completedCount: 0,
        });
      }
      const entry = studentSet.get(name);
      entry.conversationCount += 1;
      if (conv.status === 'completed') {
        entry.completedCount += 1;
      }
    }

    const students = Array.from(studentSet.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ko')
    );

    // 특정 학생 필터
    let filteredConversations = [];
    if (studentName) {
      filteredConversations = allConversations
        .filter((conv) => {
          const name = conv.studentName || `${conv.studentCode}번`;
          return name === studentName;
        })
        .map((conv) => ({
          ...conv,
          assignment: assignmentMap[conv.assignmentId] || null,
        }))
        .sort((a, b) => {
          const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
          const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
          return bTime - aTime;
        });
    }

    return NextResponse.json({
      success: true,
      students,
      conversations: filteredConversations,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Teacher students API error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
