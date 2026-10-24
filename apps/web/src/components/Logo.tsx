export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="pf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a4a" />
          <stop offset="0.55" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#f2600c" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="10" fill="url(#pf-g)" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="9.5" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M10 9.5h5.5a4.25 4.25 0 0 1 0 8.5H10z" fill="none" stroke="#1a0c03" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M10 9.5V23" stroke="#1a0c03" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 22.5h5.5M20.75 19.75v5.5" stroke="#1a0c03" strokeWidth="2.1" strokeLinecap="round" strokeOpacity="0.8" />
      <circle cx="23.5" cy="10" r="2" fill="#5ef0c8" stroke="#1a0c03" strokeWidth="0.8" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-bold tracking-tight">
      <LogoMark />
      {!compact && <span className="text-[15.5px]">PinFlow <span className="font-medium text-muted">Studio</span></span>}
    </span>
  );
}
