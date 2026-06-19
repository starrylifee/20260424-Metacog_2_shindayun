'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BotAvatar from '@/components/BotAvatar';

const STUDENT_SESSION_KEY = 'metacog_student';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      setError('이름과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `/api/student/dashboard?name=${encodeURIComponent(name.trim())}&password=${encodeURIComponent(password.trim())}`
      );
      const data = await res.json();

      if (!data.success) {
        setError(data.error || '이름 또는 비밀번호가 맞지 않습니다.');
        setLoading(false);
        return;
      }

      // 대시보드가 세션에서 복원하도록 저장하고 이동
      sessionStorage.setItem(
        STUDENT_SESSION_KEY,
        JSON.stringify({ name: name.trim(), password: password.trim() })
      );
      router.push('/dashboard');
    } catch {
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

          {/* 학생 로그인 */}
          <div className="card-glass">
            <form onSubmit={handleStudentLogin}>
              <div className="form-group">
                <label className="form-label">🙋 이름</label>
                <input
                  id="student-name"
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
                  id="student-password"
                  type="password"
                  className="form-input form-input-large"
                  placeholder="선생님이 알려주신 비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                  ⚠️ {error}
                </p>
              )}

              <button
                id="btn-student-login"
                type="submit"
                className="btn btn-primary btn-large"
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? '확인 중...' : <>🎒 내 대시보드 열기</>}
              </button>
            </form>
            <p className="form-hint" style={{ textAlign: 'center', marginTop: '0.6rem' }}>
              우리 반 과제 참여, 내 학습 기록을 한곳에서 볼 수 있어요
            </p>
          </div>

          {/* 교사 로그인 */}
          <div className="entry-divider">선생님이신가요?</div>

          <Link href="/teacher" className="btn btn-secondary btn-large" style={{ width: '100%', textAlign: 'center', display: 'block' }}>
            👩‍🏫 교사 로그인 (Google)
          </Link>
        </div>
      </div>
    </div>
  );
}
