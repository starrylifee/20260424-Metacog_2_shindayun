'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

import mathLessonPlanData from '@/data/mathLessonPlans.json';
import { auth } from '@/lib/firebase';
import { createAssignment, getTeacherSettings } from '@/lib/firestore';
import {
  getChatLengthExamples,
  getTeacherConstraintDefaults,
  formatStudentMessageByteRange,
} from '@/lib/chatConstraints';
import {
  DEFAULT_SCORE_OPTIONS,
  DEFAULT_SCORING_STYLE,
  formatScoreOptions,
  getScoringStyleDescription,
  getScoringStyleLabel,
  parseScoreOptionsInput,
  SCORING_STYLE_OPTIONS,
  SCORE_PRESETS,
} from '@/lib/scoreConfig';

const SUBJECTS = ['수학', '국어'];

function isLessonTitle(lesson) {
  return typeof lesson === 'string' && lesson.trim() && !/^\d+(?:~\d+)?$/.test(lesson.trim());
}

function formatGradeLabel(grade, semester) {
  if (!grade || !semester) return '';
  return `${grade}학년 ${semester}학기`;
}

function buildAssignmentContent({ subject, gradeLabel, unitTitle, lessonTitle, teacherContent }) {
  const sections = [
    `[오늘 수업 범위]\n과목: ${subject}\n학년/학기: ${gradeLabel}\n단원: ${unitTitle}\n차시명: ${lessonTitle}`,
  ];

  if (teacherContent.trim()) {
    sections.push(`[교사가 추가한 오늘 배운 내용]\n${teacherContent.trim()}`);
  }

  return sections.join('\n\n');
}

