'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import BotAvatar from '@/components/BotAvatar';
import { stripMarkdown } from '@/lib/textUtils';
import {
  buildTree,
  getMaxScore,
  groupBySubject,
  studentAnswerText,
} from '@/lib/studentPortfolio';

import mathLessonPlanData from '@/data/mathLessonPlans.json';
import socialLessonPlanData from '@/data/socialLessonPlans.json';
import koreanLessonPlanData from '@/data/koreanLessonPlans.json';

const SUBJECT_PLANS = {
  수학: mathLessonPlanData,
  사회: socialLessonPlanData,
  국어: koreanLessonPlanData,
};

const SESSION_KEY = 'metacog_student';

export default function DashboardPage() {
  const router = useRouter();

  const [student, setStudent] = useState(null); // { name, password }
  const [data, setData] = useState(null); // 서버 응답
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true); // 세션 복원 중
  const [error, setError] = useState('');

  const [loginForm, setLoginForm] = useState({ name: '', password: '' });

  const [activeTab, setActiveTab] = useState('class'); // 'class' | 'history'

  // 새 과제 코드로 참여
  const [joinCode, setJoinCode] = useState('');

  // --- 우리 반 과제 탭 상태 ---
  const [openSubjects, setOpenSubjects] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [galleryCache, setGalleryCache] = useState({});
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // --- 내 학습 기록 탭 상태 ---
  const [selectedConv, setSelectedConv] = useState(null);
  const [openNodes, setOpenNodes] = useState({});

  const assignments = data?.assignments || [];
  const conversations = data?.conversations || [];

  const grouped = useMemo(() => groupBySubject(assignments), [assignments]);
  const convTree = useMemo(
    () => (conversations.length ? buildTree(conversations) : null),
    [conversations]
  );
  const myConvByAssignment = useMemo(() => {
    const map = {};
    for (const conv of conversations) {
      if (conv.assignment?.id) map[conv.assignment.id] = conv;
    }
    return map;
  }, [conversations]);

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === selectedId) || null,
    [assignments, selectedId]
  );
  const myConv = selectedAssignment ? myConvByAssignment[selectedAssignment.id] : null;

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
      // 모든 과목 펼친 상태로 시작
      const open = {};
      for (const a of json.assignments || []) {
        open[a.subject?.trim() || '기타'] = true;
      }
      setOpenSubjects(open);
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

  // 선택한 과제의 명예의 전당 지연 로드
  useEffect(() => {
    if (!selectedAssignment?.entryCode) return;
    const entryCode = selectedAssignment.entryCode;
    if (galleryCache[entryCode] !== undefined) return;

    setGalleryLoading(true);
    fetch(`/api/assignments/gallery?code=${entryCode}`)
      .then((r) => r.json())
      .then((d) => {
        setGalleryCache((prev) => ({ ...prev, [entryCode]: d.success ? d : { gallery: [] } }));
      })
      .catch(() => {
        setGalleryCache((prev) => ({ ...prev, [entryCode]: { gallery: [] } }));
      })
      .finally(() => setGalleryLoading(false));
  }, [selectedAssignment, galleryCache]);

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
    setSelectedId(null);
    setSelectedConv(null);
    setLoginForm({ name: '', password: '' });
  };

  // 새 과제 코드로 참여 / 미참여 과제 도전 → 채팅으로 핸드오프
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
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '다시 도전할 수 없습니다.');
        setRetrying(false);
        return;
      }
      goToChat(json.entryCode);
    } catch {
      alert('서버 연결에 실패했어요.');
      setRetrying(false);
    }
  };

  const toggleSubject = (subject) =>
    setOpenSubjects((prev) => ({ ...prev, [subject]: !prev[subject] }));
  const toggleNode = (key) => setOpenNodes((prev) => ({ ...prev, [key]: !prev[key] }));
  const isOpen = (key) => Boolean(openNodes[key]);

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
  const gallery = selectedAssignment ? galleryCache[selectedAssignment.entryCode] : null;

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

      {/* 새 과제 코드로 참여 */}
      <div style={{
        maxWidth: '720px',
        margin: '1rem auto 0',
        padding: '0 1rem',
      }}>
        <form onSubmit={handleJoin} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
            📝 새 과제 참여
          </span>
          <input
            type="text"
            className="form-input form-input-code"
            placeholder="입장 코드"
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
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        maxWidth: '720px',
        margin: '1rem auto 0',
        padding: '0 1rem',
      }}>
        <button
          className={`btn btn-sm ${activeTab === 'class' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('class')}
        >
          🏫 우리 반 과제
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('history')}
        >
          📚 내 학습 기록
        </button>
      </div>

      {activeTab === 'class' ? (
        <ClassTab
          grouped={grouped}
          assignments={assignments}
          openSubjects={openSubjects}
          toggleSubject={toggleSubject}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selectedAssignment={selectedAssignment}
          myConv={myConv}
          studentName={data.studentName}
          gallery={gallery}
          galleryLoading={galleryLoading}
          retrying={retrying}
          handleRetry={handleRetry}
        />
      ) : (
        <HistoryTab
          convTree={convTree}
          selectedConv={selectedConv}
          setSelectedConv={setSelectedConv}
          openNodes={openNodes}
          toggleNode={toggleNode}
          isOpen={isOpen}
        />
      )}
    </div>
  );
}

/* =========================== 우리 반 과제 탭 =========================== */
function ClassTab({
  grouped, assignments, openSubjects, toggleSubject,
  selectedId, setSelectedId, selectedAssignment, myConv, studentName,
  gallery, galleryLoading, retrying, handleRetry,
}) {
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', overflow: 'hidden', marginTop: '1rem' }}>
      {/* 사이드바: 과목별 과제 */}
      <div style={{
        width: '280px', minWidth: '240px',
        borderRight: '1px solid var(--border-color)',
        overflowY: 'auto', padding: '1rem 0',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <div style={{ padding: '0 1rem 0.75rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
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
                  width: '100%', textAlign: 'left', padding: '0.5rem 1rem',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
                      width: '100%', textAlign: 'left', padding: '0.4rem 1rem 0.4rem 2rem',
                      background: isSelected ? 'rgba(0,102,204,0.10)' : 'none',
                      border: 'none',
                      borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                      cursor: 'pointer', fontSize: '0.85rem',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.hasParticipated ? '✓ ' : ''}{a.title}
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--text-muted)', gap: '0.75rem',
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
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem',
              }}>
                🙋 내 답변
              </div>
              {myConv ? (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {studentName}
                      {myConv.approved && (
                        <span style={{ marginLeft: '0.5rem', color: 'var(--primary)' }}>🪙 포인트 지급됨</span>
                      )}
                    </span>
                    {Number.isFinite(myConv.score) && (
                      <span className="badge badge-score">최고 {myConv.score}점</span>
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
                  <button onClick={handleRetry} disabled={retrying} className="btn btn-primary btn-sm" style={{ marginTop: '0.9rem' }}>
                    {retrying ? '이동 중...' : '✏️ 다시 도전하기'}
                  </button>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.6rem', marginBottom: 0 }}>
                    점수가 오르면 오른 만큼만 포인트가 추가로 지급돼요. 점수가 내려가도 최고 기록은 그대로예요.
                  </p>
                </div>
              ) : (
                <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.9rem' }}>
                    아직 이 프로젝트에 참여하지 않았어요.
                  </p>
                  <button onClick={handleRetry} disabled={retrying} className="btn btn-primary btn-sm">
                    {retrying ? '이동 중...' : '🚀 지금 도전하기'}
                  </button>
                </div>
              )}
            </div>

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
                  <p style={{ fontSize: '0.93rem', lineHeight: 1.65, color: 'var(--text-secondary)', margin: 0, wordBreak: 'keep-all' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
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
  );
}

/* =========================== 내 학습 기록 탭 =========================== */
function HistoryTab({ convTree, selectedConv, setSelectedConv, openNodes, toggleNode, isOpen }) {
  const subjects = Object.keys(SUBJECT_PLANS);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', overflow: 'hidden', marginTop: '1rem' }}>
      {/* 사이드바: 교육과정 트리 */}
      <div style={{
        width: '280px', minWidth: '240px',
        borderRight: '1px solid var(--border-color)',
        overflowY: 'auto', padding: '1rem 0',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        {subjects.map((subject) => {
          const planData = SUBJECT_PLANS[subject];
          const grades = Object.keys(planData.grades || {}).sort();

          return (
            <div key={subject}>
              <button
                onClick={() => toggleNode(`sub_${subject}`)}
                style={{
                  width: '100%', textAlign: 'left', padding: '0.5rem 1rem',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
                          width: '100%', textAlign: 'left', padding: '0.4rem 1.5rem',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
                                width: '100%', textAlign: 'left', padding: '0.35rem 2rem',
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
                                    width: '100%', textAlign: 'left', padding: '0.3rem 2.5rem',
                                    background: isSelected ? 'rgba(0,102,204,0.08)' : 'none',
                                    border: 'none',
                                    borderLeft: isSelected ? '3px solid var(--colors-primary)' : '3px solid transparent',
                                    cursor: conv ? 'pointer' : 'default',
                                    fontSize: '0.8rem',
                                    color: isDone ? 'var(--text-primary)' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                  }}
                                >
                                  <span style={{ fontSize: '0.7rem' }}>{isDone ? '✓' : '·'}</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {lesson}
                                  </span>
                                  {isDone && Number.isFinite(conv.score) && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--colors-primary)', fontWeight: 600, flexShrink: 0 }}>
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--text-muted)', gap: '0.75rem',
          }}>
            <div style={{ fontSize: '3rem' }}>👈</div>
            <p>왼쪽에서 완료한 차시를 선택하면 대화 내용을 볼 수 있어요.</p>
            <p style={{ fontSize: '0.85rem' }}>완료한 차시는 <strong>✓</strong>로 표시됩니다.</p>
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
  );
}
