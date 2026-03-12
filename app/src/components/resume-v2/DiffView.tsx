/**
 * DiffView — Shows original vs replacement text with Accept/Reject
 */

import { Check, X } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { PendingEdit } from '@/hooks/useInlineEdit';

interface DiffViewProps {
  edit: PendingEdit;
  onAccept: () => void;
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
  return (
    <GlassCard className="p-4 border-[#afc4ff]/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#afc4ff]">{ACTION_LABELS[edit.action] ?? 'Edited'}</span>
          <span className="text-xs text-white/40">in {edit.section}</span>
        </div>
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
            onClick={onAccept}
            className="flex items-center gap-1 rounded-lg bg-[#b5dec2]/15 px-2.5 py-1 text-xs font-medium text-[#b5dec2] hover:bg-[#b5dec2]/25 transition-colors"
            aria-label="Accept edit"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Original */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="mb-1.5 text-[10px] font-medium text-white/40 uppercase tracking-wider">Original</div>
          <p className="text-sm text-white/50 leading-relaxed line-through decoration-[#f0b8b8]/30">{edit.originalText}</p>
        </div>

        {/* Replacement */}
        <div className="rounded-lg border border-[#b5dec2]/15 bg-[#b5dec2]/[0.03] p-3">
          <div className="mb-1.5 text-[10px] font-medium text-[#b5dec2]/60 uppercase tracking-wider">Replacement</div>
          <p className="text-sm text-white/80 leading-relaxed">{edit.replacement}</p>
        </div>
      </div>
    </GlassCard>
  );
}
