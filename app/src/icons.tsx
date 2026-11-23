// Floe UI icon set — 24×24, 1.8 stroke, currentColor. Hand-drawn for this app.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 22, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IconHome = (p: P) => (
  <svg {...base(p)}><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></svg>
);
export const IconWallet = (p: P) => (
  <svg {...base(p)}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M15.5 13.5h2" /></svg>
);
export const IconInfo = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>
);
export const IconQr = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2M20 14v.01M18 18h2v2M14 20h2M14 17v.01" />
  </svg>
);
export const IconShare = (p: P) => (
  <svg {...base(p)}><path d="M12 15V4" /><path d="m8 8 4-4 4 4" /><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" /></svg>
);
export const IconCopy = (p: P) => (
  <svg {...base(p)}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" /></svg>
);
export const IconExternal = (p: P) => (
  <svg {...base(p)}><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" /></svg>
);
export const IconChart = (p: P) => (
  <svg {...base(p)}><path d="M4 19.5h16" /><path d="M7 16v-4M11 16V8M15 16v-6M19 16V5" /></svg>
);
export const IconFlame = (p: P) => (
  <svg {...base(p)}><path d="M12 20.5c3.6 0 6-2.4 6-5.8 0-3.9-3.3-5.8-4.3-9.7-2.2 1.6-3.1 3.7-3 5.7-1-.4-1.8-1.5-2-2.6C7.2 9.6 6 11.7 6 14.7c0 3.4 2.4 5.8 6 5.8Z" /></svg>
);
export const IconClock = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconTarget = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></svg>
);
export const IconSwap = (p: P) => (
  <svg {...base(p)}><path d="M7 4v14" /><path d="m4 15 3 3 3-3" /><path d="M17 20V6" /><path d="m14 9 3-3 3 3" /></svg>
);
export const IconSend = (p: P) => (
  <svg {...base(p)}><path d="M20 4 10.5 13.5" /><path d="M20 4 14 20l-3.5-6.5L4 10Z" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9.5" cy="9.5" r="1.5" /><path d="m20 15-4.5-4.5L7 19" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconWarning = (p: P) => (
  <svg {...base(p)}><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5" /><path d="M12 17.3v.01" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const IconGlobe = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" /></svg>
);
export const IconTelegram = (p: P) => (
  <svg {...base(p)}><path d="M20.5 4.5 3.5 11l5.5 2 2 6 3.2-3.8 4.3 3.3Z" /><path d="m9 13 8-5.5-5.8 7.5" /></svg>
);
export const IconX = (p: P) => (
  <svg {...base(p)}><path d="M4.5 4.5 19.5 19.5M19.5 4.5l-6.3 6.6M10.8 12.9 4.5 19.5" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base(p)}><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.7 2 3 4.4" /></svg>
);
export const IconShield = (p: P) => (
  <svg {...base(p)}><path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconLock = (p: P) => (
  <svg {...base(p)}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
);
export const IconRefresh = (p: P) => (
  <svg {...base(p)}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></svg>
);
export const IconCoins = (p: P) => (
  <svg {...base(p)}><ellipse cx="9" cy="7" rx="5" ry="2.5" /><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" /><path d="M10 15.4c.6.1 1.2.1 1.8.1 2.8 0 5-1.1 5-2.5" /><path d="M4 11v4c0 1.4 2.2 2.5 5 2.5 1 0 2-.1 2.8-.4" /><path d="M16.8 10.5c1.9.3 3.2 1.1 3.2 2v4c0 1.4-2.2 2.5-5 2.5s-5-1.1-5-2.5" /></svg>
);
export const IconSnow = (p: P) => (
  <svg {...base(p)}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" /></svg>
);

/** Brand mark (same artwork as public/icon.svg, simplified for small sizes) */
export const FloeLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Floe">
    <defs>
      <linearGradient id="fl-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1d74ff" />
        <stop offset="1" stopColor="#0a2a66" />
      </linearGradient>
      <linearGradient id="fl-ice" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#bfe6ff" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="url(#fl-bg)" />
    <path d="M10 46h44" stroke="#7fd3ff" strokeWidth="3" strokeLinecap="round" opacity=".55" />
    <path d="M17 44 26 22l7 9 5-7 9 20Z" fill="url(#fl-ice)" />
    <path d="M26 22l3 12-6 10M38 24l-2 9 6 11" stroke="#8cc8f0" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
    <path d="M42 12h8v8" stroke="#7dffb0" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M50 12 39 23" stroke="#7dffb0" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);
