import { useState, useCallback } from 'react';
import { User, CheckCircle2, MessageSquare, Pencil, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { BioReviewData, BioVariant } from '@/types/panels';

interface BioReviewPanelProps {
  data: BioReviewData;
  onPipelineRespond?: (gate: string, response: unknown) => void;
}

type Mode = 'review' | 'request_changes' | 'edit_directly';

function BioCard({ bio, index }: { bio: BioVariant; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);

  const scoreColor =
    bio.quality_score >= 80
      ? 'text-[#a8d7b8]'
      : bio.quality_score >= 65
        ? 'text-[#f0d99f]'
        : 'text-[#f0a9a9]';

  return (
    <GlassCard className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-white/85 truncate">{bio.format_label}</span>
          <span className="shrink-0 rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/55">
            {bio.length_label}
          </span>
          <span className="shrink-0 text-[10px] text-white/40 tabular-nums">
            {bio.word_count}w
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-[10px] font-semibold tabular-nums', scoreColor)}>
            {bio.quality_score}/100
          </span>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-white/40" />
            : <ChevronDown className="h-3.5 w-3.5 text-white/40" />
          }
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.08] px-4 pb-4 pt-3">
          <p className="whitespace-pre-wrap text-xs text-white/82 leading-relaxed">{bio.content}</p>
        </div>
      )}
    </GlassCard>
  );
}

export function BioReviewPanel({ data, onPipelineRespond }: BioReviewPanelProps) {
  const { bios, quality_score } = data;

  const [mode, setMode] = useState<Mode>('review');
  const [feedback, setFeedback] = useState('');
  const [editedReport, setEditedReport] = useState(data.final_report ?? '');

  const handleApprove = useCallback(() => {
    onPipelineRespond?.('bio_review', true);
  }, [onPipelineRespond]);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedback.trim()) return;
    onPipelineRespond?.('bio_review', { approved: false, feedback: feedback.trim() });
  }, [onPipelineRespond, feedback]);

  const handleSubmitDirectEdit = useCallback(() => {
    if (!editedReport.trim()) return;
    onPipelineRespond?.('bio_review', { approved: false, edited_content: editedReport.trim() });
  }, [onPipelineRespond, editedReport]);

  const overallScoreColor =
    quality_score == null
      ? 'text-white/50'
      : quality_score >= 80
        ? 'text-[#a8d7b8]'
        : quality_score >= 65
          ? 'text-[#f0d99f]'
          : 'text-[#f0a9a9]';

  // Compute edit placeholder from first bio if no report available
  const editPlaceholder = data.final_report
    ? data.final_report
    : bios.map((b) => `## ${b.format_label} — ${b.length_label}\n\n${b.content}`).join('\n\n---\n\n');

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Executive Bio Review</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/45 tabular-nums">{bios.length} bio{bios.length !== 1 ? 's' : ''}</span>
            {quality_score != null && (
              <span className={cn('text-xs font-semibold tabular-nums', overallScoreColor)}>
                {quality_score}/100
              </span>
            )}
          </div>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Guidance */}
        <GlassCard className="p-3">
          <p className="text-xs text-white/65 leading-relaxed">
            Review your executive bio collection below. Each bio is tailored to its format and length. Approve to finalize, request revisions, or edit the collection directly.
          </p>
        </GlassCard>

        {/* Bio cards or direct edit textarea */}
        {mode === 'edit_directly' ? (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Editing Bio Collection
            </label>
            <textarea
              value={editedReport}
              onChange={(e) => setEditedReport(e.target.value)}
              rows={20}
              placeholder={editPlaceholder}
              className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2.5 text-xs text-white/85 leading-relaxed placeholder:text-white/30 focus:border-[#afc4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-1 focus:ring-[#afc4ff]/20 resize-y font-mono"
              aria-label="Edit bio collection directly"
            />
          </div>
        ) : (
          <div className="space-y-2">
            {bios.map((bio, i) => (
              <BioCard key={`${bio.format_label}-${bio.length_label}-${i}`} bio={bio} index={i} />
            ))}
          </div>
        )}

        {/* Request changes textarea */}
        {mode === 'request_changes' && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              What would you like changed?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="e.g. Make the speaker bio more story-driven, shorten the LinkedIn bio to under 200 words, add a reference to board-level P&L responsibility..."
              className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2 text-xs text-white/85 leading-relaxed placeholder:text-white/30 focus:border-[#afc4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-1 focus:ring-[#afc4ff]/20 resize-none"
              aria-label="Feedback for bio revision"
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
                aria-label="Approve bio collection"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve Collection
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>

              <div className="grid grid-cols-2 gap-2">
                <GlassButton
                  variant="ghost"
                  className="w-full"
                  onClick={() => setMode('request_changes')}
                  aria-label="Request changes to bios"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request Changes
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setEditedReport(editPlaceholder); setMode('edit_directly'); }}
                  aria-label="Edit bio collection directly"
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
                className="w-full text-center text-xs text-white/40 hover:text-white/60 transition-colors py-1"
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
                disabled={!editedReport.trim()}
                aria-label="Submit direct edit"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save Edits
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <button
                type="button"
                onClick={() => setMode('review')}
                className="w-full text-center text-xs text-white/40 hover:text-white/60 transition-colors py-1"
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
