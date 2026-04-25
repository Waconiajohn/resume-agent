/**
 * useV3Pipeline — SSE-streaming hook for the v3 resume pipeline.
 *
 * v3 is a single-POST pipeline. The POST body is the input; the POST response
 * body IS the SSE stream. No start+subscribe split, no session_id on the
 * server, no DB row mid-flight. The hook reads the stream, folds stage_complete
 * payloads into state, and surfaces the final pipeline_complete bundle.
 *
 * Deliberately narrower than useV2Pipeline — v3 has no gates, no clarification
 * memory, no mid-pipeline user interaction. Submit, watch five stages fill
 * in, edit what you get.
 */

import { useCallback, useRef, useState } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';

// ─── Types mirroring server/src/v3/pipeline/types.ts ────────────────────────
// We keep these thin; the frontend only reads a subset of the WrittenResume
// fields. Full type imports would force bundling server types; the shape
// contract is maintained by SSE tests on the backend.

export type V3Stage = 'extract' | 'classify' | 'benchmark' | 'strategize' | 'write' | 'verify';

export type BenchmarkStrength = 'strong' | 'partial';
export type BenchmarkGapSeverity = 'disqualifying' | 'manageable' | 'noise';

export interface V3BenchmarkDirectMatch {
  jdRequirement: string;
  candidateEvidence: string;
  strength: BenchmarkStrength;
}

export interface V3BenchmarkGap {
  gap: string;
  severity: BenchmarkGapSeverity;
  bridgingStrategy: string;
}

export interface V3BenchmarkObjection {
  objection: string;
  neutralizationStrategy: string;
}

export interface V3BenchmarkProfile {
  roleProblemHypothesis: string;
  idealProfileSummary: string;
  directMatches: V3BenchmarkDirectMatch[];
  gapAssessment: V3BenchmarkGap[];
  positioningFrame: string;
  hiringManagerObjections: V3BenchmarkObjection[];
}

export interface V3ContactInfo {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
  website?: string | null;
}

export interface V3DateRange {
  start: string | null;
  end: string | null;
  raw: string;
}

export interface V3Bullet {
  text: string;
  is_new: boolean;
  source?: string | null;
  evidence_found: boolean;
  confidence: number;
}

export interface V3WrittenPosition {
  positionIndex: number;
  title: string;
  company: string;
  dates: V3DateRange;
  scope?: string | null;
  bullets: V3Bullet[];
}

export interface V3WrittenCustomSection {
  title: string;
  entries: Array<{
    text: string;
    source?: string | null;
    is_new: boolean;
    evidence_found: boolean;
    confidence: number;
  }>;
}

export interface V3WrittenResume {
  summary: string;
  selectedAccomplishments: string[];
  coreCompetencies: string[];
  positions: V3WrittenPosition[];
  customSections: V3WrittenCustomSection[];
}

export interface V3StructuredResume {
  contact: V3ContactInfo;
  discipline: string;
  positions: Array<{
    title: string;
    company: string;
    parentCompany?: string | null;
    location?: string | null;
    dates: V3DateRange;
    scope?: string | null;
    bullets: V3Bullet[];
    confidence: number;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    location?: string | null;
    graduationYear?: string | null;
    notes?: string | null;
    confidence: number;
  }>;
  certifications: Array<{ name: string; issuer?: string | null; year?: string | null }>;
  skills: string[];
  customSections: Array<{ title: string; entries: Array<{ text: string }> }>;
  crossRoleHighlights: string[];
  careerGaps: Array<{ description: string; dates?: V3DateRange | null }>;
  pronoun: 'she/her' | 'he/him' | 'they/them' | null;
}

export interface V3Strategy {
  positioningFrame: string;
  targetDisciplinePhrase: string;
  emphasizedAccomplishments: Array<{
    positionIndex: number | null;
    summary: string;
    rationale?: string;
  }>;
  objections: Array<{
    objection: string;
    rebuttal: string;
  }>;
  positionEmphasis: Array<{
    positionIndex: number;
    weight: 'primary' | 'secondary' | 'brief';
    rationale?: string;
  }>;
  evidenceOpportunities?: Array<{
    requirement: string;
    level:
      | 'direct_proof'
      | 'reasonable_inference'
      | 'adjacent_proof'
      | 'candidate_discovery_needed'
      | 'unsupported';
    sourceSignal?: string;
    recommendedFraming: string;
    discoveryQuestion?: string;
    risk: 'low' | 'medium' | 'high';
  }>;
  editorialAssessment?: {
    callbackPower: number;
    strongestAngle: string;
    weakestAngle: string;
    hiringManagerQuestion: string;
    recommendedMove: string;
  };
  notes?: string;
  // additional fields tolerated but not typed
  [k: string]: unknown;
}

export interface V3DiscoveryAnswer {
  requirement: string;
  question: string;
  answer: string;
  level?: NonNullable<V3Strategy['evidenceOpportunities']>[number]['level'];
  risk?: NonNullable<V3Strategy['evidenceOpportunities']>[number]['risk'];
  recommendedFraming?: string;
  sourceSignal?: string;
}

