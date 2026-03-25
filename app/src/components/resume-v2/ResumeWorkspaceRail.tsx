import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Database,
  Loader2,
  Save,
  Square,
  SquareCheckBig,
} from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { AddContextCard } from './AddContextCard';
import { ExportBar } from './ExportBar';
import { WhatChangedCard } from './cards/WhatChangedCard';
import { HiringManagerReviewCard } from './cards/HiringManagerReviewCard';
import { JobIntelligenceCard } from './cards/JobIntelligenceCard';
import { CandidateIntelligenceCard } from './cards/CandidateIntelligenceCard';
import { BenchmarkCandidateCard } from './cards/BenchmarkCandidateCard';
import { NarrativeStrategyCard } from './cards/NarrativeStrategyCard';
import { ScoresCard } from './cards/ScoresCard';
import { KeywordScoreDashboard } from './cards/KeywordScoreDashboard';
import { ScoringReport } from './ScoringReport';
import type {
  AssemblyResult,
  BenchmarkCandidate,
  CandidateIntelligence,
  JobIntelligence,
  MasterPromotionItem,
  NarrativeStrategy,
  PreScores,
  PostReviewPolishState,
  ResumeDraft,
  VerificationDetail,
  GapAnalysis,
} from '@/types/resume-v2';
import type { PendingEdit } from '@/hooks/useInlineEdit';
import type { LiveScores } from '@/hooks/useLiveScoring';
import type { FinalReviewChatContext } from '@/types/resume-v2';
import type {
  HiringManagerConcern,
  HiringManagerReviewResult,
} from '@/hooks/useHiringManagerReview';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';

export function GuidedWorkflowCard({
  hasFinalReview,
  isFinalReviewStale,
  unresolvedCriticalCount,
  coverageAddressed,
  coverageTotal,
  queueSummary,
  nextQueueItemLabel,
  postReviewPolish,
}: {
  hasFinalReview: boolean;
  isFinalReviewStale: boolean;
  unresolvedCriticalCount: number;
  coverageAddressed: number;
  coverageTotal: number;
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number; hardGapCount: number };
  nextQueueItemLabel?: string;
  postReviewPolish?: PostReviewPolishState;
}) {
  const queueNeedsAttention = queueSummary.needsAttention;
  const queuePartials = queueSummary.partiallyAddressed;
  const hardGapCount = queueSummary.hardGapCount;
  const hasActiveQueueWork = queueNeedsAttention > 0 || queuePartials > 0;
  const resumeCoverageLabel = coverageTotal > 0
    ? `${coverageAddressed} of ${coverageTotal} direct job requirements clearly addressed`
    : 'The requirement map is still being built';
  const nextActionLabel = hasActiveQueueWork
    ? nextQueueItemLabel
      ? `Work the next requirement: "${nextQueueItemLabel}".`
      : 'Open the next requirement and improve the proof before moving on.'
    : hardGapCount > 0
      ? `Review the ${hardGapCount} hard requirement risk${hardGapCount === 1 ? '' : 's'} honestly before trusting the draft.`
    : !hasFinalReview
      ? 'Run Final Review once the important requirements are covered.'
      : isFinalReviewStale
        ? 'Run Final Review again because the resume changed after the last review.'
        : unresolvedCriticalCount > 0
          ? `Resolve the ${unresolvedCriticalCount} critical concern${unresolvedCriticalCount === 1 ? '' : 's'} before export.`
          : 'Review the final wording and export when you are satisfied.';
  const reviewLabel = !hasFinalReview
    ? 'Not run yet'
    : isFinalReviewStale
      ? 'Needs rerun'
      : unresolvedCriticalCount > 0
        ? `${unresolvedCriticalCount} critical left`
        : postReviewPolish?.status === 'running'
          ? 'Refreshing tone + ATS'
          : 'Ready for final check';

  return (
    <div className="space-y-3">
      <div className="shell-panel px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow-label">Next step</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">What happens next</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-soft)]">
              Keep this simple: review the requirement map, fix the next issue on the left, then run Final Review before export.
            </p>
          </div>
          <div className="room-meta-strip text-[13px]">
            <div className="room-meta-item">
              Resume coverage
              <strong>{coverageTotal > 0 ? `${coverageAddressed}/${coverageTotal}` : 'Building map'}</strong>
            </div>
            <div className="room-meta-item">
              Requirements left
              <strong>{queueNeedsAttention + queuePartials}</strong>
            </div>
            {hardGapCount > 0 && (
              <div className="room-meta-item">
                Screen-out risks
                <strong>{hardGapCount}</strong>
              </div>
            )}
            <div className="room-meta-item">
              Final review
              <strong>{reviewLabel}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="support-callout border-[#afc4ff]/16 bg-[#afc4ff]/[0.06] px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[#c9d7ff]/72">Current situation</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{resumeCoverageLabel}</p>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">Do this next</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{nextActionLabel}</p>
      </div>
    </div>
  );
}

