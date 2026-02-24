export function ScoreRing({ score, max, label, color }: { score: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={`${label}: ${pct}%`}>
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/[0.10]" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={circumference} strokeLinecap="round"
            className={color}
            style={{
              '--circumference': `${circumference}`,
              '--offset': `${offset}`,
              strokeDashoffset: circumference,
              animation: 'score-ring-draw 800ms ease-out forwards',
            } as React.CSSProperties}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white/90">
          {pct}%
        </span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</span>
    </div>
  );
}
