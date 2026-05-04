import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import { CareerProfileSummaryCard } from './CareerProfileSummaryCard';
import { NegotiationSimulationView } from '@/components/career-iq/NegotiationSimulationView';
import type { CareerProfileSummary } from './career-profile-summary';
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
  PlayCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSalaryNegotiation } from '@/hooks/useSalaryNegotiation';
import { usePriorResult } from '@/hooks/usePriorResult';
import { markdownToHtml } from '@/lib/markdown';
import { useLatestMasterResumeText } from './useLatestMasterResumeText';

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

  const color = score >= 70 ? 'var(--badge-green-text)' : score >= 45 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';
  const strengthLabel = score >= 70 ? 'Strong' : score >= 45 ? 'Moderate' : 'Weak';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="var(--line-soft)"
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
          <span className="text-[12px] text-[var(--text-soft)] mt-0.5">%</span>
        </div>
      </div>
      {label && <span className="text-[12px] text-[var(--text-soft)]">{label}</span>}
      <span className="text-[12px] font-medium" style={{ color }}>{strengthLabel}</span>
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
        <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--link)]/60" />
            <span className="text-[12px] text-[var(--text-soft)]">Market P50</span>
          </div>
          {offer !== undefined && (
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-amber-text)]/60" />
              <span className="text-[12px] text-[var(--text-soft)]">Your offer</span>
            </div>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-6">
        {/* Background range */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-2 rounded-full bg-[var(--accent-muted)]" />
        </div>
        {/* Colored range fill (min to max) */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--badge-red-text)]/20 via-[var(--link)]/25 to-[var(--badge-green-text)]/30"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* P50 marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-0.5 rounded-full bg-[var(--link)]/50"
          style={{ left: `${positionPct(mid)}%` }}
        />

        {/* Offer marker */}
        {offer !== undefined && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-1 rounded-full bg-[var(--badge-amber-text)]"
            style={{ left: `${positionPct(offer)}%` }}
            title={`Your offer: ${formatK(offer)}`}
          />
        )}

        {/* Current comp marker */}
        {current !== undefined && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-0.5 rounded-full bg-[var(--badge-green-text)]/50"
            style={{ left: `${positionPct(current)}%` }}
            title={`Current: ${formatK(current)}`}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[var(--text-soft)]">{formatK(min)}</span>
        <div className="flex flex-col items-center">
          <span className="text-[12px] font-medium text-[var(--link)]/70">{formatK(mid)}</span>
          <span className="text-[12px] text-[var(--text-soft)]">P50</span>
        </div>
        <span className="text-[12px] text-[var(--text-soft)]">{formatK(max)}</span>
      </div>

      {/* Position commentary */}
      {offer !== undefined && (
        <div className={cn(
          'rounded-lg px-3 py-2 text-[13px] border',
          offer >= mid
            ? 'bg-[var(--badge-green-text)]/[0.04] border-[var(--badge-green-text)]/15 text-[var(--badge-green-text)]/80'
            : offer >= min
            ? 'bg-[var(--badge-amber-text)]/[0.04] border-[var(--badge-amber-text)]/15 text-[var(--badge-amber-text)]/80'
            : 'bg-[var(--badge-red-text)]/[0.04] border-[var(--badge-red-text)]/15 text-[var(--badge-red-text)]/80',
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
    high: { label: 'High flexibility', color: 'text-[var(--badge-green-text)]', dot: 'bg-[var(--badge-green-text)]' },
    medium: { label: 'Moderate flexibility', color: 'text-[var(--badge-amber-text)]', dot: 'bg-[var(--badge-amber-text)]' },
    low: { label: 'Low flexibility', color: 'text-[var(--badge-red-text)]', dot: 'bg-[var(--badge-red-text)]' },
  }[card.flexibility];

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-soft)]">{card.icon}</span>
        <span className="text-[13px] font-semibold text-[var(--text-muted)]">{card.lever}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', flexConfig.dot)} />
          <span className={cn('text-[12px] font-medium', flexConfig.color)}>{flexConfig.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[12px] text-[var(--text-soft)] block mb-0.5">Current</span>
          <span className="text-[12px] text-[var(--text-soft)]">{card.current}</span>
        </div>
        <div>
          <span className="text-[12px] text-[var(--text-soft)] block mb-0.5">Target</span>
          <span className="text-[12px] text-[var(--text-muted)] font-medium">{card.target}</span>
        </div>
      </div>
      <p className="text-[13px] text-[var(--text-soft)] leading-relaxed border-t border-[var(--line-soft)] pt-2">{card.tip}</p>
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
    <div className="group relative rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 hover:border-[var(--link)]/20 transition-all">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 h-5 w-5 rounded-full border border-[var(--link)]/25 bg-[var(--link)]/[0.08] flex items-center justify-center text-[12px] font-bold text-[var(--link)]/70 mt-0.5">
          {index + 1}
        </span>
        <p className="flex-1 text-[13px] text-[var(--text-soft)] leading-relaxed italic">{point}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[var(--accent-muted)]"
          title="Copy to clipboard"
        >
          {copied
            ? <Check size={13} className="text-[var(--badge-green-text)]" />
            : <Copy size={13} className="text-[var(--text-soft)]" />
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
    <GlassCard className="p-5 border-[var(--badge-red-text)]/10">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={15} className="text-[var(--badge-red-text)]/70" />
        <h3 className="text-[14px] font-semibold text-[var(--text-muted)]">Red Lines — What NOT to Say</h3>
      </div>
      <div className="space-y-2">
        {RED_LINES.map((line, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[var(--badge-red-text)]/[0.03] border border-[var(--badge-red-text)]/[0.08]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-red-text)]/50 mt-1.5 flex-shrink-0" />
            <span className="text-[12px] text-[var(--badge-red-text)]/70 leading-relaxed">{line}</span>
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
    recommended_response: `"I appreciate the transparency. Given the scope of what you've described — particularly a specific benefit or term — I'd welcome a conversation about whether there's flexibility in the title, reporting structure, or total package. I want to make this work."`,
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
          <div key={i} className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent-muted)] transition-colors"
            >
              <MessageSquare size={14} className="text-[var(--link)]/50 flex-shrink-0" />
              <span className="flex-1 text-[13px] font-medium text-[var(--text-muted)]">{sc.scenario}</span>
              {isExpanded
                ? <ChevronRight size={13} className="text-[var(--text-soft)] rotate-90" />
                : <ChevronRight size={13} className="text-[var(--text-soft)]" />
              }
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-[var(--line-soft)]">
                <div className="mt-3">
                  <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">They say</span>
                  <p className="mt-1 text-[12px] text-[var(--text-soft)] leading-relaxed italic">{sc.employer_says}</p>
                </div>
                <div>
                  <span className="text-[12px] font-semibold text-[var(--link)]/50 uppercase tracking-wider">You say</span>
                  <p className="mt-1 text-[13px] text-[var(--text-muted)] leading-relaxed">{sc.recommended_response}</p>
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
}: {
  messages: { id: string; message: string; stage?: string; timestamp: number }[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {messages.length === 0 ? (
        <div className="text-center py-8">
          <Loader2 size={20} className="text-[var(--text-soft)] mx-auto mb-2 animate-spin" />
          <p className="text-[12px] text-[var(--text-soft)]">Connecting...</p>
        </div>
      ) : (
        messages.map((msg, i) => {
          const age = messages.length - 1 - i;
          const opacity = age === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--text-soft)]';
          return (
            <div key={msg.id} className="flex items-start gap-2.5 py-0.5">
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[var(--link)]' : 'bg-[var(--line-strong)]')} />
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


function ReportView({
  report,
  qualityScore,
  strategyReviewData,
  offerBaseSalary,
  onReset,
  onPractice,
}: {
  report: string;
  qualityScore: number | null;
  strategyReviewData: { market_p50?: number; market_p75?: number; data_confidence?: 'low' | 'medium' | 'high'; opening_position?: string; walk_away_point?: string } | null;
  offerBaseSalary?: number;
  onReset: () => void;
  onPractice?: () => void;
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

  const confidenceScore = qualityScore;

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
          <div className="rounded-xl bg-[var(--link)]/10 p-2.5 border border-[var(--link)]/20">
            <TrendingUp size={18} className="text-[var(--link)]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">Negotiation Strategy</h2>
            <p className="text-[13px] text-[var(--text-soft)]">Your working negotiation brief</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {confidenceScore !== null && confidenceScore !== undefined && (
            <ConfidenceGauge score={confidenceScore} size={72} label="Position Strength" />
          )}
          <div className="flex flex-col gap-2">
            {onPractice && (
              <GlassButton variant="ghost" onClick={onPractice} size="sm" className="text-[var(--badge-red-text)]/80 hover:text-[var(--badge-red-text)]">
                <PlayCircle size={14} className="mr-1.5" />
                Practice Counter-Offer
              </GlassButton>
            )}
            <GlassButton variant="ghost" onClick={handleCopy} size="sm">
              {copied ? <Check size={14} className="mr-1.5 text-[var(--badge-green-text)]" /> : <Copy size={14} className="mr-1.5" />}
              {copied ? 'Copied' : 'Copy'}
            </GlassButton>
            <GlassButton variant="ghost" onClick={onReset} size="sm">
              <RotateCcw size={14} className="mr-1.5" />
              Start New Draft
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
            <p className="mt-3 text-[12px] text-[var(--text-soft)]">
              Market read: <span className="text-[var(--text-soft)] capitalize">{strategyReviewData.data_confidence}</span> confidence based on role, industry, and geography
            </p>
          )}
        </GlassCard>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] w-fit">
        {([
          ['playbook', 'Strategy Brief'],
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
                ? 'bg-[var(--surface-1)] text-[var(--text-strong)] shadow-sm'
                : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
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
              <MessageSquare size={15} className="text-[var(--link)]/60" />
              <h3 className="text-[14px] font-semibold text-[var(--text-muted)]">Verbatim Talking Points</h3>
              <span className="text-[13px] text-[var(--text-soft)] ml-1">use or adapt these word-for-word</span>
            </div>
            <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
              Personalized talking points will appear here after your negotiation analysis completes.
            </p>
          </GlassCard>

          {/* Counter-offer scenarios */}
          <GlassCard className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Swords size={14} className="text-[var(--badge-amber-text)]/60" />
              <h3 className="text-[14px] font-semibold text-[var(--text-muted)]">Counter-Offer Scenarios</h3>
            </div>
            <CounterScenarioCards />
          </GlassCard>

          {/* Full report markdown */}
          <GlassCard className="p-8 bg-[var(--accent-muted)]">
            <div
              className="prose prose-invert prose-sm max-w-none
                prose-headings:text-[var(--text-strong)] prose-headings:font-semibold
                prose-h1:text-lg prose-h1:border-b prose-h1:border-[var(--line-soft)] prose-h1:pb-3 prose-h1:mb-5
                prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[var(--link)]/90
                prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-[var(--text-muted)]
                prose-p:text-[var(--text-soft)] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
                prose-li:text-[var(--text-soft)] prose-li:text-[13px] prose-li:leading-relaxed
                prose-strong:text-[var(--text-strong)]
                prose-em:text-[var(--badge-amber-text)]/80
                prose-blockquote:border-[var(--link)]/30 prose-blockquote:text-[var(--text-soft)] prose-blockquote:bg-[var(--link)]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
                prose-hr:border-[var(--line-soft)] prose-hr:my-6"
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
      <label className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-soft)]">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/10 transition-all',
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
      <label className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/10 transition-all"
      />
    </div>
  );
}

// --- Main component ---

interface SalaryNegotiationRoomProps {
  /** Company name pre-filled from a pipeline Offer card (SN1-2). */
  prefillCompany?: string;
  /** Role pre-filled from a pipeline Offer card (SN1-2). */
  prefillRole?: string;
  /** Job application id linked to this negotiation workspace. */
  prefillJobApplicationId?: string;
  /** Exact saved negotiation session to reopen. */
  initialSessionId?: string;
  /** Called once after the prefill values have been applied to the form. */
  onPrefillConsumed?: () => void;
  careerProfileSummary?: CareerProfileSummary;
  onOpenCareerProfile?: () => void;
}

export function SalaryNegotiationRoom({
  prefillCompany,
  prefillRole,
  prefillJobApplicationId,
  initialSessionId,
  onPrefillConsumed,
  careerProfileSummary,
  onOpenCareerProfile,
}: SalaryNegotiationRoomProps = {}) {
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    offerCompany: prefillCompany ?? '',
    offerRole: prefillRole ?? '',
  }));
  const [showPriorResult, setShowPriorResult] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeError, setResumeError] = useState<string | null>(null);
  const { resumeText: loadedResumeText, loading: resumeLoading } = useLatestMasterResumeText();

  const prefillConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    const prefillKey = `${prefillCompany ?? ''}::${prefillRole ?? ''}`;
    if ((prefillCompany != null || prefillRole != null) && prefillConsumedRef.current !== prefillKey) {
      prefillConsumedRef.current = prefillKey;
      onPrefillConsumed?.();
    }
  }, [prefillCompany, prefillRole, onPrefillConsumed]);

  useEffect(() => {
    if (prefillCompany != null || prefillRole != null) {
      setForm((prev) => ({
        ...prev,
        offerCompany: prefillCompany ?? prev.offerCompany,
        offerRole: prefillRole ?? prev.offerRole,
      }));
    }
  }, [prefillCompany, prefillRole]);

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    strategyReviewData,
    startPipeline,
    respondToGate,
    reset,
  } = useSalaryNegotiation();
  const [strategyFeedback, setStrategyFeedback] = useState('');

  const isPipelineActive = status === 'connecting' || status === 'running' || status === 'strategy_review';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{ report_markdown?: string; quality_score?: number }>({
    productSlug: 'salary-negotiation',
    skip: isPipelineActive,
    sessionId: initialSessionId,
  });

  useEffect(() => {
    if (loadedResumeText && !resumeText) {
      setResumeText(loadedResumeText);
    }
  }, [loadedResumeText, resumeText]);

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
      jobApplicationId: prefillJobApplicationId,
    });
  }, [canSubmit, form, prefillJobApplicationId, resumeText, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setForm(DEFAULT_FORM);
  }, [reset]);

  // Simulation view — practice counter-offer
  if (showSimulation) {
    return (
      <NegotiationSimulationView
        offerCompany={form.offerCompany || (prefillCompany ?? '')}
        offerRole={form.offerRole || (prefillRole ?? '')}
        offerBaseSalary={form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined}
        offerEquityDetails={form.offerEquityDetails || undefined}
        mode="practice"
        onBack={() => setShowSimulation(false)}
      />
    );
  }

  // Strategy review gate
  if (status === 'strategy_review') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Negotiation Prep</h1>
          <p className="text-[13px] text-[var(--text-soft)]">Review your strategy before we write the full brief</p>
        </div>

        {strategyReviewData && (
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[var(--link)]/10 p-1.5">
                <TrendingUp size={14} className="text-[var(--link)]" />
              </div>
              <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Strategy Review</h2>
            </div>

            {strategyReviewData.opening_position && (
              <div>
                <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Opening Position</span>
                <p className="mt-1 text-[13px] text-[var(--text-muted)] leading-relaxed">{strategyReviewData.opening_position}</p>
              </div>
            )}
            {strategyReviewData.walk_away_point && (
              <div>
                <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Walk-Away Point</span>
                <p className="mt-1 text-[13px] text-[var(--text-muted)] leading-relaxed">{strategyReviewData.walk_away_point}</p>
              </div>
            )}
            {strategyReviewData.batna && (
              <div>
                <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">BATNA</span>
                <p className="mt-1 text-[13px] text-[var(--text-muted)] leading-relaxed">{strategyReviewData.batna}</p>
              </div>
            )}
            {strategyReviewData.approach && (
              <div>
                <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Recommended Approach</span>
                <p className="mt-1 text-[13px] text-[var(--text-muted)] leading-relaxed">{strategyReviewData.approach}</p>
              </div>
            )}
            {strategyReviewData.market_p50 !== undefined && (
              <div className="flex items-center gap-6 pt-2 border-t border-[var(--line-soft)]">
                <div>
                  <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Market P50</span>
                  <p className="mt-0.5 text-[14px] font-semibold text-[var(--text-strong)]">${strategyReviewData.market_p50.toLocaleString()}</p>
                </div>
                {strategyReviewData.market_p75 !== undefined && (
                  <div>
                    <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Market P75</span>
                    <p className="mt-0.5 text-[14px] font-semibold text-[var(--text-strong)]">${strategyReviewData.market_p75.toLocaleString()}</p>
                  </div>
                )}
                {strategyReviewData.data_confidence && (
                  <div>
                    <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Data Confidence</span>
                    <p className="mt-0.5 text-[13px] text-[var(--text-muted)] capitalize">{strategyReviewData.data_confidence}</p>
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="p-6 space-y-4">
          <h3 className="text-[14px] font-semibold text-[var(--text-muted)]">Request Changes</h3>
          <TextareaField
            label="Feedback (optional)"
            value={strategyFeedback}
            onChange={setStrategyFeedback}
            placeholder="Describe any changes you'd like to the strategy before we continue..."
            rows={3}
          />
        </GlassCard>

        <div className="flex items-center gap-3">
          <GlassButton
            variant="primary"
            onClick={() => respondToGate('strategy_review', true)}
            className="px-6"
          >
            <Check size={14} className="mr-1.5" />
            Approve Strategy
          </GlassButton>
          {strategyFeedback.trim().length > 0 && (
            <GlassButton
              variant="ghost"
              onClick={() => {
                respondToGate('strategy_review', { approved: false, feedback: strategyFeedback });
                setStrategyFeedback('');
              }}
            >
              Request Changes
            </GlassButton>
          )}
        </div>
      </div>
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
          onPractice={() => setShowSimulation(true)}
        />
      </div>
    );
  }

  if (status === 'idle' && initialSessionId && priorResult?.report_markdown) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={priorResult.report_markdown}
          qualityScore={priorResult.quality_score ?? null}
          strategyReviewData={null}
          offerBaseSalary={form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined}
          onReset={() => {
            clearPrior();
            handleReset();
          }}
          onPractice={() => setShowSimulation(true)}
        />
      </div>
    );
  }

  // Running view
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Negotiation Prep</h1>
          <p className="text-[13px] text-[var(--text-soft)]">Building your negotiation brief...</p>
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
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all',
                  isActive ? 'bg-[var(--link)]/15 text-[var(--link)] border border-[var(--link)]/25'
                    : isDone ? 'bg-[var(--badge-green-text)]/10 text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/20'
                    : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)]',
                )}>
                  {isActive && <Loader2 size={10} className="animate-spin" />}
                  {isDone && <Check size={10} />}
                  {STAGE_LABELS[stage]}
                </div>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-[var(--text-soft)] flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        <GlassCard className="p-6 bg-[var(--accent-muted)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-lg bg-[var(--link)]/10 p-2">
              <Loader2 size={16} className="text-[var(--link)] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting analysis...'}
              </h3>
              <p className="text-[12px] text-[var(--text-soft)]">Reviewing market context and shaping your negotiation brief</p>
            </div>
          </div>
          <ActivityFeed messages={activityMessages} />
        </GlassCard>

        <button
          type="button"
          onClick={handleReset}
          className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors self-start"
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
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Negotiation Prep</h1>
        </div>
        <GlassCard className="p-6 border-[var(--badge-red-text)]/20">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[var(--badge-red-text)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[var(--badge-red-text)] font-medium">Analysis failed</p>
              <p className="text-[12px] text-[var(--text-soft)] mt-0.5">{error}</p>
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
      {careerProfileSummary && (
        <CareerProfileSummaryCard
          summary={careerProfileSummary}
          title="Career Vault is anchoring your negotiation posture"
          description="Negotiation Prep should reflect the same level, scope, and market story the rest of the platform is building for you."
          usagePoints={[
            'Role level and differentiators help frame what makes your ask credible.',
            'The platform uses your positioning story to decide where you have leverage.',
            'Negotiation language should match the same executive tone used in your resume and interview prep.',
          ]}
          onOpenProfile={onOpenCareerProfile}
        />
      )}

      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[var(--link)]/10 p-2.5 border border-[var(--link)]/20">
                <DollarSign size={20} className="text-[var(--link)]" />
              </div>
              <div>
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]">
                  Negotiation Prep
                </div>
                <h1 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Build one clear compensation strategy before you respond</h1>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-soft)]">
              This should feel like a guided strategy brief, not a report generator. Load the offer, anchor it to your market story, and walk away with leverage points plus language you can actually use.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {priorResult && !isPipelineActive && (
              <GlassButton
                variant="ghost"
                onClick={() => setShowPriorResult((current) => !current)}
                className="text-[13px]"
              >
              {showPriorResult ? 'Hide earlier strategy' : 'Review earlier strategy'}
              </GlassButton>
            )}
            <GlassButton variant="ghost" onClick={() => onOpenCareerProfile?.()} className="text-[13px]">
              <Target size={14} className="mr-1.5" />
              Review Career Vault
            </GlassButton>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">What goes in</div>
            <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">Offer details, current baseline, and the story behind your leverage</div>
          </div>
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">What comes out</div>
            <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">Market benchmarks, negotiation posture, and scripts you can actually say out loud</div>
          </div>
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">How to use it</div>
            <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">Decide what to press, what to trade, and when to hold the line</div>
          </div>
        </div>

        <ContextLoadedBadge
          contextTypes={['career_profile', 'positioning_strategy', 'emotional_baseline']}
          className="mt-5"
        />
      </GlassCard>

      {priorLoading && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading saved draft...
          </div>
        </GlassCard>
      )}
      {priorResult && !isPipelineActive && showPriorResult && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--text-muted)]">
              {initialSessionId ? 'Saved negotiation strategy for this job' : 'Earlier draft'}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPriorResult(false)}
                className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
              >
                Hide
              </button>
              <button
                type="button"
                onClick={clearPrior}
                className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Start New Draft
              </button>
            </div>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-[var(--text-strong)] max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      <GlassCard className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">Resume context</div>
            <h2 className="mt-2 text-base font-semibold text-[var(--text-strong)]">This strategy gets stronger when the platform can see your full scope and proof</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
              If your achievement proof is already saved, we will use it. If not, paste it here so the strategy reflects your real level, impact, and credibility.
            </p>
          </div>
          {resumeText.length > 50 && !resumeLoading && (
            <div className="rounded-full border border-[var(--badge-green-text)]/18 bg-[var(--badge-green-text)]/[0.05] px-3 py-1 text-[13px] uppercase tracking-[0.16em] text-[var(--badge-green-text)]/78">
              Resume loaded
            </div>
          )}
        </div>

        <div className="mt-4">
          {resumeLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
              <Loader2 size={12} className="animate-spin" />
              Loading your resume...
            </div>
          ) : resumeText.length > 50 ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--badge-green-text)]/70">
              <Check size={12} />
              Resume loaded from Tailor Resume / achievement proof.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[12px] text-[var(--badge-amber-text)]/70 mb-1">
                <AlertCircle size={12} />
                No achievement proof found — paste your resume below
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
        </div>
      </GlassCard>

      {resumeError && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--badge-red-text)]">
          <AlertCircle size={12} />
          {resumeError}
        </div>
      )}

      {/* Two-column form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6 bg-[var(--accent-muted)] flex flex-col gap-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-lg bg-[var(--link)]/10 p-1.5">
              <Target size={14} className="text-[var(--link)]" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">The Offer</h2>
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
          <GlassCard className="p-6 bg-[var(--accent-muted)] flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[var(--badge-green-text)]/10 p-1.5">
                <Shield size={14} className="text-[var(--badge-green-text)]" />
              </div>
              <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Your Current Position</h2>
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

          <GlassCard className="p-6 bg-[var(--accent-muted)] flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[var(--badge-amber-text)]/10 p-1.5">
                <Briefcase size={14} className="text-[var(--badge-amber-text)]" />
              </div>
              <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">
                Target Context <span className="text-[13px] font-normal text-[var(--text-soft)] ml-1">optional</span>
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
        <p className="text-[12px] text-[var(--text-soft)]">
          This takes 1–3 minutes. You will get market benchmarks, leverage points, and language you can actually use.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[var(--link)]/20 to-[var(--badge-green-text)]/10 hover:from-[var(--link)]/30 hover:to-[var(--badge-green-text)]/20',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <TrendingUp size={15} className="mr-2" />
          Build Strategy
        </GlassButton>
      </div>
    </div>
  );
}
