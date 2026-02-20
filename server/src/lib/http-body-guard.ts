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
