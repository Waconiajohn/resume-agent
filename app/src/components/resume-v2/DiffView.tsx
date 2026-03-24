/**
 * DiffView — Shows original vs replacement text with Accept/Reject
 */

import { useState } from 'react';
import { Check, X, Target, Briefcase } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { PendingEdit } from '@/hooks/useInlineEdit';

interface DiffViewProps {
  edit: PendingEdit;
  onAccept: (editedText: string) => void;
  onReject: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  strengthen: 'Strengthened',
  add_metrics: 'Added metrics',
  shorten: 'Shortened',
  add_keywords: 'Added keywords',
  rewrite: 'Rewritten',
  custom: 'Custom edit',
  not_my_voice: 'Voice adjusted',
};

export function DiffView({ edit, onAccept, onReject }: DiffViewProps) {
  const [editedText, setEditedText] = useState(edit.replacement);

  const actionLabel = ACTION_LABELS[edit.action] ?? 'Edited';

  return (
    <GlassCard className="p-4 border-[#afc4ff]/20 animate-[card-enter_300ms_ease-out_forwards] opacity-0">
      {/* Section context label */}
      <div className="mb-1.5 text-xs text-[var(--text-soft)]">
        {actionLabel}: {edit.section}
      </div>

      {/* Edit context — shows what requirement this addresses */}
      {edit.editContext?.requirement && (
        <div className="mb-3 rounded-lg border border-[#afc4ff]/10 bg-[#afc4ff]/[0.03] px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#afc4ff]/80">
            <Target className="h-3 w-3 shrink-0" />
            <span className="font-medium">Addresses:</span>
            <span className="text-[var(--text-soft)]">{edit.editContext.requirement}</span>
          </div>
          {edit.editContext.evidence && edit.editContext.evidence.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs">
              <Briefcase className="h-3 w-3 text-[#b5dec2]/60 shrink-0 mt-0.5" />
              <span className="text-[var(--text-soft)]">Your experience: {edit.editContext.evidence.join('; ')}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#afc4ff]">{actionLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[#f0b8b8] transition-colors"
            aria-label="Reject edit"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
          <button
            type="button"
            onClick={() => onAccept(editedText)}
            className="flex items-center gap-1 rounded-lg bg-[#b5dec2]/15 px-2.5 py-1 text-xs font-medium text-[#b5dec2] hover:bg-[#b5dec2]/25 transition-colors"
            aria-label="Accept edit"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Original */}
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3">
          <div className="mb-1.5 text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider">Original</div>
          <p className="text-sm text-[var(--text-soft)] leading-relaxed line-through decoration-[#f0b8b8]/30">{edit.originalText}</p>
        </div>

        {/* Replacement */}
        <div className="rounded-lg border border-[#b5dec2]/15 bg-[#b5dec2]/[0.03] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[12px] font-medium text-[#b5dec2]/60 uppercase tracking-wider">Replacement</span>
            {editedText !== edit.replacement && (
              <>
                <span className="text-[12px] text-[#afc4ff]/70">(edited)</span>
                <button
                  type="button"
                  onClick={() => setEditedText(edit.replacement)}
                  className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
                >
                  Reset
                </button>
              </>
            )}
          </div>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full resize-y min-h-[4.5rem] bg-transparent text-sm text-[var(--text-strong)] leading-relaxed focus:outline-none"
            rows={Math.max(3, editedText.split('\n').length + 1)}
          />
        </div>
      </div>
    </GlassCard>
  );
}
