export default function BotAvatar({ size = 48, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="오늘배움봇"
      fill="none"
    >
      {/* 안테나 */}
      <rect x="46" y="4" width="8" height="15" rx="4" fill="#024ad8" />
      <circle cx="50" cy="3" r="6" fill="#296ef9" />
      <circle cx="50" cy="3" r="3" fill="#c9e0fc" />

      {/* 머리 */}
      <rect x="16" y="16" width="68" height="52" rx="20" fill="#024ad8" />

      {/* 하이라이트 */}
      <ellipse cx="50" cy="22" rx="24" ry="6" fill="white" opacity="0.12" />

      {/* 얼굴 스크린 */}
      <rect x="25" y="24" width="50" height="38" rx="13" fill="#c9e0fc" />

      {/* 왼쪽 눈 */}
      <circle cx="38" cy="40" r="7.5" fill="#024ad8" />
      <circle cx="40.5" cy="37.5" r="2.5" fill="white" />

      {/* 오른쪽 눈 */}
      <circle cx="62" cy="40" r="7.5" fill="#024ad8" />
      <circle cx="64.5" cy="37.5" r="2.5" fill="white" />

      {/* 웃음 */}
      <path
        d="M35 52 Q50 61 65 52"
        stroke="#024ad8"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* 귀 */}
      <rect x="8" y="29" width="10" height="20" rx="5" fill="#0e3191" />
      <rect x="82" y="29" width="10" height="20" rx="5" fill="#0e3191" />

      {/* 책 */}
      <rect x="18" y="72" width="64" height="22" rx="7" fill="#f59e0b" />
      <rect x="18" y="72" width="64" height="22" rx="7" fill="url(#bookShine)" />
      <line x1="50" y1="72" x2="50" y2="94" stroke="white" strokeWidth="2" opacity="0.4" />
      <rect x="23" y="79" width="20" height="2.5" rx="1.25" fill="white" opacity="0.55" />
      <rect x="23" y="84.5" width="15" height="2.5" rx="1.25" fill="white" opacity="0.4" />
      <rect x="57" y="79" width="20" height="2.5" rx="1.25" fill="white" opacity="0.55" />
      <rect x="57" y="84.5" width="15" height="2.5" rx="1.25" fill="white" opacity="0.4" />

      <defs>
        <linearGradient id="bookShine" x1="18" y1="72" x2="18" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="white" stopOpacity="0.15" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