export interface V3VerifyIssue {
  severity: 'error' | 'warning';
  section: string;
  message: string;
}

/**
 * A pre-written patch the translator emits for additive issues (content
 * missing from the resume). One-click apply in the Review panel. Rewrite-
 * class issues never receive patches — see verify-translate.v1 rule 5.
 */
export interface V3SuggestedPatch {
  /** 'summary' | 'selectedAccomplishments' | 'positions[N]' */
  target: string;
  text: string;
}

/**
 * User-facing translation of a verify issue. Produced server-side by a
 * cheap post-verify LLM call. When present, the Review panel renders
 * these instead of the raw `issues` (which stay in plumbing vocabulary).
 */
export interface V3TranslatedIssue {
  shouldShow: boolean;
  severity: 'error' | 'warning';
  label: string;
  message: string;
  suggestion?: string;
  /** Additive-only; absent for rewrite-class issues. 0–3 items. */
  suggestedPatches?: V3SuggestedPatch[];
}

export interface V3VerifyResult {
  passed: boolean;
  issues: V3VerifyIssue[];
  /** Plain-English translations; optional. Panel falls back to `issues` when absent. */
  translated?: V3TranslatedIssue[];
}

export interface V3StageCosts {
  classify: number;
  benchmark: number;
  strategize: number;
  write: number;
  verify: number;
  total: number;
}

export interface V3StageTimings {
  extractMs?: number;
  classifyMs?: number;
  benchmarkMs?: number;
  strategizeMs?: number;
  writeMs?: number;
  verifyMs?: number;
  totalMs: number;
}

export type V3StageStatus = 'pending' | 'running' | 'complete' | 'failed';

// Matches server/src/v3/pipeline/types.ts — we parse but don't import the
// server type to avoid tight coupling across the wire.
interface V3PipelineSSEEvent {
  type: 'stage_start' | 'stage_complete' | 'pipeline_complete' | 'pipeline_error';
  stage?: V3Stage;
  durationMs?: number;
  output?: unknown;
  timestamp: string;
  // pipeline_complete payload
  sessionId?: string;
  structured?: V3StructuredResume;
  benchmark?: V3BenchmarkProfile;
  strategy?: V3Strategy;
  written?: V3WrittenResume;
  verify?: V3VerifyResult;
  discoveryAnswers?: V3DiscoveryAnswer[];
  timings?: V3StageTimings;
  costs?: V3StageCosts;
  // pipeline_error payload
  message?: string;
}

// ─── Hook state ─────────────────────────────────────────────────────────────

export interface V3PipelineState {
  /** Backend coach_sessions.id for this run. Populated on pipeline_complete. */
  sessionId: string | null;
  /** Per-stage status for the progress indicator. */
  stageStatus: Record<V3Stage, V3StageStatus>;
  /** Most recent stage the backend is working on (for the header tag). */
  currentStage: V3Stage | null;
  /** Populated as stage_complete events arrive. */
  structured: V3StructuredResume | null;
  benchmark: V3BenchmarkProfile | null;
  strategy: V3Strategy | null;
  written: V3WrittenResume | null;
  verify: V3VerifyResult | null;
  timings: V3StageTimings | null;
  costs: V3StageCosts | null;
  /** True while the SSE stream is open. */
  isRunning: boolean;
  /** Set when pipeline_complete event arrives. */
  isComplete: boolean;
  /** Top-level error string if the pipeline or transport failed. */
  error: string | null;
  /** Which stage errored (when error is set). */
  errorStage: V3Stage | null;
}

const initialState: V3PipelineState = {
  sessionId: null,
  stageStatus: {
    extract: 'pending',
    classify: 'pending',
    benchmark: 'pending',
    strategize: 'pending',
    write: 'pending',
    verify: 'pending',
  },
  currentStage: null,
  structured: null,
  benchmark: null,
  strategy: null,
  written: null,
  verify: null,
  timings: null,
  costs: null,
  isRunning: false,
  isComplete: false,
  error: null,
  errorStage: null,
};

export interface StartV3PipelineInput {
  /** Omit when useMaster is true; server will load the user's default master. */
  resumeText?: string;
  /** When true, the server loads resume_text from the user's default master. */
  useMaster?: boolean;
  jobDescription: string;
  jdTitle?: string;
  jdCompany?: string;
  discoveryAnswers?: V3DiscoveryAnswer[];
  /**
   * Approach C Phase 1.3 — links this resume-generation run to a
   * job_applications row. When present, persisted on the coach_sessions
   * row created by the server in /api/v3-pipeline/run.
   */
  applicationId?: string;
}

export interface V3MasterSummary {
  id: string;
  version: number;
  is_default: boolean;
  updated_at: string;
  hasExperience: boolean;
  hasEvidence: boolean;
  positionCount: number;
  evidenceCount: number;
}

