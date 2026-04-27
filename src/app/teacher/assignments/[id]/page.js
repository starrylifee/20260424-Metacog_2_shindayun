'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

import { formatStudentMessageByteRange, normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import { hasStudentStartedConversation } from '@/lib/conversationState';
import { auth } from '@/lib/firebase';
import {
  deleteAssignment,
  duplicateAssignment,
  getAssignmentById,
  getConversationsByAssignment,
  toggleAssignment,
} from '@/lib/firestore';
import {
  formatScoreOptions,
  getAssignmentMaxScore,
  getAssignmentScoreOptions,
  getScoringStyleLabel,
} from '@/lib/scoreConfig';

function canResetConversation(conversation) {
  return !conversation.approved;
}

function formatConversationScore(score) {
  return Number.isFinite(score) ? `${score}점` : '-';
}

export default function AssignmentDetail() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [user, setUser] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedConv, setSelectedConv] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const copyEntryCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const scoreOptions = useMemo(
    () => (assignment ? getAssignmentScoreOptions(assignment) : []),
    [assignment]
  );
  const scoreScaleLabel = useMemo(
    () => (scoreOptions.length > 0 ? formatScoreOptions(scoreOptions, ' / ') : ''),
    [scoreOptions]
  );
  const maxScore = useMemo(() => (assignment ? getAssignmentMaxScore(assignment) : null), [assignment]);
  const chatConstraints = useMemo(
    () => (assignment ? normalizeAssignmentConstraints(assignment) : null),
    [assignment]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.push('/teacher');
        return;
      }
      setUser(nextUser);
    });
    return () => unsubscribe();
  }, [router]);

  const loadData = async () => {
    if (!user || !id) return;

    setLoading(true);
    setLoadError('');

    try {
      const nextAssignment = await getAssignmentById(id);

      if (!nextAssignment || nextAssignment.teacherId !== user.uid) {
        setAssignment(null);
        setConversations([]);
        setSelectedConv(null);
        setLoadError('과제를 확인할 수 없습니다.');
        setLoading(false);
        router.push('/teacher');
        return;
      }

      setAssignment(nextAssignment);
    } catch (error) {
      console.error('Assignment load error:', error);
      setAssignment(null);
      setConversations([]);
      setSelectedConv(null);
      setLoadError(error instanceof Error ? error.message : '과제 정보를 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    try {
      const nextConversations = await getConversationsByAssignment(id);
      setConversations(nextConversations);

      if (selectedConv) {
        const refreshed = nextConversations.find((c) => c.id === selectedConv.id);
        setSelectedConv(refreshed || null);
      }
    } catch (error) {
      console.error('Conversation load error:', error);
      setConversations([]);
      setSelectedConv(null);
      setLoadError(
        error instanceof Error
          ? `과제는 불러왔지만 대화 목록은 가져오지 못했습니다. ${error.message}`
          : '과제는 불러왔지만 대화 목록은 가져오지 못했습니다.'
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [user, id]);

  const handleToggle = async () => {
    if (!assignment) return;
    try {
      await toggleAssignment(id, !assignment.isActive);
      setAssignment((prev) => ({ ...prev, isActive: !prev.isActive }));
    } catch (error) {
      console.error('Toggle assignment error:', error);
      alert('과제 상태를 변경하지 못했습니다.');
    }
  };

  const handleDeleteAssignment = async () => {
    if (!assignment) return;
    if (!confirm(`"${assignment.title}" 과제를 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.`)) return;

    setActionLoading('delete-assignment');
    try {
      await deleteAssignment(id);
      router.push('/teacher');
    } catch (error) {
      console.error('Delete assignment error:', error);
      alert('과제를 삭제하지 못했습니다.');
      setActionLoading(null);
    }
  };

  const handleDuplicateAssignment = async () => {
    if (!assignment) return;
    setActionLoading('duplicate-assignment');
    try {
      const duplicated = await duplicateAssignment(id);
      router.push(`/teacher/assignments/edit?id=${duplicated.id}`);
    } catch (error) {
      console.error('Duplicate assignment error:', error);
      alert('과제를 복사하지 못했습니다.');
      setActionLoading(null);
    }
  };

  const handleDeleteConversation = async (conversation) => {
    if (!canResetConversation(conversation)) {
      alert('Grownd 포인트가 이미 전송된 제출은 삭제할 수 없습니다.');
      return;
    }

    const label = conversation.studentName || `${conversation.studentCode}번`;
    if (!confirm(`${label} 학생 제출 기록을 삭제할까요?\n삭제 후 다시 입장하면 새 답변으로 시작합니다.`)) return;

    setActionLoading(conversation.id);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/conversations?id=${conversation.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.error || '삭제에 실패했습니다.');
      }

      setSelectedConv(null);
      await loadData();
    } catch (error) {
      console.error('Delete conversation error:', error);
      alert('삭제 중 오류가 발생했습니다.');
      await loadData();
    }

    setActionLoading(null);
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

  const getStatusLabel = (conversation) => {
    if (conversation.approved) {
      return { text: 'Grownd 전송 완료', className: 'badge-active' };
    }
    if (conversation.approvalStatus === 'failed') {
      return { text: 'Grownd 실패', className: 'badge-inactive' };
    }
    if (conversation.status === 'completed') {
      return { text: '완료', className: 'badge-active' };
    }
    return { text: '진행 중', className: 'badge-inactive' };
  };

  const avgScore = () => {
    const scored = conversations.filter((c) => Number.isFinite(c.score));
    if (scored.length === 0) return '-';
    const avg = scored.reduce((sum, c) => sum + c.score, 0) / scored.length;
    return avg.toFixed(1);
  };

  const canEditAssignment = !conversations.some(hasStudentStartedConversation);
  const growndFailedCount = conversations.filter(
    (c) => c.status === 'completed' && !c.approved && c.approvalStatus === 'failed'
  ).length;

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/teacher" className="navbar-brand">
            <span className="emoji">🤖</span> 오늘배움봇
          </Link>
          <Link href="/teacher" className="btn btn-ghost btn-sm">대시보드</Link>
        </nav>
        <div className="content-wrapper content-narrow">
          <div className="empty-state">
            <div className="empty-state-emoji">⚠️</div>
            <p className="empty-state-text">{loadError || '과제 정보를 불러오지 못했습니다.'}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={loadData}>다시 불러오기</button>
              <Link href="/teacher" className="btn btn-primary">대시보드로</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/teacher" className="navbar-brand">
          <span className="emoji">🤖</span> 오늘배움봇
        </Link>
        <Link href="/teacher" className="btn btn-ghost btn-sm">대시보드</Link>
      </nav>

      <div className="content-wrapper">
        {loadError && (
          <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(251,113,133,0.35)', background: 'rgba(251,113,133,0.08)' }}>
            <p style={{ marginBottom: '0.75rem' }}>{loadError}</p>
            <button className="btn btn-secondary btn-sm" onClick={loadData}>다시 불러오기</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <h1 className="heading-section" style={{ marginBottom: 0 }}>{assignment.title}</h1>
              <span className={`badge ${assignment.isActive ? 'badge-active' : 'badge-inactive'}`}>
                {assignment.isActive ? '활성' : '비활성'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {assignment.subject ? `${assignment.subject} · ` : ''}
              {assignment.grade ? `${assignment.grade} · ` : ''}
              입장코드: <strong style={{ color: 'var(--cyan-primary)', letterSpacing: '0.1em' }}>{assignment.entryCode}</strong>
            <button
              onClick={() => copyEntryCode(assignment.entryCode)}
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: '0.5rem', fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
            >
              {codeCopied ? '✓ 복사됨' : '📋 복사'}
            </button>
            </p>
            {scoreScaleLabel && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>점수 단계: {scoreScaleLabel}</p>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              채점 성향: {getScoringStyleLabel(assignment.scoringStyle)}
            </p>
            {chatConstraints && (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  대화 턴: 최소 {chatConstraints.minTurns}턴 후 채점 가능 · 최대 {chatConstraints.maxTurns}턴
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  학생 답변 길이: {formatStudentMessageByteRange(chatConstraints.minStudentMessageBytes, chatConstraints.maxStudentMessageBytes)}
                </p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDuplicateAssignment} disabled={actionLoading === 'duplicate-assignment'}>
              {actionLoading === 'duplicate-assignment' ? '복사 중...' : '과제 복사'}
            </button>
            {canEditAssignment ? (
              <Link href={`/teacher/assignments/edit?id=${assignment.id}`} className="btn btn-secondary btn-sm">과제 수정</Link>
            ) : (
              <button className="btn btn-secondary btn-sm" disabled title="학생이 시작한 뒤에는 수정할 수 없습니다.">수정 불가</button>
            )}
            <button className={`btn ${assignment.isActive ? 'btn-danger' : 'btn-secondary'} btn-sm`} onClick={handleToggle}>
              {assignment.isActive ? '비활성화' : '활성화'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDeleteAssignment} disabled={actionLoading === 'delete-assignment'}>
              {actionLoading === 'delete-assignment' ? '삭제 중...' : '과제 삭제'}
            </button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{conversations.length}</div>
            <div className="stat-label">전체 참여</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{conversations.filter((c) => c.status === 'completed').length}</div>
            <div className="stat-label">완료</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{conversations.filter((c) => c.approved).length}</div>
            <div className="stat-label">Grownd 전송</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: growndFailedCount > 0 ? 'var(--yellow-primary)' : undefined }}>
              {growndFailedCount}
            </div>
            <div className="stat-label">전송 실패</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{avgScore()}</div>
            <div className="stat-label">평균 점수{Number.isFinite(maxScore) ? ` / ${maxScore}` : ''}</div>
          </div>
        </div>

        {conversations.length > 0 && (
          <div className="card-glass" style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>📂 데이터 다운로드</h3>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>시작일</label>
                <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ maxWidth: '180px' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>종료일</label>
                <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ maxWidth: '180px' }} />
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const fromDate = dateFrom ? new Date(dateFrom) : null;
                  const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;

                  const filtered = conversations.filter((conv) => {
                    const startedAt = conv.startedAt
                      ? (conv.startedAt.toDate ? conv.startedAt.toDate() : new Date(conv.startedAt))
                      : null;
                    if (!startedAt) return !fromDate && !toDate;
                    if (fromDate && startedAt < fromDate) return false;
                    if (toDate && startedAt > toDate) return false;
                    return true;
                  });

                  if (filtered.length === 0) {
                    alert('해당 기간에 데이터가 없습니다.');
                    return;
                  }

                  const escapeCSV = (value) => {
                    const str = String(value ?? '');
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                      return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                  };

                  const headers = ['이름', '번호', '상태', '점수', '피드백', '다음단계팁', '시작시간', '완료시간', '대화내용'];

                  const rows = filtered.map((conv) => {
                    const startedAt = conv.startedAt
                      ? (conv.startedAt.toDate ? conv.startedAt.toDate() : new Date(conv.startedAt))
                      : null;
                    const completedAt = conv.completedAt
                      ? (conv.completedAt.toDate ? conv.completedAt.toDate() : new Date(conv.completedAt))
                      : null;

                    const chatLog = (conv.messages || [])
                      .map((m) => `[${(m.role === 'bot' || m.role === 'unicorn') ? '봇' : '학생'}] ${m.content}`)
                      .join('\n');

                    return [
                      conv.studentName || '',
                      conv.studentCode || '',
                      conv.status === 'completed' ? '완료' : '진행중',
                      conv.score ?? '',
                      conv.feedback ?? '',
                      conv.nextStepTip || conv.higherScoreTip || '',
                      startedAt ? startedAt.toLocaleString('ko-KR') : '',
                      completedAt ? completedAt.toLocaleString('ko-KR') : '',
                      chatLog,
                    ].map(escapeCSV).join(',');
                  });

                  const bom = '﻿';
                  const csvContent = bom + headers.join(',') + '\n' + rows.join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  const dateLabel = [dateFrom, dateTo].filter(Boolean).join('~') || 'all';
                  link.href = url;
                  link.download = `${assignment.title}_${dateLabel}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                📅 CSV 다운로드 {dateFrom || dateTo ? `(${conversations.filter((conv) => {
                  const startedAt = conv.startedAt ? (conv.startedAt.toDate ? conv.startedAt.toDate() : new Date(conv.startedAt)) : null;
                  if (!startedAt) return !dateFrom && !dateTo;
                  if (dateFrom && startedAt < new Date(dateFrom)) return false;
                  if (dateTo && startedAt > new Date(dateTo + 'T23:59:59')) return false;
                  return true;
                }).length}건)` : `(전체 ${conversations.length}건)`}
              </button>
            </div>
            <p className="form-hint">비워두면 전체 기간을 다운로드합니다. 학생별 대화 내용, 점수, 피드백이 모두 포함됩니다.</p>
          </div>
        )}

        <h2 className="heading-section">학생 결과</h2>

        {conversations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-emoji">📋</div>
            <p className="empty-state-text">아직 참여한 학생이 없습니다.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              학생에게 입장코드 <strong style={{ color: 'var(--cyan-primary)' }}>{assignment.entryCode}</strong>와 이름·비밀번호를 알려 주세요.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrapper" style={{ marginBottom: '2rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>상태</th>
                    <th>점수</th>
                    <th>시작 시간</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map((conversation) => {
                    const status = getStatusLabel(conversation);
                    const isSelected = selectedConv?.id === conversation.id;
                    const displayName = conversation.studentName || `${conversation.studentCode}번`;

                    return (
                      <tr key={conversation.id}>
                        <td>
                          <strong>{displayName}</strong>
                        </td>
                        <td>
                          <span className={`badge ${status.className}`}>{status.text}</span>
                        </td>
                        <td>{formatConversationScore(conversation.score)}</td>
                        <td className="card-meta">{formatDate(conversation.startedAt)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setSelectedConv(isSelected ? null : conversation)}
                            >
                              보기
                            </button>
                            {canResetConversation(conversation) && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteConversation(conversation)}
                                disabled={actionLoading === conversation.id}
                                title="삭제 (재참여 가능)"
                              >
                                {actionLoading === conversation.id ? '...' : '삭제'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedConv && (
              <div className="card-glass" style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>
                  {selectedConv.studentName || `${selectedConv.studentCode}번`} 대화 기록
                  {Number.isFinite(selectedConv.score) && (
                    <span className="badge badge-score" style={{ marginLeft: '0.75rem' }}>{selectedConv.score}점</span>
                  )}
                  {selectedConv.approved && (
                    <span className="badge badge-active" style={{ marginLeft: '0.5rem' }}>Grownd 전송 완료</span>
                  )}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(selectedConv.messages || []).map((message, index) => (
                    <div key={index} className={`chat-bubble chat-bubble-${message.role}`} style={{ maxWidth: '85%' }}>
                      {(message.role === 'bot' || message.role === 'unicorn') && <div className="chat-sender">오늘배움봇</div>}
                      <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                    </div>
                  ))}
                </div>

                {selectedConv.feedback && (
                  <div className="score-feedback" style={{ marginTop: '1rem' }}>
                    <strong>AI 피드백 ({selectedConv.score}점{Number.isFinite(maxScore) ? `/${maxScore}점` : ''})</strong> {selectedConv.feedback}
                  </div>
                )}

                {(selectedConv.nextStepTip || selectedConv.higherScoreTip) && (
                  <div className="score-feedback" style={{ marginTop: '0.75rem' }}>
                    <strong>💡 다음에 해볼 것</strong> {selectedConv.nextStepTip || selectedConv.higherScoreTip}
                  </div>
                )}

                {selectedConv.lastGrowndError?.message && !selectedConv.approved && (
                  <div className="score-feedback" style={{ marginTop: '1rem' }}>
                    <strong>Grownd 전송 실패</strong> {selectedConv.lastGrowndError.message}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
