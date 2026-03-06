/**
 * IntelligenceActivityFeed.tsx
 *
 * Compact, scrollable activity feed that shows a running log of
 * transparency/activity messages from the pipeline. Most recent
 * message appears at the bottom with the highest opacity; older
 * messages fade toward the top.
 */

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityMessage {
  id: string;
  message: string;
  timestamp: number;
  stage?: string;
  isSummary?: boolean;
}

export interface IntelligenceActivityFeedProps {
  messages: ActivityMessage[];
  isProcessing: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE_MESSAGES = 10;

/** Consumer-friendly translations for developer log messages */
const CONSUMER_MESSAGE_MAP: [RegExp, string][] = [
  [/analyzing jd requirements/i, 'Reading what the company is looking for...'],
  [/building benchmark candidate profile/i, 'Understanding the ideal candidate for this role...'],
  [/classifying fit/i, 'Comparing your experience to what they need...'],
  [/writing section:\s*summary/i, 'Writing your professional summary...'],
  [/writing section:\s*(.+)/i, 'Writing your $1 section...'],
  [/self[- ]review/i, 'Reviewing the draft for quality...'],
  [/adversarial review/i, 'Running a final quality check...'],
  [/parsing resume/i, 'Reading your resume...'],
  [/extracting jd/i, 'Studying the job posting...'],
  [/research.*company/i, 'Researching the company...'],
  [/build.*benchmark/i, 'Understanding the ideal candidate...'],
  [/gap.*analysis/i, 'Checking how your experience matches...'],
  [/design.*blueprint/i, 'Planning the best structure for your resume...'],
  [/ats.*compliance/i, 'Checking compatibility with hiring systems...'],
  [/keyword.*coverage/i, 'Ensuring your resume uses the right keywords...'],
];

function translateMessage(raw: string): string {
  for (const [pattern, replacement] of CONSUMER_MESSAGE_MAP) {
    if (pattern.test(raw)) {
      return raw.replace(pattern, replacement);
    }
  }
  return 'Working on your resume...';
}

/**
 * Returns a graduated opacity class based on position from the bottom.
 * Position 0 = most recent (bottom), higher = older.
 */
function opacityForPosition(position: number, total: number): string {
  if (position === 0) return 'text-white/85';
  if (total <= 1) return 'text-white/85';

  // Graduated from white/50 (oldest) to white/75 (one before newest)
  const ratio = position / (total - 1);
  // ratio=0 means newest (already handled above), ratio=1 means oldest
  if (ratio > 0.8) return 'text-white/50';
  if (ratio > 0.5) return 'text-white/55';
  if (ratio > 0.3) return 'text-white/62';
  return 'text-white/70';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IntelligenceActivityFeed({
  messages,
  isProcessing,
}: IntelligenceActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const visible = messages.slice(-MAX_VISIBLE_MESSAGES);
  const total = visible.length;

  return (
    <div
      ref={scrollRef}
      className="max-h-[140px] overflow-y-auto rounded-lg border border-white/[0.08] bg-white/[0.03]"
      role="log"
      aria-live="polite"
      aria-label="Progress updates"
    >
      {total === 0 ? (
        <div className="px-3 py-2 text-xs text-white/40">
          {isProcessing ? 'Initializing...' : 'No activity yet.'}
        </div>
      ) : (
        <ul className="py-1">
          {visible.map((msg, index) => {
            // position from bottom: 0 = newest (last in array)
            const positionFromBottom = total - 1 - index;
            const opacityClass = opacityForPosition(positionFromBottom, total);
            const isMostRecent = positionFromBottom === 0;

            return (
              <li
                key={msg.id}
                className={cn(
                  'flex min-w-0 items-baseline gap-2 px-3 py-0.5 text-xs',
                  opacityClass,
                  msg.isSummary && !isMostRecent && 'border-l-2 border-white/[0.12] pl-2',
                  msg.isSummary && isMostRecent && 'border-l-2 border-[#afc4ff]/40 pl-2',
                )}
              >
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {translateMessage(msg.message)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
