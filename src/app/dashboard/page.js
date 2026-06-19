'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import BotAvatar from '@/components/BotAvatar';
import { stripMarkdown } from '@/lib/textUtils';
import {
  getMaxScore,
  groupBySubject,
  subjectRank,
  studentAnswerText,
} from '@/lib/studentPortfolio';

const SESSION_KEY = 'metacog_student';

export default function DashboardPage() {
  const router = useRouter();

  const [student, setStudent] = useState(null); // { name, password }
  const [data, setData] = useState(null); // 서버 응답
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true); // 세션 복원 중
  const [error, setError] = useState('');

  const [loginForm, setLoginForm] = useState({ name: '', password: '' });

  const [activeTab, setActiveTab] = useState('todo'); // 'todo' | 'mine'

  // 활동 코드로 새 작업 참여
  const [joinCode, setJoinCode] = useState('');

  // 다시 도전 / 도전하기 진행 표시 (과제 id)
  const [busyId, setBusyId] = useState(null);

  // 내 작업: 인라인으로 펼친 대화
  const [expandedConvId, setExpandedConvId] = useState(null);
  const [galleryCache, setGalleryCache] = useState({});

  const assignments = data?.assignments || [];
  const conversations = data?.conversations || [];

  // 활성 과제 빠른 조회 (다시도전 가능 여부 / entryCode / 명예의전당)
  const activeById = useMemo(() => {
    const map = {};
    for (const a of assignments) map[a.id] = a;
    return map;
  }, [assignments]);

  // 할 일 = 아직 참여하지 않은 우리 반 활성 과제
  const todoGrouped = useMemo(
    () => groupBySubject(assignments.filter((a) => !a.hasParticipated)),
    [assignments]
  );
  const todoCount = useMemo(
    () => assignments.filter((a) => !a.hasParticipated).length,
    [assignments]
  );

  // 내 작업 = 내가 참여한 모든 대화, 과목별로 묶고 최근순
  const mineGrouped = useMemo(() => {
    const groups = {};
    for (const conv of conversations) {
      const subject = conv.assignment?.subject?.trim() || '기타';
      (groups[subject] ||= []).push(conv);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => {
        const r = subjectRank(a) - subjectRank(b);
        return r !== 0 ? r : a.localeCompare(b, 'ko');
      })
      .map(([subject, items]) => {
        items.sort((x, y) => {
          const xt = x.completedAt?._seconds ?? x.completedAt?.seconds ?? 0;
          const yt = y.completedAt?._seconds ?? y.completedAt?.seconds ?? 0;
          return yt - xt;
        });
        return [subject, items];
      });
  }, [conversations]);

  // 데이터 적재 (로그인 / 세션 복원 공통)
  const loadDashboard = async (name, password, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/student/dashboard?name=${encodeURIComponent(name)}&password=${encodeURIComponent(password)}`
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.error || '학생 정보를 찾을 수 없습니다.');
        return false;
      }
      setData(json);
      setStudent({ name, password });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name, password }));
      // 첫 화면: 할 일이 있으면 할 일, 없으면 내 작업
      const hasTodo = (json.assignments || []).some((a) => !a.hasParticipated);
      setActiveTab(hasTodo ? 'todo' : 'mine');
      return true;
    } catch {
      setError('서버 연결에 실패했어요. 다시 시도해주세요.');
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // 세션 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.name && parsed?.password) {
          loadDashboard(parsed.name, parsed.password, { silent: true }).finally(() =>
            setBooting(false)
          );
          return;
        }
      }
    } catch {
      // ignore
    }
    setBooting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 펼친 대화가 활성 과제면 명예의 전당 지연 로드
  const expandedConv = useMemo(
    () => conversations.find((c) => c.id === expandedConvId) || null,
    [conversations, expandedConvId]
  );
  const expandedEntryCode = expandedConv
    ? activeById[expandedConv.assignment?.id]?.entryCode
    : null;

  useEffect(() => {
    if (!expandedEntryCode) return;
    if (galleryCache[expandedEntryCode] !== undefined) return;
    let cancelled = false;
    fetch(`/api/assignments/gallery?code=${expandedEntryCode}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setGalleryCache((p) => ({ ...p, [expandedEntryCode]: d.success ? d : { gallery: [] } }));
      })
      .catch(() => {
        if (!cancelled) setGalleryCache((p) => ({ ...p, [expandedEntryCode]: { gallery: [] } }));
      });
    return () => { cancelled = true; };
  }, [expandedEntryCode, galleryCache]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.name.trim() || !loginForm.password.trim()) {
      setError('이름과 비밀번호를 입력해주세요.');
      return;
    }
    await loadDashboard(loginForm.name.trim(), loginForm.password.trim());
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setStudent(null);
    setData(null);
    setExpandedConvId(null);
    setLoginForm({ name: '', password: '' });
  };

  // 채팅으로 핸드오프
  const goToChat = (entryCode) => {
    if (!student) return;
    sessionStorage.setItem(
      'metacog_auth',
      JSON.stringify({ name: student.name, password: student.password })
    );
    router.push(`/chat/${entryCode.toUpperCase()}`);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    goToChat(code);
  };

  // 과제 도전/다시도전 (참여 전이면 바로 시작, 참여 후면 현재 시도 초기화)
  const startChallenge = async (assignmentId, entryCode) => {
    if (!student || busyId) return;
    // 활성 과제이고 entryCode가 있으면 retry 엔드포인트(최고기록 보존)를 거친다
    setBusyId(assignmentId);
    try {
      const res = await fetch('/api/class/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId,
          studentName: student.name,
          studentPassword: student.password,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '지금은 참여할 수 없는 과제예요.');
        setBusyId(null);
        return;
      }
      goToChat(json.entryCode || entryCode);
    } catch {
      alert('서버 연결에 실패했어요.');
      setBusyId(null);
    }
  };

  // ---------- 부팅(세션 복원) 중 ----------
  if (booting) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p style={{ color: 'var(--text-secondary)' }}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  // ---------- 미로그인: 로그인 카드 ----------
  if (!student || !data) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <BotAvatar size={22} /> 오늘배움봇
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">← 돌아가기</Link>
        </nav>

        <div className="entry-container" style={{ paddingTop: '3rem' }}>
          <div className="entry-card">
            <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '0.5rem' }}>🎒</div>
            <h1 className="heading-hero" style={{ textAlign: 'center' }}>
              <span className="heading-gradient">내 학습 대시보드</span>
            </h1>
            <p className="subtitle" style={{ textAlign: 'center' }}>
              이름과 비밀번호로 로그인하면 우리 반 과제와 내 학습 기록을 한곳에서 볼 수 있어요.
            </p>

            <div className="card-glass">
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">🙋 이름</label>
                  <input
                    type="text"
                    className="form-input form-input-large"
                    placeholder="홍길동"
                    value={loginForm.name}
                    onChange={(e) => setLoginForm((p) => ({ ...p, name: e.target.value }))}
                    autoComplete="off"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">🔑 비밀번호</label>
                  <input
                    type="password"
                    className="form-input form-input-large"
                    placeholder="선생님이 알려주신 비밀번호"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
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
                  {loading ? '확인 중...' : '🎒 내 대시보드 열기'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 로그인 상태 ----------
  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <BotAvatar size={22} /> 오늘배움봇
        </Link>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', flex: 1, textAlign: 'center' }}>
          {data.className || '우리 학급'} · {data.studentName}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          로그아웃
        </button>
      </nav>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem 1rem 3rem', width: '100%' }}>
        {/* 활동 코드로 새 작업 참여 */}
        <div className="card-glass" style={{ marginTop: '0.5rem' }}>
          <form onSubmit={handleJoin} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
              📝 활동 코드
            </span>
            <input
              type="text"
              className="form-input form-input-code"
              placeholder="SUNNY42"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!joinCode.trim()}>
              참여하기
            </button>
          </form>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            className={`btn btn-sm ${activeTab === 'todo' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('todo')}
          >
            ✅ 할 일 {todoCount}
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'mine' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('mine')}
          >
            📚 내 작업 {conversations.length}
          </button>
        </div>

        {activeTab === 'todo' ? (
          <TodoList
            groups={todoGrouped}
            busyId={busyId}
            onChallenge={startChallenge}
          />
        ) : (
          <MineList
            groups={mineGrouped}
            activeById={activeById}
            expandedConvId={expandedConvId}
            setExpandedConvId={setExpandedConvId}
            galleryCache={galleryCache}
            busyId={busyId}
            onChallenge={startChallenge}
            studentName={data.studentName}
          />
        )}
      </div>
    </div>
  );
}

/* =========================== 할 일 =========================== */
function TodoList({ groups, busyId, onChallenge }) {
  if (groups.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', marginTop: '1rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
        <p style={{ margin: 0 }}>지금 할 일이 없어요. 우리 반 과제를 모두 참여했어요!</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {groups.map(([subject, items]) => (
        <div key={subject}>
          <div className="subject-header">⚡ {subject}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((a) => (
              <div key={a.id} className="card" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {a.title}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  👤 {a.participantCount}
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busyId === a.id}
                  onClick={() => onChallenge(a.id, a.entryCode)}
                  style={{ flexShrink: 0 }}
                >
                  {busyId === a.id ? '이동 중...' : '🚀 도전하기'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================== 내 작업 =========================== */
function MineList({
  groups, activeById, expandedConvId, setExpandedConvId, galleryCache, busyId, onChallenge, studentName,
}) {
  if (groups.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', marginTop: '1rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
        <p style={{ margin: 0 }}>아직 한 작업이 없어요. 위 활동 코드나 할 일에서 시작해 보세요!</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {groups.map(([subject, items]) => (
        <div key={subject}>
          <div className="subject-header">⚡ {subject}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((conv) => {
              const active = activeById[conv.assignment?.id];
              const isExpanded = expandedConvId === conv.id;
              const hasScore = Number.isFinite(conv.score);
              const inProgress = conv.status === 'in_progress' || !hasScore;
              return (
                <div key={conv.id} className="card" style={{ padding: '0.85rem 1.1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ flexShrink: 0, color: hasScore ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {hasScore ? '✓' : '·'}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 0 }}>
                      {conv.assignment?.standards?.[1] || conv.assignment?.title || '제목 없음'}
                    </span>
                    {hasScore ? (
                      <span className="badge badge-score" style={{ flexShrink: 0 }}>
                        {conv.score}
                        {Number.isFinite(getMaxScore(conv.assignment?.scoreOptions))
                          ? `/${getMaxScore(conv.assignment.scoreOptions)}`
                          : ''}점
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>진행 중</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    {active && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === active.id}
                        onClick={() => onChallenge(active.id, active.entryCode)}
                      >
                        {busyId === active.id ? '이동 중...' : (inProgress ? '✏️ 이어하기' : '✏️ 다시 도전')}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpandedConvId(isExpanded ? null : conv.id)}
                    >
                      💬 대화 {isExpanded ? '닫기 ▴' : '보기 ▾'}
                    </button>
                  </div>

                  {isExpanded && (
                    <ConvDetail
                      conv={conv}
                      gallery={active ? galleryCache[active.entryCode] : null}
                      studentName={studentName}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConvDetail({ conv, gallery, studentName }) {
  return (
    <div style={{ marginTop: '0.9rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.9rem' }}>
      {/* 대화 내용 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
        {(conv.messages || []).length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            {studentAnswerText(conv) || '(아직 작성한 대화가 없어요)'}
          </p>
        ) : (
          conv.messages.map((msg, i) => (
            <div key={i} className={`chat-bubble chat-bubble-${msg.role}`} style={{ maxWidth: '90%' }}>
              {(msg.role === 'bot' || msg.role === 'unicorn') && (
                <div className="chat-sender">오늘배움봇</div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))
        )}
      </div>

      {conv.feedback && (
        <div className="score-feedback">
          <strong>AI 피드백</strong> {stripMarkdown(conv.feedback)}
        </div>
      )}
      {conv.higherScoreTip && (
        <div className="score-feedback" style={{ marginTop: '0.5rem' }}>
          <strong>💡 다음에 해볼 것</strong> {stripMarkdown(conv.higherScoreTip)}
        </div>
      )}

      {/* AI 모범답안 */}
      {gallery?.showExampleAnswers && gallery?.aiExampleAnswer && (
        <div style={{ marginTop: '0.9rem' }}>
          <div className="detail-label">🤖 AI 모범답안</div>
          <div className="card" style={{
            padding: '1rem',
            border: '1.5px solid rgba(251, 191, 36, 0.45)',
            background: 'rgba(251, 191, 36, 0.06)',
          }}>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0, wordBreak: 'keep-all' }}>
              {gallery.aiExampleAnswer}
            </p>
          </div>
        </div>
      )}

      {/* 명예의 전당 */}
      {gallery && (gallery.gallery || []).length > 0 && (
        <div style={{ marginTop: '0.9rem' }}>
          <div className="detail-label">🏆 명예의 전당</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {gallery.gallery.map((item, i) => (
              <div key={item.conversationId || i} className="card" style={{ padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{item.studentName}
                  </span>
                  <span className="badge badge-score">
                    {item.score}{Number.isFinite(item.maxScore) ? `/${item.maxScore}` : ''}점
                  </span>
                </div>
                <p style={{
                  fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)',
                  margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                }}>
                  {stripMarkdown(item.lastMessage)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
