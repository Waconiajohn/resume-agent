/**
 * EnhanceButtonBar — Three one-click AI enhancement actions.
 *
 * Gives the user a fast path to improving a bullet without needing to type
 * anything. Each button maps to a focused AI transformation: add real numbers,
 * sharpen the business impact, or replace vague language with specifics.
 *
 * The active button shows a spinner while the enhancement is in progress.
 * All buttons are disabled while any enhancement is running.
 */

import { BarChart3, Zap, Target, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EnhanceAction = 'add_metrics' | 'strengthen_impact' | 'be_specific';

export interface EnhanceButtonBarProps {
  onEnhance: (action: EnhanceAction) => void;
  isEnhancing: boolean;
  activeAction: string | null;
  disabled?: boolean;
}

interface EnhanceButtonDef {
  action: EnhanceAction;
  label: string;
  icon: React.ElementType;
  bgVar: string;
  textVar: string;
  ariaLabel: string;
}

const ENHANCE_BUTTONS: EnhanceButtonDef[] = [
  {
    action: 'add_metrics',
    label: 'Add Metrics',
    icon: BarChart3,
    bgVar: 'var(--badge-amber-bg)',
    textVar: 'var(--badge-amber-text)',
    ariaLabel: 'Add metrics to this bullet',
  },
  {
    action: 'strengthen_impact',
    label: 'Strengthen Impact',
    icon: Zap,
    bgVar: 'var(--badge-blue-bg)',
    textVar: 'var(--badge-blue-text)',
    ariaLabel: 'Strengthen the business impact of this bullet',
  },
  {
    action: 'be_specific',
    label: 'Be More Specific',
    icon: Target,
    bgVar: 'var(--badge-green-bg)',
    textVar: 'var(--badge-green-text)',
    ariaLabel: 'Make this bullet more specific',
  },
];

export function EnhanceButtonBar({
  onEnhance,
  isEnhancing,
  activeAction,
  disabled = false,
}: EnhanceButtonBarProps) {
  const isDisabled = isEnhancing || disabled;

  return (
    <div className="space-y-1.5">
      <span
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-soft)' }}
      >
        One-click AI improvements
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Bullet enhancement actions">
      {ENHANCE_BUTTONS.map(({ action, label, icon: Icon, bgVar, textVar, ariaLabel }) => {
          const isActive = activeAction === action && isEnhancing;

          return (
            <button
              key={action}
              type="button"
              onClick={() => !isDisabled && onEnhance(action)}
              disabled={isDisabled}
              aria-label={ariaLabel}
              aria-busy={isActive}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2',
                isDisabled && !isActive && 'cursor-not-allowed opacity-50',
                isActive && 'opacity-80',
              )}
              style={{
                background: bgVar,
                color: textVar,
                border: `1px solid ${textVar}`,
              }}
            >
              {isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
