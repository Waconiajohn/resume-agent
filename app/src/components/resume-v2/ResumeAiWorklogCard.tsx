import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import type {
  BenchmarkCandidate,
  GapAnalysis,
  JobIntelligence,
  PostReviewPolishState,
  ResumeDraft,
  RewriteQueueItem,
} from '@/types/resume-v2';

type WorklogStatus = 'done' | 'active' | 'up_next';

interface WorklogStep {
  label: string;
  status: WorklogStatus;
  detail: string;
}

function WorklogRow({ step }: { step: WorklogStep }) {
  const tone = step.status === 'done'
    ? 'border-[var(--badge-green-text)]/18 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]'
    : step.status === 'active'
      ? 'border-[var(--link)]/18 bg-[var(--badge-blue-bg)] text-[var(--link)]'
      : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]';

  return (
    <div className="support-callout flex items-start gap-3 px-4 py-3.5">
      <div className={`mt-0.5 rounded-lg border p-1.5 ${tone}`}>
        {step.status === 'done' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : step.status === 'active' ? (
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-strong)]">{step.label}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">{step.detail}</p>
      </div>
    </div>
  );
}

export function ResumeAiWorklogCard({
  currentResume,
  jobIntelligence,
  benchmarkCandidate,
  gapAnalysis,
  nextQueueItem,
  queueSummary,
  hasFinalReview,
  isFinalReviewStale,
  unresolvedCriticalCount,
  postReviewPolish,
}: {
  currentResume: ResumeDraft | null | undefined;
  jobIntelligence: JobIntelligence | null | undefined;
  benchmarkCandidate: BenchmarkCandidate | null | undefined;
  gapAnalysis: GapAnalysis | null | undefined;
  nextQueueItem: RewriteQueueItem | null | undefined;
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number; hardGapCount: number };
  hasFinalReview: boolean;
  isFinalReviewStale: boolean;
  unresolvedCriticalCount: number;
  postReviewPolish?: PostReviewPolishState | null;
}) {
  const rewriteActive = queueSummary.needsAttention > 0 || queueSummary.partiallyAddressed > 0;
  const finalReviewActive = !rewriteActive && (!hasFinalReview || isFinalReviewStale || unresolvedCriticalCount > 0);
  const polishActive = !rewriteActive && hasFinalReview && !isFinalReviewStale && unresolvedCriticalCount === 0 && postReviewPolish?.status === 'running';
  const activeStepLabel = rewriteActive
    ? 'Matching each requirement to the strongest proof already on your resume and teeing up the next fix.'
    : finalReviewActive
      ? 'Pressure-testing the draft so you can see what would still worry a recruiter or hiring manager.'
      : polishActive
        ? 'Refreshing tone and ATS language after the latest accepted edits.'
        : 'Reviewing the finished draft and preparing it for export.';

  const steps: WorklogStep[] = [
    {
      label: 'Read your resume for usable proof',
      status: currentResume ? 'done' : 'active',
      detail: 'We pull out the strongest facts, scope, accomplishments, and evidence already on the page.',
    },
    {
      label: 'Pull direct requirements from the job description',
      status: jobIntelligence ? 'done' : currentResume ? 'active' : 'up_next',
      detail: 'We identify the must-have asks from the posting so the rewrite stays grounded in the actual role.',
    },
    {
      label: 'Add benchmark expectations',
      status: benchmarkCandidate ? 'done' : jobIntelligence ? 'active' : 'up_next',
      detail: 'We add the executive-level signals strong candidates usually show, even when the posting is incomplete.',
    },
    {
      label: 'Map each requirement to your current resume',
      status: gapAnalysis ? 'done' : benchmarkCandidate || jobIntelligence ? 'active' : 'up_next',
      detail: 'We show where the current resume already covers a requirement, where the proof is only partial, and where nothing clear exists yet.',
    },
    {
      label: 'Prepare the next requirement to fix',
      status: rewriteActive ? 'active' : gapAnalysis ? 'done' : 'up_next',
      detail: nextQueueItem
        ? `Right now we are working on "${nextQueueItem.title}" so you can review the issue, the current proof, and the suggested draft in one place.`
        : 'We ask targeted questions and prepare editable draft language only after the evidence is clear.',
    },
    {
      label: 'Run final review before export',
      status: polishActive || finalReviewActive ? 'active' : hasFinalReview && !isFinalReviewStale ? 'done' : 'up_next',
      detail: !hasFinalReview
        ? 'Once the important gaps are covered, we run the recruiter scan, hiring manager review, tone refresh, and ATS check.'
        : isFinalReviewStale
          ? 'The resume changed after the last review, so we need to rerun the recruiter scan and hiring manager review.'
          : unresolvedCriticalCount > 0
            ? `Final Review is flagging ${unresolvedCriticalCount} critical concern${unresolvedCriticalCount === 1 ? '' : 's'} that still need attention.`
            : postReviewPolish?.status === 'running'
              ? 'We are refreshing tone and ATS coverage after the latest accepted fixes.'
              : 'The draft has been pressure-tested and polished. Export is the final step.',
    },
  ];

  return (
    <div className="room-shell space-y-4 border border-[#98b3ff]/14 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-5 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow-label text-[#c9d7ff]/72">Live review</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">What's happening right now</p>
        </div>
        <div className="rounded-md border border-[var(--link)]/18 bg-[var(--badge-blue-bg)] px-3 py-1.5 text-[12px] uppercase tracking-[0.18em] text-[var(--link)]/78">
          Updates as the review moves
        </div>
      </div>

      <div className="support-callout border-[var(--link)]/16 bg-[var(--badge-blue-bg)] px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--link)]/72">Right now</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{activeStepLabel}</p>
      </div>

      <p className="text-sm leading-6 text-[var(--text-soft)]">
        You should not have to guess what the system is doing. This panel stays plain-English while the role is reviewed, the requirements are mapped, and the next edit is prepared.
      </p>

      <div className="space-y-3">
        {steps.map((step) => <WorklogRow key={step.label} step={step} />)}
      </div>
    </div>
  );
}
