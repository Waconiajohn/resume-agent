/**
 * Sequence Review Panel — Networking Outreach Gate
 *
 * Presents all outreach messages for user review before the final report
 * is produced. These messages will be sent to real people — users must
 * review and approve before the pipeline finalizes.
 *
 * Two actions:
 * - Approve All: proceed with the generated sequence
 * - Request Changes: provide feedback text
 */

import { useState, useCallback } from 'react';
import {
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  Users,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { SequenceReviewData, OutreachMessagePreview } from '@/types/panels';

interface SequenceReviewPanelProps {
  data: SequenceReviewData;
  onApprove?: (feedback?: string) => void;
}

// ─── Message type labels ───────────────────────────────────────────────

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  connection_request: 'Connection Request',
  follow_up_1: 'Follow-Up #1',
  follow_up_2: 'Follow-Up #2',
  value_offer: 'Value Offer',
  meeting_request: 'Meeting Request',
};

const MESSAGE_TYPE_ACCENT: Record<string, string> = {
  connection_request: 'text-[#afc4ff]',
  follow_up_1: 'text-[#b5dec2]',
  follow_up_2: 'text-[#b5dec2]',
  value_offer: 'text-[#f0d99f]',
  meeting_request: 'text-[var(--text-muted)]',
};

// ─── Single message card ───────────────────────────────────────────────

function MessageCard({ message, index }: { message: OutreachMessagePreview; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const label = MESSAGE_TYPE_LABELS[message.type] ?? message.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const accentColor = MESSAGE_TYPE_ACCENT[message.type] ?? 'text-[var(--text-muted)]';

  const scoreColor =
    message.quality_score >= 80
      ? 'text-[#b5dec2]'
      : message.quality_score >= 60
      ? 'text-[#f0d99f]'
      : 'text-[var(--text-soft)]';

  return (
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--accent-muted)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-[12px] font-semibold text-[var(--text-soft)] w-4 text-right">{index + 1}</span>
          <div className="min-w-0">
            <span className={cn('text-xs font-semibold', accentColor)}>{label}</span>
            {message.subject && (
              <p className="mt-0.5 text-[12px] text-[var(--text-soft)] truncate">{message.subject}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[var(--text-soft)]" />
            <span className="text-[12px] text-[var(--text-soft)]">{message.timing}</span>
          </div>
          <span className={cn('text-xs font-medium', scoreColor)}>{message.quality_score}</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-[var(--text-soft)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--text-soft)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--line-soft)] px-4 py-3 space-y-2">
          {/* Character count badge */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[var(--text-soft)]">{message.char_count} characters</span>
          </div>

          {/* Message body */}
          <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3">
            <p className="text-xs leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap">
              {message.body}
            </p>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Quality score badge ───────────────────────────────────────────────

function QualityBadge({ score }: { score: number }) {
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Good' : 'Needs Review';
  const colorClass = score >= 80 ? 'text-[#b5dec2]' : score >= 60 ? 'text-[#f0d99f]' : 'text-[var(--text-soft)]';
  const borderClass = score >= 80 ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.06]' : score >= 60 ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.06]' : 'border-[var(--line-soft)] bg-[var(--accent-muted)]';

  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-3 py-1.5', borderClass)}>
      <span className={cn('text-xs font-medium', colorClass)}>{score}</span>
      <span className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-soft)]">{label}</span>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────

export function SequenceReviewPanel({ data, onApprove }: SequenceReviewPanelProps) {
  const { messages, target_name, target_company, quality_score } = data;

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const hasFeedback = feedback.trim().length > 0;

  const handleApprove = useCallback(() => {
    if (!onApprove) return;
    onApprove(hasFeedback ? feedback.trim() : undefined);
  }, [onApprove, hasFeedback, feedback]);

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#afc4ff]" />
          <span className="text-sm font-medium text-[var(--text-strong)]">Your Outreach Sequence</span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Target + quality summary */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-strong)]">
                {target_name || 'Your target contact'}
              </p>
              {target_company && (
                <p className="text-[13px] text-[var(--text-soft)] mt-0.5">{target_company}</p>
              )}
              <p className="text-[12px] text-[var(--text-soft)] mt-1">{messages.length} messages in sequence</p>
            </div>
            <QualityBadge score={quality_score} />
          </div>
        </GlassCard>

        {/* Instruction */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5">
          <p className="text-[13px] leading-relaxed text-[var(--text-soft)]">
            <MessageSquare className="inline h-3 w-3 mr-1.5 text-[var(--text-soft)]" />
            These messages will be sent to a real person. Review each one carefully before approving.
            The first message is expanded by default.
          </p>
        </div>

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageCard
            key={`msg-${msg.type}-${i}`}
            message={msg}
            index={i}
          />
        ))}

        {/* Feedback section */}
        {onApprove && (
          <div>
            {!showFeedback ? (
              <button
                type="button"
                onClick={() => setShowFeedback(true)}
                className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
              >
                <MessageSquare className="h-3 w-3" />
                Request changes to the sequence
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-[13px] text-[var(--text-soft)]">
                  What would you like changed?
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="e.g. The follow-up messages are too formal — make them more conversational..."
                  className="w-full rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:border-[var(--line-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 resize-none"
                />
                <button
                  type="button"
                  onClick={() => { setShowFeedback(false); setFeedback(''); }}
                  className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Approve */}
        <div className="pt-1 pb-2">
          <GlassButton
            variant="primary"
            className="w-full"
            onClick={handleApprove}
            disabled={!onApprove}
            aria-label={
              hasFeedback
                ? 'Approve sequence with feedback notes'
                : 'Approve sequence and generate final report'
            }
          >
            <ShieldCheck className="h-4 w-4" />
            {hasFeedback ? 'Approve with Notes — Generate Report' : 'Sequence Looks Good — Generate Report'}
            <ArrowRight className="h-4 w-4 ml-auto" />
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
