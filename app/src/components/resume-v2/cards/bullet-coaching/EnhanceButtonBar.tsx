/**
 * EnhanceButtonBar — Four one-click AI enhancement actions.
 *
 * Gives the user a fast path to improving a bullet without needing to type
 * anything. Each button maps to a focused AI transformation: show the full
 * story behind an accomplishment, demonstrate leadership through people,
 * connect experience to the target role, or show accountability and resilience.
 *
 * The active button shows a spinner while the enhancement is in progress.
 * All buttons are disabled while any enhancement is running.
 */

import { ArrowRightLeft, Users, Target, Shield, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EnhanceAction = 'show_transformation' | 'demonstrate_leadership' | 'connect_to_role' | 'show_accountability';

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
    action: 'show_transformation',
    label: 'Show Transformation',
    icon: ArrowRightLeft,
    bgVar: 'var(--badge-amber-bg)',
    textVar: 'var(--badge-amber-text)',
    ariaLabel: 'Rewrite bullet to show before-state, action, and transformation',
  },
  {
    action: 'demonstrate_leadership',
    label: 'Show Leadership',
    icon: Users,
    bgVar: 'var(--badge-blue-bg)',
    textVar: 'var(--badge-blue-text)',
    ariaLabel: 'Rewrite bullet to demonstrate leadership through people',
  },
  {
    action: 'connect_to_role',
    label: 'Connect to Role',
    icon: Target,
    bgVar: 'var(--badge-green-bg)',
    textVar: 'var(--badge-green-text)',
    ariaLabel: 'Rewrite bullet to explicitly connect this experience to the target role',
  },
  {
    action: 'show_accountability',
    label: 'Show Accountability',
    icon: Shield,
    bgVar: 'var(--badge-purple-bg)',
    textVar: 'var(--badge-purple-text)',
    ariaLabel: 'Rewrite bullet to show accountability, standards, and resilience',
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
