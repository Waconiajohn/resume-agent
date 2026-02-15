import { randomUUID } from 'node:crypto';
import type { Context, Next } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = c.req.header('X-Request-ID') ?? randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
}
