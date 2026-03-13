import { useState } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Lightbulb,
  Ruler,
  ArrowRight,
  SkipForward,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  GapCoachingCard,
  GapCoachingAction,
  GapCoachingResponse,
  GapClassification,
} from '@/types/resume-v2';

// ─── Per-card local state ────────────────────────────────────────────

interface CardState {
  action: GapCoachingAction | null;
  contextText: string;
  showContextInput: boolean;
}

// ─── Props ───────────────────────────────────────────────────────────

interface GapCoachingCardProps {
  cards: GapCoachingCard[];
  onRespond: (responses: GapCoachingResponse[]) => void;
  disabled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function classificationIcon(c: GapClassification) {
  if (c === 'strong') return <CheckCircle2 className="h-3.5 w-3.5 text-[#b5dec2] shrink-0" />;
  if (c === 'partial') return <AlertTriangle className="h-3.5 w-3.5 text-[#f0d99f] shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-[#f0b8b8] shrink-0" />;
}

function importanceBadge(importance: GapCoachingCard['importance']) {
  if (importance === 'must_have') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-[#f0b8b8]/20 text-[#f0b8b8] border border-[#f0b8b8]/30">
        Must have
      </span>
    );
  }
  if (importance === 'important') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-[#f0d99f]/20 text-[#f0d99f] border border-[#f0d99f]/30">
        Important
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-white/10 text-white/60 border border-white/20">
      Nice to have
    </span>
  );
}

// ─── Collapsed row status config ─────────────────────────────────────

function collapsedStatus(action: GapCoachingAction): {
  dot: React.ReactNode;
  label: string;
  wrapperClass: string;
  labelClass: string;
} {
  if (action === 'approve') {
    return {
      dot: <span className="h-2 w-2 rounded-full bg-[#b5dec2] shrink-0" />,
      label: 'Approved',
      wrapperClass: 'bg-[#b5dec2]/[0.04] border-[#b5dec2]/[0.10]',
      labelClass: 'text-[#b5dec2]',
    };
  }
  if (action === 'context') {
    return {
      dot: <MessageSquare className="h-3 w-3 text-[#afc4ff] shrink-0" />,
      label: 'Context added',
      wrapperClass: 'bg-[#afc4ff]/[0.04] border-[#afc4ff]/[0.10]',
      labelClass: 'text-[#afc4ff]',
    };
  }
  return {
    dot: <Minus className="h-3 w-3 text-white/30 shrink-0" />,
    label: 'Skipped',
    wrapperClass: 'bg-white/[0.02] border-white/[0.06]',
    labelClass: 'text-white/35',
  };
}

// ─── Single coaching card ─────────────────────────────────────────────

interface SingleCardProps {
  card: GapCoachingCard;
  index: number;
  state: CardState;
  onChange: (patch: Partial<CardState>) => void;
  disabled: boolean;
}

