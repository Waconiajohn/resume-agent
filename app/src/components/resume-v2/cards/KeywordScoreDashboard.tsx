import { Shield, Zap, ArrowUp, CheckCircle2, Wrench } from 'lucide-react';
import type { VerificationScores, QuickWin } from '@/types/resume-v2';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { scoreColor, MiniRingGauge, ImpactDot } from './score-gauges';
import { cn } from '@/lib/utils';

export interface KeywordScoreDashboardProps {
  pipelineScores: VerificationScores;
  liveScores: LiveScores | null;
  quickWins: QuickWin[];
  isScoring?: boolean;
  onIntegrateKeyword?: (keyword: string) => void;
  isIntegrating?: boolean;
  integratingKeyword?: string | null;
  onQuickWinAction?: (description: string, impact: string) => void;
  /** Baseline keyword data from pre-scoring (shown when liveScores not yet available) */
  preScoreKeywords?: { ats_match: number; keywords_found: string[]; keywords_missing: string[] } | null;
}

// ─── Quick win action detection ────────────────────────────────────────────────

function hasActionablePrefix(description: string): boolean {
  return (
    description.startsWith('Fix:') ||
    description.startsWith('Add missing keywords:') ||
    description.startsWith('Remove banned phrases:')
  );
}

const impactButtonStyle: Record<QuickWin['impact'], React.CSSProperties> = {
  high: {
    color: '#f0b8b8',
    backgroundColor: 'rgba(240,184,184,0.12)',
    border: '1px solid rgba(240,184,184,0.30)',
  },
  medium: {
    color: '#f0d99f',
    backgroundColor: 'rgba(240,217,159,0.12)',
    border: '1px solid rgba(240,217,159,0.30)',
  },
  low: {
    color: '#afc4ff',
    backgroundColor: 'rgba(175,196,255,0.12)',
    border: '1px solid rgba(175,196,255,0.30)',
  },
};

// ─── SVG ring gauge ────────────────────────────────────────────────────────────

