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

// ─── Confidence accents ──────────────────────────────────────────────────────

const CONFIDENCE_BORDER: Record<BulletConfidence, string> = {
  strong: 'border-l-slate-400',
  partial: 'border-l-slate-500',
  needs_validation: 'border-l-[#8f2d2d]',
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
  const isBenchmarkValidation = confidence === 'needs_validation' && requirementSource === 'benchmark';
  const statusTone = getProofStateTone(confidence, requirementSource);
  const nextStepHint = getProofStateNextStep(confidence, requirementSource);
  const contentOriginLabel = getContentOriginLabel(contentOrigin, confidence);
  const supportOriginLabel = getSupportOriginLabel(supportOrigin, hasEvidence, confidence, requirementSource);

  return (
    <div
      ref={popoverRef}
      className={`
        w-[420px] rounded-xl border border-slate-300 bg-white shadow-[0_26px_70px_-36px_rgba(15,23,42,0.45)]
        border-l-4 ${CONFIDENCE_BORDER[confidence]}
      `}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 leading-tight">
            Addresses
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {safeAddressesRequirements.map((req) => (
              <span key={req} className="text-sm leading-snug text-slate-700">
                {req}
              </span>
            ))}
          </div>
        </div>

        {/* Source badge + close */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <RequirementIcon className="h-3 w-3" />
            {requirementLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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
        <div className={`rounded-xl border px-3 py-2.5 ${statusTone.className}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            {statusTone.label}
          </p>
          <p className="mt-1 text-[13px] leading-6">
            {statusTone.message}
          </p>
        </div>
        {hasEvidence ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 italic leading-6">
            &ldquo;{safeEvidenceFound}&rdquo;
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-xl border border-[#d8c4c4] bg-white px-3 py-2.5 text-sm font-medium text-[#8f2d2d]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No original resume support found yet.
          </div>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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
          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 leading-6 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors"
          placeholder="Edit bullet text..."
        />
        <p className="mt-2 text-sm text-slate-600 leading-6">
          {nextStepHint}
        </p>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={editedText.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm & Keep
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#8f2d2d] hover:bg-slate-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove Line
        </button>
      </div>

      {/* ── AI assist row ────────────────────────────────────────────────── */}
      {onRequestAiEdit && (
        <div className="flex items-start gap-3 border-t border-slate-200 px-4 py-3">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleAiAction('strengthen')}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {isBenchmarkValidation ? 'Connect to my background' : 'Strengthen wording'}
            </button>
            <button
              type="button"
              onClick={() => handleAiAction('add_metrics')}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {isBenchmarkValidation ? 'Add direct support' : 'Add proof'}
            </button>
            <button
              type="button"
              onClick={() => handleAiAction('rewrite')}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {isBenchmarkValidation ? 'Rewrite to match my background' : 'Rewrite safely'}
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
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  if (confidence === 'partial') {
    return {
      label: 'Needs stronger detail',
      message: 'Related proof exists, but this line needs stronger detail before it feels fully credible.',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  if (requirementSource === 'benchmark') {
    return {
      label: 'Confirm Fit',
      message: 'This line may fit the role, but confirm it honestly matches your background before export.',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  return {
    label: 'Code Red',
    message: 'We could not support this line from the resume yet. Confirm it, rewrite it, or remove it before export.',
    className: 'border-[#d8c4c4] bg-white text-[#8f2d2d]',
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
    return 'Best next move: keep it only if it truly fits your background. Otherwise rewrite it or replace it with something truer.';
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
  requirementSource?: RequirementSource,
): string {
  if (supportOrigin === 'user_confirmed_context') return 'User confirmed';
  if (supportOrigin === 'adjacent_resume_inference' || confidence === 'partial') return 'Adjacent resume proof';
  if (supportOrigin === 'original_resume' || hasEvidence) return 'Original resume';
  if (requirementSource === 'benchmark' && confidence === 'needs_validation') return 'Not directly confirmed';
  return 'Not found yet';
}
