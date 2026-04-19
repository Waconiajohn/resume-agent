/**
 * V3PipelineScreen — top-level v3 resume UI.
 *
 * Composes intake → pipeline progress → (strategy, resume, verify panels).
 * State lives in useV3Pipeline. The screen is stateless beyond UI concerns.
 *
 * Layout:
 *   ┌─ Header + reset button
 *   ├─ Stage progress strip (5 dots)
 *   ├─ Intake form (when no pipeline is running)  OR
 *   └─ Results layout:
 *      ┌─ 3-col grid on desktop
 *      │  ├─ Strategy panel (left)
 *      │  ├─ Resume view (center, widest)
 *      │  └─ Verify panel (right)
 */

import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { AlertTriangle, RefreshCw, Pencil, Undo2 } from 'lucide-react';
import {
  useV3Pipeline,
  type StartV3PipelineInput,
  type V3SuggestedPatch,
  type V3WrittenResume,
  type V3Bullet,
} from '@/hooks/useV3Pipeline';
import { useV3Master } from '@/hooks/useV3Master';
import { V3StageProgress } from './V3StageProgress';
import { V3IntakeForm } from './V3IntakeForm';
import { V3StrategyPanel } from './V3StrategyPanel';
import { V3ResumeView } from './V3ResumeView';
import { V3VerifyPanel } from './V3VerifyPanel';
import { V3PromotePanel } from './V3PromotePanel';

interface V3PipelineScreenProps {
  accessToken: string | null;
  initialResumeText?: string;
}

/**
 * Shared cross-panel cue. Bumping `.at` on each interaction re-triggers the
 * flash animation even when the target key is unchanged (e.g. Address is
 * clicked twice on the same row).
 */
interface FocusCue {
  key: string;
  section: string;
  at: number;
}

/**
 * Apply a translator-provided patch to a WrittenResume. Returns a new
 * WrittenResume (immutable update) or null if the target path is
 * unrecognized — the Zod regex on the server side already gates this, so
 * hitting the null branch means either a bug or a stale translator output.
 *
 * Target semantics:
 *   - `summary` → replace `summary` with patch text
 *   - `selectedAccomplishments` → append patch text to the array
 *   - `positions[N]` → append a new is_new bullet to position N
 */
function applyPatchToWritten(
  w: V3WrittenResume,
  patch: V3SuggestedPatch,
): V3WrittenResume | null {
  if (patch.target === 'summary') {
    return { ...w, summary: patch.text };
  }
  if (patch.target === 'selectedAccomplishments') {
    return {
      ...w,
      selectedAccomplishments: [...w.selectedAccomplishments, patch.text],
    };
  }
  const posMatch = patch.target.match(/^positions\[(\d+)\]$/);
  if (posMatch) {
    const idx = Number(posMatch[1]);
    const pos = w.positions[idx];
    if (!pos) return null;
    const newBullet: V3Bullet = {
      text: patch.text,
      is_new: true,
      source: null,
      evidence_found: false,
      confidence: 0.75,
    };
    const positions = w.positions.slice();
    positions[idx] = { ...pos, bullets: [...pos.bullets, newBullet] };
    return { ...w, positions };
  }
  return null;
}

