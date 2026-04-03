/**
 * AISuggestionCards — 2-3 AI-generated alternative bullet phrasings.
 *
 * Each card shows an angle badge, the full bullet text, and a radio-style
 * selection indicator. The "Accept" button only appears on the selected card.
 * Colors for each angle type come from the theme badge vars.
 */

import { cn } from '@/lib/utils';

export interface AlternativeBullet {
  text: string;
  angle: string;
}

export interface AISuggestionCardsProps {
  alternatives: AlternativeBullet[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onAccept: (text: string) => void;
  disabled?: boolean;
}

type AngleVariant = 'metric' | 'scope' | 'impact';

interface AngleStyle {
  bg: string;
  text: string;
  label: string;
}

function getAngleStyle(angle: string): AngleStyle {
  const normalized = angle.toLowerCase() as AngleVariant;
  switch (normalized) {
    case 'metric':
      return {
        bg: 'var(--badge-amber-bg)',
        text: 'var(--badge-amber-text)',
        label: 'Metric',
      };
    case 'scope':
      return {
        bg: 'var(--badge-blue-bg)',
        text: 'var(--badge-blue-text)',
        label: 'Scope',
      };
    case 'impact':
      return {
        bg: 'var(--badge-green-bg)',
        text: 'var(--badge-green-text)',
        label: 'Impact',
      };
    default:
      return {
        bg: 'var(--badge-blue-bg)',
        text: 'var(--badge-blue-text)',
        label: angle.charAt(0).toUpperCase() + angle.slice(1),
      };
  }
}

export function AISuggestionCards({
  alternatives,
  selectedIndex,
  onSelect,
  onAccept,
  disabled = false,
}: AISuggestionCardsProps) {
  if (alternatives.length === 0) return null;

  return (
    <div className="space-y-2" role="radiogroup" aria-label="Alternative bullet suggestions">
      {alternatives.map((alt, i) => {
        const isSelected = selectedIndex === i;
        const angleStyle = getAngleStyle(alt.angle);

        return (
          <div
            key={`${alt.angle}-${i}-${alt.text.slice(0, 30)}`}
            role="radio"
            aria-checked={isSelected}
            aria-label={alt.text}
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onSelect(i)}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(i);
              }
            }}
            className={cn(
              'relative cursor-pointer rounded-lg border p-3 transition-colors duration-150',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            style={{
              background: isSelected ? 'var(--badge-blue-bg)' : 'var(--surface-1)',
              borderColor: isSelected ? 'var(--badge-blue-text)' : 'var(--line-soft)',
            }}
          >
            {/* Top row: angle badge + radio indicator */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: angleStyle.bg,
                  color: angleStyle.text,
                }}
              >
                {angleStyle.label}
              </span>

              {/* Radio dot */}
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
                )}
                style={{
                  borderColor: isSelected ? 'var(--badge-blue-text)' : 'var(--line-strong)',
                  background: isSelected ? 'var(--badge-blue-bg)' : 'transparent',
                }}
                aria-hidden="true"
              >
                {isSelected && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: 'var(--badge-blue-text)' }}
                  />
                )}
              </span>
            </div>

            {/* Bullet text */}
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: 'var(--text-strong)' }}
            >
              {alt.text}
            </p>

            {/* Accept button — only on selected card */}
            {isSelected && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept(alt.text);
                  }}
                  disabled={disabled}
                  className={cn(
                    'min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                  style={{
                    background: 'var(--badge-blue-bg)',
                    color: 'var(--badge-blue-text)',
                    border: '1px solid var(--badge-blue-text)',
                  }}
                  aria-label={`Accept suggestion: ${alt.text}`}
                >
                  Accept this version
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
