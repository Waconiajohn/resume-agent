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
    ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] text-[#b5dec2]'
    : step.status === 'active'
      ? 'border-[#afc4ff]/20 bg-[#afc4ff]/[0.05] text-[#afc4ff]'
      : 'border-white/[0.08] bg-white/[0.02] text-white/42';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
      <div className={`mt-0.5 rounded-full border p-1 ${tone}`}>
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
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number };
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
    <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-4">
      <div>
        <p className="text-sm font-medium text-white/84">What AI Is Doing For You</p>
        <p className="mt-1 text-sm leading-6 text-white/54">
          This is the invisible work happening behind the scenes so you can see what the system is doing for your money and why the next action matters.
        </p>
      </div>

      <div className="space-y-2.5">
        {steps.map((step) => <WorklogRow key={step.label} step={step} />)}
      </div>
    </div>
  );
}
