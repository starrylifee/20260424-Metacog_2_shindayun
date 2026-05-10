'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

import { formatStudentMessageByteRange, normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import { auth, googleProvider } from '@/lib/firebase';
import { getAssignmentsByTeacher, getTeacherSettings } from '@/lib/firestore';

export default function TeacherDashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [codeModal, setCodeModal] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setAssignments([]);
        setHasSettings(false);
        setLoadError('');
        setDataLoading(false);
        setAuthLoading(false);
        return;
      }

      setUser(nextUser);
      setDataLoading(true);
      setLoadError('');

      try {
        try {
          const settings = await getTeacherSettings(nextUser.uid);
          setHasSettings(Boolean(settings?.growndApiKey && settings?.growndClassId));
        } catch (error) {
          console.error('Failed to load teacher settings:', error);
          setHasSettings(false);
        }

        try {
          const data = await getAssignmentsByTeacher(nextUser.uid);
          setAssignments(data);
        } catch (error) {
          console.error('Failed to load assignments:', error);
          setAssignments([]);
          setLoadError(
            error instanceof Error ? error.message : '과제 목록을 불러오지 못했습니다.'
          );
        }
      } finally {
        setDataLoading(false);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setAssignments([]);
    setHasSettings(false);
    setLoadError('');
  };

  const formatDate = (value) => {
    if (!value) return '-';

    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeCount = assignments.filter((assignment) => assignment.isActive).length;

  if (authLoading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p style={{ color: 'var(--text-secondary)' }}>로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-container">
        <div className="entry-container">
          <div className="entry-card">
            <div className="bot-avatar bot-avatar-large">👩‍🏫</div>
            <h1 className="heading-hero">
              <span className="heading-gradient">교사 로그인</span>
            </h1>
            <p className="subtitle">Google 계정으로 교사 대시보드에 접속하세요.</p>

            <button
              id="btn-google-login"
              className="btn btn-primary btn-large"
              onClick={handleLogin}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              Google로 로그인
            </button>

            <Link href="/" className="btn btn-ghost" style={{ width: '100%' }}>
              학생 화면으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {codeModal && (
        <div
          onClick={() => setCodeModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-xl)',
              padding: '2.5rem 3rem',
              textAlign: 'center',
              boxShadow: 'var(--shadow-md)',
              minWidth: '18rem',
            }}
          >
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {codeModal.title} — 입장 코드
            </p>
            <p style={{
              fontSize: '4rem', fontWeight: 800, letterSpacing: '0.25em',
              background: 'linear-gradient(135deg, var(--primary), var(--primary-bright))',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent', color: 'transparent',
              lineHeight: 1.1, marginBottom: '1.5rem',
            }}>
              {codeModal.entryCode}
            </p>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCodeModal(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <nav className="navbar">
        <Link href="/teacher" className="navbar-brand">
          <span className="emoji">🤖</span> 오늘배움봇
        </Link>
        <div className="navbar-actions">
          <Link href="/teacher/settings" className="btn btn-ghost btn-sm">
            설정
          </Link>
          <div className="navbar-user">
            {user.photoURL && <img src={user.photoURL} alt="" />}
            <span>{user.displayName}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>

      <div className="content-wrapper">
        {!hasSettings && (
          <div
            className="card"
            style={{
              marginBottom: '1.5rem',
              borderColor: 'rgba(251, 191, 36, 0.3)',
              background: 'rgba(251, 191, 36, 0.05)',
            }}
          >
            <p style={{ color: 'var(--yellow-primary)' }}>
              Grownd API 설정이 필요합니다.{' '}
              <Link
                href="/teacher/settings"
                style={{ color: 'var(--purple-light)', textDecoration: 'underline' }}
              >
                설정하러 가기
              </Link>
            </p>
          </div>
        )}

        {loadError && (
          <div
            className="card"
            style={{
              marginBottom: '1.5rem',
              borderColor: 'rgba(251, 113, 133, 0.35)',
              background: 'rgba(251, 113, 133, 0.08)',
            }}
          >
            <p>{loadError}</p>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}
        >
          <div>
            <h1 className="heading-section">내 과제</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              과제를 만들고 학생 결과를 확인할 수 있습니다.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href="/teacher/assignments/new" className="btn btn-primary">
              ➕ 새 과제
            </Link>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{assignments.length}</div>
            <div className="stat-label">전체 과제</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{activeCount}</div>
            <div className="stat-label">활성 과제</div>
          </div>
        </div>

        {dataLoading ? (
          <div className="loading-container" style={{ minHeight: '30vh' }}>
            <div className="loading-spinner" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-emoji">📝</div>
            <p className="empty-state-text">아직 만든 과제가 없습니다.</p>
            <Link href="/teacher/assignments/new" className="btn btn-primary">
              첫 과제 만들기
            </Link>
          </div>
        ) : (
          <div className="grid-2">
            {assignments.map((assignment, index) => {
              const chatConstraints = normalizeAssignmentConstraints(assignment);

              return (
              <Link
                key={assignment.id}
                href={`/teacher/assignments/${assignment.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="card">
                  <p
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span style={{ color: 'var(--primary)', fontWeight: 700, marginRight: '0.5rem' }}>#{index + 1}</span>
                    최소 {chatConstraints.minTurns}턴 후 채점 · 최대 {chatConstraints.maxTurns}턴
                  </p>
                  <p
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.6rem',
                    }}
                  >
                    학생 답변 {formatStudentMessageByteRange(
                      chatConstraints.minStudentMessageBytes,
                      chatConstraints.maxStudentMessageBytes
                    )}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div className="card-title">{assignment.title}</div>
                    <span
                      className={`badge ${
                        assignment.isActive ? 'badge-active' : 'badge-inactive'
                      }`}
                    >
                      {assignment.isActive ? '활성' : '비활성'}
                    </span>
                  </div>
                  {assignment.subject && (
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {assignment.subject} {assignment.grade ? `· ${assignment.grade}` : ''}
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span className="card-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      입장코드:{' '}
                      <strong style={{ color: 'var(--cyan-primary)', letterSpacing: '0.1em' }}>
                        {assignment.entryCode}
                      </strong>
                      <button
                        onClick={(e) => { e.preventDefault(); setCodeModal(assignment); }}
                        style={{
                          fontSize: '0.75rem', padding: '0.15rem 0.5rem',
                          borderRadius: '4px', border: '1px solid var(--primary)',
                          background: 'transparent', color: 'var(--primary)',
                          cursor: 'pointer', lineHeight: 1.5,
                        }}
                      >
                        크게 보기
                      </button>
                    </span>
                    <span className="card-meta">
                      👤 {assignment.participantCount ?? 0}명
                    </span>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
