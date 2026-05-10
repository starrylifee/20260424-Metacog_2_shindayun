'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BotAvatar from '@/components/BotAvatar';

export default function HomePage() {
  const router = useRouter();
  const [entryCode, setEntryCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [topAnswers, setTopAnswers] = useState([]);
  const [topAnswersLoading, setTopAnswersLoading] = useState(false);

  useEffect(() => {
    if (entryCode.length !== 6) {
      setTopAnswers([]);
      return;
    }

    let cancelled = false;
    setTopAnswersLoading(true);

    fetch(`/api/assignments/top-answers?code=${entryCode}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTopAnswers(data.success ? data.topAnswers : []);
      })
      .catch(() => { if (!cancelled) setTopAnswers([]); })
      .finally(() => { if (!cancelled) setTopAnswersLoading(false); });

    return () => { cancelled = true; };
  }, [entryCode]);

  const handleStudentEntry = async (e) => {
    e.preventDefault();
    if (!entryCode.trim() || !studentName.trim() || !studentPassword.trim()) {
      setError('입장 코드, 이름, 비밀번호를 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/assignments/lookup?code=${entryCode.toUpperCase()}`);
      const data = await res.json();

      if (!data.success) {
        setError(data.error || '입장 코드를 찾을 수 없어요. 선생님께 확인해주세요!');
        setLoading(false);
        return;
      }

      sessionStorage.setItem(
        'metacog_auth',
        JSON.stringify({ name: studentName.trim(), password: studentPassword })
      );

      router.push(`/chat/${entryCode.toUpperCase()}`);
    } catch (err) {
      setError('서버 연결에 실패했어요. 다시 시도해주세요.');
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="entry-container" style={{ alignItems: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div className="entry-card">
          <div className="bot-avatar bot-avatar-large">
            <BotAvatar size={88} />
          </div>

          <h1 className="heading-hero">
            <span className="heading-gradient">오늘배움봇</span>
          </h1>
          <p className="subtitle">
            오늘 배운 것을 오늘배움봇에게 설명해보세요!
          </p>

          <div className="card-glass">
            <form onSubmit={handleStudentEntry}>
              <div className="form-group">
                <label className="form-label">📝 입장 코드</label>
                <input
                  id="entry-code"
                  type="text"
                  className="form-input form-input-code"
                  placeholder="SUNNY42"
                  value={entryCode}
                  onChange={(e) => setEntryCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  autoComplete="off"
                />
                <p className="form-hint">선생님이 알려주신 6자리 코드를 입력하세요</p>
              </div>

              <div className="form-group">
                <label className="form-label">🙋 이름</label>
                <input
                  id="student-name"
                  type="text"
                  className="form-input form-input-large"
                  placeholder="홍길동"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label">🔑 비밀번호</label>
                <input
                  id="student-password"
                  type="password"
                  className="form-input form-input-large"
                  placeholder="선생님이 알려주신 비밀번호"
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                  ⚠️ {error}
                </p>
              )}

              <button
                id="btn-enter"
                type="submit"
                className="btn btn-primary btn-large"
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? '확인 중...' : '🤖 오늘배움봇 만나러 가기'}
              </button>

              {entryCode.length === 6 && (
                <a
                  href={`/gallery/${entryCode.toUpperCase()}`}
                  className="btn btn-secondary btn-large"
                  style={{ width: '100%', textAlign: 'center', display: 'block', marginTop: '0.5rem' }}
                >
                  🏆 명예의 전당 보기
                </a>
              )}
            </form>
          </div>

          <div className="entry-divider">선생님이신가요?</div>

          <Link href="/teacher" className="btn btn-secondary" style={{ width: '100%' }}>
            👩‍🏫 교사 로그인
          </Link>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link href="/portfolio" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>
              📚 내 학습 기록 보기
            </Link>
          </div>
        </div>

        {(topAnswersLoading || topAnswers.length > 0) && (
          <div style={{ width: '100%', maxWidth: '520px', marginTop: '2.5rem' }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--purple-light)',
              marginBottom: '0.75rem',
              textAlign: 'left',
            }}>
              🏆 이 과제의 우수 답변 예시
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'left' }}>
              다른 친구들은 어떻게 설명했는지 참고해 보세요.
            </p>

            {topAnswersLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <div className="loading-spinner" style={{ width: '28px', height: '28px' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {topAnswers.map((item, i) => (
                  <div
                    key={i}
                    className="card"
                    style={{ padding: '1rem 1.25rem' }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {item.label}
                      </span>
                      <span className="badge badge-score">{item.score}점</span>
                    </div>
                    <p style={{
                      fontSize: '0.93rem',
                      lineHeight: 1.65,
                      color: 'var(--text-secondary)',
                      margin: 0,
                    }}>
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
