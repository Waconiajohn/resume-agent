import { Briefcase, Award, Users, TrendingUp, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import type { OnboardingSummaryData } from '@/types/panels';

interface OnboardingSummaryPanelProps {
  data: OnboardingSummaryData;
}

interface StatCard {
  label: string;
  value: string | number | undefined;
  icon: typeof TrendingUp;
}

/**
 * Normalize data from two possible shapes:
 * 1. Flat (from create_master_resume emit): { years_of_experience, companies_count, skills_count, strengths }
 * 2. Nested (from agent update_right_panel): { stats: { years_of_experience, total_companies, ... }, standout_strengths, immediate_observations }
 */
function normalizeData(data: OnboardingSummaryData & Record<string, unknown>) {
  const stats = (data.stats ?? {}) as Record<string, unknown>;

  const cards: StatCard[] = [
    {
      label: 'Years Experience',
      value: data.years_of_experience ?? (stats.years_of_experience as string | number | undefined),
      icon: TrendingUp,
    },
    {
      label: 'Companies',
      value: data.companies_count ?? (stats.total_companies as string | number | undefined),
      icon: Briefcase,
    },
    {
      label: 'Skills Identified',
      value: data.skills_count ?? (stats.total_skills as string | number | undefined),
      icon: Award,
    },
    {
      label: 'Leadership Span',
      value: data.leadership_span ?? (stats.team_sizes_led as string | undefined),
      icon: Users,
    },
    {
      label: 'Budget Scope',
      value: data.budget_responsibility ?? (stats.budget_experience as string | undefined),
      icon: DollarSign,
    },
  ];

  const strengths: string[] =
    data.strengths ??
    (data.standout_strengths as string[] | undefined) ??
    [];

  const opportunities: string[] =
    data.opportunities ??
    (data.immediate_observations as string[] | undefined) ??
    [];

  const parseConfidence = (
    data.parse_confidence === 'high' || data.parse_confidence === 'medium' || data.parse_confidence === 'low'
      ? data.parse_confidence
      : undefined
  );
  const parseWarnings = Array.isArray(data.parse_warnings)
    ? data.parse_warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return { cards, strengths, opportunities, parseConfidence, parseWarnings };
}

export function OnboardingSummaryPanel({ data }: OnboardingSummaryPanelProps) {
  const { cards, strengths, opportunities, parseConfidence, parseWarnings } = normalizeData(data as OnboardingSummaryData & Record<string, unknown>);
  const confidenceTone = parseConfidence === 'high'
    ? 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100/90'
    : parseConfidence === 'medium'
      ? 'border-amber-300/20 bg-amber-400/[0.06] text-amber-100/90'
      : 'border-rose-300/20 bg-rose-400/[0.06] text-rose-100/90';
  const confidenceLabel = parseConfidence === 'high'
    ? 'High confidence parse'
    : parseConfidence === 'medium'
      ? 'Review parse details'
      : 'Low confidence parse';

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Resume Snapshot</span>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="intake"
          tone="review"
          userDoesOverride="Confirm the resume snapshot looks right. If key roles or dates are missing, fix the source resume before moving on."
        />

        {(parseConfidence || parseWarnings.length > 0) && (
          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              {parseConfidence && (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${confidenceTone}`}>
                  {confidenceLabel}
                </span>
              )}
              <span className="text-[11px] text-white/58">
                This snapshot is auto-parsed from the uploaded resume and drives the rest of the workflow.
              </span>
            </div>
            {parseWarnings.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {parseWarnings.map((warning, i) => (
                  <div key={`${warning.slice(0, 32)}-${i}`} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" />
                    <span className="text-xs text-white/72">{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map(({ label, value, icon: Icon }, i) => {
            if (value == null) return null;
            return (
              <GlassCard key={label} className="opacity-0 animate-card-stagger p-3" style={{ animationDelay: `${i * 75}ms` }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-[#afc4ff]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {label}
                  </span>
                </div>
                <span className="text-lg font-semibold text-white">{String(value)}</span>
              </GlassCard>
            );
          })}
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
              Initial Strengths
            </h3>
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a8d7b8]" />
                  <span className="text-sm text-white/90">{s}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Opportunities */}
        {opportunities.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
              Opportunities to Address
            </h3>
            <div className="space-y-2">
              {opportunities.map((o, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/58" />
                  <span className="text-sm text-white/90">{o}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