export default function NewAssignment() {
  const router = useRouter();
  const defaultConstraints = useMemo(() => getTeacherConstraintDefaults({}), []);
  const lengthExamples = useMemo(() => getChatLengthExamples(), []);
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Subject
  const [selectedSubject, setSelectedSubject] = useState('수학');

  // Grade / Semester (shared between subjects)
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');

  // 수학 lesson picker
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedLesson, setSelectedLesson] = useState('');
  const [autoFilledTitle, setAutoFilledTitle] = useState('');

  // 국어 free-text
  const [koreanUnit, setKoreanUnit] = useState('');
  const [koreanLesson, setKoreanLesson] = useState('');

  const [form, setForm] = useState({
    title: '',
    content: '',
    keywords: '',
    scoreOptionsInput: formatScoreOptions(DEFAULT_SCORE_OPTIONS),
    scoringStyle: DEFAULT_SCORING_STYLE,
    minTurns: defaultConstraints.minTurns,
    maxTurns: defaultConstraints.maxTurns,
    minStudentMessageBytes: defaultConstraints.minStudentMessageBytes,
    maxStudentMessageBytes: defaultConstraints.maxStudentMessageBytes,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        router.push('/teacher');
        return;
      }

      setUser(nextUser);

      try {
        const settings = await getTeacherSettings(nextUser.uid);
        const constraintDefaults = getTeacherConstraintDefaults(settings || {});
        setForm((prev) => ({
          ...prev,
          minTurns: constraintDefaults.minTurns,
          maxTurns: constraintDefaults.maxTurns,
          minStudentMessageBytes: constraintDefaults.minStudentMessageBytes,
          maxStudentMessageBytes: constraintDefaults.maxStudentMessageBytes,
        }));
      } catch (error) {
        console.error('Failed to load teacher defaults:', error);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const gradeOptions = useMemo(() => Object.keys(mathLessonPlanData.grades || {}), []);

  const semesterOptions = useMemo(() => {
    if (!selectedGrade) return [];
    return Object.keys(mathLessonPlanData.grades?.[selectedGrade] || {});
  }, [selectedGrade]);

  const mathUnits = useMemo(() => {
    if (!selectedGrade || !selectedSemester) return [];
    const rawUnits = mathLessonPlanData.grades?.[selectedGrade]?.[selectedSemester] || [];
    return rawUnits
      .map((unit) => ({
        ...unit,
        lessons: Array.from(
          new Set(Array.isArray(unit.lessons) ? unit.lessons.filter(isLessonTitle) : [])
        ),
      }))
      .filter((unit) => unit.unit && unit.lessons.length > 0);
  }, [selectedGrade, selectedSemester]);

  const selectedUnitData = useMemo(
    () => mathUnits.find((unit) => unit.unit === selectedUnit) || null,
    [mathUnits, selectedUnit]
  );

  const mathLessons = useMemo(() => selectedUnitData?.lessons || [], [selectedUnitData]);
  const gradeLabel = useMemo(() => formatGradeLabel(selectedGrade, selectedSemester), [selectedGrade, selectedSemester]);

  const parsedScoreOptions = useMemo(
    () => parseScoreOptionsInput(form.scoreOptionsInput),
    [form.scoreOptionsInput]
  );

  // Derived: current lesson/unit depending on subject
  const currentUnit = selectedSubject === '수학' ? selectedUnit : koreanUnit;
  const currentLesson = selectedSubject === '수학' ? selectedLesson : koreanLesson;
  const lessonSelected = selectedSubject === '수학'
    ? Boolean(selectedLesson)
    : Boolean(koreanUnit.trim() && koreanLesson.trim());

  const handleSubjectChange = (subject) => {
    setSelectedSubject(subject);
    setSelectedUnit('');
    setSelectedLesson('');
    setKoreanUnit('');
    setKoreanLesson('');
    setAutoFilledTitle('');
    setForm((prev) => ({ ...prev, title: '' }));
  };

  const handleGradeChange = (grade) => {
    setSelectedGrade(grade);
    setSelectedSemester('');
    setSelectedUnit('');
    setSelectedLesson('');
    setAutoFilledTitle('');
    setForm((prev) => ({
      ...prev,
      title: prev.title === autoFilledTitle ? '' : prev.title,
    }));
  };

  const handleSemesterChange = (semester) => {
    setSelectedSemester(semester);
    setSelectedUnit('');
    setSelectedLesson('');
    setAutoFilledTitle('');
    setForm((prev) => ({
      ...prev,
      title: prev.title === autoFilledTitle ? '' : prev.title,
    }));
  };

  const handleUnitChange = (unitTitle) => {
    setSelectedUnit(unitTitle);
    setSelectedLesson('');
    setAutoFilledTitle('');
    setForm((prev) => ({
      ...prev,
      title: prev.title === autoFilledTitle ? '' : prev.title,
    }));
  };

  const handleLessonChange = (lessonTitle) => {
    setSelectedLesson(lessonTitle);
    setForm((prev) => ({
      ...prev,
      title: !prev.title.trim() || prev.title === autoFilledTitle ? lessonTitle : prev.title,
    }));
    setAutoFilledTitle(lessonTitle);
  };

  const handleKoreanLessonChange = (value) => {
    setKoreanLesson(value);
    setForm((prev) => ({
      ...prev,
      title: !prev.title.trim() || prev.title === autoFilledTitle ? value : prev.title,
    }));
    setAutoFilledTitle(value);
  };

  const handleTitleChange = (event) => {
    setForm((prev) => ({ ...prev, title: event.target.value }));
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleScorePreset = (values) => {
    setForm((prev) => ({
      ...prev,
      scoreOptionsInput: formatScoreOptions(values),
    }));
  };

  const copyEntryCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.title.trim() || !lessonSelected || !gradeLabel) return;

    if (!parsedScoreOptions.ok) {
      alert(parsedScoreOptions.error);
      return;
    }

    setSaving(true);

    try {
      const result = await createAssignment(user.uid, {
        title: form.title.trim(),
        subject: selectedSubject,
        grade: gradeLabel,
        learningObjective: `${currentUnit} > ${currentLesson}`,
        content: buildAssignmentContent({
          subject: selectedSubject,
          gradeLabel,
          unitTitle: currentUnit,
          lessonTitle: currentLesson,
          teacherContent: form.content,
        }),
        keywords: form.keywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        standards: [currentUnit, currentLesson],
        scoreOptions: parsedScoreOptions.scoreOptions,
        scoringStyle: form.scoringStyle,
        minTurns: form.minTurns,
        maxTurns: form.maxTurns,
        minStudentMessageBytes: form.minStudentMessageBytes,
        maxStudentMessageBytes: form.maxStudentMessageBytes,
      });

      setCreated({
        ...result,
        scoreOptions: parsedScoreOptions.scoreOptions,
        scoringStyle: form.scoringStyle,
        minTurns: form.minTurns,
        maxTurns: form.maxTurns,
        minStudentMessageBytes: form.minStudentMessageBytes,
        maxStudentMessageBytes: form.maxStudentMessageBytes,
      });
    } catch (error) {
      console.error('Create assignment error:', error);
      alert('과제 생성에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  if (created) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/teacher" className="navbar-brand">
            <span className="emoji">🤖</span> 오늘배움봇
          </Link>
        </nav>

        <div
          className="content-wrapper content-narrow"
          style={{ textAlign: 'center', paddingTop: '3rem' }}
        >
          <div className="bot-avatar bot-avatar-large">✨</div>
          <h1 className="heading-hero">
            <span className="heading-gradient">과제 생성 완료!</span>
          </h1>
          <p className="subtitle">학생들에게 아래 입장 코드를 알려 주세요.</p>

          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              입장 코드
            </p>
            <p
              style={{
                fontSize: '3rem',
                fontWeight: 800,
                letterSpacing: '0.2em',
                background: 'var(--gradient-bot)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {created.entryCode}
            </p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.75rem' }}
              onClick={() => copyEntryCode(created.entryCode)}
            >
              {codeCopied ? '✓ 복사됨!' : '📋 코드 복사하기'}
            </button>
            <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <p className="form-hint">
                점수 단계: {formatScoreOptions(created.scoreOptions, ' / ')}
              </p>
              <p className="form-hint" style={{ marginTop: '0.35rem' }}>
                채점 성향: {getScoringStyleLabel(created.scoringStyle)} ({getScoringStyleDescription(created.scoringStyle)})
              </p>
              <p className="form-hint" style={{ marginTop: '0.35rem' }}>
                대화: 최소 {created.minTurns}턴 후 채점 · 최대 {created.maxTurns}턴
              </p>
              <p className="form-hint" style={{ marginTop: '0.35rem' }}>
                학생 답변: {formatStudentMessageByteRange(created.minStudentMessageBytes, created.maxStudentMessageBytes)}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link href="/teacher" className="btn btn-secondary">
              대시보드로
            </Link>
            <Link href={`/teacher/assignments/${created.id}`} className="btn btn-primary">
              결과 보기
            </Link>
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
        <Link href="/teacher" className="btn btn-ghost btn-sm">
          대시보드로
        </Link>
      </nav>

      <div className="content-wrapper content-medium">
        <h1 className="heading-section">새 과제 만들기</h1>
        <p className="subtitle">차시를 고르고 오늘 수업 내용과 채점 방식을 설정하세요.</p>

        <form onSubmit={handleSubmit}>

          {/* ── 1. 과목 선택 ── */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              과목 선택
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {SUBJECTS.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  className={`btn ${selectedSubject === subject ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSubjectChange(subject)}
                >
                  {subject}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. 학년/학기 + 차시 선택 ── */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              {selectedSubject} 차시 선택
            </h3>

            <div className="form-group">
              <label className="form-label">학년</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {gradeOptions.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    className={`btn ${selectedGrade === grade ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => handleGradeChange(grade)}
                  >
                    {grade}학년
                  </button>
                ))}
              </div>
            </div>

            {selectedGrade && (
              <div className="form-group">
                <label className="form-label">학기</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {semesterOptions.map((semester) => (
                    <button
                      key={semester}
                      type="button"
                      className={`btn ${selectedSemester === semester ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      onClick={() => handleSemesterChange(semester)}
                    >
                      {semester}학기
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 수학: 단원/차시 드롭다운 */}
            {selectedSubject === '수학' && selectedSemester && (
              <>
                <div className="form-group">
                  <label className="form-label">단원</label>
                  <select
                    className="form-select"
                    value={selectedUnit}
                    onChange={(event) => handleUnitChange(event.target.value)}
                  >
                    <option value="">단원을 선택해 주세요.</option>
                    {mathUnits.map((unit) => (
                      <option key={unit.unit} value={unit.unit}>{unit.unit}</option>
                    ))}
                  </select>
                </div>

                {selectedUnit && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">차시명</label>
                    <select
                      className="form-select"
                      value={selectedLesson}
                      onChange={(event) => handleLessonChange(event.target.value)}
                    >
                      <option value="">차시명을 선택해 주세요.</option>
                      {mathLessons.map((lesson) => (
                        <option key={lesson} value={lesson}>{lesson}</option>
                      ))}
                    </select>
                    <p className="form-hint">현재 3~6학년 수학 진도 자료 기반입니다.</p>
                  </div>
                )}
              </>
            )}

            {/* 국어: 단원/차시 직접 입력 */}
            {selectedSubject === '국어' && selectedSemester && (
              <>
                <div className="form-group">
                  <label className="form-label">단원명</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 1단원 - 작품을 보고 느낌을 나눠요"
                    value={koreanUnit}
                    onChange={(e) => setKoreanUnit(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">차시명</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 인물의 마음을 표현하는 말 알기"
                    value={koreanLesson}
                    onChange={(e) => handleKoreanLessonChange(e.target.value)}
                  />
                </div>
              </>
            )}

            {lessonSelected && gradeLabel && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: 'rgba(168, 85, 247, 0.05)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <p style={{ fontSize: '0.8rem', color: 'var(--purple-light)', fontWeight: 600, marginBottom: '0.5rem' }}>
                  선택한 오늘 수업 범위
                </p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{gradeLabel}</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>단원: {currentUnit}</p>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>차시명: {currentLesson}</p>
              </div>
            )}
          </div>

          {/* ── 3. 과제 제목 ── */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">과제 제목 *</label>
              <input
                id="input-title"
                type="text"
                className="form-input"
                placeholder="예: 받아올림이 있는 덧셈을 설명해 볼까?"
                value={form.title}
                onChange={handleTitleChange}
                required
              />
              <p className="form-hint">차시명을 고르면 제목이 자동으로 채워집니다.</p>
            </div>
          </div>

          {/* ── 4. 오늘 배운 내용 + 키워드 ── */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              오늘 실제로 배운 내용 (선택)
            </h3>

            <div className="form-group">
              <label className="form-label">교실에서 다룬 예시 / 풀이 / 표현</label>
              <textarea
                id="input-content"
                className="form-textarea"
                placeholder="예: 받아올림이 있으면 일의 자리에서 10이 넘어가니까 십의 자리에 1을 더해 준다고 설명했어요."
                value={form.content}
                onChange={handleChange('content')}
                rows={5}
              />
              <p className="form-hint">오늘배움봇이 학생 답을 평가할 때 참고합니다.</p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">핵심 키워드 (선택)</label>
              <input
                id="input-keywords"
                type="text"
                className="form-input"
                placeholder="예: 받아올림, 일의 자리, 십의 자리"
                value={form.keywords}
                onChange={handleChange('keywords')}
              />
              <p className="form-hint">쉼표로 구분해서 적어 주세요.</p>
            </div>
          </div>

          {/* ── 5. 채점 설정 ── */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              채점 설정
            </h3>

            <div className="form-group">
              <label className="form-label">채점 성향</label>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {SCORING_STYLE_OPTIONS.map((option) => {
                  const isSelected = form.scoringStyle === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, scoringStyle: option.value }))}
                      style={{
                        textAlign: 'left',
                        padding: '0.9rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isSelected ? 'var(--cyan-primary)' : 'var(--border-color)'}`,
                        background: isSelected ? 'rgba(34, 211, 238, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{option.label}</div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{option.description}</div>
                    </button>
                  );
                })}
              </div>
              <p className="form-hint" style={{ marginTop: '0.75rem' }}>
                장난·회피·엉뚱한 답은 성향과 무관하게 낮은 점수를 받습니다.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">빠른 프리셋</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {SCORE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleScorePreset(preset.values)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">점수 단계</label>
              <input
                id="input-score-options"
                type="text"
                className="form-input"
                placeholder="예: 0, 1, 2, 3 또는 0, 10, 20, 30"
                value={form.scoreOptionsInput}
                onChange={handleChange('scoreOptionsInput')}
              />
              <p className="form-hint">쉼표나 공백으로 구분. 0점부터 시작해야 합니다.</p>
              {parsedScoreOptions.ok ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  {parsedScoreOptions.scoreOptions.map((score) => (
                    <span key={score} className="badge badge-score">{score}점</span>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                  {parsedScoreOptions.error}
                </p>
              )}
            </div>
          </div>

          {/* ── 6. 대화 설정 (통합) ── */}
          <div className="card-glass" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--purple-light)' }}>
              대화 설정
            </h3>
            <p className="form-hint" style={{ marginBottom: '1.5rem' }}>
              최소·최대 대화 횟수와 학생 답변 길이를 설정합니다.
            </p>

            <div className="form-group">
              <label className="form-label">최소 대화 횟수 (채점 전 최소 답변 수)</label>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {[
                  { value: 1, label: '1회', desc: '한 번 답하면 바로 채점 가능' },
                  { value: 2, label: '2회 (권장)', desc: '한 번 더 확인하거나 보충할 기회 제공' },
                  { value: 3, label: '3회', desc: '충분한 대화 후 채점' },
                ].map((option) => {
                  const isSelected = form.minTurns === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((prev) => ({
                        ...prev,
                        minTurns: option.value,
                        maxTurns: Math.max(prev.maxTurns, option.value),
                      }))}
                      style={{
                        textAlign: 'left',
                        padding: '0.9rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isSelected ? 'var(--cyan-primary)' : 'var(--border-color)'}`,
                        background: isSelected ? 'rgba(34, 211, 238, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{option.label}</div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{option.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">최대 대화 횟수</label>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {[
                  { value: 3, label: '3턴 (기본)', desc: '짧고 집중된 대화로 빠르게 마무리해요.' },
                  { value: 4, label: '4턴', desc: '한두 번 더 확인하고 정리할 수 있어요.' },
                  { value: 5, label: '5턴', desc: '학생이 충분히 설명할 시간을 더 줘요.' },
                ].map((option) => {
                  const isAvailable = option.value >= form.minTurns;
                  const isSelected = form.maxTurns === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => setForm((prev) => ({ ...prev, maxTurns: option.value }))}
                      style={{
                        textAlign: 'left',
                        padding: '0.9rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isSelected ? 'var(--purple-light)' : 'var(--border-color)'}`,
                        background: isSelected ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: isAvailable ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                        opacity: isAvailable ? 1 : 0.5,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{option.label}</div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{option.desc}</div>
                    </button>
                  );
                })}
              </div>
              <p className="form-hint" style={{ marginTop: '0.75rem' }}>
                현재 설정: 최소 {form.minTurns}회 대화 후 채점 가능 · 최대 {form.maxTurns}회
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">학생 답변 길이</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <p className="form-hint" style={{ marginBottom: '0.4rem' }}>최소 (약 {Math.ceil(form.minStudentMessageBytes / 3)}글자 이상)</p>
                  <input
                    type="number"
                    min="1"
                    max={form.maxStudentMessageBytes}
                    className="form-input"
                    value={form.minStudentMessageBytes}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value || 1);
                      setForm((prev) => ({
                        ...prev,
                        minStudentMessageBytes: nextValue,
                        maxStudentMessageBytes: Math.max(prev.maxStudentMessageBytes, nextValue),
                      }));
                    }}
                  />
                </div>
                <div>
                  <p className="form-hint" style={{ marginBottom: '0.4rem' }}>최대 (약 {Math.floor(form.maxStudentMessageBytes / 3)}글자 이하)</p>
                  <input
                    type="number"
                    min={form.minStudentMessageBytes}
                    max="4000"
                    className="form-input"
                    value={form.maxStudentMessageBytes}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value || form.minStudentMessageBytes);
                      setForm((prev) => ({
                        ...prev,
                        maxStudentMessageBytes: Math.max(nextValue, prev.minStudentMessageBytes),
                      }));
                    }}
                  />
                </div>
              </div>
              <p className="form-hint">
                현재 범위: {formatStudentMessageByteRange(form.minStudentMessageBytes, form.maxStudentMessageBytes)}
              </p>
              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                {lengthExamples.map((example) => (
                  <div
                    key={example.label}
                    style={{
                      padding: '0.75rem 0.9rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.88rem',
                    }}
                  >
                    <strong style={{ color: 'var(--text-primary)' }}>{example.label}</strong>
                    {' · '}약 {Math.round(example.bytes / 3)}글자
                    <div style={{ marginTop: '0.35rem' }}>{example.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            id="btn-create"
            type="submit"
            className="btn btn-primary btn-large"
            style={{ width: '100%' }}
            disabled={saving || !form.title.trim() || !lessonSelected || !gradeLabel || !parsedScoreOptions.ok}
          >
            {saving ? '생성 중...' : '과제 생성하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
