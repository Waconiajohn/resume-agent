import { Zap } from 'lucide-react';
import type { VerificationScores, QuickWin } from '@/types/resume-v2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#b5dec2';
  if (score >= 60) return '#f0d99f';
  return '#f0b8b8';
}

// ─── Mini ring gauge — matches KeywordScoreDashboard style ────────────────────

function MiniRingGauge({
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

// ─── ATS score pill (larger, legacy-compatible display) ───────────────────────

function AtsScorePill({ value }: { value: number }) {
  const color = scoreColor(value);
  return (
    <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-center">
      <div className="text-2xl font-bold" style={{ color }}>
        {value}%
      </div>
      <div className="text-xs text-white/50 mt-0.5">ATS Match</div>
    </div>
  );
}

// ─── Impact dot ───────────────────────────────────────────────────────────────

function ImpactDot({ impact }: { impact: string }) {
  const color = {
    high: 'bg-[#f0b8b8]',
    medium: 'bg-[#f0d99f]',
    low: 'bg-white/30',
  }[impact] ?? 'bg-white/30';

  return <div className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${color}`} />;
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ScoresCard({
  scores,
  quickWins,
}: {
  scores: VerificationScores;
  quickWins: QuickWin[];
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Scores */}
      <div className="flex items-center gap-4 flex-1">
        {/* ATS: larger pill to stay visually dominant */}
        <AtsScorePill value={scores.ats_match} />

        {/* Truth + Tone: mini ring gauges to match KeywordScoreDashboard */}
        <div className="flex items-center gap-4 shrink-0">
          <MiniRingGauge label="Truth" score={scores.truth} color="#b5dec2" />
          <MiniRingGauge label="Tone" score={scores.tone} color="#f0d99f" />
        </div>
      </div>

      {/* Quick wins as actionable suggestion cards */}
      {quickWins.length > 0 && (
        <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-[#f0d99f]" />
            <span className="text-xs font-medium text-white/60">Quick Wins</span>
          </div>
          <ul className="space-y-1.5">
            {quickWins.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs transition-colors hover:bg-white/[0.06] hover:border-white/[0.10]"
              >
                <ImpactDot impact={w.impact} />
                <span className="text-white/60">{w.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
