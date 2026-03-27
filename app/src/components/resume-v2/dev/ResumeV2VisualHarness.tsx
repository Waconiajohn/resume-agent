import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { FinalReviewConcern, ResumeDraft } from '@/types/resume-v2';
import type { PendingEdit, EditAction } from '@/hooks/useInlineEdit';
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

function parseScenario(search: string): ResumeV2VisualScenarioId {
  const params = new URLSearchParams(search);
  const value = params.get('scenario');
  if (value === 'final-review' || value === 'ready' || value === 'attention' || value === 'action-state') return value;
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

export function ResumeV2VisualHarness() {
  const location = useLocation();
  const scenarioId = parseScenario(location.search);
  const scenario = useMemo(() => getResumeV2VisualScenario(scenarioId), [scenarioId]);
  const [editableResume, setEditableResume] = useState<ResumeDraft>(() => cloneResume(scenario.editableResume));
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setEditableResume(cloneResume(scenario.editableResume));
    setPendingEdit(null);
    setIsEditing(false);
  }, [scenario]);

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
          postReviewPolish={undefined}
          initialActiveBullet={scenario.initialActiveBullet ?? null}
        />
      </div>
    </div>
  );
}
