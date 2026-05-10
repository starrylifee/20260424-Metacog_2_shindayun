import { NextResponse } from 'next/server';

import { adminDb, serializeDoc } from '@/lib/serverDb';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';

async function assertOwnedAssignment(id, teacherUid) {
  const snapshot = await adminDb.collection('assignments').doc(id).get();

  if (!snapshot.exists) {
    throw new RequestError('과제를 찾을 수 없습니다.', 404);
  }

  if (snapshot.data()?.teacherId !== teacherUid) {
    throw new RequestError('이 과제를 조회할 권한이 없습니다.', 403);
  }
}

async function getAssignmentId(paramsPromise) {
  const params = await paramsPromise;
  const id = params?.id;

  if (!id) {
    throw new RequestError('과제 ID가 필요합니다.', 400);
  }

  return id;
}

function getConversationTimestamp(conversation) {
  const value = conversation.startedAt || conversation.completedAt || null;

  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export async function GET(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const assignmentId = await getAssignmentId(params);
    await assertOwnedAssignment(assignmentId, teacher.uid);

    const snapshot = await adminDb
      .collection('conversations')
      .where('assignmentId', '==', assignmentId)
      .get();

    const conversations = snapshot.docs
      .map(serializeDoc)
      .sort((left, right) => getConversationTimestamp(right) - getConversationTimestamp(left));

    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignment conversations GET error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const assignmentId = await getAssignmentId(params);
    await assertOwnedAssignment(assignmentId, teacher.uid);

    const { conversationId, showInGallery } = await request.json();

    if (!conversationId || typeof showInGallery !== 'boolean') {
      return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const convSnap = await adminDb.collection('conversations').doc(conversationId).get();
    if (!convSnap.exists || convSnap.data()?.assignmentId !== assignmentId) {
      return NextResponse.json({ success: false, error: '대화 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    await adminDb.collection('conversations').doc(conversationId).update({ showInGallery });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Conversation PATCH error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}