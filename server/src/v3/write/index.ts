// Stage 4 — Write.
// Orchestrates parallel section-writer calls: summary, selected
// accomplishments, core competencies, one call per position, and one
// call per custom section (when classify identified any). Each prompt
// receives the FULL Strategy and FULL StructuredResume plus its
// per-section focus. Results compose into a WrittenResume.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 4,
//             docs/v3-rebuild/kickoffs/phase-4-kickoff.md.
//
// Phase 3.5: provider resolution via factory; bullets carry per-source
// metadata; custom sections become a first-class output.

import type { ZodSchema } from 'zod';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../lib/structured-llm.js';
import {
  WrittenSummarySchema,
  WrittenAccomplishmentsSchema,
  WrittenCompetenciesSchema,
  WrittenPositionSchema,
  WrittenCustomSectionSchema,
} from './schema.js';
import {
  buildPronounRetryAddendum,
  detectBannedPronouns,
} from './pronoun-retry.js';
import {
  buildForbiddenPhraseRetryAddendum,
  detectForbiddenPhrases,
} from './forbidden-phrase-retry.js';
import type {
  CustomSection,
  Position,
  Strategy,
  StructuredResume,
  WrittenCustomSection,
  WrittenPosition,
  WrittenResume,
} from '../types.js';

const logger = createV3Logger('write');
const MAX_OUTPUT_TOKENS = 8_000;

/**
 * Cap on simultaneous section LLM calls during the write stage fan-out.
 * Without a cap, a 20-position executive would fire 23+ concurrent
 * gpt-5.4-mini / DeepSeek calls (summary + accomplishments + competencies +
 * N positions + M custom sections). That's rate-limit territory on busy
 * days and offers no recovery if one provider starts throttling.
 *
 * 6 was picked empirically: three non-position sections plus three position
 * calls in the first wave, which matches the section types a reviewer sees
 * streamed first anyway. Override at runtime via RESUME_V3_WRITE_CONCURRENCY
 * for fixture scripts that want to push the envelope.
 *
 * Added 2026-04-21 as part of commit 2 of the structured-llm plan.
 */
const DEFAULT_WRITE_CONCURRENCY = 6;
function getWriteConcurrency(): number {
  const raw = process.env.RESUME_V3_WRITE_CONCURRENCY;
  if (!raw) return DEFAULT_WRITE_CONCURRENCY;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WRITE_CONCURRENCY;
}

/**
 * Minimal FIFO concurrency limiter. Accepts an array of thunks (functions
 * returning Promise) and runs at most `limit` of them simultaneously.
 * Results come back in the SAME ORDER as the input array — callers that
 * slice the result (positionResults vs customSectionResults) depend on
 * this. Rejection semantics match Promise.all: the first rejection
 * propagates; remaining in-flight tasks continue but their results are
 * discarded.
 *
 * Deliberately not a dependency (p-limit / p-queue) — the whole helper is
 * ~25 lines and keeps the write stage free of new packages.
 */
async function runBounded<T>(
  limit: number,
  tasks: ReadonlyArray<() => Promise<T>>,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit, tasks.length));
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]!();
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < effectiveLimit; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

export interface WriteOptions {
  variant?: string;       // e.g. "v1" loads write-summary.v1.md etc.
  signal?: AbortSignal;
}

export class WriteError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      section?: string;
      promptName?: string;
      rawResponse?: string;
      validationIssues?: unknown;
    },
  ) {
    super(message);
    this.name = 'WriteError';
  }
}

