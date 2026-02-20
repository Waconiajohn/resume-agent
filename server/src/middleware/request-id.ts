import { randomUUID } from 'node:crypto';
import type { Context, Next } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export async function requestIdMiddleware(c: Context, next: Next) {
  const raw = c.req.header('X-Request-ID');
  let requestId: string = randomUUID();
  if (raw) {
    const candidate = raw.trim().slice(0, 64);
    if (/^[A-Za-z0-9._:-]+$/.test(candidate)) {
      requestId = candidate;
    }
  }
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
}
