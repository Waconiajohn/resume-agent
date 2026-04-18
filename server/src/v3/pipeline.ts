// v3 pipeline orchestrator.
// Wires the five stages (extract → classify → strategize → write → verify)
// into a single sequential run. Parallelization inside a stage (e.g. write's
// per-section fan-out) is the stage's own concern; the orchestrator only
// sequences stage boundaries and logs them.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md (the five stages),
//             docs/v3-rebuild/kickoffs/phase-1-kickoff.md §4 (skeleton),
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md (all stages real).
//
// Any stage failure propagates verbatim. No silent fallback (OPERATING-
// MANUAL.md).

import { extract } from './extract/index.js';
import { classify } from './classify/index.js';
import { strategize } from './strategize/index.js';
import { write } from './write/index.js';
import { verify } from './verify/index.js';
import { createV3Logger } from './observability/logger.js';
import type {
  PipelineInput,
  PipelineResult,
  ExtractResult,
  StructuredResume,
  Strategy,
  WrittenResume,
  VerifyResult,
} from './types.js';

const logger = createV3Logger('pipeline');

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const totalStart = Date.now();
  logger.info(
    {
      filename: input.resume.filename ?? null,
      hasBuffer: Boolean(input.resume.buffer),
      hasText: Boolean(input.resume.text),
      jdLength: input.jobDescription.text.length,
    },
    'pipeline start',
  );

  const extractResult = await runStage('extract', () => extract(input.resume));
  const classifyResult = await runStage('classify', () => classify(extractResult.value));
  const strategyResult = await runStage('strategize', () =>
    strategize(classifyResult.value, input.jobDescription),
  );
  const writtenResult = await runStage('write', () =>
    write(classifyResult.value, strategyResult.value),
  );
  const verifyResult = await runStage('verify', () =>
    verify(writtenResult.value, classifyResult.value, strategyResult.value),
  );

  const totalMs = Date.now() - totalStart;
  logger.info({ totalMs }, 'pipeline complete');

  return {
    extract: extractResult.value as ExtractResult,
    classify: classifyResult.value as StructuredResume,
    strategy: strategyResult.value as Strategy,
    written: writtenResult.value as WrittenResume,
    verify: verifyResult.value as VerifyResult,
    timings: {
      extractMs: extractResult.ms,
      classifyMs: classifyResult.ms,
      strategizeMs: strategyResult.ms,
      writeMs: writtenResult.ms,
      verifyMs: verifyResult.ms,
      totalMs,
    },
  };
}

interface StageRun<T> {
  value: T;
  ms: number;
}

async function runStage<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<StageRun<T>> {
  const start = Date.now();
  logger.info({ stage: name }, 'stage start');
  try {
    const value = await fn();
    const ms = Date.now() - start;
    logger.info({ stage: name, ms }, 'stage complete');
    return { value, ms };
  } catch (err) {
    const ms = Date.now() - start;
    logger.error(
      {
        stage: name,
        ms,
        err: err instanceof Error ? { name: err.name, message: err.message } : err,
      },
      'stage failed',
    );
    throw err;
  }
}
