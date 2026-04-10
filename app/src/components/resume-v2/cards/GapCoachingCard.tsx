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
  selectedAlternativeIndex: number | null;
  editMode: 'none' | 'edit-alternative' | 'write-own';
  editedText: string;
}

// ─── Props ───────────────────────────────────────────────────────────

interface GapCoachingCardProps {
  cards: GapCoachingCard[];
  onRespond: (responses: GapCoachingResponse[]) => void;
  disabled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function classificationIcon(c: GapClassification) {
  if (c === 'strong') return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--badge-green-text)] shrink-0" />;
  if (c === 'partial') return <AlertTriangle className="h-3.5 w-3.5 text-[var(--badge-amber-text)] shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-[var(--badge-red-text)] shrink-0" />;
}

function importanceBadge(importance: GapCoachingCard['importance']) {
  if (importance === 'must_have') {
    return (
      <span className="inline-flex items-center border-l-2 px-2.5 py-1 text-[12px] font-semibold tracking-[0.16em] uppercase bg-[var(--badge-red-bg)] text-[var(--badge-red-text)] border border-[var(--badge-red-text)]/30">
        Must Have
      </span>
    );
  }
  if (importance === 'important') {
    return (
      <span className="inline-flex items-center border-l-2 px-2.5 py-1 text-[12px] font-semibold tracking-[0.16em] uppercase bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border border-[var(--badge-amber-text)]/30">
        Important
      </span>
    );
  }
  return (
    <span className="inline-flex items-center border-l-2 px-2.5 py-1 text-[12px] font-semibold tracking-[0.16em] uppercase bg-[var(--surface-1)] text-[var(--text-soft)] border border-[var(--line-strong)]">
      Nice to Have
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
      dot: <span className="h-2 w-2 bg-[var(--badge-green-text)] shrink-0" />,
      label: 'Approved',
      wrapperClass: 'bg-[var(--badge-green-bg)] border-[var(--badge-green-text)]/10',
      labelClass: 'text-[var(--badge-green-text)]',
    };
  }
  if (action === 'context') {
    return {
      dot: <MessageSquare className="h-3 w-3 text-[var(--link)] shrink-0" />,
      label: 'Context added',
      wrapperClass: 'bg-[var(--badge-blue-bg)] border-[var(--link)]/10',
      labelClass: 'text-[var(--link)]',
    };
  }
  return {
    dot: <Minus className="h-3 w-3 text-[var(--text-soft)] shrink-0" />,
    label: 'Skipped',
    wrapperClass: 'bg-[var(--accent-muted)] border-[var(--line-soft)]',
    labelClass: 'text-[var(--text-soft)]',
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

function SingleCoachingCard({ card, index: _index, state, onChange, disabled }: SingleCardProps) {
  const isResponded = state.action !== null;

  // Collapsed summary after responding
  if (isResponded) {
    const { dot, label, wrapperClass, labelClass } = collapsedStatus(state.action!);
    return (
      <div
        className={cn(
          'support-callout flex items-center gap-3 rounded-[12px] border px-3 py-2.5 transition-all duration-300',
          wrapperClass,
        )}
        data-coaching-requirement={card.requirement}
      >
        {dot}
        <span className="flex-1 min-w-0 text-sm text-[var(--text-soft)] truncate">{card.requirement}</span>
        <span className={cn('text-xs font-medium shrink-0', labelClass)}>{label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-soft)] shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="shell-panel overflow-hidden transition-all duration-300"
      data-coaching-requirement={card.requirement}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
        <div className="mt-0.5">{classificationIcon(card.classification)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text-strong)] leading-snug">{card.requirement}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {importanceBadge(card.importance)}
              {card.previously_approved && (
                <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold tracking-[0.12em] uppercase bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/30">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                  Previously approved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* JD context — what requirement this addresses and why */}
      {card.source_evidence && (
        <div className="mx-4 mb-3 rounded-[12px] border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3.5 py-2.5">
          <div className="text-[12px] font-bold text-[var(--text-soft)] uppercase tracking-widest mb-1">
            {card.source === 'benchmark' ? 'From the benchmark profile' : 'From the job description'}
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed italic">&ldquo;{card.source_evidence}&rdquo;</p>
        </div>
      )}

      {/* Coach reasoning bubble */}
      <div className="mx-4 mb-3 flex gap-3">
        {/* Avatar */}
        <div className="shrink-0 mt-0.5 flex flex-col items-center gap-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-[var(--link)]/30 bg-[var(--link)]/15">
            <MessageSquare className="h-3.5 w-3.5 text-[var(--link)]" />
          </div>
          {/* Connector line */}
          <div className="w-px flex-1 bg-[var(--link)]/10 min-h-[8px]" />
        </div>

        {/* Speech bubble */}
        <div className="flex-1 relative">
          {/* Bubble tail pointing left to avatar */}
          <div
            className="absolute -left-[7px] top-[10px] w-0 h-0"
            style={{
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: '7px solid color-mix(in srgb, var(--link) 8%, transparent)',
            }}
          />
          <div className="support-callout border border-[var(--link)]/12 bg-[var(--badge-blue-bg)] px-3.5 py-3">
            <div className="text-[12px] font-bold text-[var(--link)]/50 uppercase tracking-widest mb-1.5">
              Coach note
            </div>
            <p className="text-[14px] text-[var(--text-muted)] leading-[1.7]">{card.ai_reasoning}</p>
          </div>
        </div>
      </div>

      {/* Proposed Strategy — gradient left border */}
      <div className="mx-4 mb-3">
        <div className="relative overflow-hidden rounded-[12px] border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-bg)] pl-4 pr-3 py-2.5">
          {/* Gradient left border accent */}
          <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg bg-gradient-to-b from-[var(--link)] via-[var(--badge-green-text)]/60 to-transparent" />

          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="h-3 w-3 text-[var(--badge-green-text)]/70 shrink-0" />
            <span className="text-[12px] font-semibold text-[var(--badge-green-text)]/70 uppercase tracking-wider">
              Proposed strategy
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{card.proposed_strategy}</p>

          {/* Inferred metric */}
          {card.inferred_metric && (
            <div className="mt-2 pt-2 border-t border-[var(--line-soft)] flex items-start gap-1.5">
              <Ruler className="h-3 w-3 text-[var(--badge-amber-text)]/60 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-[var(--badge-amber-text)]/80">{card.inferred_metric}</span>
                {card.inference_rationale && (
                  <span className="text-xs text-[var(--text-soft)] ml-1.5">— {card.inference_rationale}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Evidence chips */}
      {card.evidence_found.length > 0 && (
        <div className="mx-4 mb-3">
          <div className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-2">
            Evidence found
          </div>
          <div className="flex flex-wrap gap-1.5">
            {card.evidence_found.map((e, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-xs text-[var(--text-soft)] bg-[var(--surface-1)] border border-[var(--line-soft)] hover:border-[var(--line-strong)] transition-colors"
              >
                <CheckCircle2 className="h-2.5 w-2.5 text-[var(--badge-green-text)]/60 shrink-0" />
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alternative bullets picker */}
      {card.alternative_bullets && card.alternative_bullets.length > 0 && (
        <div className="mx-4 mb-3">
          <div className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-2">
            Alternative phrasings
          </div>
          <div className="space-y-1.5">
            {card.alternative_bullets.map((alt, altIdx) => (
              <button
                key={altIdx}
                type="button"
                disabled={disabled}
                onClick={() => onChange({
                  selectedAlternativeIndex: state.selectedAlternativeIndex === altIdx ? null : altIdx,
                  editMode: 'none',
                  editedText: '',
                })}
                className={cn(
                  'w-full text-left rounded-[10px] border px-3 py-2 transition-colors',
                  state.selectedAlternativeIndex === altIdx
                    ? 'border-[var(--link)]/40 bg-[var(--badge-blue-bg)]'
                    : 'border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[var(--line-strong)]',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={cn(
                    'mt-1 h-3 w-3 shrink-0 rounded-full border-2 transition-colors',
                    state.selectedAlternativeIndex === altIdx
                      ? 'border-[var(--link)] bg-[var(--link)]'
                      : 'border-[var(--text-soft)]',
                  )} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                      {alt.angle}
                    </span>
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed mt-0.5">{alt.text}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edit textarea (shown when editing an alternative or writing own) */}
      <div
        className={cn(
          'mx-4 overflow-hidden transition-all duration-300',
          state.editMode !== 'none' ? 'max-h-40 mb-3 opacity-100' : 'max-h-0 mb-0 opacity-0',
        )}
      >
        <textarea
          value={state.editedText}
          onChange={e => onChange({ editedText: e.target.value })}
          disabled={disabled}
          placeholder={state.editMode === 'write-own' ? 'Write your own bullet…' : 'Edit the selected alternative…'}
          rows={3}
          className="w-full rounded-[12px] border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-3 py-2 text-sm text-[var(--text-strong)] placeholder-[var(--text-soft)] resize-none focus:outline-none focus:border-[var(--link)]/40 transition-colors"
          aria-label={`Edit bullet for: ${card.requirement}`}
        />
      </div>

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
          className="w-full rounded-[12px] border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-3 py-2 text-sm text-[var(--text-strong)] placeholder-[var(--text-soft)] resize-none focus:outline-none focus:border-[var(--link)]/40 transition-colors"
          aria-label={`Additional context for: ${card.requirement}`}
        />
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        {/* Use selected alternative */}
        {state.selectedAlternativeIndex !== null && state.editMode === 'none' && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const alt = card.alternative_bullets?.[state.selectedAlternativeIndex!];
              onChange({ action: 'approve', contextText: alt?.text ?? '', showContextInput: false });
            }}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/25 hover:border-[var(--badge-green-text)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Use selected alternative for: ${card.requirement}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Use this one
          </button>
        )}

        {/* Edit selected alternative */}
        {state.selectedAlternativeIndex !== null && state.editMode === 'none' && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const alt = card.alternative_bullets?.[state.selectedAlternativeIndex!];
              onChange({ editMode: 'edit-alternative', editedText: alt?.text ?? '' });
            }}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--surface-1)] text-[var(--text-soft)] border border-[var(--line-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Edit
          </button>
        )}

        {/* Submit edited text */}
        {state.editMode !== 'none' && (
          <>
            <button
              type="button"
              disabled={disabled || !state.editedText.trim()}
              onClick={() => onChange({ action: 'approve', contextText: state.editedText.trim(), showContextInput: false })}
              className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/30 hover:bg-[var(--link)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {state.editedText.trim() ? 'Use this' : 'Type above…'}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ editMode: 'none', editedText: '' })}
              className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors px-1"
            >
              Cancel
            </button>
          </>
        )}

        {/* Approve proposed strategy (when no alternatives or none selected) */}
        {!card.alternative_bullets?.length && state.selectedAlternativeIndex === null && state.editMode === 'none' && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ action: 'approve', showContextInput: false })}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/20 hover:bg-[var(--link)]/20 hover:border-[var(--link)]/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Approve strategy for: ${card.requirement}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Use this strategy
          </button>
        )}

        {/* Write my own */}
        {state.editMode === 'none' && !state.showContextInput && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ editMode: 'write-own', editedText: '', selectedAlternativeIndex: null })}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--surface-1)] text-[var(--text-soft)] border border-[var(--line-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Write my own
          </button>
        )}

        {/* Legacy: Context toggle / submit (kept for cards without alternatives) */}
        {!card.alternative_bullets?.length && state.editMode === 'none' && (
        <>
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
            'flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            state.showContextInput
              ? 'bg-[var(--badge-blue-bg)] text-[var(--link)] border-[var(--link)]/30 hover:bg-[var(--link)]/25'
              : 'bg-[var(--surface-1)] text-[var(--text-soft)] border-[var(--line-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)]',
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
            className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1"
            aria-label="Cancel adding context"
          >
            Cancel
          </button>
        )}
        </>
        )}

        {/* Skip */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ action: 'skip', showContextInput: false })}
          title="This gap won't be addressed on your resume. That's OK — your direct matches are strong."
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-soft)] border border-transparent hover:text-[var(--text-muted)] hover:border-[var(--line-soft)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
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
        <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
          {card.classification === 'missing'
            ? 'Approving lets us position adjacent experience to address this gap on your resume.'
            : 'Approving lets us strengthen how this requirement is presented using your related experience.'}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function GapCoachingCardList({ cards, onRespond, disabled = false }: GapCoachingCardProps) {
  const [cardStates, setCardStates] = useState<CardState[]>(() =>
    cards.map(() => ({
      action: null,
      contextText: '',
      showContextInput: false,
      selectedAlternativeIndex: null,
      editMode: 'none' as const,
      editedText: '',
    }))
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
      if (s.action === 'approve' && s.contextText.trim()) {
        // User selected an alternative bullet — pass the text
        resp.user_context = s.contextText.trim();
      } else if (s.action === 'context') {
        // User edited or wrote their own — pass the edited text or context
        resp.user_context = (s.editedText.trim() || s.contextText.trim()) || undefined;
      }
      return resp;
    });
    onRespond(responses);
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-[var(--link)]" />
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">Gap Coaching</h3>
        <span className="ml-auto text-xs text-[var(--text-soft)]">
          {respondedCount} / {cards.length} reviewed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden bg-[var(--surface-1)]">
        <div
          className="h-full bg-gradient-to-r from-[var(--link)] to-[var(--badge-green-text)] transition-all duration-500"
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
            'w-full flex items-center justify-center gap-2 rounded-[12px] px-4 py-3 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed',
            allResponded && !disabled
              ? 'bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/20 hover:bg-[var(--link)]/20 hover:border-[var(--link)]/35'
              : 'border border-[var(--line-soft)] text-[var(--text-soft)]',
          )}
          aria-disabled={!allResponded || disabled}
          aria-label="Continue to resume writing"
        >
          Continue — Start Writing
          <ArrowRight className="h-4 w-4" />
        </button>
        {!allResponded && (
          <p className="text-center text-xs text-[var(--text-soft)] mt-2">
            Review all {cards.length} gaps to continue
          </p>
        )}
        {allResponded && cardStates.every(s => s.action === 'skip') && (
          <div className="support-callout mt-3 border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
            <p className="text-sm text-[var(--text-soft)]">
              Your resume will highlight your direct matches — no inferred positioning will be used.
            </p>
            <p className="text-xs text-[var(--text-soft)] mt-1">
              You can add context anytime to unlock new strategies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
