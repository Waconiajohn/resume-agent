import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Pencil, ChevronDown, ChevronUp, Redo2, Undo2 } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import { WorkbenchProgressDots } from './workbench/WorkbenchProgressDots';
import { WorkbenchContentEditor } from './workbench/WorkbenchContentEditor';
import { WorkbenchActionChips } from './workbench/WorkbenchActionChips';
import { WorkbenchSuggestions } from './workbench/WorkbenchSuggestions';
import { WorkbenchEvidenceCards, type EvidenceItem } from './workbench/WorkbenchEvidenceCards';
import { WorkbenchKeywordBar } from './workbench/WorkbenchKeywordBar';
import { cn } from '@/lib/utils';
import type { SectionWorkbenchContext } from '@/types/panels';

export type { SectionWorkbenchContext };

interface SectionWorkbenchProps {
  section: string;
  content: string;
  reviewToken?: string;
  context: SectionWorkbenchContext | null;
  onApprove: () => void;
  onRequestChanges: (feedback: string, reviewToken?: string) => void;
  onDirectEdit: (editedContent: string, reviewToken?: string) => void;
  onDismissSuggestion?: (id: string) => void;
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SectionWorkbench({
  section,
  content,
  reviewToken,
  context,
  onApprove,
  onRequestChanges,
  onDirectEdit,
  onDismissSuggestion,
}: SectionWorkbenchProps) {
  const [localContent, setLocalContent] = useState(content);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isApprovalAnimating, setIsApprovalAnimating] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const actionLockedRef = useRef(false);
  const lastActionAtRef = useRef(0);
  const refineWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const clearRefineWatchdog = useCallback(() => {
    if (refineWatchdogRef.current) {
      clearTimeout(refineWatchdogRef.current);
      refineWatchdogRef.current = null;
    }
  }, []);

  const unlockRefineState = useCallback(() => {
    actionLockedRef.current = false;
    setIsRefining(false);
    clearRefineWatchdog();
  }, [clearRefineWatchdog]);

  const handleApproveWithAnimation = useCallback(() => {
    setIsApprovalAnimating(true);
    setTimeout(() => {
      onApprove();
    }, 400);
    // Auto-dismiss overlay after 2s if no new section_draft resets it.
    // For the last section, no new draft arrives, so the overlay would stay forever.
    setTimeout(() => {
      setIsApprovalAnimating(false);
    }, 2000);
  }, [onApprove]);

  // Reset local state on new server draft content OR a new review token.
  // Token-only changes can happen when the server reissues a draft with unchanged text.
  useEffect(() => {
    setLocalContent(content);
    setHasLocalEdits(false);
    setUndoStack([]);
    setRedoStack([]);
    setIsApprovalAnimating(false);
    unlockRefineState();
  }, [content, reviewToken, unlockRefineState]);

  // Also reset when section changes
  useEffect(() => {
    setLocalContent(content);
    setHasLocalEdits(false);
    setUndoStack([]);
    setRedoStack([]);
    setShowAdvanced(false);
    setIsApprovalAnimating(false);
    unlockRefineState();
  }, [section, unlockRefineState]);

  useEffect(() => {
    return () => {
      clearRefineWatchdog();
    };
  }, [clearRefineWatchdog]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const target = e.target as Node | null;
        if (rootRef.current && target && !rootRef.current.contains(target)) {
          return;
        }
        e.preventDefault();
        if (isRefining) {
          return;
        }
        if (hasLocalEdits) {
          onDirectEdit(localContent, reviewToken);
          setHasLocalEdits(false);
        } else {
          handleApproveWithAnimation();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleApproveWithAnimation, hasLocalEdits, isRefining, localContent, onApprove, onDirectEdit, reviewToken]);

  const handleLocalContentChange = useCallback(
    (updated: string) => {
      if (updated === localContent) return;
      setUndoStack((prev) => {
        const next = [...prev, localContent];
        return next.slice(-25);
      });
      setRedoStack([]);
      setLocalContent(updated);
      setHasLocalEdits(updated !== content);
    },
    [content, localContent],
  );

  const handleAction = useCallback(
    (instruction: string) => {
      const now = Date.now();
      if (actionLockedRef.current || isRefining) return;
      if (now - lastActionAtRef.current < 350) return;
      lastActionAtRef.current = now;
      actionLockedRef.current = true;
      setIsRefining(true);
      clearRefineWatchdog();
      refineWatchdogRef.current = setTimeout(() => {
        // If the server response never arrives, unlock so the user can continue.
        actionLockedRef.current = false;
        setIsRefining(false);
        refineWatchdogRef.current = null;
      }, 20_000);
      onRequestChanges(instruction, reviewToken);
    },
    [clearRefineWatchdog, isRefining, onRequestChanges, reviewToken],
  );

  const handleWeaveIn = useCallback(
    (evidence: EvidenceItem) => {
      const instruction = `Weave in this evidence: ${evidence.result}. Situation: ${evidence.situation}. Action: ${evidence.action}.`;
      handleAction(instruction);
    },
    [handleAction],
  );

  const handleKeywordAction = useCallback(
    (keyword: string) => {
      handleAction(`Naturally integrate the keyword "${keyword}" into this section`);
    },
    [handleAction],
  );

