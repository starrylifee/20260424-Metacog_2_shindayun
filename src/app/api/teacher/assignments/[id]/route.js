import { NextResponse } from 'next/server';

import { generateUniqueEntryCode } from '@/lib/assignmentEntryCode';
import { normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import { hasStudentStartedConversation } from '@/lib/conversationState';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import {
  getAssignmentScoreOptions,
  normalizeScoringStyle,
  validateScoreOptions,
} from '@/lib/scoreConfig';
import { FieldValue, adminDb, serializeDoc } from '@/lib/serverDb';

async function getOwnedAssignment(id, teacherUid) {
  const snapshot = await adminDb.collection('assignments').doc(id).get();

  if (!snapshot.exists) {
    throw new RequestError('과제를 찾을 수 없습니다.', 404);
  }

  const assignment = snapshot.data();
  if (assignment.teacherId !== teacherUid) {
    throw new RequestError('이 과제를 관리할 권한이 없습니다.', 403);
  }

  return { ref: snapshot.ref, snapshot };
}

function buildCopiedTitle(title) {
  const normalizedTitle = String(title || '').trim();

  if (!normalizedTitle) {
    return '복사된 과제';
  }

  return normalizedTitle.endsWith('(복사본)')
    ? normalizedTitle
    : `${normalizedTitle} (복사본)`;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => String(value).trim()).filter(Boolean);
}

async function assertAssignmentNotStarted(assignmentId) {
  const conversationsSnapshot = await adminDb
    .collection('conversations')
    .where('assignmentId', '==', assignmentId)
    .get();

  const hasStartedConversation = conversationsSnapshot.docs.some((conversationDoc) =>
    hasStudentStartedConversation(conversationDoc.data())
  );

  if (hasStartedConversation) {
    throw new RequestError('학생이 이미 시작한 과제는 수정할 수 없습니다.', 409);
  }
}

