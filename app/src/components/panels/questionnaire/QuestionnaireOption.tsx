import { CheckCircle2 } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import { cn } from '@/lib/utils';
import type { QuestionnaireOption as QuestionnaireOptionType } from '@/types/session';

const SOURCE_BADGE: Record<NonNullable<QuestionnaireOptionType['source']>, { label: string; className: string }> = {
  resume: {
    label: 'From Resume',
    className: 'border border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-muted)]',
  },
  jd: {
    label: 'From JD',
    className: 'border border-[#afc4ff]/25 bg-[#afc4ff]/[0.06] text-[#afc4ff]/70',
  },
  inferred: {
    label: 'Inferred',
    className: 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)]',
  },
  system: {
    label: 'System',
    className: 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)]',
  },
};

interface QuestionnaireOptionProps {
  option: QuestionnaireOptionType;
  isSelected: boolean;
  selectionMode: 'single' | 'multi';
  onClick: () => void;
}

export function QuestionnaireOption({ option, isSelected, selectionMode, onClick }: QuestionnaireOptionProps) {
  const badge = option.source ? SOURCE_BADGE[option.source] : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <GlassCard
      className={cn(
        'p-3.5 cursor-pointer transition-all duration-200 min-h-[44px]',
        isSelected
          ? 'border-[var(--line-strong)] bg-[var(--surface-1)] shadow-[0_0_20px_-10px_rgba(255,255,255,0.4)]'
          : 'hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)]',
      )}
      role={selectionMode === 'single' ? 'radio' : 'checkbox'}
      tabIndex={0}
      aria-checked={isSelected}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-3">
        {/* Selection indicator */}
        {selectionMode === 'single' ? (
          /* Radio circle */
          <div
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center',
              isSelected ? 'border-[var(--text-muted)] bg-[var(--text-muted)]' : 'border-[var(--text-soft)] bg-transparent',
            )}
            aria-hidden="true"
          >
            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
          </div>
        ) : (
          /* Checkbox square */
          <div
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition-all duration-200 flex items-center justify-center',
              isSelected ? 'border-[#9eb8ff]/80 bg-[#9eb8ff]/30' : 'border-[var(--text-soft)] bg-transparent',
            )}
            aria-hidden="true"
          >
            {isSelected && (
              <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-medium leading-snug',
                isSelected ? 'text-[var(--text-strong)]' : 'text-[var(--text-strong)]',
              )}
            >
              {option.label}
            </span>
            {badge && (
            <span
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-wider',
                badge.className,
              )}
            >
                {badge.label}
              </span>
            )}
          </div>
          {option.description && (
            <p className="mt-1 text-xs text-[var(--text-soft)] leading-relaxed">{option.description}</p>
          )}
        </div>

        {/* Selected checkmark (single mode only) */}
        {isSelected && selectionMode === 'single' && (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        )}
      </div>
    </GlassCard>
  );
}
