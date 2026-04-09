import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { FinalReviewConcern, GapChatContext, GapChatMessage, GapChatTargetInput, ResumeDraft } from '@/types/resume-v2';
import type { PendingEdit, EditAction } from '@/hooks/useInlineEdit';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { buildResumeSectionWorkflowViewModel } from '@/lib/resume-section-workflow';
import { V2StreamingDisplay } from '../V2StreamingDisplay';
import { scrollToAndFocusTarget } from '../useStrategyThread';
import { findResumeTargetForFinalReviewConcern } from '../utils/final-review-target';
import {
  getResumeV2VisualScenario,
  RESUME_V2_VISUAL_SCENARIOS,
  type ResumeV2VisualScenarioId,
} from './resume-v2-visual-fixtures';

function cloneResume(resume: ResumeDraft): ResumeDraft {
  return JSON.parse(JSON.stringify(resume)) as ResumeDraft;
}

function normalizeHarnessChatKey(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function parseScenario(search: string): ResumeV2VisualScenarioId {
  const params = new URLSearchParams(search);
  const value = params.get('scenario');
  if (
    value === 'final-review'
    || value === 'ready'
    || value === 'attention'
    || value === 'action-state'
    || value === 'action-partial'
    || value === 'action-benchmark'
    || value === 'action-ai-draft'
  ) return value;
  return 'attention';
}

const HARNESS_SUFFIX_PATTERNS = [
  /,\s*with clearer scope, stronger ownership, and more specific business impact\.?$/i,
  /,\s*using weekly KPI reviews across 3 sites and measurable gains in throughput and labor efficiency\.?$/i,
  /,\s*tightened into a more direct operating statement with clearer ownership and safer proof language\.?$/i,
  /,\s*recast in plainer language so it sounds closer to the candidate's voice\.?$/i,
  /\s*Strengthened with clearer scope and more specific business impact\.?$/i,
  /\s*Reframed with cleaner proof, clearer ownership, and safer scope language\.?$/i,
  /\s*Delivered measurable operating gains with clearer KPI ownership and tighter cross-site execution\.?$/i,
];

function extractWorkingDraft(selectedText: string, customInstruction?: string): string {
  if (customInstruction?.trim()) return customInstruction.trim();

  const currentDraftMatch = customInstruction?.match(/Current working draft:\s*([\s\S]+)/i);
  if (currentDraftMatch?.[1]) return currentDraftMatch[1].trim();

  const legacyMatch = customInstruction?.match(/starting point[^\n]*\n([\s\S]+)/i);
  if (legacyMatch?.[1]) return legacyMatch[1].trim();

  return selectedText.trim();
}

function normalizeHarnessBase(text: string): string {
  let cleaned = text.replace(/\s+/g, ' ').trim();
  let changed = true;

  while (changed) {
    changed = false;
    HARNESS_SUFFIX_PATTERNS.forEach((pattern) => {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, '').trim();
        changed = true;
      }
    });
  }

  return cleaned.replace(/[. ]+$/, '').trim();
}

function buildHarnessReplacement(baseText: string, action: EditAction): string {
  const base = normalizeHarnessBase(baseText) || 'Reworked the line with clearer proof';

  switch (action) {
    case 'add_metrics':
      return `${base}, using weekly KPI reviews across 3 sites and measurable gains in throughput and labor efficiency.`;
    case 'shorten':
      return `${base.split(/[,;:]/)[0].trim().replace(/[. ]+$/, '')}.`;
    case 'not_my_voice':
      return `${base
        .replace(/\bchampioned\b/gi, 'led')
        .replace(/\bleveraged\b/gi, 'used')
        .replace(/\btransformed\b/gi, 'improved')
        .replace(/\borchestrated\b/gi, 'ran')
        .replace(/[. ]+$/, '')}, recast in plainer language so it sounds closer to the candidate's voice.`;
    case 'rewrite':
      return `${base}, tightened into a more direct operating statement with clearer ownership and safer proof language.`;
    case 'strengthen':
    case 'custom':
    default:
      return `${base}, with clearer scope, stronger ownership, and more specific business impact.`;
  }
}