function AnalysisSummarySection({
  jobIntelligence,
  candidateIntelligence,
  benchmarkCandidate,
  narrativeStrategy,
}: {
  jobIntelligence: JobIntelligence | null;
  candidateIntelligence: CandidateIntelligence | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  narrativeStrategy: NarrativeStrategy | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const cardCount = [jobIntelligence, candidateIntelligence, benchmarkCandidate, narrativeStrategy].filter(Boolean).length;
  if (cardCount === 0) return null;

  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--line-soft)] bg-[var(--accent-muted)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
        aria-expanded={expanded}
      >
        <ChevronRight
          className="h-3.5 w-3.5 text-[var(--text-soft)] shrink-0 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
        />
        <Briefcase className="h-3.5 w-3.5 text-[var(--text-soft)] shrink-0" />
        <span className="text-sm font-medium text-[var(--text-muted)]">
          Analysis &amp; Strategy
        </span>
        <span className="text-xs text-[var(--text-soft)] ml-auto">
          {cardCount} {cardCount === 1 ? 'section' : 'sections'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[var(--line-soft)] px-4 pb-4">
          {jobIntelligence && (
            <div className="pt-4">
              <GlassCard className="p-5"><JobIntelligenceCard data={jobIntelligence} /></GlassCard>
            </div>
          )}
          {candidateIntelligence && (
            <GlassCard className="p-5"><CandidateIntelligenceCard data={candidateIntelligence} /></GlassCard>
          )}
          {benchmarkCandidate && (
            <GlassCard className="p-5"><BenchmarkCandidateCard data={benchmarkCandidate} /></GlassCard>
          )}
          {narrativeStrategy && (
            <GlassCard className="p-5"><NarrativeStrategyCard data={narrativeStrategy} /></GlassCard>
          )}
        </div>
      )}
    </div>
  );
}

function countAcceptedTailoredEdits(resume: ResumeDraft | null | undefined): number {
  if (!resume) return 0;

  let count = 0;
  if (resume.executive_summary.is_new) count++;
  count += resume.selected_accomplishments.filter((item) => item.is_new).length;
  for (const experience of resume.professional_experience) {
    if (experience.scope_statement_is_new) count++;
    count += experience.bullets.filter((bullet) => bullet.is_new).length;
  }
  return count;
}

function countOriginalEvidence(resume: ResumeDraft | null | undefined): number {
  if (!resume) return 0;

  let count = resume.selected_accomplishments.filter((item) => !item.is_new).length;
  for (const experience of resume.professional_experience) {
    if (!experience.scope_statement_is_new && experience.scope_statement) count++;
    count += experience.bullets.filter((bullet) => !bullet.is_new).length;
  }
  return count;
}

function ResumeEvidenceStatusCard({
  resume,
  pendingEdit,
}: {
  resume: ResumeDraft | null | undefined;
  pendingEdit: PendingEdit | null;
}) {
  const originalEvidenceCount = countOriginalEvidence(resume);
  const acceptedTailoredEditCount = countAcceptedTailoredEdits(resume);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="support-callout px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">Original Evidence</p>
        <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">{originalEvidenceCount} lines from the starting resume</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">These are the facts and examples the candidate brought into the session.</p>
      </div>
      <div className="support-callout border border-[#b5dec2]/18 bg-[#b5dec2]/[0.05] px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[#b5dec2]/70">Accepted Tailored Edits</p>
        <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">{acceptedTailoredEditCount} AI-assisted changes accepted</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">Anything marked New on the resume was added or rewritten during this rewrite flow.</p>
      </div>
      <div className="support-callout border border-[#afc4ff]/18 bg-[#afc4ff]/[0.05] px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[#afc4ff]/70">Pending Suggestions</p>
        <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">{pendingEdit ? '1 suggestion waiting for review' : 'No pending suggestions'}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">Suggestions only affect coverage after the candidate accepts the diff.</p>
      </div>
    </div>
  );
}

