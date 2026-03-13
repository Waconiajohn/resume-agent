import { useState } from 'react';
import {
  CheckCircle2,
  X,
  Shuffle,
  ChevronDown,
  ChevronRight,
  Target,
  Lightbulb,
  FileText,
} from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import type {
  PositioningAssessment,
  PositioningAssessmentEntry,
  PreScores,
} from '@/types/resume-v2';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface PositioningAssessmentCardProps {
  assessment: PositioningAssessment;
  preScores: PreScores | null;
  companyName?: string;
  roleTitle?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function importanceLabel(importance: PositioningAssessmentEntry['importance']): string {
  switch (importance) {
    case 'must_have':
      return 'Must Have';
    case 'important':
      return 'Important';
    case 'nice_to_have':
      return 'Nice to Have';
  }
}

function importanceStyle(
  importance: PositioningAssessmentEntry['importance'],
): { color: string; backgroundColor: string; border: string } {
  switch (importance) {
    case 'must_have':
      return {
        color: '#f0b8b8',
        backgroundColor: 'rgba(240,184,184,0.10)',
        border: '1px solid rgba(240,184,184,0.20)',
      };
    case 'important':
      return {
        color: '#f0d99f',
        backgroundColor: 'rgba(240,217,159,0.10)',
        border: '1px solid rgba(240,217,159,0.20)',
      };
    case 'nice_to_have':
      return {
        color: 'rgba(255,255,255,0.40)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
      };
  }
}

// ─── Status indicator ──────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: PositioningAssessmentEntry['status'] }) {
  switch (status) {
    case 'strong':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium shrink-0"
          style={{
            color: '#b5dec2',
            backgroundColor: 'rgba(181,222,194,0.10)',
            border: '1px solid rgba(181,222,194,0.20)',
          }}
        >
          <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
          Strong
        </span>
      );
    case 'repositioned':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium shrink-0"
          style={{
            color: '#afc4ff',
            backgroundColor: 'rgba(175,196,255,0.10)',
            border: '1px solid rgba(175,196,255,0.20)',
          }}
        >
          <Shuffle className="h-2.5 w-2.5" aria-hidden="true" />
          Repositioned
        </span>
      );
    case 'gap':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium shrink-0"
          style={{
            color: '#f0b8b8',
            backgroundColor: 'rgba(240,184,184,0.10)',
            border: '1px solid rgba(240,184,184,0.20)',
          }}
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
          Gap
        </span>
      );
  }
}

// ─── Expandable requirement row ────────────────────────────────────────────────

function RequirementRow({ entry }: { entry: PositioningAssessmentEntry }) {
  const [expanded, setExpanded] = useState(false);
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={expanded}
      >
        <ChevronIcon className="h-3 w-3 text-white/30 shrink-0" aria-hidden="true" />

        {/* Requirement text */}
        <span className="flex-1 min-w-0 text-xs text-white/75 leading-snug truncate">
          {entry.requirement}
        </span>

        {/* Importance badge */}
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0"
          style={importanceStyle(entry.importance)}
        >
          {importanceLabel(entry.importance)}
        </span>

        {/* Status indicator */}
        <StatusIndicator status={entry.status} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-white/[0.02] border-t border-white/[0.06]">
          {/* Addressed by */}
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
                      className="mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium shrink-0"
                      style={{
                        color: 'rgba(255,255,255,0.50)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {ref.section}
                    </span>
                    <span className="text-[11px] text-white/60 leading-relaxed">
                      {ref.bullet_text}
                    </span>
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
      )}
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
  const delta = afterScore - beforeScore;
  const deltaColor = delta >= 0 ? '#b5dec2' : '#f0b8b8';
  const deltaBg = delta >= 0 ? 'rgba(181,222,194,0.10)' : 'rgba(240,184,184,0.10)';
  const deltaBorder = delta >= 0 ? 'rgba(181,222,194,0.20)' : 'rgba(240,184,184,0.20)';

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
    <GlassCard className="p-5">
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

      {/* ── Score delta ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 mb-4"
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/40">Original:</span>
          <span className="font-semibold tabular-nums text-white/70">{beforeScore}%</span>
        </div>

        <span className="text-white/20" aria-hidden="true">
          →
        </span>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/40">Optimized:</span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: delta >= 0 ? '#b5dec2' : '#f0b8b8' }}
          >
            {afterScore}%
          </span>
        </div>

        <span
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
          style={{ color: deltaColor, backgroundColor: deltaBg, border: `1px solid ${deltaBorder}` }}
          aria-label={`${delta >= 0 ? 'Improvement' : 'Decrease'} of ${Math.abs(delta)} percentage points`}
        >
          {delta > 0 ? '+' : ''}
          {delta}
        </span>
      </div>

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
              <RequirementRow key={i} entry={entry} />
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
            {strategiesOpen ? (
              <ChevronDown className="h-3 w-3 text-white/30" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3 text-white/30" aria-hidden="true" />
            )}
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

          {strategiesOpen && (
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
          )}
        </div>
      )}
    </GlassCard>
  );
}
