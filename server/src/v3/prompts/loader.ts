// Prompt loader for v3.
// Reads a prompt file by name (e.g. "classify.v1"), parses YAML frontmatter via
// gray-matter, validates required fields, and returns a typed LoadedPrompt.
//
// Implements: docs/v3-rebuild/03-Prompt-Library-Structure.md (file format),
//             docs/v3-rebuild/kickoffs/phase-1-kickoff.md §2.
//
// No silent fallback: a missing file, missing frontmatter, or missing required
// field throws PromptLoadError. See OPERATING-MANUAL.md "No silent fallbacks".

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import matter from 'gray-matter';
import { PromptLoadError } from '../errors.js';
import type { LoadedPrompt } from '../types.js';

// Default prompt root: <repo>/server/prompts/
// Resolved relative to this file at compile time:
//   server/src/v3/prompts/loader.ts  ->  server/prompts/
const DEFAULT_PROMPT_ROOT = resolve(
  new URL('.', import.meta.url).pathname,
  '../../../prompts',
);

export interface LoadPromptOptions {
  /** Override the prompt root (used by tests). */
  root?: string;
}

/**
 * Loads a prompt file by name. The name does not include the `.md` extension.
 * Examples: "classify.v1", "classify.v2-test", "write-summary.v1".
 */
export function loadPrompt(
  name: string,
  options: LoadPromptOptions = {},
): LoadedPrompt {
  const root = options.root ?? DEFAULT_PROMPT_ROOT;
  const path = resolve(root, `${name}.md`);

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

  const fm = parsed.data as Record<string, unknown>;
  const body = parsed.content;

  requireField(fm, 'stage', path);
  requireField(fm, 'version', path);
  requireField(fm, 'model', path);
  requireField(fm, 'temperature', path);

  // "version: 1.0" is parsed as the number 1 by YAML, which loses the
  // trailing zero when stringified. Require versions to be quoted strings in
  // the frontmatter so "1.0" and "1" stay distinct.
  if (typeof fm.version !== 'string') {
    throw new PromptLoadError(
      `Prompt frontmatter field "version" must be a quoted string in ${path} (got ${typeof fm.version}: ${JSON.stringify(fm.version)}). Use version: "1.0", not version: 1.0.`,
    );
  }

  const temperature = fm.temperature;
  if (typeof temperature !== 'number') {
    throw new PromptLoadError(
      `Prompt frontmatter field "temperature" must be a number in ${path} (got ${typeof temperature})`,
    );
  }

  const { systemMessage, userMessageTemplate } = splitPromptBody(body, path);

  return {
    stage: String(fm.stage),
    version: fm.version,
    model: String(fm.model),
    temperature,
    lastEdited: formatDateLike(fm.last_edited),
    lastEditor: fm.last_editor ? String(fm.last_editor) : '',
    notes: fm.notes ? String(fm.notes) : '',
    systemMessage,
    userMessageTemplate,
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