function CompactDisclosure({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--line-soft)] bg-[var(--accent-muted)]">
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
        aria-expanded={expanded}
      >
        <ChevronRight
          className="h-3.5 w-3.5 text-[var(--text-soft)] transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-muted)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">{description}</p>
        </div>
      </button>
      {expanded && (
        <div className="space-y-4 border-t border-[var(--line-soft)] px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

function FinalReadinessSummaryCard({
  jobBreakdown,
  benchmarkBreakdown,
  hasFinalReview,
  isFinalReviewStale,
  unresolvedCriticalCount,
  queueSummary,
  nextQueueItemLabel,
  postReviewPolish,
}: {
  jobBreakdown: { addressed: number; total: number; partial: number; missing: number; coverageScore: number };
  benchmarkBreakdown: { addressed: number; total: number; partial: number; missing: number; coverageScore: number };
  hasFinalReview: boolean;
  isFinalReviewStale: boolean;
  unresolvedCriticalCount: number;
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number; hardGapCount: number };
  nextQueueItemLabel?: string;
  postReviewPolish?: PostReviewPolishState;
}) {
  const hasQueueWork = queueSummary.needsAttention > 0 || queueSummary.partiallyAddressed > 0;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-strong)]">Final Readiness</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
            This is the final status before export: job fit first, benchmark competitiveness second, then tone and ATS freshness.
          </p>
        </div>
        <span className={`rounded-md border px-3 py-1.5 text-[13px] font-medium uppercase tracking-[0.12em] ${
          hasFinalReview && !isFinalReviewStale && unresolvedCriticalCount === 0
            ? 'border-[#b5dec2]/18 bg-[#b5dec2]/[0.05] text-[#b5dec2]/85'
            : 'border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] text-[#f0d99f]/85'
        }`}>
          {!hasFinalReview
            ? 'Final Review not run'
            : isFinalReviewStale
              ? 'Review out of date'
              : `${unresolvedCriticalCount} critical left`}
        </span>
      </div>

      {isFinalReviewStale && (
        <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]">
          The resume changed after the last Final Review. Rerun the recruiter scan and hiring manager verdict before treating this readiness summary as current.
        </div>
      )}

      {hasQueueWork && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-black/15 px-3 py-2 text-xs leading-5 text-[var(--text-soft)]">
          The rewrite queue still has {queueSummary.needsAttention} needs-attention item{queueSummary.needsAttention === 1 ? '' : 's'} and {queueSummary.partiallyAddressed} partial item{queueSummary.partiallyAddressed === 1 ? '' : 's'}.
          {nextQueueItemLabel ? ` The clearest next move is "${nextQueueItemLabel}".` : ''}
        </div>
      )}

      {queueSummary.hardGapCount > 0 && (
        <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]">
          {queueSummary.hardGapCount} hard requirement risk{queueSummary.hardGapCount === 1 ? '' : 's'} still remain. These are the items most likely to create a real screening problem if they are truly missing.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] px-3 py-3">
          <p className="text-[13px] uppercase tracking-[0.18em] text-[#afc4ff]/75">JD Fit</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">{jobBreakdown.addressed}/{jobBreakdown.total} addressed</p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">{jobBreakdown.coverageScore}% coverage</p>
        </div>
        <div className="rounded-lg border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] px-3 py-3">
          <p className="text-[13px] uppercase tracking-[0.18em] text-[#f0d99f]/75">Benchmark</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">{benchmarkBreakdown.addressed}/{benchmarkBreakdown.total} addressed</p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">{benchmarkBreakdown.coverageScore}% alignment</p>
        </div>
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3">
          <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">ATS</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">
            {postReviewPolish?.result?.ats_score ?? 'Not refreshed yet'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            {postReviewPolish?.status === 'complete' ? 'Updated after Final Review fixes' : 'Latest refresh status'}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3">
          <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">Tone</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">
            {postReviewPolish?.result?.tone_score ?? 'Not refreshed yet'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            {postReviewPolish?.status === 'running' ? 'Refreshing now' : postReviewPolish?.message ?? 'Awaiting post-review refresh'}
          </p>
        </div>
      </div>
    </div>
  );
}

