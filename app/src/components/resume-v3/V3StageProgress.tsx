/**
 * V3StageProgress — horizontal 6-stage indicator for the v3 pipeline,
 * paired with a short paragraph that explains the *craft* behind the
 * active stage. The pipeline takes 150–200 seconds; this component turns
 * that wait into transparency about how professional resume writers
 * think, rather than a progress bar full of engineering jargon.
 *
 * Visual spec: pending=muted, running=coral with a subtle pulse,
 * complete=coral solid with checkmark, failed=red. Labels sit below each
 * dot; a longer "why this matters" card sits below the row for the
 * currently-active stage.
 */

import { Check, AlertCircle } from 'lucide-react';
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
  /** One-line status shown under the label and referenced inline by the
   *  active-stage card as the "doing right now" line. */
  subDescription: string;
  /** The paragraph shown in the active-stage card. Explains the real
   *  craft problem this stage solves — what an experienced executive
   *  resume writer would think about at this point. */
  whyThisMatters: string;
  /** Advertised typical duration in seconds. Shown on the active card
   *  so the user has a rough expectation during the wait. */
  typicalSeconds: number;
}

/**
 * Stage copy. Tone rules (keep these in mind if you edit):
 *   • Conversational, not casual. "We take extra care", not "We go the
 *     extra mile!!!"
 *   • Educational, not condescending.
 *   • Honest about difficulty. "This is the hardest part" is fine.
 *   • Grounded in real craft. Every paragraph should reference something
 *     an actual resume writer thinks about.
 *   • No marketing language. No "cutting-edge AI", no "revolutionary".
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
  // Which stage should the "why this matters" card describe?
  // Priority: an actively-running stage → the last-completed stage (so the
  // card is never empty once work has begun) → the first stage.
  const runningStage = (Object.entries(stageStatus) as Array<[V3Stage, V3StageStatus]>)
    .find(([, status]) => status === 'running')?.[0] ?? null;
  const lastCompleteStage = [...STAGES]
    .reverse()
    .find((s) => stageStatus[s.id] === 'complete')?.id ?? null;
  const anyRunningOrDone = runningStage !== null || lastCompleteStage !== null;
  const activeStageId: V3Stage | null =
    runningStage ?? currentStage ?? lastCompleteStage ?? (anyRunningOrDone ? null : 'extract');
  const active = activeStageId
    ? STAGES.find((s) => s.id === activeStageId) ?? null
    : null;
  const activeStatus = active ? stageStatus[active.id] : 'pending';
  const isActiveRunning = activeStatus === 'running';

  return (
    <div className="w-full">
      {/* Welcoming preamble — sets expectations AND signals that the
          stage descriptions are worth reading. */}
      <div className="mb-3 text-[12px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-strong)]">Building your resume.</span>{' '}
        Typical run: 2&ndash;3 minutes. Here&rsquo;s what we&rsquo;re doing and why.
      </div>

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
              <div className="mt-2 text-center">
                <div
                  className={cn(
                    'text-[11px] font-semibold tracking-[0.02em] transition-colors',
                    status === 'complete' || status === 'running' || isCurrent
                      ? 'text-[var(--text-strong)]'
                      : status === 'failed'
                        ? 'text-[var(--badge-red-text)]'
                        : 'text-[var(--text-soft)]',
                  )}
                >
                  {s.label}
                </div>
                <div className="text-[10px] text-[var(--text-soft)] mt-0.5 max-w-[110px] leading-snug">
                  {s.subDescription}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* "Why this matters" expansion for the active stage. Pairs the
          explanation with the experience — users read the reasoning in
          real time as each stage works. */}
      {active && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'mt-4 rounded-lg border p-3.5 transition-colors duration-300',
            isActiveRunning
              ? 'bg-[var(--bullet-confirm-bg)] border-[var(--bullet-confirm-border)]'
              : 'bg-[var(--surface-2)] border-[var(--line-soft)]',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-[0.12em] flex-shrink-0',
                  isActiveRunning ? 'text-[var(--bullet-confirm)]' : 'text-[var(--text-muted)]',
                )}
              >
                {isActiveRunning ? 'Now' : activeStatus === 'complete' ? 'Just finished' : 'Up next'}
              </span>
              <span className="text-[13px] font-semibold text-[var(--text-strong)] truncate">
                {active.label}
              </span>
            </div>
            <span className="flex-shrink-0 text-[11px] text-[var(--text-soft)]">
              ~{active.typicalSeconds}s
            </span>
          </div>
          <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            {active.id === 'verify' && isActiveRunning
              ? 'Fact-checking every claim against your source material…'
              : active.subDescription}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--text-strong)]/90">
            {active.whyThisMatters}
          </p>
        </div>
      )}
    </div>
  );
}
