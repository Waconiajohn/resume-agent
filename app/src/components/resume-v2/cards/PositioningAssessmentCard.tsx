import { useState } from 'react';
import { ChevronDown, Target, Lightbulb, FileText, ArrowRight } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import type {
  PositioningAssessment,
  PositioningAssessmentEntry,
  PreScores,
} from '@/types/resume-v2';
import { StatusBadge, importanceLabel, importanceStyle } from './shared-badges';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface PositioningAssessmentCardProps {
  assessment: PositioningAssessment;
  preScores: PreScores | null;
  companyName?: string;
  roleTitle?: string;
}

// ─── Importance badge (filled pill) ────────────────────────────────────────────

function ImportanceBadge({ importance }: { importance: PositioningAssessmentEntry['importance'] }) {
  const style = importanceStyle(importance);
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
      style={style}
    >
      {importanceLabel(importance)}
    </span>
  );
}

// ─── Expandable requirement row ────────────────────────────────────────────────

function RequirementRow({ entry, index }: { entry: PositioningAssessmentEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={[
        'border border-white/[0.06] rounded-lg overflow-hidden',
        index % 2 === 1 ? 'bg-white/[0.02]' : '',
      ].join(' ')}
    >
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={expanded}
      >
        <ChevronDown
          className={[
            'h-3 w-3 text-white/30 shrink-0 transition-transform duration-200',
            expanded ? 'rotate-0' : '-rotate-90',
          ].join(' ')}
          aria-hidden="true"
        />

        {/* Requirement text */}
        <span className="flex-1 min-w-0 text-xs text-white/75 leading-snug truncate">
          {entry.requirement}
        </span>

        {/* Importance badge */}
        <ImportanceBadge importance={entry.importance} />

        {/* Status badge */}
        <StatusBadge status={entry.status} />
      </button>

      {/* Expanded detail — smooth max-height transition */}
      <div
        className={[
          'transition-all duration-300 overflow-hidden',
          expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
        ].join(' ')}
        aria-hidden={!expanded}
      >
        <div className="px-3 pb-3 pt-1 space-y-2 bg-white/[0.02] border-t border-white/[0.06]">
          {/* Addressed by — with quoted bullet text and left border accent */}
          {entry.addressed_by.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="h-3 w-3 text-white/30" aria-hidden="true" />
                <span className="text-[10px] font-medium text-white/40 uppercase tracking-wide">
                  Addressed by
                </span>
              </div>
              <ul className="space-y-1.5">
                {entry.addressed_by.map((ref, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0"
                      style={{
                        color: 'rgba(255,255,255,0.50)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {ref.section}
                    </span>
                    <blockquote
                      className="flex-1 border-l-2 pl-2 text-[11px] text-white/60 leading-relaxed italic"
                      style={{ borderColor: 'rgba(175,196,255,0.25)' }}
                    >
                      &ldquo;{ref.bullet_text}&rdquo;
                    </blockquote>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Strategy used */}
          {entry.strategy_used && (
            <div
              className="flex items-start gap-2 rounded-md px-2.5 py-2"
              style={{
                backgroundColor: 'rgba(175,196,255,0.07)',
                border: '1px solid rgba(175,196,255,0.15)',
              }}
            >
              <Lightbulb
                className="h-3 w-3 mt-0.5 shrink-0"
                style={{ color: '#afc4ff' }}
                aria-hidden="true"
              />
              <span className="text-[11px] leading-relaxed" style={{ color: '#afc4ff' }}>
                {entry.strategy_used}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Score delta visualization ─────────────────────────────────────────────────

function ScoreDelta({
  beforeScore,
  afterScore,
}: {
  beforeScore: number;
  afterScore: number;
}) {
  const delta = afterScore - beforeScore;
  const isImprovement = delta >= 0;
  const arrowColor = isImprovement ? '#b5dec2' : '#f0b8b8';
  const afterColor = isImprovement ? '#b5dec2' : '#f0b8b8';
  const deltaColor = isImprovement ? '#b5dec2' : '#f0b8b8';
  const deltaBg = isImprovement ? 'rgba(181,222,194,0.10)' : 'rgba(240,184,184,0.10)';
  const deltaBorder = isImprovement ? 'rgba(181,222,194,0.20)' : 'rgba(240,184,184,0.20)';

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 mb-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Before score with subtle background bar */}
      <div className="relative flex flex-col items-center gap-0.5">
        <span className="text-[9px] text-white/35 uppercase tracking-wide">Before</span>
        <span className="text-base font-bold tabular-nums text-white/60 leading-none">
          {beforeScore}<span className="text-[10px] font-normal text-white/30">%</span>
        </span>
      </div>

      {/* Arrow */}
      <ArrowRight
        className="h-4 w-4 shrink-0"
        style={{ color: arrowColor }}
        aria-hidden="true"
      />

      {/* After score */}
      <div className="relative flex flex-col items-center gap-0.5">
        <span className="text-[9px] text-white/35 uppercase tracking-wide">After</span>
        <span
          className="text-base font-bold tabular-nums leading-none"
          style={{ color: afterColor }}
        >
          {afterScore}<span className="text-[10px] font-normal" style={{ color: `${afterColor}99` }}>%</span>
        </span>
      </div>

      {/* Delta badge */}
      <span
        className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
        style={{ color: deltaColor, backgroundColor: deltaBg, border: `1px solid ${deltaBorder}` }}
        aria-label={`${isImprovement ? 'Improvement' : 'Decrease'} of ${Math.abs(delta)} percentage points`}
      >
        {delta > 0 ? '+' : ''}
        {delta}pp
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PositioningAssessmentCard({
  assessment,
  preScores,
  companyName,
  roleTitle,
}: PositioningAssessmentCardProps) {
  const [strategiesOpen, setStrategiesOpen] = useState(false);

  // Compute score delta
  const beforeScore = preScores?.ats_match ?? assessment.before_score;
  const afterScore = assessment.after_score;

  // Build title
  let title = 'Positioning Assessment';
  if (roleTitle && companyName) {
    title = `Positioning Assessment: ${roleTitle} at ${companyName}`;
  } else if (roleTitle) {
    title = `Positioning Assessment: ${roleTitle}`;
  } else if (companyName) {
    title = `Positioning Assessment — ${companyName}`;
  }

  // Bucket requirements by status for summary counts
  const strongCount = assessment.requirement_map.filter((r) => r.status === 'strong').length;
  const repositionedCount = assessment.requirement_map.filter(
    (r) => r.status === 'repositioned',
  ).length;
  const gapCount = assessment.requirement_map.filter((r) => r.status === 'gap').length;

  return (
    <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
      {/* ── Title ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 mb-4">
        <Target
          className="h-4 w-4 mt-0.5 shrink-0"
          style={{ color: '#afc4ff' }}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-white/90 leading-snug">{title}</h2>
      </div>

      {/* ── Summary narrative ────────────────────────────────────── */}
      <p className="text-xs text-white/60 leading-relaxed mb-4">{assessment.summary}</p>

      {/* ── Score delta visualization ─────────────────────────────── */}
      <ScoreDelta beforeScore={beforeScore} afterScore={afterScore} />

      {/* ── Requirement map ──────────────────────────────────────── */}
      {assessment.requirement_map.length > 0 && (
        <div className="mb-4">
          {/* Section header with counts */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-medium text-white/50">Requirements</span>
            <div className="flex items-center gap-2 ml-auto">
              {strongCount > 0 && (
                <span className="text-[10px] tabular-nums" style={{ color: '#b5dec2' }}>
                  {strongCount} strong
                </span>
              )}
              {repositionedCount > 0 && (
                <span className="text-[10px] tabular-nums" style={{ color: '#afc4ff' }}>
                  {repositionedCount} repositioned
                </span>
              )}
              {gapCount > 0 && (
                <span className="text-[10px] tabular-nums" style={{ color: '#f0b8b8' }}>
                  {gapCount} gap{gapCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {assessment.requirement_map.map((entry, i) => (
              <RequirementRow key={i} entry={entry} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Strategies Applied ───────────────────────────────────── */}
      {assessment.strategies_applied.length > 0 && (
        <div className="pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setStrategiesOpen((prev) => !prev)}
            className="flex items-center gap-1.5 w-full text-left mb-2 hover:opacity-80 transition-opacity"
            aria-expanded={strategiesOpen}
          >
            <ChevronDown
              className={[
                'h-3 w-3 text-white/30 transition-transform duration-200',
                strategiesOpen ? 'rotate-0' : '-rotate-90',
              ].join(' ')}
              aria-hidden="true"
            />
            <Lightbulb className="h-3.5 w-3.5 text-[#f0d99f]" aria-hidden="true" />
            <span className="text-xs font-medium text-white/60">
              Strategies Applied
            </span>
            <span
              className="ml-1 rounded-full px-1.5 py-px text-[9px] tabular-nums"
              style={{
                color: 'rgba(255,255,255,0.35)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {assessment.strategies_applied.length}
            </span>
          </button>

          <div
            className={[
              'transition-all duration-300 overflow-hidden',
              strategiesOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
            ].join(' ')}
            aria-hidden={!strategiesOpen}
          >
            <ul className="space-y-1.5">
              {assessment.strategies_applied.map((strategy, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <div
                    className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'rgba(240,217,159,0.60)' }}
                    aria-hidden="true"
                  />
                  <span className="text-white/55 leading-relaxed">{strategy}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
