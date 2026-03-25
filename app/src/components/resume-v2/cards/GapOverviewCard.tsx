/**
 * GapOverviewCard — Unified pre-resume report card.
 *
 * Merges ATS keyword match (from PreScores) and coverage analysis (from
 * GapAnalysis) into one card.  Supports a collapsed summary bar so it can
 * stay visible while gap coaching questions are active.
 */

import { useState } from 'react';
import {
  CheckCircle,
  MessageCircle,
  SkipForward,
  ShieldAlert,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import type { GapAnalysis, PreScores } from '@/types/resume-v2';

// ─── Props ──────────────────────────────────────────────────────────────────

interface GapOverviewCardProps {
  gapAnalysis: GapAnalysis;
  preScores?: PreScores | null;
  questionCount: number;
  onBeginReview: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isReviewing?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function classificationBadge(classification: string) {
  const config: Record<string, { label: string; className: string }> = {
    strong: { label: 'Strong', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial: { label: 'Partial', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    missing: { label: 'Missing', className: 'bg-red-50 text-red-700 border-red-200' },
  };
  const c = config[classification] ?? { label: classification, className: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.className}`}>
      {c.label}
    </span>
  );
}

function importanceBadge(importance: string) {
  const config: Record<string, { label: string; className: string }> = {
    must_have: { label: 'Must Have', className: 'bg-red-50 text-red-600 border-red-200' },
    important: { label: 'Important', className: 'bg-amber-50 text-amber-600 border-amber-200' },
    nice_to_have: { label: 'Nice to Have', className: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
  };
  const c = config[importance] ?? { label: importance, className: 'bg-neutral-50 text-neutral-500 border-neutral-200' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.className}`}>
      {c.label}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GapOverviewCard({
  gapAnalysis,
  preScores,
  questionCount,
  onBeginReview,
  collapsed = false,
  onToggleCollapse,
  isReviewing = false,
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

  // ATS keyword list toggles
  const [showFoundKeywords, setShowFoundKeywords] = useState(false);
  const [showMissingKeywords, setShowMissingKeywords] = useState(false);

  // Score breakdown box toggles
  const [showJdRequirements, setShowJdRequirements] = useState(false);
  const [showBenchmarkRequirements, setShowBenchmarkRequirements] = useState(false);

  // ── Collapsed summary bar ─────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        className="cursor-pointer rounded-lg bg-white shadow px-4 py-3 flex items-center justify-between"
        role="button"
        aria-label="Expand overview card"
      >
        <div className="flex items-center gap-4 text-sm">
          {preScores && <span>ATS: {preScores.ats_match}%</span>}
          <span>Coverage: {gapAnalysis.coverage_score}%</span>
          <span className="text-neutral-400">
            {strong} strong &middot; {partial} partial &middot; {missing} missing
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-neutral-400" />
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  const jdRequirements = gapAnalysis.requirements.filter(
    (r) => r.source === 'job_description',
  );
  const benchmarkRequirements = gapAnalysis.requirements.filter(
    (r) => r.source === 'benchmark',
  );

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden"
      role="main"
      aria-label="Gap overview before coaching questions"
    >
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
          Your Resume vs. This Role
        </h2>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Collapse overview card"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* ── ATS Keyword Match (shown when preScores provided) ───────── */}
        {preScores && (
          <div className="space-y-3">
            <div className="flex items-end gap-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-neutral-900 tabular-nums leading-none">
                  {preScores.ats_match}%
                </span>
              </div>
              <span className="text-[13px] text-neutral-500 pb-1">
                ATS Keyword Match
              </span>
            </div>

            {/* ATS progress bar */}
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
              role="progressbar"
              aria-valuenow={preScores.ats_match}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`ATS match: ${preScores.ats_match}%`}
            >
              <div
                className="h-full rounded-full bg-blue-400 transition-[width] duration-700 ease-out"
                style={{ width: `${preScores.ats_match}%` }}
              />
            </div>

            {/* Keywords Found — expandable */}
            <div>
              <button
                type="button"
                onClick={() => setShowFoundKeywords((p) => !p)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
              >
                {showFoundKeywords ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Keywords Found ({preScores.keywords_found.length})
              </button>
              {showFoundKeywords && preScores.keywords_found.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pl-5">
                  {preScores.keywords_found.map((kw, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Keywords Missing — expandable */}
            <div>
              <button
                type="button"
                onClick={() => setShowMissingKeywords((p) => !p)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                {showMissingKeywords ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Keywords Missing ({preScores.keywords_missing.length})
              </button>
              {showMissingKeywords && preScores.keywords_missing.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pl-5">
                  {preScores.keywords_missing.map((kw, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] text-red-700"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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

        {/* ── 3. Score Breakdown (expandable boxes) ────────────────────── */}
        {breakdown && (
          <div className="grid grid-cols-2 gap-3">
            {/* JD box */}
            <div
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 cursor-pointer hover:border-neutral-300 transition-colors"
              onClick={() => setShowJdRequirements((p) => !p)}
              role="button"
              aria-expanded={showJdRequirements}
            >
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
              {showJdRequirements && jdRequirements.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
                  {jdRequirements.map((req, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <p className="text-[12px] text-neutral-600 leading-relaxed flex-1">
                        {req.requirement}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {classificationBadge(req.classification)}
                        {importanceBadge(req.importance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Benchmark box */}
            <div
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 cursor-pointer hover:border-neutral-300 transition-colors"
              onClick={() => setShowBenchmarkRequirements((p) => !p)}
              role="button"
              aria-expanded={showBenchmarkRequirements}
            >
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
              {showBenchmarkRequirements && benchmarkRequirements.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
                  {benchmarkRequirements.map((req, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <p className="text-[12px] text-neutral-600 leading-relaxed flex-1">
                        {req.requirement}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {classificationBadge(req.classification)}
                        {importanceBadge(req.importance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              These are formal credentials not found in your resume. They may
              require additional certification or documentation.
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

        {/* ── 8. Begin Button (only when not yet reviewing) ──────────── */}
        {!isReviewing && (
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
        )}
      </div>
    </div>
  );
}
