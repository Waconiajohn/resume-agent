import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { cleanText } from '@/lib/clean-text';
import type { GapAnalysisData, RequirementFitItem } from '@/types/panels';

interface GapAnalysisPanelProps {
  data: GapAnalysisData;
}

/**
 * Map agent status strings to classification buckets.
 * classify_fit emits: "strong" | "partial" | "gap"
 * Agent update_right_panel emits: "strong_match" | "exceptional_match" | "needs_strengthening" | "partial_match" | "meets_minimum" | "gap" | "missing"
 */
function mapStatus(status: string): 'strong' | 'partial' | 'gap' {
  switch (status.toLowerCase()) {
    case 'strong':
    case 'strong_match':
    case 'exceptional_match':
      return 'strong';
    case 'partial':
    case 'partial_match':
    case 'needs_strengthening':
    case 'meets_minimum':
      return 'partial';
    case 'gap':
    case 'missing':
    default:
      return 'gap';
  }
}

/**
 * Normalize data from two possible shapes:
 * 1. Flat (from classify_fit emit): { requirements, strong_count, partial_count, gap_count, total, addressed }
 * 2. Nested (from agent update_right_panel): { requirements_analysis: [{ requirement, status, your_evidence, gap_or_action }], ... }
 */
function normalizeData(data: GapAnalysisData & Record<string, unknown>) {
  // Already in expected shape (from classify_fit or pipeline gap_analysis)
  if (Array.isArray(data.requirements) && data.requirements.length > 0) {
    // Compute counts from classification field if not provided
    const strong = data.strong_count ?? data.requirements.filter((r: RequirementFitItem) => mapStatus(r.classification) === 'strong').length;
    const partial = data.partial_count ?? data.requirements.filter((r: RequirementFitItem) => mapStatus(r.classification) === 'partial').length;
    const gap = data.gap_count ?? data.requirements.filter((r: RequirementFitItem) => mapStatus(r.classification) === 'gap').length;
    return {
      requirements: data.requirements,
      strong_count: strong,
      partial_count: partial,
      gap_count: gap,
      total: data.total ?? data.requirements.length,
      addressed: data.addressed ?? (strong + partial),
    };
  }

  // Agent shape: requirements_analysis array
  const analysis = data.requirements_analysis as Array<Record<string, string>> | undefined;
  if (Array.isArray(analysis) && analysis.length > 0) {
    const requirements: RequirementFitItem[] = analysis.map((item) => ({
      requirement: item.requirement ?? '',
      classification: mapStatus(item.status ?? 'gap'),
      evidence: item.your_evidence ?? item.evidence ?? '',
      strategy: item.gap_or_action ?? item.strategy ?? '',
    }));

    const strong_count = requirements.filter(r => r.classification === 'strong').length;
    const partial_count = requirements.filter(r => r.classification === 'partial').length;
    const gap_count = requirements.filter(r => r.classification === 'gap').length;

    return {
      requirements,
      strong_count,
      partial_count,
      gap_count,
      total: requirements.length,
      addressed: strong_count,
    };
  }

  // Fallback: empty
  return { requirements: [], strong_count: 0, partial_count: 0, gap_count: 0, total: 0, addressed: 0 };
}

const classificationConfig = {
  strong: {
    icon: CheckCircle,
    color: 'text-[#a8d7b8]',
    border: 'border-[var(--line-soft)]',
    bg: 'bg-[var(--accent-muted)]',
    label: 'Strong Match',
  },
  partial: {
    icon: AlertTriangle,
    color: 'text-[#dcc390]',
    border: 'border-[var(--line-soft)]',
    bg: 'bg-[var(--accent-muted)]',
    label: 'Partial Match',
  },
  gap: {
    icon: XCircle,
    color: 'text-[#e1a4a4]',
    border: 'border-[var(--line-soft)]',
    bg: 'bg-[var(--accent-muted)]',
    label: 'Needs Attention',
  },
};

