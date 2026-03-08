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
  useMockInterview,
  type AnswerEvaluation,
  type InterviewQuestion,
  type SimulationSummary,
} from '@/hooks/useMockInterview';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  behavioral: 'text-[#98b3ff] bg-[#98b3ff]/10',
  technical: 'text-[#b5dec2] bg-[#b5dec2]/10',
  situational: 'text-[#dfc797] bg-[#dfc797]/10',
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-white/40 w-32 flex-shrink-0">{label}</span>
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
  defaultExpanded,
}: {
  evaluation: AnswerEvaluation;
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
        <span
          className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0',
            CATEGORY_COLORS[evaluation.question_type] ?? 'text-white/40 bg-white/[0.06]',
          )}
        >
          {evaluation.question_type}
        </span>
        <span className="text-[13px] text-white/60 flex-1 truncate">{evaluation.question}</span>
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
            <ScoreBar label="STAR Completeness" value={evaluation.scores.star_completeness} />
            <ScoreBar label="Relevance" value={evaluation.scores.relevance} />
            <ScoreBar label="Impact" value={evaluation.scores.impact} />
            <ScoreBar label="Specificity" value={evaluation.scores.specificity} />
          </div>

          {/* Strengths */}
          {evaluation.strengths.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
                Strengths
              </div>
              <ul className="space-y-1">
                {evaluation.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#b5dec2]/50 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-[#b5dec2]/70 leading-relaxed">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {evaluation.improvements.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
                Areas for Improvement
              </div>
              <ul className="space-y-1">
                {evaluation.improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#dfc797]/50 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-[#dfc797]/70 leading-relaxed">{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Model answer hint */}
          {evaluation.model_answer_hint && (
            <div className="rounded-lg border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-medium text-[#98b3ff]/60 mb-1">Coaching Tip</div>
              <p className="text-[12px] text-[#98b3ff]/50 leading-relaxed">
                {evaluation.model_answer_hint}
              </p>
            </div>
          )}

          {/* Answer preview */}
          <div>
            <div className="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-1.5">
              Your Answer
            </div>
            <p className="text-[12px] text-white/30 leading-relaxed italic line-clamp-3">
              {evaluation.answer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  totalQuestions,
  mode,
}: {
  question: InterviewQuestion;
  totalQuestions?: number;
  mode: 'full' | 'practice';
}) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <span
          className={cn(
            'text-[11px] font-medium px-2.5 py-1 rounded-full capitalize',
            CATEGORY_COLORS[question.type] ?? 'text-white/40 bg-white/[0.06]',
          )}
        >
          {question.type}
        </span>
        {mode === 'full' && totalQuestions !== undefined && (
          <span className="text-[12px] text-white/35 ml-auto">
            Question {question.index + 1} of {totalQuestions}
          </span>
        )}
      </div>
      <p className="text-[16px] font-medium text-white/85 leading-relaxed">{question.question}</p>
      {question.context && (
        <p className="mt-3 text-[13px] text-white/40 leading-relaxed italic">{question.context}</p>
      )}
    </GlassCard>
  );
}

