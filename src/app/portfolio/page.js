'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 내 학습 기록은 통합 학생 대시보드(/dashboard)의 '내 학습 기록' 탭으로 흡수되었다.
export default function PortfolioRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="page-container">
      <div className="loading-container">
        <div className="loading-spinner" />
        <p style={{ color: 'var(--text-secondary)' }}>내 학습 대시보드로 이동 중...</p>
      </div>
    </div>
  );
}
