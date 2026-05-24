import { NextResponse } from 'next/server';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import { adminDb, FieldValue } from '@/lib/serverDb';
import { GROWND_BASE_URL, extractGrowndErrorDetail, parseGrowndResponse } from '@/lib/grownd';

export async function POST(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const resolvedParams = await params;
    const conversationId = resolvedParams?.id;

    if (!conversationId) {
      return NextResponse.json({ success: false, error: '대화 ID가 필요합니다.' }, { status: 400 });
    }

    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();

    if (!conversationSnap.exists) {
      return NextResponse.json({ success: false, error: '대화 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const conversation = conversationSnap.data();

    // 과제 소유권 및 권한 검사
    const assignmentRef = adminDb.collection('assignments').doc(conversation.assignmentId);
    const assignmentSnap = await assignmentRef.get();

    if (!assignmentSnap.exists) {
      return NextResponse.json({ success: false, error: '과제를 찾을 수 없습니다.' }, { status: 404 });
    }

    const assignment = assignmentSnap.data();

    if (assignment.teacherId !== teacher.uid) {
      return NextResponse.json({ success: false, error: '이 대화를 관리할 권한이 없습니다.' }, { status: 403 });
    }

    const score = conversation.score;
    if (score === null || score === undefined || score <= 0) {
      return NextResponse.json({ success: false, error: '전송할 점수가 없거나 0점 이하입니다.' }, { status: 400 });
    }

    // 교사의 Grownd API 정보 조회
    const teacherSnap = await adminDb.collection('teachers').doc(teacher.uid).get();
    if (!teacherSnap.exists) {
      return NextResponse.json({ success: false, error: '교사 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { growndApiKey, growndClassId } = teacherSnap.data() || {};
    if (!growndApiKey || !growndClassId) {
      return NextResponse.json({
        success: false,
        error: 'Grownd API 키와 학급 ID가 설정되지 않았습니다. 설정 페이지에서 먼저 입력해 주세요.'
      }, { status: 400 });
    }

    if (!conversation.studentCode) {
      return NextResponse.json({ success: false, error: '학생 번호(코드) 정보가 누락되었습니다.' }, { status: 400 });
    }

    const growndAbort = new AbortController();
    const timeout = setTimeout(() => growndAbort.abort(), 6000);

    let growndResponse;
    try {
      growndResponse = await fetch(
        `${GROWND_BASE_URL}/api/v1/classes/${growndClassId}/students/${conversation.studentCode}/points`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': growndApiKey,
          },
          body: JSON.stringify({
            type: 'reward',
            points: score,
            description: `오늘배움봇 과제 완료 (${score}점)`,
            source: 'OneumBaeumBot',
          }),
          signal: growndAbort.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const growndResult = await parseGrowndResponse(growndResponse);

    if (growndResponse.ok) {
      await conversationRef.update({
        approved: true,
        approvedAt: FieldValue.serverTimestamp(),
        approvalStatus: 'approved',
        lastGrowndError: null,
      });

      return NextResponse.json({
        success: true,
        message: 'Grownd 포인트가 성공적으로 전송되었습니다.',
      });
    } else {
      const errMsg = extractGrowndErrorDetail(growndResponse, growndResult);
      await conversationRef.update({
        approvalStatus: 'failed',
        lastGrowndError: {
          message: errMsg || '전송 실패',
          at: FieldValue.serverTimestamp(),
        },
      });

      return NextResponse.json({
        success: false,
        error: errMsg || 'Grownd 전송 실패',
      });
    }
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Grownd resend error:', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
