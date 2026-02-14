import { Briefcase, Award, Users, TrendingUp, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { OnboardingSummaryData } from '@/types/panels';

interface OnboardingSummaryPanelProps {
  data: OnboardingSummaryData;
}

const statCards = [
  { key: 'years_of_experience', label: 'Years Experience', icon: TrendingUp },
  { key: 'companies_count', label: 'Companies', icon: Briefcase },
  { key: 'skills_count', label: 'Skills Identified', icon: Award },
  { key: 'leadership_span', label: 'Leadership Span', icon: Users },
  { key: 'budget_responsibility', label: 'Budget Scope', icon: DollarSign },
] as const;

export function OnboardingSummaryPanel({ data }: OnboardingSummaryPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <span className="text-sm font-medium text-white/70">Resume Snapshot</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map(({ key, label, icon: Icon }) => {
            const value = data[key as keyof OnboardingSummaryData];
            if (value == null) return null;
            return (
              <GlassCard key={key} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-blue-400/70" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                    {label}
                  </span>
                </div>
                <span className="text-lg font-semibold text-white/90">{String(value)}</span>
              </GlassCard>
            );
          })}
        </div>

        {/* Strengths */}
        {data.strengths && data.strengths.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              Initial Strengths
            </h3>
            <div className="space-y-2">
              {data.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="text-sm text-white/80">{s}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Opportunities */}
        {data.opportunities && data.opportunities.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              Opportunities to Address
            </h3>
            <div className="space-y-2">
              {data.opportunities.map((o, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="text-sm text-white/80">{o}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
