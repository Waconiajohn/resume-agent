// Stage 1 — Extract.
// Deterministic plaintext extraction from PDF / DOCX / text input.
// No LLM. No semantic interpretation. Regex is allowed here for mechanical
// cleanup (trimming whitespace, collapsing blank lines) per
// docs/v3-rebuild/OPERATING-MANUAL.md.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 1,
//             docs/v3-rebuild/02-Migration-Plan.md Week 1 Day 1-2,
//             docs/v3-rebuild/kickoffs/phase-2-kickoff.md §3.
//
// Rules:
// - DOCX → mammoth's `convertToMarkdown` so bullet markers and headings
//   survive. Downstream stages can treat markdown as cosmetic decoration.
// - PDF → pdf-parse v2's PDFParse class.
// - TXT/MD → pass-through after newline normalization.
// - Format detected from filename extension; buffer magic-byte signature
//   is used as a tiebreaker when the extension disagrees.
// - Unreadable / corrupted input throws a loud Error — no silent fallback
//   (OPERATING-MANUAL.md).
// - Warnings (not errors) are collected for unusual but tolerable inputs:
//   embedded images, multi-column layouts, and anything mammoth or
//   pdf-parse flags at parse time.

import { readFileSync } from 'node:fs';
import mammothDefault from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { ExtractFormat, ExtractResult, PipelineInput } from '../types.js';

// mammoth's published .d.ts omits convertToMarkdown even though the runtime
// exports it. Narrow type augmentation avoids an `any` escape hatch.
interface MammothWithMarkdown {
  convertToMarkdown: (
    input: { buffer: Buffer },
  ) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
}
const mammoth = mammothDefault as unknown as typeof mammothDefault & MammothWithMarkdown;

/**
 * Stage 1 entry point.
 * The input carries a `buffer`, a `text`, or both. If only `filename` is
 * provided, the function loads the file from disk — convenient for the
 * fixture runner, which discovers files by path.
 */
export async function extract(
  input: PipelineInput['resume'] & { path?: string },
): Promise<ExtractResult> {
  const { buffer, text, filename, path } = input;

  // Resolve a buffer from whichever input was supplied.
  const resolved = resolveBuffer({ buffer, text, filename, path });
  const format = resolveFormat({
    filename,
    path,
    buffer: resolved.buffer,
  });

  switch (format) {
    case 'docx':
      return await extractDocx(resolved.buffer, resolved.filenameForWarnings);
    case 'pdf':
      return await extractPdf(resolved.buffer, resolved.filenameForWarnings);
    case 'text':
      return extractText(resolved.buffer, resolved.filenameForWarnings);
  }
}

// -----------------------------------------------------------------------------
// Input resolution
// -----------------------------------------------------------------------------

interface ResolvedInput {
  buffer: Buffer;
  filenameForWarnings: string;
}

function resolveBuffer(input: {
  buffer?: Buffer;
  text?: string;
  filename?: string;
  path?: string;
}): ResolvedInput {
  if (input.buffer) {
    return {
      buffer: input.buffer,
      filenameForWarnings: input.filename ?? input.path ?? '<buffer>',
    };
  }
  if (typeof input.text === 'string') {
    return {
      buffer: Buffer.from(input.text, 'utf8'),
      filenameForWarnings: input.filename ?? '<text>',
    };
  }
  if (input.path) {
    return {
      buffer: readFileSync(input.path),
      filenameForWarnings: input.filename ?? input.path,
    };
  }
  throw new Error(
    'extract: input must carry one of { buffer, text, path }. Got none.',
  );
}

// -----------------------------------------------------------------------------
// Format detection (mechanical)
// -----------------------------------------------------------------------------

function resolveFormat(input: {
  filename?: string;
  path?: string;
  buffer: Buffer;
}): ExtractFormat {
  const name = (input.filename ?? input.path ?? '').toLowerCase();
  const byExt = extFromName(name);
  const bySignature = signatureFromBuffer(input.buffer);

  // Prefer signature when present — more reliable than the filename extension.
  if (bySignature) return bySignature;
  if (byExt) return byExt;

  // Nothing conclusive — treat as text only if the buffer is plausibly UTF-8.
  if (looksLikeText(input.buffer)) return 'text';
  throw new Error(
    `extract: could not determine format for input "${input.filename ?? input.path ?? '<buffer>'}" (no .docx/.pdf/.txt/.md extension, and buffer did not match a known signature).`,
  );
}

function extFromName(name: string): ExtractFormat | null {
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'text';
  return null;
}

function signatureFromBuffer(buffer: Buffer): ExtractFormat | null {
  // PDF: "%PDF" (0x25 50 44 46) at offset 0.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'pdf';
  }
  // DOCX is a ZIP: "PK\x03\x04" at offset 0.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'docx';
  }
  return null;
}

function looksLikeText(buffer: Buffer): boolean {
  // Mechanical heuristic: the first 512 bytes contain no NUL bytes.
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  for (const b of sample) if (b === 0) return false;
  return true;
}

// -----------------------------------------------------------------------------
// DOCX
// -----------------------------------------------------------------------------

