import { NextResponse } from 'next/server';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import { adminDb, serializeDoc } from '@/lib/serverDb';

export async function GET(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);

    const reportsSnap = await adminDb
      .collection('studentReports')
      .where('teacherId', '==', teacher.uid)
      .orderBy('generatedAt', 'desc')
      .get();

    const reports = [];
    reportsSnap.forEach((doc) => {
      reports.push(serializeDoc(doc));
    });

    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Get reports API error:', error);
    return NextResponse.json({ success: false, error: '리포트 목록을 가져오는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
