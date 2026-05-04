/**
 * V3StageProgress — horizontal 6-stage indicator for the v3 pipeline,
 * paired with a persistent list of "why this matters" paragraphs that
 * explain the craft behind each stage.
 *
 * Design: reveal-and-persist. As each stage starts, its card appears in
 * the scrollable region below the progress row. Once revealed, a card
 * stays visible (and its paragraph stays readable) for the rest of the
 * run — so fast stages like Extract (~5s) don't flash past before users
 * can read them. Pending stages render as compact headers so users can
 * see what's coming without seeing the full paragraph prematurely.
 *
 * Visual spec: pending=muted, running=coral with a subtle pulse,
 * complete=coral solid with checkmark, failed=red.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V3Stage, V3StageStatus } from '@/hooks/useV3Pipeline';

interface V3StageProgressProps {
  stageStatus: Record<V3Stage, V3StageStatus>;
  currentStage: V3Stage | null;
}

interface StageCopy {
  id: V3Stage;
  /** Short name shown under each dot. Plain English — no engineering jargon. */
  label: string;
  /** One-line status used in the card header. */
  subDescription: string;
  /** The paragraph shown once the stage has started. Explains the real
   *  craft problem this stage solves. */
  whyThisMatters: string;
  /** Advertised typical duration in seconds. */
  typicalSeconds: number;
}

/**
 * Stage copy. Tone rules (keep these in mind if you edit):
 *   • Conversational, not casual.
 *   • Educational, not condescending.
 *   • Honest about difficulty.
 *   • Grounded in real craft.
 *   • No marketing language.
 */
const STAGES: readonly StageCopy[] = [
  {
    id: 'extract',
    label: 'Reading your resume',
    subDescription: 'Pulling the text out of your file and cleaning it up.',
    whyThisMatters:
      'Resumes come in every format imaginable — DOCX with complex tables, PDFs where text is actually images, files with weird spacing and symbols. The first job is just getting clean text to work with. This sounds simple, but a bad extraction here breaks everything downstream. We take extra care to preserve your structure — job titles, dates, bullet boundaries — so nothing gets scrambled.',
    typicalSeconds: 5,
  },
  {
    id: 'classify',
    label: 'Understanding your career',
    subDescription: 'Figuring out your jobs, accomplishments, and the scope of what you did.',
    whyThisMatters:
      'This is where we read your resume the way an experienced recruiter would. What were your actual roles? Which companies, which dates, which titles? How big was your team? What was your scope? We identify every accomplishment you\u2019ve listed and figure out which ones are the strongest evidence of what you can do. This structured understanding is what makes the rest of the pipeline possible \u2014 without it, we\u2019d be guessing.',
    typicalSeconds: 20,
  },
  {
    id: 'benchmark',
    label: 'Researching the role',
    subDescription: 'Studying what this job actually requires and what a strong candidate looks like.',
    whyThisMatters:
      'Every job posting has two layers \u2014 the explicit requirements (years of experience, specific skills) and the hidden ones (the problem the hiring manager actually needs solved, the type of person who thrives in that culture). We analyze both. We also build a picture of the \u201cideal candidate\u201d for this role so we know what to emphasize from your background. Most AI resume tools skip this step and just keyword-match. That\u2019s why their outputs feel generic.',
    typicalSeconds: 15,
  },
  {
    id: 'strategize',
    label: 'Planning your angle',
    subDescription:
      'Deciding which accomplishments to highlight and how to frame your story for this specific role.',
    whyThisMatters:
      'This is the hardest part of resume writing, and it\u2019s where most people (and most tools) go wrong. Your resume should tell a different story depending on what role you\u2019re targeting. A VP of Operations applying to a retail director role needs a different emphasis than the same person applying to a supply chain role. We decide which of your accomplishments deserve front-page real estate, which roles to describe in depth versus briefly, and what narrative thread ties your career together for this specific opportunity. We also think about objections a hiring manager might have (\u201cthey\u2019ve never worked in our industry\u201d) and how to preempt them. This strategy is what separates a tailored resume from a template.',
    typicalSeconds: 30,
  },
  {
    id: 'write',
    label: 'Writing your resume',
    subDescription:
      'Crafting your summary, accomplishments, and every bullet \u2014 with source attribution on every claim.',
    whyThisMatters:
      'Now we write. But every claim in your new resume has to trace back to something you actually did \u2014 we don\u2019t invent. When we say \u201cScaled revenue from $200M to $470M,\u201d that has to be in your source material somewhere. This is why you can trust what we produce: nothing here is fabricated. We also avoid the language patterns that signal \u201cAI wrote this\u201d to hiring managers \u2014 the empty adjectives, the filler phrases, the tells. We write like a thoughtful executive resume writer would write, not like a chatbot.',
    typicalSeconds: 60,
  },
  {
    id: 'verify',
    label: 'Fact-checking every claim',
    subDescription: 'Making sure every number and detail traces back to your real experience.',
    whyThisMatters:
      'The biggest risk in AI-written content is quiet invention \u2014 the model making up a plausible-sounding number or detail that isn\u2019t real. We protect you from that. Every numeric claim, every named system, every scope qualifier gets checked against your source material. If something doesn\u2019t trace, we flag it for your review \u2014 you decide whether to keep it, edit it, or drop it. We also check for internal consistency (if your summary says \u201cthree facilities\u201d and a bullet says \u201cfour distribution centers,\u201d we\u2019ll catch it). This is the step that makes the difference between \u201cAI-generated resume\u201d and \u201cresume you can actually send to a hiring manager.\u201d',
    typicalSeconds: 40,
  },
] as const;

