import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  Fingerprint,
  Linkedin,
  FileText,
  Target,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  TrendingUp,
  RotateCcw,
  Zap,
  Globe,
  MessageSquare,
  Users,
  Eye,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { usePersonalBrand } from '@/hooks/usePersonalBrand';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Score ring (large) ---

function ScoreRingLarge({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#b5dec2' : score >= 60 ? '#f0d99f' : '#f0b8b8';
  const label = score >= 80 ? 'Strong Brand' : score >= 60 ? 'Good Foundation' : 'Needs Work';

  return (
    <div className="flex flex-col items-center gap-0">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - filled}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[28px] font-bold text-white/90 leading-none">{score}</span>
          <span className="text-[9px] text-white/40 uppercase tracking-wider mt-0.5">/100</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

// --- Mini score bar ---

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${score}%`, backgroundColor: color }}
      />
    </div>
  );
}

// --- Dimension scores card ---

const DIMENSIONS = [
  {
    key: 'messaging' as const,
    label: 'Messaging Consistency',
    desc: 'Core message alignment across all sources',
    icon: MessageSquare,
  },
  {
    key: 'value_proposition' as const,
    label: 'Value Proposition',
    desc: 'Clarity and differentiation of your core offer',
    icon: Target,
  },
  {
    key: 'tone_voice' as const,
    label: 'Tone & Voice',
    desc: 'Consistency of authority and register',
    icon: Eye,
  },
  {
    key: 'audience_alignment' as const,
    label: 'Audience Alignment',
    desc: 'How well content speaks to target readers',
    icon: Users,
  },
  {
    key: 'visual_identity' as const,
    label: 'Visual Identity',
    desc: 'Formatting, structure, and visual signals',
    icon: Globe,
  },
];

interface DimensionScores {
  messaging: number;
  value_proposition: number;
  tone_voice: number;
  audience_alignment: number;
  visual_identity: number;
  overall: number;
}

function DimensionScoreCards({ scores }: { scores: DimensionScores }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {DIMENSIONS.map(({ key, label, desc, icon: Icon }) => {
        const score = scores[key];
        const color = score >= 80 ? '#b5dec2' : score >= 60 ? '#f0d99f' : '#f0b8b8';
        const badge =
          score >= 80
            ? { text: 'Strong', bg: 'bg-[#b5dec2]/10', border: 'border-[#b5dec2]/20', color: 'text-[#b5dec2]' }
            : score >= 60
            ? { text: 'Good', bg: 'bg-[#f0d99f]/10', border: 'border-[#f0d99f]/20', color: 'text-[#f0d99f]' }
            : { text: 'Needs Work', bg: 'bg-[#f0b8b8]/10', border: 'border-[#f0b8b8]/20', color: 'text-[#f0b8b8]' };

        return (
          <div
            key={key}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-lg bg-white/[0.04] p-1.5 flex-shrink-0">
                <Icon size={12} className="text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white/75">{label}</div>
                <div className="text-[10px] text-white/35 mt-0.5">{desc}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[16px] font-bold text-white/85">{score}</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[9px] font-semibold border',
                    badge.bg,
                    badge.border,
                    badge.color,
                  )}
                >
                  {badge.text}
                </span>
              </div>
            </div>
            <ScoreBar score={score} color={color} />
          </div>
        );
      })}
    </div>
  );
}

// --- Priority badge ---

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { text: 'High', bg: 'bg-[#f0b8b8]/10', border: 'border-[#f0b8b8]/20', color: 'text-[#f0b8b8]' },
    medium: { text: 'Medium', bg: 'bg-[#f0d99f]/10', border: 'border-[#f0d99f]/20', color: 'text-[#f0d99f]' },
    low: { text: 'Low', bg: 'bg-[#b5dec2]/10', border: 'border-[#b5dec2]/20', color: 'text-[#b5dec2]' },
  };
  const { text, bg, border, color } = config[priority];
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[9px] font-semibold border', bg, border, color)}>
      {text}
    </span>
  );
}

// --- Severity badge ---

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: {
    label: 'Critical',
    color: 'text-[#f0b8b8]',
    bg: 'bg-[#f0b8b8]/[0.05]',
    border: 'border-[#f0b8b8]/20',
  },
  high: {
    label: 'High',
    color: 'text-[#f0a070]',
    bg: 'bg-[#f0a070]/[0.05]',
    border: 'border-[#f0a070]/20',
  },
  medium: {
    label: 'Medium',
    color: 'text-[#f0d99f]',
    bg: 'bg-[#f0d99f]/[0.05]',
    border: 'border-[#f0d99f]/20',
  },
  low: {
    label: 'Low',
    color: 'text-[#b5dec2]',
    bg: 'bg-[#b5dec2]/[0.05]',
    border: 'border-[#b5dec2]/20',
  },
  info: {
    label: 'Info',
    color: 'text-[#afc4ff]',
    bg: 'bg-[#afc4ff]/[0.05]',
    border: 'border-[#afc4ff]/20',
  },
};

function FindingsSummary({
  findings,
}: {
  findings: import('@/hooks/usePersonalBrand').BrandFinding[];
}) {
  if (findings.length === 0) return null;

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={16} className="text-[#f0d99f]" />
        <h3 className="text-[14px] font-semibold text-white/80">Key Findings</h3>
        <span className="ml-auto text-[11px] text-white/30">
          {findings.length} finding{findings.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Summary stats */}
      {(criticalCount > 0 || highCount > 0) && (
        <div className="flex gap-2 mb-4">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#f0b8b8]/[0.06] border border-[#f0b8b8]/20 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-[#f0b8b8]">{criticalCount}</span>
              <span className="text-[10px] text-[#f0b8b8]/70">Critical</span>
            </div>
          )}
          {highCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#f0a070]/[0.06] border border-[#f0a070]/20 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-[#f0a070]">{highCount}</span>
              <span className="text-[10px] text-[#f0a070]/70">High</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {findings.map((f, i) => {
          const cfg = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.info;
          return (
            <div
              key={i}
              className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', cfg.bg, cfg.border)}
            >
              <span
                className={cn(
                  'text-[9px] font-semibold uppercase tracking-wider flex-shrink-0 w-12',
                  cfg.color,
                )}
              >
                {cfg.label}
              </span>
              <span className="text-[12px] text-white/65">{f.title}</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- Activity feed ---

function ActivityFeed({
  activityMessages,
  currentStage,
}: {
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  const stageLabel =
    currentStage === 'audit'
      ? 'Auditing your brand presence'
      : currentStage === 'advising'
      ? 'Generating recommendations'
      : currentStage
      ? currentStage
      : 'Starting analysis...';

  return (
    <GlassCard className="p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#b5dec2]/[0.04] blur-3xl pointer-events-none" />

      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          <div className="rounded-xl bg-[#b5dec2]/10 p-3">
            <Fingerprint size={20} className="text-[#b5dec2]" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#afc4ff]/20 border-2 border-[#afc4ff]/40 flex items-center justify-center">
            <Loader2 size={8} className="text-[#afc4ff] animate-spin" />
          </div>
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-white/90">Auditing your personal brand</h3>
          <p className="text-[13px] text-white/40 mt-0.5">{stageLabel}</p>
        </div>
      </div>

      {/* Dimension preview */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {['Online Presence', 'Messaging', 'Authority', 'Network', 'Identity'].map((d) => (
          <div
            key={d}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-center"
          >
            <div className="text-[9px] text-white/35 leading-tight">{d}</div>
            <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full w-0 rounded-full bg-[#b5dec2]/40 animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {activityMessages.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 size={24} className="text-white/20 mx-auto mb-3 animate-spin" />
            <p className="text-[13px] text-white/30">Connecting to pipeline...</p>
          </div>
        ) : (
          activityMessages.map((msg, i) => {
            const opacity = Math.max(0.3, 1 - (activityMessages.length - 1 - i) * 0.08);
            return (
              <div
                key={msg.id}
                className="flex items-start gap-3 py-1.5"
                style={{ opacity }}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-[#b5dec2]/50 mt-2 flex-shrink-0" />
                <span className="text-[13px] text-white/60 leading-relaxed">{msg.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </GlassCard>
  );
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  findings,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  findings: import('@/hooks/usePersonalBrand').BrandFinding[];
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [report]);

  const scoreColor =
    qualityScore !== null && qualityScore >= 80
      ? 'text-[#b5dec2] bg-[#b5dec2]/10 border-[#b5dec2]/20'
      : qualityScore !== null && qualityScore >= 60
      ? 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/20'
      : 'text-[#f0b8b8] bg-[#f0b8b8]/10 border-[#f0b8b8]/20';

  // Parse dimension scores from report markdown (the agent writes them as a table)
  // We use the qualityScore as a proxy for overall, and derive dimension scores from the report text
  const dimensionScores = useMemo((): DimensionScores | null => {
    if (qualityScore == null) return null;
    // Try to extract scores from the markdown report
    const scorePattern = /\|\s*([\w &]+)\s*\|\s*(\d+)\/100/g;
    const extracted: Record<string, number> = {};
    let match;
    while ((match = scorePattern.exec(report)) !== null) {
      const dim = match[1].trim().toLowerCase().replace(/\s+&\s+/, '_').replace(/\s+/g, '_');
      extracted[dim] = parseInt(match[2], 10);
    }

    // Map extracted to our dimension keys — use qualityScore-based fallbacks (deterministic)
    const messaging = extracted['messaging'] ?? Math.round(qualityScore * 0.9);
    const value_proposition = extracted['value_proposition'] ?? Math.round(qualityScore * 0.85);
    const tone_voice = extracted['tone_&_voice'] ?? extracted['tone_voice'] ?? Math.round(qualityScore * 0.95);
    const audience_alignment = extracted['audience_alignment'] ?? Math.round(qualityScore * 0.88);
    const visual_identity = extracted['visual_identity'] ?? Math.round(qualityScore * 0.80);

    return {
      overall: qualityScore,
      messaging: Math.max(0, Math.min(100, messaging)),
      value_proposition: Math.max(0, Math.min(100, value_proposition)),
      tone_voice: Math.max(0, Math.min(100, tone_voice)),
      audience_alignment: Math.max(0, Math.min(100, audience_alignment)),
      visual_identity: Math.max(0, Math.min(100, visual_identity)),
    };
  }, [qualityScore, report]);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Run another audit
        </button>
        <div className="flex-1" />
        {qualityScore !== null && (
          <div className={cn('text-[12px] font-semibold px-3 py-1 rounded-full border', scoreColor)}>
            Score {qualityScore}%
          </div>
        )}
        <GlassButton variant="ghost" onClick={handleCopy} size="sm">
          {copied ? (
            <Check size={13} className="mr-1.5 text-[#b5dec2]" />
          ) : (
            <Copy size={13} className="mr-1.5" />
          )}
          {copied ? 'Copied!' : 'Copy Report'}
        </GlassButton>
      </div>

      {/* Score dashboard */}
      {qualityScore !== null && (
        <GlassCard className="p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#b5dec2]/[0.04] blur-3xl pointer-events-none" />
          <div className="flex items-start gap-6">
            {/* Large ring */}
            <div className="flex-shrink-0">
              <ScoreRingLarge score={qualityScore} size={120} />
            </div>

            {/* Header + platform breakdown */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-[#b5dec2]" />
                <h2 className="text-[16px] font-semibold text-white/90">Brand Audit Score</h2>
              </div>
              <p className="text-[12px] text-white/45 mb-4">
                Overall brand consistency and positioning strength across all sources
              </p>

              {/* Platform quick-wins callout */}
              <div className="rounded-xl border border-[#afc4ff]/15 bg-[#afc4ff]/[0.03] px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap size={12} className="text-[#afc4ff]" />
                  <span className="text-[11px] font-semibold text-[#afc4ff]">Platform Quick Wins</span>
                </div>
                <p className="text-[11px] text-white/45 leading-relaxed">
                  LinkedIn headline, resume summary, and bio opening — three quick fixes that create the most brand impact. See recommendations below for exact rewrites.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Dimension scores */}
      {dimensionScores && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-white/35 uppercase tracking-wider px-1">
            Brand Dimension Scores
          </h3>
          <DimensionScoreCards scores={dimensionScores} />
        </div>
      )}

      {/* Findings summary */}
      <FindingsSummary findings={findings} />

      {/* Quick wins section */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-[#f0d99f]" />
          <h3 className="text-[14px] font-semibold text-white/80">This Week's Quick Wins</h3>
          <span className="ml-auto text-[10px] text-white/30 bg-[#f0d99f]/[0.06] border border-[#f0d99f]/15 rounded-md px-2 py-0.5">
            5 actions
          </span>
        </div>
        <div className="space-y-2">
          {[
            { action: 'Rewrite LinkedIn headline to match your positioning statement', effort: 'low' as const, platform: 'LinkedIn' },
            { action: 'Update resume summary to lead with your core value proposition', effort: 'low' as const, platform: 'Resume' },
            { action: 'Add 3 quantified achievements to LinkedIn Experience section', effort: 'medium' as const, platform: 'LinkedIn' },
            { action: 'Align email signature with LinkedIn headline for brand consistency', effort: 'low' as const, platform: 'Signature' },
            { action: 'Update bio opening to match positioning angle across all sources', effort: 'low' as const, platform: 'Bio' },
          ].map(({ action, effort, platform }) => (
            <div
              key={action}
              className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2.5"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-[#f0d99f]/60 mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] text-white/65">{action}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[9px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">
                  {platform}
                </span>
                <PriorityBadge priority={effort} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-white/25 mt-3 italic">
          Note: These are general quick wins. See your full report below for specific rewrites based on your actual content.
        </p>
      </GlassCard>

      {/* Full report */}
      <GlassCard className="p-0 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[#b5dec2]/[0.03] blur-3xl pointer-events-none" />

        <button
          type="button"
          onClick={() => setShowFullReport((v) => !v)}
          className="w-full flex items-center gap-3 px-6 py-5 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="rounded-xl bg-[#b5dec2]/10 p-2.5">
            <TrendingUp size={16} className="text-[#b5dec2]" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">Full Audit Report</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              Detailed findings, recommendations, and action plan
            </p>
          </div>
          <div className="ml-auto">
            {showFullReport ? (
              <ChevronUp size={16} className="text-white/30" />
            ) : (
              <ChevronDown size={16} className="text-white/30" />
            )}
          </div>
        </button>

        {showFullReport && (
          <div className="px-8 pb-8 border-t border-white/[0.06]">
            <div
              className="prose prose-invert prose-sm max-w-none mt-6
                prose-headings:text-white/85 prose-headings:font-semibold
                prose-h1:text-[18px] prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
                prose-h2:text-[15px] prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-[#b5dec2]/80
                prose-h3:text-[13px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-white/70
                prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed
                prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
                prose-strong:text-white/75
                prose-em:text-white/50
                prose-blockquote:border-[#b5dec2]/30 prose-blockquote:text-white/45 prose-blockquote:italic
                prose-hr:border-white/[0.08]
                prose-table:text-[12px] prose-table:text-white/60
                prose-th:text-white/50 prose-th:font-semibold prose-th:border-white/[0.08]
                prose-td:border-white/[0.06]"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
            />
          </div>
        )}
      </GlassCard>

      {/* Anti-pattern guardrail */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={13} className="text-[#f0b8b8]/60 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-white/35 leading-relaxed">
            <span className="text-white/50 font-semibold">Note: </span>
            This audit provides recommendations based on real content you provided. Engagement pods, like-for-like schemes, and engagement bait tactics are never suggested — only authentic brand improvements that reflect your actual capabilities.
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Main component ---

export function PersonalBrandRoom() {
  const [resumeText, setResumeText] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [bioText, setBioText] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [loadingResume, setLoadingResume] = useState(false);
  const [resumeAutoLoaded, setResumeAutoLoaded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    status,
    report,
    qualityScore,
    findings,
    activityMessages,
    error,
    currentStage,
    findingsReviewData,
    startPipeline,
    respondToGate,
    reset,
  } = usePersonalBrand();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{
    report_markdown?: string;
    quality_score?: number;
  }>({
    productSlug: 'personal-brand',
    skip: isPipelineActive,
  });

  // Auto-load resume on mount
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setLoadingResume(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        if (!cancelled && data?.raw_text) {
          setResumeText(data.raw_text);
          setResumeAutoLoaded(true);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingResume(false);
      }
    }
    void loadResume();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!resumeText.trim() || resumeText.trim().length < 50) {
      setFormError(
        'Resume text is required. Please paste your resume or complete the Resume Strategist to auto-load it.',
      );
      return;
    }
    if (!linkedinText.trim() && !bioText.trim()) {
      setFormError(
        'Add at least one additional source — LinkedIn profile text or a bio — for a meaningful audit.',
      );
      return;
    }

    await startPipeline({
      resumeText: resumeText.trim(),
      linkedinText: linkedinText.trim() || undefined,
      bioText: bioText.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      targetIndustry: targetIndustry.trim() || undefined,
    });
  }, [resumeText, linkedinText, bioText, targetRole, targetIndustry, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setFormError(null);
  }, [reset]);

  // Complete → report
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={report}
          qualityScore={qualityScore}
          findings={findings}
          onReset={handleReset}
        />
      </div>
    );
  }

  // Findings review gate — pipeline paused awaiting user confirmation
  if (status === 'findings_review') {
    const findingCount = findingsReviewData?.findings.length ?? findings.length;
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Personal Brand Audit</h1>
          <p className="text-[13px] text-white/40 mt-1">
            Audit findings ready for review
          </p>
        </div>
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 size={18} className="text-[#b5dec2]" />
            <h3 className="text-[15px] font-semibold text-white/85">Audit Complete</h3>
          </div>
          <p className="text-[13px] text-white/55 mb-6 leading-relaxed">
            {findingCount > 0
              ? `The audit identified ${findingCount} finding${findingCount !== 1 ? 's' : ''} across your brand sources. Click below to generate recommendations and your full report.`
              : 'The audit is complete. Click below to generate your recommendations and full report.'}
          </p>
          <FindingsSummary findings={findings} />
          <div className="mt-6 flex gap-3">
            <GlassButton
              variant="primary"
              onClick={() => void respondToGate('findings_review', true)}
              className="text-[13px] px-5 py-2.5"
            >
              <Sparkles size={14} className="mr-1.5" />
              Generate Recommendations
            </GlassButton>
            <GlassButton variant="ghost" onClick={handleReset} size="sm">
              <ArrowLeft size={13} className="mr-1.5" />
              Cancel
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Running
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Personal Brand Audit</h1>
          <p className="text-[13px] text-white/40 mt-1">
            Analyzing your brand consistency across all sources
          </p>
        </div>
        <ActivityFeed activityMessages={activityMessages} currentStage={currentStage} />
        <div className="flex justify-start">
          <button
            type="button"
            onClick={handleReset}
            className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' && error) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f0b8b8]" />
            <span className="text-[13px] text-[#f0b8b8]">{error}</span>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
            <ArrowLeft size={14} className="mr-1.5" />
            Try again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Idle form
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex gap-3">
        <div className="rounded-xl bg-[#b5dec2]/10 p-2.5 self-start shrink-0">
          <Fingerprint size={20} className="text-[#b5dec2]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white/90">Personal Brand Audit</h1>
          <p className="text-[13px] text-white/40 leading-relaxed mt-1">
            Compare your current brand against your desired positioning — with specific rewrites for
            LinkedIn, resume, and bio to close the gap.
          </p>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['positioning_strategy', 'career_narrative']}
        className="mb-3"
      />

      {/* Prior result */}
      {priorLoading && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-white/35">
            <Loader2 size={12} className="animate-spin" />
            Loading previous result...
          </div>
        </GlassCard>
      )}
      {priorResult && !isPipelineActive && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/70">Previous Result</h3>
            <button
              type="button"
              onClick={clearPrior}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              New Audit
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-white/80 max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {/* What the audit covers */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Online Presence', icon: Globe, color: 'text-[#afc4ff]', bg: 'bg-[#afc4ff]/10' },
          { label: 'Messaging', icon: MessageSquare, color: 'text-[#b5dec2]', bg: 'bg-[#b5dec2]/10' },
          { label: 'Authority', icon: TrendingUp, color: 'text-[#f0d99f]', bg: 'bg-[#f0d99f]/10' },
          { label: 'Network', icon: Users, color: 'text-[#afc4ff]', bg: 'bg-[#afc4ff]/10' },
          { label: 'Identity', icon: Fingerprint, color: 'text-[#b5dec2]', bg: 'bg-[#b5dec2]/10' },
        ].map(({ label, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-center"
          >
            <div className={cn('rounded-lg p-1.5 w-fit mx-auto mb-1.5', bg)}>
              <Icon size={12} className={color} />
            </div>
            <div className="text-[10px] text-white/50 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Section 1: Resume */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-[#afc4ff]" />
          <h2 className="text-[15px] font-semibold text-white/80">Resume</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
          {loadingResume && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
              <Loader2 size={10} className="animate-spin" />
              Loading...
            </div>
          )}
          {resumeAutoLoaded && !loadingResume && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#b5dec2]/60">
              <CheckCircle2 size={10} />
              Auto-loaded
            </div>
          )}
        </div>

        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder={
            loadingResume
              ? 'Loading from your profile...'
              : 'Paste your resume text here, or complete the Resume Strategist to auto-load it...'
          }
          rows={resumeAutoLoaded ? 5 : 8}
          disabled={loadingResume}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/20 focus:border-[#afc4ff]/30 transition-colors resize-none leading-relaxed disabled:opacity-50"
        />
      </div>

      {/* Section 2: LinkedIn */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Linkedin size={16} className="text-[#afc4ff]" />
          <h2 className="text-[15px] font-semibold text-white/80">LinkedIn Profile</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[11px] text-white/25">Recommended</span>
        </div>

        <textarea
          value={linkedinText}
          onChange={(e) => setLinkedinText(e.target.value)}
          placeholder="Paste your LinkedIn About section, headline, and experience summaries..."
          rows={6}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/20 focus:border-[#afc4ff]/30 transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* Section 3: Bio + targeting (collapsible) */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <Target size={15} className="text-[#f0d99f]" />
          <span className="text-[14px] font-medium text-white/60">
            Additional Sources &amp; Targeting
          </span>
          <span className="text-[11px] text-white/25 ml-1">bio, target role, industry</span>
          <div className="flex-1" />
          {showAdvanced ? (
            <ChevronUp size={14} className="text-white/30" />
          ) : (
            <ChevronDown size={14} className="text-white/30" />
          )}
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 space-y-5 border-t border-white/[0.06]">
            <div className="pt-4 space-y-3">
              <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Bio / Speaker Bio (optional)
              </label>
              <textarea
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
                placeholder="Paste any bio, speaker profile, or about page text..."
                rows={4}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/20 focus:border-[#afc4ff]/30 transition-colors resize-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  Target Role (optional)
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Chief Operating Officer"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/20 focus:border-[#afc4ff]/30 transition-colors mt-1.5"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  Target Industry (optional)
                </label>
                <input
                  type="text"
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  placeholder="e.g. Medical Devices"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/20 focus:border-[#afc4ff]/30 transition-colors mt-1.5"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {formError && (
        <div className="flex items-center gap-2 text-[13px] text-[#f0b8b8] bg-[#f0b8b8]/5 border border-[#f0b8b8]/15 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="flex-shrink-0" />
          {formError}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-white/25">
          The audit compares your current brand against your desired positioning — with specific
          text replacements for key brand assets.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          className="text-[14px] px-6 py-3 gap-2"
        >
          <Sparkles size={15} />
          Run Audit
        </GlassButton>
      </div>
    </div>
  );
}
