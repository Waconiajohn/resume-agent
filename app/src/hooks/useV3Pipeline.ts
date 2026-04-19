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

export type V3Stage = 'extract' | 'classify' | 'strategize' | 'write' | 'verify';

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
  positionEmphasis: Array<{
    positionIndex: number;
    weight: 'brief' | 'medium' | 'heavy';
    rationale?: string;
  }>;
  // additional fields tolerated but not typed
  [k: string]: unknown;
}

export interface V3VerifyIssue {
  severity: 'error' | 'warning';
  section: string;
  message: string;
}

export interface V3VerifyResult {
  passed: boolean;
  issues: V3VerifyIssue[];
}

export interface V3StageCosts {
  classify: number;
  strategize: number;
  write: number;
  verify: number;
  total: number;
}

export interface V3StageTimings {
  extractMs?: number;
  classifyMs?: number;
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
  structured?: V3StructuredResume;
  strategy?: V3Strategy;
  written?: V3WrittenResume;
  verify?: V3VerifyResult;
  timings?: V3StageTimings;
  costs?: V3StageCosts;
  // pipeline_error payload
  message?: string;
}

// ─── Hook state ─────────────────────────────────────────────────────────────

export interface V3PipelineState {
  /** Per-stage status for the progress indicator. */
  stageStatus: Record<V3Stage, V3StageStatus>;
  /** Most recent stage the backend is working on (for the header tag). */
  currentStage: V3Stage | null;
  /** Populated as stage_complete events arrive. */
  structured: V3StructuredResume | null;
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
  stageStatus: {
    extract: 'pending',
    classify: 'pending',
    strategize: 'pending',
    write: 'pending',
    verify: 'pending',
  },
  currentStage: null,
  structured: null,
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
  resumeText: string;
  jobDescription: string;
  jdTitle?: string;
  jdCompany?: string;
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
        if (event.structured) next.structured = event.structured;
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
            resume_text: input.resumeText,
            job_description: input.jobDescription,
            jd_title: input.jdTitle,
            jd_company: input.jdCompany,
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

  return {
    ...state,
    start,
    reset,
  };
}