function dotClass(status: V3StageStatus, current: boolean): string {
  if (status === 'complete') {
    return 'bg-[var(--bullet-confirm)] border-[var(--bullet-confirm)] text-white';
  }
  if (status === 'failed') {
    return 'bg-[var(--badge-red-bg)] border-[var(--badge-red-text)] text-[var(--badge-red-text)]';
  }
  if (status === 'running' || current) {
    return 'bg-[var(--bullet-confirm-bg)] border-[var(--bullet-confirm)] text-[var(--bullet-confirm)] motion-safe:animate-pulse';
  }
  return 'bg-[var(--surface-2)] border-[var(--line-soft)] text-[var(--text-soft)]';
}

function connectorClass(leftStatus: V3StageStatus): string {
  if (leftStatus === 'complete') return 'bg-[var(--bullet-confirm)]';
  if (leftStatus === 'failed') return 'bg-[var(--badge-red-text)] opacity-40';
  return 'bg-[var(--line-soft)]';
}

export function V3StageProgress({ stageStatus, currentStage }: V3StageProgressProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastActiveStageRef = useRef<V3Stage | null>(null);

  const statuses = Object.values(stageStatus) as V3StageStatus[];
  const allComplete = statuses.every((s) => s === 'complete');
  const totalStarted = statuses.filter(
    (s) => s === 'running' || s === 'complete' || s === 'failed',
  ).length;

  // Once the whole pipeline finishes, the "why this matters" card list
  // stops being useful real estate — the user wants to read their resume,
  // not the explanations. Collapse by default on complete; leave a
  // "Show details" toggle so anyone who wants to re-read the reasoning
  // can re-open it. While the pipeline is actively running, the list
  // stays expanded (that's when the explanations are most valuable).
  const [detailsOpen, setDetailsOpen] = useState(true);
  useEffect(() => {
    if (allComplete) setDetailsOpen(false);
  }, [allComplete]);

  // When a stage transitions from pending → running, scroll its card
  // into view inside the bounded list. Uses `block: 'nearest'` so a card
  // already in view doesn\u2019t jump, only off-screen cards are brought in.
  useEffect(() => {
    if (!currentStage) return;
    if (lastActiveStageRef.current === currentStage) return;
    lastActiveStageRef.current = currentStage;
    if (!detailsOpen) return;
    const host = listRef.current;
    if (!host) return;
    const el = host.querySelector<HTMLDivElement>(
      `[data-stage-card="${currentStage}"]`,
    );
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStage, detailsOpen]);

  return (
    <div className="w-full">
      {/* Welcoming preamble — sets expectations AND signals that the
          stage descriptions are worth reading. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-[12px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-strong)]">Building your resume.</span>{' '}
          Typical run: 2&ndash;3 minutes. Here&rsquo;s what we&rsquo;re doing and why.
        </div>
        <div className="text-[11px] text-[var(--text-soft)] flex-shrink-0 tabular-nums">
          {totalStarted} / {STAGES.length}
        </div>
      </div>

      {/* Compact dot row — scannable overview. Sub-descriptions live in
          the card list below so we don\u2019t double up the text. */}
      <div className="flex items-start justify-between">
        {STAGES.map((s, idx) => {
          const status = stageStatus[s.id];
          const isCurrent = currentStage === s.id;
          const isLast = idx === STAGES.length - 1;
          return (
            <div key={s.id} className="flex-1 flex flex-col items-center relative">
              <div className="flex items-center w-full">
                <div
                  className={cn(
                    'flex-1 h-px transition-colors duration-500',
                    idx === 0
                      ? 'opacity-0'
                      : connectorClass(STAGES[idx - 1] ? stageStatus[STAGES[idx - 1].id] : 'pending'),
                  )}
                />
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 text-xs font-semibold',
                    dotClass(status, isCurrent),
                  )}
                  aria-label={`${s.label}: ${status}`}
                >
                  {status === 'complete' ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : status === 'failed' ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <div
                  className={cn(
                    'flex-1 h-px transition-colors duration-500',
                    isLast ? 'opacity-0' : connectorClass(status),
                  )}
                />
              </div>
              <div
                className={cn(
                  'mt-1.5 text-[11px] font-semibold text-center px-1 max-w-[110px] leading-snug tracking-[0.01em] transition-colors',
                  status === 'complete' || status === 'running' || isCurrent
                    ? 'text-[var(--text-strong)]'
                    : status === 'failed'
                      ? 'text-[var(--badge-red-text)]'
                      : 'text-[var(--text-soft)]',
                )}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggle row: only visible once the pipeline is fully complete,
          since during a run the details card list is always expanded
          (that's when the user most benefits from the explanations). */}
      {allComplete && (
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors"
          aria-expanded={detailsOpen}
          aria-controls="v3-stage-details"
        >
          {detailsOpen ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Hide pipeline details
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show pipeline details
            </>
          )}
        </button>
      )}

      {/* Persistent list of "why this matters" cards. Stages that have
          started (running or complete) reveal the full paragraph and
          keep it visible for the rest of the run. Pending stages show a
          compact header so the user can see what's still to come. The
          region is bounded and scrollable so the top strip doesn't
          crowd the resume workspace below.

          Auto-collapsed on pipeline complete so the results view
          has enough vertical room to be visible without page scroll.
          User can re-open via the toggle above. */}
      {detailsOpen && (
      <div
        ref={listRef}
        id="v3-stage-details"
        role="list"
        aria-label="Pipeline stage explanations"
        aria-live="polite"
        className="mt-4 max-h-[320px] overflow-y-auto pr-1 space-y-2"
      >
        {STAGES.map((s) => {
          const status = stageStatus[s.id];
          const isRunning = status === 'running';
          const isComplete = status === 'complete';
          const isFailed = status === 'failed';
          const hasStarted = isRunning || isComplete || isFailed;
          const statusLabel = isRunning
            ? 'Now'
            : isComplete
              ? 'Done'
              : isFailed
                ? 'Failed'
                : 'Up next';
          return (
            <div
              key={s.id}
              role="listitem"
              data-stage-card={s.id}
              className={cn(
                'rounded-lg border p-3 transition-colors duration-300',
                isRunning
                  ? 'bg-[var(--bullet-confirm-bg)] border-[var(--bullet-confirm)]'
                  : isComplete
                    ? 'bg-[var(--surface-2)] border-[var(--line-soft)]'
                    : isFailed
                      ? 'bg-[var(--badge-red-bg)] border-[var(--badge-red-text)]/40'
                      : 'bg-[var(--surface-1)] border-[var(--line-soft)]/60',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-[0.14em] flex-shrink-0',
                      isRunning
                        ? 'text-[var(--bullet-confirm)]'
                        : isComplete
                          ? 'text-[var(--text-muted)]'
                          : isFailed
                            ? 'text-[var(--badge-red-text)]'
                            : 'text-[var(--text-soft)]',
                    )}
                  >
                    {isComplete && (
                      <Check
                        className="inline h-3 w-3 mr-1 -mt-0.5"
                        strokeWidth={2.75}
                      />
                    )}
                    {statusLabel}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] font-semibold truncate',
                      hasStarted ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                <span className="flex-shrink-0 text-[11px] text-[var(--text-soft)] tabular-nums">
                  ~{s.typicalSeconds}s
                </span>
              </div>
              <div
                className={cn(
                  'mt-1 text-[12px]',
                  hasStarted ? 'text-[var(--text-muted)]' : 'text-[var(--text-soft)]',
                )}
              >
                {s.id === 'verify' && isRunning
                  ? 'Fact-checking every claim against your source material\u2026'
                  : s.subDescription}
              </div>
              {hasStarted && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-strong)]">
                  {s.whyThisMatters}
                </p>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
