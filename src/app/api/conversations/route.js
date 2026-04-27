import { NextResponse } from 'next/server';

import {
  CHAT_SESSION_COOKIE,
  createChatSessionToken,
  hashChatSessionToken,
} from '@/lib/chatSession';
import { getStudentMessageCount } from '@/lib/conversationState';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import { FieldValue, adminDb } from '@/lib/serverDb';

function serializeConversation(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    studentCode: data.studentCode,
    studentName: data.studentName ?? `학생 ${data.studentCode}`,
    messages: Array.isArray(data.messages) ? data.messages : [],
    studentMessageCount: getStudentMessageCount(data),
    score: data.score ?? null,
    feedback: data.feedback ?? '',
    higherScoreTip: data.higherScoreTip ?? '',
    nextStepTip: data.nextStepTip ?? '',
    status: data.status || 'in_progress',
    approved: Boolean(data.approved),
    approvalStatus: data.approvalStatus || null,
  };
}

function applyConversationCookie(response, sessionToken) {
  response.cookies.set(CHAT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return response;
}

export async function POST(request) {
  try {
    const { assignmentId, studentName, studentPassword } = await request.json();

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: '과제 정보가 없습니다.' },
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

    const sessionToken = request.cookies.get(CHAT_SESSION_COOKIE)?.value || null;
    const sessionTokenHash = sessionToken ? hashChatSessionToken(sessionToken) : null;

    // Try to resume by session cookie first (no credentials needed)
    if (sessionTokenHash) {
      const resumeSnap = await adminDb
        .collection('conversations')
        .where('assignmentId', '==', assignmentId)
        .where('sessionTokenHash', '==', sessionTokenHash)
        .limit(1)
        .get();

      if (!resumeSnap.empty) {
        const doc = resumeSnap.docs[0];
        const existing = doc.data();

        if (existing.status === 'in_progress') {
          return NextResponse.json({
            success: true,
            resumed: true,
            conversationId: doc.id,
            conversation: serializeConversation(doc),
          });
        }

        return NextResponse.json({
          success: false,
          error: '이미 완료된 제출입니다. 선생님께 문의해 주세요.',
          alreadyExists: true,
        });
      }
    }

    // New entry: validate name + password against teacher's student list
    if (!studentName || !studentPassword) {
      return NextResponse.json(
        { success: false, error: '이름과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const assignment = assignmentSnap.data();
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

    const studentCode = matchedStudent.code;

    // Check for existing conversation by studentCode
    const existingSnap = await adminDb
      .collection('conversations')
      .where('assignmentId', '==', assignmentId)
      .where('studentCode', '==', studentCode)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existing = existingDoc.data();

      if (existing.status === 'in_progress') {
        const resumedSessionToken = createChatSessionToken();
        await existingDoc.ref.update({
          sessionTokenHash: hashChatSessionToken(resumedSessionToken),
        });

        return applyConversationCookie(
          NextResponse.json({
            success: true,
            resumed: true,
            conversationId: existingDoc.id,
            conversation: serializeConversation(existingDoc),
          }),
          resumedSessionToken
        );
      }

      return NextResponse.json({
        success: false,
        error: '이미 완료된 제출입니다. 선생님께 문의해 주세요.',
        alreadyExists: true,
      });
    }

    const newSessionToken = createChatSessionToken();
    const docRef = await adminDb.collection('conversations').add({
      assignmentId,
      studentCode,
      studentName: studentName.trim(),
      messages: [],
      studentMessageCount: 0,
      score: null,
      feedback: null,
      higherScoreTip: null,
      nextStepTip: null,
      status: 'in_progress',
      approved: false,
      approvalStatus: null,
      sessionTokenHash: hashChatSessionToken(newSessionToken),
      startedAt: FieldValue.serverTimestamp(),
      completedAt: null,
    });

    return applyConversationCookie(
      NextResponse.json({
        success: true,
        resumed: false,
        conversationId: docRef.id,
        conversation: { studentName: studentName.trim(), studentCode },
      }),
      newSessionToken
    );
  } catch (error) {
    console.error('Create Conversation Error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: `서버 오류: ${error?.message || '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}

// Teacher resets a student's conversation so they can redo it
export async function DELETE(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('id');

    if (!conversationId) {
      return NextResponse.json({ success: false, error: '대화 ID가 필요합니다.' }, { status: 400 });
    }

    const convRef = adminDb.collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();

    if (!convSnap.exists) {
      return NextResponse.json({ success: false, error: '대화를 찾을 수 없습니다.' }, { status: 404 });
    }

    const conv = convSnap.data();
    if (!conv.assignmentId) {
      return NextResponse.json({ success: false, error: '과제 정보가 없는 대화입니다.' }, { status: 400 });
    }

    const assignmentSnap = await adminDb.collection('assignments').doc(conv.assignmentId).get();
    if (!assignmentSnap.exists || assignmentSnap.data().teacherId !== teacher.uid) {
      return NextResponse.json({ success: false, error: '이 대화를 관리할 권한이 없습니다.' }, { status: 403 });
    }

    await convRef.delete();

    return NextResponse.json({
      success: true,
      message: '삭제가 완료되었습니다. 학생이 다시 참여할 수 있습니다.',
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Delete conversation error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
