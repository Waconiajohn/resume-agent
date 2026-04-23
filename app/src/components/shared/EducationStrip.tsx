import { useCallback, useId, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EducationStripProps {
  /** localStorage key suffix for dismissal persistence. */
  screenId: string;
  /** Short screen name shown in the collapsed affordance. */
  title: string;
  whatThisIs: string;
  whyItMatters: string;
  whatWeDo: string;
  whatYouDo: string;
  /**
   * Whether the strip starts expanded on the user's first visit. The prop
   * is only consulted when localStorage has no value for this screenId —
   * once the user toggles the strip, their preference wins from then on.
   */
  defaultExpanded?: boolean;
  className?: string;
}

type StoredState = 'expanded' | 'collapsed';

function storageKey(screenId: string): string {
  return `eduStrip:${screenId}`;
}

function readStored(screenId: string): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(screenId));
    if (raw === 'expanded' || raw === 'collapsed') return raw;
    return null;
  } catch {
    return null;
  }
}

function writeStored(screenId: string, value: StoredState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(screenId), value);
  } catch {
    // Swallow storage errors — persistence is a convenience, not required.
  }
}

export function EducationStrip({
  screenId,
  title,
  whatThisIs,
  whyItMatters,
  whatWeDo,
  whatYouDo,
  defaultExpanded = true,
  className,
}: EducationStripProps) {
  const contentId = useId();

  const [open, setOpen] = useState<boolean>(() => {
    const stored = readStored(screenId);
    if (stored === 'expanded') return true;
    if (stored === 'collapsed') return false;
    return defaultExpanded;
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      writeStored(screenId, next ? 'expanded' : 'collapsed');
      return next;
    });
  }, [screenId]);

  return (
    <div
      className={cn(
        'support-callout px-3.5 py-3',
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          'flex w-full items-center gap-2 rounded-[6px] text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/60',
        )}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--link)]/78" aria-hidden="true" />
        <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--link)]/78">
          About this screen
        </span>
        <span
          className="truncate text-[13px] text-[var(--text-soft)]"
          aria-hidden="true"
        >
          · {title}
        </span>
        <span className="ml-auto flex-shrink-0 text-[var(--text-soft)]" aria-hidden="true">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <EducationBody
          id={contentId}
          whatThisIs={whatThisIs}
          whyItMatters={whyItMatters}
          whatWeDo={whatWeDo}
          whatYouDo={whatYouDo}
        />
      )}
    </div>
  );
}

function EducationBody({
  id,
  whatThisIs,
  whyItMatters,
  whatWeDo,
  whatYouDo,
}: {
  id: string;
  whatThisIs: string;
  whyItMatters: string;
  whatWeDo: string;
  whatYouDo: string;
}) {
  const body: ReactNode = `${whatThisIs} ${whyItMatters} ${whatWeDo} ${whatYouDo}`;
  return (
    <div id={id} role="region" aria-label="About this screen">
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{body}</p>
    </div>
  );
}