export interface WriteTelemetry {
  variant: string;
  sections: {
    summary: SectionTelemetry;
    accomplishments: SectionTelemetry;
    competencies: SectionTelemetry;
    positions: SectionTelemetry[];
    customSections: SectionTelemetry[];
  };
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

export interface SectionTelemetry {
  promptName: string;
  promptVersion: string;
  model: string;
  capability: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /**
   * True iff the structural-retry primitive fired a retry (first LLM call
   * produced output that failed JSON.parse or Zod validation; second call
   * succeeded). Orthogonal to pronoun-retry / forbidden-phrase-retry,
   * which are semantic retries layered above the primitive. Added
   * 2026-04-20 pm as part of the write stage's migration to the shared
   * structured-llm-call primitive.
   */
  schemaRetryFired: boolean;
}

export interface WriteResult {
  written: WrittenResume;
  telemetry: WriteTelemetry;
}

export async function write(
  resume: StructuredResume,
  strategy: Strategy,
  options: WriteOptions = {},
): Promise<WrittenResume> {
  const { written } = await writeWithTelemetry(resume, strategy, options);
  return written;
}

export async function writeWithTelemetry(
  resume: StructuredResume,
  strategy: Strategy,
  options: WriteOptions = {},
): Promise<WriteResult> {
  const variant = options.variant ?? 'v1';
  const start = Date.now();

  logger.info(
    {
      variant,
      positions: resume.positions.length,
      customSections: resume.customSections.length,
      positionEmphasis: strategy.positionEmphasis.length,
      emphasizedAccomplishments: strategy.emphasizedAccomplishments.length,
      positioningFrame: strategy.positioningFrame,
    },
    'write start',
  );

  const strategyJson = JSON.stringify(strategy, null, 2);
  const resumeJson = JSON.stringify(resume, null, 2);

  // Bounded-concurrency fan-out. Tasks run in a FIFO queue capped at
  // getWriteConcurrency() simultaneous calls; see DEFAULT_WRITE_CONCURRENCY
  // for rationale.
  const positionCount = resume.positions.length;
  const customSectionCount = resume.customSections.length;
  type WriteTask =
    | { kind: 'summary'; run: () => ReturnType<typeof runSummary> }
    | { kind: 'accomplishments'; run: () => ReturnType<typeof runAccomplishments> }
    | { kind: 'competencies'; run: () => ReturnType<typeof runCompetencies> }
    | { kind: 'position'; run: () => ReturnType<typeof runPosition> }
    | { kind: 'customSection'; run: () => ReturnType<typeof runCustomSection> };
  const tasks: WriteTask[] = [
    { kind: 'summary', run: () => runSummary(variant, strategyJson, resumeJson, options.signal) },
    {
      kind: 'accomplishments',
      run: () => runAccomplishments(variant, strategyJson, resumeJson, options.signal),
    },
    {
      kind: 'competencies',
      run: () => runCompetencies(variant, strategyJson, resumeJson, options.signal),
    },
    ...resume.positions.map(
      (position, idx): WriteTask => ({
        kind: 'position',
        run: () => runPosition(position, idx, variant, strategyJson, resumeJson, options.signal),
      }),
    ),
    ...resume.customSections.map(
      (section, idx): WriteTask => ({
        kind: 'customSection',
        run: () => runCustomSection(section, idx, variant, strategyJson, options.signal),
      }),
    ),
  ];
  const concurrency = getWriteConcurrency();
  logger.info(
    { concurrency, totalSections: tasks.length, positions: positionCount, customSections: customSectionCount },
    'write fan-out with bounded concurrency',
  );

  const results = await runBounded<unknown>(
    concurrency,
    tasks.map((t) => t.run as () => Promise<unknown>),
  );

  const summaryRes = results[0] as Awaited<ReturnType<typeof runSummary>>;
  const accomplishmentsRes = results[1] as Awaited<ReturnType<typeof runAccomplishments>>;
  const competenciesRes = results[2] as Awaited<ReturnType<typeof runCompetencies>>;
  const positionResults = results.slice(3, 3 + positionCount) as Awaited<
    ReturnType<typeof runPosition>
  >[];
  const customSectionResults = results.slice(3 + positionCount) as Awaited<
    ReturnType<typeof runCustomSection>
  >[];

  const written: WrittenResume = {
    summary: summaryRes.summary,
    selectedAccomplishments: accomplishmentsRes.selectedAccomplishments,
    coreCompetencies: competenciesRes.coreCompetencies,
    positions: positionResults.map((r) => r.position),
    customSections: customSectionResults.map((r) => r.section),
  };

  const totalInputTokens =
    summaryRes.telemetry.inputTokens +
    accomplishmentsRes.telemetry.inputTokens +
    competenciesRes.telemetry.inputTokens +
    positionResults.reduce((s, r) => s + r.telemetry.inputTokens, 0) +
    customSectionResults.reduce((s, r) => s + r.telemetry.inputTokens, 0);

  const totalOutputTokens =
    summaryRes.telemetry.outputTokens +
    accomplishmentsRes.telemetry.outputTokens +
    competenciesRes.telemetry.outputTokens +
    positionResults.reduce((s, r) => s + r.telemetry.outputTokens, 0) +
    customSectionResults.reduce((s, r) => s + r.telemetry.outputTokens, 0);

  const telemetry: WriteTelemetry = {
    variant,
    sections: {
      summary: summaryRes.telemetry,
      accomplishments: accomplishmentsRes.telemetry,
      competencies: competenciesRes.telemetry,
      positions: positionResults.map((r) => r.telemetry),
      customSections: customSectionResults.map((r) => r.telemetry),
    },
    totalInputTokens,
    totalOutputTokens,
    durationMs: Date.now() - start,
  };

  logger.info(
    {
      variant,
      sections: 3 + positionResults.length + customSectionResults.length,
      inputTokens: telemetry.totalInputTokens,
      outputTokens: telemetry.totalOutputTokens,
      durationMs: telemetry.durationMs,
    },
    'write complete',
  );

  return { written, telemetry };
}

// -----------------------------------------------------------------------------
// Section runners
// -----------------------------------------------------------------------------

async function runSummary(
  variant: string,
  strategyJson: string,
  resumeJson: string,
  signal?: AbortSignal,
): Promise<{ summary: string; telemetry: SectionTelemetry }> {
  const promptName = `write-summary.${variant}`;
  const replacements = { strategy_json: strategyJson, resume_json: resumeJson };
  let out = await runSection<{ summary: string }>(
    'summary',
    promptName,
    replacements,
    WrittenSummarySchema,
    signal,
  );

  // Fix 4 (2026-04-19) — one-shot pronoun retry. The shared pronoun-policy
  // fragment tells the model to avoid personal pronouns, but DeepSeek
  // occasionally slips (HR-exec and Jessica Boquist regressions). Scan the
  // output for banned pronouns; if any found, re-invoke once with a
  // targeted nudge. Second attempt is accepted as-is (no infinite retry).
  const scan = detectBannedPronouns(out.parsed.summary);
  if (scan.found.length > 0) {
    logger.info(
      { section: 'summary', promptName, pronouns: scan.found, retry: 1 },
      'summary pronoun retry triggered',
    );
    const retry = await runSection<{ summary: string }>(
      'summary',
      promptName,
      replacements,
      WrittenSummarySchema,
      signal,
      buildPronounRetryAddendum(scan.found),
    );
    const retryScan = detectBannedPronouns(retry.parsed.summary);
    if (retryScan.found.length > 0) {
      logger.warn(
        {
          section: 'summary',
          promptName,
          initialPronouns: scan.found,
          retryPronouns: retryScan.found,
        },
        'summary pronoun retry failed to fully clear — emitting output anyway',
      );
    }
    out = retry;
  }

  // Ship 2026-04-20 — one-shot forbidden-phrase retry. The shared
  // forbidden-phrases fragment is ~50–60% effective in practice (UX test
  // surfaced "with a track record" + "Orchestrated" slipping through on
  // jessica-boquist). Same mechanical pattern as the pronoun retry:
  // scan the final output; if any banned phrase matches, re-invoke once
  // with a targeted addendum. Runs AFTER the pronoun retry so the second
  // attempt's content is what we scan.
  const phraseScan = detectForbiddenPhrases(out.parsed.summary);
  if (phraseScan.foundIds.length > 0) {
    logger.info(
      { section: 'summary', promptName, phrases: phraseScan.foundIds, retry: 1 },
      'summary forbidden-phrase retry triggered',
    );
    const retry = await runSection<{ summary: string }>(
      'summary',
      promptName,
      replacements,
      WrittenSummarySchema,
      signal,
      buildForbiddenPhraseRetryAddendum(phraseScan.foundIds),
    );
    const retryScan = detectForbiddenPhrases(retry.parsed.summary);
    if (retryScan.foundIds.length > 0) {
      logger.warn(
        {
          section: 'summary',
          promptName,
          initialPhrases: phraseScan.foundIds,
          retryPhrases: retryScan.foundIds,
        },
        'summary forbidden-phrase retry failed to fully clear — emitting output anyway',
      );
    }
    out = retry;
  }

  return { summary: out.parsed.summary, telemetry: out.telemetry };
}

async function runAccomplishments(
  variant: string,
  strategyJson: string,
  resumeJson: string,
  signal?: AbortSignal,
): Promise<{ selectedAccomplishments: string[]; telemetry: SectionTelemetry }> {
  const promptName = `write-accomplishments.${variant}`;
  const replacements = { strategy_json: strategyJson, resume_json: resumeJson };
  let out = await runSection<{ selectedAccomplishments: string[] }>(
    'accomplishments',
    promptName,
    replacements,
    WrittenAccomplishmentsSchema,
    signal,
  );

  // Fix 4 (2026-04-19) — same pronoun retry as runSummary. Scan all
  // accomplishment strings; if ANY contains a banned pronoun, retry once
  // with a nudge.
  const joinedAccs = out.parsed.selectedAccomplishments.join('\n');
  const scan = detectBannedPronouns(joinedAccs);
  if (scan.found.length > 0) {
    logger.info(
      { section: 'accomplishments', promptName, pronouns: scan.found, retry: 1 },
      'accomplishments pronoun retry triggered',
    );
    const retry = await runSection<{ selectedAccomplishments: string[] }>(
      'accomplishments',
      promptName,
      replacements,
      WrittenAccomplishmentsSchema,
      signal,
      buildPronounRetryAddendum(scan.found),
    );
    const retryScan = detectBannedPronouns(retry.parsed.selectedAccomplishments.join('\n'));
    if (retryScan.found.length > 0) {
      logger.warn(
        {
          section: 'accomplishments',
          promptName,
          initialPronouns: scan.found,
          retryPronouns: retryScan.found,
        },
        'accomplishments pronoun retry failed to fully clear — emitting output anyway',
      );
    }
    out = retry;
  }

  // Ship 2026-04-20 — forbidden-phrase retry (same pattern as summary).
  // Checked against the concatenated accomplishment text because any one
  // bullet with a filler phrase is one too many. The "Orchestrated the
  // development and implementation of..." tell from jessica-boquist is
  // exactly the shape this catches.
  const joinedForScan = out.parsed.selectedAccomplishments.join('\n');
  const phraseScan = detectForbiddenPhrases(joinedForScan);
  if (phraseScan.foundIds.length > 0) {
    logger.info(
      { section: 'accomplishments', promptName, phrases: phraseScan.foundIds, retry: 1 },
      'accomplishments forbidden-phrase retry triggered',
    );
    const retry = await runSection<{ selectedAccomplishments: string[] }>(
      'accomplishments',
      promptName,
      replacements,
      WrittenAccomplishmentsSchema,
      signal,
      buildForbiddenPhraseRetryAddendum(phraseScan.foundIds),
    );
    const retryScan = detectForbiddenPhrases(
      retry.parsed.selectedAccomplishments.join('\n'),
    );
    if (retryScan.foundIds.length > 0) {
      logger.warn(
        {
          section: 'accomplishments',
          promptName,
          initialPhrases: phraseScan.foundIds,
          retryPhrases: retryScan.foundIds,
        },
        'accomplishments forbidden-phrase retry failed to fully clear — emitting output anyway',
      );
    }
    out = retry;
  }

  return {
    selectedAccomplishments: out.parsed.selectedAccomplishments,
    telemetry: out.telemetry,
  };
}

async function runCompetencies(
  variant: string,
  strategyJson: string,
  resumeJson: string,
  signal?: AbortSignal,
): Promise<{ coreCompetencies: string[]; telemetry: SectionTelemetry }> {
  const out = await runSection<{ coreCompetencies: string[] }>(
    'competencies',
    `write-competencies.${variant}`,
    { strategy_json: strategyJson, resume_json: resumeJson },
    WrittenCompetenciesSchema,
    signal,
  );
  return { coreCompetencies: out.parsed.coreCompetencies, telemetry: out.telemetry };
}

async function runPosition(
  position: Position,
  positionIndex: number,
  variant: string,
  strategyJson: string,
  resumeJson: string,
  signal?: AbortSignal,
): Promise<{ position: WrittenPosition; telemetry: SectionTelemetry }> {
  const positionJson = JSON.stringify(position, null, 2);
  const out = await runSection<WrittenPosition>(
    `position[${positionIndex}]`,
    `write-position.${variant}`,
    {
      strategy_json: strategyJson,
      resume_json: resumeJson,
      position_json: positionJson,
      position_index: String(positionIndex),
    },
    WrittenPositionSchema,
    signal,
  );
  return { position: out.parsed, telemetry: out.telemetry };
}

async function runCustomSection(
  section: CustomSection,
  sectionIndex: number,
  variant: string,
  strategyJson: string,
  signal?: AbortSignal,
): Promise<{ section: WrittenCustomSection; telemetry: SectionTelemetry }> {
  const sectionJson = JSON.stringify(section, null, 2);
  const out = await runSection<WrittenCustomSection>(
    `customSection[${sectionIndex}] ${section.title}`,
    `write-custom-section.${variant}`,
    {
      strategy_json: strategyJson,
      section_json: sectionJson,
    },
    WrittenCustomSectionSchema,
    signal,
  );
  return { section: out.parsed, telemetry: out.telemetry };
}

// -----------------------------------------------------------------------------
// Shared section invocation
// -----------------------------------------------------------------------------

/**
 * Run a single write-stage section through the shared structured-llm-call
 * primitive: load prompt → fill template → stream → fence-strip → parse →
 * validate → one-shot schema retry with write-specific addendum → throw
 * WriteError if both attempts fail.
 *
 * 2026-04-20 pm — migrated from a bespoke stream/parse/validate block to
 * `structuredLlmCall` so write-position gains the schema-retry coverage
 * classify (Fix 5) and verify (Fix 8) already had. See the plan at
 * /Users/johnschrup/.claude/plans/dazzling-weaving-meerkat.md.
 *
 * Semantic retries (pronoun, forbidden-phrase) live as OUTER wrappers in
 * runSummary / runAccomplishments. When they re-invoke runSection with a
 * systemAddendum, they pass `isSemanticRetry: true` so the primitive's
 * structural retry is capped at one attempt — preventing stacked retries
 * from multiplying LLM call counts.
 */
async function runSection<T>(
  section: string,
  promptName: string,
  replacements: Record<string, string>,
  schema: ZodSchema<T>,
  signal: AbortSignal | undefined,
  /** Optional addendum appended to the system message. Used by the
   *  semantic-retry wrappers (pronoun, forbidden-phrase) to nudge a
   *  re-run without touching the prompt file. When provided, the
   *  primitive's structural retry is disabled to cap total LLM calls. */
  systemAddendum?: string,
): Promise<{ parsed: T; telemetry: SectionTelemetry }> {
  const prompt = loadPrompt(promptName);
  let userMessage = prompt.userMessageTemplate;
  for (const [k, v] of Object.entries(replacements)) {
    userMessage = userMessage.replaceAll(`{{${k}}}`, v);
  }

  const { provider, model, backend, extraParams } = getProvider(prompt.capability);
  const isSemanticRetry = Boolean(systemAddendum);
  const system = isSemanticRetry
    ? `${prompt.systemMessage}\n\n---\n\n${systemAddendum}`
    : prompt.systemMessage;

  logger.info(
    {
      section,
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      thinking: extraParams?.thinking === true,
      withAddendum: isSemanticRetry,
    },
    'section start',
  );

  // Thinking mode (deep-writer on Vertex/DeepSeek) generates a substantial
  // reasoning_content stream before the actual content. Give the writer
  // extra headroom when thinking is on so the actual answer has room after
  // the reasoning tokens consume their share.
  const maxTokens = extraParams?.thinking === true ? MAX_OUTPUT_TOKENS * 2 : MAX_OUTPUT_TOKENS;

  try {
    const result = await structuredLlmCall<T>({
      provider,
      model,
      system,
      userMessage,
      temperature: prompt.temperature ?? 0.4,
      maxTokens,
      signal,
      thinking: extraParams?.thinking === true,
      schema,
      buildRetryAddendum: (err) => buildWriteRetryAddendum(section, err),
      // Semantic retry wrappers already constitute a retry — don't let
      // the primitive add a third structural retry on top of that.
      maxStructuralAttempts: isSemanticRetry ? 1 : 2,
      stage: `write:${section}`,
      promptName,
      promptVersion: prompt.version,
    });

    logger.info(
      {
        section,
        promptName,
        promptVersion: prompt.version,
        model,
        backend,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        durationMs: result.durationMs,
        schemaRetryFired: result.retryFired,
      },
      'section complete',
    );

    return {
      parsed: result.parsed,
      telemetry: {
        promptName,
        promptVersion: prompt.version,
        model,
        capability: prompt.capability,
        backend,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        durationMs: result.durationMs,
        schemaRetryFired: result.retryFired,
      },
    };
  } catch (err) {
    // Re-throw as WriteError so existing catch-sites continue to work.
    if (err instanceof StructuredLlmCallError) {
      const firstSummary = summarizeStructuralError(err.detail.firstError);
      const retrySummary = err.detail.retryError
        ? ` | retry: ${summarizeStructuralError(err.detail.retryError)}`
        : '';
      throw new WriteError(
        `Write ${section} failed on ${err.detail.retryError ? 'BOTH the first attempt AND the retry' : 'the first attempt (no retry fired)'} ` +
          `(prompt ${promptName} v${prompt.version}). First: ${firstSummary}${retrySummary}. ` +
          `Fix: strengthen the prompt for the failure pattern, investigate provider health, or widen the write schema if the emitted shape is semantically valid.`,
        {
          section,
          promptName,
          rawResponse: (err.detail.rawRetry ?? err.detail.rawFirst).slice(0, 500),
          validationIssues:
            err.detail.firstError.kind === 'zod-schema'
              ? err.detail.firstError.issues
              : undefined,
        },
      );
    }
    throw err;
  }
}

/**
 * Write-stage retry addendum. Names the specific Zod paths or parse error
 * so the model knows exactly what to fix. Generic per-field type guidance
 * covers the most-observed failure modes (boolean-for-number on confidence,
 * string-for-number, missing required fields).
 */
function buildWriteRetryAddendum(section: string, error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      `RETRY: Your previous response was not valid JSON — the parser reported: ${error.message}.`,
      '',
      'Likely causes: the response was truncated (check that you closed every string and bracket), an unescaped quote appeared inside a string value, or prose/markdown was emitted alongside the JSON.',
      '',
      'Return ONLY the complete JSON object matching the schema the prompt describes. No prose. No markdown fences. Every string properly quoted and terminated; every bracket/brace balanced.',
    ].join('\n');
  }
  const issues = error.issues
    .slice(0, 20)
    .map((i) => {
      const path = i.path.map((p) => String(p)).join('.') || '<root>';
      return `  • ${path}: ${i.message}`;
    });
  return [
    `RETRY: Your previous response failed schema validation. The schema reported:`,
    '',
    issues.join('\n'),
    '',
    'Return the full JSON with these fields corrected. Preserve all other content verbatim. Common fixes:',
    '  • `confidence` fields are numbers between 0.0 and 1.0 — NOT booleans, NOT strings, NOT null.',
    '  • `is_new` and `evidence_found` are booleans — true or false, NOT strings.',
    '  • Required arrays (bullets, entries, etc.) may be empty but must be present.',
    '  • String fields are strings — never null unless the schema explicitly permits it.',
    '',
    'Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

function summarizeStructuralError(err: StructuralError): string {
  if (err.kind === 'json-parse') return `JSON parse: ${err.message}`;
  const head = err.issues
    .slice(0, 5)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  const more = err.issues.length > 5 ? `; ...(${err.issues.length - 5} more)` : '';
  return `Zod (${err.issues.length} issue(s)): ${head}${more}`;
}
