import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import type { MasterResumeEvidenceItem } from '@/types/resume';

const SOURCE_CONFIG: Record<MasterResumeEvidenceItem['source'], { label: string; classes: string }> = {
  crafted: { label: 'Crafted', classes: 'bg-[var(--badge-blue-bg)] text-[var(--link)] border-[var(--link)]/30' },
  upgraded: { label: 'Upgraded', classes: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border-[var(--badge-green-text)]/30' },
  interview: { label: 'Interview', classes: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/30' },
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
          <p className="mb-2 text-xs leading-relaxed text-[var(--text-muted)]">{item.text}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]', cfg.classes)}>
              {cfg.label}
            </span>
            {item.category && (
              <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-soft)]">
                {item.category}
              </span>
            )}
          </div>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-[var(--text-soft)] transition-colors hover:text-[var(--badge-red-text)]"
            aria-label="Delete evidence item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </GlassCard>
  );
}
