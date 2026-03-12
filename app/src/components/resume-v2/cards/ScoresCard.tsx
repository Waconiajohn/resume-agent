import { Shield, Zap } from 'lucide-react';
import type { VerificationScores, QuickWin } from '@/types/resume-v2';

export function ScoresCard({ scores, quickWins }: { scores: VerificationScores; quickWins: QuickWin[] }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Scores */}
      <div className="flex gap-3 flex-1">
        <ScorePill label="ATS Match" value={scores.ats_match} color="#afc4ff" />
        <ScorePill label="Truth" value={scores.truth} color="#b5dec2" />
        <ScorePill label="Tone" value={scores.tone} color="#f0d99f" />
      </div>

      {/* Quick wins */}
      {quickWins.length > 0 && (
        <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-[#f0d99f]" />
            <span className="text-xs font-medium text-white/60">Quick Wins</span>
          </div>
          <ul className="space-y-1">
            {quickWins.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
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

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-center">
      <div className="text-2xl font-bold" style={{ color }}>{value}%</div>
      <div className="text-xs text-white/50 mt-0.5">{label}</div>
    </div>
  );
}

function ImpactDot({ impact }: { impact: string }) {
  const color = {
    high: 'bg-[#f0b8b8]',
    medium: 'bg-[#f0d99f]',
    low: 'bg-white/30',
  }[impact] ?? 'bg-white/30';

  return <div className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${color}`} />;
}
