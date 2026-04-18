// Stage 3 — Strategize.
// One Opus call takes a StructuredResume + JobDescription and returns a
// Strategy document. Stage 4 executes the strategy; the strategy itself
// is strategic judgment centralized in a single LLM call.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 3,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.
//
// Contract matches classify's: stream + accumulate + parse + zod validate +
// loud throw. No silent repair. Classify's output is trusted — strategize
// does NOT re-parse resume data; it just references it.

import { AnthropicProvider, type StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { createV3Logger } from '../observability/logger.js';
import { StrategySchema } from './schema.js';
import type { JobDescription, Strategy, StructuredResume } from '../types.js';

const logger = createV3Logger('strategize');
const MAX_OUTPUT_TOKENS = 16_000;

export interface StrategizeOptions {
  variant?: string;
  signal?: AbortSignal;
}

export class StrategizeError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
    },
  ) {
    super(message);
    this.name = 'StrategizeError';
  }
}

export interface StrategizeTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface StrategizeResult {
  strategy: Strategy;
  telemetry: StrategizeTelemetry;
}

export async function strategize(
  resume: StructuredResume,
  jd: JobDescription,
  options: StrategizeOptions = {},
): Promise<Strategy> {
  const { strategy } = await strategizeWithTelemetry(resume, jd, options);
  return strategy;
}

export async function strategizeWithTelemetry(
  resume: StructuredResume,
  jd: JobDescription,
  options: StrategizeOptions = {},
): Promise<StrategizeResult> {
  const variant = options.variant ?? 'v1';
  const promptName = `strategize.${variant}`;
  const prompt = loadPrompt(promptName);

  const userMessage = prompt.userMessageTemplate
    .replaceAll('{{jd_text}}', jd.text)
    .replaceAll('{{resume_json}}', JSON.stringify(resume, null, 2));

  const provider = new AnthropicProvider();
  const start = Date.now();

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      model: prompt.model,
      resumePositions: resume.positions.length,
      resumeCrossRoleHighlights: resume.crossRoleHighlights.length,
      jdChars: jd.text.length,
    },
    'strategize start',
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
    throw new StrategizeError(
      `Strategize returned empty response from ${prompt.model} (prompt ${promptName} v${prompt.version}).`,
      { promptName, rawResponse: fullText },
    );
  }

  const parsed = parseJsonOrThrow(fullText, promptName);
  const validated = validateOrThrow(parsed, promptName, fullText);

  logger.info(
    {
      promptName,
      promptVersion: prompt.version,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
      positioningFrame: validated.positioningFrame,
      accomplishments: validated.emphasizedAccomplishments.length,
      objections: validated.objections.length,
      positionEmphasis: validated.positionEmphasis.length,
    },
    'strategize complete',
  );

  return {
    strategy: validated,
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

function parseJsonOrThrow(raw: string, promptName: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new StrategizeError(
      `Strategize response is not valid JSON (prompt ${promptName}): ${err instanceof Error ? err.message : String(err)}`,
      { promptName, rawResponse: trimmed.slice(0, 500) },
    );
  }
}

function validateOrThrow(parsed: unknown, promptName: string, rawResponse: string): Strategy {
  const result = StrategySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new StrategizeError(
      `Strategize output did not match the Strategy schema (prompt ${promptName}). ` +
        `Zod reported ${result.error.issues.length} issue(s): ` +
        issues.join('; ') +
        (result.error.issues.length > 20 ? '; ...(more)' : ''),
      {
        promptName,
        rawResponse: rawResponse.slice(0, 500),
        validationIssues: result.error.issues,
      },
    );
  }
  return result.data as Strategy;
}