function MasterResumeSyncCard({
  mode,
  onChangeMode,
  onSaveNow,
  isSaving,
  status,
}: {
  mode: 'session_only' | 'master_resume';
  onChangeMode?: (mode: 'session_only' | 'master_resume') => void;
  onSaveNow?: () => void;
  isSaving?: boolean;
  status?: {
    tone: 'neutral' | 'success' | 'error';
    message: string;
  };
}) {
  const toneStyles = status?.tone === 'error'
    ? 'text-[#f0b8b8] border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.05]'
    : status?.tone === 'success'
      ? 'text-[#b5dec2] border-[#b5dec2]/20 bg-[#b5dec2]/[0.05]'
      : 'text-[var(--text-soft)] border-[var(--line-soft)] bg-[var(--accent-muted)]';

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] p-2">
          <Database className="h-4 w-4 text-[var(--text-soft)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-muted)]">Reuse these edits later</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
            Keep accepted edits in this session only, or sync them to your default master resume so future applications start from a stronger base.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-1">
          <button
            type="button"
            onClick={() => onChangeMode?.('session_only')}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              mode === 'session_only' ? 'bg-[var(--surface-1)] text-[var(--text-strong)]' : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]'
            }`}
          >
            Session Only
          </button>
          <button
            type="button"
            onClick={() => onChangeMode?.('master_resume')}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              mode === 'master_resume' ? 'bg-[#afc4ff]/15 text-[#afc4ff]' : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]'
            }`}
          >
            Auto-Sync to Master
          </button>
        </div>

        <button
          type="button"
          onClick={onSaveNow}
          disabled={isSaving || !onSaveNow}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? 'Saving...' : 'Save Current Version Now'}
        </button>
      </div>

      <div className={`rounded-lg border px-3 py-2 text-xs leading-5 ${toneStyles}`}>
        {status?.message ?? (mode === 'master_resume'
          ? 'Future accepted edits will sync to your master resume automatically.'
          : 'Accepted edits stay local to this resume unless you save them to the master resume.')}
      </div>
    </div>
  );
}

