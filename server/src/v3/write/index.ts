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

import type { StreamEvent } from '../../lib/llm-provider.js';
import { loadPrompt } from '../prompts/loader.js';
import { getProvider } from '../providers/factory.js';
import { createV3Logger } from '../observability/logger.js';
import {
  WrittenSummarySchema,
  WrittenAccomplishmentsSchema,
  WrittenCompetenciesSchema,
  WrittenPositionSchema,
  WrittenCustomSectionSchema,
} from './schema.js';
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

  const positionRunners = resume.positions.map((position, idx) =>
    runPosition(position, idx, variant, strategyJson, resumeJson, options.signal),
  );
  const customSectionRunners = resume.customSections.map((section, idx) =>
    runCustomSection(section, idx, variant, strategyJson, options.signal),
  );

  // Fire in parallel. Promise.all rejects on first failure.
  const results = await Promise.all([
    runSummary(variant, strategyJson, resumeJson, options.signal),
    runAccomplishments(variant, strategyJson, resumeJson, options.signal),
    runCompetencies(variant, strategyJson, resumeJson, options.signal),
    ...positionRunners,
    ...customSectionRunners,
  ]);

  const summaryRes = results[0] as Awaited<ReturnType<typeof runSummary>>;
  const accomplishmentsRes = results[1] as Awaited<ReturnType<typeof runAccomplishments>>;
  const competenciesRes = results[2] as Awaited<ReturnType<typeof runCompetencies>>;
  const positionResults = results.slice(3, 3 + positionRunners.length) as Awaited<
    ReturnType<typeof runPosition>
  >[];
  const customSectionResults = results.slice(3 + positionRunners.length) as Awaited<
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
  const out = await runSection<{ summary: string }>(
    'summary',
    `write-summary.${variant}`,
    { strategy_json: strategyJson, resume_json: resumeJson },
    WrittenSummarySchema.safeParse.bind(WrittenSummarySchema),
    signal,
  );
  return { summary: out.parsed.summary, telemetry: out.telemetry };
}

async function runAccomplishments(
  variant: string,
  strategyJson: string,
  resumeJson: string,
  signal?: AbortSignal,
): Promise<{ selectedAccomplishments: string[]; telemetry: SectionTelemetry }> {
  const out = await runSection<{ selectedAccomplishments: string[] }>(
    'accomplishments',
    `write-accomplishments.${variant}`,
    { strategy_json: strategyJson, resume_json: resumeJson },
    WrittenAccomplishmentsSchema.safeParse.bind(WrittenAccomplishmentsSchema),
    signal,
  );
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
    WrittenCompetenciesSchema.safeParse.bind(WrittenCompetenciesSchema),
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
    WrittenPositionSchema.safeParse.bind(WrittenPositionSchema),
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
    WrittenCustomSectionSchema.safeParse.bind(WrittenCustomSectionSchema),
    signal,
  );
  return { section: out.parsed, telemetry: out.telemetry };
}

// -----------------------------------------------------------------------------
// Shared section invocation
// -----------------------------------------------------------------------------

interface SafeParseFn<T> {
  (data: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
}

async function runSection<T>(
  section: string,
  promptName: string,
  replacements: Record<string, string>,
  safeParse: SafeParseFn<T>,
  signal: AbortSignal | undefined,
): Promise<{ parsed: T; telemetry: SectionTelemetry }> {
  const prompt = loadPrompt(promptName);
  let userMessage = prompt.userMessageTemplate;
  for (const [k, v] of Object.entries(replacements)) {
    userMessage = userMessage.replaceAll(`{{${k}}}`, v);
  }

  const { provider, model, backend } = getProvider(prompt.capability);
  const start = Date.now();

  logger.info({ section, promptName, promptVersion: prompt.version, model, backend }, 'section start');

  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  for await (const event of provider.stream({
    model,
    system: prompt.systemMessage,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: prompt.temperature,
    signal,
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }

  const durationMs = Date.now() - start;

  if (!fullText.trim()) {
    throw new WriteError(`Write ${section} returned empty response`, {
      section,
      promptName,
      rawResponse: fullText,
    });
  }

  const cleaned = stripMarkdownJsonFence(fullText.trim());

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    throw new WriteError(
      `Write ${section} response is not valid JSON (prompt ${promptName}): ${err instanceof Error ? err.message : String(err)}`,
      { section, promptName, rawResponse: fullText.slice(0, 500) },
    );
  }

  const result = safeParse(parsedRaw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 20)
      .map((i) => {
        const issue = i as { path?: unknown[]; message?: string };
        const path = Array.isArray(issue.path) ? issue.path.join('.') : '<root>';
        return `${path}: ${issue.message ?? 'invalid'}`;
      });
    throw new WriteError(
      `Write ${section} output did not match its schema (prompt ${promptName}). ` +
        `Zod reported ${result.error.issues.length} issue(s): ` +
        issues.join('; '),
      {
        section,
        promptName,
        rawResponse: fullText.slice(0, 500),
        validationIssues: result.error.issues,
      },
    );
  }

  logger.info(
    {
      section,
      promptName,
      promptVersion: prompt.version,
      model,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
    'section complete',
  );

  return {
    parsed: result.data,
    telemetry: {
      promptName,
      promptVersion: prompt.version,
      model,
      capability: prompt.capability,
      backend,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs,
    },
  };
}

// Strip a surrounding ```json ... ``` (or ``` ... ```) markdown fence if
// present. Idempotent; safe to call on already-bare JSON.
function stripMarkdownJsonFence(input: string): string {
  const s = input.trim();
  const fenceStart = /^```(?:json|JSON)?\s*\n/;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(s) && fenceEnd.test(s)) {
    return s.replace(fenceStart, '').replace(fenceEnd, '').trim();
  }
  return s;
}
