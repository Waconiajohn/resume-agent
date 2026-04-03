import { Zap } from 'lucide-react';
import type { VerificationScores, QuickWin } from '@/types/resume-v2';
import { scoreColor, MiniRingGauge, ImpactDot } from './score-gauges';

// ─── ATS score module ──────────────────────────────────────────────────────────

function AtsScorePanel({ value }: { value: number }) {
  const color = scoreColor(value);
  return (
    <div className="room-shell flex-1 px-4 py-4 text-center">
      <div className="eyebrow-label mb-2 justify-center">Match Score</div>
      <div className="text-3xl font-semibold tracking-tight" style={{ color }}>
        {value}%
      </div>
      <div className="mt-1 text-[13px] uppercase tracking-[0.16em] text-[var(--text-soft)]">ATS Match</div>
    </div>
  );
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
    <div className="room-shell space-y-4 px-4 py-4">
      <div className="room-meta-strip">
        <div className="room-meta-item">
          <span className="eyebrow-label">Scoring Snapshot</span>
          <span className="text-sm text-[var(--text-soft)]">Truth, tone, and fast improvements in one place.</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AtsScorePanel value={scores.ats_match} />

        <div className="support-callout flex items-center gap-4 shrink-0 px-4 py-4">
          <MiniRingGauge label="Truth" score={scores.truth} color="var(--badge-green-text)" />
          <MiniRingGauge label="Tone" score={scores.tone} color="var(--badge-amber-text)" />
        </div>
      </div>

      {quickWins.length > 0 && (
        <div className="support-callout px-4 py-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[var(--badge-amber-text)]" />
            <span className="eyebrow-label">Quick Wins</span>
          </div>
          <ul className="space-y-1.5">
            {quickWins.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md border border-[var(--line-soft)] bg-black/20 px-3 py-2.5 text-xs transition-colors hover:bg-[var(--surface-1)] hover:border-[var(--line-strong)]"
              >
                <ImpactDot impact={w.impact} />
                <span className="text-[var(--text-soft)]">{w.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
