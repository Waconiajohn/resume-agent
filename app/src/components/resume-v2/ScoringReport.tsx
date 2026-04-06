/**
 * ScoringReport — Before/After scoring report for the resume workspace
 *
 * Renders four collapsible sections inside the workspace rail:
 *   1. Before Report  — original resume scores and baseline keyword coverage
 *   2. After Report   — optimized resume scores with improvement deltas
 *   3. Keyword Analysis — side-by-side found/missing keyword breakdown
 *   4. Full Analysis  — gap analysis, benchmark, strategy, hiring manager scan
 *
 * Before Report defaults to open; other sections are collapsed by default.
 */

import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Zap,
  BarChart3,
  User,
} from 'lucide-react';
import type {
  ATSOptimizationDetail,
  AssemblyResult,
  GapAnalysis,
  PreScores,
  VerificationDetail,
} from '@/types/resume-v2';
import {
  RequirementsCoverageSection,
  TruthVerificationSection,
  ToneAnalysisSection,
  HiringManagerScanSection,
} from './scoring-report';

// ─── Shared primitives ────────────────────────────────────────────────────────

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="h-1.5 w-full rounded-full overflow-hidden"
      style={{ backgroundColor: 'var(--ring-track)' }}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

function DeltaBadge({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  const label = delta > 0 ? `+${delta}` : String(delta);
  const style: React.CSSProperties =
    delta > 0
      ? { color: 'var(--badge-green-text)', backgroundColor: 'var(--badge-green-bg)', border: '1px solid color-mix(in srgb, var(--badge-green-text) 28%, transparent)' }
      : delta < 0
        ? { color: 'var(--badge-red-text)', backgroundColor: 'var(--badge-red-bg)', border: '1px solid color-mix(in srgb, var(--badge-red-text) 28%, transparent)' }
        : { color: 'var(--text-soft)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--line-soft)' };
  return (
    <span className="rounded-md px-2.5 py-1 text-xs font-bold tabular-nums" style={style}>
      {label}
    </span>
  );
}

function KeywordChip({ keyword, variant }: { keyword: string; variant: 'found' | 'missing' }) {
  const style: React.CSSProperties =
    variant === 'found'
      ? { color: 'var(--badge-green-text)', backgroundColor: 'var(--badge-green-bg)', border: '1px solid color-mix(in srgb, var(--badge-green-text) 22%, transparent)' }
      : { color: 'var(--badge-red-text)', backgroundColor: 'var(--badge-red-bg)', border: '1px solid color-mix(in srgb, var(--badge-red-text) 22%, transparent)' };
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] leading-5" style={style}>
      {variant === 'found'
        ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        : <XCircle className="h-2.5 w-2.5 shrink-0" />}
      {keyword}
    </span>
  );
}

import { humanizeIssueType, humanizeSectionName } from './utils/humanize';

// ─── Section wrapper (collapsible) ────────────────────────────────────────────

function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-[var(--line-soft)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-1)] transition-colors"
        aria-expanded={open}
      >
        {icon && <span className="shrink-0 text-[var(--text-soft)]">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-muted)]">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--text-soft)] leading-4">{subtitle}</p>}
        </div>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-soft)]" />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-soft)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--line-soft)] px-4 py-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Score summary header ─────────────────────────────────────────────────────

