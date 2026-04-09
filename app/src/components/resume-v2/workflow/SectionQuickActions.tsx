import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionRefineActionId, SectionRefineActionOption } from '@/lib/section-draft-refinement';

interface SectionQuickActionsProps {
  primaryActions: SectionRefineActionOption[];
  secondaryActions: SectionRefineActionOption[];
  onRefine: (actionId: SectionRefineActionId) => void;
  onEdit: () => void;
  refiningActionId?: SectionRefineActionId | null;
  showMore: boolean;
  onToggleMore: () => void;
}

export function SectionQuickActions({
  primaryActions,
  secondaryActions,
  onRefine,
  onEdit,
  refiningActionId,
  showMore,
  onToggleMore,
}: SectionQuickActionsProps) {
  return (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        Quick AI Changes
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
        Nudge this section in one obvious direction without starting over.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {primaryActions.map((action) => {
          const isActive = refiningActionId === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onRefine(action.id)}
              disabled={Boolean(refiningActionId)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
                isActive
                  ? 'border-[var(--link)] bg-[var(--badge-blue-bg)] text-[var(--link)]'
                  : 'border-[var(--line-soft)] text-[var(--text-soft)] hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]',
                refiningActionId && !isActive && 'cursor-not-allowed opacity-60',
              )}
            >
              {isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {action.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onEdit}
          disabled={Boolean(refiningActionId)}
          className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Edit it myself
        </button>
        {secondaryActions.length > 0 && (
          <button
            type="button"
            onClick={onToggleMore}
            disabled={Boolean(refiningActionId)}
            className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showMore ? 'Hide more AI options' : 'More AI options'}
          </button>
        )}
      </div>

      {showMore && secondaryActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {secondaryActions.map((action) => {
            const isActive = refiningActionId === action.id;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onRefine(action.id)}
                disabled={Boolean(refiningActionId)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
                  isActive
                    ? 'border-[var(--link)] bg-[var(--badge-blue-bg)] text-[var(--link)]'
                    : 'border-[var(--line-soft)] text-[var(--text-soft)] hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]',
                  refiningActionId && !isActive && 'cursor-not-allowed opacity-60',
                )}
              >
                {isActive ? 'Working…' : action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
