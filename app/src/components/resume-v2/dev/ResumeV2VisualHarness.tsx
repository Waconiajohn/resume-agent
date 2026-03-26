import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { FinalReviewConcern, ResumeDraft } from '@/types/resume-v2';
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
  if (value === 'final-review' || value === 'ready' || value === 'attention') return value;
  return 'attention';
}

export function ResumeV2VisualHarness() {
  const location = useLocation();
  const scenarioId = parseScenario(location.search);
  const scenario = useMemo(() => getResumeV2VisualScenario(scenarioId), [scenarioId]);
  const [editableResume, setEditableResume] = useState<ResumeDraft>(() => cloneResume(scenario.editableResume));

  useEffect(() => {
    setEditableResume(cloneResume(scenario.editableResume));
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
          pendingEdit={null}
          isEditing={false}
          editError={null}
          undoCount={0}
          redoCount={0}
          onBulletEdit={handleBulletEdit}
          onBulletRemove={handleBulletRemove}
          onRequestEdit={() => {}}
          onAcceptEdit={() => {}}
          onRejectEdit={() => {}}
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
        />
      </div>
    </div>
  );
}