function ScoreSummaryHeader({
  preScores,
  assembly,
  gapAnalysis,
}: {
  preScores: PreScores;
  assembly: AssemblyResult;
  gapAnalysis: GapAnalysis | null;
}) {
  const afterAts = assembly.scores.ats_match;
  const beforeAts = preScores.ats_match;
  const truth = assembly.scores.truth;
  const tone = assembly.scores.tone;
  const scan = assembly.hiring_manager_scan;
  const positioning = assembly.positioning_assessment;
  const jdBreakdown = gapAnalysis?.score_breakdown?.job_description;
  const benchBreakdown = gapAnalysis?.score_breakdown?.benchmark;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-4 space-y-3">
      <p className="text-sm font-medium text-[var(--text-strong)]">Resume Score Summary — After Optimization</p>

      {/* Strength summary one-liner */}
      {gapAnalysis?.strength_summary && (
        <p className="text-xs leading-5 text-[var(--text-muted)] italic">
          {gapAnalysis.strength_summary}
        </p>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {/* ATS */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">ATS Match</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--badge-green-text)' }}>{afterAts}%</span>
            <DeltaBadge before={beforeAts} after={afterAts} />
          </div>
          <ScoreBar value={afterAts} color="var(--badge-green-text)" />
          <p className="text-[10px] text-[var(--text-soft)]">Before: {beforeAts}%</p>
        </div>

        {/* Truth */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Truth</p>
          <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--link)' }}>{truth}</span>
          <ScoreBar value={truth} color="var(--link)" />
          <p className="text-[10px] text-[var(--text-soft)]">Claim verification</p>
        </div>

        {/* Tone */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Tone</p>
          <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--badge-amber-text)' }}>{tone}</span>
          <ScoreBar value={tone} color="var(--badge-amber-text)" />
          <p className="text-[10px] text-[var(--text-soft)]">Executive voice</p>
        </div>

        {/* Hiring Manager Scan */}
        {scan && (
          <div className={`rounded-lg border px-3 py-3 space-y-1.5 ${
            scan.pass
              ? 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)]'
              : 'border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)]'
          }`}>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Recruiter Scan</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums" style={{ color: scan.pass ? 'var(--badge-green-text)' : 'var(--badge-amber-text)' }}>
                {scan.scan_score}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${scan.pass ? 'text-[var(--badge-green-text)]' : 'text-[var(--badge-amber-text)]'}`}>
                {scan.pass ? 'PASS' : 'REVIEW'}
              </span>
            </div>
            <ScoreBar value={scan.scan_score} color={scan.pass ? 'var(--badge-green-text)' : 'var(--badge-amber-text)'} />
            {/* HM scan sub-scores */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {[
                { label: 'Header', score: scan.header_impact.score },
                { label: 'Summary', score: scan.summary_clarity.score },
                { label: 'Above Fold', score: scan.above_fold_strength.score },
                { label: 'Keywords', score: scan.keyword_visibility.score },
              ].map(({ label, score }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[9px] text-[var(--text-soft)]">{label}</span>
                  <span className="text-[10px] font-bold tabular-nums text-[var(--text-muted)]">{score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Candidate Fit section */}
      {(jdBreakdown || benchBreakdown || positioning) && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Candidate Fit</p>
          <div className="grid gap-2 grid-cols-1 lg:grid-cols-3">
            {/* JD Coverage */}
            {jdBreakdown && (
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-medium text-[var(--text-soft)]">JD Requirements</p>
                <p className="text-[9px] text-[var(--text-soft)]">What the employer asked for</p>
                <p className="text-xs font-medium text-[var(--text-strong)]">
                  {jdBreakdown.addressed} of {jdBreakdown.total} addressed
                </p>
                <div className="flex h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ring-track)' }}>
                  <div className="h-full bg-[var(--badge-green-text)]" style={{ width: `${jdBreakdown.total > 0 ? (jdBreakdown.strong / jdBreakdown.total) * 100 : 0}%` }} />
                  <div className="h-full bg-[var(--badge-amber-text)]" style={{ width: `${jdBreakdown.total > 0 ? (jdBreakdown.partial / jdBreakdown.total) * 100 : 0}%` }} />
                  <div className="h-full bg-[var(--badge-red-text)]" style={{ width: `${jdBreakdown.total > 0 ? (jdBreakdown.missing / jdBreakdown.total) * 100 : 0}%` }} />
                </div>
                <div className="flex gap-2 text-[9px] text-[var(--text-soft)]">
                  <span>{jdBreakdown.strong} strong</span>
                  <span>{jdBreakdown.partial} partial</span>
                  <span>{jdBreakdown.missing} missing</span>
                </div>
              </div>
            )}

            {/* Benchmark Coverage */}
            {benchBreakdown && (
              <div className="rounded-lg border border-[var(--line-soft)] border-dashed bg-[var(--surface-1)] px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-medium text-[var(--text-soft)]">Ideal Candidate</p>
                <p className="text-[9px] text-[var(--text-soft)]">Aspirational, not required</p>
                <p className="text-xs font-medium text-[var(--text-strong)]">
                  {benchBreakdown.addressed} of {benchBreakdown.total} met
                </p>
                <div className="flex h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ring-track)' }}>
                  <div className="h-full bg-[var(--badge-green-text)]" style={{ width: `${benchBreakdown.total > 0 ? (benchBreakdown.strong / benchBreakdown.total) * 100 : 0}%` }} />
                  <div className="h-full bg-[var(--badge-amber-text)]" style={{ width: `${benchBreakdown.total > 0 ? (benchBreakdown.partial / benchBreakdown.total) * 100 : 0}%` }} />
                  <div className="h-full bg-[var(--badge-red-text)]" style={{ width: `${benchBreakdown.total > 0 ? (benchBreakdown.missing / benchBreakdown.total) * 100 : 0}%` }} />
                </div>
                <div className="flex gap-2 text-[9px] text-[var(--text-soft)]">
                  <span>{benchBreakdown.strong} strong</span>
                  <span>{benchBreakdown.partial} partial</span>
                  <span>{benchBreakdown.missing} missing</span>
                </div>
              </div>
            )}

            {/* Positioning Assessment */}
            {positioning && (
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] text-[var(--text-soft)]">Positioning</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-[var(--text-strong)]">
                    {positioning.before_score} → {positioning.after_score}
                  </span>
                  <DeltaBadge before={positioning.before_score} after={positioning.after_score} />
                </div>
                <div className="flex gap-2 text-[9px] text-[var(--text-soft)]">
                  <span>{positioning.requirement_map.filter((r) => r.status === 'strong').length} strong</span>
                  <span>{positioning.requirement_map.filter((r) => r.status === 'repositioned').length} repositioned</span>
                  <span>{positioning.requirement_map.filter((r) => r.status === 'gap').length} gap</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CompactMetric({
  label,
  value,
  accent = 'default',
  detail,
}: {
  label: string;
  value: string;
  accent?: 'default' | 'good' | 'warn' | 'soft';
  detail?: string;
}) {
  return (
    <div className="score-snapshot-metric px-3 py-3" data-accent={accent}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="score-snapshot-metric__value text-2xl font-semibold tabular-nums">{value}</span>
      </div>
      {detail && (
        <p className="mt-1.5 text-xs leading-5 text-[var(--text-soft)]">{detail}</p>
      )}
    </div>
  );
}

function CompactScoreSummaryHeader({
  preScores,
  assembly,
  gapAnalysis,
  reviewStatusLabel,
  attentionSummary,
  attentionNextAction,
}: {
  preScores: PreScores;
  assembly: AssemblyResult;
  gapAnalysis: GapAnalysis | null;
  reviewStatusLabel?: string;
  attentionSummary?: string;
  attentionNextAction?: string;
}) {
  const beforeKeywordScore = preScores.keyword_match_score ?? preScores.ats_match;
  const afterAts = assembly.scores.ats_match;
  const truth = assembly.scores.truth;
  const tone = assembly.scores.tone;
  const hiringManagerScan = assembly.hiring_manager_scan;
  const jdBreakdown = gapAnalysis?.score_breakdown?.job_description;
  const outstandingRequirements = jdBreakdown
    ? jdBreakdown.partial + jdBreakdown.missing
    : null;
  const coveredRequirements = jdBreakdown?.addressed ?? null;
  const totalRequirements = jdBreakdown?.total ?? null;
  const beforeRequirementScore = preScores.job_requirement_coverage_score ?? jdBreakdown?.coverage_score ?? null;
  const afterRequirementScore = coveredRequirements !== null && totalRequirements
    ? Math.round((coveredRequirements / totalRequirements) * 100)
    : null;
  const beforeSnapshotScore = preScores.overall_fit_score ?? (beforeRequirementScore !== null
    ? Math.round((beforeKeywordScore * 0.35) + (beforeRequirementScore * 0.65))
    : beforeKeywordScore);
  const afterSnapshotScore = afterRequirementScore !== null
    ? Math.max(afterAts, afterRequirementScore)
    : afterAts;
  const delta = afterSnapshotScore - beforeSnapshotScore;
  const redFlags = hiringManagerScan?.red_flags.length ?? 0;

  const summaryLine = attentionSummary ?? (outstandingRequirements === null
    ? gapAnalysis?.strength_summary
      ?? `Your resume is ${delta >= 0 ? `${delta} points` : 'slightly'} stronger than the original draft.`
    : outstandingRequirements === 0
      ? `Your resume now clearly covers the job requirements we measured${reviewStatusLabel ? `, and final review is ${reviewStatusLabel.toLowerCase()}` : ''}.`
      : `Your resume is up ${delta} points, but ${outstandingRequirements} job requirement${outstandingRequirements === 1 ? '' : 's'} still need stronger proof${reviewStatusLabel ? ` and final review is ${reviewStatusLabel.toLowerCase()}` : ''}.`);

  const topGains = [
    `${Math.abs(delta)}-point on-paper improvement from your original resume`,
    coveredRequirements !== null && totalRequirements !== null
      ? `${coveredRequirements} of ${totalRequirements} measured role requirements now read as addressed`
      : null,
    hiringManagerScan
      ? `Recruiter scan is ${hiringManagerScan.pass ? 'passing' : 'flagged for review'} at ${hiringManagerScan.scan_score}`
      : null,
  ].filter((item): item is string => Boolean(item));

  const topRisks = [
    outstandingRequirements && outstandingRequirements > 0
      ? `${outstandingRequirements} role requirement${outstandingRequirements === 1 ? '' : 's'} still need stronger proof`
      : null,
    redFlags > 0
      ? `${redFlags} recruiter red flag${redFlags === 1 ? '' : 's'} still showing`
      : null,
  ].filter((item): item is string => Boolean(item));

  const visibleTopGains = topGains.slice(0, 2);
  const visibleTopRisks = topRisks.slice(0, 2);

  return (
    <div className="score-snapshot-shell px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mt-2 text-[1.05rem] font-semibold leading-6 text-[var(--text-strong)]">
            How your resume matches this job.
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--text-soft)]">
            Baseline, what improved, and the last items still worth tightening before export.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="score-snapshot-hero px-4 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">On-Paper Fit Score</p>
          <div className="mt-2.5 flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-soft)]">Before</p>
              <p className="mt-1 text-[1.75rem] font-semibold tabular-nums text-[var(--text-muted)]">{beforeSnapshotScore}%</p>
            </div>
            <span aria-hidden="true" className="pb-1 text-lg text-[var(--text-soft)]">-&gt;</span>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-soft)]">Now</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-[2.75rem] font-semibold tabular-nums tracking-tight" style={{ color: 'var(--badge-green-text)' }}>{afterSnapshotScore}%</p>
                <DeltaBadge before={beforeSnapshotScore} after={afterSnapshotScore} />
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="relative h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[rgba(175,196,255,0.38)]"
                style={{ width: `${beforeSnapshotScore}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${afterSnapshotScore}%`,
                  background: 'linear-gradient(90deg, rgba(181,222,194,0.78), rgba(210,236,219,0.95))',
                  boxShadow: '0 0 18px rgba(181,222,194,0.25)',
                }}
              />
            </div>
          </div>
          <div className="score-snapshot-meaning mt-3 rounded-xl px-3 py-2.5">
            <p className="mt-1.5 text-sm leading-5 text-[var(--text-muted)]">{summaryLine}</p>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2">
          {coveredRequirements !== null && totalRequirements !== null ? (
            <CompactMetric
              label="Requirements Met"
              value={`${coveredRequirements}/${totalRequirements}`}
              accent="good"
              detail="Job requirements your resume addresses"
            />
          ) : (
            <CompactMetric
              label="Requirements Met"
              value="N/A"
              detail="Job requirements your resume addresses"
            />
          )}
          <CompactMetric
            label="Accuracy + Polish"
            value={String(Math.min(truth, tone))}
            accent={Math.min(truth, tone) >= 85 ? 'good' : Math.min(truth, tone) >= 70 ? 'warn' : 'soft'}
            detail="How well each bullet holds up"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="score-snapshot-band score-snapshot-band--good px-3.5 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--badge-green-text)' }}>
            What improved
          </p>
          <ul className="mt-2.5 space-y-2">
            {visibleTopGains.map((gain) => (
              <li key={gain} className="flex items-start gap-2 text-sm leading-5 text-[var(--text-muted)]">
                <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
                <span>{gain}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="score-snapshot-band score-snapshot-band--warn px-3.5 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--badge-amber-text)' }}>
            Still to close
          </p>
          <ul className="mt-2.5 space-y-2">
            {visibleTopRisks.length > 0 ? visibleTopRisks.map((risk) => (
              <li key={risk} className="flex items-start gap-2 text-sm leading-5 text-[var(--text-muted)]">
                <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-amber-text)' }} />
                <span>{risk}</span>
              </li>
            )) : (
              <li className="flex items-start gap-2 text-sm leading-5 text-[var(--text-muted)]">
                <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
                <span>No major issues are blocking the draft right now.</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="support-callout px-3.5 py-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-soft)]">Do this next</p>
        <p className="mt-1.5 text-sm font-medium leading-5 text-[var(--text-muted)]">
          {attentionNextAction
            ? attentionNextAction
            : 'Run final review on this resume to catch any last hiring-manager, ATS, or credibility issues before export.'}
        </p>
      </div>
    </div>
  );
}

// ─── Before Report ────────────────────────────────────────────────────────────

const KEYWORD_COLUMN_LIMIT = 50;

function BeforeReport({
  preScores,
  gapAnalysis,
}: {
  preScores: PreScores;
  gapAnalysis: GapAnalysis | null;
}) {
  const foundCount = preScores.keywords_found.length;
  const missingCount = preScores.keywords_missing.length;
  const totalCount = foundCount + missingCount;
  const [showAll, setShowAll] = useState(false);

  const originalRequirementsAddressed = gapAnalysis
    ? gapAnalysis.requirements.filter((r) => r.classification === 'strong').length
    : null;
  const totalRequirements = gapAnalysis?.requirements.length ?? null;

  const visibleFound = showAll ? preScores.keywords_found : preScores.keywords_found.slice(0, KEYWORD_COLUMN_LIMIT);
  const visibleMissing = showAll ? preScores.keywords_missing : preScores.keywords_missing.slice(0, KEYWORD_COLUMN_LIMIT);
  const hasMore = foundCount > KEYWORD_COLUMN_LIMIT || missingCount > KEYWORD_COLUMN_LIMIT;

  return (
    <div className="space-y-4">
      {/* ATS baseline */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Original Keyword Match</p>
          <span className="text-sm font-bold tabular-nums text-[var(--text-soft)]">{preScores.keyword_match_score ?? preScores.ats_match}%</span>
        </div>
        <ScoreBar value={preScores.keyword_match_score ?? preScores.ats_match} color="rgba(175,196,255,0.6)" />
        <p className="text-[11px] text-[var(--text-soft)]">
          {foundCount} of {totalCount} JD keywords detected in the original resume
        </p>
      </div>

      {/* Coverage */}
      {originalRequirementsAddressed !== null && totalRequirements !== null && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Original Requirement Coverage</p>
          <p className="text-sm text-[var(--text-soft)]">
            <span className="font-semibold text-[var(--text-strong)]">{originalRequirementsAddressed}</span>
            {' '}of{' '}
            <span className="font-semibold text-[var(--text-strong)]">{totalRequirements}</span>
            {' '}JD requirements clearly addressed before optimization
          </p>
        </div>
      )}

      {/* Two-column keyword table */}
      {(foundCount > 0 || missingCount > 0) && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2">
            JD Keywords ({totalCount} total)
          </p>
          <div className="rounded-lg border border-[var(--line-soft)] overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-2 border-b border-[var(--line-soft)] bg-black/10">
              <div className="px-3 py-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  Found ({foundCount})
                </span>
              </div>
              <div className="px-3 py-2 flex items-center gap-1.5 border-l border-[var(--line-soft)]">
                <XCircle className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  Missing ({missingCount})
                </span>
              </div>
            </div>

            {/* Keyword rows */}
            <div className="grid grid-cols-2">
              {/* Found column */}
              <div className="py-1">
                {visibleFound.length === 0
                  ? <p className="px-3 py-2 text-[11px] text-[var(--text-soft)] italic">None detected</p>
                  : visibleFound.map((kw) => (
                    <div key={kw} className="flex items-center gap-2 px-3 py-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
                      <span className="text-[12px] text-[var(--text-muted)]">{kw}</span>
                    </div>
                  ))
                }
              </div>
              {/* Missing column */}
              <div className="py-1 border-l border-[var(--line-soft)]">
                {visibleMissing.length === 0
                  ? <p className="px-3 py-2 text-[11px] text-[var(--text-soft)] italic">All keywords present</p>
                  : visibleMissing.map((kw) => (
                    <div key={kw} className="flex items-center gap-2 px-3 py-1.5">
                      <XCircle className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
                      <span className="text-[12px] text-[var(--text-muted)]">{kw}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Show all toggle */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((p) => !p)}
              className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
            >
              {showAll
                ? <><ChevronUp className="h-3.5 w-3.5" />Show fewer keywords</>
                : <><ChevronDown className="h-3.5 w-3.5" />Show all keywords</>
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── After Report ─────────────────────────────────────────────────────────────

function AfterReport({
  preScores,
  assembly,
  verificationDetail,
}: {
  preScores: PreScores;
  assembly: AssemblyResult;
  verificationDetail: VerificationDetail | null;
}) {
  const ats = verificationDetail?.ats ?? null;
  const tone = verificationDetail?.tone ?? null;
  const truth = verificationDetail?.truth ?? null;
  const [showAllKeywords, setShowAllKeywords] = useState(false);

  const afterAts = assembly.scores.ats_match;
  const afterTone = assembly.scores.tone;
  const afterTruth = assembly.scores.truth;
  const positioning = assembly.positioning_assessment;

  const keywordsFoundAfter = ats?.keywords_found ?? [];
  const keywordsMissingAfter = ats?.keywords_missing ?? [];
  const keywordSuggestions = ats?.keyword_suggestions ?? [];
  const toneFindings = tone?.findings ?? [];
  const flaggedClaims = truth?.flagged_items ?? [];

  const requirementMap = positioning?.requirement_map ?? [];
  const addressedAfter = requirementMap.filter((r) => r.status === 'strong' || r.status === 'repositioned').length;

  // Identify newly added keywords (in after but not in before)
  const beforeFoundSet = new Set(preScores.keywords_found);
  const newlyAdded = keywordsFoundAfter.filter((kw) => !beforeFoundSet.has(kw));
  const newlyAddedSet = new Set(newlyAdded);

  const totalAfter = keywordsFoundAfter.length + keywordsMissingAfter.length;
  const hasMoreKeywords = keywordsFoundAfter.length > KEYWORD_COLUMN_LIMIT || keywordsMissingAfter.length > KEYWORD_COLUMN_LIMIT;

  const visibleFoundAfter = showAllKeywords ? keywordsFoundAfter : keywordsFoundAfter.slice(0, KEYWORD_COLUMN_LIMIT);
  const visibleMissingAfter = showAllKeywords ? keywordsMissingAfter : keywordsMissingAfter.slice(0, KEYWORD_COLUMN_LIMIT);

  // Map missing keywords to their placement suggestions for quick lookup
  const suggestionMap = new Map(keywordSuggestions.map((s) => [s.keyword, s]));

  return (
    <div className="space-y-4">
      {/* ATS delta headline */}
      <div className="rounded-lg border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Optimized ATS Match</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--badge-green-text)' }}>{afterAts}%</span>
            <DeltaBadge before={preScores.ats_match} after={afterAts} />
          </div>
        </div>
        <ScoreBar value={afterAts} color="var(--badge-green-text)" />
        <div className="flex items-center gap-1 text-[11px] text-[var(--text-soft)]">
          <span aria-hidden="true" className="text-[10px]">-&gt;</span>
          <span>
            {preScores.keywords_found.length} → {keywordsFoundAfter.length} keywords matched
            {newlyAdded.length > 0 && ` (+${newlyAdded.length} newly added)`}
          </span>
        </div>
      </div>

      {/* Requirement coverage after */}
      {requirementMap.length > 0 && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Requirement Coverage After Optimization</p>
          <p className="text-sm text-[var(--text-soft)]">
            <span className="font-semibold text-[var(--text-strong)]">{addressedAfter}</span>
            {' '}of{' '}
            <span className="font-semibold text-[var(--text-strong)]">{requirementMap.length}</span>
            {' '}requirements now clearly addressed
          </p>
          {positioning?.strategies_applied && positioning.strategies_applied.length > 0 && (
            <p className="mt-1 text-[11px] text-[var(--text-soft)]">
              {positioning.strategies_applied.length} gap positioning {positioning.strategies_applied.length === 1 ? 'strategy' : 'strategies'} applied
            </p>
          )}
        </div>
      )}

      {/* Two-column keyword table */}
      {(keywordsFoundAfter.length > 0 || keywordsMissingAfter.length > 0) && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2">
            JD Keywords ({totalAfter} total)
          </p>
          <div className="rounded-lg border border-[var(--line-soft)] overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-2 border-b border-[var(--line-soft)] bg-black/10">
              <div className="px-3 py-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  Found ({keywordsFoundAfter.length})
                </span>
              </div>
              <div className="px-3 py-2 flex items-center gap-1.5 border-l border-[var(--line-soft)]">
                <XCircle className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  Still Missing ({keywordsMissingAfter.length})
                </span>
              </div>
            </div>

            {/* Keyword rows */}
            <div className="grid grid-cols-2">
              {/* Found column */}
              <div className="py-1">
                {visibleFoundAfter.length === 0
                  ? <p className="px-3 py-2 text-[11px] text-[var(--text-soft)] italic">None matched</p>
                  : visibleFoundAfter.map((kw) => (
                    <div key={kw} className="flex items-center gap-2 px-3 py-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
                      <span className="text-[12px] text-[var(--text-muted)]">{kw}</span>
                      {newlyAddedSet.has(kw) && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ color: 'var(--badge-green-text)', backgroundColor: 'var(--badge-green-bg)', border: '1px solid color-mix(in srgb, var(--badge-green-text) 28%, transparent)' }}
                        >
                          NEW
                        </span>
                      )}
                    </div>
                  ))
                }
              </div>
              {/* Missing column — with placement hint if available */}
              <div className="py-1 border-l border-[var(--line-soft)]">
                {visibleMissingAfter.length === 0
                  ? <p className="px-3 py-2 text-[11px]" style={{ color: 'var(--badge-green-text)' }}>All keywords matched</p>
                  : visibleMissingAfter.map((kw) => {
                    const hint = suggestionMap.get(kw);
                    return (
                      <div key={kw} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
                          <span className="text-[12px] text-[var(--text-muted)]">{kw}</span>
                        </div>
                        {hint && (
                          <p className="text-[10px] text-[var(--text-soft)] leading-3.5 ml-5 mt-0.5 italic">
                            → {hint.suggested_placement}
                          </p>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>

          {/* Show all toggle */}
          {hasMoreKeywords && (
            <button
              type="button"
              onClick={() => setShowAllKeywords((p) => !p)}
              className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
            >
              {showAllKeywords
                ? <><ChevronUp className="h-3.5 w-3.5" />Show fewer keywords</>
                : <><ChevronDown className="h-3.5 w-3.5" />Show all keywords</>
              }
            </button>
          )}
        </div>
      )}

      {/* Keyword placement suggestions for still-missing keywords */}
      {keywordSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            How to add remaining keywords
          </p>
          {keywordSuggestions.map((s) => (
            <div key={s.keyword} className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--badge-amber-text)' }}>{s.keyword}</span>
                <span className="text-[10px] text-[var(--text-soft)]">→ {s.suggested_placement}</span>
              </div>
              <p className="text-xs text-[var(--text-soft)] leading-4 italic">{s.natural_phrasing}</p>
            </div>
          ))}
        </div>
      )}

      {/* Truth Score */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Truth Score</p>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--link)' }}>{afterTruth}/100</span>
        </div>
        <ScoreBar value={afterTruth} color="var(--link)" />
        {truth && truth.claims.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(['verified', 'plausible', 'unverified', 'fabricated'] as const).map((conf) => {
              const count = truth.claims.filter((c) => c.confidence === conf).length;
              if (count === 0) return null;
              const style: React.CSSProperties = conf === 'verified'
                ? { color: 'var(--badge-green-text)', backgroundColor: 'var(--badge-green-bg)', border: '1px solid color-mix(in srgb, var(--badge-green-text) 22%, transparent)' }
                : conf === 'plausible'
                ? { color: 'var(--link)', backgroundColor: 'var(--badge-blue-bg)', border: '1px solid color-mix(in srgb, var(--link) 22%, transparent)' }
                : conf === 'unverified'
                ? { color: 'var(--badge-amber-text)', backgroundColor: 'var(--badge-amber-bg)', border: '1px solid color-mix(in srgb, var(--badge-amber-text) 22%, transparent)' }
                : { color: 'var(--badge-red-text)', backgroundColor: 'var(--badge-red-bg)', border: '1px solid color-mix(in srgb, var(--badge-red-text) 22%, transparent)' };
              return (
                <span key={conf} className="rounded-md px-2 py-0.5 text-[10px] font-medium capitalize" style={style}>
                  {count} {conf}
                </span>
              );
            })}
          </div>
        )}
        {flaggedClaims.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--badge-green-text)' }}>All claims verified</p>
        )}
      </div>

      {/* Tone Score */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Executive Tone Score</p>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--badge-amber-text)' }}>{afterTone}/100</span>
        </div>
        <ScoreBar value={afterTone} color="var(--badge-amber-text)" />
        {toneFindings.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--badge-green-text)' }}>No tone issues detected</p>
        )}
        {toneFindings.length > 0 && (
          <p className="text-[11px] text-[var(--text-soft)]">{toneFindings.length} tone finding{toneFindings.length !== 1 ? 's' : ''} below</p>
        )}
      </div>

      {toneFindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Tone findings ({toneFindings.length})
          </p>
          {toneFindings.map((f, i) => (
            <div key={i} className="rounded-lg border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)] px-3 py-2.5 space-y-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--badge-amber-text)' }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">{humanizeSectionName(f.section)}: {humanizeIssueType(f.issue)}</p>
                  <p className="text-xs text-[var(--text-soft)] leading-4 line-clamp-2">"{f.text}"</p>
                </div>
              </div>
              {f.suggestion && (
                <p className="text-xs text-[var(--text-soft)] leading-4 ml-5">
                  <span style={{ color: 'var(--badge-green-text)' }}>Suggestion:</span> {f.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {flaggedClaims.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Flagged claims ({flaggedClaims.length})
          </p>
          {flaggedClaims.map((item, i) => (
            <div key={i} className="rounded-lg border border-[var(--badge-red-text)]/15 bg-[var(--badge-red-bg)] px-3 py-2.5 space-y-1">
              <p className="text-xs text-[var(--text-muted)] leading-4 line-clamp-2">"{item.claim}"</p>
              <p className="text-[11px] text-[var(--text-soft)]">{item.issue}</p>
              <p className="text-[11px]" style={{ color: 'var(--badge-green-text)' }}>{item.recommendation}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Keyword Analysis ─────────────────────────────────────────────────────────

function KeywordAnalysis({
  ats,
  preScores,
}: {
  ats: ATSOptimizationDetail | null;
  preScores: PreScores;
}) {
  const found = ats?.keywords_found ?? preScores.keywords_found;
  const missing = ats?.keywords_missing ?? preScores.keywords_missing;
  const suggestions = ats?.keyword_suggestions ?? [];
  const total = found.length + missing.length;

  return (
    <div className="space-y-4">
      {/* Summary line */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
        <p className="text-sm text-[var(--text-soft)]">
          <span className="font-semibold text-[var(--text-strong)]">{found.length}</span>
          {' '}of{' '}
          <span className="font-semibold text-[var(--text-strong)]">{total}</span>
          {' '}keywords matched after optimization
        </p>
        <div className="mt-2">
          <ScoreBar value={total > 0 ? Math.round((found.length / total) * 100) : 0} color="var(--badge-green-text)" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" style={{ color: 'var(--badge-green-text)' }} />
            Found in Resume ({found.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {found.length === 0
              ? <p className="text-xs text-[var(--text-soft)]">None detected</p>
              : found.map((kw) => <KeywordChip key={kw} keyword={kw} variant="found" />)}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2 flex items-center gap-1.5">
            <XCircle className="h-3 w-3" style={{ color: 'var(--badge-red-text)' }} />
            Missing from Resume ({missing.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.length === 0
              ? <p className="text-xs" style={{ color: 'var(--badge-green-text)' }}>All keywords matched</p>
              : missing.map((kw) => <KeywordChip key={kw} keyword={kw} variant="missing" />)}
          </div>
        </div>
      </div>

      {/* Placement suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">How to add missing keywords</p>
          {suggestions.map((s) => (
            <div
              key={s.keyword}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: 'var(--badge-amber-text)' }}>{s.keyword}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ color: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  {s.suggested_placement}
                </span>
              </div>
              <p className="text-xs text-[var(--text-soft)] leading-4 italic">{s.natural_phrasing}</p>
            </div>
          ))}
        </div>
      )}

      {/* Formatting issues */}
      {ats && ats.formatting_issues.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">ATS formatting notes</p>
          {ats.formatting_issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)] px-3 py-2">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--badge-amber-text)' }} />
              <p className="text-xs text-[var(--text-soft)]">{issue}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── ScoringReport (public API) ───────────────────────────────────────────────

export interface ScoringReportProps {
  preScores: PreScores;
  assembly: AssemblyResult;
  verificationDetail: VerificationDetail | null;
  gapAnalysis: GapAnalysis | null;
  compact?: boolean;
  compactReviewStatusLabel?: string;
  compactAttentionSummary?: string;
  compactAttentionNextAction?: string;
  renderSummary?: boolean;
  renderDetails?: boolean;
}

function ScoringReportDetails({
  preScores,
  assembly,
  verificationDetail,
  gapAnalysis,
}: {
  preScores: PreScores;
  assembly: AssemblyResult;
  verificationDetail: VerificationDetail | null;
  gapAnalysis: GapAnalysis | null;
}) {
  const ats = verificationDetail?.ats ?? null;
  const truth = verificationDetail?.truth ?? null;
  const tone = verificationDetail?.tone ?? null;
  const hiringManagerScan = assembly.hiring_manager_scan ?? null;

  return (
    <>
      {/* Before Report */}
      <CollapsibleSection
        title="Before Report"
        subtitle="How the original resume scored before the rebuild"
        icon={<BarChart3 className="h-3.5 w-3.5" />}
        defaultOpen={true}
      >
        <BeforeReport preScores={preScores} gapAnalysis={gapAnalysis} />
      </CollapsibleSection>

      {/* After Report */}
      <CollapsibleSection
        title="After Report"
        subtitle="How the optimized resume scores with improvement deltas"
        icon={<Zap className="h-3.5 w-3.5" />}
      >
        <AfterReport
          preScores={preScores}
          assembly={assembly}
          verificationDetail={verificationDetail}
        />
      </CollapsibleSection>

      {/* Requirements Coverage — full breakdown by classification */}
      {gapAnalysis && (() => {
        const jdCount = gapAnalysis.requirements.filter(r => r.source === 'job_description').length;
        const benchCount = gapAnalysis.requirements.filter(r => r.source === 'benchmark').length;
        const strongCount = gapAnalysis.requirements.filter(r => r.classification === 'strong').length;
        const partialCount = gapAnalysis.requirements.filter(r => r.classification === 'partial').length;
        const missingCount = gapAnalysis.requirements.filter(r => r.classification === 'missing').length;
        return (
          <CollapsibleSection
            title="Requirements Coverage"
            subtitle={`${jdCount} from job description, ${benchCount} from ideal candidate profile — ${strongCount} strong, ${partialCount} partial, ${missingCount} gaps`}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          >
            <RequirementsCoverageSection gapAnalysis={gapAnalysis} />
          </CollapsibleSection>
        );
      })()}

      {/* Keyword Analysis */}
      <CollapsibleSection
        title="Keyword Analysis"
        subtitle={ats
          ? `${ats.keywords_found.length} of ${ats.keywords_found.length + ats.keywords_missing.length} keywords matched`
          : `${preScores.keywords_found.length} of ${preScores.keywords_found.length + preScores.keywords_missing.length} keywords in original`}
        icon={<Shield className="h-3.5 w-3.5" />}
      >
        <KeywordAnalysis ats={ats} preScores={preScores} />
      </CollapsibleSection>

      {/* Truth Verification — full claim-by-claim breakdown */}
      {truth && (
        <CollapsibleSection
          title="Truth Verification"
          subtitle={`Score: ${truth.truth_score} — ${truth.claims.length} claims analyzed${truth.flagged_items.length > 0 ? `, ${truth.flagged_items.length} flagged` : ''}`}
          icon={<Shield className="h-3.5 w-3.5" />}
        >
          <TruthVerificationSection truth={truth} />
        </CollapsibleSection>
      )}

      {/* Tone Analysis — full findings breakdown */}
      {tone && (
        <CollapsibleSection
          title="Tone Analysis"
          subtitle={`Score: ${tone.tone_score} — ${tone.findings.length} finding${tone.findings.length !== 1 ? 's' : ''}${tone.banned_phrases_found.length > 0 ? `, ${tone.banned_phrases_found.length} banned phrase${tone.banned_phrases_found.length !== 1 ? 's' : ''}` : ''}`}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        >
          <ToneAnalysisSection tone={tone} />
        </CollapsibleSection>
      )}

      {/* Hiring Manager Scan — full sub-score breakdown */}
      {hiringManagerScan && (
        <CollapsibleSection
          title="Hiring Manager Scan"
          subtitle={`Score: ${hiringManagerScan.scan_score} — ${hiringManagerScan.pass ? 'PASS' : 'NEEDS WORK'}${hiringManagerScan.red_flags.length > 0 ? ` — ${hiringManagerScan.red_flags.length} red flag${hiringManagerScan.red_flags.length !== 1 ? 's' : ''}` : ''}`}
          icon={<User className="h-3.5 w-3.5" />}
        >
          <HiringManagerScanSection scan={hiringManagerScan} />
        </CollapsibleSection>
      )}
    </>
  );
}

function ScoringReportDetailsDisclosure({
  preScores,
  assembly,
  verificationDetail,
  gapAnalysis,
}: {
  preScores: PreScores;
  assembly: AssemblyResult;
  verificationDetail: VerificationDetail | null;
  gapAnalysis: GapAnalysis | null;
}) {
  return (
    <CollapsibleSection
      title="Full Scoring Report"
      subtitle="Open the full before/after, keyword, truth, tone, and hiring-manager analysis when you want the details."
      icon={<BarChart3 className="h-3.5 w-3.5" />}
    >
      <ScoringReportDetails
        preScores={preScores}
        assembly={assembly}
        verificationDetail={verificationDetail}
        gapAnalysis={gapAnalysis}
      />
    </CollapsibleSection>
  );
}

export function ScoringReport({
  preScores,
  assembly,
  verificationDetail,
  gapAnalysis,
  compact = false,
  compactReviewStatusLabel,
  compactAttentionSummary,
  compactAttentionNextAction,
  renderSummary = true,
  renderDetails = true,
}: ScoringReportProps) {
  return (
    <div className="space-y-3">
      {renderSummary && (
        compact ? (
          <CompactScoreSummaryHeader
            preScores={preScores}
            assembly={assembly}
            gapAnalysis={gapAnalysis}
            reviewStatusLabel={compactReviewStatusLabel}
            attentionSummary={compactAttentionSummary}
            attentionNextAction={compactAttentionNextAction}
          />
        ) : (
          <ScoreSummaryHeader preScores={preScores} assembly={assembly} gapAnalysis={gapAnalysis} />
        )
      )}

      {renderDetails && (
        compact
          ? (
            <ScoringReportDetailsDisclosure
              preScores={preScores}
              assembly={assembly}
              verificationDetail={verificationDetail}
              gapAnalysis={gapAnalysis}
            />
          )
          : (
            <ScoringReportDetails
              preScores={preScores}
              assembly={assembly}
              verificationDetail={verificationDetail}
              gapAnalysis={gapAnalysis}
            />
          )
      )}
    </div>
  );
}