function ConnectingView({
  activityMessages,
}: {
  activityMessages: { id: string; text: string; stage: string; timestamp: number }[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  return (
    <GlassCard className="p-8 flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl bg-[#98b3ff]/10 p-4">
          <Loader2 size={28} className="text-[#98b3ff] animate-spin" />
        </div>
        <h3 className="text-[16px] font-semibold text-white/85">Preparing your interview...</h3>
        <p className="text-[13px] text-white/40 text-center">
          Analyzing your resume and generating tailored questions
        </p>
      </div>

      {activityMessages.length > 0 && (
        <div className="w-full space-y-1.5 max-h-[200px] overflow-y-auto">
          {activityMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 py-0.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#98b3ff]/40 mt-1.5 flex-shrink-0" />
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
  evaluations: AnswerEvaluation[];
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
              {summary.total_questions} question{summary.total_questions !== 1 ? 's' : ''} answered
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
              ? 'Strong Performance'
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

      {/* Individual evaluations */}
      {evaluations.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-white/40 uppercase tracking-wider px-1">
            Question by Question
          </div>
          {evaluations.map((ev, i) => (
            <EvaluationCard key={i} evaluation={ev} defaultExpanded={false} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <GlassButton variant="ghost" onClick={onBack} className="flex-1 text-[13px]">
          <ArrowLeft size={14} className="mr-1.5" />
          Back to Interview Lab
        </GlassButton>
        <GlassButton variant="primary" onClick={onTryAgain} className="flex-1 text-[13px]">
          Try Again
        </GlassButton>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MockInterviewViewProps {
  mode: 'full' | 'practice';
  questionType?: 'behavioral' | 'technical' | 'situational';
  resumeText: string;
  jobDescription?: string;
  companyName?: string;
  onBack: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MockInterviewView({
  mode,
  questionType,
  resumeText,
  jobDescription,
  companyName,
  onBack,
}: MockInterviewViewProps) {
  const {
    status,
    currentQuestion,
    evaluations,
    summary,
    error,
    activityMessages,
    startSimulation,
    submitAnswer,
    reset,
  } = useMockInterview();

  const [answer, setAnswer] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [showPreviousEvals, setShowPreviousEvals] = useState(false);

  // Must match server's interviewer agent max_questions for 'full' mode
  // See: server/src/agents/interview-prep/simulation/interviewer/agent.ts
  const FULL_MODE_TOTAL = 6;

  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      void startSimulation({
        resumeText,
        jobDescription,
        companyName,
        mode,
        questionType,
      });
    }
  }, [hasStarted, startSimulation, resumeText, jobDescription, companyName, mode, questionType]);

  // Clear answer when a new question arrives
  useEffect(() => {
    if (status === 'waiting_for_answer') {
      setAnswer('');
    }
  }, [currentQuestion, status]);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    void submitAnswer(answer);
  };

  const handleTryAgain = () => {
    reset();
    setAnswer('');
    setHasStarted(false);
    setShowPreviousEvals(false);
  };

  // ─── Complete view ────────────────────────────────────────────────────────

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
            Back to Interview Lab
          </button>
          <span className="text-white/20">/</span>
          <span className="text-[13px] text-white/50">
            {mode === 'practice' ? 'Practice Session' : 'Mock Interview'} — Complete
          </span>
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

  // ─── Error view ───────────────────────────────────────────────────────────

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          Back to Interview Lab
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
              Back to Lab
            </GlassButton>
            <GlassButton variant="primary" onClick={handleTryAgain} className="text-[12px]">
              Try Again
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ─── Connecting / initial running view ───────────────────────────────────

  if (status === 'connecting' || (status === 'running' && !currentQuestion)) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">
            {mode === 'practice' ? 'Practice Session' : 'Mock Interview'}
          </h1>
          <p className="text-[13px] text-white/40">
            {companyName ? `Preparing for ${companyName}...` : 'Setting up your interview session...'}
          </p>
        </div>

        <ConnectingView activityMessages={activityMessages} />

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

  // ─── Active interview view ────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold text-white/90">
            {mode === 'practice' ? 'Practice Session' : 'Mock Interview'}
          </h1>
          {companyName && (
            <p className="text-[13px] text-white/40">{companyName}</p>
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

      {/* Question card */}
      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          totalQuestions={mode === 'full' ? FULL_MODE_TOTAL : undefined}
          mode={mode}
        />
      )}

      {/* Answer area */}
      {(status === 'waiting_for_answer' || status === 'evaluating') && currentQuestion && (
        <GlassCard className="p-6">
          {status === 'evaluating' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Loader2 size={16} className="text-[#98b3ff] animate-spin" />
                <span className="text-[13px] text-white/50">Evaluating your answer...</span>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-[13px] text-white/35 leading-relaxed whitespace-pre-wrap">
                  {answer}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider block mb-2">
                  Your Answer
                </label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer here. Use the STAR method: Situation, Task, Action, Result..."
                  rows={5}
                  className={cn(
                    'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3',
                    'text-[13px] text-white/75 placeholder:text-white/20 leading-relaxed',
                    'focus:outline-none focus:border-[#98b3ff]/30 resize-y',
                  )}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-white/25">
                    Tip: Aim for 150-300 words with specific examples and metrics
                  </span>
                  <span className="text-[11px] text-white/25">{answer.length} chars</span>
                </div>
              </div>

              <GlassButton
                variant="primary"
                onClick={handleSubmit}
                disabled={!answer.trim()}
                className="self-end text-[13px] px-6"
              >
                Submit Answer
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
            {evaluations.length} previous answer{evaluations.length !== 1 ? 's' : ''} evaluated
          </button>

          {showPreviousEvals && (
            <div className="space-y-2">
              {evaluations.map((ev, i) => (
                <EvaluationCard key={i} evaluation={ev} defaultExpanded={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
