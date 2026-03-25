/**
 * GapOverviewCard — Educational context shown BEFORE the gap coaching questions begin.
 *
 * Displays the coverage score, requirement breakdown, strength summary,
 * critical gaps callout, and an explainer for the three actions (Use This,
 * Add Context, Skip) so the user understands what to expect.
 */

import {
  CheckCircle,
  MessageCircle,
  SkipForward,
  ShieldAlert,
  BarChart3,
} from 'lucide-react';
import type { GapAnalysis } from '@/types/resume-v2';

// ─── Props ──────────────────────────────────────────────────────────────────

interface GapOverviewCardProps {
  gapAnalysis: GapAnalysis;
  questionCount: number;
  onBeginReview: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GapOverviewCard({
  gapAnalysis,
  questionCount,
  onBeginReview,
}: GapOverviewCardProps) {
  // Count requirements by classification
  const strong = gapAnalysis.requirements.filter(
    (r) => r.classification === 'strong',
  ).length;
  const partial = gapAnalysis.requirements.filter(
    (r) => r.classification === 'partial',
  ).length;
  const missing = gapAnalysis.requirements.filter(
    (r) => r.classification === 'missing',
  ).length;
  const totalReqs = gapAnalysis.requirements.length;

  const breakdown = gapAnalysis.score_breakdown;

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden"
      role="main"
      aria-label="Gap overview before coaching questions"
    >
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
        <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
          Your Resume vs. This Role
        </h2>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* ── 2. Coverage Score + Stacked Bar ─────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-end gap-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-neutral-400" />
              <span className="text-4xl font-bold text-neutral-900 tabular-nums leading-none">
                {gapAnalysis.coverage_score}%
              </span>
            </div>
            <span className="text-[13px] text-neutral-500 pb-1">
              coverage score
            </span>
          </div>

          {/* Stacked horizontal bar */}
          {totalReqs > 0 && (
            <div className="h-2.5 w-full overflow-hidden rounded-full flex bg-neutral-100">
              {strong > 0 && (
                <div
                  className="h-full bg-emerald-400 transition-all duration-700"
                  style={{ width: `${(strong / totalReqs) * 100}%` }}
                />
              )}
              {partial > 0 && (
                <div
                  className="h-full bg-amber-400 transition-all duration-700"
                  style={{ width: `${(partial / totalReqs) * 100}%` }}
                />
              )}
              {missing > 0 && (
                <div
                  className="h-full bg-red-400 transition-all duration-700"
                  style={{ width: `${(missing / totalReqs) * 100}%` }}
                />
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 text-[12px] text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
              {strong} Strong
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              {partial} Partial
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
              {missing} Missing
            </span>
          </div>
        </div>

        {/* ── 3. Score Breakdown (if available) ──────────────────────── */}
        {breakdown && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
                Job Description
              </p>
              <p className="text-[15px] font-semibold text-neutral-800">
                {breakdown.job_description.strong +
                  breakdown.job_description.partial}
                /{breakdown.job_description.total}{' '}
                <span className="text-[12px] font-normal text-neutral-500">
                  covered
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
                Benchmark
              </p>
              <p className="text-[15px] font-semibold text-neutral-800">
                {breakdown.benchmark.strong + breakdown.benchmark.partial}/
                {breakdown.benchmark.total}{' '}
                <span className="text-[12px] font-normal text-neutral-500">
                  covered
                </span>
              </p>
            </div>
          </div>
        )}

        {/* ── 4. Strength Summary ────────────────────────────────────── */}
        {gapAnalysis.strength_summary && (
          <p className="text-[14px] text-neutral-600 leading-relaxed">
            {gapAnalysis.strength_summary}
          </p>
        )}

        {/* ── 5. Critical Gaps Callout ───────────────────────────────── */}
        {gapAnalysis.critical_gaps.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-[13px] font-semibold text-red-700">
                Critical Gaps
              </span>
            </div>
            <ul className="space-y-1 pl-6 list-disc">
              {gapAnalysis.critical_gaps.map((gap, i) => (
                <li
                  key={i}
                  className="text-[13px] text-red-700 leading-relaxed"
                >
                  {gap}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-red-600 italic">
              These are hard requirements (degree, certification, license) that
              cannot be positioned around.
            </p>
          </div>
        )}

        {/* ── 6. What Happens Next ───────────────────────────────────── */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 space-y-2">
          <p className="text-[13px] font-semibold text-blue-800">
            What Happens Next
          </p>
          <p className="text-[13px] text-blue-700 leading-relaxed">
            We found {totalReqs} requirements for this role. Your resume
            strongly covers {strong}, partially covers {partial}, and is missing{' '}
            {missing}.
          </p>
          <p className="text-[13px] text-blue-700 leading-relaxed">
            We&apos;re showing you the top {questionCount} gaps where we found
            adjacent experience in your background that can be positioned.
          </p>
        </div>

        {/* ── 7. Action Effects Explainer ─────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
            Your Options for Each Gap
          </p>
          <div className="space-y-2.5">
            {/* Use This */}
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-neutral-800">
                  Use This
                </p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  The AI will weave this positioning into your resume bullets
                  naturally. It won&apos;t appear as a separate section.
                </p>
              </div>
            </div>

            {/* Add Context */}
            <div className="flex items-start gap-3">
              <MessageCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-neutral-800">
                  Add Context
                </p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  Share details the AI couldn&apos;t find. Your input rewrites
                  the positioning with your specifics.
                </p>
              </div>
            </div>

            {/* Skip */}
            <div className="flex items-start gap-3">
              <SkipForward className="h-5 w-5 text-neutral-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-neutral-800">
                  Skip
                </p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  This gap stays unaddressed. Your strong matches still shine
                  &mdash; you can always come back later.
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-neutral-400 italic">
            All choices apply to THIS resume only. Your master resume is never
            modified.
          </p>
        </div>

        {/* ── 8. Begin Button ─────────────────────────────────────────── */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onBeginReview}
            className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Review {questionCount} Positioning Suggestion
            {questionCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
