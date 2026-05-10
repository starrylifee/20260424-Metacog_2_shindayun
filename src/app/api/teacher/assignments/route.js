import { NextResponse } from 'next/server';

import { generateUniqueEntryCode } from '@/lib/assignmentEntryCode';
import { normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';
import {
  DEFAULT_SCORE_OPTIONS,
  DEFAULT_SCORING_STYLE,
  normalizeScoringStyle,
  validateScoreOptions,
} from '@/lib/scoreConfig';
import { FieldValue, adminDb, serializeDoc } from '@/lib/serverDb';

export async function GET(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const snapshot = await adminDb
      .collection('assignments')
      .where('teacherId', '==', teacher.uid)
      .get();

    const assignmentDocs = snapshot.docs.sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() ?? 0;
      const bTime = b.data().createdAt?.toMillis?.() ?? 0;
      return aTime - bTime;
    });
    const countResults = await Promise.all(
      assignmentDocs.map((doc) =>
        adminDb.collection('conversations').where('assignmentId', '==', doc.id).count().get()
      )
    );

    return NextResponse.json({
      success: true,
      assignments: assignmentDocs.map((doc, i) => ({
        ...serializeDoc(doc),
        participantCount: countResults[i].data().count,
      })),
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignments GET error:', error);
    return NextResponse.json({ success: false, error: '과제 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const body = await request.json();
    const {
      title = '',
      subject = '',
      grade = '',
      learningObjective = '',
      content = '',
      keywords = [],
      standards = [],
      scoreOptions = DEFAULT_SCORE_OPTIONS,
      scoringStyle = DEFAULT_SCORING_STYLE,
      minTurns = 2,
      maxTurns = null,
      minStudentMessageBytes = null,
      maxStudentMessageBytes = null,
    } = body;

    if (!title.trim()) {
      return NextResponse.json({ success: false, error: '과제 제목을 입력해 주세요.' }, { status: 400 });
    }

    if (!content.trim()) {
      return NextResponse.json({ success: false, error: '수업 내용을 입력해 주세요.' }, { status: 400 });
    }

    const validatedScoreOptions = validateScoreOptions(scoreOptions);
    if (!validatedScoreOptions.ok) {
      return NextResponse.json({ success: false, error: validatedScoreOptions.error }, { status: 400 });
    }

    const normalizedConstraints = normalizeAssignmentConstraints({
      minTurns,
      maxTurns,
      minStudentMessageBytes,
      maxStudentMessageBytes,
    });

    let entryCode;
    try {
      entryCode = await generateUniqueEntryCode();
    } catch (error) {
      throw new RequestError(
        error instanceof Error ? error.message : '입장 코드를 생성하지 못했습니다.',
        503
      );
    }

    const assignmentData = {
      teacherId: teacher.uid,
      entryCode,
      type: 'math',
      title: title.trim(),
      subject: subject.trim(),
      grade: grade.trim(),
      learningObjective: learningObjective.trim(),
      content: content.trim(),
      keywords: Array.isArray(keywords)
        ? keywords.map((k) => String(k).trim()).filter(Boolean)
        : [],
      standards: Array.isArray(standards)
        ? standards.map((s) => String(s).trim()).filter(Boolean)
        : [],
      scoreOptions: validatedScoreOptions.scoreOptions,
      maxScore: validatedScoreOptions.maxScore,
      scoringStyle: normalizeScoringStyle(scoringStyle),
      minTurns: normalizedConstraints.minTurns,
      maxTurns: normalizedConstraints.maxTurns,
      minStudentMessageBytes: normalizedConstraints.minStudentMessageBytes,
      maxStudentMessageBytes: normalizedConstraints.maxStudentMessageBytes,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection('assignments').add(assignmentData);

    return NextResponse.json({
      success: true,
      assignment: { id: docRef.id, entryCode },
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Assignments POST error:', error);
    return NextResponse.json({ success: false, error: '과제 생성에 실패했습니다.' }, { status: 500 });
  }
}
