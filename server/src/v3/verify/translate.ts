// Post-verify translation — takes raw VerifyIssue[] and produces user-facing
// TranslatedIssue[] via one cheap LLM call. Runs as a sidecar inside the
// verify stage's wrapper. Never changes pass/fail verdict or drops real
// issues; only rewrites prose and filters internal-QA noise via shouldShow.
//
// Design notes:
// - Fast-writer capability (DeepSeek on Vertex today) handles the task easily;
//   the prompt is an instruction-following transformation with tiny JSON out.
// - Batched: one call per verify result, not one per issue.
// - Returns null on any failure (prompt load, LLM error, JSON parse, schema
//   mismatch). Caller surfaces raw issues as fallback — the user never sees
//   a broken state because the translator had a bad day.
// - Telemetry includes durationMs + token counts so the verify stage's total
//   cost stays accurate.

import { z } from 'zod';
import type { StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import type {
  StructuredResume,
  TranslatedIssue,
  VerifyIssue,
} from '../types.js';

const log = createV3Logger('verify', { module: 'translate' });
const MAX_OUTPUT_TOKENS = 4_000;

// ─── Schema ────────────────────────────────────────────────────────────────

const TranslatedIssueSchema = z.object({
  shouldShow: z.boolean(),
  severity: z.enum(['error', 'warning']),
  label: z.string().min(1).max(120),
  message: z.string().min(5).max(800),
  suggestion: z.string().max(400).optional(),
});
const TranslateResponseSchema = z.object({
  translated: z.array(TranslatedIssueSchema),
});

// ─── Telemetry ─────────────────────────────────────────────────────────────

export interface TranslateTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  capability: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  ok: boolean;
}

export interface TranslateResult {
  translated: TranslatedIssue[] | null;
  telemetry: TranslateTelemetry;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface TranslateOptions {
  variant?: string;
  signal?: AbortSignal;
}

export async function translateVerifyIssues(
  issues: VerifyIssue[],
  structured: StructuredResume,
  options: TranslateOptions = {},
): Promise<TranslateResult> {
  const variant = options.variant ?? 'v1';
  const promptName = `verify-translate.${variant}`;
  const start = Date.now();

  // Empty-input short circuit — still return successful telemetry so the
  // caller can include it in the overall verify cost calc (always zero here).
  if (issues.length === 0) {
    return {
      translated: [],
      telemetry: {
        promptName,
        promptVersion: variant,
        model: '',
        capability: 'fast-writer',
        backend: '',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - start,
        ok: true,
      },
    };
  }

  let prompt: ReturnType<typeof loadPrompt>;
  try {
    prompt = loadPrompt(promptName);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'translate: prompt load failed');
    return buildFailureResult(promptName, variant, start);
  }

  const { provider, model, backend, capability } = getProvider(prompt.capability);

  const positionsCtx = structured.positions.map((p, idx) => ({
    index: idx,
    company: p.company || '',
    title: p.title || '',
  }));

  const userMessage = prompt.userMessageTemplate
    .replaceAll('{{issues_json}}', JSON.stringify(issues, null, 2))
    .replaceAll('{{positions_json}}', JSON.stringify(positionsCtx, null, 2));

  log.info(
    {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      issueCount: issues.length,
    },
    'translate start',
  );

  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    for await (const event of provider.stream({
      model,
      system: prompt.systemMessage,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: prompt.temperature,
      signal: options.signal,
    })) {
      const e = event as StreamEvent;
      if (e.type === 'text') fullText += e.text;
      else if (e.type === 'done') usage = e.usage;
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), model, backend },
      'translate: LLM stream failed — falling back to raw issues',
    );
    return buildFailureResult(promptName, prompt.version, start, { model, backend, capability });
  }

  if (!fullText.trim()) {
    log.warn({ model, backend }, 'translate: empty response — falling back');
    return buildFailureResult(promptName, prompt.version, start, { model, backend, capability });
  }

  const cleaned = stripJsonFence(fullText.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), head: cleaned.slice(0, 200) },
      'translate: JSON parse failed — falling back',
    );
    return buildFailureResult(promptName, prompt.version, start, { model, backend, capability });
  }

  const result = TranslateResponseSchema.safeParse(parsed);
  if (!result.success) {
    log.warn(
      { issues: result.error.issues.slice(0, 5), head: cleaned.slice(0, 200) },
      'translate: schema validation failed — falling back',
    );
    return buildFailureResult(promptName, prompt.version, start, { model, backend, capability });
  }

  const translated = result.data.translated;
  // Sanity check: caller expects 1:1 alignment with the input issues. If the
  // LLM returned a different count, treat as malformed and fall back rather
  // than risk mis-labeling a specific bullet.
  if (translated.length !== issues.length) {
    log.warn(
      { expected: issues.length, got: translated.length },
      'translate: length mismatch — falling back',
    );
    return buildFailureResult(promptName, prompt.version, start, { model, backend, capability });
  }

  // Severity mismatch is a softer fail — log but accept. The severity on the
  // translated issue should never differ from the source; we hard-override
  // back to the original if the LLM flipped it.
  const severityCorrected = translated.map((t, i) => ({
    ...t,
    severity: issues[i]!.severity,
  }));

  const durationMs = Date.now() - start;

  log.info(
    {
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
      showedCount: severityCorrected.filter((t) => t.shouldShow).length,
      droppedCount: severityCorrected.filter((t) => !t.shouldShow).length,
    },
    'translate complete',
  );

  return {
    translated: severityCorrected,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      capability,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
      ok: true,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function stripJsonFence(input: string): string {
  const s = input.trim();
  const start = /^```(?:json|JSON)?\s*\n/;
  const end = /\n```\s*$/;
  if (start.test(s) && end.test(s)) {
    return s.replace(start, '').replace(end, '').trim();
  }
  return s;
}

function buildFailureResult(
  promptName: string,
  version: string,
  start: number,
  provider?: { model: string; backend: string; capability: string },
): TranslateResult {
  return {
    translated: null,
    telemetry: {
      promptName,
      promptVersion: version,
      model: provider?.model ?? '',
      capability: provider?.capability ?? 'fast-writer',
      backend: provider?.backend ?? '',
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      ok: false,
    },
  };
}
