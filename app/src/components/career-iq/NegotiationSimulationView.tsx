import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import {
  useNegotiationSimulation,
  type RoundEvaluation,
  type NegotiationRound,
  type SimulationSummary,
  type NegotiationSimulationMode,
} from '@/hooks/useNegotiationSimulation';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_TYPE_LABELS: Record<string, string> = {
  initial_offer_delivery: 'Initial Offer',
  pushback_base_cap: 'Base Salary Pushback',
  equity_leverage: 'Equity / Total Comp',
  final_counter: 'Final Counter',
  closing_pressure: 'Closing Pressure',
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  excellent: { label: 'Excellent', color: 'text-[var(--badge-green-text)]', dot: 'bg-[var(--badge-green-text)]' },
  good: { label: 'Good', color: 'text-[var(--link)]', dot: 'bg-[var(--link)]' },
  needs_work: { label: 'Needs Work', color: 'text-[var(--badge-amber-text)]', dot: 'bg-[var(--badge-amber-text)]' },
  missed: { label: 'Missed', color: 'text-[var(--badge-red-text)]', dot: 'bg-[var(--badge-red-text)]' },
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-[var(--badge-green-text)]';
  if (score >= 60) return 'text-[var(--badge-amber-text)]';
  return 'text-[var(--badge-red-text)]';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-[var(--badge-green-text)]';
  if (score >= 60) return 'bg-[var(--badge-amber-text)]';
  return 'bg-[var(--badge-red-text)]';
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-[var(--text-soft)] w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--accent-muted)]">
        <div
          className={cn('h-full transition-all rounded-full', scoreBg(value))}
          style={{ width: `${value}%`, opacity: 0.7 }}
        />
      </div>
      <span className={cn('text-[13px] font-medium w-8 text-right flex-shrink-0', scoreColor(value))}>
        {value}
      </span>
    </div>
  );
}

// ─── EvaluationCard ───────────────────────────────────────────────────────────