function getHarnessLineText(resume: ResumeDraft, section?: string, index?: number): string {
  if (!section) return '';
  if (section === 'executive_summary') {
    return resume.executive_summary.content;
  }
  if (section === 'core_competencies' && typeof index === 'number' && index >= 0) {
    return resume.core_competencies[index] ?? '';
  }
  if (section === 'selected_accomplishments' && typeof index === 'number' && index >= 0) {
    return resume.selected_accomplishments[index]?.content ?? '';
  }
  if (section === 'professional_experience' && typeof index === 'number' && index >= 0) {
    const experienceIndex = Math.floor(index / 100);
    const bulletOffset = index % 100;
    return resume.professional_experience[experienceIndex]?.bullets[bulletOffset]?.text ?? '';
  }
  if (section.startsWith('custom_section:') && typeof index === 'number') {
    const customSectionId = section.replace('custom_section:', '');
    const customSection = resume.custom_sections?.find((item) => item.id === customSectionId);
    if (!customSection) return '';
    if (index === -1) return customSection.summary ?? '';
    return customSection.lines[index] ?? '';
  }
  return '';
}

function getHarnessLineKind(section?: string): GapChatContext['lineKind'] {
  if (section === 'executive_summary') return 'summary';
  if (section === 'core_competencies') return 'competency';
  if (section?.startsWith('custom_section:')) return 'custom_line';
  return 'bullet';
}

function getHarnessSectionLabel(section: string | undefined, resume: ResumeDraft): string {
  if (section === 'executive_summary') return 'Executive Summary';
  if (section === 'core_competencies') return 'Core Competencies';
  if (section === 'selected_accomplishments') return 'Selected Accomplishments';
  if (section === 'professional_experience') return 'Professional Experience';
  if (section?.startsWith('custom_section:')) {
    const customSectionId = section.replace('custom_section:', '');
    return resume.custom_sections?.find((item) => item.id === customSectionId)?.title ?? 'Custom Section';
  }
  return 'Resume Line';
}

function buildHarnessAssistantMessage(args: {
  requirement: string;
  context: GapChatContext;
  userMessage: string;
  classification: 'partial' | 'missing' | 'strong';
}): GapChatMessage {
  const { requirement, context, userMessage, classification } = args;
  const baseText = context.lineText?.trim() || requirement;
  const suggestion = buildHarnessReplacement(
    baseText,
    classification === 'missing' ? 'rewrite' : userMessage.toLowerCase().includes('metric') ? 'add_metrics' : 'strengthen',
  );
  const responseLead = classification === 'missing'
    ? 'Use the real evidence you already have, soften the claim, and anchor it in a more believable operating story.'
    : 'Tighten the claim so the role fit and business impact land faster.';

  return {
    role: 'assistant',
    content: `${responseLead} Start from the strongest truthful version below, then keep only the detail that you could defend in an interview.`,
    suggestedLanguage: suggestion,
    followUpQuestion: context.clarifyingQuestions?.[0],
    currentQuestion: context.clarifyingQuestions?.[0],
    needsCandidateInput: classification === 'missing',
    recommendedNextAction: classification === 'missing' ? 'answer_question' : 'review_edit',
  };
}

