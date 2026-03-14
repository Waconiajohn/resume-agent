// ─── Shared score gauge components ──────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 80) return '#b5dec2';
  if (score >= 60) return '#f0d99f';
  return '#f0b8b8';
}

export function MiniRingGauge({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  const size = 40;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden="true"
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[9px] font-bold tabular-nums" style={{ color }}>
            {score}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-white/40 leading-none">{label}</span>
    </div>
  );
}

export function ImpactDot({ impact }: { impact: string }) {
  const color =
    impact === 'high' ? '#f0b8b8' : impact === 'medium' ? '#f0d99f' : 'rgba(255,255,255,0.30)';
  return (
    <div
      className="h-1.5 w-1.5 rounded-full shrink-0 mt-1.5"
      style={{ backgroundColor: color }}
    />
  );
}