function EvaluationCard({ evaluation, index }: { evaluation: RoundEvaluation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const outcome = OUTCOME_CONFIG[evaluation.outcome] ?? OUTCOME_CONFIG.needs_work;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-1)] transition-colors"
      >
        <span className="text-[13px] text-[var(--text-soft)] w-5 flex-shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-[var(--text-muted)] truncate block">
            {ROUND_TYPE_LABELS[evaluation.round_type] ?? evaluation.round_type}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={cn('flex items-center gap-1.5', outcome.color)}>
            <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', outcome.dot)} />
            <span className="text-[12px] font-medium">{outcome.label}</span>
          </div>
          <span className={cn('text-[13px] font-bold w-8 text-right', scoreColor(evaluation.overall_score))}>
            {evaluation.overall_score}
          </span>
          {expanded ? (
            <ChevronUp size={13} className="text-[var(--text-soft)]" />
          ) : (
            <ChevronDown size={13} className="text-[var(--text-soft)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--line-soft)]">
          <div className="mt-4 space-y-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-1.5">
                Employer said
              </p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed italic">
                "{evaluation.employer_position}"
              </p>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-1.5">
                You responded
              </p>
              <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                "{evaluation.candidate_response}"
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--line-soft)]">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-2">
              Scores
            </p>
            <ScoreBar label="Acknowledgment" value={evaluation.scores.acknowledgment} />
            <ScoreBar label="Data Support" value={evaluation.scores.data_support} />
            <ScoreBar label="Specificity" value={evaluation.scores.specificity} />
            <ScoreBar label="Tone" value={evaluation.scores.tone} />
          </div>

          {evaluation.strengths.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--badge-green-text)]/60 mb-1.5">
                Strengths
              </p>
              <ul className="space-y-1">
                {evaluation.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-soft)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-green-text)]/50 mt-1.5 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.improvements.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--badge-amber-text)]/60 mb-1.5">
                To Improve
              </p>
              <ul className="space-y-1">
                {evaluation.improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-soft)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-amber-text)]/50 mt-1.5 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.coaching_note && (
            <div className="rounded-lg bg-[var(--link)]/[0.04] border border-[var(--link)]/15 px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--link)]/50 mb-1">
                Coaching note
              </p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
                {evaluation.coaching_note}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SummaryView ──────────────────────────────────────────────────────────────

function SummaryView({
  summary,
  evaluations,
  onReset,
}: {
  summary: SimulationSummary;
  evaluations: RoundEvaluation[];
  onReset: () => void;
}) {
  const scoreColor = summary.overall_score >= 80
    ? 'var(--badge-green-text)'
    : summary.overall_score >= 60
    ? 'var(--badge-amber-text)'
    : 'var(--badge-red-text)';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)]">Simulation Complete</h2>
          <p className="text-[13px] text-[var(--text-soft)] mt-0.5">
            {summary.total_rounds} rounds — {summary.outcome_summary}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold" style={{ color: scoreColor }}>
            {summary.overall_score}
          </span>
          <span className="text-[12px] text-[var(--text-soft)]">out of 100</span>
        </div>
      </div>

      <GlassCard className="p-5 border-[var(--link)]/10">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--link)]/50 mb-2">
          Coaching Takeaway
        </p>
        <p className="text-[14px] text-[var(--text-soft)] leading-relaxed">
          {summary.coaching_takeaway}
        </p>
      </GlassCard>

      <div className="grid grid-cols-2 gap-4">
        {summary.strengths.length > 0 && (
          <GlassCard className="p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--badge-green-text)]/60 mb-2">
              Strengths
            </p>
            <ul className="space-y-1.5">
              {summary.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-soft)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-green-text)]/50 mt-1.5 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        {summary.areas_for_improvement.length > 0 && (
          <GlassCard className="p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--badge-amber-text)]/60 mb-2">
              Areas to Improve
            </p>
            <ul className="space-y-1.5">
              {summary.areas_for_improvement.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-soft)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-amber-text)]/50 mt-1.5 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>

      {evaluations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[14px] font-semibold text-[var(--text-muted)]">Round by Round</h3>
          {evaluations.map((ev, i) => (
            <EvaluationCard key={i} evaluation={ev} index={i} />
          ))}
        </div>
      )}

      <GlassButton variant="ghost" onClick={onReset} size="sm">
        <ArrowLeft size={14} className="mr-1.5" />
        Try Another Session
      </GlassButton>
    </div>
  );
}

// ─── EmployerBubble ───────────────────────────────────────────────────────────

function EmployerBubble({ round }: { round: NegotiationRound }) {
  const label = ROUND_TYPE_LABELS[round.type] ?? round.type;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-[var(--badge-red-text)]/10 border border-[var(--badge-red-text)]/20 flex-shrink-0">
          <Briefcase size={12} className="text-[var(--badge-red-text)]/70" />
        </div>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--badge-red-text)]/50">
          Employer — {label}
        </span>
      </div>
      <div className="ml-9 rounded-2xl rounded-tl-sm bg-[var(--badge-red-text)]/[0.06] border border-[var(--badge-red-text)]/15 px-4 py-3">
        <p className="text-[14px] text-[var(--text-muted)] leading-relaxed">
          "{round.employer_position}"
        </p>
      </div>
    </div>
  );
}

// ─── ResponseInput ────────────────────────────────────────────────────────────

function ResponseInput({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (text: string) => void;
  isSubmitting: boolean;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length < 5 || isSubmitting) return;
    onSubmit(trimmed);
    setText('');
  }, [text, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSubmit = text.trim().length >= 5 && !isSubmitting;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-[var(--link)]/10 border border-[var(--link)]/20 flex-shrink-0">
          <DollarSign size={12} className="text-[var(--link)]/70" />
        </div>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--link)]/50">
          Your Response
        </span>
      </div>
      <div className="ml-9">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          disabled={isSubmitting}
          placeholder="Type your counter-response here... (Cmd+Enter to submit)"
          className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/10 transition-all disabled:opacity-60"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px] text-[var(--text-soft)]">
            Respond as if you are in a real negotiation conversation
          </span>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={12} className="mr-1.5 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Response'
            )}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

