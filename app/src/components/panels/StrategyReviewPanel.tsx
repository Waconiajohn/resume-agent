/**
 * Strategy Review Panel — Salary Negotiation Gate
 *
 * Presents the AI-generated negotiation numbers for user review before
 * the final report is produced. These numbers (opening position, walk-away,
 * BATNA) are the most consequential output of the platform — they directly
 * affect the user's financial outcome.
 *
 * Three actions:
 * - Approve: proceed with AI-generated strategy
 * - Edit Numbers: inline edit each dollar amount
 * - Request Changes: provide feedback text
 */

import { useState, useCallback } from 'react';
import {
  DollarSign,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  Pencil,
  RotateCcw,
  MessageSquare,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { StrategyReviewData } from '@/types/panels';

interface StrategyReviewPanelProps {
  data: StrategyReviewData;
  onApprove?: (edits?: StrategyReviewEdits) => void;
}

export interface StrategyReviewEdits {
  opening_position?: string;
  walk_away_point?: string;
  batna?: string;
  feedback?: string;
}

// ─── Number Field ──────────────────────────────────────────────────────

interface NumberFieldProps {
  label: string;
  value: string;
  editedValue: string | null;
  isEditing: boolean;
  description: string;
  accent: 'green' | 'yellow' | 'blue';
  canEdit: boolean;
  onStartEdit: () => void;
  onChangeValue: (v: string) => void;
  onDoneEdit: () => void;
  onResetEdit: () => void;
}

function NumberField({
  label,
  value,
  editedValue,
  isEditing,
  description,
  accent,
  canEdit,
  onStartEdit,
  onChangeValue,
  onDoneEdit,
  onResetEdit,
}: NumberFieldProps) {
  const currentValue = editedValue ?? value;
  const wasEdited = editedValue !== null && editedValue !== value;

  const accentClasses = {
    green: {
      border: 'border-[#b5dec2]/20',
      bg: 'bg-[#b5dec2]/[0.06]',
      icon: 'text-[#b5dec2]',
      badge: 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.08] text-[#b5dec2]/90',
    },
    yellow: {
      border: 'border-[#f0d99f]/20',
      bg: 'bg-[#f0d99f]/[0.06]',
      icon: 'text-[#f0d99f]',
      badge: 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] text-[#f0d99f]/90',
    },
    blue: {
      border: 'border-[#afc4ff]/20',
      bg: 'bg-[#afc4ff]/[0.06]',
      icon: 'text-[#afc4ff]',
      badge: 'border-[#afc4ff]/20 bg-[#afc4ff]/[0.08] text-[#afc4ff]/90',
    },
  };

  const colors = accentClasses[accent];

  return (
    <GlassCard className={cn('p-4', colors.border)}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <DollarSign className={cn('h-4 w-4 shrink-0', colors.icon)} />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {wasEdited && (
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.10em]', colors.badge)}>
              Edited
            </span>
          )}
          {canEdit && !wasEdited && (
            <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-white/40">
              Editable
            </span>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={currentValue}
            onChange={(e) => onChangeValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onDoneEdit();
              if (e.key === 'Escape') { onResetEdit(); onDoneEdit(); }
            }}
            autoFocus
            className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            placeholder="e.g. $185,000 base"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDoneEdit}
              className="text-[10px] text-[#afc4ff]/80 hover:text-[#afc4ff] transition-colors"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => { onResetEdit(); onDoneEdit(); }}
              className="text-[10px] text-white/40 hover:text-white/60 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => canEdit && onStartEdit()}
          disabled={!canEdit}
          className={cn('group w-full text-left', canEdit && 'cursor-pointer')}
        >
          <div className="flex items-start gap-2 mt-1">
            <p className={cn(
              'flex-1 text-base font-medium leading-snug',
              wasEdited ? colors.icon : 'text-white/90',
            )}>
              {currentValue}
            </p>
            {canEdit && (
              <Pencil className="h-3.5 w-3.5 shrink-0 mt-0.5 text-white/0 group-hover:text-white/40 transition-colors" />
            )}
          </div>
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-white/48">
        {description}
      </p>
    </GlassCard>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────

export function StrategyReviewPanel({ data, onApprove }: StrategyReviewPanelProps) {
  const {
    opening_position,
    walk_away_point,
    batna,
    approach,
    market_p50,
    market_p75,
    data_confidence,
  } = data;

  const [editedOpening, setEditedOpening] = useState<string | null>(null);
  const [editedWalkAway, setEditedWalkAway] = useState<string | null>(null);
  const [editedBatna, setEditedBatna] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'opening' | 'walkaway' | 'batna' | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const hasEdits = editedOpening !== null || editedWalkAway !== null || editedBatna !== null;
  const hasFeedback = feedback.trim().length > 0;

  const handleApprove = useCallback(() => {
    if (!onApprove) return;
    if (hasEdits || hasFeedback) {
      const edits: StrategyReviewEdits = {};
      if (editedOpening !== null && editedOpening !== opening_position) {
        edits.opening_position = editedOpening;
      }
      if (editedWalkAway !== null && editedWalkAway !== walk_away_point) {
        edits.walk_away_point = editedWalkAway;
      }
      if (editedBatna !== null && editedBatna !== batna) {
        edits.batna = editedBatna;
      }
      if (hasFeedback) {
        edits.feedback = feedback.trim();
      }
      onApprove(Object.keys(edits).length > 0 ? edits : undefined);
    } else {
      onApprove();
    }
  }, [onApprove, hasEdits, hasFeedback, editedOpening, editedWalkAway, editedBatna, feedback, opening_position, walk_away_point, batna]);

  const handleReset = useCallback(() => {
    setEditedOpening(null);
    setEditedWalkAway(null);
    setEditedBatna(null);
    setEditingField(null);
    setFeedback('');
    setShowFeedback(false);
  }, []);

  const confidenceLabel = data_confidence === 'high' ? 'High confidence' : data_confidence === 'medium' ? 'Medium confidence' : 'Low confidence';

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#b5dec2]" />
          <span className="text-sm font-medium text-white/85">Your Negotiation Strategy</span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* AI estimate disclaimer — prominent by design */}
        <div className="rounded-lg border border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#f0d99f]/70" />
            <div>
              <p className="text-[11px] font-semibold text-[#f0d99f]/85">AI-Estimated Market Data</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-white/55">
                These numbers are based on AI analysis of available market signals — not live salary databases.
                Verify against Levels.fyi, Glassdoor, or Payscale before entering negotiations.
                Confidence: <span className="font-medium text-white/75">{confidenceLabel}</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Approach */}
        <GlassCard className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Negotiation Approach</span>
          </div>
          <p className="text-sm text-white/85 capitalize">{approach}</p>
        </GlassCard>

        {/* Market reference */}
        {(market_p50 != null || market_p75 != null) && (
          <div className="grid grid-cols-2 gap-2">
            {market_p50 != null && (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] text-white/48 mb-0.5">Market Median (P50)</p>
                <p className="text-sm font-medium text-white/80">${market_p50.toLocaleString()}</p>
              </div>
            )}
            {market_p75 != null && (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] text-white/48 mb-0.5">Market P75</p>
                <p className="text-sm font-medium text-white/80">${market_p75.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        {/* The three key numbers */}
        <NumberField
          label="Opening Position"
          value={opening_position}
          editedValue={editedOpening}
          isEditing={editingField === 'opening'}
          description="The number you will ask for first. Anchors the negotiation in your favor."
          accent="green"
          canEdit={!!onApprove}
          onStartEdit={() => {
            setEditedOpening(editedOpening ?? opening_position);
            setEditingField('opening');
          }}
          onChangeValue={setEditedOpening}
          onDoneEdit={() => setEditingField(null)}
          onResetEdit={() => setEditedOpening(null)}
        />

        <NumberField
          label="Walk-Away Point"
          value={walk_away_point}
          editedValue={editedWalkAway}
          isEditing={editingField === 'walkaway'}
          description="The minimum you will accept. Below this, declining is the right move."
          accent="yellow"
          canEdit={!!onApprove}
          onStartEdit={() => {
            setEditedWalkAway(editedWalkAway ?? walk_away_point);
            setEditingField('walkaway');
          }}
          onChangeValue={setEditedWalkAway}
          onDoneEdit={() => setEditingField(null)}
          onResetEdit={() => setEditedWalkAway(null)}
        />

        <NumberField
          label="BATNA"
          value={batna}
          editedValue={editedBatna}
          isEditing={editingField === 'batna'}
          description="Best Alternative to a Negotiated Agreement — your leverage if talks stall."
          accent="blue"
          canEdit={!!onApprove}
          onStartEdit={() => {
            setEditedBatna(editedBatna ?? batna);
            setEditingField('batna');
          }}
          onChangeValue={setEditedBatna}
          onDoneEdit={() => setEditingField(null)}
          onResetEdit={() => setEditedBatna(null)}
        />

        {/* Request changes section */}
        {onApprove && (
          <div>
            {!showFeedback ? (
              <button
                type="button"
                onClick={() => setShowFeedback(true)}
                className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors"
              >
                <MessageSquare className="h-3 w-3" />
                Add feedback or notes
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-[11px] text-white/55">
                  Feedback for the final report (optional)
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="e.g. Adjust BATNA — I have a competing offer at $175k..."
                  className="w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-xs text-white/85 placeholder:text-white/30 focus:border-white/25 focus:outline-none resize-none"
                />
                <button
                  type="button"
                  onClick={() => { setShowFeedback(false); setFeedback(''); }}
                  className="text-[10px] text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Reset edits */}
        {(hasEdits || hasFeedback) && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset all edits
          </button>
        )}

        {/* Preview-only notice */}
        {!onApprove && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">
            <CheckCircle2 className="inline h-3 w-3 mr-1.5 text-[#b5dec2]" />
            Strategy finalized — the full report is ready below.
          </div>
        )}

        {/* Approve button */}
        <div className="pt-1 pb-2">
          <GlassButton
            variant="primary"
            className="w-full"
            onClick={handleApprove}
            disabled={!onApprove}
            aria-label={
              hasEdits || hasFeedback
                ? 'Approve strategy with edits and generate full report'
                : 'Approve strategy and generate full report'
            }
          >
            <ShieldCheck className="h-4 w-4" />
            {hasEdits || hasFeedback
              ? 'Approve with Edits — Generate Report'
              : 'Strategy Looks Right — Generate Report'}
            <ArrowRight className="h-4 w-4 ml-auto" />
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
