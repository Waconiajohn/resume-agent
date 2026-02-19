import { CheckCircle2 } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import { cn } from '@/lib/utils';
import type { QuestionnaireOption as QuestionnaireOptionType } from '@/types/session';

const SOURCE_BADGE: Record<NonNullable<QuestionnaireOptionType['source']>, { label: string; className: string }> = {
  resume: {
    label: 'From Resume',
    className: 'border border-white/[0.14] bg-white/[0.06] text-white/76',
  },
  jd: {
    label: 'From JD',
    className: 'border border-[#afc4ff]/25 bg-[#afc4ff]/[0.06] text-[#afc4ff]/70',
  },
  inferred: {
    label: 'Inferred',
    className: 'bg-white/[0.08] text-white/50 border border-white/10',
  },
  system: {
    label: 'System',
    className: 'bg-white/[0.05] text-white/40 border border-white/[0.08]',
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

  return (
    <GlassCard
      className={cn(
        'p-3.5 cursor-pointer transition-all duration-200 min-h-[44px]',
        isSelected
          ? 'border-white/[0.2] bg-white/[0.08] shadow-[0_0_20px_-10px_rgba(255,255,255,0.4)]'
          : 'hover:border-white/20 hover:bg-white/[0.10]',
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Selection indicator */}
        {selectionMode === 'single' ? (
          /* Radio circle */
          <div
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center',
              isSelected ? 'border-white/70 bg-white/70' : 'border-white/30 bg-transparent',
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
              isSelected ? 'border-[#9eb8ff]/80 bg-[#9eb8ff]/30' : 'border-white/30 bg-transparent',
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
                isSelected ? 'text-white' : 'text-white/85',
              )}
            >
              {option.label}
            </span>
            {badge && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            )}
          </div>
          {option.description && (
            <p className="mt-1 text-xs text-white/60 leading-relaxed">{option.description}</p>
          )}
        </div>

        {/* Selected checkmark (single mode only) */}
        {isSelected && selectionMode === 'single' && (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/74" aria-hidden="true" />
        )}
      </div>
    </GlassCard>
  );
}
