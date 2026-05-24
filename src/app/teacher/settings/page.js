'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import BotAvatar from '@/components/BotAvatar';
import { onAuthStateChanged } from 'firebase/auth';
import { getChatLengthExamples, getTeacherConstraintDefaults } from '@/lib/chatConstraints';
import { getTeacherSettings, saveTeacherSettings } from '@/lib/firestore';

export default function TeacherSettings() {
  const router = useRouter();
  const mathDefaults = getTeacherConstraintDefaults({});
  const lengthExamples = getChatLengthExamples();
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState({
    growndClassId: '',
    growndApiKey: '',
    defaultMathMinTurns: mathDefaults.minTurns,
    defaultMathMaxTurns: mathDefaults.maxTurns,
    defaultMinStudentMessageBytes: mathDefaults.minStudentMessageBytes,
    defaultMaxStudentMessageBytes: mathDefaults.maxStudentMessageBytes,
    students: [],
  });

  const [newStudent, setNewStudent] = useState({ name: '', password: '', code: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/teacher');
        return;
      }
      setUser(u);

      const existing = await getTeacherSettings(u.uid);
      if (existing) {
        setSettings({
          growndClassId: existing.growndClassId || '',
          growndApiKey: existing.growndApiKey || '',
          defaultMathMinTurns: existing.defaultMathMinTurns ?? mathDefaults.minTurns,
          defaultMathMaxTurns: existing.defaultMathMaxTurns ?? mathDefaults.maxTurns,
          defaultMinStudentMessageBytes: existing.defaultMinStudentMessageBytes ?? mathDefaults.minStudentMessageBytes,
          defaultMaxStudentMessageBytes: existing.defaultMaxStudentMessageBytes ?? mathDefaults.maxStudentMessageBytes,
          students: Array.isArray(existing.students) ? existing.students : [],
        });
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      await saveTeacherSettings(user.uid, {
        growndClassId: settings.growndClassId,
        growndApiKey: settings.growndApiKey,
        defaultMathMinTurns: settings.defaultMathMinTurns,
        defaultMathMaxTurns: settings.defaultMathMaxTurns,
        defaultMinStudentMessageBytes: settings.defaultMinStudentMessageBytes,
        defaultMaxStudentMessageBytes: settings.defaultMaxStudentMessageBytes,
        students: settings.students,
        email: user.email,
        displayName: user.displayName,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Save error:', err);
      alert('저장에 실패했습니다.');
    }
    setSaving(false);
  };

  const addStudent = () => {
    if (!newStudent.name.trim() || !newStudent.password.trim()) {
      alert('이름과 비밀번호를 입력해주세요.');
      return;
    }

    const nextCode = newStudent.code
      ? Number(newStudent.code)
      : (settings.students.length > 0
          ? Math.max(...settings.students.map((s) => s.code)) + 1
          : 1);

    setSettings((prev) => ({
      ...prev,
      students: [
        ...prev.students,
        { name: newStudent.name.trim(), password: newStudent.password, code: nextCode },
      ],
    }));
    setNewStudent({ name: '', password: '', code: '' });
  };

  const removeStudent = (index) => {
    setSettings((prev) => ({
      ...prev,
      students: prev.students.filter((_, i) => i !== index),
    }));
  };

  const updateStudent = (index, field, value) => {
    setSettings((prev) => {
      const next = [...prev.students];
      next[index] = { ...next[index], [field]: field === 'code' ? Number(value) : value };
      return { ...prev, students: next };
    });
  };

  if (!user) return null;

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/teacher" className="navbar-brand">
          <BotAvatar size={22} /> 오늘배움봇
        </Link>
        <Link href="/teacher" className="btn btn-ghost btn-sm">← 대시보드</Link>
      </nav>

      <div className="content-wrapper content-narrow">
        <h1 className="heading-section">⚙️ 설정</h1>

        <form onSubmit={handleSave}>
          {/* 학생 목록 */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              🎒 학생 목록 (이름 / 비밀번호 / Grownd 번호)
            </h3>
            <p className="form-hint" style={{ marginBottom: '1rem' }}>
              학생이 입장할 때 이름과 비밀번호로 로그인합니다. Grownd 번호는 포인트 전송에 사용됩니다.
            </p>

            {settings.students.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>이름</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>비밀번호</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500, width: '80px' }}>번호</th>
                      <th style={{ width: '48px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {settings.students.map((student, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.88rem' }}
                            value={student.name}
                            onChange={(e) => updateStudent(index, 'name', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.88rem' }}
                            value={student.password}
                            onChange={(e) => updateStudent(index, 'password', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            className="form-input"
                            style={{ padding: '0.35rem 0.4rem', fontSize: '0.88rem', textAlign: 'center' }}
                            value={student.code}
                            onChange={(e) => updateStudent(index, 'code', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.25rem 0.5rem' }}
                            onClick={() => removeStudent(index)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 학생 추가 행 */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: '100px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>이름</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="홍길동"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent((prev) => ({ ...prev, name: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStudent())}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: '100px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>비밀번호</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="1234"
                  value={newStudent.password}
                  onChange={(e) => setNewStudent((prev) => ({ ...prev, password: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStudent())}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: '80px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>번호</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  className="form-input"
                  placeholder="자동"
                  value={newStudent.code}
                  onChange={(e) => setNewStudent((prev) => ({ ...prev, code: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStudent())}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginBottom: 0 }}
                onClick={addStudent}
              >
                + 추가
              </button>
            </div>
          </div>

          {/* Grownd 설정 */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              🌱 Grownd API 설정
            </h3>

            <div className="form-group">
              <label className="form-label">클래스 ID (Class ID)</label>
              <input
                id="input-class-id"
                type="text"
                className="form-input"
                placeholder="예: NP0hetJ3wyQKFtRnFeftmPiy8Dl4_2"
                value={settings.growndClassId}
                onChange={(e) => setSettings(prev => ({ ...prev, growndClassId: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">API 키 (API Key)</label>
              <input
                id="input-api-key"
                type="password"
                className="form-input"
                placeholder="Grownd에서 발급받은 API 키"
                value={settings.growndApiKey}
                onChange={(e) => setSettings(prev => ({ ...prev, growndApiKey: e.target.value }))}
              />
              <p className="form-hint">채팅 완료 시 해당 학생의 Grownd 번호로 포인트가 자동 전송됩니다.</p>
            </div>
          </div>

          {/* 대화 기본값 */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              💬 새 과제 기본값
            </h3>

            <div className="form-group">
              <label className="form-label">수학 최소 / 최대 턴</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <input
                  type="number"
                  min="1"
                  max={settings.defaultMathMaxTurns}
                  className="form-input"
                  value={settings.defaultMathMinTurns}
                  onChange={(e) => {
                    const v = Number(e.target.value || 1);
                    setSettings((prev) => ({
                      ...prev,
                      defaultMathMinTurns: v,
                      defaultMathMaxTurns: Math.max(prev.defaultMathMaxTurns, v),
                    }));
                  }}
                />
                <input
                  type="number"
                  min={settings.defaultMathMinTurns}
                  max="12"
                  className="form-input"
                  value={settings.defaultMathMaxTurns}
                  onChange={(e) => {
                    const v = Number(e.target.value || settings.defaultMathMinTurns);
                    setSettings((prev) => ({
                      ...prev,
                      defaultMathMaxTurns: Math.max(v, prev.defaultMathMinTurns),
                    }));
                  }}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">학생 답변 길이 기본값 (최소 / 최대 바이트)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <input
                  type="number"
                  min="1"
                  max={settings.defaultMaxStudentMessageBytes}
                  className="form-input"
                  value={settings.defaultMinStudentMessageBytes}
                  onChange={(e) => {
                    const v = Number(e.target.value || 1);
                    setSettings((prev) => ({
                      ...prev,
                      defaultMinStudentMessageBytes: v,
                      defaultMaxStudentMessageBytes: Math.max(prev.defaultMaxStudentMessageBytes, v),
                    }));
                  }}
                />
                <input
                  type="number"
                  min={settings.defaultMinStudentMessageBytes}
                  max="4000"
                  className="form-input"
                  value={settings.defaultMaxStudentMessageBytes}
                  onChange={(e) => {
                    const v = Number(e.target.value || settings.defaultMinStudentMessageBytes);
                    setSettings((prev) => ({
                      ...prev,
                      defaultMaxStudentMessageBytes: Math.max(v, prev.defaultMinStudentMessageBytes),
                    }));
                  }}
                />
              </div>
              <p className="form-hint" style={{ marginTop: '0.75rem' }}>
                바이트 예시: {lengthExamples.map((ex) => `${ex.label} ${ex.bytes}B`).join(' · ')}
              </p>
            </div>
          </div>

          <button
            id="btn-save-settings"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={saving}
          >
            {saving ? '저장 중...' : saved ? '✅ 저장 완료!' : '💾 저장'}
          </button>
        </form>
      </div>
    </div>
  );
}
