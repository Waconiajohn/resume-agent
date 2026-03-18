import { useState, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import { CareerProfileSummaryCard } from './CareerProfileSummaryCard';
import type { CareerProfileSummary } from './career-profile-summary';
import {
  TrendingDown,
  Shield,
  BookOpen,
  ArrowRight,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clipboard,
  ClipboardCheck,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRetirementBridge,
  type ReadinessSignal,
  type ReadinessDimension,
  type RetirementReadinessSummary,
} from '@/hooks/useRetirementBridge';
import { usePlannerHandoff } from '@/hooks/usePlannerHandoff';

// ─── Static content ───────────────────────────────────────────────────────────

const RESOURCES = [
  {
    id: '1',
    title: 'Understanding Your Retirement Bridge',
    description:
      'What displaced executives need to know about protecting their retirement savings during a career transition.',
    readTime: '6 min read',
    category: 'Planning',
  },
  {
    id: '2',
    title: 'COBRA vs. Marketplace: Making the Right Health Insurance Decision',
    description:
      'A practical comparison for executives between jobs, including often-overlooked tax implications.',
    readTime: '8 min read',
    category: 'Insurance',
  },
  {
    id: '3',
    title: "Should You Touch Your 401(k)? A Framework for the Decision",
    description:
      "When early withdrawal makes sense, when it doesn't, and the questions to ask a fiduciary planner.",
    readTime: '5 min read',
    category: 'Retirement',
  },
  {
    id: '4',
    title: 'Negotiating Severance: What Most Executives Leave on the Table',
    description:
      "The five components of severance most people don't negotiate — and how to approach the conversation.",
    readTime: '7 min read',
    category: 'Negotiation',
  },
];

// ─── Signal config ────────────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<
  ReadinessSignal,
  { label: string; color: string; bgColor: string; Icon: typeof CheckCircle2 }
> = {
  green: {
    label: 'Well Positioned',
    color: 'text-[#b5dec2]',
    bgColor: 'bg-[#b5dec2]',
    Icon: CheckCircle2,
  },
  yellow: {
    label: 'Worth Exploring',
    color: 'text-[#f0d99f]',
    bgColor: 'bg-[#f0d99f]',
    Icon: AlertCircle,
  },
  red: {
    label: 'Priority Conversation',
    color: 'text-[#e8a0a0]',
    bgColor: 'bg-[#e8a0a0]',
    Icon: XCircle,
  },
};

const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  income_replacement: 'Income Replacement',
  healthcare_bridge: 'Healthcare Bridge',
  debt_profile: 'Debt Profile',
  retirement_savings_impact: 'Retirement Savings',
  insurance_gaps: 'Insurance Gaps',
  tax_implications: 'Tax Implications',
  lifestyle_adjustment: 'Lifestyle Adjustment',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyStateCard({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  return (
    <GlassCard className="p-8 flex flex-col items-center text-center gap-5">
      <div className="h-14 w-14 rounded-2xl bg-[#98b3ff]/10 flex items-center justify-center">
        <TrendingDown size={26} className="text-[#98b3ff]" />
      </div>

      <div className="max-w-sm">
        <h3 className="text-[16px] font-semibold text-white/85 mb-2">
          Retirement Bridge Assessment
        </h3>
        <p className="text-[13px] text-white/45 leading-relaxed">
          Answer a short set of questions across 7 financial dimensions. The goal is to clarify where the bridge may feel strong, fragile, or ambiguous before you sit down with a fiduciary planner.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-sm text-[12px] text-white/35">
        {['~5 minutes', '7 bridge checks', 'No financial advice'].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2"
          >
            {label}
          </div>
        ))}
      </div>

      <GlassButton
        variant="primary"
        className="text-[14px] px-6"
        onClick={onStart}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 size={15} className="mr-2 animate-spin" />
            Preparing questions...
          </>
        ) : (
          <>
            Start Assessment
            <ChevronRight size={16} className="ml-2" />
          </>
        )}
      </GlassButton>

      <p className="text-[11px] text-white/20">
        We surface the questions and blind spots. Your planner provides the advice.
      </p>
    </GlassCard>
  );
}