// ─── EvaluationInline ─────────────────────────────────────────────────────────

function EvaluationInline({ evaluation }: { evaluation: RoundEvaluation }) {
  const outcome = OUTCOME_CONFIG[evaluation.outcome] ?? OUTCOME_CONFIG.needs_work;

  return (
    <div className="ml-9 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5', outcome.color)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', outcome.dot)} />
          <span className="text-[12px] font-semibold">{outcome.label} response</span>
        </div>
        <span className={cn('text-[15px] font-bold', scoreColor(evaluation.overall_score))}>
          {evaluation.overall_score}/100
        </span>
      </div>

      <div className="space-y-1.5">
        <ScoreBar label="Acknowledgment" value={evaluation.scores.acknowledgment} />
        <ScoreBar label="Data Support" value={evaluation.scores.data_support} />
        <ScoreBar label="Specificity" value={evaluation.scores.specificity} />
        <ScoreBar label="Tone" value={evaluation.scores.tone} />
      </div>

      {evaluation.coaching_note && (
        <p className="text-[13px] text-[var(--text-soft)] leading-relaxed border-t border-[var(--line-soft)] pt-3">
          {evaluation.coaching_note}
        </p>
      )}
    </div>
  );
}

// ─── NegotiationSimulationView (main) ────────────────────────────────────────

interface NegotiationSimulationViewProps {
  offerCompany: string;
  offerRole: string;
  offerBaseSalary?: number;
  offerEquityDetails?: string;
  mode?: NegotiationSimulationMode;
  marketResearch?: Record<string, unknown>;
  leveragePoints?: Record<string, unknown>[];
  onBack: () => void;
}

