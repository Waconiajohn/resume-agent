/**
 * ContextLoadedBadge
 *
 * A subtle badge shown in room headers to indicate which saved materials are
 * helping power the current room. Helps users understand that prior profile,
 * positioning, and evidence work is being reused without surfacing raw data or
 * cluttering the UI.
 *
 * Renders nothing if:
 *   - Context is still loading
 *   - No relevant context exists for this room
 *   - The user has no saved context for this room
 */

import { usePlatformContextSummary } from '@/hooks/usePlatformContextSummary';
import { cn } from '@/lib/utils';

// Human-readable labels for each context type
const CONTEXT_LABELS: Record<string, string> = {
  career_profile: 'career profile',
  positioning_strategy: 'positioning strategy',
  evidence_item: 'evidence items',
  career_narrative: 'career narrative',
  client_profile: 'client profile',
  positioning_foundation: 'positioning foundation',
  benchmark_candidate: 'benchmark profile',
  gap_analysis: 'gap analysis',
  emotional_baseline: 'emotional baseline',
};

// Priority order for selecting which label to surface in the badge
const PRIORITY_ORDER = [
  'career_profile',
  'positioning_strategy',
  'career_narrative',
  'evidence_item',
  'benchmark_candidate',
  'gap_analysis',
  'client_profile',
  'positioning_foundation',
  'emotional_baseline',
];

interface ContextLoadedBadgeProps {
  /** The context types this room uses — determines badge visibility and label */
  contextTypes: string[];
  className?: string;
}

export function ContextLoadedBadge({ contextTypes, className }: ContextLoadedBadgeProps) {
  const { items, loading } = usePlatformContextSummary();

  if (loading || items.length === 0) return null;

  // Filter to types this room actually uses
  const relevant = items.filter((i) => contextTypes.includes(i.context_type));
  if (relevant.length === 0) return null;

  // Select the highest-priority type to surface in the label
  let primary = relevant[0];
  for (const type of PRIORITY_ORDER) {
    const match = relevant.find((i) => i.context_type === type);
    if (match) {
      primary = match;
      break;
    }
  }

  const label = CONTEXT_LABELS[primary.context_type] ?? primary.context_type;

  // Format relative date
  const date = new Date(primary.updated_at);
  const daysAgo = Math.round((Date.now() - date.getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const dateStr = rtf.format(-daysAgo, 'day');

  const otherCount = relevant.length - 1;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
        'bg-[var(--link)]/10 border border-[var(--link)]/20',
        'text-[12px] text-[var(--link)]/80',
        className,
      )}
    >
      <svg
        className="w-3 h-3 text-[var(--link)]/60 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        Using saved {label} from {dateStr}
        {otherCount > 0 && ` + ${otherCount} more`}
      </span>
    </div>
  );
}
