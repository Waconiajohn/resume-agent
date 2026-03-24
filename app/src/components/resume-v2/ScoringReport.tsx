/**
 * ScoringReport — Before/After scoring report for the resume workspace
 *
 * Renders four collapsible sections inside the workspace rail:
 *   1. Before Report  — original resume scores and baseline keyword coverage
 *   2. After Report   — optimized resume scores with improvement deltas
 *   3. Keyword Analysis — side-by-side found/missing keyword breakdown
 *   4. Full Analysis  — gap analysis, benchmark, strategy, hiring manager scan
 *
 * All sections are collapsed by default.
 */

import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ArrowRight,
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
  ExecutiveToneDetail,
  GapAnalysis,
  HiringManagerScan,
  NarrativeStrategy,
  BenchmarkCandidate,
  PositioningAssessment,
  PreScores,
  TruthVerificationDetail,
  VerificationDetail,
} from '@/types/resume-v2';

// ─── Shared primitives ────────────────────────────────────────────────────────

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="h-1.5 w-full rounded-full overflow-hidden"
      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
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
      ? { color: '#b5dec2', backgroundColor: 'rgba(181,222,194,0.12)', border: '1px solid rgba(181,222,194,0.28)' }
      : delta < 0
        ? { color: '#f0b8b8', backgroundColor: 'rgba(240,184,184,0.12)', border: '1px solid rgba(240,184,184,0.28)' }
        : { color: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' };
  return (
    <span className="rounded-md px-2.5 py-1 text-xs font-bold tabular-nums" style={style}>
      {label}
    </span>
  );
}

