import { ArrowRight, Tag } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { LiveResumeData, SectionChange } from '@/types/panels';

interface LiveResumePanelProps {
  data: LiveResumeData;
}

function sectionTitle(section: string): string {
  return section
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ChangeBlock({ change }: { change: SectionChange }) {
  return (
    <GlassCard className="p-4 space-y-3">
      {/* Original → Proposed */}
      <div className="space-y-2">
        {change.original && (
          <div className="rounded-lg border border-red-500/10 bg-red-500/[0.08] p-3">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-red-400">
              Original
            </span>
            <p className="text-xs text-white/70 leading-relaxed line-through decoration-red-400/30">
              {change.original}
            </p>
          </div>
        )}

        {change.original && change.proposed && (
          <div className="flex justify-center">
            <ArrowRight className="h-3.5 w-3.5 text-white/20" />
          </div>
        )}

        {change.proposed && (
          <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.08] p-3">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Proposed
            </span>
            <p className="text-xs text-white/90 leading-relaxed">{change.proposed}</p>
          </div>
        )}
      </div>

      {/* Reasoning */}
      {change.reasoning && (
        <p className="text-xs text-white/60 italic">{change.reasoning}</p>
      )}

      {/* JD Requirement Tags */}
      {change.jd_requirements?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {change.jd_requirements.map((req, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300"
            >
              <Tag className="h-2.5 w-2.5" />
              {req}
            </span>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export function LiveResumePanel({ data }: LiveResumePanelProps) {
  const active_section = data.active_section ?? '';
  const changes = data.changes ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/85">Live Changes</span>
          <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-medium text-blue-300">
            {sectionTitle(active_section)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {changes.map((change, i) => (
          <ChangeBlock key={i} change={change} />
        ))}
      </div>
    </div>
  );
}
