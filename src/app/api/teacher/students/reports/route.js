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

export async function DELETE(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json({ success: false, error: '리포트 ID가 필요합니다.' }, { status: 400 });
    }

    const reportRef = adminDb.collection('studentReports').doc(reportId);
    const doc = await reportRef.get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, error: '존재하지 않는 리포트입니다.' }, { status: 404 });
    }

    if (doc.data().teacherId !== teacher.uid) {
      return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await reportRef.delete();

    return NextResponse.json({
      success: true,
      message: '리포트가 성공적으로 삭제되었습니다.',
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Delete report API error:', error);
    return NextResponse.json({ success: false, error: '리포트 삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

