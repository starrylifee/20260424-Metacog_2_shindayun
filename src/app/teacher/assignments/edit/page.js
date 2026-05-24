'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

import { normalizeAssignmentConstraints } from '@/lib/chatConstraints';
import { hasStudentStartedConversation } from '@/lib/conversationState';
import { auth } from '@/lib/firebase';
import BotAvatar from '@/components/BotAvatar';
import {
  getAssignmentById,
  getConversationsByAssignment,
  updateAssignment,
} from '@/lib/firestore';
import {
  DEFAULT_SCORING_STYLE,
  formatScoreOptions,
  getAssignmentScoreOptions,
  getScoringStyleDescription,
  getScoringStyleLabel,
  parseScoreOptionsInput,
  SCORING_STYLE_OPTIONS,
} from '@/lib/scoreConfig';

function joinCsv(values) {
  return Array.isArray(values) ? values.join(', ') : '';
}

function splitCsv(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function EditAssignmentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get('id');

  const [user, setUser] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [started, setStarted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    subject: '',
    grade: '',
    learningObjective: '',
    content: '',
    keywords: '',
    standards: '',
    scoreOptionsInput: '',
    scoringStyle: DEFAULT_SCORING_STYLE,
    minTurns: 2,
    maxTurns: 3,
    minStudentMessageBytes: 9,
    maxStudentMessageBytes: 220,
  });

  const parsedScoreOptions = useMemo(
    () => parseScoreOptionsInput(form.scoreOptionsInput),
    [form.scoreOptionsInput]
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

  useEffect(() => {
    async function load() {
      if (!user || !assignmentId) {
        if (!assignmentId) {
          setLoadError('수정할 과제를 찾을 수 없습니다.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setLoadError('');

      try {
        const [nextAssignment, conversations] = await Promise.all([
          getAssignmentById(assignmentId),
          getConversationsByAssignment(assignmentId),
        ]);

        if (!nextAssignment || nextAssignment.teacherId !== user.uid) {
          setLoadError('과제를 확인할 수 없습니다.');
          setLoading(false);
          return;
        }

        const constraints = normalizeAssignmentConstraints(nextAssignment);
        setAssignment(nextAssignment);
        setStarted(conversations.some(hasStudentStartedConversation));
        setForm({
          title: nextAssignment.title || '',
          subject: nextAssignment.subject || '',
          grade: nextAssignment.grade || '',
          learningObjective: nextAssignment.learningObjective || '',
          content: nextAssignment.content || '',
          keywords: joinCsv(nextAssignment.keywords),
          standards: joinCsv(nextAssignment.standards),
          scoreOptionsInput: formatScoreOptions(getAssignmentScoreOptions(nextAssignment)),
          scoringStyle: nextAssignment.scoringStyle || DEFAULT_SCORING_STYLE,
          minTurns: constraints.minTurns,
          maxTurns: constraints.maxTurns,
          minStudentMessageBytes: constraints.minStudentMessageBytes,
          maxStudentMessageBytes: constraints.maxStudentMessageBytes,
        });
      } catch (error) {
        console.error('Edit assignment load error:', error);
        setLoadError(error instanceof Error ? error.message : '과제 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [assignmentId, user]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!assignment || !assignmentId || started) return;

    if (!parsedScoreOptions.ok) {
      alert(parsedScoreOptions.error);
      return;
    }

    setSaving(true);
    try {
      await updateAssignment(assignmentId, {
        title: form.title.trim(),
        subject: form.subject.trim(),
        grade: form.grade.trim(),
        learningObjective: form.learningObjective.trim(),
        content: form.content.trim(),
        keywords: splitCsv(form.keywords),
        standards: splitCsv(form.standards),
        scoreOptions: parsedScoreOptions.scoreOptions,
        scoringStyle: form.scoringStyle,
        minTurns: Number(form.minTurns),
        maxTurns: Number(form.maxTurns),
        minStudentMessageBytes: Number(form.minStudentMessageBytes),
        maxStudentMessageBytes: Number(form.maxStudentMessageBytes),
      });
      router.push(`/teacher/assignments/${assignmentId}`);
    } catch (error) {
      console.error('Update assignment error:', error);
      alert(error instanceof Error ? error.message : '과제를 수정하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container"><div className="loading-spinner" /></div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="page-container">
        <div className="content-wrapper content-narrow">
          <div className="empty-state">
            <p className="empty-state-text">{loadError || '과제를 찾을 수 없습니다.'}</p>
            <Link href="/teacher" className="btn btn-primary">대시보드로</Link>
          </div>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/teacher" className="navbar-brand"><BotAvatar size={22} /> 오늘배움봇</Link>
          <Link href={`/teacher/assignments/${assignmentId}`} className="btn btn-ghost btn-sm">결과 보기</Link>
        </nav>
        <div className="content-wrapper content-narrow">
          <div className="card-glass">
            <h1 className="heading-section">수정 불가</h1>
            <p className="subtitle" style={{ marginBottom: '1rem' }}>
              학생이 이미 시작한 과제는 수정할 수 없습니다.
            </p>
            <p className="form-hint" style={{ marginBottom: '1rem' }}>
              복사본을 만든 뒤 수정해서 새 과제로 사용하는 흐름을 권장합니다.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href={`/teacher/assignments/${assignmentId}`} className="btn btn-primary">과제 상세로</Link>
              <Link href="/teacher" className="btn btn-secondary">대시보드로</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/teacher" className="navbar-brand"><BotAvatar size={22} /> 오늘배움봇</Link>
        <Link href={`/teacher/assignments/${assignmentId}`} className="btn btn-ghost btn-sm">결과 보기</Link>
      </nav>

      <div className="content-wrapper content-medium">
        <h1 className="heading-section">수학 과제 수정</h1>
        <p className="subtitle">학생이 시작하기 전에는 과제 내용을 자유롭게 손볼 수 있습니다.</p>

        {loadError && (
          <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(251,113,133,0.35)', background: 'rgba(251,113,133,0.08)' }}>
            <p>{loadError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>기본 정보</h3>

            <div className="form-group">
              <label className="form-label">과제 제목</label>
              <input type="text" className="form-input" value={form.title} onChange={handleChange('title')} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">과목</label>
                <input type="text" className="form-input" value={form.subject} onChange={handleChange('subject')} />
              </div>
              <div className="form-group">
                <label className="form-label">학년</label>
                <input type="text" className="form-input" value={form.grade} onChange={handleChange('grade')} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">학습 목표</label>
              <input type="text" className="form-input" value={form.learningObjective} onChange={handleChange('learningObjective')} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">수업 내용 (오늘배움봇이 채점 시 참고)</label>
              <textarea className="form-textarea" rows={5} value={form.content} onChange={handleChange('content')} required />
              <p className="form-hint">오늘배움봇이 학생 답변을 평가할 때 참고합니다. 자유롭게 수정하세요.</p>
            </div>
          </div>

          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>수업 메타데이터</h3>

            <div className="form-group">
              <label className="form-label">키워드</label>
              <input type="text" className="form-input" value={form.keywords} onChange={handleChange('keywords')} placeholder="쉼표로 구분" />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">기준/차시 정보</label>
              <input type="text" className="form-input" value={form.standards} onChange={handleChange('standards')} placeholder="쉼표로 구분" />
            </div>
          </div>

          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>채점 및 대화 설정</h3>

            <div className="form-group">
              <label className="form-label">채점 성향</label>
              <select className="form-select" value={form.scoringStyle} onChange={handleChange('scoringStyle')}>
                {SCORING_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {getScoringStyleLabel(option.value)} - {getScoringStyleDescription(option.value)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">점수 단계</label>
              <input
                type="text"
                className="form-input"
                value={form.scoreOptionsInput}
                onChange={handleChange('scoreOptionsInput')}
                placeholder="예: 0, 1, 2, 3, 4, 5"
              />
              {parsedScoreOptions.ok ? (
                <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                  현재 점수 단계: {formatScoreOptions(parsedScoreOptions.scoreOptions, ' / ')}
                </p>
              ) : (
                <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: '0.5rem' }}>{parsedScoreOptions.error}</p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">최소 턴</label>
                <input type="number" className="form-input" min="1" max={form.maxTurns || 12} value={form.minTurns} onChange={handleChange('minTurns')} />
              </div>
              <div className="form-group">
                <label className="form-label">최대 턴</label>
                <input type="number" className="form-input" min={form.minTurns || 1} max="12" value={form.maxTurns} onChange={handleChange('maxTurns')} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">학생 답변 최소 글자</label>
                <input type="number" className="form-input" min="1" max={form.maxStudentMessageBytes || 4000} value={form.minStudentMessageBytes} onChange={handleChange('minStudentMessageBytes')} />
                <p className="form-hint">약 {Math.ceil(form.minStudentMessageBytes / 3)}글자 이상</p>
              </div>
              <div className="form-group">
                <label className="form-label">학생 답변 최대 글자</label>
                <input type="number" className="form-input" min={form.minStudentMessageBytes || 1} max="4000" value={form.maxStudentMessageBytes} onChange={handleChange('maxStudentMessageBytes')} />
                <p className="form-hint">약 {Math.floor(form.maxStudentMessageBytes / 3)}글자 이하</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={saving || !parsedScoreOptions.ok}>
              {saving ? '저장 중...' : '변경 사항 저장'}
            </button>
            <Link href={`/teacher/assignments/${assignmentId}`} className="btn btn-secondary">취소</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EditAssignmentPage() {
  return (
    <Suspense fallback={<div className="page-container"><div className="loading-container"><div className="loading-spinner" /></div></div>}>
      <EditAssignmentPageContent />
    </Suspense>
  );
}
