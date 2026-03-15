import { useState } from 'react';
import { UserCheck, Loader2, AlertCircle, CheckCircle2, ChevronDown, Wrench } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import { cn } from '@/lib/utils';
import type {
  HiringManagerReviewResult,
  HiringManagerConcern,
} from '@/hooks/useHiringManagerReview';


// ─── Props ──────────────────────────────────────────────────────────

export interface HiringManagerReviewCardProps {
  /** Null = not yet requested. Render the trigger button. */
  result: HiringManagerReviewResult | null;
  isLoading: boolean;
  error: string | null;
  companyName: string;
  roleTitle: string;
  onRequestReview: () => void;
  /** Apply a concern's recommendation as an inline edit */
  onApplyRecommendation?: (concern: HiringManagerConcern) => void;
}

// ─── Verdict config ─────────────────────────────────────────────────

const VERDICT_CONFIG = {
  strong_candidate: {
    label: 'Strong Candidate',
    color: '#b5dec2',
    bg: 'rgba(181,222,194,0.10)',
    border: 'rgba(181,222,194,0.25)',
  },
  promising_needs_work: {
    label: 'Promising — Needs Work',
    color: '#f0d99f',
    bg: 'rgba(240,217,159,0.10)',
    border: 'rgba(240,217,159,0.25)',
  },
  significant_gaps: {
    label: 'Significant Gaps',
    color: '#f0b8b8',
    bg: 'rgba(240,184,184,0.10)',
    border: 'rgba(240,184,184,0.25)',
  },
} as const;

const SEVERITY_CONFIG = {
  critical: { color: '#f0b8b8', bg: 'rgba(240,184,184,0.12)', border: 'rgba(240,184,184,0.25)' },
  moderate: { color: '#f0d99f', bg: 'rgba(240,217,159,0.12)', border: 'rgba(240,217,159,0.25)' },
  minor: { color: '#afc4ff', bg: 'rgba(175,196,255,0.12)', border: 'rgba(175,196,255,0.25)' },
} as const;

// ─── Main component ─────────────────────────────────────────────────

export function HiringManagerReviewCard({
  result,
  isLoading,
  error,
  companyName,
  roleTitle,
  onRequestReview,
  onApplyRecommendation,
}: HiringManagerReviewCardProps) {
  const [expandedConcern, setExpandedConcern] = useState<number | null>(null);

  // Pre-review state: show trigger button
  if (!result && !isLoading && !error) {
    return (
      <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
        <div className="flex items-start gap-3">
          <UserCheck className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#afc4ff' }} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90 mb-1">
              Hiring Manager Review
            </h3>
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              See your resume through the eyes of the hiring manager at {companyName}.
              Get specific, actionable feedback on what would make them want to interview you.
            </p>
            <button
              type="button"
              onClick={onRequestReview}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 transition-colors"
            >
              <UserCheck className="h-4 w-4" />
              Run Hiring Manager Review
            </button>
          </div>
        </div>
      </GlassCard>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-[#afc4ff] motion-safe:animate-spin" />
          <div>
            <h3 className="text-sm font-semibold text-white/90">
              Reviewing as Hiring Manager...
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Evaluating your resume as the {roleTitle} hiring manager at {companyName}
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // Error state
  if (error) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 text-sm text-[#f0b8b8]/80">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <button
          type="button"
          onClick={onRequestReview}
          className="mt-3 text-xs text-[#afc4ff] hover:text-[#afc4ff]/80 transition-colors"
        >
          Try again
        </button>
      </GlassCard>
    );
  }

  if (!result) return null;

  const verdict = VERDICT_CONFIG[result.verdict];

  return (
    <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
      {/* Header + verdict */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 shrink-0" style={{ color: '#afc4ff' }} />
          <h2 className="text-sm font-semibold text-white/90">
            Hiring Manager Review — {companyName}
          </h2>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: verdict.color, backgroundColor: verdict.bg, border: `1px solid ${verdict.border}` }}
        >
          {verdict.label}
        </span>
      </div>

      {/* Overall impression */}
      <p className="text-sm text-white/70 leading-relaxed mb-5 italic">
        &ldquo;{result.overall_impression}&rdquo;
      </p>

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <div className="mb-5">
          <h4 className="text-[10px] font-semibold text-[#b5dec2] uppercase tracking-wider mb-2">
            What Impressed Me ({result.strengths.length})
          </h4>
          <div className="space-y-2">
            {result.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 mt-0.5 text-[#b5dec2] shrink-0" />
                <div>
                  <span className="text-white/70">{s.observation}</span>
                  <span className="text-white/35 ml-1">— {s.why_it_matters}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concerns */}
      {result.concerns.length > 0 && (
        <div className="mb-5">
          <h4 className="text-[10px] font-semibold text-[#f0b8b8] uppercase tracking-wider mb-2">
            My Concerns ({result.concerns.length})
          </h4>
          <div className="space-y-2">
            {result.concerns.map((concern, i) => {
              const sev = SEVERITY_CONFIG[concern.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.moderate;
              const isExpanded = expandedConcern === i;

              return (
                <div
                  key={i}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: `${sev.border}` }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedConcern(isExpanded ? null : i)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 text-white/30 shrink-0 transition-transform duration-200',
                        isExpanded ? 'rotate-0' : '-rotate-90',
                      )}
                    />
                    <span className="flex-1 text-xs text-white/70">{concern.observation}</span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                      style={{ color: sev.color, backgroundColor: sev.bg, border: `1px solid ${sev.border}` }}
                    >
                      {concern.severity}
                    </span>
                  </button>

                  <div
                    className={cn(
                      'overflow-hidden transition-all duration-300',
                      isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0',
                    )}
                  >
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/[0.06]">
                      <p className="text-xs text-white/50 leading-relaxed">
                        <span className="font-medium text-white/60">Recommendation: </span>
                        {concern.recommendation}
                      </p>
                      {concern.target_section && (
                        <p className="text-[10px] text-white/30">
                          Section: {concern.target_section}
                        </p>
                      )}
                      {onApplyRecommendation && (
                        <button
                          type="button"
                          onClick={() => onApplyRecommendation(concern)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
                          style={{
                            color: sev.color,
                            backgroundColor: sev.bg,
                            border: `1px solid ${sev.border}`,
                          }}
                        >
                          <Wrench className="h-3 w-3" />
                          Apply Fix
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing elements */}
      {result.missing_elements.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-[#f0d99f] uppercase tracking-wider mb-2">
            What I Expected to See ({result.missing_elements.length})
          </h4>
          <div className="space-y-2">
            {result.missing_elements.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] px-3 py-2"
              >
                <p className="text-xs text-white/70 mb-0.5">{m.element}</p>
                <p className="text-[11px] text-white/40">{m.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