async function duplicateAssignment(assignmentId, assignment, teacherUid) {
  const validatedScoreOptions = validateScoreOptions(getAssignmentScoreOptions(assignment));
  if (!validatedScoreOptions.ok) {
    throw new RequestError(validatedScoreOptions.error, 400);
  }

  const normalizedConstraints = normalizeAssignmentConstraints(assignment);

  let entryCode;
  try {
    entryCode = await generateUniqueEntryCode();
  } catch (error) {
    throw new RequestError(
      error instanceof Error ? error.message : '입장 코드를 생성하지 못했습니다.',
      503
    );
  }

  const duplicatedAssignment = {
    teacherId: teacherUid,
    entryCode,
    type: 'math',
    title: buildCopiedTitle(assignment.title),
    subject: String(assignment.subject || '').trim(),
    grade: String(assignment.grade || '').trim(),
    learningObjective: String(assignment.learningObjective || '').trim(),
    content: String(assignment.content || '').trim(),
    keywords: normalizeStringArray(assignment.keywords),
    standards: normalizeStringArray(assignment.standards),
    scoreOptions: validatedScoreOptions.scoreOptions,
    maxScore: validatedScoreOptions.maxScore,
    scoringStyle: normalizeScoringStyle(assignment.scoringStyle),
    minTurns: normalizedConstraints.minTurns,
    maxTurns: normalizedConstraints.maxTurns,
    minStudentMessageBytes: normalizedConstraints.minStudentMessageBytes,
    maxStudentMessageBytes: normalizedConstraints.maxStudentMessageBytes,
    isActive: false,
    copiedFromAssignmentId: assignmentId,
    // 동일 수업 내용이므로 AI 모범 답안 그대로 복사
    ...(assignment.aiExampleAnswer ? { aiExampleAnswer: assignment.aiExampleAnswer } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection('assignments').add(duplicatedAssignment);

  return {
    id: docRef.id,
    entryCode,
  };
}

function buildUpdatedAssignmentData(existingAssignment, payload) {
  const normalizedConstraints = normalizeAssignmentConstraints({
    ...existingAssignment,
    ...payload,
  });
  const validatedScoreOptions = validateScoreOptions(payload.scoreOptions);

  if (!validatedScoreOptions.ok) {
    throw new RequestError(validatedScoreOptions.error, 400);
  }

  const title = String(payload.title || '').trim();
  if (!title) throw new RequestError('과제 제목을 입력해 주세요.', 400);

  const content = String(payload.content || '').trim();
  if (!content) throw new RequestError('수업 내용을 입력해 주세요.', 400);

  return {
    title,
    subject: String(payload.subject || '').trim(),
    grade: String(payload.grade || '').trim(),
    learningObjective: String(payload.learningObjective || '').trim(),
    content,
    keywords: normalizeStringArray(payload.keywords),
    standards: normalizeStringArray(payload.standards),
    scoreOptions: validatedScoreOptions.scoreOptions,
    maxScore: validatedScoreOptions.maxScore,
    scoringStyle: normalizeScoringStyle(payload.scoringStyle),
    minTurns: normalizedConstraints.minTurns,
    maxTurns: normalizedConstraints.maxTurns,
    minStudentMessageBytes: normalizedConstraints.minStudentMessageBytes,
    maxStudentMessageBytes: normalizedConstraints.maxStudentMessageBytes,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function getAssignmentId(paramsPromise) {
  const params = await paramsPromise;
  const id = params?.id;

  if (!id) {
    throw new RequestError('과제 ID가 필요합니다.', 400);
  }

  return id;
}

export async function GET(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const assignmentId = await getAssignmentId(params);
    const { ref } = await getOwnedAssignment(assignmentId, teacher.uid);
    const snapshot = await ref.get();

    return NextResponse.json({
      success: true,
      assignment: serializeDoc(snapshot),
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignment detail GET error:', error);
    return NextResponse.json({ success: false, error: '과제 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const assignmentId = await getAssignmentId(params);
    const { snapshot } = await getOwnedAssignment(assignmentId, teacher.uid);
    const assignment = snapshot.data();
    const duplicated = await duplicateAssignment(assignmentId, assignment, teacher.uid);

    return NextResponse.json({
      success: true,
      assignment: duplicated,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignment detail POST error:', error);
    return NextResponse.json({ success: false, error: '과제를 복사하지 못했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const assignmentId = await getAssignmentId(params);
    const { ref, snapshot } = await getOwnedAssignment(assignmentId, teacher.uid);
    const body = await request.json();
    const bodyKeys = Object.keys(body || {});

    if (bodyKeys.length === 1 && typeof body.isActive === 'boolean') {
      await ref.update({
        isActive: body.isActive,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    if (bodyKeys.length === 1 && typeof body.galleryCommentsEnabled === 'boolean') {
      await ref.update({
        galleryCommentsEnabled: body.galleryCommentsEnabled,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    if (bodyKeys.length === 1 && typeof body.showExampleAnswers === 'boolean') {
      await ref.update({
        showExampleAnswers: body.showExampleAnswers,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    await assertAssignmentNotStarted(assignmentId);

    const updateData = buildUpdatedAssignmentData(snapshot.data(), body || {});
    await ref.update(updateData);

    const updatedSnapshot = await ref.get();

    return NextResponse.json({
      success: true,
      assignment: serializeDoc(updatedSnapshot),
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignment detail PATCH error:', error);
    return NextResponse.json({ success: false, error: '과제를 수정하지 못했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const assignmentId = await getAssignmentId(params);
    const { ref } = await getOwnedAssignment(assignmentId, teacher.uid);
    const conversationsSnapshot = await adminDb
      .collection('conversations')
      .where('assignmentId', '==', assignmentId)
      .get();

    const batch = adminDb.batch();
    batch.delete(ref);

    conversationsSnapshot.docs.forEach((conversationDoc) => {
      batch.delete(conversationDoc.ref);
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignment detail DELETE error:', error);
    return NextResponse.json({ success: false, error: '과제를 삭제하지 못했습니다.' }, { status: 500 });
  }
}