function SingleCoachingCard({ card, index, state, onChange, disabled }: SingleCardProps) {
  const isResponded = state.action !== null;

  // Collapsed summary after responding
  if (isResponded) {
    const { dot, label, wrapperClass, labelClass } = collapsedStatus(state.action!);
    return (
      <div
        className={cn(
          'rounded-lg border px-3 py-2.5 flex items-center gap-3 transition-all duration-300',
          wrapperClass,
        )}
        data-coaching-requirement={card.requirement}
      >
        {dot}
        <span className="flex-1 min-w-0 text-sm text-white/50 truncate">{card.requirement}</span>
        <span className={cn('text-xs font-medium shrink-0', labelClass)}>{label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all duration-300"
      data-coaching-requirement={card.requirement}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
        <div className="mt-0.5">{classificationIcon(card.classification)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-white/90 leading-snug">{card.requirement}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {importanceBadge(card.importance)}
              {card.previously_approved && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide bg-[#b5dec2]/20 text-[#b5dec2] border border-[#b5dec2]/30">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                  Previously approved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Coach reasoning bubble */}
      <div className="mx-4 mb-3 flex gap-3">
        {/* Avatar */}
        <div className="shrink-0 mt-0.5 flex flex-col items-center gap-1">
          <div className="h-7 w-7 rounded-full bg-[#afc4ff]/15 border border-[#afc4ff]/30 flex items-center justify-center">
            <span className="text-[9px] font-bold text-[#afc4ff] tracking-tight leading-none">AI</span>
          </div>
          {/* Connector line */}
          <div className="w-px flex-1 bg-[#afc4ff]/10 min-h-[8px]" />
        </div>

        {/* Speech bubble */}
        <div className="flex-1 relative">
          {/* Bubble tail pointing left to avatar */}
          <div
            className="absolute -left-[7px] top-[10px] w-0 h-0"
            style={{
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: '7px solid rgba(175,196,255,0.08)',
            }}
          />
          <div className="rounded-xl border border-[#afc4ff]/[0.12] bg-[#afc4ff]/[0.05] px-3.5 py-3">
            <div className="text-[9px] font-bold text-[#afc4ff]/50 uppercase tracking-widest mb-1.5">
              AI Coach
            </div>
            <p className="text-[14px] text-white/75 leading-[1.7]">{card.ai_reasoning}</p>
          </div>
        </div>
      </div>

      {/* Proposed Strategy — gradient left border */}
      <div className="mx-4 mb-3">
        <div className="relative rounded-lg border border-[#b5dec2]/[0.15] bg-[#b5dec2]/[0.04] pl-4 pr-3 py-2.5 overflow-hidden">
          {/* Gradient left border accent */}
          <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg bg-gradient-to-b from-[#afc4ff] via-[#b5dec2]/60 to-transparent" />

          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="h-3 w-3 text-[#b5dec2]/70 shrink-0" />
            <span className="text-[10px] font-semibold text-[#b5dec2]/70 uppercase tracking-wider">
              Proposed strategy
            </span>
          </div>
          <p className="text-sm text-white/75 leading-relaxed">{card.proposed_strategy}</p>

          {/* Inferred metric */}
          {card.inferred_metric && (
            <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-start gap-1.5">
              <Ruler className="h-3 w-3 text-[#f0d99f]/60 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-[#f0d99f]/80">{card.inferred_metric}</span>
                {card.inference_rationale && (
                  <span className="text-xs text-white/30 ml-1.5">— {card.inference_rationale}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Evidence chips */}
      {card.evidence_found.length > 0 && (
        <div className="mx-4 mb-3">
          <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
            Evidence found
          </div>
          <div className="flex flex-wrap gap-1.5">
            {card.evidence_found.map((e, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-white/60 bg-white/[0.05] border border-white/[0.10] hover:border-white/[0.16] transition-colors"
              >
                <CheckCircle2 className="h-2.5 w-2.5 text-[#b5dec2]/60 shrink-0" />
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Context textarea (shown when "I have more context" is active) */}
      <div
        className={cn(
          'mx-4 overflow-hidden transition-all duration-300',
          state.showContextInput ? 'max-h-40 mb-3 opacity-100' : 'max-h-0 mb-0 opacity-0',
        )}
      >
        <textarea
          value={state.contextText}
          onChange={e => onChange({ contextText: e.target.value })}
          disabled={disabled}
          placeholder="Share any relevant experience, projects, or context that wasn't in your resume…"
          rows={3}
          className="w-full rounded-lg border border-[#afc4ff]/20 bg-[#afc4ff]/[0.04] px-3 py-2 text-sm text-white/80 placeholder-white/25 resize-none focus:outline-none focus:border-[#afc4ff]/40 transition-colors"
          aria-label={`Additional context for: ${card.requirement}`}
        />
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        {/* Approve */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ action: 'approve', showContextInput: false })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 hover:border-[#afc4ff]/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Approve strategy for: ${card.requirement}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Use this strategy
        </button>

        {/* Context toggle / submit */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (state.showContextInput) {
              if (state.contextText.trim()) {
                onChange({ action: 'context', showContextInput: false });
              }
            } else {
              onChange({ showContextInput: true });
            }
          }}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            state.showContextInput
              ? 'bg-[#afc4ff]/15 text-[#afc4ff] border-[#afc4ff]/30 hover:bg-[#afc4ff]/25'
              : 'bg-white/[0.04] text-white/60 border-white/[0.08] hover:bg-white/[0.07] hover:text-white/80',
          )}
          aria-label={
            state.showContextInput
              ? `Submit context for: ${card.requirement}`
              : `Add context for: ${card.requirement}`
          }
          aria-expanded={state.showContextInput}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {state.showContextInput
            ? state.contextText.trim()
              ? 'Submit context'
              : 'Type context above…'
            : 'I have more context'}
        </button>

        {/* Cancel context input */}
        {state.showContextInput && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ showContextInput: false, contextText: '' })}
            className="text-xs text-white/35 hover:text-white/55 transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1"
            aria-label="Cancel adding context"
          >
            Cancel
          </button>
        )}

        {/* Skip */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ action: 'skip', showContextInput: false })}
          title="This gap won't be addressed on your resume. That's OK — your direct matches are strong."
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white/35 border border-transparent hover:text-white/55 hover:border-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            !state.showContextInput && 'ml-auto',
          )}
          aria-label={`Skip gap for: ${card.requirement}`}
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip — leave unaddressed
        </button>
      </div>

      {/* What this means */}
      <div className="px-4 pb-3 -mt-1">
        <p className="text-[11px] text-white/25 leading-relaxed">
          {card.classification === 'missing'
            ? 'Approving lets the AI position adjacent experience to address this gap on your resume.'
            : 'Approving lets the AI strengthen how this requirement is presented using your related experience.'}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function GapCoachingCardList({ cards, onRespond, disabled = false }: GapCoachingCardProps) {
  const [cardStates, setCardStates] = useState<CardState[]>(() =>
    cards.map(() => ({ action: null, contextText: '', showContextInput: false }))
  );

  const allResponded = cardStates.every(s => s.action !== null);
  const respondedCount = cardStates.filter(s => s.action !== null).length;

  function patchState(index: number, patch: Partial<CardState>) {
    setCardStates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function handleContinue() {
    const responses: GapCoachingResponse[] = cards.map((card, i) => {
      const s = cardStates[i];
      const resp: GapCoachingResponse = {
        requirement: card.requirement,
        action: s.action ?? 'skip',
      };
      if (s.action === 'context' && s.contextText.trim()) {
        resp.user_context = s.contextText.trim();
      }
      return resp;
    });
    onRespond(responses);
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-[#afc4ff]" />
        <h3 className="text-sm font-semibold text-white/90">Gap Coaching</h3>
        <span className="ml-auto text-xs text-white/40">
          {respondedCount} / {cards.length} reviewed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#afc4ff] to-[#b5dec2] transition-all duration-500"
          style={{ width: cards.length > 0 ? `${(respondedCount / cards.length) * 100}%` : '0%' }}
        />
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {cards.map((card, i) => (
          <SingleCoachingCard
            key={`${card.requirement}-${i}`}
            card={card}
            index={i}
            state={cardStates[i]}
            onChange={patch => patchState(i, patch)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Continue button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!allResponded || disabled}
          onClick={handleContinue}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed',
            allResponded && !disabled
              ? 'bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 hover:border-[#afc4ff]/35'
              : 'border border-white/[0.06] text-white/30',
          )}
          aria-disabled={!allResponded || disabled}
          aria-label="Continue to resume writing"
        >
          Continue — Start Writing
          <ArrowRight className="h-4 w-4" />
        </button>
        {!allResponded && (
          <p className="text-center text-xs text-white/30 mt-2">
            Review all {cards.length} gaps to continue
          </p>
        )}
        {allResponded && cardStates.every(s => s.action === 'skip') && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 mt-3">
            <p className="text-sm text-white/60">
              Your resume will highlight your direct matches — no inferred positioning will be used.
            </p>
            <p className="text-xs text-white/35 mt-1">
              You can add context anytime to unlock new strategies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
