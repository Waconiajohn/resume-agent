import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import {
  useCounterOfferSim,
  type EmployerPushback,
  type UserResponseEvaluation,
  type SimulationSummary,
} from '@/hooks/useCounterOfferSim';

// ─── Constants ────────────────────────────────────────────────────────────────

const TACTIC_COLORS: Record<string, string> = {
  budget_constraints: 'text-[#dfc797] bg-[#dfc797]/10',
  market_rate: 'text-[#98b3ff] bg-[#98b3ff]/10',
  counter_offer: 'text-[#b5dec2] bg-[#b5dec2]/10',
  delay_tactics: 'text-[#dfc797] bg-[#dfc797]/10',
  lowball: 'text-[#e8a0a0] bg-[#e8a0a0]/10',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-[#b5dec2]';
  if (score >= 60) return 'text-[#dfc797]';
  return 'text-[#e8a0a0]';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-[#b5dec2]';
  if (score >= 60) return 'bg-[#dfc797]';
  return 'bg-[#e8a0a0]';
}

function formatRoundType(roundType: string): string {
  return roundType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-white/40 w-36 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', scoreBg(value))}
          style={{ width: `${value}%`, opacity: 0.7 }}
        />
      </div>
      <span className={cn('text-[11px] font-medium w-8 text-right flex-shrink-0', scoreColor(value))}>
        {value}
      </span>
    </div>
  );
}

function EvaluationCard({
  evaluation,
  roundLabel,
  defaultExpanded,
}: {
  evaluation: UserResponseEvaluation;
  roundLabel: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-[#98b3ff]/80 bg-[#98b3ff]/10 flex-shrink-0">
          {roundLabel}
        </span>
        <span className="text-[13px] text-white/60 flex-1 truncate">{evaluation.user_response}</span>
        <span className={cn('text-[13px] font-semibold flex-shrink-0', scoreColor(evaluation.overall_score))}>
          {evaluation.overall_score}
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-white/25 flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-white/25 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
          {/* Score bars */}
          <div className="space-y-2">
            <ScoreBar label="Confidence" value={evaluation.scores.confidence} />
            <ScoreBar label="Value Anchoring" value={evaluation.scores.value_anchoring} />
            <ScoreBar label="Specificity" value={evaluation.scores.specificity} />
            <ScoreBar label="Collaboration" value={evaluation.scores.collaboration} />
          </div>

          {/* What worked */}
          {evaluation.what_worked.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
                What Worked
              </div>
              <ul className="space-y-1">
                {evaluation.what_worked.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#b5dec2]/50 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-[#b5dec2]/70 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What to improve */}
          {evaluation.what_to_improve.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
                What to Improve
              </div>
              <ul className="space-y-1">
                {evaluation.what_to_improve.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#dfc797]/50 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-[#dfc797]/70 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Coach note */}
          {evaluation.coach_note && (
            <div className="rounded-lg border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-medium text-[#98b3ff]/60 mb-1">Coach Note</div>
              <p className="text-[12px] text-[#98b3ff]/50 leading-relaxed italic">
                {evaluation.coach_note}
              </p>
            </div>
          )}

          {/* Response preview */}
          <div>
            <div className="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-1.5">
              Your Response
            </div>
            <p className="text-[12px] text-white/30 leading-relaxed italic line-clamp-3">
              {evaluation.user_response}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PushbackCard({ pushback }: { pushback: EmployerPushback }) {
  const tacticKey = pushback.employer_tactic.toLowerCase().replace(/\s+/g, '_');
  return (
    <div className="space-y-3">
      {/* Round + tactic header */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-white/50">
          Round {pushback.round}
        </span>
        <span className="text-white/20">·</span>
        <span
          className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-full capitalize',
            TACTIC_COLORS[tacticKey] ?? 'text-white/40 bg-white/[0.06]',
          )}
        >
          {pushback.employer_tactic}
        </span>
      </div>

      {/* Employer statement — warm "other person talking" styling */}
      <GlassCard className="p-5 border-[#dfc797]/20 bg-[#dfc797]/[0.03]">
        <div className="text-[11px] font-medium text-[#dfc797]/50 uppercase tracking-wider mb-3">
          Employer says
        </div>
        <blockquote className="text-[15px] text-white/80 leading-relaxed font-medium">
          "{pushback.employer_statement}"
        </blockquote>
      </GlassCard>

      {/* Coaching hint — subtle whisper */}
      {pushback.coaching_hint && (
        <div className="flex items-start gap-2 px-1">
          <div className="h-1 w-1 rounded-full bg-[#98b3ff]/30 mt-2 flex-shrink-0" />
          <p className="text-[12px] text-[#98b3ff]/50 italic leading-relaxed">
            {pushback.coaching_hint}
          </p>
        </div>
      )}
    </div>
  );
}

function ConnectingView({
  activityMessages,
  offerCompany,
}: {
  activityMessages: { id: string; text: string; stage: string; timestamp: number }[];
  offerCompany: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  return (
    <GlassCard className="p-8 flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl bg-[#dfc797]/10 p-4">
          <Loader2 size={28} className="text-[#dfc797] animate-spin" />
        </div>
        <h3 className="text-[16px] font-semibold text-white/85">Setting up negotiation scenario...</h3>
        <p className="text-[13px] text-white/40 text-center">
          {offerCompany
            ? `Preparing your counter-offer practice with ${offerCompany}`
            : 'Analyzing the offer and building your negotiation scenario'}
        </p>
      </div>

      {activityMessages.length > 0 && (
        <div className="w-full space-y-1.5 max-h-[200px] overflow-y-auto">
          {activityMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 py-0.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#dfc797]/40 mt-1.5 flex-shrink-0" />
              <span className="text-[12px] text-white/45 leading-relaxed">{msg.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </GlassCard>
  );
}

function SummaryView({
  summary,
  evaluations,
  onBack,
  onTryAgain,
}: {
  summary: SimulationSummary;
  evaluations: UserResponseEvaluation[];
  onBack: () => void;
  onTryAgain: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary card */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div
            className={cn(
              'text-[48px] font-bold leading-none',
              scoreColor(summary.overall_score),
            )}
          >
            {summary.overall_score}
          </div>
          <div>
            <div className="text-[15px] font-semibold text-white/85">Overall Score</div>
            <div className="text-[12px] text-white/40">
              {summary.total_rounds} round{summary.total_rounds !== 1 ? 's' : ''} completed
              {summary.best_round > 0 && ` · Best: Round ${summary.best_round}`}
            </div>
          </div>
          <div
            className={cn(
              'ml-auto text-[11px] font-medium px-3 py-1 rounded-full',
              summary.overall_score >= 80
                ? 'text-[#b5dec2] bg-[#b5dec2]/10'
                : summary.overall_score >= 60
                  ? 'text-[#dfc797] bg-[#dfc797]/10'
                  : 'text-[#e8a0a0] bg-[#e8a0a0]/10',
            )}
          >
            {summary.overall_score >= 80
              ? 'Strong Negotiator'
              : summary.overall_score >= 60
                ? 'Good Foundation'
                : 'Needs Practice'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Strengths */}
          <div>
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
              Strengths
            </div>
            <ul className="space-y-1.5">
              {summary.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-[#b5dec2] mt-0.5 flex-shrink-0" />
                  <span className="text-[12px] text-[#b5dec2]/70 leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Areas for improvement */}
          <div>
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
              Areas for Improvement
            </div>
            <ul className="space-y-1.5">
              {summary.areas_for_improvement.map((area, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#dfc797]/50 mt-1.5 flex-shrink-0" />
                  <span className="text-[12px] text-[#dfc797]/70 leading-relaxed">{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recommendation */}
        {summary.recommendation && (
          <div className="rounded-lg border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-4 py-3">
            <div className="text-[11px] font-medium text-[#98b3ff]/60 mb-1">Recommendation</div>
            <p className="text-[13px] text-[#98b3ff]/60 leading-relaxed">{summary.recommendation}</p>
          </div>
        )}
      </GlassCard>

      {/* Round-by-round evaluations */}
      {evaluations.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-white/40 uppercase tracking-wider px-1">
            Round by Round
          </div>
          {evaluations.map((ev, i) => (
            <EvaluationCard
              key={i}
              evaluation={ev}
              roundLabel={`Round ${ev.round}`}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <GlassButton variant="ghost" onClick={onBack} className="flex-1 text-[13px]">
          <ArrowLeft size={14} className="mr-1.5" />
          Back to Salary Negotiation
        </GlassButton>
        <GlassButton variant="primary" onClick={onTryAgain} className="flex-1 text-[13px]">
          Try Again
        </GlassButton>
      </div>
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CounterOfferViewProps {
  mode: 'full' | 'single_round';
  roundType?: string;
  resumeText: string;
  offerCompany: string;
  offerRole: string;
  offerBaseSalary?: number;
  offerTotalComp?: number;
  targetSalary?: number;
  onBack: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CounterOfferView({
  mode,
  roundType,
  resumeText,
  offerCompany,
  offerRole,
  offerBaseSalary,
  offerTotalComp,
  targetSalary,
  onBack,
}: CounterOfferViewProps) {
  const {
    status,
    currentPushback,
    evaluations,
    summary,
    error,
    activityMessages,
    startSimulation,
    submitResponse,
    reset,
  } = useCounterOfferSim();

  const [response, setResponse] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [showPreviousEvals, setShowPreviousEvals] = useState(false);

  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      void startSimulation({
        resumeText,
        offerCompany,
        offerRole,
        offerBaseSalary,
        offerTotalComp,
        targetSalary,
        mode,
        roundType,
      });
    }
  }, [
    hasStarted,
    startSimulation,
    resumeText,
    offerCompany,
    offerRole,
    offerBaseSalary,
    offerTotalComp,
    targetSalary,
    mode,
    roundType,
  ]);

  // Clear response when a new pushback arrives
  useEffect(() => {
    if (status === 'waiting_for_response') {
      setResponse('');
    }
  }, [currentPushback, status]);

  const handleSubmit = () => {
    if (!response.trim()) return;
    void submitResponse(response);
  };

  const handleTryAgain = () => {
    reset();
    setResponse('');
    setHasStarted(false);
    setShowPreviousEvals(false);
  };

  const sessionLabel = mode === 'single_round'
    ? `Quick Round${roundType ? ` — ${formatRoundType(roundType)}` : ''}`
    : 'Counter-Offer Simulation';

  // ─── Complete view ──────────────────────────────────────────────────────────

  if (status === 'complete' && summary) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Salary Negotiation
          </button>
          <span className="text-white/20">/</span>
          <span className="text-[13px] text-white/50">{sessionLabel} — Complete</span>
        </div>

        <SummaryView
          summary={summary}
          evaluations={evaluations}
          onBack={onBack}
          onTryAgain={handleTryAgain}
        />
      </div>
    );
  }

  // ─── Error view ─────────────────────────────────────────────────────────────

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          Back to Salary Negotiation
        </button>

        <GlassCard className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[#e8a0a0] flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[14px] font-medium text-[#e8a0a0] mb-1">Session Error</div>
              <p className="text-[13px] text-white/50">{error}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <GlassButton variant="ghost" onClick={onBack} className="text-[12px]">
              <ArrowLeft size={14} className="mr-1.5" />
              Back
            </GlassButton>
            <GlassButton variant="primary" onClick={handleTryAgain} className="text-[12px]">
              Try Again
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ─── Connecting / initial running view ─────────────────────────────────────

  if (status === 'connecting' || (status === 'running' && !currentPushback)) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">{sessionLabel}</h1>
          <p className="text-[13px] text-white/40">
            {offerCompany ? `Preparing scenario for ${offerCompany}...` : 'Setting up your negotiation practice...'}
          </p>
        </div>

        <ConnectingView activityMessages={activityMessages} offerCompany={offerCompany} />

        <div className="flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel and return
          </button>
        </div>
      </div>
    );
  }

  // ─── Active simulation view ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold text-white/90">{sessionLabel}</h1>
          {offerRole && (
            <p className="text-[13px] text-white/40">
              {offerRole}{offerCompany ? ` at ${offerCompany}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/55 transition-colors"
        >
          <ArrowLeft size={13} />
          Exit
        </button>
      </div>

      {/* Pushback card */}
      {currentPushback && <PushbackCard pushback={currentPushback} />}

      {/* Response area */}
      {(status === 'waiting_for_response' || status === 'evaluating') && currentPushback && (
        <GlassCard className="p-6">
          {status === 'evaluating' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Loader2 size={16} className="text-[#dfc797] animate-spin" />
                <span className="text-[13px] text-white/50">Evaluating your response...</span>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-[13px] text-white/35 leading-relaxed whitespace-pre-wrap">
                  {response}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider block mb-2">
                  Your Response
                </label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="How do you respond to this? Acknowledge their position, then make your case with data and value..."
                  rows={5}
                  className={cn(
                    'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3',
                    'text-[13px] text-white/75 placeholder:text-white/20 leading-relaxed',
                    'focus:outline-none focus:border-[#dfc797]/30 resize-y',
                  )}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-white/25">
                    Tip: Stay collaborative, anchor to your value, and use market data
                  </span>
                  <span className="text-[11px] text-white/25">{response.length} chars</span>
                </div>
              </div>

              <GlassButton
                variant="primary"
                onClick={handleSubmit}
                disabled={!response.trim()}
                className="self-end text-[13px] px-6"
              >
                Submit Response
              </GlassButton>
            </div>
          )}
        </GlassCard>
      )}

      {/* Previous evaluations (collapsible) */}
      {evaluations.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPreviousEvals((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-white/35 hover:text-white/55 transition-colors mb-2"
          >
            {showPreviousEvals ? (
              <ChevronUp size={13} />
            ) : (
              <ChevronDown size={13} />
            )}
            {evaluations.length} previous round{evaluations.length !== 1 ? 's' : ''} evaluated
          </button>

          {showPreviousEvals && (
            <div className="space-y-2">
              {evaluations.map((ev, i) => (
                <EvaluationCard
                  key={i}
                  evaluation={ev}
                  roundLabel={`Round ${ev.round}`}
                  defaultExpanded={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