export function NegotiationSimulationView({
  offerCompany,
  offerRole,
  offerBaseSalary,
  offerEquityDetails,
  mode = 'practice',
  marketResearch,
  leveragePoints,
  onBack,
}: NegotiationSimulationViewProps) {
  const {
    status,
    currentRound,
    pendingEvaluation,
    evaluations,
    activityMessages,
    summary,
    error,
    startSimulation,
    submitResponse,
    reset,
  } = useNegotiationSimulation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentRound, pendingEvaluation, evaluations.length]);

  const handleStart = useCallback(async () => {
    await startSimulation({
      offerCompany,
      offerRole,
      offerBaseSalary,
      offerEquityDetails,
      mode,
      marketResearch,
      leveragePoints,
    });
  }, [
    offerCompany,
    offerRole,
    offerBaseSalary,
    offerEquityDetails,
    mode,
    marketResearch,
    leveragePoints,
    startSimulation,
  ]);

  const handleSubmitResponse = useCallback(
    async (text: string) => {
      setIsSubmitting(true);
      await submitResponse(text);
      setIsSubmitting(false);
    },
    [submitResponse],
  );

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  // Complete
  if (status === 'complete' && summary) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[800px]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors self-start"
        >
          <ArrowLeft size={13} />
          Back to Negotiation Prep
        </button>
        <SummaryView summary={summary} evaluations={evaluations} onReset={handleReset} />
      </div>
    );
  }

  // Error
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors self-start"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <GlassCard className="p-5 border-[var(--badge-red-text)]/20">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-[var(--badge-red-text)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[var(--badge-red-text)] font-medium">Simulation error</p>
              <p className="text-[12px] text-[var(--text-soft)] mt-0.5">{error}</p>
            </div>
          </div>
        </GlassCard>
        <GlassButton variant="ghost" onClick={handleReset} size="sm">
          <ArrowLeft size={14} className="mr-1.5" />
          Try Again
        </GlassButton>
      </div>
    );
  }

  // Idle — launch screen
  if (status === 'idle') {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[640px]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors self-start"
        >
          <ArrowLeft size={13} />
          Back to Negotiation Prep
        </button>

        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--badge-red-text)]/10 p-2.5 border border-[var(--badge-red-text)]/20">
              <Briefcase size={18} className="text-[var(--badge-red-text)]/80" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[var(--text-strong)]">
                Counter-Offer Practice
              </h2>
              <p className="text-[13px] text-[var(--text-soft)]">
                {offerCompany} — {offerRole}
              </p>
            </div>
          </div>

          <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
            Practice your negotiation responses in real time. The employer agent will present
            authentic positions — an offer delivery, a pushback, a final counter. You respond as
            you would in the real conversation. Each round is scored and coached.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
              <div className="text-[20px] font-bold text-[var(--text-strong)]">
                {mode === 'full' ? '4' : '3'}
              </div>
              <div className="text-[12px] text-[var(--text-soft)]">rounds</div>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
              <div className="text-[20px] font-bold text-[var(--text-strong)]">Live</div>
              <div className="text-[12px] text-[var(--text-soft)]">feedback</div>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
              <div className="text-[20px] font-bold text-[var(--text-strong)]">Scored</div>
              <div className="text-[12px] text-[var(--text-soft)]">each round</div>
            </div>
          </div>

          <GlassButton variant="primary" onClick={handleStart} className="w-full justify-center">
            Start Practice Session
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Running / awaiting_response — conversation view
  return (
    <div className="flex flex-col gap-4 p-6 max-w-[800px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          <ArrowLeft size={13} />
        </button>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">
            Counter-Offer Practice
          </h2>
          <p className="text-[12px] text-[var(--text-soft)]">
            {offerCompany} — {offerRole}
          </p>
        </div>
        {(status === 'connecting' || status === 'running') && (
          <Loader2 size={14} className="text-[var(--link)] animate-spin ml-auto" />
        )}
      </div>

      {/* Activity feed while no rounds yet */}
      {evaluations.length === 0 && !currentRound && (
        <GlassCard className="p-4">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {activityMessages.length === 0 ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-soft)]">
                <Loader2 size={12} className="animate-spin" />
                Starting simulation...
              </div>
            ) : (
              activityMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2 text-[13px] text-[var(--text-soft)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--line-strong)] mt-1.5 flex-shrink-0" />
                  {msg.message}
                </div>
              ))
            )}
          </div>
        </GlassCard>
      )}

      {/* Conversation thread */}
      <div className="space-y-6">
        {/* Show completed rounds */}
        {evaluations.map((ev, i) => (
          <div key={i} className="space-y-4">
            <EmployerBubble
              round={{
                index: ev.round_index,
                type: ev.round_type,
                employer_position: ev.employer_position,
              }}
            />
            <div className="flex flex-col gap-2 ml-9">
              <div className="flex items-center gap-2">
                <DollarSign size={12} className="text-[var(--link)]/50" />
                <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--link)]/50">
                  You said
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                "{ev.candidate_response}"
              </p>
            </div>
            <EvaluationInline evaluation={ev} />
          </div>
        ))}

        {/* Current employer position awaiting response */}
        {currentRound && status === 'awaiting_response' && (
          <div className="space-y-4">
            <EmployerBubble round={currentRound} />
            <ResponseInput onSubmit={handleSubmitResponse} isSubmitting={isSubmitting} />
          </div>
        )}

        {/* Running — waiting for next round */}
        {status === 'running' && !currentRound && evaluations.length > 0 && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-soft)]">
            <Loader2 size={13} className="animate-spin text-[var(--link)]" />
            Preparing next round...
          </div>
        )}

        <div ref={conversationEndRef} />
      </div>
    </div>
  );
}
