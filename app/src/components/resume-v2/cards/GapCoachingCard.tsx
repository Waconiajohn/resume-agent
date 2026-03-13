import { useState } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Ruler,
  ArrowRight,
  SkipForward,
} from 'lucide-react';
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
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-[#f0b8b8]/10 text-[#f0b8b8] border border-[#f0b8b8]/20">
        Must have
      </span>
    );
  }
  if (importance === 'important') {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-[#f0d99f]/10 text-[#f0d99f] border border-[#f0d99f]/20">
        Important
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-white/[0.06] text-white/40 border border-white/[0.06]">
      Nice to have
    </span>
  );
}

function actionLabel(action: GapCoachingAction): string {
  if (action === 'approve') return 'Strategy approved';
  if (action === 'context') return 'Added context';
  return 'Marked as gap';
}

function actionColor(action: GapCoachingAction): string {
  if (action === 'approve') return 'text-[#b5dec2]';
  if (action === 'context') return 'text-[#afc4ff]';
  return 'text-white/40';
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
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 flex items-center gap-3">
        {classificationIcon(card.classification)}
        <span className="flex-1 min-w-0 text-sm text-white/50 truncate">{card.requirement}</span>
        <span className={`text-xs shrink-0 ${actionColor(state.action!)}`}>
          {actionLabel(state.action!)}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
        <div className="mt-0.5">{classificationIcon(card.classification)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-white/90 leading-snug">{card.requirement}</span>
            {importanceBadge(card.importance)}
          </div>
        </div>
      </div>

      {/* AI Reasoning — conversation bubble */}
      <div className="mx-4 mb-3 flex gap-2.5">
        <div className="shrink-0 mt-0.5">
          <div className="h-5 w-5 rounded-full bg-[#afc4ff]/10 border border-[#afc4ff]/20 flex items-center justify-center">
            <MessageSquare className="h-2.5 w-2.5 text-[#afc4ff]" />
          </div>
        </div>
        <div className="flex-1 rounded-lg border border-[#afc4ff]/[0.12] bg-[#afc4ff]/[0.04] px-3 py-2.5">
          <div className="text-[10px] font-medium text-[#afc4ff]/60 uppercase tracking-wider mb-1">
            AI Coach
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{card.ai_reasoning}</p>
        </div>
      </div>

      {/* Proposed Strategy */}
      <div className="mx-4 mb-3">
        <div className="rounded-lg border border-[#b5dec2]/[0.15] bg-[#b5dec2]/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="h-3 w-3 text-[#b5dec2]/70 shrink-0" />
            <span className="text-[10px] font-medium text-[#b5dec2]/70 uppercase tracking-wider">
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
          <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1.5">
            Evidence found
          </div>
          <div className="flex flex-wrap gap-1.5">
            {card.evidence_found.map((e, i) => (
              <span
                key={i}
                className="inline-block rounded px-2 py-0.5 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06]"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Context textarea (shown when "I have more context" is active) */}
      {state.showContextInput && (
        <div className="mx-4 mb-3">
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
      )}

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

        {/* Context */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (state.showContextInput) {
              // Confirm: submit with context
              if (state.contextText.trim()) {
                onChange({ action: 'context', showContextInput: false });
              }
            } else {
              onChange({ showContextInput: true });
            }
          }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            state.showContextInput
              ? 'bg-[#afc4ff]/15 text-[#afc4ff] border-[#afc4ff]/30 hover:bg-[#afc4ff]/25'
              : 'bg-white/[0.04] text-white/60 border-white/[0.08] hover:bg-white/[0.07] hover:text-white/80'
          }`}
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

        {/* Skip */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ action: 'skip', showContextInput: false })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white/35 border border-transparent hover:text-white/55 hover:border-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          aria-label={`Skip gap for: ${card.requirement}`}
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip — it's a real gap
        </button>
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
          className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
            allResponded && !disabled
              ? 'bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 hover:border-[#afc4ff]/35'
              : 'border border-white/[0.06] text-white/30'
          }`}
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
      </div>
    </div>
  );
}
