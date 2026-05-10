'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function GalleryPage() {
  const params = useParams();
  const code = params.code;

  const [gallery, setGallery] = useState([]);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;

    fetch(`/api/assignments/gallery?code=${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setGallery(data.gallery || []);
          setAssignmentTitle(data.assignmentTitle || '');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <div className="page-container">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <span className="emoji">🤖</span> 오늘배움봇
        </Link>
        <Link href="/" className="btn btn-ghost btn-sm">← 돌아가기</Link>
      </nav>

      <div className="content-wrapper">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
          <h1 className="heading-hero">
            <span className="heading-gradient">명예의 전당</span>
          </h1>
          {assignmentTitle && (
            <p className="subtitle">{assignmentTitle}</p>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            입장코드 {code} · 우수 답변 모음
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="loading-spinner" />
          </div>
        ) : gallery.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-emoji">🌱</div>
            <p className="empty-state-text">아직 등록된 답변이 없어요.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              친구들이 먼저 오늘배움봇과 대화하면 여기에 나타납니다.
            </p>
            <Link href="/" className="btn btn-primary">챗봇 시작하기</Link>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
            maxWidth: '1000px',
            margin: '0 auto',
          }}>
            {gallery.map((item, i) => (
              <div key={i} className="card" style={{ padding: '1.25rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{item.studentName}
                  </span>
                  <span className="badge badge-score">
                    {item.score}{Number.isFinite(item.maxScore) ? `/${item.maxScore}` : ''}점
                  </span>
                </div>
                <p style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.65,
                  color: 'var(--text-secondary)',
                  margin: 0,
                  wordBreak: 'keep-all',
                }}>
                  {item.lastMessage}
                </p>
                {item.feedback && (
                  <p style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.75rem',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '0.75rem',
                    lineHeight: 1.55,
                  }}>
                    💬 {item.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {gallery.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link href="/" className="btn btn-primary">나도 오늘배움봇과 대화하기</Link>
          </div>
        )}
      </div>
    </div>
  );
}
