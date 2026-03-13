import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  DollarSign,
  TrendingUp,
  Briefcase,
  Loader2,
  AlertCircle,
  ArrowLeft,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  Target,
  Shield,
  Swords,
  Zap,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSalaryNegotiation } from '@/hooks/useSalaryNegotiation';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';
import { CounterOfferView } from '@/components/career-iq/CounterOfferView';

// --- Stage label map ---

const STAGE_LABELS: Record<string, string> = {
  research: 'Researching market rates',
  strategy: 'Building strategy',
};

// --- Confidence gauge (SVG ring) ---

function ConfidenceGauge({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (score / 100);
  const cx = size / 2;
  const cy = size / 2;

  const color = score >= 70 ? '#b5dec2' : score >= 45 ? '#f0d99f' : '#f0b8b8';
  const strengthLabel = score >= 70 ? 'Strong' : score >= 45 ? 'Moderate' : 'Weak';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={4}
          />
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - filled}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[14px] font-bold leading-none" style={{ color }}>{score}</span>
          <span className="text-[9px] text-white/30 mt-0.5">%</span>
        </div>
      </div>
      {label && <span className="text-[10px] text-white/40">{label}</span>}
      <span className="text-[10px] font-medium" style={{ color }}>{strengthLabel}</span>
    </div>
  );
}

// --- Salary range bar visualization ---

