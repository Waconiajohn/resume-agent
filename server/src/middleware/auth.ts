import type { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email: string;
  accessToken: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email ?? '',
    accessToken: token,
  });

  await next();
}
