import { useState } from 'react';
import { Briefcase, Award, Users, TrendingUp, DollarSign, CheckCircle, AlertTriangle, Pencil } from 'lucide-react';
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
  const [editedStats, setEditedStats] = useState<Record<string, string>>({});
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const confidenceTone = parseConfidence === 'high'
    ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] text-[#b5dec2]/90'
    : parseConfidence === 'medium'
      ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] text-[#f0d99f]/90'
      : 'border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.06] text-[#f0b8b8]/90';
  const confidenceLabel = parseConfidence === 'high'
    ? 'Resume read successfully'
    : parseConfidence === 'medium'
      ? 'Some details may need review'
      : 'We may have missed some details';

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <span className="text-sm font-medium text-[var(--text-strong)]">Here's What We Found</span>
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
                <span className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] ${confidenceTone}`}>
                  {confidenceLabel}
                </span>
              )}
              <span className="text-[13px] text-[var(--text-soft)]">
                Here's what we pulled from your resume. Let us know if anything looks off.
              </span>
            </div>
            {parseWarnings.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {parseWarnings.map((warning, i) => (
                  <div key={`${warning.slice(0, 32)}-${i}`} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-soft)]" />
                    <span className="text-xs text-[var(--text-muted)]">{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* Stat cards */}
        <div>
          <div className="mb-2">
            <span className="text-[13px] text-[var(--text-soft)]">What we found in your resume</span>
            <p className="text-[12px] text-[var(--text-soft)] mt-1">Edits are for your reference only and don't affect processing.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.filter(({ value }) => value != null).map(({ label, value, icon: Icon }, i) => {
            const displayValue = editedStats[label] ?? String(value);
            const isEditing = editingLabel === label;
            return (
              <GlassCard key={label} className="motion-safe:opacity-0 motion-safe:animate-card-stagger p-3" style={{ animationDelay: `${i * 75}ms` }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-[#afc4ff]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] flex-1">
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingLabel(isEditing ? null : label)}
                    className="text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
                    aria-label={`Edit ${label}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayValue}
                    onChange={(e) => setEditedStats((prev) => ({ ...prev, [label]: e.target.value }))}
                    onBlur={() => setEditingLabel(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingLabel(null); }}
                    autoFocus
                    className="w-full rounded border border-[var(--line-strong)] bg-[var(--accent-muted)] px-2 py-1 text-sm font-semibold text-[var(--text-strong)] focus:border-[#afc4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
                  />
                ) : (
                  <span className="text-lg font-semibold text-[var(--text-strong)]">{displayValue}</span>
                )}
              </GlassCard>
            );
          })}
          </div>
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Your Standout Strengths
            </h3>
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a8d7b8]" />
                  <span className="text-sm text-[var(--text-strong)]">{s}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Opportunities */}
        {opportunities.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Opportunities to Address
            </h3>
            <div className="space-y-2">
              {opportunities.map((o, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-soft)]" />
                  <span className="text-sm text-[var(--text-strong)]">{o}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
