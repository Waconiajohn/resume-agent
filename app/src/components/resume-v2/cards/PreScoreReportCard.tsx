import { TrendingUp } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import type { PreScores } from '@/types/resume-v2';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface PreScoreReportCardProps {
  preScores: PreScores;
}

// ─── Score descriptor ───────────────────────────────────────────────────────

function getScoreDescriptor(score: number): string {
  if (score < 40) return 'Your resume needs significant work to match this role';
  if (score < 60) return "A good foundation — we'll build on what's already strong";
  if (score < 80) return "You're already a solid match — let's make it even stronger";
  return "You're a great match — fine-tuning will seal the deal";
}

// ─── Main component ─────────────────────────────────────────────────────────

export function PreScoreReportCard({ preScores }: PreScoreReportCardProps) {
  const descriptor = getScoreDescriptor(preScores.ats_match);

  return (
    <GlassCard
      className="room-shell p-5 border-l-2 border-l-[#afc4ff]/40 animate-[card-enter_500ms_ease-out_forwards]"
      data-pre-score-report
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp
          className="h-4 w-4 shrink-0"
          style={{ color: '#afc4ff' }}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-white/90">Your Starting Point</h2>
      </div>

      {/* ── Score + descriptor ───────────────────────────────────── */}
      <div className="support-callout flex items-center gap-4 mb-4 px-4 py-4">
        <div
          className="shrink-0 rounded-md px-4 py-3 text-center"
          style={{
            backgroundColor: 'rgba(175,196,255,0.08)',
            border: '1px solid rgba(175,196,255,0.18)',
          }}
        >
          <div
            className="text-2xl font-bold tabular-nums leading-none"
            style={{ color: '#afc4ff' }}
          >
            {preScores.ats_match}%
          </div>
          <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wide">
            ATS Match
          </div>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">{descriptor}</p>
      </div>

      {/* ── Keywords ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Found */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-white/35 mb-1.5">
            Keywords Found
          </p>
          {preScores.keywords_found.length === 0 ? (
            <p className="text-[11px] text-white/30 italic">None detected</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {preScores.keywords_found.map((kw, i) => (
                <span
                  key={i}
                  className="rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{
                    color: '#b5dec2',
                    backgroundColor: 'rgba(181,222,194,0.10)',
                    border: '1px solid rgba(181,222,194,0.22)',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Missing */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-white/35 mb-1.5">
            Keywords Missing
          </p>
          {preScores.keywords_missing.length === 0 ? (
            <p className="text-[11px] text-white/30 italic">None — great coverage</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {preScores.keywords_missing.map((kw, i) => (
                <span
                  key={i}
                  className="rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{
                    color: '#f0b8b8',
                    backgroundColor: 'rgba(240,184,184,0.10)',
                    border: '1px solid rgba(240,184,184,0.22)',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
