import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ResumeSectionDraftResult,
  ResumeSectionDraftVariant,
  ResumeWorkflowSectionStepViewModel,
} from '@/lib/resume-section-workflow';
import { renderSectionDraftVariantText, replaceSectionDraftVariantText } from '@/lib/resume-section-workflow';
import { getSectionRefineActions, type SectionRefineActionId } from '@/lib/section-draft-refinement';
import { SectionQuickActions } from './SectionQuickActions';
import { SectionManualEditor } from './SectionManualEditor';

interface SectionDraftStepProps {
  step: ResumeWorkflowSectionStepViewModel;
  draftState?: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    result: ResumeSectionDraftResult | null;
    error: string | null;
    isRefining?: boolean;
    refinementActionId?: SectionRefineActionId | null;
    refinementError?: string | null;
  };
  onGenerateDraft: () => void;
  onRefineDraft: (actionId: SectionRefineActionId, workingDraft: string) => Promise<void>;
  onApplyVariant: (variant: ResumeSectionDraftVariant) => void;
  onShowStructurePlan?: () => void;
}

function VariantContent({
  variant,
}: {
  variant: ResumeSectionDraftVariant;
}) {
  const text = renderSectionDraftVariantText(variant.content);
  const lines = useMemo(
    () => text.split('\n').map((line) => line.trim()).filter(Boolean),
    [text],
  );

  return (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--badge-blue-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--link)]">
          {variant.label}
        </span>
        <p className="text-xs leading-5 text-[var(--text-soft)]">{variant.helper}</p>
      </div>
      <div className="mt-3 rounded-xl bg-[var(--surface-0)] px-4 py-3">
        {variant.content.kind === 'paragraph' ? (
          <p className="text-sm leading-7 text-[var(--text-strong)]">{text}</p>
        ) : (
          <div className="space-y-2">
            {variant.content.scopeStatement && (
              <p className="text-sm leading-7 text-[var(--text-strong)]">{variant.content.scopeStatement}</p>
            )}
            <ul className="space-y-2">
              {lines.map((line, index) => (
                <li key={`${variant.id}-${index}`} className="flex gap-2 text-sm leading-7 text-[var(--text-strong)]">
                  <span className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-[var(--text-soft)]/70" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionDraftStep({
  step,
  draftState,
  onGenerateDraft,
  onRefineDraft,
  onApplyVariant,
  onShowStructurePlan,
}: SectionDraftStepProps) {
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isEditingManually, setIsEditingManually] = useState(false);
  const [editorText, setEditorText] = useState('');
  const result = draftState?.result;
  const recommendedVariant = result?.variants.find((variant) => variant.id === result.recommendedVariantId)
    ?? result?.variants[0]
    ?? null;
  const alternateVariants = (result?.variants ?? []).filter((variant) => variant.id !== recommendedVariant?.id);
  const actions = useMemo(() => getSectionRefineActions(step.kind), [step.kind]);
  const recommendedText = useMemo(
    () => (recommendedVariant ? renderSectionDraftVariantText(recommendedVariant.content) : ''),
    [recommendedVariant],
  );

  useEffect(() => {
    if (isEditingManually) {
      setEditorText(recommendedText);
    }
  }, [isEditingManually, recommendedText]);

  const handleStartManualEdit = () => {
    setEditorText(recommendedText);
    setIsEditingManually(true);
  };

  const handleApplyEditedVersion = () => {
    if (!recommendedVariant) return;
    onApplyVariant(replaceSectionDraftVariantText(recommendedVariant, editorText));
    setIsEditingManually(false);
  };

  const handleResetEditor = () => {
    setEditorText(recommendedText);
  };

  return (
    <div className="space-y-4">
      <div className="shell-panel px-4 py-4">
        <p className="eyebrow-label">{step.title}</p>
        <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">
          Step {step.stepNumber} of {step.totalSteps}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
          We are improving this section now. Accept the version that feels right, or reveal other options before moving on.
        </p>
        <div className="mt-3 grid gap-3">
          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              What this section needs to do
            </p>
            <ul className="mt-3 space-y-2">
              {step.needsToDo.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-6 text-[var(--text-strong)]">
                  <span className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-[var(--link)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              Current section
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--text-strong)] whitespace-pre-line">
              {step.currentContent}
            </p>
          </div>
        </div>
      </div>

      <div className="shell-panel px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow-label">Best Draft For This Role</p>
            <h4 className="mt-2 text-base font-semibold text-[var(--text-strong)]">
              Let AI write the strongest version first
            </h4>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
              This uses the job, the current resume, and the strongest evidence we already have.
            </p>
          </div>
          {onShowStructurePlan && (
            <button
              type="button"
              onClick={onShowStructurePlan}
              className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
            >
              Review structure
            </button>
          )}
        </div>

        {!draftState || draftState.status === 'idle' ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
            <p className="text-sm leading-6 text-[var(--text-soft)]">
              Generate the best full version of this section first. Then we can compare safer or stronger versions if needed.
            </p>
            <button
              type="button"
              onClick={onGenerateDraft}
              className="mt-4 rounded-lg bg-[var(--link)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-95"
            >
              Generate best draft
            </button>
          </div>
        ) : null}

        {draftState?.status === 'loading' ? (
          <div className="mt-4 rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
            <div className="flex items-center gap-2 text-sm text-[var(--text-soft)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing the best version of this section now…
            </div>
          </div>
        ) : null}

        {draftState?.status === 'error' ? (
          <div className="mt-4 rounded-2xl border border-[var(--badge-red-text)]/24 bg-[var(--badge-red-bg)] p-4 text-sm text-[var(--badge-red-text)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{draftState.error ?? 'We could not draft this section yet.'}</span>
            </div>
            <button
              type="button"
              onClick={onGenerateDraft}
              className="mt-3 rounded-lg border border-[var(--badge-red-text)]/28 bg-[var(--surface-1)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--badge-red-text)] transition-colors hover:bg-[var(--surface-2)]"
            >
              Try again
            </button>
          </div>
        ) : null}

        {draftState?.status === 'ready' && result && recommendedVariant ? (
          <div className="mt-4 space-y-4">
            <VariantContent variant={recommendedVariant} />

            <SectionQuickActions
              primaryActions={actions.primary}
              secondaryActions={actions.secondary}
              refiningActionId={draftState.refinementActionId}
              showMore={showMoreActions}
              onToggleMore={() => setShowMoreActions((current) => !current)}
              onEdit={handleStartManualEdit}
              onRefine={(actionId) => {
                void onRefineDraft(actionId, isEditingManually ? editorText : recommendedText);
              }}
            />

            {draftState.refinementError && (
              <div className="rounded-2xl border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-bg)] p-4 text-sm text-[var(--badge-red-text)]">
                {draftState.refinementError}
              </div>
            )}

            {isEditingManually && (
              <SectionManualEditor
                value={editorText}
                onChange={setEditorText}
                onApply={handleApplyEditedVersion}
                onReset={handleResetEditor}
                onCancel={() => setIsEditingManually(false)}
                onAssist={(actionId) => {
                  void onRefineDraft(actionId, editorText);
                }}
                assistActions={actions.editorAssist}
                refiningActionId={draftState.refinementActionId}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onApplyVariant(recommendedVariant)}
                className="rounded-lg bg-[var(--link)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-95"
              >
                Use this version
              </button>
              {alternateVariants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllVersions((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
                >
                  {showAllVersions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showAllVersions ? 'Hide other versions' : 'Show other versions'}
                </button>
              )}
              <button
                type="button"
                onClick={onGenerateDraft}
                className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
              >
                Regenerate
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                Why this works
              </p>
              <ul className="mt-3 space-y-2">
                {result.whyItWorks.map((line) => (
                  <li key={line} className="flex gap-2 text-sm leading-6 text-[var(--text-strong)]">
                    <span className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-[var(--text-soft)]/70" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {result.strengtheningNote && (
              <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  One thing that could make this stronger
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-strong)]">
                  {result.strengtheningNote}
                </p>
              </div>
            )}

            {alternateVariants.length > 0 && (
              <div className={cn('space-y-4', !showAllVersions && 'hidden')}>
                {alternateVariants.map((variant) => (
                  <div key={variant.id} className="space-y-3">
                    <VariantContent variant={variant} />
                    <button
                      type="button"
                      onClick={() => onApplyVariant(variant)}
                      className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
                    >
                      Use {variant.label.toLowerCase()}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
