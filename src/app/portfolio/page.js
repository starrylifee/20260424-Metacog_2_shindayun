'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import mathLessonPlanData from '@/data/mathLessonPlans.json';
import socialLessonPlanData from '@/data/socialLessonPlans.json';

const SUBJECT_PLANS = {
  수학: mathLessonPlanData,
  사회: socialLessonPlanData,
};

function parseGrade(gradeStr) {
  if (!gradeStr) return { grade: '', semester: '' };
  const m = gradeStr.match(/(\d+)학년\s*(\d+)학기/);
  return m ? { grade: m[1], semester: m[2] } : { grade: '', semester: '' };
}

function buildTree(conversations) {
  // subject → grade → semester → unit → lesson → conversation
  const tree = {};

  for (const conv of conversations) {
    const { assignment } = conv;
    if (!assignment) continue;

    const subject = assignment.subject || '수학';
    const { grade, semester } = parseGrade(assignment.grade);
    const [unitName, lessonTitle] = assignment.standards || [];
    if (!grade || !semester || !unitName || !lessonTitle) continue;

    if (!tree[subject]) tree[subject] = {};
    if (!tree[subject][grade]) tree[subject][grade] = {};
    if (!tree[subject][grade][semester]) tree[subject][grade][semester] = {};
    if (!tree[subject][grade][semester][unitName]) tree[subject][grade][semester][unitName] = {};
    tree[subject][grade][semester][unitName][lessonTitle] = conv;
  }

  return tree;
}

function getMaxScore(scoreOptions) {
  if (!Array.isArray(scoreOptions) || scoreOptions.length === 0) return null;
  return Math.max(...scoreOptions);
}

