import { NextResponse } from 'next/server';

import { adminDb, FieldValue } from '@/lib/serverDb';
import {
  GALLERY_SESSION_COOKIE,
  createGallerySessionToken,
  hashGallerySessionToken,
} from '@/lib/gallerySession';

function anonymizeName(name) {
  if (!name || typeof name !== 'string' || name.length < 2) return '학생';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

// POST: student login for gallery comments
export async function POST(request) {
  try {
    const { code, studentName, studentPassword } = await request.json();

    if (!code || !studentName || !studentPassword) {
      return NextResponse.json(
        { success: false, error: '모든 항목을 입력해주세요.' },
        { status: 400 }
      );
    }

    const assignmentSnap = await adminDb
      .collection('assignments')
      .where('entryCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (assignmentSnap.empty) {
      return NextResponse.json(
        { success: false, error: '과제를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const assignmentId = assignmentSnap.docs[0].id;
    const assignment = assignmentSnap.docs[0].data();

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

    const anonymizedName = anonymizeName(matchedStudent.name);
    const token = createGallerySessionToken();
    const tokenHash = hashGallerySessionToken(token);

    await adminDb.collection('gallery_sessions').add({
      tokenHash,
      studentCode: matchedStudent.code,
      assignmentId,
      anonymizedName,
      createdAt: FieldValue.serverTimestamp(),
    });

    const response = NextResponse.json({
      success: true,
      anonymizedName,
      studentCode: matchedStudent.code,
    });

    response.cookies.set(GALLERY_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error('Gallery auth POST error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}

// GET: check existing session for this assignment
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');

    const token = request.cookies.get(GALLERY_SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ success: true, loggedIn: false });
    }

    const tokenHash = hashGallerySessionToken(token);
    const sessionSnap = await adminDb
      .collection('gallery_sessions')
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();

    if (sessionSnap.empty) {
      return NextResponse.json({ success: true, loggedIn: false });
    }

    const session = sessionSnap.docs[0].data();

    if (assignmentId && session.assignmentId !== assignmentId) {
      return NextResponse.json({ success: true, loggedIn: false });
    }

    return NextResponse.json({
      success: true,
      loggedIn: true,
      anonymizedName: session.anonymizedName,
      studentCode: session.studentCode,
    });
  } catch (error) {
    console.error('Gallery auth GET error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
