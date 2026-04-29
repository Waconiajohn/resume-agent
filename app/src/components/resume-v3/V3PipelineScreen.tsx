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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { AlertTriangle, RefreshCw, Pencil, Undo2 } from 'lucide-react';
import {
  useV3Pipeline,
  type StartV3PipelineInput,
  type V3DiscoveryAnswer,
  type V3SuggestedPatch,
  type V3Strategy,
  type V3WrittenResume,
  type V3Bullet,
  type V3VerifyResult,
} from '@/hooks/useV3Pipeline';
import { useV3Master } from '@/hooks/useV3Master';
import { useV3Regenerate, type PositionWeight } from '@/hooks/useV3Regenerate';
import { useV3SessionPersistence, type V3SessionSnapshot } from '@/hooks/useV3SessionPersistence';
import { useAuth } from '@/hooks/useAuth';
import { V3StageProgress } from './V3StageProgress';
import { V3IntakeForm } from './V3IntakeForm';
import { V3StrategyPanel } from './V3StrategyPanel';
import { V3ResumeView } from './V3ResumeView';
import { V3VerifyPanel } from './V3VerifyPanel';
import { V3PromotePanel } from './V3PromotePanel';
import { V3ResumeBanner } from './V3ResumeBanner';
import { V3ExportBar } from './V3ExportBar';
import { IAppliedCTA } from '@/components/applications/IAppliedCTA';
import { WhatsNextCTABar } from '@/components/applications/WhatsNextCTABar';
import {
  OrphanSessionBanner,
  StaleApplicationBanner,
  StandaloneDeprecationBanner,
} from '@/components/applications/StandalonePathBanners';

