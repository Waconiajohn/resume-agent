// Prompt loader for v3.
// Reads a prompt file by name (e.g. "classify.v1"), parses YAML frontmatter via
// gray-matter, validates required fields, resolves {{shared:...}} fragment
// references against server/prompts/_shared/, and returns a typed LoadedPrompt.
//
// Implements: docs/v3-rebuild/03-Prompt-Library-Structure.md (file format),
//             docs/v3-rebuild/01-Architecture-Vision.md §"Shared prompt scaffolding",
//             docs/v3-rebuild/kickoffs/phase-1-kickoff.md §2.
//
// No silent fallback: a missing file, missing frontmatter, missing required
// field, circular shared-fragment reference, or unknown shared fragment
// throws PromptLoadError. See OPERATING-MANUAL.md "No silent fallbacks".

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import matter from 'gray-matter';
import { PromptLoadError } from '../errors.js';
import logger from '../../lib/logger.js';
import type { LoadedPrompt } from '../types.js';

// Default prompt root: <repo>/server/prompts/
// Resolved relative to this file at compile time:
//   server/src/v3/prompts/loader.ts  ->  server/prompts/
const DEFAULT_PROMPT_ROOT = resolve(
  new URL('.', import.meta.url).pathname,
  '../../../prompts',
);

const SHARED_DIR = '_shared';

// Shared fragment reference syntax: {{shared:fragment-name}}
// - fragment-name may contain letters, digits, hyphens, underscores, dots.
// - Resolved to `<promptRoot>/_shared/<fragment-name>.md` body (frontmatter
//   stripped if present).
const SHARED_REF_REGEX = /\{\{\s*shared:([a-zA-Z0-9_.\-]+)\s*\}\}/g;

// Maximum depth of nested shared fragment inclusions. Prevents runaway
// recursion if the cycle detector misses a bug. Realistic usage is 0-2.
const MAX_SHARED_DEPTH = 6;

export interface LoadPromptOptions {
  /** Override the prompt root (used by tests). */
  root?: string;
}

/**
 * Loads a prompt file by name. The name does not include the `.md` extension.
 * Examples: "classify.v1", "classify.v2-test", "write-summary.v1".
 *
 * The returned prompt has `{{shared:...}}` references in its system and user
 * templates already expanded against server/prompts/_shared/.
 */
export function loadPrompt(
  name: string,
  options: LoadPromptOptions = {},
): LoadedPrompt {
  const root = options.root ?? DEFAULT_PROMPT_ROOT;
  const path = resolve(root, `${name}.md`);

  const { frontmatter, body } = readAndParse(path);

  requireField(frontmatter, 'stage', path);
  requireField(frontmatter, 'version', path);
  // capability is the v3 standard frontmatter field. The older `model` field
  // is accepted with a warning for files not yet ported (Phase 3.5).
  const hasCapability = frontmatter.capability !== undefined && frontmatter.capability !== null;
  const hasModel = frontmatter.model !== undefined && frontmatter.model !== null;
  if (!hasCapability && !hasModel) {
    throw new PromptLoadError(
      `Prompt frontmatter is missing required field "capability" (or legacy "model") in ${path}. ` +
        `Use capability: strong-reasoning or capability: fast-writer.`,
    );
  }
  requireField(frontmatter, 'temperature', path);

  // "version: 1.0" is parsed as the number 1 by YAML, which loses the
  // trailing zero when stringified. Require versions to be quoted strings in
  // the frontmatter so "1.0" and "1" stay distinct.
  if (typeof frontmatter.version !== 'string') {
    throw new PromptLoadError(
      `Prompt frontmatter field "version" must be a quoted string in ${path} (got ${typeof frontmatter.version}: ${JSON.stringify(frontmatter.version)}). Use version: "1.0", not version: 1.0.`,
    );
  }

  const temperature = frontmatter.temperature;
  if (typeof temperature !== 'number') {
    throw new PromptLoadError(
      `Prompt frontmatter field "temperature" must be a number in ${path} (got ${typeof temperature})`,
    );
  }

  let capability: string;
  if (hasCapability) {
    capability = String(frontmatter.capability);
    if (
      capability !== 'strong-reasoning' &&
      capability !== 'fast-writer' &&
      capability !== 'deep-writer'
    ) {
      throw new PromptLoadError(
        `Prompt frontmatter field "capability" must be one of: strong-reasoning, fast-writer, deep-writer. Got "${capability}" in ${path}.`,
      );
    }
  } else {
    // Legacy fallback: infer capability from the old `model` field so that
    // prompts not yet ported in Phase 3.5 still load. Emits a warn log.
    const modelStr = String(frontmatter.model);
    capability = modelStr.includes('opus') || modelStr.includes('reasoning')
      ? 'strong-reasoning'
      : 'fast-writer';
    logger.warn(
      { path, model: modelStr, inferredCapability: capability },
      'v3 prompt loader: "model" frontmatter is deprecated; use "capability" (strong-reasoning | fast-writer).',
    );
  }

  const { systemMessage, userMessageTemplate } = splitPromptBody(body, path);

  // Resolve shared fragment references against <root>/_shared/*.md.
  const resolvedSystem = resolveSharedFragments(systemMessage, root, path, new Set(), 0);
  const resolvedUser = resolveSharedFragments(userMessageTemplate, root, path, new Set(), 0);

  return {
    stage: String(frontmatter.stage),
    version: frontmatter.version,
    // `model` in LoadedPrompt is retained for backwards compatibility: older
    // call sites read it. For capability-based prompts we surface the
    // capability string here so telemetry has something to log; the factory
    // resolves the concrete model at call time.
    model: hasCapability ? capability : String(frontmatter.model),
    capability: capability as 'strong-reasoning' | 'fast-writer' | 'deep-writer',
    temperature,
    lastEdited: formatDateLike(frontmatter.last_edited),
    lastEditor: frontmatter.last_editor ? String(frontmatter.last_editor) : '',
    notes: frontmatter.notes ? String(frontmatter.notes) : '',
    systemMessage: resolvedSystem,
    userMessageTemplate: resolvedUser,
  };
}