export function V3PipelineScreen({ accessToken, initialResumeText }: V3PipelineScreenProps) {
  const pipeline = useV3Pipeline(accessToken);
  const master = useV3Master(accessToken);
  const location = useLocation();
  const [editedWritten, setEditedWritten] = useState<typeof pipeline.written | null>(null);

  // Three-panel cross-scroll state (Phase 2). Lives here so both the Resume
  // view (middle) and the Review panel (right) can react to the same events.
  const [focusCue, setFocusCue] = useState<FocusCue | null>(null);
  const [dismissedIssueKeys, setDismissedIssueKeys] = useState<Set<string>>(new Set());
  // Phase 3: issues whose resolution came from clicking Apply on a pre-written
  // patch. Tracked separately from dismissal so the strip can show a success
  // badge for these instead of the generic "dismissed" tag.
  const [appliedIssueKeys, setAppliedIssueKeys] = useState<Set<string>>(new Set());
  // Strategy card flash target — when the user clicks a bullet's source chip,
  // the strategy panel flashes any emphasized-accomplishment cards tied to
  // that bullet's position (cross-panel trace #2 from the phase 2 spec).
  const [strategyFlash, setStrategyFlash] = useState<{ positionIndex: number; at: number } | null>(null);

  // sessionId comes from the backend's pipeline_complete event and is the
  // real coach_sessions.id for this run. Promote UI uses it so evidence
  // items reference a real audit-trail row.
  const sessionId = pipeline.sessionId;

  // Networking Intelligence hand-off: /resume-builder/session?jdUrl=<url>
  // prefills the JD URL field so V3IntakeForm auto-fetches on mount.
  const initialJobUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('jdUrl')?.trim() ?? undefined;
  }, [location.search]);

  const showIntake = !pipeline.isRunning && !pipeline.isComplete && !pipeline.error;
  const showResults = pipeline.isRunning || pipeline.isComplete || Boolean(pipeline.error);
  const effectiveWritten = editedWritten ?? pipeline.written;

  const handleStart = (input: StartV3PipelineInput) => {
    setEditedWritten(null);
    setFocusCue(null);
    setDismissedIssueKeys(new Set());
    setAppliedIssueKeys(new Set());
    setStrategyFlash(null);
    void pipeline.start(input);
  };

  const handleReset = () => {
    pipeline.reset();
    setEditedWritten(null);
    setFocusCue(null);
    setDismissedIssueKeys(new Set());
    setAppliedIssueKeys(new Set());
    setStrategyFlash(null);
  };

  const handleFocusIssue = useCallback((key: string, section: string) => {
    setFocusCue({ key, section, at: Date.now() });
  }, []);

  const handleDismissIssue = useCallback((key: string) => {
    setDismissedIssueKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const handleUndismissIssue = useCallback((key: string) => {
    setDismissedIssueKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleSourceChipClick = useCallback((positionIndex: number) => {
    setStrategyFlash({ positionIndex, at: Date.now() });
  }, []);

  // Apply a translator-provided patch to editedWritten and mark the issue
  // resolved. The apply targets come from the verify-translate.v1 prompt's
  // suggestedPatches — additive only (never rewrite-class), enforced
  // server-side by the Zod target regex.
  const handleApplyPatch = useCallback(
    (issueKey: string, patch: V3SuggestedPatch) => {
      const base = editedWritten ?? pipeline.written;
      if (!base) return;
      const next = applyPatchToWritten(base, patch);
      if (!next) return;
      setEditedWritten(next);
      setAppliedIssueKeys((prev) => {
        if (prev.has(issueKey)) return prev;
        const s = new Set(prev);
        s.add(issueKey);
        return s;
      });
    },
    [editedWritten, pipeline.written],
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-[var(--bg-0)]">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        {/* Header strip */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--bullet-confirm)]">
              Resume v3
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              Attribution-first resume tailoring
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editedWritten && (
              <>
                <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--bullet-confirm)] px-2 py-1 rounded bg-[var(--bullet-confirm-bg)] border border-[var(--bullet-confirm-border)]">
                  <Pencil className="h-3 w-3" />
                  Edited
                </div>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditedWritten(null)}
                >
                  <Undo2 className="h-4 w-4 mr-1.5" />
                  Reset to generated
                </GlassButton>
              </>
            )}
            {showResults && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={pipeline.isRunning}
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Start over
              </GlassButton>
            )}
          </div>
        </div>

        {/* Stage progress (visible whenever a run has started) */}
        {showResults && (
          <GlassCard className="p-6">
            <V3StageProgress
              stageStatus={pipeline.stageStatus}
              currentStage={pipeline.currentStage}
            />
            {pipeline.costs && (
              <div className="mt-4 flex items-center justify-end gap-4 text-[11px] text-[var(--text-soft)]">
                {pipeline.timings?.totalMs !== undefined && (
                  <span>
                    {(pipeline.timings.totalMs / 1000).toFixed(1)}s
                  </span>
                )}
                <span>
                  ${pipeline.costs.total.toFixed(3)}
                </span>
              </div>
            )}
          </GlassCard>
        )}

        {/* Error banner */}
        {pipeline.error && (
          <GlassCard className="p-4 border-[var(--badge-red-text)]/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--badge-red-text)] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Pipeline failed {pipeline.errorStage ? `at ${pipeline.errorStage}` : ''}
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1 font-mono text-[12px]">
                  {pipeline.error}
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Intake form */}
        {showIntake && (
          <V3IntakeForm
            onSubmit={handleStart}
            initialResumeText={initialResumeText}
            disabled={pipeline.isRunning}
            master={master.summary}
            accessToken={accessToken}
            initialJobUrl={initialJobUrl}
          />
        )}

        {/* Edit hint once pipeline is complete */}
        {pipeline.isComplete && !pipeline.error && !editedWritten && (
          <div className="text-[11px] text-[var(--text-soft)] flex items-center gap-1.5">
            <Pencil className="h-3 w-3" />
            Click any bullet or the summary to edit. Press Enter to save, Esc to cancel.
          </div>
        )}

        {/* Results layout */}
        {showResults && (
          <div className="grid lg:grid-cols-[320px_1fr_300px] gap-6">
            {/* Left: benchmark + strategy */}
            <div className="space-y-4">
              <V3StrategyPanel
                benchmark={pipeline.benchmark}
                strategy={pipeline.strategy}
                flashPositionIndex={strategyFlash?.positionIndex ?? null}
                flashTick={strategyFlash?.at ?? 0}
              />
            </div>

            {/* Center: resume */}
            <div>
              <V3ResumeView
                structured={pipeline.structured}
                written={effectiveWritten}
                pristineWritten={pipeline.written}
                verify={pipeline.verify}
                editable={pipeline.isComplete}
                onEdit={(updated) => setEditedWritten(updated)}
                focusCue={focusCue}
                dismissedIssueKeys={dismissedIssueKeys}
                onTriangleClick={handleFocusIssue}
                onSourceChipClick={handleSourceChipClick}
              />
            </div>

            {/* Right: verify */}
            <div className="space-y-4">
              <V3VerifyPanel
                verify={pipeline.verify}
                isRunning={pipeline.isRunning}
                editedWritten={editedWritten}
                pristineWritten={pipeline.written}
                focusCue={focusCue}
                dismissedIssueKeys={dismissedIssueKeys}
                appliedIssueKeys={appliedIssueKeys}
                onAddress={handleFocusIssue}
                onDismiss={handleDismissIssue}
                onUndismiss={handleUndismissIssue}
                onApplyPatch={handleApplyPatch}
              />
            </div>
          </div>
        )}

        {/* Promote panel — wrap-up action, lives BELOW the resume so the
            primary deliverable (the resume itself) isn't buried under it.
            Collapsed by default; expands on demand. */}
        {pipeline.isComplete && !pipeline.error && pipeline.written && sessionId && (
          <V3PromotePanel
            accessToken={accessToken}
            sessionId={sessionId}
            written={editedWritten ?? pipeline.written}
            structured={pipeline.structured}
            master={master.summary}
            onSaved={() => master.refresh()}
          />
        )}
      </div>
    </div>
  );
}