export default function PortfolioPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [studentName, setStudentName] = useState('');
  const [conversations, setConversations] = useState(null);
  const [selectedConv, setSelectedConv] = useState(null);
  const [openNodes, setOpenNodes] = useState({});

  const convTree = useMemo(
    () => (conversations ? buildTree(conversations) : null),
    [conversations]
  );

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      setError('이름과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `/api/portfolio?name=${encodeURIComponent(name.trim())}&password=${encodeURIComponent(password.trim())}`
      );
      const data = await res.json();

      if (!data.success) {
        setError(data.error || '학생 정보를 찾을 수 없습니다.');
      } else {
        setStudentName(data.studentName);
        setConversations(data.conversations);
      }
    } catch {
      setError('서버 연결에 실패했어요. 다시 시도해주세요.');
    }

    setLoading(false);
  };

  const toggleNode = (key) => {
    setOpenNodes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isOpen = (key) => Boolean(openNodes[key]);

  if (conversations === null) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <span className="emoji">🤖</span> 오늘배움봇
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">← 돌아가기</Link>
        </nav>

        <div className="entry-container" style={{ paddingTop: '3rem' }}>
          <div className="entry-card">
            <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '0.5rem' }}>📚</div>
            <h1 className="heading-hero" style={{ textAlign: 'center' }}>
              <span className="heading-gradient">내 학습 기록</span>
            </h1>
            <p className="subtitle" style={{ textAlign: 'center' }}>
              이름과 비밀번호로 내 대화 기록을 확인해요.
            </p>

            <div className="card-glass">
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">🙋 이름</label>
                  <input
                    type="text"
                    className="form-input form-input-large"
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">🔑 비밀번호</label>
                  <input
                    type="password"
                    className="form-input form-input-large"
                    placeholder="선생님이 알려주신 비밀번호"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <p style={{ color: '#d70015', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                    ⚠️ {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-large"
                  disabled={loading}
                  style={{ width: '100%' }}
                >
                  {loading ? '확인 중...' : '📚 내 학습 기록 보기'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const subjects = Object.keys(SUBJECT_PLANS);

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <span className="emoji">🤖</span> 오늘배움봇
        </Link>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {studentName} 학습 기록
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => { setConversations(null); setSelectedConv(null); }}>
          로그아웃
        </button>
      </nav>

      <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        {/* 사이드바 */}
        <div style={{
          width: '280px',
          minWidth: '240px',
          borderRight: '1px solid var(--border-color)',
          overflowY: 'auto',
          padding: '1rem 0',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}>
          {subjects.map((subject) => {
            const planData = SUBJECT_PLANS[subject];
            const grades = Object.keys(planData.grades || {}).sort();

            return (
              <div key={subject}>
                <button
                  onClick={() => toggleNode(`sub_${subject}`)}
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
                  <span>{subject}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isOpen(`sub_${subject}`) ? '▼' : '▶'}
                  </span>
                </button>

                {isOpen(`sub_${subject}`) && grades.map((grade) => {
                  const semesters = Object.keys(planData.grades[grade] || {}).sort();
                  return semesters.map((semester) => {
                    const gradeLabel = `${grade}학년 ${semester}학기`;
                    const gradeKey = `g_${subject}_${grade}_${semester}`;
                    const units = planData.grades[grade][semester] || [];

                    return (
                      <div key={gradeKey}>
                        <button
                          onClick={() => toggleNode(gradeKey)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.4rem 1.5rem',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span>{gradeLabel}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {isOpen(gradeKey) ? '▼' : '▶'}
                          </span>
                        </button>

                        {isOpen(gradeKey) && units.map((unitObj) => {
                          const unitKey = `u_${subject}_${grade}_${semester}_${unitObj.unit}`;
                          const lessons = unitObj.lessons || [];

                          return (
                            <div key={unitKey}>
                              <button
                                onClick={() => toggleNode(unitKey)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '0.35rem 2rem',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                  color: 'var(--text-secondary)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <span style={{ flex: 1, textAlign: 'left' }}>{unitObj.unit}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                                  {isOpen(unitKey) ? '▼' : '▶'}
                                </span>
                              </button>

                              {isOpen(unitKey) && lessons.map((lesson) => {
                                const conv = convTree?.[subject]?.[grade]?.[semester]?.[unitObj.unit]?.[lesson];
                                const isDone = conv?.status === 'completed';
                                const isSelected = selectedConv?.id === conv?.id;

                                return (
                                  <button
                                    key={lesson}
                                    onClick={() => conv ? setSelectedConv(conv) : undefined}
                                    style={{
                                      width: '100%',
                                      textAlign: 'left',
                                      padding: '0.3rem 2.5rem',
                                      background: isSelected ? 'rgba(0,102,204,0.08)' : 'none',
                                      border: 'none',
                                      borderLeft: isSelected ? '3px solid var(--colors-primary)' : '3px solid transparent',
                                      cursor: conv ? 'pointer' : 'default',
                                      fontSize: '0.8rem',
                                      color: isDone
                                        ? 'var(--text-primary)'
                                        : 'var(--text-muted)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.4rem',
                                    }}
                                  >
                                    <span style={{ fontSize: '0.7rem' }}>
                                      {isDone ? '✓' : '·'}
                                    </span>
                                    <span style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                    }}>
                                      {lesson}
                                    </span>
                                    {isDone && Number.isFinite(conv.score) && (
                                      <span style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--colors-primary)',
                                        fontWeight: 600,
                                        flexShrink: 0,
                                      }}>
                                        {conv.score}점
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })}
              </div>
            );
          })}
        </div>

        {/* 대화 내용 뷰어 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedConv ? (
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
              <p>왼쪽에서 완료한 차시를 선택하면 대화 내용을 볼 수 있어요.</p>
              <p style={{ fontSize: '0.85rem' }}>
                완료한 차시는 <strong>✓</strong>로 표시됩니다.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: '680px' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  {selectedConv.assignment?.standards?.[1] || selectedConv.assignment?.title}
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {selectedConv.assignment?.subject} · {selectedConv.assignment?.grade} · {selectedConv.assignment?.standards?.[0]}
                </p>
                {Number.isFinite(selectedConv.score) && (
                  <span className="badge badge-score" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                    {selectedConv.score}
                    {Number.isFinite(getMaxScore(selectedConv.assignment?.scoreOptions))
                      ? `/${getMaxScore(selectedConv.assignment.scoreOptions)}`
                      : ''}점
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {(selectedConv.messages || []).map((msg, i) => (
                  <div key={i} className={`chat-bubble chat-bubble-${msg.role}`} style={{ maxWidth: '85%' }}>
                    {(msg.role === 'bot' || msg.role === 'unicorn') && (
                      <div className="chat-sender">오늘배움봇</div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  </div>
                ))}
              </div>

              {selectedConv.feedback && (
                <div className="score-feedback">
                  <strong>AI 피드백</strong> {selectedConv.feedback}
                </div>
              )}
              {selectedConv.higherScoreTip && (
                <div className="score-feedback" style={{ marginTop: '0.75rem' }}>
                  <strong>💡 다음에 해볼 것</strong> {selectedConv.higherScoreTip}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
