/**
 * PostGapDebriefCard — Meaningful summary shown after the user submits gap responses.
 *
 * Replaces the minimal PostGapTransition spinner with a debrief that:
 *  1. Confirms the user's positioning choices are locked in
 *  2. Shows a decision summary (strategies confirmed vs gaps left unaddressed)
 *  3. Explains what happens next based on their choices
 *  4. Provides reassurance notes
 *  5. Displays live pipeline stage progress
 */

import { CheckCircle, RefreshCw, Info } from 'lucide-react';
import type { V2Stage } from '@/types/resume-v2';
import type { GapQuestionResponse } from '../GapQuestionFlow';

// ─── Props ──────────────────────────────────────────────────────────────────

interface PostGapDebriefCardProps {
  responses: GapQuestionResponse[];
  stage: V2Stage;
  isComplete: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStageStatusLabel(stage: V2Stage, isComplete: boolean): string {
  if (isComplete) return 'Ready — review and refine your resume below';
  switch (stage) {
    case 'intake':
    case 'analysis': return 'Reading your resume...';
    case 'strategy': return 'Building your positioning strategy...';
    case 'clarification': return 'Tightening the proof and context before drafting...';
    case 'writing': return 'Drafting your resume...';
    case 'verification': return 'Running quality checks...';
    case 'assembly': return 'Preparing your working resume...';
    case 'complete': return 'Ready — review and refine your resume below';
    default: return 'Working on it...';
  }
}

function getStageProgressPercent(stage: V2Stage): number {
  switch (stage) {
    case 'intake': return 8;
    case 'analysis': return 25;
    case 'strategy': return 42;
    case 'clarification': return 58;
    case 'writing': return 74;
    case 'verification': return 89;
    case 'assembly': return 95;
    case 'complete': return 100;
    default: return 0;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PostGapDebriefCard({
  responses,
  stage,
  isComplete,
}: PostGapDebriefCardProps) {
  const answeredCount = responses.filter((r) => r.action === 'answered').length;
  const skippedCount = responses.filter((r) => r.action === 'skipped').length;
  const allSkipped = answeredCount === 0 && skippedCount > 0;
  const progress = isComplete ? 100 : getStageProgressPercent(stage);

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden motion-safe:animate-[card-enter_500ms_ease-out_forwards] motion-safe:opacity-0"
      role="status"
      aria-live="polite"
      aria-label="Post-gap debrief summary"
    >
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-emerald-500 shrink-0" />
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
            Your Positioning Choices Are Locked In
          </h2>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* ── 2. Decision Summary ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">
              {answeredCount}
            </p>
            <p className="text-[12px] font-medium text-emerald-600 mt-0.5">
              {answeredCount === 1 ? 'strategy confirmed' : 'strategies confirmed'}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-2xl font-bold text-neutral-500 tabular-nums">
              {skippedCount}
            </p>
            <p className="text-[12px] font-medium text-neutral-400 mt-0.5">
              {skippedCount === 1 ? 'gap left unaddressed' : 'gaps left unaddressed'}
            </p>
          </div>
        </div>

        {/* ── 3. What to Expect ───────────────────────────────────────── */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 space-y-2">
          <p className="text-[13px] font-semibold text-blue-800">
            What to Expect
          </p>
          {allSkipped ? (
            <p className="text-[13px] text-blue-700 leading-relaxed">
              Since you skipped all gaps, your resume will highlight your direct
              matches only. No inferred positioning will be added.
            </p>
          ) : (
            <p className="text-[13px] text-blue-700 leading-relaxed">
              Your approved positioning is now being woven into the resume.
              Each strategy will be integrated naturally into relevant experience
              bullets &mdash; they won&apos;t appear as a separate section or
              footnote.
            </p>
          )}
        </div>

        {/* ── 4. Reassurance Notes ────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-start gap-2.5">
            <RefreshCw className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-neutral-500 leading-relaxed">
              You can always re-run the analysis to add context for any gaps you
              skipped.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-neutral-500 leading-relaxed">
              These choices only affect this resume. Your master resume is never
              modified.
            </p>
          </div>
        </div>

        {/* ── 5. Progress Section ─────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div
            className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-blue-400 transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[12px] text-neutral-400 text-right">
            {getStageStatusLabel(stage, isComplete)}
          </p>
        </div>
      </div>
    </div>
  );
}
