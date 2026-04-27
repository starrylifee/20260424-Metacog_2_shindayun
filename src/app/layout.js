import './globals.css';
import SiteFooter from '@/components/SiteFooter';

const TITLE = '오늘배움봇 🤖 | 배운 걸 설명하며 성장하기';
const DESCRIPTION = '오늘배움봇에게 오늘 배운 것을 설명해보세요! AI가 여러분의 이해도를 확인해줍니다.';
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'ko_KR',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <div className="bg-stars" />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
