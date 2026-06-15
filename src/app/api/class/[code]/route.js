import { NextResponse } from 'next/server';

import { adminDb } from '@/lib/serverDb';

export async function GET(request, { params }) {
  try {
    const { code } = await params;

    if (!code) {
      return NextResponse.json({ success: false, error: '학급 코드가 필요합니다.' }, { status: 400 });
    }

    const teacherSnap = await adminDb
      .collection('teachers')
      .where('classCode', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (teacherSnap.empty) {
      return NextResponse.json({ success: false, error: '학급을 찾을 수 없습니다. 코드를 확인해 주세요.' }, { status: 404 });
    }

    const teacherDoc = teacherSnap.docs[0];
    const teacherData = teacherDoc.data();

    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('teacherId', '==', teacherDoc.id)
      .get();

    // 활성 과제만, 생성순 정렬
    const activeDocs = assignmentsSnap.docs
      .filter((doc) => doc.data().isActive)
      .sort((a, b) => {
        const aTime = a.data().createdAt?.toMillis?.() ?? 0;
        const bTime = b.data().createdAt?.toMillis?.() ?? 0;
        return aTime - bTime;
      });

    const countResults = await Promise.all(
      activeDocs.map((doc) =>
        adminDb.collection('conversations').where('assignmentId', '==', doc.id).count().get()
      )
    );

    const assignments = activeDocs.map((doc, i) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || '',
        subject: data.subject || '',
        grade: data.grade || '',
        entryCode: data.entryCode || '',
        participantCount: countResults[i].data().count,
      };
    });

    return NextResponse.json({
      success: true,
      className: teacherData.className || '',
      classCode: teacherData.classCode || code.toUpperCase(),
      assignments,
    });
  } catch (error) {
    console.error('Class dashboard API error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
