import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import {
  buildFallbackSectionDraftResult,
  replaceSectionDraftVariantText,
  type ResumeSectionDraftResult,
  type ResumeWorkflowSectionStepViewModel,
} from '@/lib/resume-section-workflow';
import {
  buildSectionRefineInstruction,
  getSectionRefineActionLabel,
  type SectionRefineActionId,
} from '@/lib/section-draft-refinement';

interface GenerateSectionDraftArgs {
  step: ResumeWorkflowSectionStepViewModel;
  force?: boolean;
}

interface RefineSectionDraftArgs {
  step: ResumeWorkflowSectionStepViewModel;
  actionId: SectionRefineActionId;
  workingDraft: string;
  fullResumeText: string;
  jobDescription: string;
  sectionContext?: string;
}

type SectionDraftStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SectionDraftState {
  status: SectionDraftStatus;
  result: ResumeSectionDraftResult | null;
  error: string | null;
  isRefining?: boolean;
  refinementActionId?: SectionRefineActionId | null;
  refinementError?: string | null;
}

export function useSectionDraft(accessToken: string | null, sessionId: string | null) {
  const [drafts, setDrafts] = useState<Record<string, SectionDraftState>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  const generateDraft = useCallback(async ({ step, force = false }: GenerateSectionDraftArgs): Promise<ResumeSectionDraftResult | null> => {
    if (!accessToken || !sessionId) return null;

    const existing = drafts[step.id];
    if (!force && existing?.status === 'ready' && existing.result) {
      return existing.result;
    }
    if (!force && existing?.status === 'loading') {
      return null;
    }

    abortControllers.current[step.id]?.abort();
    const controller = new AbortController();
    abortControllers.current[step.id] = controller;

    setDrafts((previous) => ({
      ...previous,
      [step.id]: {
        status: 'loading',
        result: previous[step.id]?.result ?? null,
        error: null,
        isRefining: false,
        refinementActionId: null,
        refinementError: null,
      },
    }));

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/section-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          step_id: step.id,
          section_kind: step.kind,
          section_key: step.sectionKey,
          section_title: step.title,
          current_content: step.currentContent,
          requirement_focus: step.topRequirements.map((entry) => entry.requirement),
          why_this_section_matters: step.sectionRationale,
          step_number: step.stepNumber,
          total_steps: step.totalSteps,
          experience_index: step.experienceIndex,
          custom_section_id: step.customSectionId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const payload = data as { error?: string; message?: string };
        throw new Error(payload.message ?? payload.error ?? `Server error ${response.status}`);
      }

      const data = await response.json() as ResumeSectionDraftResult;
      setDrafts((previous) => ({
        ...previous,
        [step.id]: {
          status: 'ready',
          result: data,
          error: null,
          isRefining: false,
          refinementActionId: null,
          refinementError: null,
        },
      }));
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return null;
      const _message = error instanceof Error ? error.message : 'Unable to draft this section.';
      const fallback = buildFallbackSectionDraftResult(step, {
        note: 'This draft keeps the section grounded in the current resume so you can keep moving while live drafting catches up.',
      });
      setDrafts((previous) => ({
        ...previous,
        [step.id]: {
          status: 'ready',
          result: fallback,
          error: null,
          isRefining: false,
          refinementActionId: null,
          refinementError: null,
        },
      }));
      return fallback;
    }
  }, [accessToken, drafts, sessionId]);

  const refineDraft = useCallback(async ({
    step,
    actionId,
    workingDraft,
    fullResumeText,
    jobDescription,
    sectionContext,
  }: RefineSectionDraftArgs): Promise<ResumeSectionDraftResult | null> => {
    if (!accessToken || !sessionId || !workingDraft.trim()) return null;

    const existingResult = drafts[step.id]?.result ?? buildFallbackSectionDraftResult(step);
    const recommendedVariant = existingResult.variants.find((variant) => variant.id === existingResult.recommendedVariantId)
      ?? existingResult.variants[0];
    if (!recommendedVariant) return existingResult;

    setDrafts((previous) => ({
      ...previous,
      [step.id]: {
        status: 'ready',
        result: previous[step.id]?.result ?? existingResult,
        error: null,
        isRefining: true,
        refinementActionId: actionId,
        refinementError: null,
      },
    }));

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'custom',
          selected_text: workingDraft,
          section: step.title,
          full_resume_context: fullResumeText,
          job_description: jobDescription,
          custom_instruction: buildSectionRefineInstruction(step, actionId),
          working_draft: workingDraft,
          section_context: sectionContext,
          edit_context: {
            requirement: step.topRequirements[0]?.requirement,
            evidence: step.topRequirements.map((entry) => entry.evidencePreview).filter(Boolean),
            strategy: step.sectionRationale,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const payload = data as { error?: string; message?: string };
        throw new Error(payload.message ?? payload.error ?? `Server error ${response.status}`);
      }

      const data = await response.json() as { replacement?: string };
      const replacement = data.replacement?.trim();
      if (!replacement) {
        throw new Error('The AI did not return a usable section rewrite.');
      }

      const nextRecommendedVariant = replaceSectionDraftVariantText(recommendedVariant, replacement);
      const nextResult: ResumeSectionDraftResult = {
        ...existingResult,
        variants: existingResult.variants.map((variant) => (
          variant.id === nextRecommendedVariant.id
            ? {
                ...nextRecommendedVariant,
                helper: `${getSectionRefineActionLabel(actionId)} applied to the current draft.`,
              }
            : variant
        )),
        strengtheningNote: 'You can keep refining this version or edit it manually before you apply it.',
      };

      setDrafts((previous) => ({
        ...previous,
        [step.id]: {
          status: 'ready',
          result: nextResult,
          error: null,
          isRefining: false,
          refinementActionId: null,
          refinementError: null,
        },
      }));
      return nextResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refine this section.';
      setDrafts((previous) => ({
        ...previous,
        [step.id]: {
          status: 'ready',
          result: previous[step.id]?.result ?? existingResult,
          error: null,
          isRefining: false,
          refinementActionId: null,
          refinementError: message,
        },
      }));
      return existingResult;
    }
  }, [accessToken, drafts, sessionId]);

  const clearDraft = useCallback((stepId: string) => {
    abortControllers.current[stepId]?.abort();
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[stepId];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    Object.values(abortControllers.current).forEach((controller) => controller.abort());
    abortControllers.current = {};
    setDrafts({});
  }, []);

  return {
    drafts,
    generateDraft,
    refineDraft,
    clearDraft,
    resetAll,
  };
}