function AssessmentQuestionsView({
  questions,
  onSubmit,
  loading,
}: {
  questions: { id: string; question: string; dimension: ReadinessDimension }[];
  onSubmit: (responses: Record<string, string>) => void;
  loading: boolean;
}) {
  const [responses, setResponses] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, ''])),
  );

  const allAnswered = questions.every((q) => (responses[q.id] ?? '').trim().length > 0);

  const handleChange = useCallback((id: string, value: string) => {
    setResponses((prev) => ({ ...prev, [id]: value }));
  }, []);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <TrendingDown size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Assessment Questions</h3>
        <span className="ml-auto text-[12px] text-white/30">{questions.length} questions</span>
      </div>

      <p className="text-[13px] text-white/40 leading-relaxed mb-6">
        Answer honestly — there are no right or wrong answers. The goal is to surface the
        right topics for your planner conversation.
      </p>

      <div className="space-y-5">
        {questions.map((q, idx) => {
          const dimLabel = DIMENSION_LABELS[q.dimension];
          return (
            <div key={q.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-medium text-[#98b3ff]/50 uppercase tracking-wider">
                  {dimLabel}
                </span>
              </div>
              <p className="text-[13px] text-white/70 font-medium mb-2">
                {idx + 1}. {q.question}
              </p>
              <textarea
                value={responses[q.id] ?? ''}
                onChange={(e) => handleChange(q.id, e.target.value)}
                rows={3}
                placeholder="Your answer..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/40 transition-colors"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[12px] text-white/25">
          {questions.filter((q) => (responses[q.id] ?? '').trim()).length} of {questions.length}{' '}
          answered
        </p>
        <GlassButton
          variant="primary"
          className="text-[14px]"
          onClick={() => onSubmit(responses)}
          disabled={!allAnswered || loading}
        >
          {loading ? (
            <>
              <Loader2 size={15} className="mr-2 animate-spin" />
              Evaluating...
            </>
          ) : (
            <>
              Submit Responses
              <ArrowRight size={16} className="ml-2" />
            </>
          )}
        </GlassButton>
      </div>
    </GlassCard>
  );
}

function RetirementBridgeCard({ summary }: { summary: RetirementReadinessSummary }) {
  const [copied, setCopied] = useState(false);
  const overallConfig = SIGNAL_CONFIG[summary.overall_readiness];
  const OverallIcon = overallConfig.Icon;

  const handleCopyShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary.shareable_summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed — ignore silently
    }
  }, [summary.shareable_summary]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <TrendingDown size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Retirement Bridge Analysis</h3>
        <button
          onClick={handleCopyShare}
          className="ml-auto flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/60 transition-colors"
          title="Copy shareable summary"
        >
          {copied ? (
            <>
              <ClipboardCheck size={13} className="text-[#b5dec2]" />
              <span className="text-[#b5dec2]">Copied</span>
            </>
          ) : (
            <>
              <Clipboard size={13} />
              Share Summary
            </>
          )}
        </button>
      </div>

      {/* Overall readiness */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <OverallIcon size={15} className={overallConfig.color} />
          <span className={cn('text-[13px] font-semibold', overallConfig.color)}>
            Overall: {overallConfig.label}
          </span>
        </div>
        <div className="space-y-1.5">
          {summary.key_observations.map((obs, i) => (
            <p key={i} className="text-[12px] text-white/45 leading-relaxed pl-1">
              {obs}
            </p>
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div className="space-y-3 mb-5">
        {summary.dimensions.map((dim) => {
          const config = SIGNAL_CONFIG[dim.signal];
          const DimIcon = config.Icon;
          return (
            <div
              key={dim.dimension}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn('h-2 w-2 rounded-full flex-shrink-0', config.bgColor)} />
                <span className="text-[12px] font-semibold text-white/70">
                  {DIMENSION_LABELS[dim.dimension]}
                </span>
                <span className={cn('ml-auto text-[11px] font-medium', config.color)}>
                  {config.label}
                </span>
                <DimIcon size={12} className={config.color} />
              </div>
              {dim.observations.length > 0 && (
                <div className="pl-4 space-y-0.5">
                  {dim.observations.map((obs, i) => (
                    <p key={i} className="text-[11px] text-white/35 leading-relaxed">
                      {obs}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Planner topics */}
      {summary.recommended_planner_topics.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
            Bring these to your planner conversation
          </p>
          <div className="space-y-1">
            {summary.recommended_planner_topics.map((topic, i) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight size={11} className="text-[#98b3ff]/50 mt-0.5 flex-shrink-0" />
                <span className="text-[12px] text-white/50">{topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function PlannerConnectionCard() {
  const { phase, qualify, planners, referral, selectPlanner, reset } = usePlannerHandoff();

  const [showForm, setShowForm] = useState(false);
  const [assetRange, setAssetRange] = useState('');
  const [geography, setGeography] = useState('');

  const handleSchedule = useCallback(() => {
    setShowForm(true);
  }, []);

  const handleQualify = useCallback(async () => {
    await qualify(true, assetRange, geography);
  }, [qualify, assetRange, geography]);

  if (phase === 'complete' && referral) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Introduction Scheduled</h3>
        </div>
        <div className="rounded-xl border border-[#b5dec2]/20 bg-[#b5dec2]/5 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={15} className="text-[#b5dec2]" />
            <span className="text-[13px] font-semibold text-[#b5dec2]">Referral confirmed</span>
          </div>
          <p className="text-[12px] text-white/45">
            A fiduciary planner will reach out within 1-2 business days to schedule your free
            30-minute introduction.
          </p>
        </div>
        <button
          onClick={reset}
          className="text-[12px] text-white/25 hover:text-white/45 transition-colors"
        >
          Start over
        </button>
      </GlassCard>
    );
  }

  if (phase === 'disqualified') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Connect with a Planner</h3>
        </div>
        <p className="text-[13px] text-white/45 leading-relaxed mb-4">
          Based on your profile, a fiduciary planner referral may not be the right fit right now.
          The educational resources below are a great starting point.
        </p>
        <button
          onClick={reset}
          className="text-[12px] text-white/35 hover:text-white/55 transition-colors"
        >
          Try again
        </button>
      </GlassCard>
    );
  }

  if (phase === 'matching' && planners.length === 0) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">No Planners Available</h3>
        </div>
        <p className="text-[13px] text-white/45 leading-relaxed mb-4">
          No fiduciary planners currently serve your area. Try a different geographic region or
          check back later as our network continues to grow.
        </p>
        <button
          onClick={reset}
          className="text-[12px] text-white/35 hover:text-white/55 transition-colors"
        >
          Try a different location
        </button>
      </GlassCard>
    );
  }

  if (phase === 'matching' && planners.length > 0) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Select a Planner</h3>
        </div>
        <div className="space-y-3 mb-4">
          {planners.map((planner) => (
            <div
              key={planner.id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[13px] font-semibold text-white/80">{planner.name}</p>
                  <p className="text-[11px] text-white/40">{planner.firm}</p>
                </div>
                <GlassButton
                  variant="primary"
                  className="text-[12px] px-3 py-1.5 flex-shrink-0"
                  onClick={() => void selectPlanner(planner.id)}
                  disabled={phase === 'referring' as typeof phase}
                >
                  Select
                </GlassButton>
              </div>
              {planner.specializations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {planner.specializations.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] text-[#98b3ff]/60 bg-[#98b3ff]/8 border border-[#98b3ff]/15 rounded-full px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {planner.bio && (
                <p className="mt-2 text-[11px] text-white/35 leading-relaxed line-clamp-2">
                  {planner.bio}
                </p>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={reset}
          className="text-[12px] text-white/25 hover:text-white/45 transition-colors"
        >
          Start over
        </button>
      </GlassCard>
    );
  }

  if (showForm) {
    const isLoading = phase === 'qualifying' || phase === 'matching';
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Connect with a Planner</h3>
        </div>

        <p className="text-[13px] text-white/40 leading-relaxed mb-5">
          A few quick details help us match you with the right fiduciary planner.
        </p>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5">
              Approximate investable assets
            </label>
            <select
              value={assetRange}
              onChange={(e) => setAssetRange(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/40 transition-colors"
            >
              <option value="">Select a range</option>
              <option value="under_100k">Under $100k</option>
              <option value="100k_250k">$100k – $250k</option>
              <option value="250k_500k">$250k – $500k</option>
              <option value="500k_1m">$500k – $1M</option>
              <option value="over_1m">Over $1M</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5">
              Geographic region (city or state)
            </label>
            <input
              type="text"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              placeholder="e.g. Chicago, IL"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/75 placeholder:text-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/40 transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowForm(false)}
            className="text-[13px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel
          </button>
          <GlassButton
            variant="primary"
            className="flex-1 text-[14px]"
            onClick={() => void handleQualify()}
            disabled={!assetRange || !geography || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Finding planners...
              </>
            ) : (
              <>
                Find My Match
                <ArrowRight size={16} className="ml-2" />
              </>
            )}
          </GlassButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Connect with a Planner</h3>
      </div>

      <p className="text-[14px] text-white/50 leading-relaxed mb-2">
        Our network includes only fiduciary financial planners — professionals legally required to
        act in your best interest, not sell you products.
      </p>
      <p className="text-[13px] text-white/35 leading-relaxed mb-5">
        A 30-minute introductory conversation is free and comes with no obligation. Most executives
        in transition find that one conversation changes how they think about their timeline.
      </p>

      <div className="space-y-3 mb-5">
        {[
          'Fee-only fiduciary advisors — no commissions, no conflicts',
          'Specialize in career transition and early retirement scenarios',
          'Your data is shared only with your explicit consent',
        ].map((point) => (
          <div key={point} className="flex items-start gap-2.5">
            <Shield size={13} className="text-[#b5dec2] mt-0.5 flex-shrink-0" />
            <span className="text-[13px] text-white/55">{point}</span>
          </div>
        ))}
      </div>

      <GlassButton
        variant="primary"
        className="w-full text-[14px]"
        onClick={handleSchedule}
      >
        Schedule a Free Introduction
        <ArrowRight size={16} className="ml-2" />
      </GlassButton>

      <p className="mt-3 text-center text-[11px] text-white/25">
        No credit card required. No sales pitch. Just a conversation.
      </p>
    </GlassCard>
  );
}

function EducationalResources() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Financial Resources</h3>
      </div>

      <div className="space-y-3">
        {RESOURCES.map((resource) => (
          <div
            key={resource.id}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-[#98b3ff]/50 uppercase tracking-wider">
                  {resource.category}
                </span>
                <span className="text-[10px] text-white/20">·</span>
                <span className="flex items-center gap-1 text-[10px] text-white/25">
                  <Clock size={9} />
                  {resource.readTime}
                </span>
              </div>
              <h4 className="text-[13px] font-medium text-white/70">
                {resource.title}
              </h4>
              <p className="mt-1 text-[12px] text-white/35 leading-relaxed line-clamp-2">
                {resource.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── Loading / error helpers ──────────────────────────────────────────────────

function EvaluatingState() {
  return (
    <GlassCard className="p-8 flex flex-col items-center gap-4">
      <Loader2 size={28} className="text-[#98b3ff] animate-spin" />
      <div className="text-center">
        <p className="text-[14px] font-medium text-white/70 mb-1">Evaluating your responses</p>
        <p className="text-[12px] text-white/35">
          Reviewing each dimension and identifying planner conversation topics...
        </p>
      </div>
    </GlassCard>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <GlassCard className="p-6 flex flex-col items-center gap-4 text-center">
      <AlertCircle size={24} className="text-[#e8a0a0]" />
      <div>
        <p className="text-[13px] font-medium text-white/70 mb-1">Something went wrong</p>
        <p className="text-[12px] text-white/35">{message}</p>
      </div>
      <GlassButton variant="ghost" size="sm" onClick={onRetry}>
        Try Again
      </GlassButton>
    </GlassCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FinancialWellnessRoomProps {
  careerProfileSummary?: CareerProfileSummary;
  onOpenCareerProfile?: () => void;
}

export function FinancialWellnessRoom({
  careerProfileSummary,
  onOpenCareerProfile,
}: FinancialWellnessRoomProps = {}) {
  const { phase, questions, summary, error, startAssessment, submitResponses, reset } =
    useRetirementBridge();

  const handleStart = useCallback(() => {
    void startAssessment();
  }, [startAssessment]);

  const handleSubmit = useCallback(
    (responses: Record<string, string>) => {
      void submitResponses(responses);
    },
    [submitResponses],
  );

  const renderLeftPanel = () => {
    if (phase === 'idle') {
      return <EmptyStateCard onStart={handleStart} loading={false} />;
    }

    if (phase === 'generating_questions') {
      return <EmptyStateCard onStart={handleStart} loading={true} />;
    }

    if (phase === 'awaiting_responses') {
      return (
        <AssessmentQuestionsView
          questions={questions}
          onSubmit={handleSubmit}
          loading={false}
        />
      );
    }

    if (phase === 'evaluating') {
      return <EvaluatingState />;
    }

    if (phase === 'complete' && summary) {
      return <RetirementBridgeCard summary={summary} />;
    }

    if (phase === 'error') {
      return (
        <ErrorState
          message={error ?? 'An unexpected error occurred.'}
          onRetry={reset}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {careerProfileSummary && (
        <CareerProfileSummaryCard
          summary={careerProfileSummary}
          title="Career context can inform Retirement Bridge, but it does not replace financial guidance"
          description="Retirement Bridge is intentionally different from the rest of the platform. It uses your transition context to ask better questions, while keeping financial guidance deferred to a fiduciary planner."
          usagePoints={[
            'The assessment uses your transition context and emotional baseline to frame better questions.',
            'Financial Wellness still relies more on client profile signals than resume positioning.',
            'This tool prepares a planner conversation. It does not turn career context into financial advice.',
          ]}
          onOpenProfile={onOpenCareerProfile}
        />
      )}

      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
              Financial Wellness
            </div>
            <h1 className="mt-2 text-lg font-semibold text-white/90">Retirement Bridge</h1>
            <p className="mt-3 text-[13px] leading-relaxed text-white/48">
              This is not a generic calculator and it is not financial advice. It is a guided bridge assessment that helps you organize the right questions, risks, and transition signals before you speak with a fiduciary planner.
            </p>
          </div>

          <ContextLoadedBadge
            contextTypes={['emotional_baseline', 'client_profile']}
            className="mt-1"
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">What this does</div>
            <div className="mt-2 text-sm font-semibold text-white/84">Surfaces the planner conversations you should have before making a high-stakes transition decision</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">What it does not do</div>
            <div className="mt-2 text-sm font-semibold text-white/84">Replace fiduciary advice, portfolio planning, or tax guidance</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">Best use</div>
            <div className="mt-2 text-sm font-semibold text-white/84">Prepare for a planner conversation with more clarity, less fear, and better context</div>
          </div>
        </div>
      </GlassCard>

      {/* Bridge Analysis + Planner side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">{renderLeftPanel()}</div>
        {phase === 'complete' && summary && (
          <div className="flex-[2]">
            <PlannerConnectionCard />
          </div>
        )}
      </div>

      {/* Educational resources — full width */}
      <EducationalResources />
    </div>
  );
}