function MasterResumePromotionCard({
  items,
  selectedIds,
  onToggleItem,
  onSelectAll,
  onClearAll,
}: {
  items: MasterPromotionItem[];
  selectedIds: string[];
  onToggleItem?: (itemId: string) => void;
  onSelectAll?: () => void;
  onClearAll?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] p-2">
          <Save className="h-4 w-4 text-[var(--text-soft)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-muted)]">Choose what gets promoted to your master resume</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
            Only checked AI-created edits will be added to the master resume. This keeps one-off tailoring out while preserving reusable bullets and accomplishments.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-3 text-xs leading-5 text-[var(--text-soft)]">
          No accepted AI-created bullets or accomplishments are available to promote yet. Accept a tailored edit first, then choose whether it should become part of your master resume.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-[var(--text-soft)]">
              {selectedIds.length} of {items.length} promotable edit{items.length === 1 ? '' : 's'} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={onClearAll}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleItem?.(item.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    checked
                      ? 'border-[#afc4ff]/22 bg-[#afc4ff]/[0.06]'
                      : 'border-[var(--line-soft)] bg-[var(--accent-muted)] hover:bg-[var(--surface-1)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 text-[#afc4ff]">
                      {checked ? <SquareCheckBig className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--text-strong)]">{item.label}</p>
                        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
                          {item.category.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-soft)]">{item.section}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.text}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function ResumeWorkspaceRail({
  displayResume,
  pendingEdit,
  assembly,
  companyName,
  jobTitle,
  atsScore,
  hiringManagerResult,
  resolvedFinalReviewConcernIds,
  isFinalReviewStale,
  isHiringManagerLoading,
  hiringManagerError,
  onRequestHiringManagerReview,
  onApplyHiringManagerRecommendation,
  finalReviewChat,
  buildFinalReviewChatContext,
  isEditing,
  queueSummary,
  nextQueueItemLabel,
  jobBreakdown,
  benchmarkBreakdown,
  postReviewPolish,
  finalReviewWarningsAcknowledged,
  onAcknowledgeFinalReviewWarnings,
  onAddContext,
  isRerunning,
  masterSaveMode,
  onChangeMasterSaveMode,
  onSaveCurrentToMaster,
  isSavingToMaster,
  masterSaveStatus,
  promotableMasterItems,
  selectedMasterPromotionIds,
  onToggleMasterPromotionItem,
  onSelectAllMasterPromotionItems,
  onClearMasterPromotionItems,
  jobIntelligence,
  candidateIntelligence,
  benchmarkCandidate,
  narrativeStrategy,
  isComplete,
  liveScores,
  isScoring,
  onIntegrateKeyword,
  preScores,
  previousResume,
  onDismissChanges,
  verificationDetail,
  gapAnalysis,
}: {
  displayResume: ResumeDraft;
  pendingEdit: PendingEdit | null;
  assembly: AssemblyResult;
  companyName?: string;
  jobTitle?: string;
  atsScore: number;
  hiringManagerResult?: HiringManagerReviewResult | null;
  resolvedFinalReviewConcernIds: string[];
  isFinalReviewStale: boolean;
  isHiringManagerLoading?: boolean;
  hiringManagerError?: string | null;
  onRequestHiringManagerReview?: () => void;
  onApplyHiringManagerRecommendation?: (
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed?: boolean,
  ) => void;
  finalReviewChat?: FinalReviewChatHook | null;
  buildFinalReviewChatContext?: (concern: HiringManagerConcern) => FinalReviewChatContext | null;
  isEditing: boolean;
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number; hardGapCount: number };
  nextQueueItemLabel?: string;
  jobBreakdown: { addressed: number; total: number; partial: number; missing: number; coverageScore: number };
  benchmarkBreakdown: { addressed: number; total: number; partial: number; missing: number; coverageScore: number };
  postReviewPolish?: PostReviewPolishState;
  finalReviewWarningsAcknowledged?: boolean;
  onAcknowledgeFinalReviewWarnings?: () => void;
  onAddContext: (context: string) => void;
  isRerunning: boolean;
  masterSaveMode: 'session_only' | 'master_resume';
  onChangeMasterSaveMode?: (mode: 'session_only' | 'master_resume') => void;
  onSaveCurrentToMaster?: () => void;
  isSavingToMaster: boolean;
  masterSaveStatus?: {
    tone: 'neutral' | 'success' | 'error';
    message: string;
  };
  promotableMasterItems: MasterPromotionItem[];
  selectedMasterPromotionIds: string[];
  onToggleMasterPromotionItem?: (itemId: string) => void;
  onSelectAllMasterPromotionItems?: () => void;
  onClearMasterPromotionItems?: () => void;
  jobIntelligence: JobIntelligence | null;
  candidateIntelligence: CandidateIntelligence | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  narrativeStrategy: NarrativeStrategy | null;
  isComplete: boolean;
  liveScores: LiveScores | null;
  isScoring: boolean;
  onIntegrateKeyword?: (keyword: string) => void;
  preScores: PreScores | null;
  previousResume?: ResumeDraft | null;
  onDismissChanges?: () => void;
  /** Full verification agent outputs for the detailed scoring report */
  verificationDetail?: VerificationDetail | null;
  /** Gap analysis for the before-report coverage count */
  gapAnalysis?: GapAnalysis | null;
}) {
  const unresolvedCriticalConcerns = hiringManagerResult
    ? hiringManagerResult.concerns.filter((concern) => (
      concern.severity === 'critical' && !resolvedFinalReviewConcernIds.includes(concern.id)
    ))
    : [];

  return (
    <div data-workspace-rail="" className="space-y-4 pt-4 border-t border-[var(--line-soft)]">
      <div
        className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
          hiringManagerResult && !isFinalReviewStale
            ? 'border border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] text-[#b5dec2]/90'
            : 'border border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] text-[#f0d99f]/90'
        }`}
        role="status"
      >
        {hiringManagerResult && !isFinalReviewStale ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0" />
        )}
        {!hiringManagerResult
          ? 'Your draft is ready for Final Review. Run the recruiter and hiring manager check before exporting.'
          : isFinalReviewStale
            ? 'Final Review is out of date because the resume changed. Rerun it before exporting or acknowledge the warning.'
            : 'Final Review is current. Resolve any remaining concerns, then export if you are satisfied with the draft.'}
      </div>

      {onRequestHiringManagerReview && companyName && jobTitle && (
        <HiringManagerReviewCard
          result={hiringManagerResult ?? null}
          resolvedConcernIds={resolvedFinalReviewConcernIds}
          isLoading={isHiringManagerLoading ?? false}
          error={hiringManagerError ?? null}
          companyName={companyName}
          roleTitle={jobTitle}
          onRequestReview={onRequestHiringManagerReview}
          onApplyRecommendation={onApplyHiringManagerRecommendation}
          isEditing={isEditing}
          finalReviewChat={finalReviewChat}
          buildFinalReviewChatContext={buildFinalReviewChatContext}
        />
      )}

      <ExportBar
        resume={displayResume}
        companyName={companyName}
        jobTitle={jobTitle}
        atsScore={atsScore}
        hasCompletedFinalReview={Boolean(hiringManagerResult)}
        isFinalReviewStale={isFinalReviewStale}
        unresolvedCriticalCount={unresolvedCriticalConcerns.length}
        unresolvedHardGapCount={queueSummary.hardGapCount}
        queueNeedsAttentionCount={queueSummary.needsAttention}
        queuePartialCount={queueSummary.partiallyAddressed}
        nextQueueItemLabel={nextQueueItemLabel}
        warningsAcknowledged={finalReviewWarningsAcknowledged}
        onAcknowledgeWarnings={onAcknowledgeFinalReviewWarnings}
      />

      {preScores ? (
        <ScoringReport
          preScores={preScores}
          assembly={assembly}
          verificationDetail={verificationDetail ?? null}
          gapAnalysis={gapAnalysis ?? null}
          benchmarkCandidate={benchmarkCandidate}
          narrativeStrategy={narrativeStrategy}
        />
      ) : isComplete ? (
        <KeywordScoreDashboard
          pipelineScores={assembly.scores}
          liveScores={liveScores}
          quickWins={assembly.quick_wins}
          isScoring={isScoring}
          onIntegrateKeyword={onIntegrateKeyword}
          preScoreKeywords={preScores}
        />
      ) : (
        <ScoresCard scores={assembly.scores} quickWins={assembly.quick_wins} />
      )}

      <CompactDisclosure
        title="Open readiness, context, reuse, and analysis details"
        description="Use this when you want the deeper export-readiness summary, add context, master resume controls, and the supporting analysis."
        defaultOpen={Boolean(masterSaveStatus?.tone === 'error' || promotableMasterItems.length > 0)}
      >
        <FinalReadinessSummaryCard
          jobBreakdown={jobBreakdown}
          benchmarkBreakdown={benchmarkBreakdown}
          hasFinalReview={Boolean(hiringManagerResult)}
          isFinalReviewStale={isFinalReviewStale}
          unresolvedCriticalCount={unresolvedCriticalConcerns.length}
          queueSummary={queueSummary}
          nextQueueItemLabel={nextQueueItemLabel}
          postReviewPolish={postReviewPolish}
        />

        <AddContextCard onSubmit={onAddContext} loading={isRerunning} />

        <ResumeEvidenceStatusCard
          resume={displayResume}
          pendingEdit={pendingEdit}
        />

        <MasterResumeSyncCard
          mode={masterSaveMode}
          onChangeMode={onChangeMasterSaveMode}
          onSaveNow={onSaveCurrentToMaster}
          isSaving={isSavingToMaster}
          status={masterSaveStatus}
        />

        <MasterResumePromotionCard
          items={promotableMasterItems}
          selectedIds={selectedMasterPromotionIds}
          onToggleItem={onToggleMasterPromotionItem}
          onSelectAll={onSelectAllMasterPromotionItems}
          onClearAll={onClearMasterPromotionItems}
        />

        {(jobIntelligence || candidateIntelligence || benchmarkCandidate || narrativeStrategy) && (
          <AnalysisSummarySection
            jobIntelligence={jobIntelligence}
            candidateIntelligence={candidateIntelligence}
            benchmarkCandidate={benchmarkCandidate}
            narrativeStrategy={narrativeStrategy}
          />
        )}

        {previousResume && onDismissChanges && (
          <WhatChangedCard
            previousResume={previousResume}
            currentResume={displayResume}
            onDismiss={onDismissChanges}
          />
        )}
      </CompactDisclosure>
    </div>
  );
}
