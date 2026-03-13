import { useState } from 'react';
import {
  CheckCircle2,
  Shuffle,
  X,
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
  GapAnalysis,
  RequirementGap,
} from '@/types/resume-v2';
import { scrollToBullet } from '../useStrategyThread';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface StrategyAuditCardProps {
  positioningAssessment: PositioningAssessment;
  gapAnalysis: GapAnalysis;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function importanceLabel(importance: RequirementGap['importance']): string {
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
  importance: RequirementGap['importance'],
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
          Direct Match
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
          Positioned
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

// ─── Merged row data ────────────────────────────────────────────────────────────

interface AuditRow {
  entry: PositioningAssessmentEntry;
  gapRequirement: RequirementGap | null;
}

// ─── Expandable audit row ──────────────────────────────────────────────────────

function AuditRow({ row }: { row: AuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const { entry, gapRequirement } = row;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  const importance = gapRequirement?.importance ?? entry.importance;

  return (
    <div
      className="border border-white/[0.06] rounded-lg overflow-hidden"
      data-audit-requirement={entry.requirement}
    >
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
          style={importanceStyle(importance)}
        >
          {importanceLabel(importance)}
        </span>

        {/* Status indicator */}
        <StatusIndicator status={entry.status} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-white/[0.02] border-t border-white/[0.06]">
          {/* Gap strategy (original positioning plan, from gap analysis) */}
          {entry.status === 'repositioned' && gapRequirement?.strategy && (
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
              <div className="space-y-0.5">
                <p className="text-[9px] font-medium uppercase tracking-wide" style={{ color: 'rgba(175,196,255,0.55)' }}>
                  Positioning Strategy
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: '#afc4ff' }}>
                  {gapRequirement.strategy.positioning}
                </p>
              </div>
            </div>
          )}

          {/* strategy_used from assessment (the strategy that was actually applied) */}
          {entry.strategy_used && entry.status === 'repositioned' && (
            <div
              className="flex items-start gap-2 rounded-md px-2.5 py-2"
              style={{
                backgroundColor: 'rgba(175,196,255,0.04)',
                border: '1px solid rgba(175,196,255,0.10)',
              }}
            >
              <Target
                className="h-3 w-3 mt-0.5 shrink-0"
                style={{ color: 'rgba(175,196,255,0.60)' }}
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <p className="text-[9px] font-medium uppercase tracking-wide" style={{ color: 'rgba(175,196,255,0.40)' }}>
                  Applied As
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(175,196,255,0.80)' }}>
                  {entry.strategy_used}
                </p>
              </div>
            </div>
          )}

          {/* Resulting bullets (addressed_by) */}
          {entry.addressed_by.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="h-3 w-3 text-white/30" aria-hidden="true" />
                <span className="text-[10px] font-medium text-white/40 uppercase tracking-wide">
                  {entry.status === 'repositioned' ? 'Resulting Bullets' : 'Addressed By'}
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
                    {(entry.status === 'repositioned' || entry.status === 'strong') ? (
                      <button
                        type="button"
                        onClick={() => scrollToBullet(entry.requirement)}
                        className="text-[11px] text-white/60 leading-relaxed text-left hover:text-[#afc4ff]/80 transition-colors cursor-pointer underline-offset-2 hover:underline"
                        title="Jump to this bullet in the resume"
                      >
                        {ref.bullet_text}
                      </button>
                    ) : (
                      <span className="text-[11px] text-white/60 leading-relaxed">
                        {ref.bullet_text}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gap — no bullets found */}
          {entry.status === 'gap' && entry.addressed_by.length === 0 && (
            <p className="text-[11px] text-white/30 italic leading-relaxed">
              No bullets address this requirement. Consider adding context during a re-run.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function StrategyAuditCard({ positioningAssessment, gapAnalysis }: StrategyAuditCardProps) {
  const [expanded, setExpanded] = useState(false);

  const requirementMap = positioningAssessment.requirement_map;

  // Build a lookup from requirement name → gap requirement for strategy data
  const gapLookup = new Map<string, RequirementGap>();
  for (const req of gapAnalysis.requirements) {
    gapLookup.set(req.requirement.toLowerCase().trim(), req);
  }

  const auditRows: AuditRow[] = requirementMap.map((entry) => ({
    entry,
    gapRequirement: gapLookup.get(entry.requirement.toLowerCase().trim()) ?? null,
  }));

  // Summary counts
  const positionedCount = requirementMap.filter((r) => r.status === 'repositioned').length;
  const directCount = requirementMap.filter((r) => r.status === 'strong').length;
  const gapCount = requirementMap.filter((r) => r.status === 'gap').length;

  return (
    <GlassCard
      className="p-5"
      data-strategy-audit
    >
      {/* ── Header (always visible) ─────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-start gap-2 mb-0 text-left hover:opacity-90 transition-opacity"
        aria-expanded={expanded}
      >
        <Target
          className="h-4 w-4 mt-0.5 shrink-0"
          style={{ color: '#afc4ff' }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white/90 leading-snug">
            Strategy Audit
          </h2>
          <p className="text-xs text-white/45 mt-0.5 leading-snug">
            How each gap strategy mapped to your resume bullets
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/30 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-white/30 shrink-0 mt-0.5" aria-hidden="true" />
        )}
      </button>

      {/* ── Summary count badges (always visible) ───────────────── */}
      <div className="flex items-center gap-2 mt-3" aria-label="Strategy audit summary">
        {positionedCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
            style={{
              color: '#afc4ff',
              backgroundColor: 'rgba(175,196,255,0.10)',
              border: '1px solid rgba(175,196,255,0.18)',
            }}
          >
            <Shuffle className="h-2.5 w-2.5" aria-hidden="true" />
            {positionedCount} positioned
          </span>
        )}
        {directCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
            style={{
              color: '#b5dec2',
              backgroundColor: 'rgba(181,222,194,0.10)',
              border: '1px solid rgba(181,222,194,0.18)',
            }}
          >
            <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
            {directCount} direct match{directCount !== 1 ? 'es' : ''}
          </span>
        )}
        {gapCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
            style={{
              color: '#f0b8b8',
              backgroundColor: 'rgba(240,184,184,0.10)',
              border: '1px solid rgba(240,184,184,0.18)',
            }}
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
            {gapCount} gap{gapCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Expanded rows ────────────────────────────────────────── */}
      {expanded && auditRows.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {auditRows.map((row, i) => (
            <AuditRow key={i} row={row} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}
