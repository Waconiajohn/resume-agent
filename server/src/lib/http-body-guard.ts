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

type BodyReadResult =
  | { ok: true; raw: string }
  | { ok: false; response: Response };

async function readUtf8BodyWithLimit(c: Context, maxBytes: number): Promise<BodyReadResult> {
  const req = c.req.raw;
  if (req.bodyUsed) {
    return { ok: false, response: c.json({ error: 'Request body is not readable' }, 400) };
  }

  const stream = req.body;
  if (!stream) return { ok: true, raw: '' };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // best effort
        }
        return {
          ok: false,
          response: c.json({ error: `Request too large (max ${maxBytes} bytes)` }, 413),
        };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: c.json({ error: 'Failed to read request body' }, 400) };
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const raw = new TextDecoder().decode(merged);
  return { ok: true, raw };
}

/**
 * Parse JSON body with an actual byte-size guard.
 * Protects endpoints even when Content-Length is absent or incorrect.
 */
export async function parseJsonBodyWithLimit(c: Context, maxBytes: number): Promise<JsonBodyParseResult> {
  const upfront = rejectOversizedJsonBody(c, maxBytes);
  if (upfront) return { ok: false, response: upfront };

  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (contentType && !contentType.includes('application/json')) {
    return {
      ok: false,
      response: c.json({ error: 'Unsupported content type. Use application/json.' }, 415),
    };
  }

  const read = await readUtf8BodyWithLimit(c, maxBytes);
  if (!read.ok) return read;
  const raw = read.raw;

  if (!raw.trim()) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    // Keep existing route semantics: invalid JSON flows into schema/manual validation.
    return { ok: true, data: {} };
  }
}
