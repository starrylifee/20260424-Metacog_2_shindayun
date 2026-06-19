'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import BotAvatar from '@/components/BotAvatar';
import { groupBySubject } from '@/lib/studentPortfolio';

// 학급코드만으로 로그인 없이 우리 반 프로젝트와 명예의 전당을 둘러보는 게스트 화면.
// (예: 교실 화면 공유) 내 답변 확인/다시 도전 등 학생 개인 기능은 /dashboard 로 이동.
export default function ClassBrowsePage() {
  const params = useParams();
  const code = params.code;

  const [className, setClassName] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const grouped = useMemo(() => groupBySubject(assignments), [assignments]);

  useEffect(() => {
    if (!code) return;

    fetch(`/api/class/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setClassName(data.className || '');
          setAssignments(data.assignments || []);
        } else {
          setError(data.error || '학급을 찾을 수 없습니다.');
        }
      })
      .catch(() => setError('서버 연결에 실패했어요.'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p style={{ color: 'var(--text-secondary)' }}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <BotAvatar size={22} /> 오늘배움봇
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">← 돌아가기</Link>
        </nav>
        <div className="empty-state" style={{ marginTop: '3rem' }}>
          <div className="empty-state-emoji">🔍</div>
          <p className="empty-state-text">{error}</p>
          <Link href="/" className="btn btn-primary">홈으로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <BotAvatar size={22} /> 오늘배움봇
        </Link>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', flex: 1, textAlign: 'center' }}>
          {className || '우리 학급'} · 둘러보기
        </span>
        <Link href="/dashboard" className="btn btn-secondary btn-sm">
          🙋 로그인하고 내 답변 보기
        </Link>
      </nav>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem 1rem 3rem', width: '100%' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0 1.25rem', textAlign: 'center' }}>
          로그인 없이 우리 반 프로젝트와 명예의 전당을 둘러보고 있어요.
        </p>

        {assignments.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
            <p style={{ margin: 0 }}>아직 진행 중인 프로젝트가 없어요.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {grouped.map(([subject, items]) => (
              <div key={subject}>
                <div className="subject-header">⚡ {subject}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {items.map((a) => (
                    <div key={a.id} className="card" style={{ padding: '0.85rem 1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 0 }}>
                          {a.title}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                          👤 {a.participantCount}
                        </span>
                      </div>
                      {a.grade && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                          {a.grade}
                        </p>
                      )}
                      {a.entryCode && (
                        <div style={{ marginTop: '0.6rem' }}>
                          <a className="btn btn-ghost btn-sm" href={`/gallery/${a.entryCode}`}>
                            🏆 명예의 전당
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 로그인 안내 */}
        <div className="card" style={{ marginTop: '1.5rem', padding: '1.1rem 1.25rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            내 답변을 확인하거나 다시 도전하려면 로그인하세요.
          </p>
          <Link href="/dashboard" className="btn btn-primary btn-sm">
            🙋 내 대시보드 열기
          </Link>
        </div>
      </div>
    </div>
  );
}
