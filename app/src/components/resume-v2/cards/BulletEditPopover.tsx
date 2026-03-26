import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BulletConfidence,
  RequirementSource,
  ResumeContentOrigin,
  ResumeSupportOrigin,
} from '@/types/resume-v2';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BulletEditPopoverProps {
  text: string;
  confidence: BulletConfidence;
  evidenceFound: string;
  requirementSource: RequirementSource;
  addressesRequirements: string[];
  contentOrigin?: ResumeContentOrigin;
  supportOrigin?: ResumeSupportOrigin;
  onSave: (newText: string) => void;
  onRemove: () => void;
  onClose: () => void;
  onRequestAiEdit?: (
    text: string,
    action: 'strengthen' | 'add_metrics' | 'rewrite',
  ) => void;
}

// ─── Confidence colors (light theme — renders on the resume document) ────────

const CONFIDENCE_BORDER: Record<BulletConfidence, string> = {
  strong: 'border-l-emerald-500',
  partial: 'border-l-amber-400',
  needs_validation: 'border-l-red-400',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BulletEditPopover({
  text,
  confidence,
  evidenceFound,
  requirementSource,
  addressesRequirements,
  contentOrigin,
  supportOrigin,
  onSave,
  onRemove,
  onClose,
  onRequestAiEdit,
}: BulletEditPopoverProps) {
  const safeText = typeof text === 'string' ? text : '';
  const safeEvidenceFound = typeof evidenceFound === 'string' ? evidenceFound : '';
  const safeAddressesRequirements = Array.isArray(addressesRequirements)
    ? addressesRequirements.filter((req): req is string => typeof req === 'string' && req.trim().length > 0)
    : [];
  const [editedText, setEditedText] = useState(safeText);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync textarea when the upstream text prop changes
  useEffect(() => {
    setEditedText(safeText);
  }, [safeText]);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editedText]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    // Use mousedown so the click is captured before focus shifts
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSave = useCallback(() => {
    const trimmed = editedText.trim();
    if (trimmed.length > 0) {
      onSave(trimmed);
    }
  }, [editedText, onSave]);

  const handleAiAction = useCallback(
    (action: 'strengthen' | 'add_metrics' | 'rewrite') => {
      onRequestAiEdit?.(editedText.trim(), action);
    },
    [editedText, onRequestAiEdit],
  );

  const hasEvidence = safeEvidenceFound.trim().length > 0;
  const requirementLabel =
    requirementSource === 'job_description' ? 'Targets Job Need' : 'Targets Benchmark Signal';
  const RequirementIcon =
    requirementSource === 'job_description' ? Briefcase : BookOpen;
  const statusTone = getProofStateTone(confidence, requirementSource);
  const nextStepHint = getProofStateNextStep(confidence, requirementSource);
  const contentOriginLabel = getContentOriginLabel(contentOrigin, confidence);
  const supportOriginLabel = getSupportOriginLabel(supportOrigin, hasEvidence, confidence);

  return (
    <div
      ref={popoverRef}
      className={`
        w-[420px] rounded-lg border border-gray-200 bg-white shadow-lg
        border-l-4 ${CONFIDENCE_BORDER[confidence]}
      `}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 leading-tight">
            Addresses:
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {safeAddressesRequirements.map((req) => (
              <span
                key={req}
                className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 leading-snug"
              >
                {req}
              </span>
            ))}
          </div>
        </div>

        {/* Source badge + close */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <RequirementIcon className="h-3 w-3" />
            {requirementLabel}
          </span>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {contentOriginLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Evidence section ─────────────────────────────────────────────── */}
      <div className="px-4 pb-2 space-y-2">
        <div className={`rounded border px-3 py-2 ${statusTone.className}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">
            {statusTone.label}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {statusTone.message}
          </p>
        </div>
        {hasEvidence ? (
          <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-500 italic leading-relaxed border border-gray-100">
            &ldquo;{safeEvidenceFound}&rdquo;
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded bg-red-50 px-3 py-2 text-xs font-medium text-red-600 border border-red-100">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No original resume support found yet
          </div>
        )}
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
          Support source: {supportOriginLabel}
        </p>
      </div>

      {/* ── Editable textarea ────────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <textarea
          ref={textareaRef}
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          rows={3}
          className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 leading-relaxed placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
          placeholder="Edit bullet text..."
        />
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">
          {nextStepHint}
        </p>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={editedText.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          I Can Support This
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      {/* ── AI assist row ────────────────────────────────────────────────── */}
      {onRequestAiEdit && (
        <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-2.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAiAction('strengthen')}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              Strengthen
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => handleAiAction('add_metrics')}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              Add Metrics
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => handleAiAction('rewrite')}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              Rewrite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getProofStateTone(
  confidence: BulletConfidence,
  requirementSource: RequirementSource,
): { label: string; message: string; className: string } {
  if (confidence === 'strong') {
    return {
      label: 'Supported',
      message: 'This line is already supported by your background. Tighten the wording if you want, but the proof is there.',
      className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    };
  }

  if (confidence === 'partial') {
    return {
      label: 'Needs stronger detail',
      message: 'Related proof exists, but this line needs stronger detail before it feels fully credible.',
      className: 'border-amber-100 bg-amber-50 text-amber-700',
    };
  }

  if (requirementSource === 'benchmark') {
    return {
      label: 'High-risk benchmark line',
      message: 'This helps match the benchmark candidate, but you should confirm or rewrite it before export.',
      className: 'border-orange-100 bg-orange-50 text-orange-700',
    };
  }

  return {
    label: 'Code red',
    message: 'We could not support this line from the resume yet. Confirm it, rewrite it, or remove it before export.',
    className: 'border-red-100 bg-red-50 text-red-700',
  };
}

function getProofStateNextStep(
  confidence: BulletConfidence,
  requirementSource: RequirementSource,
): string {
  if (confidence === 'strong') {
    return 'Best next move: tighten the wording only if you want it sharper or more concise.';
  }

  if (confidence === 'partial') {
    return 'Best next move: add one concrete metric, scope detail, or outcome so this reads as direct proof.';
  }

  if (requirementSource === 'benchmark') {
    return 'Best next move: connect this benchmark signal to a real example from your background before you keep it.';
  }

  return 'Best next move: replace this with something you can prove, or confirm the experience and rewrite it safely.';
}

function getContentOriginLabel(
  contentOrigin: ResumeContentOrigin | undefined,
  confidence: BulletConfidence,
): string {
  if (contentOrigin === 'original_resume' || confidence === 'strong') return 'From Resume';
  if (contentOrigin === 'enhanced_from_resume' || confidence === 'partial') return 'Rewritten From Resume';
  return 'Drafted To Close Gap';
}

function getSupportOriginLabel(
  supportOrigin: ResumeSupportOrigin | undefined,
  hasEvidence: boolean,
  confidence: BulletConfidence,
): string {
  if (supportOrigin === 'user_confirmed_context') return 'User confirmed';
  if (supportOrigin === 'adjacent_resume_inference' || confidence === 'partial') return 'Adjacent resume proof';
  if (supportOrigin === 'original_resume' || hasEvidence) return 'Original resume';
  return 'Not found yet';
}
