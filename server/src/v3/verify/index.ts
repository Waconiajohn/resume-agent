// Stage 5 — Verify.
// One Opus call reviews the WrittenResume against the StructuredResume and
// Strategy and returns a pass/fail with issues[]. Verify reports; it does
// not repair. Silent patching is forbidden (OPERATING-MANUAL.md).
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 5,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.

import { AnthropicProvider, type StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { createV3Logger } from '../observability/logger.js';
import { VerifyResultSchema } from './schema.js';
import type {
  Strategy,
  StructuredResume,
  VerifyResult,
  WrittenResume,
} from '../types.js';

const logger = createV3Logger('verify');
const MAX_OUTPUT_TOKENS = 8_000;

export interface VerifyOptions {
  variant?: string;
  signal?: AbortSignal;
}

export class VerifyError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
    },
  ) {
    super(message);
    this.name = 'VerifyError';
  }
}

export interface VerifyTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface VerifyResultWithTelemetry {
  result: VerifyResult;
  telemetry: VerifyTelemetry;
}

export async function verify(
  resume: WrittenResume,
  source: StructuredResume,
  strategy: Strategy,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const { result } = await verifyWithTelemetry(resume, source, strategy, options);
  return result;
}

export async function verifyWithTelemetry(
  written: WrittenResume,
  source: StructuredResume,
  strategy: Strategy,
  options: VerifyOptions = {},
): Promise<VerifyResultWithTelemetry> {
  const variant = options.variant ?? 'v1';
  const promptName = `verify.${variant}`;
  const prompt = loadPrompt(promptName);

  const userMessage = prompt.userMessageTemplate
    .replaceAll('{{strategy_json}}', JSON.stringify(strategy, null, 2))
    .replaceAll('{{resume_json}}', JSON.stringify(source, null, 2))
    .replaceAll('{{written_json}}', JSON.stringify(written, null, 2));

  const provider = new AnthropicProvider();
  const start = Date.now();

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      sourcePositions: source.positions.length,
      writtenPositions: written.positions.length,
    },
    'verify start',
  );

  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of provider.stream({
    model: prompt.model,
    system: prompt.systemMessage,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: MAX_OUTPUT_TOKENS,
    signal: options.signal,
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }

  const durationMs = Date.now() - start;

  if (!fullText.trim()) {
    throw new VerifyError(
      `Verify returned empty response (prompt ${promptName}).`,
      { promptName, rawResponse: fullText },
    );
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fullText.trim());
  } catch (err) {
    throw new VerifyError(
      `Verify response is not valid JSON (prompt ${promptName}): ${err instanceof Error ? err.message : String(err)}`,
      { promptName, rawResponse: fullText.slice(0, 500) },
    );
  }

  const result = VerifyResultSchema.safeParse(parsedRaw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new VerifyError(
      `Verify output did not match the VerifyResult schema (prompt ${promptName}). ` +
        `Zod reported ${result.error.issues.length} issue(s): ` +
        issues.join('; '),
      { promptName, rawResponse: fullText.slice(0, 500), validationIssues: result.error.issues },
    );
  }

  const validated = result.data as VerifyResult;

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      passed: validated.passed,
      errors: validated.issues.filter((i) => i.severity === 'error').length,
      warnings: validated.issues.filter((i) => i.severity === 'warning').length,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
    'verify complete',
  );

  return {
    result: validated,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model: prompt.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
  };
}
