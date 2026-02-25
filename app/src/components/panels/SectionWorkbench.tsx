import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Pencil, ChevronDown, ChevronUp, Redo2, Undo2 } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
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
  onApproveRemainingBundle?: () => void;
  onApproveCurrentBundle?: () => void;
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

type LocalBundleKey = 'headline' | 'core_experience' | 'supporting';

function sectionToBundleKey(section: string): LocalBundleKey {
  if (section === 'summary' || section === 'selected_accomplishments') return 'headline';
  if (section.startsWith('experience_role_')) return 'core_experience';
  return 'supporting';
}

export function SectionWorkbench({
  section,
  content,
  reviewToken,
  context,
  onApprove,
  onApproveRemainingBundle,
  onApproveCurrentBundle,
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
  const reviewStrategy = context?.review_strategy ?? 'per_section';
  const reviewRequiredSections = Array.isArray(context?.review_required_sections) ? context.review_required_sections : [];
  const autoApprovedSections = Array.isArray(context?.auto_approved_sections) ? context.auto_approved_sections : [];
  const currentReviewBundleKey =
    context?.current_review_bundle_key === 'headline'
    || context?.current_review_bundle_key === 'core_experience'
    || context?.current_review_bundle_key === 'supporting'
      ? context.current_review_bundle_key
      : undefined;
  const reviewBundles = Array.isArray(context?.review_bundles)
    ? context.review_bundles.filter((b) => b && typeof b === 'object')
    : [];
  const sectionsByBundle = sectionOrder.reduce<Record<LocalBundleKey, string[]>>((acc, item) => {
    acc[sectionToBundleKey(item)].push(item);
    return acc;
  }, { headline: [], core_experience: [], supporting: [] });
  const currentBundleMeta = currentReviewBundleKey
    ? reviewBundles.find((bundle) => bundle.key === currentReviewBundleKey)
    : undefined;
  const nextPendingReviewBundleMeta = reviewBundles.find((bundle) =>
    bundle.key !== currentReviewBundleKey
    && (bundle.status === 'pending' || bundle.status === 'in_progress')
    && Number(bundle.review_required) > 0,
  );
  const autoApprovedBundleCount = reviewBundles.filter((bundle) => bundle.status === 'auto_approved').length;
  const approvedReviewSections = reviewRequiredSections.filter((s) => sectionsApproved.includes(s));
  const remainingReviewSections = reviewRequiredSections.filter(
    (s) => s !== section && !sectionsApproved.includes(s),
  );
  const reviewProgressTotal = reviewRequiredSections.length;
  const reviewProgressPct = reviewProgressTotal > 0
    ? Math.max(0, Math.min(100, Math.round((approvedReviewSections.length / reviewProgressTotal) * 100)))
    : 0;
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
          <ProcessStepGuideCard
            step="section_writing"
            tone="review"
            compact
            userDoesOverride="Review this section, approve it, or request changes. Informational chips and progress bars are here to help, not to block you."
            nextOverride="Once review sections are approved, the process moves to quality review."
          />

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

          {reviewStrategy === 'bundled' && (
            <div className="rounded-2xl border border-white/[0.1] bg-white/[0.025] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
                  Bundled Review
                </span>
                <span className="text-xs text-white/60">
                  Reviewing {reviewRequiredSections.length || 1} high-impact section{(reviewRequiredSections.length || 1) === 1 ? '' : 's'}
                </span>
                {reviewRequiredSections.includes(section) ? (
                  <span className="text-[11px] text-emerald-200/85">This section is in the review set.</span>
                ) : (
                  <span className="text-[11px] text-white/45">This section is editable, even if auto-approved by mode.</span>
                )}
              </div>
              {reviewRequiredSections.length > 0 && (
                <div className="mt-2 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                  {reviewBundles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {reviewBundles.map((bundle) => {
                        const isCurrentBundle = bundle.key === currentReviewBundleKey;
                        const toneClass = bundle.status === 'complete'
                          ? 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100/85'
                          : bundle.status === 'in_progress'
                            ? 'border-sky-300/20 bg-sky-400/[0.08] text-sky-100/90'
                            : bundle.status === 'auto_approved'
                              ? 'border-white/[0.08] bg-white/[0.03] text-white/65'
                              : 'border-white/[0.06] bg-white/[0.02] text-white/50';
                        return (
                          <span
                            key={bundle.key}
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${toneClass}`}
                            title={`${bundle.label}: ${bundle.reviewed_required}/${bundle.review_required} review sections approved`}
                          >
                            {bundle.label}
                            {bundle.status === 'auto_approved'
                              ? ' • auto'
                              : ` • ${bundle.reviewed_required}/${bundle.review_required}`}
                            {isCurrentBundle ? ' • current bundle' : ''}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {reviewBundles.length > 0 && (
                    <div className="mb-2 grid gap-2 sm:grid-cols-3">
                      {reviewBundles.map((bundle) => {
                        const bundleSections = sectionsByBundle[bundle.key as LocalBundleKey] ?? [];
                        const isCurrentBundle = bundle.key === currentReviewBundleKey;
                        const toneClass = bundle.status === 'complete'
                          ? 'border-emerald-300/18 bg-emerald-400/[0.04]'
                          : bundle.status === 'in_progress'
                            ? 'border-sky-300/18 bg-sky-400/[0.04]'
                            : bundle.status === 'auto_approved'
                              ? 'border-white/[0.08] bg-white/[0.02]'
                              : 'border-white/[0.06] bg-white/[0.015]';
                        return (
                          <div key={`bundle-card-${bundle.key}`} className={`rounded-lg border p-2 ${toneClass}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] font-medium text-white/82">{bundle.label}</div>
                              <div className="text-[10px] text-white/45">
                                {bundle.status === 'auto_approved'
                                  ? 'auto'
                                  : `${bundle.reviewed_required}/${bundle.review_required}`}
                              </div>
                            </div>
                            <div className="mt-1 text-[10px] text-white/50">
                              {isCurrentBundle ? 'Current bundle' : (
                                bundle.status === 'complete'
                                  ? 'Complete'
                                  : bundle.status === 'in_progress'
                                    ? 'In progress'
                                    : bundle.status === 'auto_approved'
                                      ? 'Auto-approved'
                                      : 'Pending'
                              )}
                            </div>
                            {bundleSections.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {bundleSections.slice(0, 4).map((bundleSection) => {
                                  const isApproved = sectionsApproved.includes(bundleSection);
                                  const isCurrentSection = bundleSection === section;
                                  const requiresReview = reviewRequiredSections.includes(bundleSection);
                                  return (
                                    <div
                                      key={`${bundle.key}:${bundleSection}`}
                                      className={`flex items-center justify-between gap-2 rounded-md border px-1.5 py-1 text-[10px] ${
                                        isCurrentSection
                                          ? 'border-sky-300/20 bg-sky-400/[0.06] text-sky-100/90'
                                          : isApproved
                                            ? 'border-emerald-300/18 bg-emerald-400/[0.04] text-emerald-100/85'
                                            : 'border-white/[0.05] bg-white/[0.01] text-white/60'
                                      }`}
                                      title={toTitleCase(bundleSection)}
                                    >
                                      <span className="truncate">{toTitleCase(bundleSection)}</span>
                                      <span className="text-[9px] text-white/45">
                                        {isCurrentSection ? 'current' : isApproved ? 'approved' : (requiresReview ? 'review' : 'auto')}
                                      </span>
                                    </div>
                                  );
                                })}
                                {bundleSections.length > 4 && (
                                  <div className="px-1.5 text-[10px] text-white/40">
                                    +{bundleSections.length - 4} more section{bundleSections.length - 4 === 1 ? '' : 's'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/65">
                    <span>Review set progress</span>
                    <span>{approvedReviewSections.length}/{reviewRequiredSections.length} approved</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7cb5ff]/80 to-[#b3e1ff]/85 transition-all duration-300"
                      style={{ width: `${reviewProgressPct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reviewRequiredSections.map((reviewSection) => {
                      const isCurrent = reviewSection === section;
                      const isApproved = sectionsApproved.includes(reviewSection);
                      return (
                        <span
                          key={reviewSection}
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            isApproved
                              ? 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100/85'
                              : isCurrent
                                ? 'border-sky-300/20 bg-sky-400/[0.08] text-sky-100/90'
                                : 'border-white/[0.08] bg-white/[0.02] text-white/55'
                          }`}
                          title={toTitleCase(reviewSection)}
                        >
                          {toTitleCase(reviewSection)}
                          {isApproved ? ' • approved' : (isCurrent ? ' • current' : ' • pending')}
                        </span>
                      );
                    })}
                  </div>
                  {(currentBundleMeta || nextPendingReviewBundleMeta || autoApprovedBundleCount > 0) && (
                    <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2 text-[11px] text-white/65">
                      <div className="flex flex-wrap items-center gap-2">
                        {currentBundleMeta && (
                          <span>
                            Current bundle: <span className="text-white/82">{currentBundleMeta.label}</span>
                            {typeof currentBundleMeta.reviewed_required === 'number' && typeof currentBundleMeta.review_required === 'number'
                              ? ` (${currentBundleMeta.reviewed_required}/${currentBundleMeta.review_required})`
                              : ''}
                          </span>
                        )}
                        {nextPendingReviewBundleMeta && (
                          <span>
                            Next: <span className="text-white/78">{nextPendingReviewBundleMeta.label}</span>
                            {typeof nextPendingReviewBundleMeta.review_required === 'number'
                              ? ` (${nextPendingReviewBundleMeta.review_required} review section${nextPendingReviewBundleMeta.review_required === 1 ? '' : 's'})`
                              : ''}
                          </span>
                        )}
                        {!nextPendingReviewBundleMeta && currentBundleMeta?.status === 'complete' && (
                          <span className="text-emerald-200/80">Current bundle is complete.</span>
                        )}
                        {autoApprovedBundleCount > 0 && (
                          <span className="text-white/45">
                            {autoApprovedBundleCount} bundle{autoApprovedBundleCount === 1 ? '' : 's'} auto-approved by mode
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {reviewRequiredSections.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-white/50">
                Review set: {reviewRequiredSections.map((s) => toTitleCase(s)).join(', ')}
              </p>
              )}
              {reviewRequiredSections.includes(section)
                && currentBundleMeta
                && currentBundleMeta.review_required > 1
                && currentBundleMeta.status !== 'complete'
                && onApproveCurrentBundle && (
                <div className="mt-2">
                  <GlassButton
                    variant="ghost"
                    onClick={onApproveCurrentBundle}
                  disabled={isRefining || hasLocalEdits}
                  className="h-8 px-3 text-[11px]"
                >
                    Finish {currentBundleMeta.label} Bundle
                  </GlassButton>
                  <p className="mt-1 text-[10px] text-white/35">
                    Approves the rest of this bundle&apos;s review sections
                    {nextPendingReviewBundleMeta ? ` and continues to ${nextPendingReviewBundleMeta.label}.` : '.'}
                  </p>
                </div>
              )}
              {reviewRequiredSections.includes(section) && remainingReviewSections.length > 0 && onApproveRemainingBundle && (
                <div className="mt-2">
                  <GlassButton
                    variant="ghost"
                    onClick={onApproveRemainingBundle}
                    disabled={isRefining || hasLocalEdits}
                    className="h-8 px-3 text-[11px]"
                  >
                    Approve Remaining Review Set ({remainingReviewSections.length})
                  </GlassButton>
                  <p className="mt-1 text-[10px] text-white/35">
                    This approves the rest of the bundled review sections and moves faster to quality review.
                  </p>
                </div>
              )}
              {autoApprovedSections.length > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                  Auto-approved by mode: {autoApprovedSections.slice(0, 6).map((s) => toTitleCase(s)).join(', ')}
                  {autoApprovedSections.length > 6 ? ` +${autoApprovedSections.length - 6} more` : ''}
                </p>
              )}
            </div>
          )}

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
