'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

import BotAvatar from '@/components/BotAvatar';
import { formatStudentMessageByteRange, normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import { auth, googleProvider } from '@/lib/firebase';
import { getAssignmentsByTeacher, getTeacherSettings } from '@/lib/firestore';

export default function TeacherDashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  const [classCode, setClassCode] = useState('');
  const [loadError, setLoadError] = useState('');
  const [codeModal, setCodeModal] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setAssignments([]);
        setHasSettings(false);
        setClassCode('');
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
          setClassCode(settings?.classCode || '');
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
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      // 사용자가 팝업을 직접 닫거나 중복 요청으로 취소된 경우는 무시
      if (error?.code !== 'auth/cancelled-popup-request' && error?.code !== 'auth/popup-closed-by-user') {
        console.error('Login error:', error);
      }
    } finally {
      setLoggingIn(false);
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
      <div className="page-container" style={{ background: 'var(--text)', minHeight: '100vh' }}>
        {/* 배경 장식 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '100%',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(2, 74, 216, 0.15) 0%, transparent 70%)',
            borderRadius: '50%',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-10%',
            left: '-5%',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(41, 110, 249, 0.1) 0%, transparent 70%)',
            borderRadius: '50%',
          }} />
        </div>

        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
        }}>
          {/* 로고 + 히어로 */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 1.5rem',
              background: 'linear-gradient(135deg, var(--primary), var(--primary-bright))',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(2, 74, 216, 0.4)',
            }}>
              <BotAvatar size={48} />
            </div>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '0.75rem',
              lineHeight: 1.1,
            }}>
              오늘배움봇
            </h1>
            <p style={{
              fontSize: '1.1rem',
              color: 'rgba(255, 255, 255, 0.5)',
              fontWeight: 400,
              marginBottom: '0.25rem',
            }}>
              교사 대시보드
            </p>
          </div>

          {/* 로그인 카드 */}
          <div style={{
            width: '100%',
            maxWidth: '380px',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <p style={{
              fontSize: '0.95rem',
              color: 'rgba(255, 255, 255, 0.7)',
              textAlign: 'center',
              marginBottom: '1.5rem',
              lineHeight: 1.5,
            }}>
              Google 계정으로 로그인하여<br />과제 관리와 학생 분석을 시작하세요.
            </p>

            <button
              id="btn-google-login"
              onClick={handleLogin}
              disabled={loggingIn}
              style={{
                width: '100%',
                padding: '14px 24px',
                height: '52px',
                background: '#ffffff',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '15px',
                fontWeight: 600,
                cursor: loggingIn ? 'wait' : 'pointer',
                opacity: loggingIn ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                marginBottom: '1rem',
                transition: 'transform 0.1s ease, box-shadow 0.15s ease',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.01)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Google로 로그인
            </button>

            <Link
              href="/"
              style={{
                display: 'block',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.45)',
                fontSize: '0.85rem',
                textDecoration: 'none',
                padding: '0.5rem',
              }}
            >
              ← 학생 화면으로
            </Link>
          </div>

          {/* 기능 하이라이트 */}
          <div style={{
            display: 'flex',
            gap: '1.5rem',
            marginTop: '3rem',
            maxWidth: '600px',
            width: '100%',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {[
              { icon: '📝', label: '과제 관리', desc: '차시별 과제 생성·복사' },
              { icon: '📊', label: '실시간 결과', desc: '학생 점수·대화 확인' },
              { icon: '🧠', label: 'AI 학생 분석', desc: '성장 패턴 리포트' },
            ].map((item) => (
              <div key={item.label} style={{
                flex: '1 1 150px',
                textAlign: 'center',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{item.icon}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '0.25rem' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                  {item.desc}
                </div>
              </div>
            ))}
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
          <BotAvatar size={22} /> 오늘배움봇
        </Link>
        <div className="navbar-actions">
          <Link href="/teacher/students" className="btn btn-ghost btn-sm">
            학생별 답변
          </Link>
          <Link href="/teacher/students" className="btn btn-ghost btn-sm">
            🧠 AI 분석 리포트
          </Link>
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
            {classCode && (
              <Link href={`/class/${classCode}`} className="btn btn-secondary">
                🏫 우리 학급 대시보드
              </Link>
            )}
            <Link href="/teacher/students" className="btn btn-secondary">
              👩‍🎓 학생별 답변 모음
            </Link>
            <Link href="/teacher/students" className="btn btn-secondary">
              🧠 AI 분석 리포트
            </Link>
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
