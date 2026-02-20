import type { Context } from 'hono';

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function rejectOversizedJsonBody(c: Context, maxBytes: number): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) return null;
  const parsed = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed <= maxBytes) return null;
  return c.json({ error: `Request too large (max ${maxBytes} bytes)` }, 413);
}

export type JsonBodyParseResult =
  | { ok: true; data: unknown }
  | { ok: false; response: Response };

/**
 * Parse JSON body with an actual byte-size guard.
 * Protects endpoints even when Content-Length is absent or incorrect.
 */
export async function parseJsonBodyWithLimit(c: Context, maxBytes: number): Promise<JsonBodyParseResult> {
  const upfront = rejectOversizedJsonBody(c, maxBytes);
  if (upfront) return { ok: false, response: upfront };

  let raw = '';
  try {
    raw = await c.req.text();
  } catch {
    return { ok: false, response: c.json({ error: 'Failed to read request body' }, 400) };
  }

  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > maxBytes) {
    return {
      ok: false,
      response: c.json({ error: `Request too large (max ${maxBytes} bytes)` }, 413),
    };
  }

  if (!raw.trim()) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    // Keep existing route semantics: invalid JSON flows into schema/manual validation.
    return { ok: true, data: {} };
  }
}
