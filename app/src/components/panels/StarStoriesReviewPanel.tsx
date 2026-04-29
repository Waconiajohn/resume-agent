import { useState, useCallback } from 'react';
import { BookOpen, CheckCircle2, MessageSquare, Pencil, ArrowRight } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { StarStoriesReviewData } from '@/types/panels';

interface StarStoriesReviewPanelProps {
  data: StarStoriesReviewData;
  onPipelineRespond?: (gate: string, response: unknown) => void;
}

type Mode = 'review' | 'request_changes' | 'edit_directly';

export function StarStoriesReviewPanel({ data, onPipelineRespond }: StarStoriesReviewPanelProps) {
  const { report, quality_score } = data;

  const [mode, setMode] = useState<Mode>('review');
  const [feedback, setFeedback] = useState('');
  const [editedContent, setEditedContent] = useState(report);

  const handleApprove = useCallback(() => {
    onPipelineRespond?.('star_stories_review', true);
  }, [onPipelineRespond]);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedback.trim()) return;
    onPipelineRespond?.('star_stories_review', { approved: false, feedback: feedback.trim() });
  }, [onPipelineRespond, feedback]);

  const handleSubmitDirectEdit = useCallback(() => {
    if (!editedContent.trim()) return;
    onPipelineRespond?.('star_stories_review', { approved: false, edited_content: editedContent.trim() });
  }, [onPipelineRespond, editedContent]);

  const scoreColor =
    quality_score == null
      ? 'text-[var(--text-soft)]'
      : quality_score >= 80
        ? 'text-[var(--badge-green-text)]'
        : quality_score >= 65
          ? 'text-[var(--badge-amber-text)]'
          : 'text-[#f0a9a9]';

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--link)]" />
            <span className="text-sm font-medium text-[var(--text-strong)]">STAR Stories Review</span>
          </div>
          {quality_score != null && (
            <span className={cn('text-xs font-semibold tabular-nums', scoreColor)}>
              {quality_score}/100
            </span>
          )}
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Guidance card */}
        <GlassCard className="p-3">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            These are the STAR stories you will verbalize in interviews. Review for accuracy — these represent real experiences and must reflect what actually happened.
          </p>
        </GlassCard>

        {/* Report content */}
        {mode === 'edit_directly' ? (
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Editing Report
            </label>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={20}
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--accent-muted)] px-3 py-2.5 text-xs text-[var(--text-strong)] leading-relaxed placeholder:text-[var(--text-soft)] focus:border-[var(--link)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-1 focus:ring-[var(--link)]/20 resize-y font-mono"
              aria-label="Edit interview prep report directly"
            />
          </div>
        ) : (
          <GlassCard className="p-4">
            <p className="whitespace-pre-wrap text-xs text-[var(--text-strong)] leading-relaxed">{report}</p>
          </GlassCard>
        )}

        {/* Request changes textarea */}
        {mode === 'request_changes' && (
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              What needs to change?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="e.g. The result in the leadership story is overstated — change 40% to 22%, add more context about the budget constraints..."
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--text-strong)] leading-relaxed placeholder:text-[var(--text-soft)] focus:border-[var(--link)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-1 focus:ring-[var(--link)]/20 resize-none"
              aria-label="Feedback for STAR stories revision"
              autoFocus
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2 pt-1 pb-2">
          {mode === 'review' && (
            <>
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={handleApprove}
                aria-label="Approve STAR stories"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve & Save Stories
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>

              <div className="grid grid-cols-2 gap-2">
                <GlassButton
                  variant="ghost"
                  className="w-full"
                  onClick={() => setMode('request_changes')}
                  aria-label="Request changes to STAR stories"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request Changes
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setEditedContent(report); setMode('edit_directly'); }}
                  aria-label="Edit STAR stories directly"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Directly
                </GlassButton>
              </div>
            </>
          )}

          {mode === 'request_changes' && (
            <>
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={handleSubmitFeedback}
                disabled={!feedback.trim()}
                aria-label="Submit revision request"
              >
                <MessageSquare className="h-4 w-4" />
                Submit Changes
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <button
                type="button"
                onClick={() => { setFeedback(''); setMode('review'); }}
                className="w-full text-center text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors py-1"
              >
                Cancel
              </button>
            </>
          )}

          {mode === 'edit_directly' && (
            <>
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={handleSubmitDirectEdit}
                disabled={!editedContent.trim()}
                aria-label="Submit direct edit"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save Edits
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <button
                type="button"
                onClick={() => setMode('review')}
                className="w-full text-center text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors py-1"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