function RingGauge({
  score,
  size = 80,
  strokeWidth = 6,
  isPulsing = false,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  isPulsing?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  const cx = size / 2;
  const cy = size / 2;
  const isHigh = score >= 80;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)' }}
      className={isPulsing ? 'animate-score-ring-pulse' : undefined}
      aria-hidden="true"
    >
      {/* Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{
          transition: 'stroke-dashoffset 1s ease-out',
          filter: isHigh ? `drop-shadow(0 0 6px ${color})` : undefined,
        }}
      />
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function KeywordScoreDashboard({
  pipelineScores,
  liveScores,
  quickWins,
  isScoring = false,
  onIntegrateKeyword,
  isIntegrating = false,
  integratingKeyword = null,
  onQuickWinAction,
  preScoreKeywords,
}: KeywordScoreDashboardProps) {
  // The displayed ATS score: prefer live (post-edit) score, fall back to pipeline score
  const displayAts = liveScores?.ats_score ?? pipelineScores.ats_match;
  const pipelineAts = pipelineScores.ats_match;
  const beforeAts = preScoreKeywords?.ats_match ?? null;
  const hasImproved = liveScores !== null && liveScores.ats_score !== pipelineAts;
  const hasBeforeScore = beforeAts !== null && beforeAts !== pipelineAts;
  const pipelineDelta = hasBeforeScore ? pipelineAts - beforeAts! : 0;
  const delta = liveScores !== null ? liveScores.ats_score - pipelineAts : 0;

  // Keywords: prefer live scores, fall back to pre-score baseline
  const keywordsFound = liveScores?.keywords_found ?? preScoreKeywords?.keywords_found ?? [];
  const keywordsMissing = liveScores?.keywords_missing ?? preScoreKeywords?.keywords_missing ?? [];
  const topSuggestions = liveScores?.top_suggestions ?? [];

  // Show top suggestions when there are no missing keywords but we still have suggestions
  const showTopSuggestions = keywordsMissing.length === 0 && topSuggestions.length > 0;

  return (
    <div className="room-shell px-5 py-5">
      <div className="room-meta-strip mb-5">
        <div className="room-meta-item">
          <span className="eyebrow-label">Keyword and ATS Review</span>
          <span className="text-sm text-white/60">Track match quality, missing terms, and the fastest fixes.</span>
        </div>
      </div>

      {/* ── Row 1: Big gauge + score text ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-5">
        {/* Gauge with score overlaid */}
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <RingGauge score={displayAts} isPulsing={isScoring} />
          <div className="absolute inset-0 flex items-center justify-center">
            {isScoring ? (
              /* Pulsing ellipsis while scoring — ring itself is already pulsing */
              <span className="text-[10px] text-white/30 animate-pulse">…</span>
            ) : (
              <span
                className="text-lg font-bold tabular-nums"
                style={{ color: scoreColor(displayAts) }}
              >
                {displayAts}
              </span>
            )}
          </div>
        </div>

        {/* Score labels */}
        <div className="flex-1 min-w-0 w-full">
          <div className="mb-1 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-[#afc4ff]" />
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-white/74">ATS Match Score</span>
            {isScoring && (
              <span className="text-[10px] text-white/30 italic">rescoring…</span>
            )}
          </div>

          {/* Before → After score context */}
          {hasImproved ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/50 mb-3">
              <span>Pipeline: {pipelineAts}%</span>
              <span className="text-white/25">→</span>
              <span style={{ color: scoreColor(liveScores?.ats_score ?? displayAts) }}>
                After edits: {liveScores?.ats_score ?? displayAts}%
              </span>
              <span
                className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-semibold"
                style={{
                  color: delta > 0 ? '#b5dec2' : '#f0b8b8',
                  backgroundColor:
                    delta > 0 ? 'rgba(181,222,194,0.14)' : 'rgba(240,184,184,0.14)',
                  border: `1px solid ${delta > 0 ? 'rgba(181,222,194,0.25)' : 'rgba(240,184,184,0.25)'}`,
                }}
              >
                {delta > 0 && (
                  <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {delta > 0 ? '+' : ''}
                {delta}
              </span>
            </div>
          ) : hasBeforeScore ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/50 mb-3">
              <span>Your starting point: {beforeAts}%</span>
              <span className="text-white/25">→</span>
              <span style={{ color: scoreColor(pipelineAts) }}>
                After optimization: {pipelineAts}%
              </span>
              <span
                className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-semibold"
                style={{
                  color: pipelineDelta > 0 ? '#b5dec2' : '#f0b8b8',
                  backgroundColor:
                    pipelineDelta > 0 ? 'rgba(181,222,194,0.14)' : 'rgba(240,184,184,0.14)',
                  border: `1px solid ${pipelineDelta > 0 ? 'rgba(181,222,194,0.25)' : 'rgba(240,184,184,0.25)'}`,
                }}
              >
                {pipelineDelta > 0 && (
                  <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {pipelineDelta > 0 ? '+' : ''}
                {pipelineDelta}
              </span>
            </div>
          ) : (
            <div className="text-xs text-white/40 mb-3">Pipeline score: {pipelineAts}%</div>
          )}

          {/* Truth + Tone mini ring gauges */}
          <div className="support-callout flex items-center gap-4 px-4 py-3">
            <MiniRingGauge label="Truth" score={pipelineScores.truth} color="#b5dec2" />
            <MiniRingGauge label="Tone" score={pipelineScores.tone} color="#f0d99f" />
          </div>
        </div>
      </div>

      {/* ── Row 2: Keyword columns (only when we have live data) ──────────────── */}
      {(keywordsFound.length > 0 || keywordsMissing.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-5 pt-4 border-t border-white/[0.06]">
          {/* Found */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-[#b5dec2]" />
              <span className="eyebrow-label">
                Found ({keywordsFound.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {keywordsFound.map((kw, i) => (
                <span
                  key={i}
                  className="rounded-md px-1.5 py-0.5 text-[10px] leading-4"
                  style={{
                    color: '#b5dec2',
                    backgroundColor: 'rgba(181,222,194,0.10)',
                    border: '1px solid rgba(181,222,194,0.20)',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Missing */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <div className="h-3 w-3 shrink-0 border border-[#f0b8b8]/50 bg-[#f0b8b8]/10" />
              <span className="eyebrow-label">
                Missing ({keywordsMissing.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {keywordsMissing.map((kw, i) => {
                const isActive = integratingKeyword === kw;
                return onIntegrateKeyword ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onIntegrateKeyword(kw)}
                    disabled={isIntegrating}
                    className="rounded-md px-1.5 py-0.5 text-[10px] leading-4 transition-colors hover:bg-[rgba(240,184,184,0.20)] disabled:opacity-50 cursor-pointer"
                    style={{
                      color: '#f0b8b8',
                      backgroundColor: isActive
                        ? 'rgba(240,184,184,0.25)'
                        : 'rgba(240,184,184,0.10)',
                      border: `1px solid ${isActive ? 'rgba(240,184,184,0.40)' : 'rgba(240,184,184,0.20)'}`,
                    }}
                    title={`Click to integrate "${kw}" into your resume`}
                  >
                    {isActive && isIntegrating ? '...' : kw}
                  </button>
                ) : (
                  <span
                    key={i}
                    className="rounded-md px-1.5 py-0.5 text-[10px] leading-4"
                    style={{
                      color: '#f0b8b8',
                      backgroundColor: 'rgba(240,184,184,0.10)',
                      border: '1px solid rgba(240,184,184,0.20)',
                    }}
                  >
                    {kw}
                  </span>
                );
              })}
            </div>
            {onIntegrateKeyword && keywordsMissing.length > 0 && (
              <div className="mt-1 text-[10px] text-white/25">
                Click a missing keyword to integrate it
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 2b: Top suggestions (shown when no missing keywords) ─────────── */}
      {showTopSuggestions && (
        <div className="mb-5 pt-4 border-t border-white/[0.06]">
          <div className="mb-2 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-[#afc4ff]" />
            <span className="eyebrow-label">
              Top Suggestions
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {topSuggestions.map((kw, i) => {
              const isActive = integratingKeyword === kw;
              return onIntegrateKeyword ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onIntegrateKeyword(kw)}
                  disabled={isIntegrating}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] leading-4 transition-colors hover:bg-[rgba(175,196,255,0.20)] disabled:opacity-50 cursor-pointer"
                  style={{
                    color: '#afc4ff',
                    backgroundColor: isActive
                      ? 'rgba(175,196,255,0.20)'
                      : 'rgba(175,196,255,0.08)',
                    border: `1px solid ${isActive ? 'rgba(175,196,255,0.35)' : 'rgba(175,196,255,0.18)'}`,
                  }}
                  title={`Click to integrate "${kw}" into your resume`}
                >
                  {isActive && isIntegrating ? '...' : kw}
                  {!(isActive && isIntegrating) && (
                    <span className="opacity-60 font-medium">+ Integrate</span>
                  )}
                </button>
              ) : (
                <span
                  key={i}
                  className="rounded-md px-1.5 py-0.5 text-[10px] leading-4"
                  style={{
                    color: '#afc4ff',
                    backgroundColor: 'rgba(175,196,255,0.08)',
                    border: '1px solid rgba(175,196,255,0.18)',
                  }}
                >
                  {kw}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Row 3: Quick Wins ─────────────────────────────────────────────────── */}
      {quickWins.length > 0 && (
        <div className="pt-4 border-t border-white/[0.06]">
          <div className="mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[#f0d99f]" />
            <span className="eyebrow-label">Quick Wins</span>
          </div>
          <ul className="space-y-1.5">
            {quickWins.map((w, i) => {
              const isActionable = onQuickWinAction && hasActionablePrefix(w.description);
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <ImpactDot impact={w.impact} />
                  <span className={cn('flex-1 text-white/60', isActionable && 'mr-1')}>
                    {w.description}
                  </span>
                  {isActionable && (
                    <button
                      type="button"
                      onClick={() => onQuickWinAction!(w.description, w.impact)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] leading-4 transition-opacity hover:opacity-80 cursor-pointer"
                      style={impactButtonStyle[w.impact]}
                      title="Apply this fix to your resume"
                    >
                      <Wrench className="h-2.5 w-2.5" aria-hidden="true" />
                      Fix Now
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