function RequirementRow({ item, userContext, onUserContextChange }: {
  item: RequirementFitItem;
  userContext: string;
  onUserContextChange: (value: string) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const config = classificationConfig[item.classification] ?? classificationConfig.gap;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-3`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-strong)]">{cleanText(item.requirement)}</p>
          {item.evidence && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{cleanText(item.evidence)}</p>
          )}
          {item.strategy && (
            <p className="mt-1 text-xs italic text-[var(--text-soft)]">{cleanText(item.strategy)}</p>
          )}
          {!showInput && !userContext && (
            <button
              type="button"
              onClick={() => setShowInput(true)}
              className="mt-1.5 text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
            >
              + Add context
            </button>
          )}
          {showInput && (
            <div className="mt-2">
              <input
                type="text"
                value={userContext}
                onChange={(e) => onUserContextChange(e.target.value)}
                onBlur={() => { if (!userContext) setShowInput(false); }}
                placeholder="Add evidence or dispute this assessment..."
                autoFocus
                className="w-full rounded border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[var(--line-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
              />
            </div>
          )}
          {userContext && !showInput && (
            <div className="mt-1.5 flex items-start gap-1.5">
              <span className="text-[12px] text-[var(--text-soft)] italic flex-1">{userContext}</span>
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors shrink-0"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GapAnalysisPanel({ data }: GapAnalysisPanelProps) {
  const { requirements, strong_count, partial_count, gap_count, total, addressed } = normalizeData(data as GapAnalysisData & Record<string, unknown>);
  const [userContextMap, setUserContextMap] = useState<Record<number, string>>({});

  const progressPct = total > 0 ? Math.round((addressed / total) * 100) : 0;
  const hasOpenItems = partial_count > 0 || gap_count > 0;

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-strong)]">How Your Experience Matches</span>
          <span className="text-[12px] text-amber-400/60 bg-amber-400/[0.08] border border-amber-400/20 rounded px-1.5 py-0.5 ml-2">AI assessment</span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="gap_analysis"
          tone="review"
          userDoesOverride="Use this as a reality check. Strong means covered well, Partial means usable but thin, Gap means we still need stronger evidence or a strategy."
          nextOverride={hasOpenItems ? 'Fill evidence gaps in the next questions' : 'Move to blueprint and section writing'}
        />

        {/* Progress bar */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--text-muted)]">How Well You Match</span>
            <span className="text-xs font-medium text-[var(--text-strong)]">
              {addressed} of {total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--accent-muted)] overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${addressed} of ${total} requirements matched`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9cb6ff] to-[#c2d2ff] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-[var(--text-soft)]">
            <span className="text-[#b5dec2] font-medium">{strong_count} strong</span>
            {', '}
            <span className="text-[#f0d99f] font-medium">{partial_count} partial</span>
            {', '}
            <span className="text-[#dfa9a9] font-medium">{gap_count} gaps</span>
          </p>
        </GlassCard>

        {/* Legend */}
        <div className="flex items-center gap-4 px-1">
          {Object.entries(classificationConfig).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <Icon className={`h-3 w-3 ${config.color}`} />
                <span className="text-[12px] text-[var(--text-soft)]">{config.label}</span>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
          This updates as we learn more about your experience. If something doesn't look right, you can fix it by answering the follow-up questions.
        </div>

        {/* Requirement list — collapsible */}
        <details className="group">
          <summary className="cursor-pointer list-none rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-muted)] transition-colors select-none">
            <span>Requirement Details</span>
          </summary>
          <div className="mt-2 space-y-2">
            {requirements.map((req, i) => (
              <RequirementRow
                key={`req-${req.requirement.slice(0, 40)}-${i}`}
                item={req}
                userContext={userContextMap[i] ?? ''}
                onUserContextChange={(value) => setUserContextMap((prev) => ({ ...prev, [i]: value }))}
              />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
