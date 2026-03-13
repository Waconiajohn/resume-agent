import { Shield, Zap, Loader2, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import type { VerificationScores, QuickWin } from '@/types/resume-v2';
import type { LiveScores } from '@/hooks/useLiveScoring';

export interface KeywordScoreDashboardProps {
  pipelineScores: VerificationScores;
  liveScores: LiveScores | null;
  quickWins: QuickWin[];
  isScoring?: boolean;
  onIntegrateKeyword?: (keyword: string) => void;
  isIntegrating?: boolean;
  integratingKeyword?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#b5dec2';
  if (score >= 60) return '#f0d99f';
  return '#f0b8b8';
}

// ─── SVG ring gauge ────────────────────────────────────────────────────────────

function RingGauge({
  score,
  size = 80,
  strokeWidth = 6,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
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
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

// ─── Inline mini gauge (for Truth / Tone) ─────────────────────────────────────

function MiniGauge({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color }}>
        {score}%
      </span>
      <span className="text-xs text-white/40">{label}</span>
    </div>
  );
}

// ─── Impact dot ───────────────────────────────────────────────────────────────

function ImpactDot({ impact }: { impact: string }) {
  const color = impact === 'high' ? '#f0b8b8' : impact === 'medium' ? '#f0d99f' : 'rgba(255,255,255,0.30)';
  return (
    <div
      className="h-1.5 w-1.5 rounded-full shrink-0 mt-1.5"
      style={{ backgroundColor: color }}
    />
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
}: KeywordScoreDashboardProps) {
  // The displayed ATS score: prefer live (post-edit) score, fall back to pipeline score
  const displayAts = liveScores?.ats_score ?? pipelineScores.ats_match;
  const pipelineAts = pipelineScores.ats_match;
  const hasImproved = liveScores !== null && liveScores.ats_score !== pipelineAts;
  const delta = liveScores !== null ? liveScores.ats_score - pipelineAts : 0;

  const keywordsFound = liveScores?.keywords_found ?? [];
  const keywordsMissing = liveScores?.keywords_missing ?? [];

  return (
    <GlassCard className="p-5">
      {/* ── Row 1: Big gauge + score text ──────────────────────── */}
      <div className="flex items-center gap-5 mb-5">
        {/* Gauge with score overlaid */}
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <RingGauge score={displayAts} />
          <div className="absolute inset-0 flex items-center justify-center">
            {isScoring ? (
              <Loader2 className="h-4 w-4 text-white/30 motion-safe:animate-spin" />
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-3.5 w-3.5 text-[#afc4ff]" />
            <span className="text-sm font-semibold text-white/90">ATS Match Score</span>
            {isScoring && (
              <span className="text-[10px] text-white/30 italic">rescoring…</span>
            )}
          </div>

          {/* Before / after */}
          {hasImproved ? (
            <div className="flex items-center gap-1.5 text-xs text-white/50 mb-3">
              <span>Pipeline: {pipelineAts}%</span>
              <span className="text-white/25">→</span>
              <span style={{ color: scoreColor(liveScores?.ats_score ?? displayAts) }}>
                After edits: {liveScores?.ats_score ?? displayAts}%
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  color: delta > 0 ? '#b5dec2' : '#f0b8b8',
                  backgroundColor: delta > 0 ? 'rgba(181,222,194,0.12)' : 'rgba(240,184,184,0.12)',
                  border: `1px solid ${delta > 0 ? 'rgba(181,222,194,0.20)' : 'rgba(240,184,184,0.20)'}`,
                }}
              >
                {delta > 0 ? '+' : ''}{delta}
              </span>
            </div>
          ) : (
            <div className="text-xs text-white/40 mb-3">
              Pipeline score: {pipelineAts}%
            </div>
          )}

          {/* Truth + Tone mini gauges */}
          <div className="space-y-1.5">
            <MiniGauge label="Truth" score={pipelineScores.truth} color="#b5dec2" />
            <MiniGauge label="Tone" score={pipelineScores.tone} color="#f0d99f" />
          </div>
        </div>
      </div>

      {/* ── Row 2: Keyword columns (only when we have live data) ── */}
      {(keywordsFound.length > 0 || keywordsMissing.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-5 pt-4 border-t border-white/[0.06]">
          {/* Found */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-3 w-3 text-[#b5dec2]" />
              <span className="text-xs font-medium text-white/60">
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
            <div className="flex items-center gap-1.5 mb-2">
              <div className="h-3 w-3 rounded-full border border-[#f0b8b8]/50 shrink-0" />
              <span className="text-xs font-medium text-white/60">
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
                      backgroundColor: isActive ? 'rgba(240,184,184,0.25)' : 'rgba(240,184,184,0.10)',
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
              <div className="mt-1 text-[10px] text-white/25">Click a missing keyword to integrate it</div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 3: Quick Wins ──────────────────────────────────── */}
      {quickWins.length > 0 && (
        <div className="pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-[#f0d99f]" />
            <span className="text-xs font-medium text-white/60">Quick Wins</span>
          </div>
          <ul className="space-y-1.5">
            {quickWins.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <ImpactDot impact={w.impact} />
                <span className="text-white/60">{w.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
