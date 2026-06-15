/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Firebase 팝업 로그인이 window.closed를 읽을 수 있도록 COOP 완화
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ];
  },
};

export default nextConfig;