  const handleSaveEdits = useCallback(() => {
    onDirectEdit(localContent, reviewToken);
    setHasLocalEdits(false);
  }, [localContent, onDirectEdit, reviewToken]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || isRefining) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, localContent].slice(-25));
    setLocalContent(previous);
    setHasLocalEdits(previous !== content);
  }, [content, isRefining, localContent, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || isRefining) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, localContent].slice(-25));
    setLocalContent(next);
    setHasLocalEdits(next !== content);
  }, [content, isRefining, localContent, redoStack]);

  const positioningAngle =
    context?.blueprint_slice &&
    typeof context.blueprint_slice['positioning_angle'] === 'string'
      ? (context.blueprint_slice['positioning_angle'] as string)
      : null;

  const sectionOrder = Array.isArray(context?.section_order) ? context.section_order : [];
  const sectionsApproved = Array.isArray(context?.sections_approved) ? context.sections_approved : [];
  const evidence = Array.isArray(context?.evidence) ? context.evidence : [];
  const keywords = Array.isArray(context?.keywords) ? context.keywords : [];
  const gapMappings = Array.isArray(context?.gap_mappings) ? context.gap_mappings : [];
  const hasAdvancedContext = Boolean(
    evidence.length > 0 || keywords.length > 0 || gapMappings.length > 0,
  );
  const gapCount = gapMappings.filter((g) => g.classification !== 'strong').length;
  const contextVersion = typeof context?.context_version === 'number' ? context.context_version : 0;

  return (
    <div
      ref={rootRef}
      className="relative flex h-full flex-col"
      data-panel-root
    >
      {/* Progress dots — sticky */}
      {sectionOrder.length > 0 && (
        <WorkbenchProgressDots
          sectionOrder={sectionOrder}
          sectionsApproved={sectionsApproved}
          currentSection={section}
        />
      )}

      {/* Scrollable body */}
      <div data-panel-scroll className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-6 space-y-6">
          {/* Section title */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold text-white/90 tracking-tight">
              {toTitleCase(section)}
            </h2>
            {positioningAngle && (
              <p className="text-xs text-white/45 leading-relaxed max-w-sm mx-auto">
                {positioningAngle}
              </p>
            )}
          </div>

          {/* Content editor */}
          <WorkbenchContentEditor
            content={content}
            localContent={localContent}
            onLocalContentChange={handleLocalContentChange}
            isRefining={isRefining}
            hasLocalEdits={hasLocalEdits}
          />

          {/* Refining indicator */}
          {isRefining && (
            <div className="flex items-center gap-2 justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-[#98b3ff] animate-pulse" />
              <p className="text-xs text-[#98b3ff]/70">Refining section…</p>
            </div>
          )}

          {/* Gap-first suggestions or fallback action chips */}
          {Array.isArray(context?.suggestions) && context.suggestions.length > 0 ? (
            <WorkbenchSuggestions
              suggestions={context.suggestions}
              content={localContent}
              onApplySuggestion={(suggestionId) => {
                handleAction(`__suggestion__:${suggestionId}`);
              }}
              onSkipSuggestion={(suggestionId) => {
                onDismissSuggestion?.(suggestionId);
              }}
              disabled={isRefining}
            />
          ) : (
            <WorkbenchActionChips
              section={section}
              onAction={handleAction}
              disabled={isRefining}
            />
          )}

          {/* Advanced guidance — staged reveal to reduce cognitive load */}
          {hasAdvancedContext && (
            <div className="rounded-2xl border border-white/[0.1] bg-white/[0.02] p-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white/90"
              >
                <span>
                  Advanced Guidance
                  {context && (
                    <span className="ml-2 text-[10px] text-white/40">
                      v{contextVersion} · {gapCount} open requirement{gapCount === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
                {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showAdvanced && (
                <div className="space-y-4 pt-3">
                  {evidence.length > 0 && (
                    <WorkbenchEvidenceCards
                      evidence={evidence}
                      content={localContent}
                      onWeaveIn={handleWeaveIn}
                    />
                  )}

                  {keywords.length > 0 && (
                    <WorkbenchKeywordBar
                      keywords={keywords}
                      content={localContent}
                      onKeywordAction={handleKeywordAction}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bottom spacer for sticky CTA */}
          <div className="h-20" />
        </div>
      </div>

      {isApprovalAnimating && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-emerald-500/[0.08] backdrop-blur-sm animate-[fadeIn_200ms_ease-out]">
          <div className="flex flex-col items-center gap-2 animate-[scaleIn_300ms_ease-out]">
            <Check className="h-8 w-8 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Section approved</span>
          </div>
        </div>
      )}

      {/* Sticky bottom CTA bar */}
      <div className="border-t border-white/[0.12] bg-black/30 backdrop-blur-sm px-5 py-3">
        <div className="mx-auto max-w-3xl">
          {hasLocalEdits ? (
            <div className="flex items-center gap-2">
              <GlassButton
                variant="ghost"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || isRefining}
                className="px-2.5"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={handleRedo}
                disabled={redoStack.length === 0 || isRefining}
                className="px-2.5"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </GlassButton>
              <GlassButton
                variant="primary"
                className="flex-1"
                onClick={handleSaveEdits}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Save Edits
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => {
                  setLocalContent(content);
                  setHasLocalEdits(false);
                }}
                className="px-3"
              >
                Discard
              </GlassButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <GlassButton
                variant="ghost"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || isRefining}
                className="px-2.5"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={handleRedo}
                disabled={redoStack.length === 0 || isRefining}
                className="px-2.5"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </GlassButton>
              <GlassButton
                variant="primary"
                className={cn('flex-1', isRefining && 'opacity-50 pointer-events-none')}
                onClick={handleApproveWithAnimation}
                disabled={isRefining}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Looks Good — Next Section
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => {
                  const instruction = 'Please make this section more concise and impactful';
                  handleAction(instruction);
                }}
                disabled={isRefining}
                className="flex-shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </GlassButton>
            </div>
          )}
          <p className="mt-1.5 text-center text-[10px] text-white/25">
            {hasLocalEdits ? 'Save your inline edits or discard' : 'Cmd+Enter to approve'}
          </p>
        </div>
      </div>
    </div>
  );
}