async function extractDocx(
  buffer: Buffer,
  source: string,
): Promise<ExtractResult> {
  let result: Awaited<ReturnType<MammothWithMarkdown['convertToMarkdown']>>;
  try {
    result = await mammoth.convertToMarkdown({ buffer });
  } catch (err) {
    throw new Error(
      `extract: mammoth failed to parse DOCX "${source}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const warnings: string[] = [];
  for (const m of result.messages) {
    // mammoth flags unrecognized styles, embedded images, etc.
    warnings.push(`docx(${m.type}): ${m.message}`);
  }

  // Detect base64 payloads before they're stripped so the warning survives
  // normalization. Mechanical check.
  if (containsBase64DataUri(result.value)) {
    warnings.push(
      'docx(images): inlined base64 image data stripped during normalization',
    );
  }

  const plaintext = normalizePlaintext(result.value);
  pushContentWarnings(plaintext, warnings);

  return { plaintext, format: 'docx', warnings };
}

// -----------------------------------------------------------------------------
// PDF
// -----------------------------------------------------------------------------

async function extractPdf(
  buffer: Buffer,
  source: string,
): Promise<ExtractResult> {
  const warnings: string[] = [];
  let parsedText = '';
  const parser = new PDFParse({ data: buffer });

  try {
    const out = await parser.getText();
    // pdf-parse v2 returns something like { text: string, total: number, pages: [] }
    // Different minor versions differ slightly; pick the first truthy field.
    parsedText =
      (out as { text?: string }).text ??
      (typeof out === 'string' ? out : '') ??
      '';
    if (!parsedText) {
      warnings.push(
        'pdf: parser returned empty text — may be scanned/image-only PDF',
      );
    }
  } catch (err) {
    throw new Error(
      `extract: pdf-parse failed to parse PDF "${source}": ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    // PDFParse exposes a destroy() for cleanup; best-effort.
    try {
      parser.destroy?.();
    } catch {
      // swallow — destroy is cleanup only, errors here shouldn't hide real failures
    }
  }

  const plaintext = normalizePlaintext(parsedText);
  pushContentWarnings(plaintext, warnings);

  return { plaintext, format: 'pdf', warnings };
}

// -----------------------------------------------------------------------------
// Plain text / markdown
// -----------------------------------------------------------------------------

function extractText(buffer: Buffer, _source: string): ExtractResult {
  const warnings: string[] = [];
  const asString = buffer.toString('utf8');

  // If the decoded string still contains replacement chars (U+FFFD), the
  // source wasn't valid UTF-8. Flag it but don't fail — downstream may still
  // cope.
  if (asString.includes('\uFFFD')) {
    warnings.push('text: input contains U+FFFD replacement characters — likely non-UTF-8 encoding');
  }

  const plaintext = normalizePlaintext(asString);
  pushContentWarnings(plaintext, warnings);

  return { plaintext, format: 'text', warnings };
}

// -----------------------------------------------------------------------------
// Shared post-processing (mechanical)
// -----------------------------------------------------------------------------

// Detect data:image/...;base64,... URIs in the input. Emits a boolean so the
// extractor can surface a warning; the URIs are stripped by normalizePlaintext.
function containsBase64DataUri(input: string): boolean {
  return /data:image\/[a-z0-9+.-]+;base64,/i.test(input);
}

function normalizePlaintext(input: string): string {
  // 1. Strip base64 data URIs. mammoth inlines embedded images as
  //    "![](data:image/png;base64,....)" which bloats the text by hundreds
  //    of KB per image and carries zero semantic content. This is a
  //    mechanical cleanup, not a semantic decision — the URI syntax is
  //    unambiguous.
  let stripped = input
    // "![alt](data:image/...;base64,...)" — markdown image with data URI
    .replace(/!\[[^\]]*\]\(data:image\/[a-z0-9+.-]+;base64,[^)]*\)/gi, '')
    // bare "data:image/...;base64,..." anywhere (any trailing chars up to whitespace)
    .replace(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, '');

  // 2. Strip mammoth's markdown-escape sequences for punctuation.
  //    Phones come out as "303\-807\-6872", emails as "ben\.wedewer@gmail\.com".
  //    Strip the escapes — they are noise and they break plain-text PII
  //    patterns. Meaningful markdown structure (leading "-" for bullets,
  //    "#" for headings) is untouched because it isn't preceded by a backslash.
  stripped = stripped.replace(/\\([^A-Za-z0-9\s])/g, '$1');

  // 3. Normalize line endings to \n, trim trailing whitespace on each line,
  //    collapse runs of 3+ blank lines to 2. Preserve bullet/indentation.
  const normalized = stripped
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

function pushContentWarnings(plaintext: string, warnings: string[]): void {
  // Flag suspected multi-column layout: very short lines followed by very
  // short lines over a long stretch is a common multi-column artifact.
  const lines = plaintext.split('\n');
  if (lines.length >= 40) {
    const shortRun = lines.filter((l) => l.length > 0 && l.length < 20).length;
    if (shortRun / lines.length > 0.5) {
      warnings.push(
        'content: more than half of non-empty lines are under 20 chars — possible multi-column extraction artifact',
      );
    }
  }
  // Flag embedded-image placeholders from mammoth.
  if (/\[image[^\]]*\]/i.test(plaintext)) {
    warnings.push('content: embedded image placeholder(s) present');
  }
}