function SalaryRangeBar({
  min,
  mid,
  max,
  current,
  offer,
  label = 'Market Range',
}: {
  min: number;
  mid: number;
  max: number;
  current?: number;
  offer?: number;
  label?: string;
}) {
  const formatK = (n: number) => {
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${n}`;
  };

  const positionPct = (val: number) => {
    // Guard against division by zero when min === max (e.g. single data point)
    const range = max - min;
    const pct = range > 0 ? ((val - min) / range) * 100 : 50;
    return Math.max(2, Math.min(98, pct));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#afc4ff]/60" />
            <span className="text-[10px] text-white/30">Market P50</span>
          </div>
          {offer !== undefined && (
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f0d99f]/60" />
              <span className="text-[10px] text-white/30">Your offer</span>
            </div>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-6">
        {/* Background range */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-2 rounded-full bg-white/[0.04]" />
        </div>
        {/* Colored range fill (min to max) */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f0b8b8]/20 via-[#afc4ff]/25 to-[#b5dec2]/30"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* P50 marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-0.5 rounded-full bg-[#afc4ff]/50"
          style={{ left: `${positionPct(mid)}%` }}
        />

        {/* Offer marker */}
        {offer !== undefined && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-1 rounded-full bg-[#f0d99f]"
            style={{ left: `${positionPct(offer)}%` }}
            title={`Your offer: ${formatK(offer)}`}
          />
        )}

        {/* Current comp marker */}
        {current !== undefined && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-0.5 rounded-full bg-[#b5dec2]/50"
            style={{ left: `${positionPct(current)}%` }}
            title={`Current: ${formatK(current)}`}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30">{formatK(min)}</span>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-medium text-[#afc4ff]/70">{formatK(mid)}</span>
          <span className="text-[9px] text-white/20">P50</span>
        </div>
        <span className="text-[10px] text-white/30">{formatK(max)}</span>
      </div>

      {/* Position commentary */}
      {offer !== undefined && (
        <div className={cn(
          'rounded-lg px-3 py-2 text-[11px] border',
          offer >= mid
            ? 'bg-[#b5dec2]/[0.04] border-[#b5dec2]/15 text-[#b5dec2]/80'
            : offer >= min
            ? 'bg-[#f0d99f]/[0.04] border-[#f0d99f]/15 text-[#f0d99f]/80'
            : 'bg-[#f0b8b8]/[0.04] border-[#f0b8b8]/15 text-[#f0b8b8]/80',
        )}>
          {offer >= mid
            ? `Your offer (${formatK(offer)}) is at or above market median — strong starting position.`
            : offer >= min
            ? `Your offer (${formatK(offer)}) is below market median (${formatK(mid)}) — clear room to negotiate upward.`
            : `Your offer (${formatK(offer)}) is below the 25th percentile — significant upward leverage available.`
          }
        </div>
      )}
    </div>
  );
}

// --- Strategy lever card ---

interface LeverCard {
  lever: string;
  icon: React.ReactNode;
  current: string;
  target: string;
  flexibility: 'high' | 'medium' | 'low';
  tip: string;
}

function LeverCardDisplay({ card }: { card: LeverCard }) {
  const flexConfig = {
    high: { label: 'High flexibility', color: 'text-[#b5dec2]', dot: 'bg-[#b5dec2]' },
    medium: { label: 'Moderate flexibility', color: 'text-[#f0d99f]', dot: 'bg-[#f0d99f]' },
    low: { label: 'Low flexibility', color: 'text-[#f0b8b8]', dot: 'bg-[#f0b8b8]' },
  }[card.flexibility];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-white/40">{card.icon}</span>
        <span className="text-[13px] font-semibold text-white/75">{card.lever}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', flexConfig.dot)} />
          <span className={cn('text-[10px] font-medium', flexConfig.color)}>{flexConfig.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] text-white/30 block mb-0.5">Current</span>
          <span className="text-[12px] text-white/55">{card.current}</span>
        </div>
        <div>
          <span className="text-[10px] text-white/30 block mb-0.5">Target</span>
          <span className="text-[12px] text-white/70 font-medium">{card.target}</span>
        </div>
      </div>
      <p className="text-[11px] text-white/35 leading-relaxed border-t border-white/[0.04] pt-2">{card.tip}</p>
    </div>
  );
}

// --- Talking point with copy ---

function TalkingPointItem({ point, index }: { point: string; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(point);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [point]);

  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-[#afc4ff]/20 transition-all">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 h-5 w-5 rounded-full border border-[#afc4ff]/25 bg-[#afc4ff]/[0.08] flex items-center justify-center text-[10px] font-bold text-[#afc4ff]/70 mt-0.5">
          {index + 1}
        </span>
        <p className="flex-1 text-[13px] text-white/65 leading-relaxed italic">{point}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/[0.06]"
          title="Copy to clipboard"
        >
          {copied
            ? <Check size={13} className="text-[#b5dec2]" />
            : <Copy size={13} className="text-white/30" />
          }
        </button>
      </div>
    </div>
  );
}

// --- Red lines section ---

const RED_LINES = [
  "Never mention a competing offer you don't actually have",
  "Don't volunteer your current salary — it anchors downward",
  "Avoid saying \"I need\" or \"I deserve\" — reframe as value demonstration",
  "Never accept verbally and then continue negotiating",
  "Don't make ultimatums — \"give me X or I walk\" destroys goodwill",
  "Avoid round numbers without data to support them",
  "Never negotiate against yourself by preemptively conceding",
];

function RedLinesSection() {
  return (
    <GlassCard className="p-5 border-[#f0b8b8]/10">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={15} className="text-[#f0b8b8]/70" />
        <h3 className="text-[14px] font-semibold text-white/75">Red Lines — What NOT to Say</h3>
      </div>
      <div className="space-y-2">
        {RED_LINES.map((line, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#f0b8b8]/[0.03] border border-[#f0b8b8]/[0.08]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f0b8b8]/50 mt-1.5 flex-shrink-0" />
            <span className="text-[12px] text-[#f0b8b8]/70 leading-relaxed">{line}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- Counter-offer scenario card ---

interface ScenarioCard {
  scenario: string;
  employer_says: string;
  recommended_response: string;
}

const COUNTER_SCENARIOS: ScenarioCard[] = [
  {
    scenario: 'Budget constraint',
    employer_says: `"We'd love to match what you're asking, but the budget band for this role doesn't allow it."`,
    recommended_response: `"I understand the band constraint. Could we explore making it work through a first-year bonus guarantee, an accelerated equity vest, or an earlier performance review? I want to find a path that works for both of us."`,
  },
  {
    scenario: 'Already at the top of the band',
    employer_says: `"Your ask is actually above the top of our band for this role."`,
    recommended_response: `"I appreciate the transparency. Given the scope of what you've described — particularly [specific element] — I'd welcome a conversation about whether there's flexibility in the title, reporting structure, or total package. I want to make this work."`,
  },
  {
    scenario: 'Asking about your current comp',
    employer_says: `"Can you share what you're currently making?"`,
    recommended_response: `"I'd prefer to focus on what this role requires and what the market supports for this level. I'm confident we can find a number that works — what's the range you had in mind for this position?"`,
  },
];

function CounterScenarioCards() {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {COUNTER_SCENARIOS.map((sc, i) => {
        const isExpanded = expandedIdx === i;
        return (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <MessageSquare size={14} className="text-[#afc4ff]/50 flex-shrink-0" />
              <span className="flex-1 text-[13px] font-medium text-white/70">{sc.scenario}</span>
              {isExpanded
                ? <ChevronRight size={13} className="text-white/25 rotate-90" />
                : <ChevronRight size={13} className="text-white/25" />
              }
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04]">
                <div className="mt-3">
                  <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">They say</span>
                  <p className="mt-1 text-[12px] text-white/45 leading-relaxed italic">{sc.employer_says}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-[#afc4ff]/50 uppercase tracking-wider">You say</span>
                  <p className="mt-1 text-[13px] text-white/70 leading-relaxed">{sc.recommended_response}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Activity feed ---

function ActivityFeed({
  messages,
  currentStage,
}: {
  messages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {messages.length === 0 ? (
        <div className="text-center py-8">
          <Loader2 size={20} className="text-white/20 mx-auto mb-2 animate-spin" />
          <p className="text-[12px] text-white/30">Connecting...</p>
        </div>
      ) : (
        messages.map((msg, i) => {
          const age = messages.length - 1 - i;
          const opacity = age === 0 ? 'text-white/70' : age <= 2 ? 'text-white/50' : age <= 5 ? 'text-white/35' : 'text-white/20';
          return (
            <div key={msg.id} className="flex items-start gap-2.5 py-0.5">
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[#afc4ff]' : 'bg-white/20')} />
              <span className={cn('text-[12px] leading-relaxed transition-colors', opacity)}>{msg.message}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// --- Report view ---

// Static talking points for the report view (production would extract from the markdown)
const STATIC_TALKING_POINTS = [
  "Based on market data for this role and geography, the total compensation for this level typically ranges 10-20% above what's been offered. I'd like to explore whether we can close that gap.",
  "I want to be clear: I'm excited about this role and the team. I'm raising these items because I want us to start on terms that reflect the scope of what I'll be delivering.",
  "Rather than focusing only on base salary, I'd like to think about the total package — including first-year bonus guarantee, equity refresh schedule, and any signing consideration for what I'm leaving behind.",
  "I have a number below which this transition doesn't make financial sense given what I'm currently forfeiting. I'm not saying that to create pressure — I want to be transparent so we can find something that works.",
];

function ReportView({
  report,
  qualityScore,
  strategyReviewData,
  offerBaseSalary,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  strategyReviewData: { market_p50?: number; market_p75?: number; data_confidence?: 'low' | 'medium' | 'high'; opening_position?: string; walk_away_point?: string } | null;
  offerBaseSalary?: number;
  onReset: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'playbook' | 'leverage' | 'redlines'>('playbook');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [report]);

  // Build salary range data from strategyReviewData when available
  const p50 = strategyReviewData?.market_p50;
  const p75 = strategyReviewData?.market_p75;
  const salaryMin = p50 ? Math.round(p50 * 0.8) : undefined;
  const salaryMax = p75 ? Math.round(p75 * 1.15) : undefined;

  const confidenceScore = qualityScore ?? 72;

  const leverCards: LeverCard[] = [
    {
      lever: 'Base Salary',
      icon: <DollarSign size={14} />,
      current: offerBaseSalary ? `$${offerBaseSalary.toLocaleString()}` : 'As offered',
      target: p50 ? `$${Math.round(p50 * 1.05).toLocaleString()}–$${Math.round(p50 * 1.15).toLocaleString()}` : '5–15% above offer',
      flexibility: 'medium',
      tip: 'Base salary has the least flexibility due to internal equity bands. Lead with base but be ready to shift to total comp.',
    },
    {
      lever: 'Signing Bonus',
      icon: <Zap size={14} />,
      current: 'Not in offer',
      target: '1–2 months base',
      flexibility: 'high',
      tip: 'Signing bonus is the most flexible element — it doesn\'t affect ongoing comp structure. Frame it as offsetting forfeited Q4 bonus.',
    },
    {
      lever: 'Equity / RSUs',
      icon: <TrendingUp size={14} />,
      current: 'As offered',
      target: '10–20% more units or accelerated vest',
      flexibility: 'medium',
      tip: 'Negotiate equity refresh cadence and whether partial acceleration applies on termination without cause.',
    },
    {
      lever: 'First-Year Bonus Guarantee',
      icon: <Shield size={14} />,
      current: 'Pro-rated (likely)',
      target: 'Full-year guarantee',
      flexibility: 'high',
      tip: 'You won\'t have a full performance year. A guaranteed first-year bonus is a standard and reasonable ask.',
    },
    {
      lever: 'Title / Scope',
      icon: <Briefcase size={14} />,
      current: 'As offered',
      target: 'Senior or elevated title',
      flexibility: 'low',
      tip: 'Title affects your next negotiation. If base is capped, a title upgrade may cost the employer nothing but compound for you.',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#afc4ff]/10 p-2.5 border border-[#afc4ff]/20">
            <TrendingUp size={18} className="text-[#afc4ff]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white/90">Negotiation Playbook</h2>
            <p className="text-[13px] text-white/40">Your personalized salary negotiation strategy</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceGauge score={confidenceScore} size={72} label="Position Strength" />
          <div className="flex flex-col gap-2">
            <GlassButton variant="ghost" onClick={handleCopy} size="sm">
              {copied ? <Check size={14} className="mr-1.5 text-[#b5dec2]" /> : <Copy size={14} className="mr-1.5" />}
              {copied ? 'Copied' : 'Copy'}
            </GlassButton>
            <GlassButton variant="ghost" onClick={onReset} size="sm">
              <RotateCcw size={14} className="mr-1.5" />
              New Analysis
            </GlassButton>
          </div>
        </div>
      </div>

      {/* Salary range visualization (when data is available) */}
      {salaryMin !== undefined && salaryMax !== undefined && p50 !== undefined && (
        <GlassCard className="p-5">
          <SalaryRangeBar
            min={salaryMin}
            mid={p50}
            max={salaryMax}
            offer={offerBaseSalary}
            label="Base Salary — Market Range"
          />
          {strategyReviewData?.data_confidence && (
            <p className="mt-3 text-[10px] text-white/25">
              Data confidence: <span className="text-white/40 capitalize">{strategyReviewData.data_confidence}</span> — AI-estimated from role, industry, and geography
            </p>
          )}
        </GlassCard>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] w-fit">
        {([
          ['playbook', 'Full Playbook'],
          ['leverage', 'Leverage Levers'],
          ['redlines', 'Red Lines'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-medium transition-all',
              activeTab === tab
                ? 'bg-white/[0.08] text-white/85 shadow-sm'
                : 'text-white/40 hover:text-white/60',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'playbook' && (
        <div className="space-y-6">
          {/* Talking points */}
          <GlassCard className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-[#afc4ff]/60" />
              <h3 className="text-[14px] font-semibold text-white/75">Verbatim Talking Points</h3>
              <span className="text-[11px] text-white/30 ml-1">use or adapt these word-for-word</span>
            </div>
            <div className="space-y-2.5">
              {STATIC_TALKING_POINTS.map((point, i) => (
                <TalkingPointItem key={i} point={point} index={i} />
              ))}
            </div>
          </GlassCard>

          {/* Counter-offer scenarios */}
          <GlassCard className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Swords size={14} className="text-[#f0d99f]/60" />
              <h3 className="text-[14px] font-semibold text-white/75">Counter-Offer Scenarios</h3>
            </div>
            <CounterScenarioCards />
          </GlassCard>

          {/* Full report markdown */}
          <GlassCard className="p-8 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
            <div
              className="prose prose-invert prose-sm max-w-none
                prose-headings:text-white/85 prose-headings:font-semibold
                prose-h1:text-lg prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
                prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[#afc4ff]/90
                prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-white/70
                prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
                prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
                prose-strong:text-white/80
                prose-em:text-[#f0d99f]/80
                prose-blockquote:border-[#afc4ff]/30 prose-blockquote:text-white/60 prose-blockquote:bg-[#afc4ff]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
                prose-hr:border-white/[0.06] prose-hr:my-6"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
            />
          </GlassCard>
        </div>
      )}

      {activeTab === 'leverage' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leverCards.map((card, i) => (
            <LeverCardDisplay key={i} card={card} />
          ))}
        </div>
      )}

      {activeTab === 'redlines' && (
        <RedLinesSection />
      )}
    </div>
  );
}

// --- Input field components ---

interface FormState {
  offerCompany: string;
  offerRole: string;
  offerBaseSalary: string;
  offerTotalComp: string;
  offerEquityDetails: string;
  offerOtherDetails: string;
  currentBaseSalary: string;
  currentTotalComp: string;
  currentEquity: string;
  targetRole: string;
  targetIndustry: string;
}

const DEFAULT_FORM: FormState = {
  offerCompany: '',
  offerRole: '',
  offerBaseSalary: '',
  offerTotalComp: '',
  offerEquityDetails: '',
  offerOtherDetails: '',
  currentBaseSalary: '',
  currentTotalComp: '',
  currentEquity: '',
  targetRole: '',
  targetIndustry: '',
};

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/30">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-[13px] text-white/80 placeholder:text-white/25',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:border-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/10 transition-all',
            prefix ? 'pl-7 pr-4' : 'px-4',
          )}
        />
      </div>
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:border-[#afc4ff]/40 focus:ring-2 focus:ring-[#afc4ff]/10 transition-all"
      />
    </div>
  );
}

// --- Counter-offer sim config ---

type CounterOfferMode = 'full' | 'single_round';

interface CounterOfferConfig {
  mode: CounterOfferMode;
  roundType?: string;
}

// --- Main component ---

interface SalaryNegotiationRoomProps {
  /** Company name pre-filled from a pipeline Offer card (SN1-2). */
  prefillCompany?: string;
  /** Role pre-filled from a pipeline Offer card (SN1-2). */
  prefillRole?: string;
  /** Called once after the prefill values have been applied to the form. */
  onPrefillConsumed?: () => void;
}

export function SalaryNegotiationRoom({ prefillCompany, prefillRole, onPrefillConsumed }: SalaryNegotiationRoomProps = {}) {
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    offerCompany: prefillCompany ?? '',
    offerRole: prefillRole ?? '',
  }));
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [counterOfferConfig, setCounterOfferConfig] = useState<CounterOfferConfig | null>(null);

  // SN1-2: Notify parent that prefill data was consumed so it can clear its state.
  // The form was already initialized with the prefill values in the useState initializer
  // above, so this effect only needs to fire the callback once on mount.
  const prefillConsumedRef = useRef(false);
  useEffect(() => {
    if (!prefillConsumedRef.current && (prefillCompany != null || prefillRole != null)) {
      prefillConsumedRef.current = true;
      onPrefillConsumed?.();
    }
  }, [prefillCompany, prefillRole, onPrefillConsumed]);

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    strategyReviewData,
    startPipeline,
    reset,
  } = useSalaryNegotiation();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{ report_markdown?: string; quality_score?: number }>({
    productSlug: 'salary-negotiation',
    skip: isPipelineActive,
  });

  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setResumeLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
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
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setResumeLoading(false);
      }
    }
    loadResume();
    return () => { cancelled = true; };
  }, []);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const canSubmit = form.offerCompany.trim().length > 0 && form.offerRole.trim().length > 0 && resumeText.length > 50;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setResumeError(null);

    if (!resumeText || resumeText.length < 50) {
      setResumeError('No resume found. Please complete the Resume Strategist first.');
      return;
    }

    await startPipeline({
      resumeText,
      offerCompany: form.offerCompany.trim(),
      offerRole: form.offerRole.trim(),
      offerBaseSalary: form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined,
      offerTotalComp: form.offerTotalComp ? Number(form.offerTotalComp) : undefined,
      offerEquityDetails: form.offerEquityDetails.trim() || undefined,
      offerOtherDetails: form.offerOtherDetails.trim() || undefined,
      currentBaseSalary: form.currentBaseSalary ? Number(form.currentBaseSalary) : undefined,
      currentTotalComp: form.currentTotalComp ? Number(form.currentTotalComp) : undefined,
      currentEquity: form.currentEquity.trim() || undefined,
      targetRole: form.targetRole.trim() || undefined,
      targetIndustry: form.targetIndustry.trim() || undefined,
    });
  }, [canSubmit, form, resumeText, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setForm(DEFAULT_FORM);
  }, [reset]);

  const handleStartCounterOffer = useCallback((mode: CounterOfferMode, roundType?: string) => {
    if (!resumeText || resumeText.length < 50) {
      setResumeError('No resume found. Please complete the Resume Strategist first.');
      return;
    }
    setCounterOfferConfig({ mode, roundType });
  }, [resumeText]);

  const handleBackFromCounterOffer = useCallback(() => {
    setCounterOfferConfig(null);
  }, []);

  if (counterOfferConfig) {
    return (
      <CounterOfferView
        mode={counterOfferConfig.mode}
        roundType={counterOfferConfig.roundType}
        resumeText={resumeText}
        offerCompany={form.offerCompany}
        offerRole={form.offerRole}
        offerBaseSalary={form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined}
        offerTotalComp={form.offerTotalComp ? Number(form.offerTotalComp) : undefined}
        onBack={handleBackFromCounterOffer}
      />
    );
  }

  // Complete — report view
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={report}
          qualityScore={qualityScore}
          strategyReviewData={strategyReviewData}
          offerBaseSalary={form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined}
          onReset={handleReset}
        />
      </div>
    );
  }

  // Running view
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white/90">Salary Negotiation</h1>
          <p className="text-[13px] text-white/40">Building your personalized negotiation strategy...</p>
        </div>

        {/* Stage indicators */}
        <div className="flex items-center gap-3">
          {['research', 'strategy'].map((stage, i, arr) => {
            const stageOrder = ['research', 'strategy'];
            const currentIdx = currentStage ? stageOrder.indexOf(currentStage) : -1;
            const stageIdx = stageOrder.indexOf(stage);
            const isDone = currentIdx > stageIdx;
            const isActive = currentStage === stage;
            return (
              <div key={stage} className="flex items-center gap-3">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
                  isActive ? 'bg-[#afc4ff]/15 text-[#afc4ff] border border-[#afc4ff]/25'
                    : isDone ? 'bg-[#b5dec2]/10 text-[#b5dec2] border border-[#b5dec2]/20'
                    : 'bg-white/[0.04] text-white/25 border border-white/[0.06]',
                )}>
                  {isActive && <Loader2 size={10} className="animate-spin" />}
                  {isDone && <Check size={10} />}
                  {STAGE_LABELS[stage]}
                </div>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-white/15 flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-lg bg-[#afc4ff]/10 p-2">
              <Loader2 size={16} className="text-[#afc4ff] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white/80">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting analysis...'}
              </h3>
              <p className="text-[12px] text-white/35">Analyzing market data and designing your strategy</p>
            </div>
          </div>
          <ActivityFeed messages={activityMessages} currentStage={currentStage} />
        </GlassCard>

        <button
          type="button"
          onClick={handleReset}
          className="text-[12px] text-white/25 hover:text-white/45 transition-colors self-start"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Error view
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white/90">Salary Negotiation</h1>
        </div>
        <GlassCard className="p-6 border-[#f0b8b8]/20">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f0b8b8] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[#f0b8b8] font-medium">Analysis failed</p>
              <p className="text-[12px] text-white/40 mt-0.5">{error}</p>
            </div>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
            <ArrowLeft size={14} className="mr-1.5" />
            Try Again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Idle form
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#afc4ff]/10 p-2.5 border border-[#afc4ff]/20">
            <DollarSign size={20} className="text-[#afc4ff]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white/90">Salary Negotiation</h1>
            <p className="text-[13px] text-white/40">Get a personalized playbook with market benchmarks, leverage points, and word-for-word scripts</p>
          </div>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['positioning_strategy', 'emotional_baseline']}
        className="mb-3"
      />

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
              New Analysis
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-white/80 max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {resumeLoading ? (
        <div className="flex items-center gap-2 text-[12px] text-white/35">
          <Loader2 size={12} className="animate-spin" />
          Loading your resume...
        </div>
      ) : resumeText.length > 50 ? (
        <div className="flex items-center gap-2 text-[12px] text-[#b5dec2]/70">
          <Check size={12} />
          Resume loaded from Resume Strategist
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[12px] text-[#f0d99f]/70 mb-1">
            <AlertCircle size={12} />
            No master resume found — paste your resume below
          </div>
          <TextareaField
            label="Your Resume"
            value={resumeText}
            onChange={setResumeText}
            placeholder="Paste your full resume text here..."
            rows={5}
          />
        </div>
      )}

      {resumeError && (
        <div className="flex items-center gap-2 text-[12px] text-[#f0b8b8]">
          <AlertCircle size={12} />
          {resumeError}
        </div>
      )}

      {/* Two-column form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-lg bg-[#afc4ff]/10 p-1.5">
              <Target size={14} className="text-[#afc4ff]" />
            </div>
            <h2 className="text-[15px] font-semibold text-white/80">The Offer</h2>
          </div>

          <InputField
            label="Company"
            value={form.offerCompany}
            onChange={(v) => setField('offerCompany', v)}
            placeholder="e.g. Acme Corp"
          />
          <InputField
            label="Role"
            value={form.offerRole}
            onChange={(v) => setField('offerRole', v)}
            placeholder="e.g. VP of Operations"
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="Base Salary"
              value={form.offerBaseSalary}
              onChange={(v) => setField('offerBaseSalary', v)}
              placeholder="180000"
              type="number"
              prefix="$"
            />
            <InputField
              label="Total Comp"
              value={form.offerTotalComp}
              onChange={(v) => setField('offerTotalComp', v)}
              placeholder="220000"
              type="number"
              prefix="$"
            />
          </div>
          <TextareaField
            label="Equity Details"
            value={form.offerEquityDetails}
            onChange={(v) => setField('offerEquityDetails', v)}
            placeholder="e.g. 10,000 RSUs vesting over 4 years, 1-year cliff..."
            rows={2}
          />
          <TextareaField
            label="Other Benefits"
            value={form.offerOtherDetails}
            onChange={(v) => setField('offerOtherDetails', v)}
            placeholder="e.g. signing bonus, relocation, PTO..."
            rows={2}
          />
        </GlassCard>

        <div className="flex flex-col gap-5">
          <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[#b5dec2]/10 p-1.5">
                <Shield size={14} className="text-[#b5dec2]" />
              </div>
              <h2 className="text-[15px] font-semibold text-white/80">Your Current Position</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Current Base"
                value={form.currentBaseSalary}
                onChange={(v) => setField('currentBaseSalary', v)}
                placeholder="165000"
                type="number"
                prefix="$"
              />
              <InputField
                label="Current Total Comp"
                value={form.currentTotalComp}
                onChange={(v) => setField('currentTotalComp', v)}
                placeholder="200000"
                type="number"
                prefix="$"
              />
            </div>
            <InputField
              label="Current Equity"
              value={form.currentEquity}
              onChange={(v) => setField('currentEquity', v)}
              placeholder="e.g. 5,000 vested RSUs remaining..."
            />
          </GlassCard>

          <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[#f0d99f]/10 p-1.5">
                <Briefcase size={14} className="text-[#f0d99f]" />
              </div>
              <h2 className="text-[15px] font-semibold text-white/80">
                Target Context <span className="text-[11px] font-normal text-white/30 ml-1">optional</span>
              </h2>
            </div>

            <InputField
              label="Target Role"
              value={form.targetRole}
              onChange={(v) => setField('targetRole', v)}
              placeholder="e.g. VP of Operations"
            />
            <InputField
              label="Target Industry"
              value={form.targetIndustry}
              onChange={(v) => setField('targetIndustry', v)}
              placeholder="e.g. Medical Devices"
            />
          </GlassCard>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[12px] text-white/30">
          Analysis takes 1–3 minutes. You'll get market benchmarks, leverage points, and word-for-word scripts.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[#afc4ff]/20 to-[#b5dec2]/10 hover:from-[#afc4ff]/30 hover:to-[#b5dec2]/20',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <TrendingUp size={15} className="mr-2" />
          Build Negotiation Strategy
        </GlassButton>
      </div>

      {/* Counter-offer practice */}
      {resumeText.length > 50 && (
        <div className="border-t border-white/[0.06] pt-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Swords size={14} className="text-[#f0d99f]/70" />
            <span className="text-[13px] font-medium text-white/60">Practice Counter-Offers</span>
            <span className="text-[11px] text-white/30 ml-1">
              Simulate employer pushback and get scored feedback
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <GlassButton
              variant="ghost"
              onClick={() => handleStartCounterOffer('full')}
              className="text-[13px] border-[#f0d99f]/20 hover:border-[#f0d99f]/40"
            >
              <Swords size={14} className="mr-1.5 text-[#f0d99f]/70" />
              Practice Counter-Offer
            </GlassButton>
            <GlassButton
              variant="ghost"
              onClick={() => handleStartCounterOffer('single_round', 'budget_constraints')}
              size="sm"
            >
              <Zap size={14} className="mr-1.5 text-[#afc4ff]/70" />
              Quick Round
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
}