function KeywordChip({ keyword, variant }: { keyword: string; variant: 'found' | 'missing' }) {
  const style: React.CSSProperties =
    variant === 'found'
      ? { color: '#b5dec2', backgroundColor: 'rgba(181,222,194,0.10)', border: '1px solid rgba(181,222,194,0.22)' }
      : { color: '#f0b8b8', backgroundColor: 'rgba(240,184,184,0.10)', border: '1px solid rgba(240,184,184,0.22)' };
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] leading-5" style={style}>
      {variant === 'found'
        ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        : <XCircle className="h-2.5 w-2.5 shrink-0" />}
      {keyword}
    </span>
  );
}

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
}: {
  preScores: PreScores;
  assembly: AssemblyResult;
}) {
  const afterAts = assembly.scores.ats_match;
  const beforeAts = preScores.ats_match;
  const truth = assembly.scores.truth;
  const tone = assembly.scores.tone;
  const scan = assembly.hiring_manager_scan;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-4 space-y-3">
      <p className="text-sm font-medium text-[var(--text-strong)]">Resume Score Summary</p>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {/* ATS */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">ATS Match</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums" style={{ color: '#b5dec2' }}>{afterAts}%</span>
            <DeltaBadge before={beforeAts} after={afterAts} />
          </div>
          <ScoreBar value={afterAts} color="#b5dec2" />
          <p className="text-[10px] text-[var(--text-soft)]">Was {beforeAts}%</p>
        </div>

        {/* Truth */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Truth</p>
          <span className="text-xl font-bold tabular-nums" style={{ color: '#afc4ff' }}>{truth}</span>
          <ScoreBar value={truth} color="#afc4ff" />
          <p className="text-[10px] text-[var(--text-soft)]">Claim verification</p>
        </div>

        {/* Tone */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Tone</p>
          <span className="text-xl font-bold tabular-nums" style={{ color: '#f0d99f' }}>{tone}</span>
          <ScoreBar value={tone} color="#f0d99f" />
          <p className="text-[10px] text-[var(--text-soft)]">Executive voice</p>
        </div>

        {/* Hiring Manager Scan */}
        {scan && (
          <div className={`rounded-lg border px-3 py-3 space-y-1.5 ${
            scan.pass
              ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.05]'
              : 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.05]'
          }`}>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Recruiter Scan</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums" style={{ color: scan.pass ? '#b5dec2' : '#f0d99f' }}>
                {scan.scan_score}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${scan.pass ? 'text-[#b5dec2]' : 'text-[#f0d99f]'}`}>
                {scan.pass ? 'PASS' : 'REVIEW'}
              </span>
            </div>
            <ScoreBar value={scan.scan_score} color={scan.pass ? '#b5dec2' : '#f0d99f'} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Before Report ────────────────────────────────────────────────────────────

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
  const originalRequirementsAddressed = gapAnalysis
    ? gapAnalysis.requirements.filter((r) => r.classification === 'strong').length
    : null;
  const totalRequirements = gapAnalysis?.requirements.length ?? null;

  return (
    <div className="space-y-4">
      {/* ATS baseline */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Original ATS Match</p>
          <span className="text-sm font-bold tabular-nums text-[var(--text-soft)]">{preScores.ats_match}%</span>
        </div>
        <ScoreBar value={preScores.ats_match} color="rgba(175,196,255,0.6)" />
        <p className="text-[11px] text-[var(--text-soft)]">
          {foundCount} of {totalCount} keywords detected in the original resume
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

      {/* Keywords found */}
      {preScores.keywords_found.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2">
            Keywords already in original resume ({foundCount})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preScores.keywords_found.map((kw) => (
              <KeywordChip key={kw} keyword={kw} variant="found" />
            ))}
          </div>
        </div>
      )}

      {/* Keywords missing */}
      {preScores.keywords_missing.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2">
            Keywords missing from original resume ({missingCount})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preScores.keywords_missing.map((kw) => (
              <KeywordChip key={kw} keyword={kw} variant="missing" />
            ))}
          </div>
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

  return (
    <div className="space-y-4">
      {/* ATS after */}
      <div className="rounded-lg border border-[#b5dec2]/20 bg-[#b5dec2]/[0.04] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Optimized ATS Match</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums" style={{ color: '#b5dec2' }}>{afterAts}%</span>
            <DeltaBadge before={preScores.ats_match} after={afterAts} />
          </div>
        </div>
        <ScoreBar value={afterAts} color="#b5dec2" />
        <div className="flex items-center gap-1 text-[11px] text-[var(--text-soft)]">
          <ArrowRight className="h-2.5 w-2.5 shrink-0" />
          <span>Improved from {preScores.ats_match}%</span>
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

      {/* Keywords found after */}
      {keywordsFoundAfter.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2">
            Keywords now in resume ({keywordsFoundAfter.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywordsFoundAfter.map((kw) => (
              <KeywordChip key={kw} keyword={kw} variant="found" />
            ))}
          </div>
        </div>
      )}

      {/* Keywords still missing */}
      {keywordsMissingAfter.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2">
            Keywords still missing ({keywordsMissingAfter.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywordsMissingAfter.map((kw) => (
              <KeywordChip key={kw} keyword={kw} variant="missing" />
            ))}
          </div>
        </div>
      )}

      {/* Keyword placement suggestions */}
      {keywordSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Suggested keyword placements
          </p>
          {keywordSuggestions.map((s) => (
            <div key={s.keyword} className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: '#f0d99f' }}>{s.keyword}</span>
                <span className="text-[10px] text-[var(--text-soft)]">→ {s.suggested_placement}</span>
              </div>
              <p className="text-xs text-[var(--text-soft)] leading-4 italic">{s.natural_phrasing}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tone */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Executive Tone Score</p>
          <span className="text-sm font-bold tabular-nums" style={{ color: '#f0d99f' }}>{afterTone}</span>
        </div>
        <ScoreBar value={afterTone} color="#f0d99f" />
        {toneFindings.length === 0 && (
          <p className="text-[11px]" style={{ color: '#b5dec2' }}>No tone issues detected</p>
        )}
      </div>

      {toneFindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Tone findings ({toneFindings.length})
          </p>
          {toneFindings.map((f, i) => (
            <div key={i} className="rounded-lg border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] px-3 py-2.5 space-y-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: '#f0d99f' }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">{f.section}</p>
                  <p className="text-xs text-[var(--text-soft)] leading-4 line-clamp-2">"{f.text}"</p>
                </div>
              </div>
              {f.suggestion && (
                <p className="text-xs text-[var(--text-soft)] leading-4 ml-5">
                  <span style={{ color: '#b5dec2' }}>Suggestion:</span> {f.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Truth */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Truth Verification Score</p>
          <span className="text-sm font-bold tabular-nums" style={{ color: '#afc4ff' }}>{afterTruth}</span>
        </div>
        <ScoreBar value={afterTruth} color="#afc4ff" />
        {flaggedClaims.length === 0 && (
          <p className="text-[11px]" style={{ color: '#b5dec2' }}>All claims verified</p>
        )}
      </div>

      {flaggedClaims.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Flagged claims ({flaggedClaims.length})
          </p>
          {flaggedClaims.map((item, i) => (
            <div key={i} className="rounded-lg border border-[#f0b8b8]/15 bg-[#f0b8b8]/[0.04] px-3 py-2.5 space-y-1">
              <p className="text-xs text-[var(--text-muted)] leading-4 line-clamp-2">"{item.claim}"</p>
              <p className="text-[11px] text-[var(--text-soft)]">{item.issue}</p>
              <p className="text-[11px]" style={{ color: '#b5dec2' }}>{item.recommendation}</p>
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
          <ScoreBar value={total > 0 ? Math.round((found.length / total) * 100) : 0} color="#b5dec2" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" style={{ color: '#b5dec2' }} />
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
            <XCircle className="h-3 w-3" style={{ color: '#f0b8b8' }} />
            Missing from Resume ({missing.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.length === 0
              ? <p className="text-xs" style={{ color: '#b5dec2' }}>All keywords matched</p>
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
                <span className="text-xs font-semibold" style={{ color: '#f0d99f' }}>{s.keyword}</span>
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
            <div key={i} className="flex items-start gap-2 rounded-lg border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] px-3 py-2">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: '#f0d99f' }} />
              <p className="text-xs text-[var(--text-soft)]">{issue}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Full Analysis ────────────────────────────────────────────────────────────

function FullAnalysis({
  gapAnalysis,
  benchmarkCandidate,
  narrativeStrategy,
  positioningAssessment,
  hiringManagerScan,
}: {
  gapAnalysis: GapAnalysis | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  narrativeStrategy: NarrativeStrategy | null;
  positioningAssessment: PositioningAssessment | null;
  hiringManagerScan: HiringManagerScan | null;
}) {
  return (
    <div className="space-y-4">
      {/* Gap Analysis */}
      {gapAnalysis && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em]">Gap Analysis</p>
          <p className="text-xs text-[var(--text-soft)] leading-5">{gapAnalysis.strength_summary}</p>
          <div className="grid gap-2 grid-cols-3">
            {[
              { label: 'Strong', count: gapAnalysis.requirements.filter(r => r.classification === 'strong').length, color: '#b5dec2' },
              { label: 'Partial', count: gapAnalysis.requirements.filter(r => r.classification === 'partial').length, color: '#f0d99f' },
              { label: 'Missing', count: gapAnalysis.requirements.filter(r => r.classification === 'missing').length, color: '#f0b8b8' },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center rounded-lg border border-[var(--line-soft)] bg-black/10 px-2 py-2">
                <p className="text-lg font-bold tabular-nums" style={{ color }}>{count}</p>
                <p className="text-[10px] text-[var(--text-soft)]">{label}</p>
              </div>
            ))}
          </div>
          {gapAnalysis.critical_gaps.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-1.5">Critical gaps</p>
              <ul className="space-y-1">
                {gapAnalysis.critical_gaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                    <span className="shrink-0 mt-1 h-1 w-1 rounded-full bg-[#f0b8b8]" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Benchmark */}
      {benchmarkCandidate && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em]">Benchmark Candidate</p>
          <p className="text-xs text-[var(--text-soft)] leading-5">{benchmarkCandidate.ideal_profile_summary}</p>
          {benchmarkCandidate.differentiators.length > 0 && (
            <div>
              <p className="text-[11px] text-[var(--text-soft)] uppercase tracking-[0.14em] mb-1">Key differentiators expected</p>
              <ul className="space-y-0.5">
                {benchmarkCandidate.differentiators.slice(0, 4).map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                    <span className="shrink-0 mt-1 h-1 w-1 rounded-full bg-[#afc4ff]" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Narrative Strategy */}
      {narrativeStrategy && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em]">Narrative Strategy</p>
          <p className="text-xs font-medium" style={{ color: '#afc4ff' }}>{narrativeStrategy.primary_narrative}</p>
          {narrativeStrategy.why_me_concise && (
            <p className="text-xs text-[var(--text-soft)] leading-5 italic">"{narrativeStrategy.why_me_concise}"</p>
          )}
          {narrativeStrategy.supporting_themes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {narrativeStrategy.supporting_themes.slice(0, 5).map((theme, i) => (
                <span
                  key={i}
                  className="rounded-md px-2 py-0.5 text-[11px]"
                  style={{ color: '#afc4ff', backgroundColor: 'rgba(175,196,255,0.08)', border: '1px solid rgba(175,196,255,0.18)' }}
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Positioning Assessment */}
      {positioningAssessment && positioningAssessment.requirement_map.length > 0 && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em]">Positioning Map</p>
          <p className="text-xs text-[var(--text-soft)] leading-5">{positioningAssessment.summary}</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {positioningAssessment.requirement_map.map((entry, i) => {
              const statusColor = entry.status === 'strong' ? '#b5dec2' : entry.status === 'repositioned' ? '#f0d99f' : '#f0b8b8';
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span
                    className="shrink-0 mt-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium capitalize"
                    style={{ color: statusColor, backgroundColor: `${statusColor}14`, border: `1px solid ${statusColor}30` }}
                  >
                    {entry.status}
                  </span>
                  <span className="text-[var(--text-soft)] leading-4 min-w-0">{entry.requirement}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hiring Manager Scan */}
      {hiringManagerScan && (
        <div className={`rounded-lg border px-4 py-3 space-y-3 ${
          hiringManagerScan.pass
            ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.04]'
            : 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.04]'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em]">Hiring Manager Scan</p>
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${hiringManagerScan.pass ? 'text-[#b5dec2]' : 'text-[#f0d99f]'}`}>
              {hiringManagerScan.pass ? 'PASS' : 'NEEDS WORK'}
            </span>
          </div>

          <div className="grid gap-2 grid-cols-2">
            {[
              { label: 'Header Impact', score: hiringManagerScan.header_impact.score, note: hiringManagerScan.header_impact.note },
              { label: 'Summary Clarity', score: hiringManagerScan.summary_clarity.score, note: hiringManagerScan.summary_clarity.note },
              { label: 'Above-Fold Strength', score: hiringManagerScan.above_fold_strength.score, note: hiringManagerScan.above_fold_strength.note },
              { label: 'Keyword Visibility', score: hiringManagerScan.keyword_visibility.score, note: hiringManagerScan.keyword_visibility.note },
            ].map(({ label, score, note }) => (
              <div key={label} className="rounded-lg border border-[var(--line-soft)] bg-black/10 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[var(--text-soft)]">{label}</p>
                  <span className="text-[11px] font-bold tabular-nums text-[var(--text-muted)]">{score}</span>
                </div>
                <p className="text-[10px] text-[var(--text-soft)] leading-4">{note}</p>
              </div>
            ))}
          </div>

          {hiringManagerScan.red_flags.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-1.5">Red flags</p>
              <ul className="space-y-1">
                {hiringManagerScan.red_flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                    <XCircle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: '#f0b8b8' }} />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hiringManagerScan.quick_wins.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] mb-1.5">Quick wins</p>
              <ul className="space-y-1">
                {hiringManagerScan.quick_wins.map((win, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                    <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" style={{ color: '#b5dec2' }} />
                    {win}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
  benchmarkCandidate: BenchmarkCandidate | null;
  narrativeStrategy: NarrativeStrategy | null;
}

export function ScoringReport({
  preScores,
  assembly,
  verificationDetail,
  gapAnalysis,
  benchmarkCandidate,
  narrativeStrategy,
}: ScoringReportProps) {
  const ats = verificationDetail?.ats ?? null;
  const hiringManagerScan = assembly.hiring_manager_scan ?? null;
  const positioningAssessment = assembly.positioning_assessment ?? null;

  return (
    <div className="space-y-3">
      {/* Score summary header — always visible */}
      <ScoreSummaryHeader preScores={preScores} assembly={assembly} />

      {/* Before Report */}
      <CollapsibleSection
        title="Before Report"
        subtitle="How the original resume scored before AI optimization"
        icon={<BarChart3 className="h-3.5 w-3.5" />}
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

      {/* Full Analysis */}
      {(gapAnalysis || benchmarkCandidate || narrativeStrategy || positioningAssessment || hiringManagerScan) && (
        <CollapsibleSection
          title="Full Analysis"
          subtitle="Gap analysis, benchmark, strategy, and hiring manager scan"
          icon={<User className="h-3.5 w-3.5" />}
        >
          <FullAnalysis
            gapAnalysis={gapAnalysis}
            benchmarkCandidate={benchmarkCandidate}
            narrativeStrategy={narrativeStrategy}
            positioningAssessment={positioningAssessment}
            hiringManagerScan={hiringManagerScan}
          />
        </CollapsibleSection>
      )}
    </div>
  );
}
