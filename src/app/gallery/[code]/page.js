'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import BotAvatar from '@/components/BotAvatar';
import { stripMarkdown } from '@/lib/textUtils';

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code;

  const [gallery, setGallery] = useState([]);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [galleryCommentsEnabled, setGalleryCommentsEnabled] = useState(false);
  const [showExampleAnswers, setShowExampleAnswers] = useState(false);
  const [aiExampleAnswer, setAiExampleAnswer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Student login state for comments
  const [loggedInStudent, setLoggedInStudent] = useState(null); // { studentCode, anonymizedName }
  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);

  // Per-card expanded answer state
  const [expandedAnswers, setExpandedAnswers] = useState(new Set());

  // Per-card comments state
  const [expandedConvId, setExpandedConvId] = useState(null);
  const [loadedComments, setLoadedComments] = useState({});
  const [commentsLoading, setCommentsLoading] = useState(new Set());
  const [commentDrafts, setCommentDrafts] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loginNameRef = useRef(null);

  useEffect(() => {
    if (!code) return;

    fetch(`/api/assignments/gallery?code=${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setGallery(data.gallery || []);
          setAssignmentTitle(data.assignmentTitle || '');
          setAssignmentId(data.assignmentId || '');
          setGalleryCommentsEnabled(Boolean(data.galleryCommentsEnabled));
          setShowExampleAnswers(Boolean(data.showExampleAnswers));
          setAiExampleAnswer(data.aiExampleAnswer || null);

          if (data.galleryCommentsEnabled && data.assignmentId) {
            // Check for existing gallery session
            fetch(`/api/gallery/auth?assignmentId=${data.assignmentId}`)
              .then((r) => r.json())
              .then((auth) => {
                if (auth.success && auth.loggedIn) {
                  setLoggedInStudent({
                    studentCode: auth.studentCode,
                    anonymizedName: auth.anonymizedName,
                  });
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [code]);

  // Load comments when a card expands
  useEffect(() => {
    if (!expandedConvId) return;
    if (loadedComments[expandedConvId] !== undefined) return;

    setCommentsLoading((prev) => new Set([...prev, expandedConvId]));

    fetch(`/api/gallery/comments?conversationId=${expandedConvId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setLoadedComments((prev) => ({ ...prev, [expandedConvId]: data.comments || [] }));
        } else {
          setLoadedComments((prev) => ({ ...prev, [expandedConvId]: [] }));
        }
      })
      .catch(() => {
        setLoadedComments((prev) => ({ ...prev, [expandedConvId]: [] }));
      })
      .finally(() => {
        setCommentsLoading((prev) => {
          const next = new Set(prev);
          next.delete(expandedConvId);
          return next;
        });
      });
  }, [expandedConvId]);

  const handleToggleComments = (convId) => {
    setExpandedConvId((prev) => (prev === convId ? null : convId));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/gallery/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          studentName: loginForm.name.trim(),
          studentPassword: loginForm.password,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setLoggedInStudent({ studentCode: data.studentCode, anonymizedName: data.anonymizedName });
        setLoginForm({ name: '', password: '' });
        setShowLoginForm(false);
      } else {
        setLoginError(data.error || '로그인에 실패했습니다.');
      }
    } catch {
      setLoginError('서버 오류가 발생했습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSubmitComment = async (conversationId) => {
    const draft = commentDrafts[conversationId]?.trim();
    if (!draft || submitting) return;

    setSubmitting(true);

    try {
      const res = await fetch('/api/gallery/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, comment: draft }),
      });
      const data = await res.json();

      if (data.success) {
        setLoadedComments((prev) => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []), data.comment],
        }));
        setCommentDrafts((prev) => ({ ...prev, [conversationId]: '' }));
      } else {
        alert(data.error || '등록에 실패했습니다.');
      }
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyCommented = (convId) => {
    const comments = loadedComments[convId] || [];
    return comments.some((c) => c.commenterName === loggedInStudent?.anonymizedName);
  };

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <BotAvatar size={22} /> 오늘배움봇
        </Link>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
        >
          ← 돌아가기
        </button>
      </nav>

      <div className="content-wrapper">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
          <h1 className="heading-hero">
            <span className="heading-gradient">명예의 전당</span>
          </h1>
          {assignmentTitle && <p className="subtitle">{assignmentTitle}</p>}
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            입장코드 {code} · 우수 답변 모음
          </p>
        </div>

        {/* Comment login banner */}
        {!loading && galleryCommentsEnabled && gallery.length > 0 && (
          <div style={{
            maxWidth: '1000px',
            margin: '0 auto 1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            fontSize: '0.875rem',
          }}>
            {loggedInStudent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--purple-light)', fontWeight: 600 }}>✓</span>
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>{loggedInStudent.anonymizedName}</strong>
                  으로 로그인됨 · 카드 아래 응원 버튼으로 댓글을 남길 수 있어요
                </span>
              </div>
            ) : showLoginForm ? (
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  💬 로그인하고 친구를 응원해보세요
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    ref={loginNameRef}
                    type="text"
                    className="form-input"
                    placeholder="이름"
                    value={loginForm.name}
                    onChange={(e) => setLoginForm((p) => ({ ...p, name: e.target.value }))}
                    style={{ width: '110px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                    required
                  />
                  <input
                    type="password"
                    className="form-input"
                    placeholder="비밀번호"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                    style={{ width: '110px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={loginLoading}
                    style={{ padding: '0.35rem 0.9rem', fontSize: '0.85rem' }}
                  >
                    {loginLoading ? '...' : '로그인'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setShowLoginForm(false); setLoginError(''); }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    취소
                  </button>
                </div>
                {loginError && (
                  <p style={{ color: 'var(--error-color, #f87171)', fontSize: '0.8rem', marginTop: '0.4rem', marginBottom: 0 }}>
                    {loginError}
                  </p>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>💬 친구들의 답변에 응원을 남길 수 있어요</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowLoginForm(true);
                    setTimeout(() => loginNameRef.current?.focus(), 50);
                  }}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                >
                  로그인
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="loading-spinner" />
          </div>
        ) : gallery.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-emoji">🌱</div>
            <p className="empty-state-text">아직 등록된 답변이 없어요.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              친구들이 먼저 오늘배움봇과 대화하면 여기에 나타납니다.
            </p>
            <Link href="/" className="btn btn-primary">챗봇 시작하기</Link>
          </div>
        ) : (
          <>
            {/* AI 모범 답안 섹션 */}
            {showExampleAnswers && aiExampleAnswer && (
              <div style={{ maxWidth: '1000px', margin: '0 auto 1.5rem' }}>
                <div style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.6rem',
                }}>
                  ✨ 예시 답안
                </div>
                <div className="card" style={{
                  padding: '1.25rem',
                  border: '1.5px solid rgba(251, 191, 36, 0.45)',
                  background: 'rgba(251, 191, 36, 0.06)',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      🤖 AI 모범 답안
                    </span>
                    <span className="badge badge-score" style={{ background: 'rgba(251,191,36,0.18)', color: '#b45309' }}>
                      만점 기준
                    </span>
                  </div>
                  <p style={{
                    fontSize: '0.95rem',
                    lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                    margin: 0,
                    wordBreak: 'keep-all',
                  }}>
                    {aiExampleAnswer}
                  </p>
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.75rem',
                    marginBottom: 0,
                    fontStyle: 'italic',
                  }}>
                    이 답변은 AI가 생성한 모범 예시입니다.
                  </p>
                </div>
              </div>
            )}

            {/* 학생 우수 답변 섹션 */}
            {showExampleAnswers && gallery.length > 0 && (
              <div style={{
                maxWidth: '1000px',
                margin: '0 auto 0.6rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>
                🏆 우수 학생 답변
              </div>
            )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
            maxWidth: '1000px',
            margin: '0 auto',
            alignItems: 'start',
          }}>
            {gallery.map((item, i) => {
              const convId = item.conversationId;
              const isExpanded = expandedConvId === convId;
              const isAnswerExpanded = expandedAnswers.has(i);
              const comments = loadedComments[convId];
              const isLoadingComments = commentsLoading.has(convId);
              const draft = commentDrafts[convId] || '';
              const hasCommented = loggedInStudent && alreadyCommented(convId);

              const fullAnswer = stripMarkdown(item.lastMessage);
              const PREVIEW_LEN = 180;
              const isLong = fullAnswer.length > PREVIEW_LEN;
              const displayAnswer = isLong && !isAnswerExpanded
                ? fullAnswer.slice(0, PREVIEW_LEN).trimEnd() + '…'
                : fullAnswer;

              return (
                <div key={i} className="card" style={{ padding: '1.25rem' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{item.studentName}
                    </span>
                    <span className="badge badge-score">
                      {item.score}{Number.isFinite(item.maxScore) ? `/${item.maxScore}` : ''}점
                    </span>
                  </div>

                  <p style={{
                    fontSize: '0.95rem',
                    lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                    margin: 0,
                    wordBreak: 'keep-all',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {displayAnswer}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => setExpandedAnswers((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        color: 'var(--purple-light)',
                        padding: '0.3rem 0',
                        marginTop: '0.25rem',
                      }}
                    >
                      {isAnswerExpanded ? '접기 ▲' : '더 보기 ▼'}
                    </button>
                  )}

                  {item.feedback && (
                    <p style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.75rem',
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '0.75rem',
                      lineHeight: 1.55,
                      marginBottom: 0,
                    }}>
                      💬 {stripMarkdown(item.feedback)}
                    </p>
                  )}

                  {/* Comment section */}
                  {galleryCommentsEnabled && convId && (
                    <div style={{
                      marginTop: '0.75rem',
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '0.6rem',
                    }}>
                      {/* Toggle button */}
                      <button
                        onClick={() => handleToggleComments(convId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <span>🌟 응원</span>
                        {comments && comments.length > 0 && (
                          <span style={{
                            background: 'var(--border-color)',
                            borderRadius: '10px',
                            padding: '0 6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}>
                            {comments.length}
                          </span>
                        )}
                        <span style={{ marginLeft: '0.15rem' }}>{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {/* Expanded comment area */}
                      {isExpanded && (
                        <div style={{ marginTop: '0.6rem' }}>
                          {isLoadingComments ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                              불러오는 중...
                            </div>
                          ) : (
                            <>
                              {comments && comments.length > 0 ? (
                                <div style={{ marginBottom: '0.5rem' }}>
                                  {comments.map((c, ci) => (
                                    <div
                                      key={c.id || ci}
                                      style={{
                                        fontSize: '0.78rem',
                                        color: 'var(--text-secondary)',
                                        padding: '0.2rem 0',
                                        lineHeight: 1.4,
                                      }}
                                    >
                                      <span style={{ fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.3rem' }}>
                                        {c.commenterName}
                                      </span>
                                      {c.comment}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.15rem 0 0.4rem', fontStyle: 'italic' }}>
                                  첫 번째 응원을 남겨보세요!
                                </div>
                              )}

                              {loggedInStudent ? (
                                hasCommented ? (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    이미 응원을 남겼어요
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                    <input
                                      type="text"
                                      placeholder="응원 한마디... (50자 이내)"
                                      maxLength={50}
                                      value={draft}
                                      onChange={(e) =>
                                        setCommentDrafts((prev) => ({ ...prev, [convId]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleSubmitComment(convId);
                                        }
                                      }}
                                      style={{
                                        flex: 1,
                                        fontSize: '0.78rem',
                                        padding: '0.3rem 0.5rem',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--input-bg, var(--card-bg))',
                                        color: 'var(--text-primary)',
                                        minWidth: 0,
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSubmitComment(convId)}
                                      disabled={!draft.trim() || submitting}
                                      className="btn btn-primary btn-sm"
                                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', flexShrink: 0 }}
                                    >
                                      등록
                                    </button>
                                  </div>
                                )
                              ) : (
                                <button
                                  onClick={() => {
                                    setShowLoginForm(true);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                    setTimeout(() => loginNameRef.current?.focus(), 400);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    color: 'var(--purple-light)',
                                    padding: 0,
                                    textDecoration: 'underline',
                                  }}
                                >
                                  로그인하고 응원하기 ↑
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}

        {gallery.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link href="/" className="btn btn-primary">나도 오늘배움봇과 대화하기</Link>
          </div>
        )}
      </div>
    </div>
  );
}
