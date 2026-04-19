// v3 pipeline SSE event types.
//
// Shape philosophy: each event carries `type`, `stage` (when stage-scoped),
// and a typed payload. Frontend consumes the union via a discriminated-union
// switch. Deliberately narrower than v2's 15+ event types — v3 has 5 stages
// and we stream one start + one complete per stage plus a final payload
// event. Everything else surfaces as an error event.

import type {
  ExtractResult,
  StructuredResume,
  Strategy,
  WrittenResume,
  VerifyResult,
  BenchmarkProfile,
} from '../types.js';

export type V3PipelineStage =
  | 'extract'
  | 'classify'
  | 'benchmark'
  | 'strategize'
  | 'write'
  | 'verify';

/** Per-stage cost accounting; matches ShadowStageCosts schema for reuse. */
export interface V3StageCosts {
  classify: number;
  benchmark: number;
  strategize: number;
  write: number;
  verify: number;
  total: number;
}

/** Per-stage latency accounting. */
export interface V3StageTimings {
  extractMs?: number;
  classifyMs?: number;
  benchmarkMs?: number;
  strategizeMs?: number;
  writeMs?: number;
  verifyMs?: number;
  totalMs: number;
}

/** Fired at the start of each stage so the UI can show "Classifying…" state. */
export interface V3StageStartEvent {
  type: 'stage_start';
  stage: V3PipelineStage;
  timestamp: string;
}

/**
 * Fired when a stage completes. Payload carries the stage's output so the
 * UI can render sections incrementally (e.g. show the Strategy card as soon
 * as strategize finishes, then stream in the Written resume per-section
 * when write completes).
 */
export type V3StageCompleteEvent =
  | {
      type: 'stage_complete';
      stage: 'extract';
      durationMs: number;
      output: ExtractResult;
      timestamp: string;
    }
  | {
      type: 'stage_complete';
      stage: 'classify';
      durationMs: number;
      output: StructuredResume;
      timestamp: string;
    }
  | {
      type: 'stage_complete';
      stage: 'benchmark';
      durationMs: number;
      output: BenchmarkProfile;
      timestamp: string;
    }
  | {
      type: 'stage_complete';
      stage: 'strategize';
      durationMs: number;
      output: Strategy;
      timestamp: string;
    }
  | {
      type: 'stage_complete';
      stage: 'write';
      durationMs: number;
      output: WrittenResume;
      timestamp: string;
    }
  | {
      type: 'stage_complete';
      stage: 'verify';
      durationMs: number;
      output: VerifyResult;
      timestamp: string;
    };

/** Final payload event — the complete result bundle after verify. */
export interface V3PipelineCompleteEvent {
  type: 'pipeline_complete';
  /**
   * Real coach_sessions.id minted by the /run endpoint. Frontend passes it
   * as source_session_id on promote + as a future audit-trail referent.
   */
  sessionId: string;
  structured: StructuredResume;
  benchmark: BenchmarkProfile;
  strategy: Strategy;
  written: WrittenResume;
  verify: VerifyResult;
  timings: V3StageTimings;
  costs: V3StageCosts;
  timestamp: string;
}

/** Emitted if any stage throws. The pipeline stops. */
export interface V3PipelineErrorEvent {
  type: 'pipeline_error';
  stage: V3PipelineStage;
  message: string;
  timestamp: string;
}

export type V3PipelineSSEEvent =
  | V3StageStartEvent
  | V3StageCompleteEvent
  | V3PipelineCompleteEvent
  | V3PipelineErrorEvent;

export type V3SSEEmitter = (event: V3PipelineSSEEvent) => void;
