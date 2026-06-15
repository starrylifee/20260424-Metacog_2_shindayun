'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import BotAvatar from '@/components/BotAvatar';
import { stripMarkdown } from '@/lib/textUtils';

// 과목 표시 순서 (목록에 없는 과목은 뒤에 가나다순)
const SUBJECT_ORDER = ['국어', '수학', '사회', '과학', '영어', '융합'];

function subjectRank(subject) {
  const idx = SUBJECT_ORDER.indexOf(subject);
  return idx === -1 ? SUBJECT_ORDER.length : idx;
}

function groupBySubject(assignments) {
  const groups = {};
  for (const a of assignments) {
    const subject = a.subject?.trim() || '기타';
    if (!groups[subject]) groups[subject] = [];
    groups[subject].push(a);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    const r = subjectRank(a) - subjectRank(b);
    return r !== 0 ? r : a.localeCompare(b, 'ko');
  });
}

function studentAnswerText(conv) {
  const messages = Array.isArray(conv?.messages) ? conv.messages : [];
  return messages
    .filter((m) => m.role === 'student')
    .map((m) => m.content)
    .join('\n\n')
    .trim();
}

export default function ClassDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code;

  const [className, setClassName] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openSubjects, setOpenSubjects] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  // 학생 로그인 (내 답변 보기 / 다시 도전)
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [student, setStudent] = useState(null); // { name, password }
  const [myConvByAssignment, setMyConvByAssignment] = useState({});

  // 명예의 전당 캐시 (entryCode 기준)
  const [galleryCache, setGalleryCache] = useState({});
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const grouped = useMemo(() => groupBySubject(assignments), [assignments]);
  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === selectedId) || null,
    [assignments, selectedId]
  );
  const myConv = selectedAssignment ? myConvByAssignment[selectedAssignment.id] : null;

  useEffect(() => {
    if (!code) return;

    fetch(`/api/class/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setClassName(data.className || '');
          setAssignments(data.assignments || []);
          // 모든 과목 펼친 상태로 시작
          const open = {};
          for (const a of data.assignments || []) {
            open[a.subject?.trim() || '기타'] = true;
          }
          setOpenSubjects(open);
        } else {
          setError(data.error || '학급을 찾을 수 없습니다.');
        }
      })
      .catch(() => setError('서버 연결에 실패했어요.'))
      .finally(() => setLoading(false));
  }, [code]);

  // 선택한 과제의 명예의 전당 로드
  useEffect(() => {
    if (!selectedAssignment?.entryCode) return;
    const entryCode = selectedAssignment.entryCode;
    if (galleryCache[entryCode] !== undefined) return;

    setGalleryLoading(true);
    fetch(`/api/assignments/gallery?code=${entryCode}`)
      .then((r) => r.json())
      .then((data) => {
        setGalleryCache((prev) => ({
          ...prev,
          [entryCode]: data.success ? data : { gallery: [] },
        }));
      })
      .catch(() => {
        setGalleryCache((prev) => ({ ...prev, [entryCode]: { gallery: [] } }));
      })
      .finally(() => setGalleryLoading(false));
  }, [selectedAssignment, galleryCache]);

  const toggleSubject = (subject) => {
    setOpenSubjects((prev) => ({ ...prev, [subject]: !prev[subject] }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.name.trim() || !loginForm.password.trim()) {
      setLoginError('이름과 비밀번호를 입력해주세요.');
      return;
    }
    setLoginLoading(true);
    setLoginError('');

    try {
      const res = await fetch(
        `/api/portfolio?name=${encodeURIComponent(loginForm.name.trim())}&password=${encodeURIComponent(loginForm.password.trim())}`
      );
      const data = await res.json();
      if (!data.success) {
        setLoginError(data.error || '학생 정보를 찾을 수 없습니다.');
      } else {
        const map = {};
        for (const conv of data.conversations || []) {
          if (conv.assignment?.id) map[conv.assignment.id] = conv;
        }
        setMyConvByAssignment(map);
        setStudent({ name: loginForm.name.trim(), password: loginForm.password });
        setLoginForm({ name: '', password: '' });
        setShowLogin(false);
      }
    } catch {
      setLoginError('서버 연결에 실패했어요.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setStudent(null);
    setMyConvByAssignment({});
  };

  const handleRetry = async () => {
    if (!selectedAssignment || !student || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch('/api/class/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: selectedAssignment.id,
          studentName: student.name,
          studentPassword: student.password,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '다시 도전할 수 없습니다.');
        setRetrying(false);
        return;
      }
      sessionStorage.setItem(
        'metacog_auth',
        JSON.stringify({ name: student.name, password: student.password })
      );
      router.push(`/chat/${data.entryCode}`);
    } catch {
      alert('서버 연결에 실패했어요.');
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p style={{ color: 'var(--text-secondary)' }}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <BotAvatar size={22} /> 오늘배움봇
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">← 돌아가기</Link>
        </nav>
        <div className="empty-state" style={{ marginTop: '3rem' }}>
          <div className="empty-state-emoji">🔍</div>
          <p className="empty-state-text">{error}</p>
          <Link href="/" className="btn btn-primary">홈으로</Link>
        </div>
      </div>
    );
  }

  const gallery = selectedAssignment ? galleryCache[selectedAssignment.entryCode] : null;

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <BotAvatar size={22} /> 오늘배움봇
        </Link>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', flex: 1, textAlign: 'center' }}>
          {className || '우리 학급'} · 작업장
        </span>
        {student ? (
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            {student.name} 로그아웃
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowLogin((v) => !v)}>
            🙋 내 답변 보기
          </button>
        )}
      </nav>

      {/* 학생 로그인 폼 */}
      {showLogin && !student && (
        <div style={{
          maxWidth: '420px',
          margin: '1rem auto 0',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}>
          <form onSubmit={handleLogin}>
            <div style={{ fontWeight: 600, marginBottom: '0.6rem', color: 'var(--text-secondary)' }}>
              이름과 비밀번호로 내 답변을 확인하고 다시 도전할 수 있어요.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="이름"
                value={loginForm.name}
                onChange={(e) => setLoginForm((p) => ({ ...p, name: e.target.value }))}
                style={{ flex: 1, minWidth: '100px' }}
              />
              <input
                type="password"
                className="form-input"
                placeholder="비밀번호"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                style={{ flex: 1, minWidth: '100px' }}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={loginLoading}>
                {loginLoading ? '...' : '확인'}
              </button>
            </div>
            {loginError && (
              <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
                ⚠️ {loginError}
              </p>
            )}
          </form>
        </div>
      )}

      <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        {/* 작업장 사이드바 */}
        <div style={{
          width: '280px',
          minWidth: '240px',
          borderRight: '1px solid var(--border-color)',
          overflowY: 'auto',
          padding: '1rem 0',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '0 1rem 0.75rem',
            fontSize: '0.95rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}>
            🗂️ 작업장
          </div>

          {assignments.length === 0 ? (
            <p style={{ padding: '0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              아직 진행 중인 프로젝트가 없어요.
            </p>
          ) : (
            grouped.map(([subject, items]) => (
              <div key={subject}>
                <button
                  onClick={() => toggleSubject(subject)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>⚡ {subject}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {openSubjects[subject] ? '▼' : '▶'}
                  </span>
                </button>

                {openSubjects[subject] && items.map((a) => {
                  const isSelected = selectedId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.4rem 1rem 0.4rem 2rem',
                        background: isSelected ? 'rgba(0,102,204,0.10)' : 'none',
                        border: 'none',
                        borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {a.title}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {a.participantCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 가운데 패널 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedAssignment ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              gap: '0.75rem',
            }}>
              <div style={{ fontSize: '3rem' }}>👈</div>
              <p>왼쪽 작업장에서 프로젝트를 선택해 보세요.</p>
            </div>
          ) : (
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  {selectedAssignment.title}
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {selectedAssignment.subject || '기타'}
                  {selectedAssignment.grade ? ` · ${selectedAssignment.grade}` : ''}
                  {' · '}👤 {selectedAssignment.participantCount}명 참여
                </p>
              </div>

              {/* 내 답변 */}
              {student && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{
                    fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem',
                  }}>
                    🙋 내 답변
                  </div>
                  {myConv ? (
                    <div className="card" style={{ padding: '1.25rem' }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: '0.6rem',
                      }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {student.name}
                          {myConv.approved && (
                            <span style={{ marginLeft: '0.5rem', color: 'var(--primary)' }}>✓ 승인됨</span>
                          )}
                        </span>
                        {Number.isFinite(myConv.score) && (
                          <span className="badge badge-score">{myConv.score}점</span>
                        )}
                      </div>
                      <p style={{
                        fontSize: '0.93rem', lineHeight: 1.65, color: 'var(--text-secondary)',
                        margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                      }}>
                        {studentAnswerText(myConv) || '(작성한 답변이 없어요)'}
                      </p>
                      {myConv.feedback && (
                        <p style={{
                          fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.75rem',
                          borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem',
                          lineHeight: 1.55, marginBottom: 0,
                        }}>
                          💬 {stripMarkdown(myConv.feedback)}
                        </p>
                      )}
                      {myConv.approved ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem', marginBottom: 0, fontStyle: 'italic' }}>
                          선생님이 승인한 답변이라 다시 도전할 수 없어요.
                        </p>
                      ) : (
                        <button
                          onClick={handleRetry}
                          disabled={retrying}
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: '0.9rem' }}
                        >
                          {retrying ? '이동 중...' : '✏️ 다시 도전하기'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.9rem' }}>
                        아직 이 프로젝트에 참여하지 않았어요.
                      </p>
                      <button
                        onClick={handleRetry}
                        disabled={retrying}
                        className="btn btn-primary btn-sm"
                      >
                        {retrying ? '이동 중...' : '🚀 지금 도전하기'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* AI 모범답안 */}
              {gallery?.showExampleAnswers && gallery?.aiExampleAnswer && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{
                    fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem',
                  }}>
                    🤖 AI 모범답안
                  </div>
                  <div className="card" style={{
                    padding: '1.25rem',
                    border: '1.5px solid rgba(251, 191, 36, 0.45)',
                    background: 'rgba(251, 191, 36, 0.06)',
                  }}>
                    <p style={{
                      fontSize: '0.93rem', lineHeight: 1.65, color: 'var(--text-secondary)',
                      margin: 0, wordBreak: 'keep-all',
                    }}>
                      {gallery.aiExampleAnswer}
                    </p>
                  </div>
                </div>
              )}

              {/* 명예의 전당 */}
              <div>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem',
                }}>
                  🏆 명예의 전당
                </div>
                {galleryLoading && gallery === undefined ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                    <div className="loading-spinner" style={{ width: '28px', height: '28px' }} />
                  </div>
                ) : !gallery || (gallery.gallery || []).length === 0 ? (
                  <div className="card" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>아직 등록된 우수 답변이 없어요.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {gallery.gallery.map((item, i) => (
                      <div key={item.conversationId || i} className="card" style={{ padding: '1.1rem 1.25rem' }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: '0.5rem',
                        }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{item.studentName}
                          </span>
                          <span className="badge badge-score">
                            {item.score}{Number.isFinite(item.maxScore) ? `/${item.maxScore}` : ''}점
                          </span>
                        </div>
                        <p style={{
                          fontSize: '0.93rem', lineHeight: 1.65, color: 'var(--text-secondary)',
                          margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                        }}>
                          {stripMarkdown(item.lastMessage)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
