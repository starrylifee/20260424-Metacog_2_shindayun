import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/serverDb';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ success: false, error: '입장 코드가 필요합니다.' });
  }

  try {
    const assignmentSnap = await adminDb
      .collection('assignments')
      .where('entryCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (assignmentSnap.empty) {
      return NextResponse.json({ success: true, topAnswers: [] });
    }

    const assignmentId = assignmentSnap.docs[0].id;

    const convSnap = await adminDb
      .collection('conversations')
      .where('assignmentId', '==', assignmentId)
      .where('status', '==', 'completed')
      .orderBy('score', 'desc')
      .limit(15)
      .get();

    const topAnswers = convSnap.docs
      .map((doc) => {
        const data = doc.data();
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const firstStudentMsg = messages.find((m) => m.role === 'student');
        return {
          score: data.score,
          answer: firstStudentMsg?.content || '',
        };
      })
      .filter((a) => Number.isFinite(a.score) && a.score > 0 && a.answer.trim())
      .slice(0, 5)
      .map((a, i) => ({
        label: `학생 ${i + 1}`,
        score: a.score,
        answer: a.answer,
      }));

    return NextResponse.json({ success: true, topAnswers });
  } catch (error) {
    console.error('Top answers error:', error);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