interface V3PipelineScreenProps {
  accessToken: string | null;
  initialResumeText?: string;
  /**
   * Approach C Phase 1.3 — when rendered inside the application workspace
   * (/workspace/application/:id/resume), this is the application ID. Passed
   * through to the v3 pipeline start call so the resume generation is
   * linked to the application (coach_sessions.job_application_id). Unset
   * when the screen renders outside an application scope.
   */
  applicationId?: string;
  /**
   * Approach C Sprint A — initial values threaded from the parent application
   * (company / role / stored JD text) so the intake form prefills instead of
   * asking the user to retype what they already entered at app creation.
   * All optional; missing values just render as empty fields.
   */
  initialJobDescription?: string;
  initialJdTitle?: string;
  initialJdCompany?: string;
  initialJobUrl?: string | null;
  /** Explicit saved session route: /resume-builder/session?sessionId=... */
  initialSessionId?: string | null;
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

function discoveryAnswerKey(answer: V3DiscoveryAnswer): string {
  return `${answer.requirement.trim().toLowerCase()}::${answer.question.trim().toLowerCase()}`;
}

function mergeDiscoveryAnswers(
  existing: V3DiscoveryAnswer[],
  incoming: V3DiscoveryAnswer[],
): V3DiscoveryAnswer[] {
  const byQuestion = new Map<string, V3DiscoveryAnswer>();
  for (const answer of [...existing, ...incoming]) {
    const trimmedAnswer = answer.answer.trim();
    if (!trimmedAnswer) continue;
    byQuestion.set(discoveryAnswerKey(answer), {
      ...answer,
      answer: trimmedAnswer,
    });
  }
  return [...byQuestion.values()];
}

function shouldAskDiscoveryQuestion(
  item: NonNullable<V3Strategy['evidenceOpportunities']>[number],
): boolean {
  if (item.level === 'candidate_discovery_needed') return true;
  return item.level === 'adjacent_proof' && item.risk !== 'low';
}

function buildDiscoveryReviewWarning(
  strategy: V3Strategy | null,
  answers: V3DiscoveryAnswer[],
): { count: number; highRiskCount: number } | null {
  const opportunities = strategy?.evidenceOpportunities ?? [];
  const answered = new Set(answers.map(discoveryAnswerKey));
  const unresolved = opportunities.filter((item) => {
    if (!item.discoveryQuestion || !shouldAskDiscoveryQuestion(item)) return false;
    return !answered.has(discoveryAnswerKey({
      requirement: item.requirement,
      question: item.discoveryQuestion,
      answer: 'answered',
    }));
  });
  if (unresolved.length === 0) return null;
  return {
    count: unresolved.length,
    highRiskCount: unresolved.filter((item) => item.risk === 'high').length,
  };
}

export function V3PipelineScreen({
  accessToken,
  initialResumeText,
  applicationId,
  initialJobDescription,
  initialJdTitle,
  initialJdCompany,
  initialJobUrl: initialJobUrlProp,
  initialSessionId,
}: V3PipelineScreenProps) {
  const pipeline = useV3Pipeline(accessToken);
  const master = useV3Master(accessToken);
  const { user } = useAuth();
  const location = useLocation();
  const [editedWritten, setEditedWritten] = useState<typeof pipeline.written | null>(null);
  // Track the JD title/company that produced the current run so the banner
  // can label it on return. Stored separately from pipeline state because
  // v3 doesn't echo these back; we only know them at submit time.
  const [runJdTitle, setRunJdTitle] = useState<string | null>(null);
  const [runJdCompany, setRunJdCompany] = useState<string | null>(null);
  const [lastStartInput, setLastStartInput] = useState<StartV3PipelineInput | null>(null);
  const [confirmedDiscoveryAnswers, setConfirmedDiscoveryAnswers] = useState<V3DiscoveryAnswer[]>([]);

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
  // Phase 4: verify result override. After a regenerate, we fire reverify
  // and stash the new result here, shadowing the pipeline's original
  // verify for display purposes. Cleared on Start over.
  const [overrideVerify, setOverrideVerify] = useState<V3VerifyResult | null>(null);
  // Phase 4: the resume snapshot that was last verified. The Review panel
  // uses this (not pristineWritten) to compute staleness, so that after a
  // reverify completes, the staleness cue clears even though editedWritten
  // still diverges from the pipeline's pristine output.
  const [lastVerifiedWritten, setLastVerifiedWritten] = useState<V3WrittenResume | null>(null);
  const autoHydratedSessionRef = useRef<string | null>(null);
  const normalizedInitialSessionId = useMemo(() => initialSessionId?.trim() || null, [initialSessionId]);

  const regen = useV3Regenerate({
    accessToken,
    structured: pipeline.structured,
    strategy: pipeline.strategy,
  });

  const persistence = useV3SessionPersistence({
    accessToken,
    userId: user?.id ?? null,
    initialSessionId: normalizedInitialSessionId,
    pipeline: {
      isComplete: pipeline.isComplete,
      sessionId: pipeline.sessionId,
      structured: pipeline.structured,
      benchmark: pipeline.benchmark,
      strategy: pipeline.strategy,
      written: pipeline.written,
      verify: pipeline.verify,
      timings: pipeline.timings,
      costs: pipeline.costs,
    },
    editedWritten,
    discoveryAnswers: confirmedDiscoveryAnswers,
    jdTitle: runJdTitle,
    jdCompany: runJdCompany,
    applicationId,
  });

  // sessionId comes from the backend's pipeline_complete event and is the
  // real coach_sessions.id for this run. Promote UI uses it so evidence
  // items reference a real audit-trail row.
  const sessionId = pipeline.sessionId;

  // Networking Intelligence hand-off: /resume-builder/session?jdUrl=<url>
  // prefills the JD URL field so V3IntakeForm auto-fetches on mount.
  const initialJobUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('jdUrl')?.trim() || initialJobUrlProp?.trim() || undefined;
  }, [initialJobUrlProp, location.search]);

  // Phase 2 (pursuit timeline) — stale-FK marker. App.tsx redirects an
  // in-flight session to the standalone path with `?staleApplicationId=...`
  // when the original application was deleted. We render a banner so the
  // user knows their session isn't lost; from here they can finish work
  // and re-link via SessionHistoryTab.
  const staleApplicationId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('staleApplicationId')?.trim() ?? undefined;
  }, [location.search]);

  const showIntake = !pipeline.isRunning && !pipeline.isComplete && !pipeline.error;
  const showResults = pipeline.isRunning || pipeline.isComplete || Boolean(pipeline.error);
  const effectiveWritten = editedWritten ?? pipeline.written;
  const effectiveVerify = overrideVerify ?? pipeline.verify;
  const discoveryReviewWarning = useMemo(
    () => buildDiscoveryReviewWarning(pipeline.strategy, confirmedDiscoveryAnswers),
    [confirmedDiscoveryAnswers, pipeline.strategy],
  );

  const resetRunViewState = useCallback(() => {
    setEditedWritten(null);
    setFocusCue(null);
    setDismissedIssueKeys(new Set());
    setAppliedIssueKeys(new Set());
    setStrategyFlash(null);
    setOverrideVerify(null);
    setLastVerifiedWritten(null);
  }, []);

  const handleStart = (input: StartV3PipelineInput) => {
    resetRunViewState();
    setRunJdTitle(input.jdTitle ?? null);
    setRunJdCompany(input.jdCompany ?? null);
    // Discard the stored snapshot — once a new run starts, the old one is
    // no longer the "last" session. Server-side retains its row; only the
    // banner + localStorage pointer gets cleared.
    persistence.clear();
    // Approach C Phase 1.3 — attach the application scope to every run
    // started from this screen when we're rendered under
    // /workspace/application/:id/resume. Intake form doesn't need to know
    // about the application; it's the screen's responsibility.
    const runInput = { ...input, applicationId };
    setLastStartInput(runInput);
    setConfirmedDiscoveryAnswers(input.discoveryAnswers ?? []);
    void pipeline.start(runInput);
  };

  const handleReset = () => {
    pipeline.reset();
    resetRunViewState();
    setRunJdTitle(null);
    setRunJdCompany(null);
    setLastStartInput(null);
    setConfirmedDiscoveryAnswers([]);
    persistence.clear();
  };

  const hydrateSessionSnapshot = useCallback((snap: V3SessionSnapshot) => {
    pipeline.hydrate({
      sessionId: snap.sessionId,
      structured: snap.structured,
      benchmark: snap.benchmark,
      strategy: snap.strategy,
      written: snap.written,
      verify: snap.verify,
      timings: snap.timings,
      costs: snap.costs,
    });
    // If the user had been mid-editing when they closed the tab, restore
    // that too. Otherwise clear any stale edited state.
    setEditedWritten(snap.editedWritten ?? null);
    setRunJdTitle(snap.jdTitle ?? null);
    setRunJdCompany(snap.jdCompany ?? null);
    setLastStartInput(null);
    setConfirmedDiscoveryAnswers(snap.discoveryAnswers ?? []);
  }, [pipeline.hydrate]);

  const handleResumeLastSession = useCallback(() => {
    const snap = persistence.lastSession;
    if (!snap) return;
    hydrateSessionSnapshot(snap);
    // Dismiss the banner but keep localStorage — if they refresh during
    // this hydrated session, they get the banner again next mount.
    persistence.acknowledge();
  }, [hydrateSessionSnapshot, persistence.acknowledge, persistence.lastSession]);

  useEffect(() => {
    if (!normalizedInitialSessionId) return;
    if (pipeline.isRunning || pipeline.isComplete) return;
    const snap = persistence.lastSession;
    if (!snap || snap.sessionId !== normalizedInitialSessionId) return;
    if (autoHydratedSessionRef.current === normalizedInitialSessionId) return;

    autoHydratedSessionRef.current = normalizedInitialSessionId;
    hydrateSessionSnapshot(snap);
    persistence.acknowledge();
  }, [
    hydrateSessionSnapshot,
    normalizedInitialSessionId,
    persistence.acknowledge,
    persistence.lastSession,
    pipeline.isComplete,
    pipeline.isRunning,
  ]);

  const handleDiscardLastSession = useCallback(() => {
    persistence.clear();
  }, [persistence]);

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

  const handleRunDiscoveryAnswers = useCallback(
    (answers: V3DiscoveryAnswer[]) => {
      if (!lastStartInput || answers.length === 0) return;
      const mergedDiscoveryAnswers = mergeDiscoveryAnswers(
        lastStartInput.discoveryAnswers ?? confirmedDiscoveryAnswers,
        answers,
      );
      resetRunViewState();
      setRunJdTitle(lastStartInput.jdTitle ?? null);
      setRunJdCompany(lastStartInput.jdCompany ?? null);
      persistence.clear();
      const rerunInput = {
        ...lastStartInput,
        discoveryAnswers: mergedDiscoveryAnswers,
      };
      setLastStartInput(rerunInput);
      setConfirmedDiscoveryAnswers(mergedDiscoveryAnswers);
      void pipeline.start(rerunInput);
    },
    [confirmedDiscoveryAnswers, lastStartInput, persistence, pipeline, resetRunViewState],
  );

  // Fire-and-forget re-verify after any resume-changing action (regenerate
  // bullet, regenerate position). Silent: no spinner, the Review panel's
  // staleness cue from Phase 2 already tells the user the notes are stale;
  // this just clears them when the re-run finishes. Non-blocking so the
  // user can keep editing while verify runs.
  const scheduleReverify = useCallback(
    (written: V3WrittenResume) => {
      void (async () => {
        const result = await regen.reverify(written);
        if (result) {
          setOverrideVerify(result);
          // Record what was verified so the staleness cue can clear after
          // the re-run completes (editedWritten still diverges from pristine,
          // but it matches lastVerifiedWritten now).
          setLastVerifiedWritten(written);
        }
      })();
    },
    [regen],
  );

  const handleRegenerateBullet = useCallback(
    async (positionIndex: number, bulletIndex: number, guidance?: string) => {
      const base = editedWritten ?? pipeline.written;
      if (!base) return;
      const newBullet = await regen.regenerateBullet(positionIndex, bulletIndex, guidance);
      if (!newBullet) return;
      const positions = base.positions.slice();
      const pos = positions[positionIndex];
      if (!pos) return;
      const bullets = pos.bullets.slice();
      bullets[bulletIndex] = newBullet;
      positions[positionIndex] = { ...pos, bullets };
      const nextWritten = { ...base, positions };
      setEditedWritten(nextWritten);
      scheduleReverify(nextWritten);
    },
    [editedWritten, pipeline.written, regen, scheduleReverify],
  );

  const handleRegeneratePosition = useCallback(
    async (positionIndex: number, weight?: PositionWeight) => {
      const base = editedWritten ?? pipeline.written;
      if (!base) return;
      const newPosition = await regen.regeneratePosition(positionIndex, weight);
      if (!newPosition) return;
      const positions = base.positions.slice();
      positions[positionIndex] = newPosition;
      const nextWritten = { ...base, positions };
      setEditedWritten(nextWritten);
      scheduleReverify(nextWritten);
    },
    [editedWritten, pipeline.written, regen, scheduleReverify],
  );

  // Phase-5 AI-button consistency pass: Review row → regenerate bridge.
  // When a review note has an actionable `suggestion` AND targets a
  // regeneratable section (summary or a specific bullet), offer a button
  // that fires the existing regenerate flow with the note's suggestion
  // passed through as the guidance hint. Treats the row as "applied" for
  // the resolved-strip visual (same semantic as the Apply flow).
  const handleRegenerateFromSuggestion = useCallback(
    (issueKey: string, section: string, suggestion: string) => {
      const base = editedWritten ?? pipeline.written;
      if (!base) return;
      if (section === 'summary') {
        void (async () => {
          const newSummary = await regen.regenerateSummary(suggestion);
          if (!newSummary) return;
          const nextWritten = { ...base, summary: newSummary };
          setEditedWritten(nextWritten);
          setFocusCue({
            key: `regen-summary-${Date.now()}`,
            section: 'summary',
            at: Date.now(),
          });
          scheduleReverify(nextWritten);
        })();
      } else {
        const m = section.match(/^positions\[(\d+)\]\.bullets\[(\d+)\]$/);
        if (!m) return;
        const posIdx = Number(m[1]);
        const bulletIdx = Number(m[2]);
        void (async () => {
          const newBullet = await regen.regenerateBullet(posIdx, bulletIdx, suggestion);
          if (!newBullet) return;
          const positions = base.positions.slice();
          const pos = positions[posIdx];
          if (!pos) return;
          const bullets = pos.bullets.slice();
          bullets[bulletIdx] = newBullet;
          positions[posIdx] = { ...pos, bullets };
          const nextWritten = { ...base, positions };
          setEditedWritten(nextWritten);
          setFocusCue({
            key: `regen-bullet-${posIdx}-${bulletIdx}-${Date.now()}`,
            section,
            at: Date.now(),
          });
          scheduleReverify(nextWritten);
        })();
      }
      setAppliedIssueKeys((prev) => {
        if (prev.has(issueKey)) return prev;
        const s = new Set(prev);
        s.add(issueKey);
        return s;
      });
    },
    [editedWritten, pipeline.written, regen, scheduleReverify],
  );

  const handleRegenerateSummary = useCallback(
    async (guidance?: string) => {
      const base = editedWritten ?? pipeline.written;
      if (!base) return;
      const newSummary = await regen.regenerateSummary(guidance);
      if (!newSummary) return;
      const nextWritten = { ...base, summary: newSummary };
      setEditedWritten(nextWritten);
      // Scroll middle column to the new summary + flash it.
      setFocusCue({
        key: `regen-summary-${Date.now()}`,
        section: 'summary',
        at: Date.now(),
      });
      scheduleReverify(nextWritten);
    },
    [editedWritten, pipeline.written, regen, scheduleReverify],
  );

  // Apply a translator-provided patch to editedWritten and mark the issue
  // resolved. The apply targets come from the verify-translate.v1 prompt's
  // suggestedPatches — additive only (never rewrite-class), enforced
  // server-side by the Zod target regex. After applying, we point focusCue
  // at the newly inserted content so the middle column scrolls+flashes it.
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

      // Derive the section path of the newly-inserted content so the resume
      // view scrolls to it. For summary → the summary section itself; for
      // array-append targets → the last index in the post-apply resume.
      let insertedSection: string | null = null;
      if (patch.target === 'summary') {
        insertedSection = 'summary';
      } else if (patch.target === 'selectedAccomplishments') {
        const idx = next.selectedAccomplishments.length - 1;
        if (idx >= 0) insertedSection = `selectedAccomplishments[${idx}]`;
      } else {
        const m = patch.target.match(/^positions\[(\d+)\]$/);
        if (m) {
          const pi = Number(m[1]);
          const pos = next.positions[pi];
          if (pos && pos.bullets.length > 0) {
            insertedSection = `positions[${pi}].bullets[${pos.bullets.length - 1}]`;
          }
        }
      }
      if (insertedSection) {
        setFocusCue({
          key: `apply-${issueKey}`,
          section: insertedSection,
          at: Date.now(),
        });
      }
    },
    [editedWritten, pipeline.written],
  );

  return (
    // V3PipelineScreen is its OWN scroll container — h-full fills the
    // WorkspaceLayout-provided viewport, overflow-y-auto gives us the
    // scrollbar. We can't rely on document.body scroll because
    // WorkspaceLayout.tsx wraps its children in <main
    // className="overflow-hidden"> (see 2026-04-20 pm investigation in
    // /Users/johnschrup/.claude/plans/dazzling-weaving-meerkat.md). The
    // earlier attempt at natural page scroll failed because of that
    // upstream clip.
    <div className="h-full overflow-y-auto flex flex-col bg-[var(--bg-0)]">
      {/* ─── Top strip (flows with internal scroll, not pinned) ──────
          Header + stage progress + any error banner. When the user
          scrolls down (inside this container's scroll), the strip
          scrolls off screen so the three columns / intake form below
          get the full viewport. During an active run the default
          position shows the stage progress; once the user scrolls or
          the pipeline completes and the card auto-collapses, they see
          the content zone below. */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-3 space-y-4">
        {/* Phase 2 (pursuit timeline) — banners only on the standalone path
            (no applicationId from the parent route). When this screen is
            rendered inside /workspace/application/:id/resume it's already
            in the right place; banners are noise. */}
        {!applicationId && (
          <>
            {staleApplicationId ? (
              <StaleApplicationBanner staleApplicationId={staleApplicationId} />
            ) : sessionId ? (
              <OrphanSessionBanner sessionId={sessionId} />
            ) : (
              <StandaloneDeprecationBanner />
            )}
          </>
        )}
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
          <GlassCard className="p-4">
            <V3StageProgress
              stageStatus={pipeline.stageStatus}
              currentStage={pipeline.currentStage}
            />
            {pipeline.costs && (
              <div className="mt-3 flex items-center justify-end gap-4 text-[11px] text-[var(--text-soft)]">
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

        {/* Edit hint once pipeline is complete */}
        {pipeline.isComplete && !pipeline.error && !editedWritten && (
          <div className="text-[11px] text-[var(--text-soft)] flex items-center gap-1.5">
            <Pencil className="h-3 w-3" />
            Click any bullet or the summary to edit. Press Enter to save, Esc to cancel.
          </div>
        )}
      </div>

      {/* ─── Content zone ──────────────────────────────────────────────
          Flows with the page. Intake form: natural content height.
          Results grid: three columns flow as a standard CSS grid — each
          column sizes to its content, tallest column sets the row
          height. Page scroll (on document.body) is how the user gets
          past the top strip to see column content. */}
      <div className="w-full mx-auto max-w-7xl px-4 pb-4">
        {showIntake && (
          <div className="space-y-4">
            {persistence.lastSession && (
              <V3ResumeBanner
                jdTitle={persistence.lastSession.jdTitle}
                jdCompany={persistence.lastSession.jdCompany}
                savedAt={persistence.lastSession.savedAt}
                onResume={handleResumeLastSession}
                onDiscard={handleDiscardLastSession}
              />
            )}
            <V3IntakeForm
              onSubmit={handleStart}
              initialResumeText={initialResumeText}
              disabled={pipeline.isRunning}
              master={master.summary}
              accessToken={accessToken}
              initialJobUrl={initialJobUrl}
              initialJobDescription={initialJobDescription}
              initialJdTitle={initialJdTitle}
              initialJdCompany={initialJdCompany}
            />
          </div>
        )}

        {showResults && (
          <div className="grid lg:grid-cols-[320px_1fr_300px] gap-6">
            {/* Left: benchmark + strategy */}
            <div className="space-y-4">
              <V3StrategyPanel
                benchmark={pipeline.benchmark}
                strategy={pipeline.strategy}
                flashPositionIndex={strategyFlash?.positionIndex ?? null}
                flashTick={strategyFlash?.at ?? 0}
                onRegeneratePosition={
                  pipeline.isComplete ? handleRegeneratePosition : undefined
                }
                onRunDiscoveryAnswers={
                  pipeline.isComplete && lastStartInput ? handleRunDiscoveryAnswers : undefined
                }
                discoveryRunning={pipeline.isRunning}
                pendingPositions={regen.pendingPositions}
              />
            </div>

            {/* Center: resume + promote (promote sits at the bottom of the
                column — wrap-up action for the resume itself). */}
            <div className="space-y-6">
              <V3ResumeView
                structured={pipeline.structured}
                written={effectiveWritten}
                pristineWritten={pipeline.written}
                verify={effectiveVerify}
                editable={pipeline.isComplete}
                onEdit={(updated) => setEditedWritten(updated)}
                focusCue={focusCue}
                dismissedIssueKeys={dismissedIssueKeys}
                onTriangleClick={handleFocusIssue}
                onSourceChipClick={handleSourceChipClick}
                onRegenerateBullet={
                  pipeline.isComplete ? handleRegenerateBullet : undefined
                }
                pendingBulletKeys={regen.pendingBullets}
                onRegenerateSummary={
                  pipeline.isComplete ? handleRegenerateSummary : undefined
                }
                summaryPending={regen.summaryPending}
              />
              {pipeline.isComplete && !pipeline.error && pipeline.written && pipeline.structured && (
                <V3ExportBar
                  structured={pipeline.structured}
                  written={editedWritten ?? pipeline.written}
                  companyName={runJdCompany ?? undefined}
                  jobTitle={runJdTitle ?? undefined}
                  sessionId={sessionId}
                />
              )}
              {pipeline.isComplete && !pipeline.error && pipeline.written && sessionId && (
                <V3PromotePanel
                  accessToken={accessToken}
                  sessionId={sessionId}
                  written={editedWritten ?? pipeline.written}
                  structured={pipeline.structured}
                  discoveryAnswers={confirmedDiscoveryAnswers}
                  master={master.summary}
                  onSaved={() => master.refresh()}
                />
              )}
              {pipeline.isComplete && !pipeline.error && applicationId && (
                <IAppliedCTA
                  applicationId={applicationId}
                  resumeSessionId={sessionId ?? undefined}
                />
              )}
              {pipeline.isComplete && !pipeline.error && applicationId && (
                <WhatsNextCTABar
                  applicationId={applicationId}
                  resumeSessionId={sessionId ?? undefined}
                  className="mt-4"
                />
              )}
            </div>

            {/* Right: verify */}
            <div className="space-y-4">
              <V3VerifyPanel
                verify={effectiveVerify}
                discoveryWarning={discoveryReviewWarning}
                isRunning={pipeline.isRunning}
                currentStage={pipeline.currentStage}
                reverifying={regen.reverifying}
                editedWritten={editedWritten}
                pristineWritten={lastVerifiedWritten ?? pipeline.written}
                focusCue={focusCue}
                dismissedIssueKeys={dismissedIssueKeys}
                appliedIssueKeys={appliedIssueKeys}
                onAddress={handleFocusIssue}
                onDismiss={handleDismissIssue}
                onUndismiss={handleUndismissIssue}
                onApplyPatch={handleApplyPatch}
                onRegenerateFromSuggestion={
                  pipeline.isComplete ? handleRegenerateFromSuggestion : undefined
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
