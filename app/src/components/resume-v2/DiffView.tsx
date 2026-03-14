/**
 * DiffView — Shows original vs replacement text with Accept/Reject
 */

import { useState } from 'react';
import { Check, X } from 'lucide-react';
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
      <div className="mb-1.5 text-xs text-white/40">
        {actionLabel}: {edit.section}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#afc4ff]">{actionLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-white/60 hover:bg-white/[0.08] hover:text-[#f0b8b8] transition-colors"
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
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="mb-1.5 text-[10px] font-medium text-white/40 uppercase tracking-wider">Original</div>
          <p className="text-sm text-white/50 leading-relaxed line-through decoration-[#f0b8b8]/30">{edit.originalText}</p>
        </div>

        {/* Replacement */}
        <div className="rounded-lg border border-[#b5dec2]/15 bg-[#b5dec2]/[0.03] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-medium text-[#b5dec2]/60 uppercase tracking-wider">Replacement</span>
            {editedText !== edit.replacement && (
              <>
                <span className="text-[10px] text-[#afc4ff]/70">(edited)</span>
                <button
                  type="button"
                  onClick={() => setEditedText(edit.replacement)}
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Reset
                </button>
              </>
            )}
          </div>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full resize-y min-h-[4.5rem] bg-transparent text-sm text-white/80 leading-relaxed focus:outline-none"
            rows={Math.max(3, editedText.split('\n').length + 1)}
          />
        </div>
      </div>
    </GlassCard>
  );
}
