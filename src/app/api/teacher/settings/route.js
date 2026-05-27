import { NextResponse } from 'next/server';

import { getTeacherConstraintDefaults } from '@/lib/chatConstraints';
import { FieldValue, adminDb, serializeData } from '@/lib/serverDb';
import { authenticateFirebaseRequest, RequestError } from '@/lib/serverAuth';

export async function GET(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const snapshot = await adminDb.collection('teachers').doc(teacher.uid).get();

    return NextResponse.json({
      success: true,
      settings: snapshot.exists ? serializeData(snapshot.data()) : null,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Teacher settings GET error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const teacher = await authenticateFirebaseRequest(request);
    const {
      growndClassId = '',
      growndApiKey = '',
      email = '',
      displayName = '',
      defaultMathMinTurns = null,
      defaultMathMaxTurns = null,
      defaultMinStudentMessageBytes = null,
      defaultMaxStudentMessageBytes = null,
      students = [],
    } = await request.json();

    const mathDefaults = getTeacherConstraintDefaults({
      defaultMathMinTurns,
      defaultMathMaxTurns,
      defaultMinStudentMessageBytes,
      defaultMaxStudentMessageBytes,
    });

    // Validate and normalize student list
    const normalizedStudents = Array.isArray(students)
      ? students
          .filter((s) => s && typeof s.name === 'string' && s.name.trim())
          .map((s, index) => ({
            name: s.name.trim(),
            password: typeof s.password === 'string' ? s.password : '',
            code: Number.isInteger(Number(s.code)) && Number(s.code) > 0
              ? Number(s.code)
              : index + 1,
          }))
      : [];

    const ref = adminDb.collection('teachers').doc(teacher.uid);
    const snapshot = await ref.get();

    const payload = {
      growndClassId: growndClassId.trim(),
      growndApiKey: growndApiKey.trim(),
      email: email || teacher.email || '',
      displayName: displayName || teacher.name || '',
      defaultMathMinTurns: mathDefaults.minTurns,
      defaultMathMaxTurns: mathDefaults.maxTurns,
      defaultMinStudentMessageBytes: mathDefaults.minStudentMessageBytes,
      defaultMaxStudentMessageBytes: mathDefaults.maxStudentMessageBytes,
      students: normalizedStudents,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (snapshot.exists) {
      await ref.update(payload);
    } else {
      await ref.set({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Teacher settings POST error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