function readAndParse(path: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new PromptLoadError(
      `Prompt file not found or unreadable: ${path}`,
      cause,
    );
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (cause) {
    throw new PromptLoadError(
      `Prompt frontmatter failed to parse: ${path}`,
      cause,
    );
  }
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}

// YAML parses unquoted "2026-04-17" as a Date. Locale-sensitive toString()
// shifts timezones; render Dates as UTC YYYY-MM-DD so round-trip is stable.
function formatDateLike(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

function requireField(
  fm: Record<string, unknown>,
  field: string,
  path: string,
): void {
  if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
    throw new PromptLoadError(
      `Prompt frontmatter is missing required field "${field}" in ${path}`,
    );
  }
}

/**
 * Splits the prompt body on the `# User message template` header.
 * Everything before the header becomes systemMessage; everything after becomes
 * userMessageTemplate.
 *
 * Every prompt MUST include a `# User message template` heading. A missing
 * heading is a loud error per OPERATING-MANUAL.md "No silent fallbacks" — a
 * prompt file without a user-template section is a mistake and we fail at
 * load time so it cannot silently route zero runtime context to the LLM.
 */
function splitPromptBody(
  body: string,
  path: string,
): { systemMessage: string; userMessageTemplate: string } {
  const marker = /^#\s+User message template\s*$/im;
  const match = marker.exec(body);
  if (!match) {
    throw new PromptLoadError(
      `Prompt is missing the required "# User message template" section in ${path}. Add a heading "# User message template" followed by the user-message body.`,
    );
  }
  const systemMessage = body.slice(0, match.index).trim();
  const userMessageTemplate = body.slice(match.index + match[0].length).trim();
  if (systemMessage.length === 0) {
    throw new PromptLoadError(
      `Prompt body has no system message before the "# User message template" header in ${path}`,
    );
  }
  if (userMessageTemplate.length === 0) {
    throw new PromptLoadError(
      `Prompt "# User message template" section is empty in ${path}. A prompt without a user template cannot feed runtime context to the model.`,
    );
  }
  return { systemMessage, userMessageTemplate };
}

/**
 * Replace every {{shared:fragment-name}} reference in `text` with the body
 * of `<root>/_shared/<fragment-name>.md`. Fragments may themselves include
 * shared references (nested to MAX_SHARED_DEPTH).
 *
 * Circular references throw PromptLoadError: "shared A → shared B → shared A".
 * Missing fragment files throw PromptLoadError with the expected path.
 */
function resolveSharedFragments(
  text: string,
  root: string,
  contextPath: string,
  visited: Set<string>,
  depth: number,
): string {
  if (depth > MAX_SHARED_DEPTH) {
    throw new PromptLoadError(
      `Shared fragment inclusion exceeded max depth ${MAX_SHARED_DEPTH} in ${contextPath}. Check for accidental nesting.`,
    );
  }
  return text.replace(SHARED_REF_REGEX, (_match, rawName: string) => {
    const name = rawName.trim();
    if (visited.has(name)) {
      const cycle = [...visited, name].join(' → ');
      throw new PromptLoadError(
        `Circular shared fragment reference in ${contextPath}: ${cycle}`,
      );
    }
    const fragmentPath = resolve(root, SHARED_DIR, `${name}.md`);
    let fragment: string;
    try {
      fragment = readFileSync(fragmentPath, 'utf8');
    } catch (cause) {
      throw new PromptLoadError(
        `Shared fragment not found: {{shared:${name}}} referenced from ${contextPath} → expected ${fragmentPath}`,
        cause,
      );
    }
    // Fragments may have their own (optional) frontmatter. Strip it so only
    // the body is spliced into the caller.
    const parsed = matter(fragment);
    const fragmentBody = parsed.content.trim();

    const nextVisited = new Set(visited);
    nextVisited.add(name);
    return resolveSharedFragments(
      fragmentBody,
      root,
      fragmentPath,
      nextVisited,
      depth + 1,
    );
  });
}
