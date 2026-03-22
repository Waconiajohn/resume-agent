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
    ? 'border-[#b5dec2]/18 bg-[#b5dec2]/[0.04] text-[#b5dec2]'
    : step.status === 'active'
      ? 'border-[#afc4ff]/18 bg-[#afc4ff]/[0.04] text-[#afc4ff]'
      : 'border-white/[0.08] bg-white/[0.015] text-white/42';

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
        <p className="text-sm font-medium text-white/84">{step.label}</p>
        <p className="mt-1 text-sm leading-6 text-white/56">{step.detail}</p>
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

  const steps: WorklogStep[] = [
    {
      label: 'Read your resume',
      status: currentResume ? 'done' : 'active',
      detail: 'We pull out the strongest facts, scope, accomplishments, and proof already on the page.',
    },
    {
      label: 'Study the target role',
      status: jobIntelligence ? 'done' : currentResume ? 'active' : 'up_next',
      detail: 'We read the job description so weak job postings do not lead to weak resume decisions.',
    },
    {
      label: 'Build the benchmark candidate',
      status: benchmarkCandidate ? 'done' : jobIntelligence ? 'active' : 'up_next',
      detail: 'We identify what stronger candidates usually show so the resume is not limited to the wording of the posting.',
    },
    {
      label: 'Match your proof to the requirements',
      status: gapAnalysis ? 'done' : benchmarkCandidate || jobIntelligence ? 'active' : 'up_next',
      detail: 'We compare the resume against both the job and the benchmark to find what is already covered, partial, or missing.',
    },
    {
      label: 'Coach the next fix',
      status: rewriteActive ? 'active' : gapAnalysis ? 'done' : 'up_next',
      detail: nextQueueItem
        ? `Right now we are working on "${nextQueueItem.title}" so the next edit is both truthful and useful.`
        : 'We ask targeted questions and turn the answers into edits only after you review them.',
    },
    {
      label: 'Pressure-test and polish',
      status: polishActive || finalReviewActive ? 'active' : hasFinalReview && !isFinalReviewStale ? 'done' : 'up_next',
      detail: !hasFinalReview
        ? 'When the main rewrite is ready, we run the recruiter scan, hiring manager review, tone refresh, and ATS check.'
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
          <p className="eyebrow-label text-[#c9d7ff]/72">AI worklog</p>
          <p className="mt-2 text-base font-semibold text-white/86">What AI Is Doing For You</p>
        </div>
        <div className="rounded-md border border-white/[0.08] bg-black/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/42">
          Behind the scenes
        </div>
      </div>
      <p className="text-sm leading-6 text-white/54">
        This shows the work happening behind the scenes so you can see why the next step matters.
      </p>

      <div className="space-y-3">
        {steps.map((step) => <WorklogRow key={step.label} step={step} />)}
      </div>
    </div>
  );
}