export function ResumeV2VisualHarness() {
  const location = useLocation();
  const scenarioId = parseScenario(location.search);
  const scenario = useMemo(() => getResumeV2VisualScenario(scenarioId), [scenarioId]);
  const enableHarnessCoach = scenarioId !== 'final-review';
  const [editableResume, setEditableResume] = useState<ResumeDraft>(() => cloneResume(scenario.editableResume));
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(scenario.initialPendingEdit ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [harnessChatItems, setHarnessChatItems] = useState<Record<string, {
    messages: GapChatMessage[];
    isLoading: boolean;
    resolvedLanguage: string | null;
    error: string | null;
  }>>({});

  useEffect(() => {
    setEditableResume(cloneResume(scenario.editableResume));
    setPendingEdit(scenario.initialPendingEdit ?? null);
    setIsEditing(false);
    setHarnessChatItems({});
  }, [scenario]);

  const buildChatContext = useCallback((target: string | GapChatTargetInput): GapChatContext => {
    const currentTarget = typeof target === 'string'
      ? { requirement: target }
      : target;
    const requirement = currentTarget.requirement?.trim()
      || currentTarget.requirements?.[0]?.trim()
      || '';
    const lineText = currentTarget.lineText?.trim()
      || getHarnessLineText(editableResume, currentTarget.section, currentTarget.index)
      || '';
    const gapRequirement = scenario.data.gapAnalysis?.requirements.find((item) => (
      item.requirement.toLowerCase() === requirement.toLowerCase()
      || item.requirement.toLowerCase().includes(requirement.toLowerCase())
      || requirement.toLowerCase().includes(item.requirement.toLowerCase())
    ));
    const evidence = Array.from(new Set([
      currentTarget.evidenceFound ?? '',
      ...(gapRequirement?.evidence ?? []),
    ].filter((value) => typeof value === 'string' && value.trim().length > 0)));
    const lineKind = getHarnessLineKind(currentTarget.section);
    const clarifyingQuestion = gapRequirement?.classification === 'missing'
      ? `Where did you use ${requirement || 'this capability'} in a way that changed decisions or outcomes?`
      : `What concrete metric, scope, or business result would make ${requirement || 'this claim'} easier to trust right away?`;

    return {
      evidence,
      currentStrategy: lineText || requirement,
      jobDescriptionExcerpt: gapRequirement?.source_evidence
        ?? scenario.data.jobIntelligence?.core_competencies[0]?.evidence_from_jd
        ?? '',
      candidateExperienceSummary: 'Visual harness coaching context for the Resume V2 editor.',
      alternativeBullets: lineText
        ? [
            { text: buildHarnessReplacement(lineText, 'strengthen'), angle: 'impact' },
            { text: buildHarnessReplacement(lineText, 'add_metrics'), angle: 'metric' },
          ]
        : [],
      primaryRequirement: requirement || lineText,
      requirementSource: gapRequirement?.source ?? 'job_description',
      sourceEvidence: gapRequirement?.source_evidence,
      lineText: lineText || undefined,
      lineKind,
      sectionKey: currentTarget.section,
      sectionLabel: getHarnessSectionLabel(currentTarget.section, editableResume),
      relatedRequirements: currentTarget.requirements ?? (requirement ? [requirement] : []),
      coachingGoal: lineKind === 'summary'
        ? 'Sharpen the opening story so role fit and executive scope are obvious immediately.'
        : 'Rewrite this line so it feels more specific, more credible, and more obviously relevant to the role.',
      clarifyingQuestions: [clarifyingQuestion],
      priorClarifications: [],
      relatedLineCandidates: [],
    };
  }, [editableResume, scenario.data.gapAnalysis?.requirements, scenario.data.jobIntelligence?.core_competencies]);

  const sectionDrafts = useMemo(() => {
    if (scenarioId !== 'final-review') return {};

    const workflow = buildResumeSectionWorkflowViewModel({
      resume: editableResume,
      requirementWorkItems: scenario.data.requirementWorkItems ?? scenario.data.gapAnalysis?.requirement_work_items ?? [],
      candidateIntelligence: scenario.data.candidateIntelligence,
    });

    return Object.fromEntries(
      workflow.steps.map((step, index) => [
        step.id,
        {
          status: 'ready' as const,
          error: null,
          result: {
            recommendedVariantId: 'recommended' as const,
            variants: [
              {
                id: 'recommended' as const,
                label: 'Recommended',
                helper: 'Best fit for the role.',
                content: {
                  kind: 'paragraph' as const,
                  paragraph: `Recommended draft for ${step.title} ${index + 1}.`,
                },
              },
              {
                id: 'safer' as const,
                label: 'Safer',
                helper: 'More conservative wording.',
                content: {
                  kind: 'paragraph' as const,
                  paragraph: `Safer draft for ${step.title} ${index + 1}.`,
                },
              },
              {
                id: 'stronger' as const,
                label: 'Stronger',
                helper: 'Use only if fully supported.',
                content: {
                  kind: 'paragraph' as const,
                  paragraph: `Stronger draft for ${step.title} ${index + 1}.`,
                },
              },
            ],
            whyItWorks: [`Explains why ${step.title} is stronger for this role.`],
            strengtheningNote: 'Add one specific scope or outcome if the candidate can support it.',
          },
        },
      ]),
    );
  }, [
    editableResume,
    scenario.data.candidateIntelligence,
    scenario.data.gapAnalysis?.requirement_work_items,
    scenario.data.requirementWorkItems,
    scenarioId,
  ]);

  const harnessGapChat = useMemo<GapChatHook>(() => ({
    getItemState: (requirement: string) => harnessChatItems[normalizeHarnessChatKey(requirement)],
    sendMessage: async (
      requirement: string,
      message: string,
      context: GapChatContext,
      classification: 'partial' | 'missing' | 'strong',
    ) => {
      const key = normalizeHarnessChatKey(requirement);
      setHarnessChatItems((current) => {
        const item = current[key] ?? { messages: [], isLoading: false, resolvedLanguage: null, error: null };
        return {
          ...current,
          [key]: {
            ...item,
            isLoading: true,
            messages: [...item.messages, { role: 'user', content: message }],
            error: null,
          },
        };
      });

      await Promise.resolve();

      const assistantMessage = buildHarnessAssistantMessage({
        requirement,
        context,
        userMessage: message,
        classification,
      });

      setHarnessChatItems((current) => {
        const item = current[key] ?? { messages: [], isLoading: false, resolvedLanguage: null, error: null };
        return {
          ...current,
          [key]: {
            ...item,
            isLoading: false,
            messages: [...item.messages, assistantMessage],
          },
        };
      });
    },
    acceptLanguage: (requirement: string, language: string) => {
      const key = normalizeHarnessChatKey(requirement);
      setHarnessChatItems((current) => {
        const item = current[key] ?? { messages: [], isLoading: false, resolvedLanguage: null, error: null };
        return {
          ...current,
          [key]: {
            ...item,
            resolvedLanguage: language,
          },
        };
      });
    },
    clearResolvedLanguage: (requirement: string) => {
      const key = normalizeHarnessChatKey(requirement);
      setHarnessChatItems((current) => {
        const item = current[key] ?? { messages: [], isLoading: false, resolvedLanguage: null, error: null };
        return {
          ...current,
          [key]: {
            ...item,
            resolvedLanguage: null,
          },
        };
      });
    },
    getSnapshot: () => ({
      items: Object.fromEntries(
        Object.entries(harnessChatItems).map(([key, item]) => [key, {
          messages: item.messages,
          resolvedLanguage: item.resolvedLanguage,
          error: item.error,
        }]),
      ),
    }),
    hydrateSnapshot: (snapshot) => {
      setHarnessChatItems(Object.fromEntries(
        Object.entries(snapshot?.items ?? {}).map(([key, item]) => [key, {
          messages: item.messages ?? [],
          isLoading: false,
          resolvedLanguage: item.resolvedLanguage ?? null,
          error: item.error ?? null,
        }]),
      ));
    },
    resetChat: () => setHarnessChatItems({}),
    resolvedCount: Object.values(harnessChatItems).filter((item) => item.resolvedLanguage !== null).length,
    isAnyLoading: Object.values(harnessChatItems).some((item) => item.isLoading),
  }), [harnessChatItems]);

  const handleHarnessEnhance = useCallback(async (
    action: string,
    bulletText: string,
    requirement: string,
  ): Promise<EnhanceResult | null> => {
    const mappedAction: EditAction = action === 'show_accountability'
      ? 'add_metrics'
      : action === 'connect_to_role'
        ? 'strengthen'
        : action === 'show_transformation'
          ? 'rewrite'
          : 'strengthen';
    const baseText = bulletText.trim() || requirement.trim() || 'Rewrite this line';
    return {
      enhancedBullet: buildHarnessReplacement(baseText, mappedAction),
      alternatives: [
        { text: buildHarnessReplacement(baseText, 'strengthen'), angle: 'impact' },
        { text: buildHarnessReplacement(baseText, 'add_metrics'), angle: 'metric' },
      ],
    };
  }, []);

  const handleBulletEdit = useCallback((section: string, index: number, newText: string) => {
    setEditableResume((current) => {
      const next = cloneResume(current);
      if (section === 'selected_accomplishments') {
        if (next.selected_accomplishments[index]) {
          next.selected_accomplishments[index].content = newText;
          next.selected_accomplishments[index].confidence = 'strong';
          next.selected_accomplishments[index].evidence_found ||= 'User edited and confirmed in visual harness.';
        }
        return next;
      }

      if (section === 'professional_experience') {
        const experienceIndex = Math.floor(index / 100);
        const bulletOffset = index % 100;
        const bullet = next.professional_experience[experienceIndex]?.bullets[bulletOffset];
        if (bullet) {
          bullet.text = newText;
          bullet.confidence = 'strong';
          bullet.evidence_found ||= 'User edited and confirmed in visual harness.';
        }
      }
      return next;
    });
  }, []);

  const handleBulletRemove = useCallback((section: string, index: number) => {
    setEditableResume((current) => {
      const next = cloneResume(current);
      if (section === 'selected_accomplishments') {
        next.selected_accomplishments.splice(index, 1);
        return next;
      }

      if (section === 'professional_experience') {
        const experienceIndex = Math.floor(index / 100);
        const bulletOffset = index % 100;
        next.professional_experience[experienceIndex]?.bullets.splice(bulletOffset, 1);
      }
      return next;
    });
  }, []);

  const resolveConcernTarget = useCallback((concern: FinalReviewConcern) => (
    findResumeTargetForFinalReviewConcern(
      editableResume,
      concern,
      scenario.data.assembly?.positioning_assessment,
    )
  ), [editableResume, scenario.data.assembly?.positioning_assessment]);

  const previewConcernTarget = useCallback((concern: FinalReviewConcern) => {
    const target = resolveConcernTarget(concern);
    if (!target?.selector) return;
    scrollToAndFocusTarget(target.selector);
  }, [resolveConcernTarget]);

  const handleRequestEdit = useCallback((
    selectedText: string,
    section: string,
    action: EditAction,
    customInstruction?: string,
  ) => {
    setIsEditing(true);
    const workingDraft = extractWorkingDraft(selectedText, customInstruction);
    const replacement = buildHarnessReplacement(workingDraft, action);

    setPendingEdit({
      section,
      originalText: selectedText,
      replacement,
      action,
      editContext: {
        origin: 'manual',
      },
    });
    setIsEditing(false);
  }, []);

  const handleAcceptEdit = useCallback((newText: string) => {
    if (!pendingEdit) return;

    setEditableResume((current) => {
      const next = cloneResume(current);
      if (pendingEdit.section === 'selected_accomplishments') {
        const index = next.selected_accomplishments.findIndex((item) => item.content === pendingEdit.originalText);
        if (index >= 0) {
          next.selected_accomplishments[index].content = newText;
          next.selected_accomplishments[index].confidence = 'strong';
          next.selected_accomplishments[index].evidence_found ||= 'Accepted from visual harness draft.';
        }
        return next;
      }

      if (pendingEdit.section === 'professional_experience') {
        for (const experience of next.professional_experience) {
          const bullet = experience.bullets.find((item) => item.text === pendingEdit.originalText);
          if (bullet) {
            bullet.text = newText;
            bullet.confidence = 'strong';
            bullet.evidence_found ||= 'Accepted from visual harness draft.';
            break;
          }
        }
      }

      return next;
    });

    setPendingEdit(null);
  }, [pendingEdit]);

  const handleRejectEdit = useCallback(() => {
    setPendingEdit(null);
    setIsEditing(false);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-strong)]">
      <div className="mx-auto max-w-[1200px] px-6 py-6 space-y-6">
        <header
          data-testid="resume-v2-visual-harness"
          className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-5 py-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
                Resume V2 Visual Harness
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">{scenario.label}</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{scenario.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {RESUME_V2_VISUAL_SCENARIOS.map((id) => {
                const option = getResumeV2VisualScenario(id);
                const active = id === scenarioId;
                return (
                  <Link
                    key={id}
                    to={`/__dev/resume-v2-visual?scenario=${id}`}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                      active
                        ? 'border-[var(--line-strong)] bg-[var(--accent-muted)] text-[var(--text-strong)]'
                        : 'border-[var(--line-soft)] bg-[var(--surface-0)] text-[var(--text-soft)] hover:text-[var(--text-strong)]'
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </header>

        <V2StreamingDisplay
          data={{
            ...scenario.data,
            resumeDraft: editableResume,
            assembly: scenario.data.assembly
              ? {
                  ...scenario.data.assembly,
                  final_resume: editableResume,
                }
              : null,
          }}
          isComplete
          isConnected
          error={null}
          editableResume={editableResume}
          pendingEdit={pendingEdit}
          isEditing={isEditing}
          editError={null}
          undoCount={0}
          redoCount={0}
          onBulletEdit={handleBulletEdit}
          onBulletRemove={handleBulletRemove}
          onRequestEdit={handleRequestEdit}
          onAcceptEdit={handleAcceptEdit}
          onRejectEdit={handleRejectEdit}
          onUndo={() => {}}
          onRedo={() => {}}
          onAddContext={() => {}}
          isRerunning={false}
          liveScores={null}
          isScoring={false}
          gapCoachingCards={scenario.data.gapCoachingCards}
          onRespondGapCoaching={() => {}}
          preScores={scenario.data.preScores}
          previousResume={null}
          hiringManagerResult={scenario.hiringManagerResult ?? null}
          resolvedFinalReviewConcernIds={[]}
          isFinalReviewStale={scenario.isFinalReviewStale}
          finalReviewWarningsAcknowledged
          onRequestHiringManagerReview={() => {}}
          onApplyHiringManagerRecommendation={() => {}}
          resolveFinalReviewTarget={resolveConcernTarget}
          onPreviewFinalReviewTarget={previewConcernTarget}
          gapChat={enableHarnessCoach ? harnessGapChat : undefined}
          buildChatContext={enableHarnessCoach ? buildChatContext : undefined}
          onBulletEnhance={handleHarnessEnhance}
          postReviewPolish={undefined}
          initialActiveBullet={scenario.initialActiveBullet ?? null}
          sectionDrafts={sectionDrafts}
          onApplySectionDraft={() => {}}
        />
      </div>
    </div>
  );
}
