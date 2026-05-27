import { NextResponse } from 'next/server';

import { FieldValue, adminDb } from '@/lib/serverDb';
import { GALLERY_SESSION_COOKIE, hashGallerySessionToken } from '@/lib/gallerySession';

const MAX_COMMENT_LENGTH = 50;

async function getGallerySession(request) {
  const token = request.cookies.get(GALLERY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashGallerySessionToken(token);
  const sessionSnap = await adminDb
    .collection('gallery_sessions')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();

  if (sessionSnap.empty) return null;
  return sessionSnap.docs[0].data();
}

// GET: fetch comments for a conversation (public)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json(
      { success: false, error: '대화 ID가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    const commentsSnap = await adminDb
      .collection('gallery_comments')
      .where('conversationId', '==', conversationId)
      .limit(100)
      .get();

    const comments = commentsSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          commenterName: data.commenterName,
          comment: data.comment,
          createdAt: data.createdAt ? data.createdAt.toMillis() : 0,
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ id, commenterName, comment }) => ({ id, commenterName, comment }));

    return NextResponse.json({ success: true, comments });
  } catch (error) {
    console.error('Gallery comments GET error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

// POST: create a comment (requires gallery session)
export async function POST(request) {
  try {
    const session = await getGallerySession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { conversationId, comment } = await request.json();

    if (!conversationId || !comment?.trim()) {
      return NextResponse.json(
        { success: false, error: '댓글 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    const trimmed = comment.trim();
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `댓글은 ${MAX_COMMENT_LENGTH}자 이내로 입력해주세요.` },
        { status: 400 }
      );
    }

    // Verify conversation belongs to the same assignment as the session
    const convSnap = await adminDb.collection('conversations').doc(conversationId).get();
    if (!convSnap.exists || convSnap.data().assignmentId !== session.assignmentId) {
      return NextResponse.json(
        { success: false, error: '이 과제의 답변에만 댓글을 달 수 있습니다.' },
        { status: 403 }
      );
    }

    // One comment per student per conversation (filter in memory to avoid composite index)
    const existingSnap = await adminDb
      .collection('gallery_comments')
      .where('conversationId', '==', conversationId)
      .limit(100)
      .get();

    const alreadyCommented = existingSnap.docs.some(
      (doc) => doc.data().commenterCode === session.studentCode
    );

    if (alreadyCommented) {
      return NextResponse.json(
        { success: false, error: '이미 이 답변에 응원을 남겼어요.' },
        { status: 409 }
      );
    }

    const docRef = await adminDb.collection('gallery_comments').add({
      assignmentId: session.assignmentId,
      conversationId,
      commenterCode: session.studentCode,
      commenterName: session.anonymizedName,
      comment: trimmed,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      comment: {
        id: docRef.id,
        commenterName: session.anonymizedName,
        comment: trimmed,
      },
    });
  } catch (error) {
    console.error('Gallery comments POST error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
