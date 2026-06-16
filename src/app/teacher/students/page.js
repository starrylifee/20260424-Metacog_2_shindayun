'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '@/lib/firebase';
import BotAvatar from '@/components/BotAvatar';
import { stripMarkdown } from '@/lib/textUtils';

export default function TeacherStudents() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [convLoading, setConvLoading] = useState(false);
  const [expandedConvIds, setExpandedConvIds] = useState(new Set());

  // 보관함 및 읽기 전용 선택 관련 상태
  const [selectedReportId, setSelectedReportId] = useState('');

  // 일괄 분석 & 보관함 관련 상태
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [viewingReport, setViewingReport] = useState(null);

  // 일괄 분석 설정 관련 상태
  const [analysisMode, setAnalysisMode] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('3');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all'); // 'all' = 전체 과목 통합

  // 보관함 과목 필터 ('all' = 전체)
  const [boardSubjectFilter, setBoardSubjectFilter] = useState('all');

  const getResolvedPeriod = (mode, month, customStart, customEnd) => {
    let start = null;
    let end = null;
    let label = '전체 기간';

    if (mode === 'relative-2w') {
      start = 'relative-2w';
      end = 'relative-2w';
      label = '초기 2주간';
    } else if (mode === 'relative-1m') {
      start = 'relative-1m';
      end = 'relative-1m';
      label = '초기 1개월간';
    } else if (mode === 'monthly') {
      const m = parseInt(month, 10);
      const year = 2026;
      const endObj = new Date(year, m, 0);
      const pad = (n) => String(n).padStart(2, '0');
      start = `${year}-${pad(m)}-01`;
      end = `${year}-${pad(m)}-${pad(endObj.getDate())}`;
      label = `${m}월 단일`;
    } else if (mode === 'custom') {
      start = customStart || null;
      end = customEnd || null;
      label = `${customStart || '시작일 지정 없음'} ~ ${customEnd || '종료일 지정 없음'}`;
    }

    return { start, end, label };
  };

  const studentReports = useMemo(() => {
    if (!selectedStudent) return [];
    return reports.filter((r) => r.studentName === selectedStudent.name);
  }, [reports, selectedStudent]);

  useEffect(() => {
    if (selectedStudent && studentReports.length > 0) {
      setSelectedReportId(studentReports[0].id);
    } else {
      setSelectedReportId('');
    }
  }, [selectedStudent, studentReports]);

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

  const loadReports = async (currentUser) => {
    if (!currentUser) return;
    setReportsLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch('/api/teacher/students/reports', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
    setReportsLoading(false);
  };

  useEffect(() => {
    if (!user) return;

    async function loadInitialData() {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/teacher/students', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await res.json();
        if (data.success) {
          setStudents(data.students || []);
          setSubjects(data.subjects || []);
        }
        await loadReports(user);
      } catch (error) {
        console.error('Failed to load students:', error);
      }
      setLoading(false);
    }

    void loadInitialData();
  }, [user]);

  const handleSelectStudent = async (student) => {
    setSelectedStudent(student);
    setConversations([]);
    setExpandedConvIds(new Set());
    
    setConvLoading(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/teacher/students?student=${encodeURIComponent(student.name)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }
      );
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load student conversations:', error);
    }

    setConvLoading(false);
  };

  const toggleConv = (convId) => {
    setExpandedConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        next.add(convId);
      }
      return next;
    });
  };

  const toggleAllConvs = () => {
    if (expandedConvIds.size === conversations.length) {
      setExpandedConvIds(new Set());
    } else {
      setExpandedConvIds(new Set(conversations.map((c) => c.id)));
    }
  };

  // 날짜 기준 필터링된 대화
  const filteredConversations = useMemo(() => {
    return conversations;
  }, [conversations]);

  // 점수 추이 계산
  const scoreTrend = useMemo(() => {
    const completed = filteredConversations
      .filter((c) => c.status === 'completed' && Number.isFinite(c.score))
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    return completed.map((c) => ({
      title: c.assignment?.title || '(과제)',
      score: c.score,
      maxScore: c.assignment?.scoreOptions
        ? Math.max(...c.assignment.scoreOptions)
        : null,
      date: c.startedAt,
    }));
  }, [filteredConversations]);

  // 보고서 삭제 요청
  const handleDeleteReport = async (reportId) => {
    if (!confirm('이 AI 분석 리포트를 정말로 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.')) {
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/students/reports?id=${encodeURIComponent(reportId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert('리포트가 성공적으로 삭제되었습니다.');
        setViewingReport(null);
        await loadReports(user);
      } else {
        alert(data.error || '리포트 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Delete report error:', error);
      alert('리포트 삭제 중 오류가 발생했습니다.');
    }
  };

  // 보관함 과목 필터 + 정렬 (과목 → 학생 → 최신순)
  const boardReports = useMemo(() => {
    const filtered =
      boardSubjectFilter === 'all'
        ? reports
        : boardSubjectFilter === '__merged__'
        ? reports.filter((r) => !r.subject)
        : reports.filter((r) => r.subject === boardSubjectFilter);
    return [...filtered].sort((a, b) => {
      const sa = a.subject || '';
      const sb = b.subject || '';
      if (sa !== sb) return sa.localeCompare(sb, 'ko');
      if (a.studentName !== b.studentName) return a.studentName.localeCompare(b.studentName, 'ko');
      return new Date(b.generatedAt) - new Date(a.generatedAt);
    });
  }, [reports, boardSubjectFilter]);

  // 리포트를 .doc(워드) 파일로 다운로드
  const handleDownloadDoc = (reportItem) => {
    const subjLabel = reportItem.subjectLabel || reportItem.subject || '전체 과목';
    const periodLabel = reportItem.periodLabel || '전체 기간';
    const generatedAt = new Date(reportItem.generatedAt).toLocaleString('ko-KR');
    const body = stripMarkdown(reportItem.report || '');

    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(reportItem.studentName)} AI 분석 리포트</title></head>
<body style="font-family:'맑은 고딕','Malgun Gothic',sans-serif; font-size:11pt; line-height:1.7; color:#222;">
<h1 style="font-size:18pt; color:#024ada; margin-bottom:4pt;">${esc(reportItem.studentName)} · AI 학생 분석 리포트</h1>
<table style="font-size:10pt; color:#555; border-collapse:collapse; margin-bottom:14pt;">
<tr><td style="padding:2pt 12pt 2pt 0;"><b>과목 범위</b></td><td>${esc(subjLabel)}</td></tr>
<tr><td style="padding:2pt 12pt 2pt 0;"><b>분석 기준</b></td><td>${esc(periodLabel)}</td></tr>
<tr><td style="padding:2pt 12pt 2pt 0;"><b>참여 대화</b></td><td>${reportItem.conversationCount ?? '-'}개 (완료 ${reportItem.completedCount ?? '-'}개)</td></tr>
<tr><td style="padding:2pt 12pt 2pt 0;"><b>평균 점수</b></td><td>${reportItem.avgScore != null ? `${reportItem.avgScore}점` : '-'}</td></tr>
<tr><td style="padding:2pt 12pt 2pt 0;"><b>생성 일시</b></td><td>${esc(generatedAt)}</td></tr>
</table>
<hr style="border:none; border-top:1px solid #ccc; margin-bottom:12pt;">
<div style="white-space:pre-wrap;">${esc(body)}</div>
</body></html>`;

    const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_');
    a.href = url;
    a.download = `${safe(reportItem.studentName)}_${safe(subjLabel)}_${safe(periodLabel)}_AI분석.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 일괄 AI 분석 요청
  const handleBulkAnalyze = async () => {
    const studentsToAnalyze = students.filter((s) => s.conversationCount > 0);
    if (studentsToAnalyze.length === 0) {
      alert('분석할 대화 기록이 있는 학생이 없습니다.');
      return;
    }

    const { start: resolvedStart, end: resolvedEnd, label: periodLabel } = getResolvedPeriod(
      analysisMode,
      selectedMonth,
      customStartDate,
      customEndDate
    );

    const resolvedSubject = selectedSubject === 'all' ? null : selectedSubject;
    const subjectLabel = resolvedSubject || '전체 과목';

    // 동적 기간(전체 기간·초기 2주·초기 1개월)은 시간이 지나면 데이터가 달라지므로 재생성(갱신) 허용.
    // 고정 기간(특정 월·직접 설정)만 동일 보고서 재생성 시 덮어쓰기 확인.
    const isDynamicPeriod = ['all', 'relative-2w', 'relative-1m'].includes(analysisMode);

    // 같은 과목·기간 기준으로 이미 생성된 보고서 (학생 단위로 존재 여부 판단)
    const existingForScope = reports.filter(
      (r) =>
        r.startDate === resolvedStart &&
        r.endDate === resolvedEnd &&
        (r.subject || null) === resolvedSubject
    );

    let confirmMsg = `[${subjectLabel} · ${periodLabel}] 구간의 대화 기록이 있는 ${studentsToAnalyze.length}명의 학생을 일괄 AI 분석하시겠습니까?`;
    if (existingForScope.length > 0) {
      confirmMsg = isDynamicPeriod
        ? `이 기준(${subjectLabel} · ${periodLabel})으로 이미 생성된 보고서 ${existingForScope.length}건이 있습니다.\n그동안 쌓인 최신 대화까지 반영해 다시 생성(덮어쓰기)할까요?\n대상: ${studentsToAnalyze.length}명`
        : `이 기준(${subjectLabel} · ${periodLabel})으로 이미 생성된 보고서 ${existingForScope.length}건이 있습니다.\n다시 생성하면 기존 보고서를 덮어씁니다. 계속할까요?\n대상: ${studentsToAnalyze.length}명`;
    }

    if (!confirm(confirmMsg)) {
      return;
    }

    setBulkLoading(true);
    setBulkProgress({ current: 0, total: studentsToAnalyze.length, currentName: '' });

    try {
      const token = await user.getIdToken();
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < studentsToAnalyze.length; i++) {
        const student = studentsToAnalyze[i];
        setBulkProgress({ current: i, total: studentsToAnalyze.length, currentName: student.name });

        try {
          const res = await fetch('/api/teacher/students/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              studentName: student.name,
              analysisMode,
              startDate: resolvedStart,
              endDate: resolvedEnd,
              periodLabel,
              subject: resolvedSubject,
            }),
          });
          const data = await res.json();
          if (data.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`Failed to analyze ${student.name}:`, data.error);
          }
        } catch (err) {
          failCount++;
          console.error(`Error analyzing ${student.name}:`, err);
        }
      }

      setBulkProgress({ current: studentsToAnalyze.length, total: studentsToAnalyze.length, currentName: '완료!' });
      alert(`일괄 AI 분석 완료!\n성공: ${successCount}명 / 실패: ${failCount}명`);
      await loadReports(user);
    } catch (error) {
      console.error('Bulk analysis failed:', error);
      alert('일괄 분석 처리 중 오류가 발생했습니다.');
    }

    setBulkLoading(false);
  };

  // 빠른 날짜 프리셋
  const getDatePreset = (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const getStatusBadge = (conv) => {
    if (conv.status === 'completed') {
      return { text: '완료', className: 'badge-active' };
    }
    return { text: '진행 중', className: 'badge-inactive' };
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

      <div className="content-wrapper">
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="heading-section">👩‍🎓 학생별 답변 · 🧠 AI 분석 리포트</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            아래에서 AI 분석 리포트를 과목·기간별로 생성·보관하고, 학생을 선택하면 과제별 대화 기록까지 함께 볼 수 있습니다.
          </p>
        </div>

        {loading ? (
          <div className="loading-container" style={{ minHeight: '30vh' }}>
            <div className="loading-spinner" />
          </div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-emoji">📋</div>
            <p className="empty-state-text">아직 참여한 학생이 없습니다.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              과제를 만들고 학생들이 참여하면 여기에 나타납니다.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '1.5rem', minHeight: 'calc(100vh - 200px)' }}>
            {/* 학생 목록 사이드바 */}
            <div style={{
              width: '260px',
              minWidth: '220px',
              flexShrink: 0,
              borderRight: '1px solid var(--border-color)',
              paddingRight: '1rem',
              overflowY: 'auto',
            }}>
              <p style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                전체 학생 ({students.length}명)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {students.map((student) => {
                  const isSelected = selectedStudent?.name === student.name;
                  return (
                    <button
                      key={`${student.name}-${student.studentCode}`}
                      onClick={() => handleSelectStudent(student)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: isSelected ? 'rgba(0, 102, 204, 0.1)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span style={{
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '0.9rem',
                        }}>
                          {student.name}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}>
                          {student.completedCount}/{student.conversationCount}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 대화 기록 메인 영역 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!selectedStudent ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📊 AI 학생 분석 리포트 보관함
                      </h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        학생들의 전체 과제 참여 기록을 바탕으로 생성된 AI 리포트를 보관하고 일괄 관리합니다.
                      </p>
                    </div>
                  </div>
                  
                  {/* 일괄 제어판 */}
                  <div className="card-glass" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid rgba(2, 74, 218, 0.15)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      🧠 AI 일괄 분석 설정
                    </h3>
                    
                    {/* 분석 방식 선택 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.5rem' }}>분석 방식:</span>
                        {[
                          { id: 'all', label: '전체 기간' },
                          { id: 'relative-2w', label: '초기 2주간' },
                          { id: 'relative-1m', label: '초기 1개월간' },
                          { id: 'monthly', label: '특정 월 단일 분석' },
                          { id: 'custom', label: '직접 기간 설정' },
                        ].map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            className={`btn btn-sm ${analysisMode === mode.id ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setAnalysisMode(mode.id)}
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>

                      {/* 과목 범위 선택 */}
                      {subjects.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.5rem' }}>과목 범위:</span>
                          <button
                            type="button"
                            className={`btn btn-sm ${selectedSubject === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSelectedSubject('all')}
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          >
                            전체 과목 통합
                          </button>
                          {subjects.map((subj) => (
                            <button
                              key={subj}
                              type="button"
                              className={`btn btn-sm ${selectedSubject === subj ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setSelectedSubject(subj)}
                              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                            >
                              {subj}
                            </button>
                          ))}
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexBasis: '100%' }}>
                            * &lsquo;전체 과목 통합&rsquo;은 모든 과목을 한 보고서로, 특정 과목 선택 시 해당 과목만 따로 분석합니다.
                          </span>
                        </div>
                      )}

                      {/* 분석 방식 세부 조건 */}
                      {analysisMode === 'monthly' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          background: 'rgba(2, 74, 218, 0.03)',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(2, 74, 218, 0.08)',
                        }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>대상 월 선택:</span>
                          <select
                            className="form-input"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{ maxWidth: '120px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                          >
                            {[3, 4, 5, 6, 7].map((m) => (
                              <option key={m} value={m}>{m}월</option>
                            ))}
                          </select>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            * 해당 월에 진행된 대화 기록만 모아서 독립적인 보고서를 작성합니다. (비누적)
                          </span>
                        </div>
                      )}

                      {analysisMode === 'custom' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          background: 'rgba(2, 74, 218, 0.03)',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(2, 74, 218, 0.08)',
                          flexWrap: 'wrap',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>시작일:</span>
                            <input
                              type="date"
                              className="form-input"
                              value={customStartDate}
                              onChange={(e) => setCustomStartDate(e.target.value)}
                              style={{ maxWidth: '140px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>종료일:</span>
                            <input
                              type="date"
                              className="form-input"
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              style={{ maxWidth: '140px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                            />
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            * 시작일과 종료일을 지정하여 해당 기간에 진행된 대화만 분석합니다.
                          </span>
                        </div>
                      )}

                      {analysisMode === 'relative-2w' && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(168, 85, 247, 0.03)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(168, 85, 247, 0.1)' }}>
                          💡 <strong>학생별 첫 활동 시작일로부터 2주간</strong>의 대화 기록을 필터링하여 보고서를 작성합니다. 학생마다 활동 시작일이 달라도 자동으로 맞춤 분석합니다.
                        </div>
                      )}

                      {analysisMode === 'relative-1m' && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(168, 85, 247, 0.03)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(168, 85, 247, 0.1)' }}>
                          💡 <strong>학생별 첫 활동 시작일로부터 1개월간</strong>의 대화 기록을 필터링하여 보고서를 작성합니다. 학생마다 활동 시작일이 달라도 자동으로 맞춤 분석합니다.
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                          className="btn btn-primary"
                          onClick={handleBulkAnalyze}
                          disabled={bulkLoading}
                          style={{ padding: '0.5rem 1.2rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                        >
                          {bulkLoading ? '일괄 분석 중...' : <><BotAvatar size={16} /> 전체 학생 AI 일괄 분석 실행</>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 일괄 분석 진행 중 상태 */}
                  {bulkLoading && (
                    <div className="card-glass" style={{
                      padding: '1.25rem',
                      marginBottom: '1.5rem',
                      border: '1px solid var(--primary)',
                      boxShadow: 'var(--shadow-primary)',
                      background: 'rgba(2, 74, 218, 0.02)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="loading-spinner" style={{ width: '14px', height: '14px', border: '2px solid var(--primary)', borderTopColor: 'transparent', display: 'inline-block' }} /> 
                          전체 학생 일괄 AI 분석 보고서 생성 중...
                        </h4>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                          {bulkProgress.current} / {bulkProgress.total} 명 완료
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'var(--border)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{
                          width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(to right, var(--primary), var(--primary-bright))',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        현재 진행: {bulkProgress.currentName ? <strong>'{bulkProgress.currentName}' 학생 분석 중</strong> : '분석 준비 중...'}
                      </p>
                    </div>
                  )}

                  {/* 보관함 목록 */}
                  <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                        📁 보관된 AI 분석 리포트 목록 ({boardReports.length}건)
                      </h3>
                      {subjects.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>과목 필터:</span>
                          <select
                            className="form-input"
                            value={boardSubjectFilter}
                            onChange={(e) => setBoardSubjectFilter(e.target.value)}
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.82rem', maxWidth: '160px' }}
                          >
                            <option value="all">전체 보기</option>
                            <option value="__merged__">전체 과목 통합</option>
                            {subjects.map((subj) => (
                              <option key={subj} value={subj}>{subj}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {reportsLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                        <div className="loading-spinner" />
                      </div>
                    ) : boardReports.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📁</div>
                        {reports.length === 0 ? (
                          <>
                            <p style={{ fontSize: '0.9rem' }}>아직 보관된 AI 분석 리포트가 없습니다.</p>
                            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                              상단 버튼을 눌러 전체 학생 일괄 분석을 실행해 보세요.
                            </p>
                          </>
                        ) : (
                          <p style={{ fontSize: '0.9rem' }}>선택한 과목 필터에 해당하는 리포트가 없습니다.</p>
                        )}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>학생 이름</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>과목</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>기준 구분</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>참여 대화</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>완료된 대화</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>평균 점수</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>생성 일시</th>
                              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>관리</th>
                            </tr>
                          </thead>
                          <tbody>
                            {boardReports.map((reportItem) => (
                              <tr key={reportItem.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                                <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600 }}>{reportItem.studentName}</td>
                                <td style={{ padding: '0.85rem 0.5rem' }}>
                                  <span className="badge" style={{ fontSize: '0.75rem', background: reportItem.subject ? 'rgba(2, 74, 218, 0.08)' : 'rgba(0,0,0,0.04)', color: reportItem.subject ? 'var(--primary)' : 'var(--text-muted)' }}>
                                    {reportItem.subjectLabel || reportItem.subject || '전체 과목'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.85rem 0.5rem' }}>
                                  <span className={`badge ${reportItem.periodLabel && reportItem.periodLabel !== '전체 기간' ? 'badge-inactive' : 'badge-active'}`} style={{ fontSize: '0.75rem' }}>
                                    {reportItem.periodLabel || '전체 기간'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.85rem 0.5rem' }}>{reportItem.conversationCount}개</td>
                                <td style={{ padding: '0.85rem 0.5rem' }}>{reportItem.completedCount}개</td>
                                <td style={{ padding: '0.85rem 0.5rem', fontWeight: 700, color: 'var(--primary)' }}>
                                  {reportItem.avgScore != null ? `${reportItem.avgScore}점` : '-'}
                                </td>
                                <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  {new Date(reportItem.generatedAt).toLocaleDateString('ko-KR', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <button
                                      className="btn btn-sm btn-secondary"
                                      onClick={() => setViewingReport(reportItem)}
                                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                                    >
                                      📄 보기
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => handleDownloadDoc(reportItem)}
                                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                                    >
                                      ⬇ DOC
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => {
                                        const found = students.find((s) => s.name === reportItem.studentName);
                                        if (found) {
                                          handleSelectStudent(found);
                                        } else {
                                          alert('학생 정보를 찾을 수 없습니다.');
                                        }
                                      }}
                                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                                    >
                                      💬 대화
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => handleDeleteReport(reportItem.id)}
                                      style={{
                                        padding: '0.25rem 0.6rem',
                                        fontSize: '0.78rem',
                                        color: '#dc2626',
                                        border: '1px solid rgba(220, 38, 38, 0.2)',
                                        background: 'rgba(220, 38, 38, 0.05)',
                                      }}
                                    >
                                      🗑️ 삭제
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : convLoading ? (
                <div className="loading-container" style={{ minHeight: '30vh' }}>
                  <div className="loading-spinner" />
                </div>
              ) : (
                <div>
                  {/* 뒤로가기 버튼 */}
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="btn btn-secondary btn-sm"
                    style={{
                      marginBottom: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontWeight: 600,
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    ← 전체 목록 / 보관함으로 돌아가기
                  </button>

                  {/* 학생 헤더 */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                      {selectedStudent.name}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      총 {conversations.length}개 과제 참여
                      {' · '}
                      완료 {conversations.filter((c) => c.status === 'completed').length}개
                    </p>
                  </div>

                  {/* 보관된 AI 분석 리포트 (읽기 전용) */}
                  {studentReports.length > 0 ? (
                    <div className="card-glass" style={{ marginBottom: '1.5rem', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                      <h3 style={{ marginBottom: '0.75rem', fontSize: '1.05rem', color: 'var(--purple-light)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        🧠 보관된 AI 분석 리포트
                      </h3>
                      
                      {studentReports.length > 1 && (
                        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>다른 기준일 리포트 선택:</span>
                          <select
                            className="form-input"
                            value={selectedReportId}
                            onChange={(e) => setSelectedReportId(e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.82rem', maxWidth: '200px' }}
                          >
                            {studentReports.map((r) => (
                              <option key={r.id} value={r.id}>
                                [{r.subjectLabel || r.subject || '전체 과목'}] {r.periodLabel || '전체 기간'} ({new Date(r.generatedAt).toLocaleDateString('ko-KR')})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {(() => {
                        const currentReport = studentReports.find((r) => r.id === selectedReportId) || studentReports[0];
                        if (!currentReport) return null;
                        return (
                          <div style={{
                            padding: '1.25rem',
                            background: 'rgba(168, 85, 247, 0.03)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid rgba(168, 85, 247, 0.1)',
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.75rem',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--purple-light)' }}>
                                📋 AI 학생 분석 보고서
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                과목: {currentReport.subjectLabel || currentReport.subject || '전체 과목'} · 기준: {currentReport.periodLabel || '전체 기간'} · 생성: {new Date(currentReport.generatedAt).toLocaleString('ko-KR')}
                              </span>
                            </div>
                            <div style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.9rem',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.7,
                            }}>
                              {stripMarkdown(currentReport.report)}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="card-glass" style={{ marginBottom: '1.5rem', padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px solid rgba(0,0,0,0.05)' }}>
                      <p style={{ fontSize: '0.88rem' }}>🧠 이 학생은 아직 보관된 AI 분석 리포트가 없습니다.</p>
                      <p style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>전체 보관함 화면에서 일괄 분석을 실행해 리포트를 생성할 수 있습니다.</p>
                    </div>
                  )}

                  {/* 점수 추이 미니 차트 */}
                  {scoreTrend.length >= 2 && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'rgba(0, 102, 204, 0.05)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                    }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
                        📊 점수 추이
                      </p>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {scoreTrend.map((item, i) => {
                          const maxVal = item.maxScore || Math.max(...scoreTrend.map((s) => s.score), 5);
                          const heightPct = Math.max(10, (item.score / maxVal) * 100);
                          return (
                            <div key={i} style={{ textAlign: 'center', flex: '1 1 0', minWidth: '40px', maxWidth: '80px' }}>
                              <div style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: 'var(--primary)',
                                marginBottom: '0.25rem',
                              }}>
                                {item.score}점
                              </div>
                              <div style={{
                                height: `${heightPct * 0.6}px`,
                                minHeight: '6px',
                                background: `linear-gradient(to top, var(--primary), var(--primary-bright))`,
                                borderRadius: '3px 3px 0 0',
                                marginBottom: '0.25rem',
                              }} />
                              <div style={{
                                fontSize: '0.65rem',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {formatShortDate(item.date)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 대화 목록 */}
                  {conversations.length === 0 ? (
                    <div className="empty-state">
                      <p className="empty-state-text">이 학생의 대화 기록이 없습니다.</p>
                    </div>
                  ) : (
                    <>
                      {/* 전체 열기/닫기 버튼 */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={toggleAllConvs}
                          style={{ fontSize: '0.82rem' }}
                        >
                          {expandedConvIds.size === conversations.length ? '▲ 전체 접기' : '▼ 전체 펼치기'}
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {conversations.map((conv) => {
                          const status = getStatusBadge(conv);
                          const isExpanded = expandedConvIds.has(conv.id);
                          const messages = Array.isArray(conv.messages) ? conv.messages : [];

                          return (
                            <div key={conv.id} className="card" style={{ padding: '1.25rem' }}>
                              {/* 헤더 */}
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: '0.5rem',
                              }}>
                                <div>
                                  <div style={{
                                    fontWeight: 700,
                                    fontSize: '0.95rem',
                                    marginBottom: '0.25rem',
                                  }}>
                                    {conv.assignment?.title || '(삭제된 과제)'}
                                  </div>
                                  <div style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-muted)',
                                  }}>
                                    {conv.assignment?.subject ? `${conv.assignment.subject} · ` : ''}
                                    {conv.assignment?.grade || ''}
                                    {' · '}
                                    {formatDate(conv.startedAt)}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  {Number.isFinite(conv.score) && (
                                    <span className="badge badge-score">{conv.score}점</span>
                                  )}
                                  <span className={`badge ${status.className}`}>{status.text}</span>
                                </div>
                              </div>

                              {/* 피드백 요약 */}
                              {conv.feedback && (
                                <p style={{
                                  fontSize: '0.85rem',
                                  color: 'var(--text-secondary)',
                                  marginBottom: '0.5rem',
                                  lineHeight: 1.5,
                                }}>
                                  💬 {conv.feedback}
                                </p>
                              )}

                              {conv.higherScoreTip && (
                                <p style={{
                                  fontSize: '0.82rem',
                                  color: 'var(--text-muted)',
                                  marginBottom: '0.5rem',
                                  lineHeight: 1.5,
                                }}>
                                  💡 {conv.higherScoreTip}
                                </p>
                              )}

                              {/* 대화 내용 토글 */}
                              {messages.length > 0 && (
                                <>
                                  <button
                                    onClick={() => toggleConv(conv.id)}
                                    className="btn btn-ghost btn-sm"
                                    style={{ marginTop: '0.25rem', fontSize: '0.82rem' }}
                                  >
                                    {isExpanded ? '▲ 대화 접기' : `▼ 대화 보기 (${messages.length}개 메시지)`}
                                  </button>

                                  {isExpanded && (
                                    <div style={{
                                      marginTop: '0.75rem',
                                      paddingTop: '0.75rem',
                                      borderTop: '1px solid var(--border-color)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.5rem',
                                    }}>
                                      {messages.map((msg, i) => (
                                        <div
                                          key={i}
                                          className={`chat-bubble chat-bubble-${msg.role}`}
                                          style={{ maxWidth: '85%' }}
                                        >
                                          {(msg.role === 'bot' || msg.role === 'unicorn') && (
                                            <div className="chat-sender">오늘배움봇</div>
                                          )}
                                          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 리포트 보기 모달 */}
      {viewingReport && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(26, 26, 26, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1.5rem',
        }} onClick={() => setViewingReport(null)}>
          <div style={{
            background: 'var(--bg)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }} onClick={(e) => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(2, 74, 218, 0.02)',
            }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                  🧠 {viewingReport.studentName} AI 분석 리포트
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  과목: {viewingReport.subjectLabel || viewingReport.subject || '전체 과목'} ·
                  기준: {viewingReport.periodLabel || '전체 기간'} ·
                  생성: {new Date(viewingReport.generatedAt).toLocaleString('ko-KR')}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setViewingReport(null)}
                style={{ fontSize: '1.25rem', padding: '0.2rem 0.5rem', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            
            {/* 모달 내용 */}
            <div style={{
              padding: '1.5rem',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '0.9rem',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
            }}>
              {stripMarkdown(viewingReport.report)}
            </div>
            
            {/* 모달 푸터 */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-surface)',
            }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => handleDeleteReport(viewingReport.id)}
                style={{
                  color: '#dc2626',
                  border: '1px solid rgba(220, 38, 38, 0.2)',
                  background: 'rgba(220, 38, 38, 0.05)',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                🗑️ 리포트 삭제
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownloadDoc(viewingReport)}
                >
                  ⬇ DOC 다운로드
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setViewingReport(null)}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
