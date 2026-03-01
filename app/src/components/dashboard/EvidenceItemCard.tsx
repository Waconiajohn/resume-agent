import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import type { MasterResumeEvidenceItem } from '@/types/resume';

const SOURCE_CONFIG: Record<MasterResumeEvidenceItem['source'], { label: string; classes: string }> = {
  crafted: { label: 'Crafted', classes: 'bg-blue-500/20 text-blue-300 border-blue-400/30' },
  upgraded: { label: 'Upgraded', classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' },
  interview: { label: 'Interview', classes: 'bg-amber-500/20 text-amber-300 border-amber-400/30' },
};

interface EvidenceItemCardProps {
  item: MasterResumeEvidenceItem;
  onDelete?: () => void;
}

export function EvidenceItemCard({ item, onDelete }: EvidenceItemCardProps) {
  const cfg = SOURCE_CONFIG[item.source] ?? SOURCE_CONFIG.crafted;

  return (
    <GlassCard className="p-3 relative">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs leading-relaxed text-white/80">{item.text}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', cfg.classes)}>
              {cfg.label}
            </span>
            {item.category && (
              <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50">
                {item.category}
              </span>
            )}
          </div>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
            aria-label="Delete evidence item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </GlassCard>
  );
}
