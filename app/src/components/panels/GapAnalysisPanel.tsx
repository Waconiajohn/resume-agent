import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { GapAnalysisData, RequirementFitItem } from '@/types/panels';

interface GapAnalysisPanelProps {
  data: GapAnalysisData;
}

const classificationConfig = {
  strong: {
    icon: CheckCircle,
    color: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/15',
    label: 'Strong',
  },
  partial: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/15',
    label: 'Partial',
  },
  gap: {
    icon: XCircle,
    color: 'text-red-400',
    border: 'border-red-500/20',
    bg: 'bg-red-500/15',
    label: 'Gap',
  },
};

function RequirementRow({ item }: { item: RequirementFitItem }) {
  const config = classificationConfig[item.classification] ?? classificationConfig.gap;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-3`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90">{item.requirement}</p>
          {item.evidence && (
            <p className="mt-1 text-xs text-white/70">{item.evidence}</p>
          )}
          {item.strategy && (
            <p className="mt-1 text-xs text-blue-300 italic">{item.strategy}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function GapAnalysisPanel({ data }: GapAnalysisPanelProps) {
  const requirements = data.requirements ?? [];
  const { strong_count = 0, partial_count = 0, gap_count = 0, total = 0, addressed = 0 } = data;

  const progressPct = total > 0 ? Math.round((addressed / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Gap Analysis</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Progress bar */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/70">Requirements Addressed</span>
            <span className="text-xs font-medium text-white/85">
              {addressed} of {total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.10] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </GlassCard>

        {/* Count badges */}
        <div className="grid grid-cols-3 gap-2">
          <GlassCard className="p-3 text-center">
            <span className="text-lg font-semibold text-emerald-400">{strong_count}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Strong
            </span>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <span className="text-lg font-semibold text-amber-400">{partial_count}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Partial
            </span>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <span className="text-lg font-semibold text-red-400">{gap_count}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Gap
            </span>
          </GlassCard>
        </div>

        {/* Requirement list */}
        <div className="space-y-2">
          {requirements.map((req, i) => (
            <RequirementRow key={i} item={req} />
          ))}
        </div>
      </div>
    </div>
  );
}
