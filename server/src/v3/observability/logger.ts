// Per-stage structured logger for v3.
// Thin wrapper around the platform Pino logger at server/src/lib/logger.ts,
// using child loggers for per-stage tagging. One log stream, one format.
// Implements: docs/v3-rebuild/OPERATING-MANUAL.md "Shared platform infrastructure".

import platformLogger from '../../lib/logger.js';

export type V3Stage =
  | 'pipeline'
  | 'extract'
  | 'classify'
  | 'strategize'
  | 'write'
  | 'verify'
  | 'prompts'
  | 'providers'
  | 'fixtures';

export function createV3Logger(stage: V3Stage, extra?: Record<string, unknown>) {
  return platformLogger.child({ v3Stage: stage, ...extra });
}

export type V3Logger = ReturnType<typeof createV3Logger>;
