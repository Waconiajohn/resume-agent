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
import type { GapChatContext } from '@/types/resume-v2';

export type EnhanceAction = 'show_transformation' | 'demonstrate_leadership' | 'connect_to_role' | 'show_accountability';

export interface EnhanceButtonBarProps {
  onEnhance: (action: EnhanceAction) => void;
  isEnhancing: boolean;
  activeAction: string | null;
  disabled?: boolean;
  lineKind?: GapChatContext['lineKind'];
  sectionLabel?: string;
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

function isAISection(sectionLabel?: string): boolean {
  return /\b(ai|artificial intelligence|genai|llm|automation)\b/i.test(sectionLabel ?? '');
}

function getEnhanceButtons(
  lineKind?: GapChatContext['lineKind'],
  sectionLabel?: string,
): { eyebrow: string; buttons: EnhanceButtonDef[] } {
  if (lineKind === 'summary') {
    return {
      eyebrow: 'AI summary upgrades',
      buttons: [
        {
          action: 'show_transformation',
          label: 'Sharpen opening story',
          icon: ArrowRightLeft,
          bgVar: 'var(--badge-amber-bg)',
          textVar: 'var(--badge-amber-text)',
          ariaLabel: 'Rewrite this summary to tell a sharper leadership and transformation story',
        },
        {
          action: 'demonstrate_leadership',
          label: 'Show leadership scope',
          icon: Users,
          bgVar: 'var(--badge-blue-bg)',
          textVar: 'var(--badge-blue-text)',
          ariaLabel: 'Rewrite this summary to foreground leadership scope and people leadership',
        },
        {
          action: 'connect_to_role',
          label: 'Match this role',
          icon: Target,
          bgVar: 'var(--badge-green-bg)',
          textVar: 'var(--badge-green-text)',
          ariaLabel: 'Rewrite this summary to match the target role more directly',
        },
        {
          action: 'show_accountability',
          label: 'Add business impact',
          icon: Shield,
          bgVar: 'var(--badge-purple-bg)',
          textVar: 'var(--badge-purple-text)',
          ariaLabel: 'Rewrite this summary to show ownership, standards, and business impact',
        },
      ],
    };
  }

  if (lineKind === 'competency') {
    return {
      eyebrow: 'AI keyword upgrades',
      buttons: [
        {
          action: 'show_transformation',
          label: 'Tighten keyword',
          icon: ArrowRightLeft,
          bgVar: 'var(--badge-amber-bg)',
          textVar: 'var(--badge-amber-text)',
          ariaLabel: 'Rewrite this competency as a sharper ATS-friendly keyword phrase',
        },
        {
          action: 'demonstrate_leadership',
          label: 'Show leadership',
          icon: Users,
          bgVar: 'var(--badge-blue-bg)',
          textVar: 'var(--badge-blue-text)',
          ariaLabel: 'Rewrite this competency to better signal leadership capability',
        },
        {
          action: 'connect_to_role',
          label: 'Match the role',
          icon: Target,
          bgVar: 'var(--badge-green-bg)',
          textVar: 'var(--badge-green-text)',
          ariaLabel: 'Rewrite this competency in language closer to the target role',
        },
        {
          action: 'show_accountability',
          label: 'Show operating rigor',
          icon: Shield,
          bgVar: 'var(--badge-purple-bg)',
          textVar: 'var(--badge-purple-text)',
          ariaLabel: 'Rewrite this competency to signal operating discipline and accountability',
        },
      ],
    };
  }

  if (lineKind === 'section_summary' || lineKind === 'custom_line') {
    const aiSection = isAISection(sectionLabel);
    return {
      eyebrow: aiSection ? 'AI section upgrades' : 'AI section upgrades',
      buttons: [
        {
          action: 'show_transformation',
          label: aiSection ? 'Show AI transformation' : 'Sharpen section story',
          icon: ArrowRightLeft,
          bgVar: 'var(--badge-amber-bg)',
          textVar: 'var(--badge-amber-text)',
          ariaLabel: aiSection
            ? 'Rewrite this line to show AI transformation more clearly'
            : 'Rewrite this line to sharpen the section story',
        },
        {
          action: 'demonstrate_leadership',
          label: aiSection ? 'Show change leadership' : 'Show leadership',
          icon: Users,
          bgVar: 'var(--badge-blue-bg)',
          textVar: 'var(--badge-blue-text)',
          ariaLabel: aiSection
            ? 'Rewrite this line to show change leadership in AI or automation work'
            : 'Rewrite this line to show leadership more clearly',
        },
        {
          action: 'connect_to_role',
          label: 'Match this role',
          icon: Target,
          bgVar: 'var(--badge-green-bg)',
          textVar: 'var(--badge-green-text)',
          ariaLabel: 'Rewrite this line to match the target role more directly',
        },
        {
          action: 'show_accountability',
          label: 'Show business impact',
          icon: Shield,
          bgVar: 'var(--badge-purple-bg)',
          textVar: 'var(--badge-purple-text)',
          ariaLabel: 'Rewrite this line to show accountability and business impact',
        },
      ],
    };
  }

  return {
    eyebrow: 'One-click AI improvements',
    buttons: ENHANCE_BUTTONS,
  };
}

export function EnhanceButtonBar({
  onEnhance,
  isEnhancing,
  activeAction,
  disabled = false,
  lineKind,
  sectionLabel,
}: EnhanceButtonBarProps) {
  const isDisabled = isEnhancing || disabled;
  const config = getEnhanceButtons(lineKind, sectionLabel);

  return (
    <div className="space-y-1.5">
      <span
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-soft)' }}
      >
        {config.eyebrow}
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Bullet enhancement actions">
      {config.buttons.map(({ action, label, icon: Icon, bgVar, textVar, ariaLabel }) => {
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
