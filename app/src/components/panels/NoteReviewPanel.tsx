import { useState, useCallback } from 'react';
import { Mail, CheckCircle2, MessageSquare, ArrowRight } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { NoteReviewData } from '@/types/panels';

interface NoteReviewPanelProps {
  data: NoteReviewData;
  onPipelineRespond?: (gate: string, response: unknown) => void;
}

type Mode = 'review' | 'request_changes';

const FORMAT_LABELS: Record<string, string> = {
  email: 'Email',
  handwritten: 'Handwritten Note',
  linkedin_message: 'LinkedIn Message',
};

export function NoteReviewPanel({ data, onPipelineRespond }: NoteReviewPanelProps) {
  const { notes, quality_score } = data;

  const [mode, setMode] = useState<Mode>('review');
  const [feedback, setFeedback] = useState('');
  const [selectedNote, setSelectedNote] = useState(0);

  const handleApprove = useCallback(() => {
    onPipelineRespond?.('note_review', true);
  }, [onPipelineRespond]);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedback.trim()) return;
    onPipelineRespond?.('note_review', { approved: false, feedback: feedback.trim() });
  }, [onPipelineRespond, feedback]);

  const scoreColor =
    quality_score == null
      ? 'text-white/50'
      : quality_score >= 80
        ? 'text-[#a8d7b8]'
        : quality_score >= 65
          ? 'text-[#f0d99f]'
          : 'text-[#f0a9a9]';

  const activeNote = notes[selectedNote];

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Thank-You Note Review</span>
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
          <p className="text-xs text-white/65 leading-relaxed">
            These notes reference specific interview interactions. Verify that all details — topics discussed, rapport points, questions — accurately reflect what happened.
          </p>
        </GlassCard>

        {/* Note selector (if multiple interviewers) */}
        {notes.length > 1 && (
          <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Select interviewer note">
            {notes.map((note, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === selectedNote}
                onClick={() => setSelectedNote(idx)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  idx === selectedNote
                    ? 'bg-[#afc4ff]/20 text-[#afc4ff]'
                    : 'bg-white/[0.05] text-white/50 hover:text-white/70',
                )}
              >
                {note.interviewer_name}
              </button>
            ))}
          </div>
        )}

        {/* Active note */}
        {activeNote && (
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-white/85">{activeNote.interviewer_name}</p>
                <p className="text-[11px] text-white/50">{activeNote.interviewer_title}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/45">
                {FORMAT_LABELS[activeNote.format] ?? activeNote.format}
              </span>
            </div>

            {activeNote.subject_line && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1">
                  Subject
                </p>
                <p className="text-xs text-white/75">{activeNote.subject_line}</p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1">
                Note
              </p>
              <p className="whitespace-pre-wrap text-xs text-white/85 leading-relaxed">
                {activeNote.content}
              </p>
            </div>

            {activeNote.personalization_notes && (
              <div className="border-t border-white/[0.08] pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1">
                  Personalization
                </p>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  {activeNote.personalization_notes}
                </p>
              </div>
            )}
          </GlassCard>
        )}

        {/* Request changes textarea */}
        {mode === 'request_changes' && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              What needs to change?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="e.g. The note for Sarah references a project we didn't discuss — remove that reference. The opening for Marcus's note is too formal..."
              className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2 text-xs text-white/85 leading-relaxed placeholder:text-white/30 focus:border-[#afc4ff]/40 focus:outline-none focus:ring-1 focus:ring-[#afc4ff]/20 resize-none"
              aria-label="Feedback for thank-you note revision"
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
                aria-label="Approve thank-you notes"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve Notes
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="w-full"
                onClick={() => setMode('request_changes')}
                aria-label="Request changes to thank-you notes"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Request Changes
              </GlassButton>
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
        </div>
      </div>
    </div>
  );
}
