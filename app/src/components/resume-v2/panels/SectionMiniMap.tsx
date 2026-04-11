/**
 * SectionMiniMap — Clickable section-level progress indicator.
 *
 * Shows each resume section as a row with a colored status dot and flagged count.
 * Designed to live inside ResumeCoachPanel's overview and coaching states.
 */

import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionMiniMapSection {
  key: string;
  label: string;
  flaggedCount: number;
  totalCount: number;
  status: 'strong' | 'needs_attention' | 'mixed';
}

export interface SectionMiniMapProps {
  sections: SectionMiniMapSection[];
  onSectionClick: (sectionKey: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusDotStyle(status: SectionMiniMapSection['status']): React.CSSProperties {
  switch (status) {
    case 'strong':
      return { backgroundColor: 'var(--badge-green-text)' };
    case 'mixed':
      return { backgroundColor: 'var(--badge-amber-text)' };
    case 'needs_attention':
      return { backgroundColor: 'var(--badge-red-text)' };
    default:
      return { backgroundColor: 'var(--text-soft)' };
  }
}

function statusAriaLabel(status: SectionMiniMapSection['status']): string {
  switch (status) {
    case 'strong':
      return 'strong';
    case 'mixed':
      return 'mixed';
    case 'needs_attention':
      return 'needs attention';
    default:
      return 'unknown';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SectionMiniMap({ sections, onSectionClick }: SectionMiniMapProps) {
  if (sections.length === 0) return null;

  return (
    <ul
      className="space-y-0.5"
      role="list"
      aria-label="Resume sections"
    >
      {sections.map((section) => (
        <li key={section.key}>
          <button
            type="button"
            onClick={() => onSectionClick(section.key)}
            className={cn(
              'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
              'transition-colors duration-150',
              'hover:bg-[var(--surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
            )}
            aria-label={`${section.label}${section.flaggedCount > 0 ? `, ${section.flaggedCount} flagged` : ''}, status: ${statusAriaLabel(section.status)}`}
          >
            {/* Status dot */}
            <span
              className="mt-px h-2 w-2 shrink-0 rounded-full"
              style={statusDotStyle(section.status)}
              aria-hidden="true"
            />

            {/* Label */}
            <span
              className="flex-1 truncate text-[13px] leading-5"
              style={{ color: 'var(--text-soft)' }}
            >
              {section.label}
            </span>

            {/* Flagged count badge */}
            {section.flaggedCount > 0 && (
              <span
                className="shrink-0 text-[12px] font-medium tabular-nums"
                style={{ color: 'var(--badge-amber-text)' }}
                aria-hidden="true"
              >
                ({section.flaggedCount})
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
