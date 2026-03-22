import { ArrowRight, Sparkles } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import type { PreScores, PositioningAssessment } from '@/types/resume-v2';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ScoringReportCardProps {
  preScores: PreScores;
  assembly: {
    scores: { ats_match: number; truth: number; tone: number };
    positioning_assessment?: PositioningAssessment;
  };
}

// ─── Progress bar ───────────────────────────────────────────────────────────

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="h-1.5 rounded-md overflow-hidden"
      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
      role="presentation"
    >
      <div
        className="h-full rounded-md transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Stat column ────────────────────────────────────────────────────────────

function StatColumn({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="flex-1 text-center">
      <div
        className="text-xl font-bold tabular-nums leading-none mb-1"
        style={{ color: color ?? 'rgba(255,255,255,0.85)' }}
      >
        {value}
      </div>
      <div className="text-[10px] text-white/40 uppercase tracking-wide leading-tight">
        {label}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ScoringReportCard({ preScores, assembly }: ScoringReportCardProps) {
  const beforeScore = preScores.ats_match;
  const afterScore = assembly.positioning_assessment?.after_score ?? assembly.scores.ats_match;
  const delta = afterScore - beforeScore;

  const requirementMap = assembly.positioning_assessment?.requirement_map ?? [];
  const addressedCount = requirementMap.filter(
    (r) => r.status === 'strong' || r.status === 'repositioned',
  ).length;
  const totalCount = requirementMap.length;
  const strategiesCount = assembly.positioning_assessment?.strategies_applied.length ?? 0;

  const deltaLabel = delta > 0 ? `+${delta}` : String(delta);

  return (
    <GlassCard
      className="p-5 animate-[card-enter_500ms_ease-out_forwards]"
      style={{
        borderColor: 'rgba(181,222,194,0.25)',
        background:
          'linear-gradient(180deg, rgba(181,222,194,0.05) 0%, rgba(255,255,255,0.03) 60%)',
      }}
      data-scoring-report
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles
          className="h-4 w-4 shrink-0"
          style={{ color: '#b5dec2' }}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-white/90">How We Improved Your Resume</h2>
      </div>

      {/* ── Before → After score display ─────────────────────────── */}
      <div
        className="support-callout flex items-center gap-3 px-4 py-3 mb-4"
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Before */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-white/35 uppercase tracking-wide">Before</span>
          <span className="text-xl font-bold tabular-nums text-white/50 leading-none">
            {beforeScore}
            <span className="text-[11px] font-normal text-white/30">%</span>
          </span>
        </div>

        <ArrowRight
          className="h-4 w-4 shrink-0"
          style={{ color: '#b5dec2' }}
          aria-hidden="true"
        />

        {/* After */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-white/35 uppercase tracking-wide">After</span>
          <span
            className="text-xl font-bold tabular-nums leading-none"
            style={{ color: '#b5dec2' }}
          >
            {afterScore}
            <span className="text-[11px] font-normal" style={{ color: 'rgba(181,222,194,0.55)' }}>
              %
            </span>
          </span>
        </div>

        {/* Delta badge */}
        <span
          className="ml-auto rounded-md px-3 py-1.5 text-xs font-bold tabular-nums"
          style={{
            color: delta > 0 ? '#b5dec2' : delta < 0 ? '#f0b8b8' : 'rgba(255,255,255,0.5)',
            backgroundColor: delta > 0 ? 'rgba(181,222,194,0.12)' : delta < 0 ? 'rgba(240,184,184,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${delta > 0 ? 'rgba(181,222,194,0.25)' : delta < 0 ? 'rgba(240,184,184,0.25)' : 'rgba(255,255,255,0.12)'}`,
          }}
          aria-label={`Improvement of ${delta} percentage points`}
        >
          {deltaLabel}
        </span>
      </div>

      {/* ── Progress bar for after score ─────────────────────────── */}
      <div className="mb-4">
        <ScoreBar value={afterScore} color="#b5dec2" />
      </div>

      {/* ── Stat columns ─────────────────────────────────────────── */}
      <div
        className="room-shell flex items-center gap-0 overflow-hidden mb-4"
        style={{
          border: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="flex-1 px-3 py-3 text-center border-r border-white/[0.06]">
          <StatColumn
            label="Requirements Addressed"
            value={totalCount > 0 ? `${addressedCount}/${totalCount}` : addressedCount}
            color="#b5dec2"
          />
        </div>
        <div className="flex-1 px-3 py-3 text-center border-r border-white/[0.06]">
          <StatColumn
            label="Strategies Applied"
            value={strategiesCount}
            color="#afc4ff"
          />
        </div>
        <div className="flex-1 px-3 py-3 text-center">
          <StatColumn
            label="ATS Match"
            value={`${afterScore}%`}
            color="#b5dec2"
          />
        </div>
      </div>

      {/* ── Summary line ─────────────────────────────────────────── */}
      {totalCount > 0 && (
        <p
          className="text-xs leading-relaxed text-center"
          style={{ color: 'rgba(181,222,194,0.70)' }}
        >
          Your resume now addresses{' '}
          <span className="font-semibold" style={{ color: '#b5dec2' }}>
            {addressedCount} of {totalCount}
          </span>{' '}
          key requirements
        </p>
      )}
    </GlassCard>
  );
}