export function useV3Pipeline(accessToken: string | null) {
  const [state, setState] = useState<V3PipelineState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  const handleEvent = useCallback((event: V3PipelineSSEEvent) => {
    setState((prev) => {
      const next = { ...prev };

      if (event.type === 'stage_start' && event.stage) {
        next.stageStatus = { ...prev.stageStatus, [event.stage]: 'running' };
        next.currentStage = event.stage;
      } else if (event.type === 'stage_complete' && event.stage) {
        next.stageStatus = { ...prev.stageStatus, [event.stage]: 'complete' };
        // Update the output slot for this stage so the UI can render progressively.
        if (event.stage === 'classify' && event.output) {
          next.structured = event.output as V3StructuredResume;
        } else if (event.stage === 'benchmark' && event.output) {
          next.benchmark = event.output as V3BenchmarkProfile;
        } else if (event.stage === 'strategize' && event.output) {
          next.strategy = event.output as V3Strategy;
        } else if (event.stage === 'write' && event.output) {
          next.written = event.output as V3WrittenResume;
        } else if (event.stage === 'verify' && event.output) {
          next.verify = event.output as V3VerifyResult;
        }
      } else if (event.type === 'pipeline_complete') {
        next.isRunning = false;
        next.isComplete = true;
        next.currentStage = null;
        if (event.sessionId) next.sessionId = event.sessionId;
        if (event.structured) next.structured = event.structured;
        if (event.benchmark) next.benchmark = event.benchmark;
        if (event.strategy) next.strategy = event.strategy;
        if (event.written) next.written = event.written;
        if (event.verify) next.verify = event.verify;
        if (event.timings) next.timings = event.timings;
        if (event.costs) next.costs = event.costs;
      } else if (event.type === 'pipeline_error' && event.stage) {
        next.isRunning = false;
        next.isComplete = false;
        next.stageStatus = { ...prev.stageStatus, [event.stage]: 'failed' };
        next.error = event.message ?? 'Pipeline error';
        next.errorStage = event.stage;
      }

      return next;
    });
  }, []);

  const start = useCallback(
    async (input: StartV3PipelineInput): Promise<void> => {
      if (!accessToken) {
        setState((s) => ({ ...s, error: 'Not authenticated' }));
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...initialState,
        isRunning: true,
        stageStatus: { ...initialState.stageStatus, extract: 'running' },
        currentStage: 'extract',
      });

      try {
        const res = await fetch(`${API_BASE}/v3-pipeline/run`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            ...(input.useMaster
              ? { use_master: true }
              : { resume_text: input.resumeText }),
            job_description: input.jobDescription,
            jd_title: input.jdTitle,
            jd_company: input.jdCompany,
            ...(input.discoveryAnswers && input.discoveryAnswers.length > 0
              ? {
                  discovery_answers: input.discoveryAnswers.map((answer) => ({
                    requirement: answer.requirement,
                    question: answer.question,
                    answer: answer.answer,
                    level: answer.level,
                    risk: answer.risk,
                    recommendedFraming: answer.recommendedFraming,
                    sourceSignal: answer.sourceSignal,
                  })),
                }
              : {}),
            // Approach C Phase 1.3 — when present, v3-pipeline route persists
            // this on the coach_sessions row it creates so the run is linked
            // to the application. Null/undefined = unscoped run, current behavior.
            ...(input.applicationId ? { job_application_id: input.applicationId } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Pipeline request failed (${res.status})`);
        }
        if (!res.body) {
          throw new Error('No response body for SSE stream');
        }

        for await (const msg of parseSSEStream(res.body)) {
          if (!msg.data) continue;
          try {
            const parsed = JSON.parse(msg.data) as V3PipelineSSEEvent;
            handleEvent(parsed);
          } catch {
            // Skip malformed event; server-side tests guarantee shape.
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Aborts are user-initiated (reset); don't surface as an error.
        const wasAborted = err instanceof Error && (err.name === 'AbortError' || message.includes('aborted'));
        if (!wasAborted) {
          setState((s) => ({
            ...s,
            isRunning: false,
            error: message,
          }));
        }
      }
    },
    [accessToken, handleEvent],
  );

  /**
   * Replace the in-memory state with a previously saved snapshot — used by
   * the session-restore banner to rehydrate the three-panel layout without
   * re-running the pipeline. All stages are marked complete; isComplete is
   * true; no LLM calls happen.
   */
  const hydrate = useCallback((snapshot: {
    sessionId: string | null;
    structured: V3StructuredResume;
    benchmark: V3BenchmarkProfile;
    strategy: V3Strategy;
    written: V3WrittenResume;
    verify: V3VerifyResult;
    timings: V3StageTimings | null;
    costs: V3StageCosts | null;
  }) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      sessionId: snapshot.sessionId,
      stageStatus: {
        extract: 'complete',
        classify: 'complete',
        benchmark: 'complete',
        strategize: 'complete',
        write: 'complete',
        verify: 'complete',
      },
      currentStage: null,
      structured: snapshot.structured,
      benchmark: snapshot.benchmark,
      strategy: snapshot.strategy,
      written: snapshot.written,
      verify: snapshot.verify,
      timings: snapshot.timings,
      costs: snapshot.costs,
      isRunning: false,
      isComplete: true,
      error: null,
      errorStage: null,
    });
  }, []);

  return {
    ...state,
    start,
    reset,
    hydrate,
  };
}
