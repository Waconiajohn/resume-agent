import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { requestIdMiddleware } from './middleware/request-id.js';
import { sessions } from './routes/sessions.js';
import { resumes } from './routes/resumes.js';
import { supabaseAdmin } from './lib/supabase.js';
import { releaseAllLocks } from './lib/session-lock.js';
import logger from './lib/logger.js';

const app = new Hono();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
  logger.warn('ALLOWED_ORIGINS not set in production — falling back to localhost origins');
}

app.use('*', requestIdMiddleware);

app.use('*', cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.get('/health', async (c) => {
  // Lightweight public health check — no config details exposed
  let dbOk = false;
  try {
    const { error } = await supabaseAdmin.from('coach_sessions').select('id').limit(1);
    dbOk = !error;
  } catch {
    // db down
  }

  const status = dbOk && process.env.ANTHROPIC_API_KEY ? 'ok' : 'degraded';
  return c.json({ status, timestamp: new Date().toISOString() });
});

app.route('/api/sessions', sessions);
app.route('/api/resumes', resumes);

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

app.onError((err, c) => {
  logger.error({ err, requestId: c.get('requestId') }, 'Unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

const port = parseInt(process.env.PORT ?? '3001');

logger.info({ port }, 'Resume Agent server starting');

const server = serve({ fetch: app.fetch, port });

logger.info({ port }, `Server running at http://localhost:${port}`);

// Graceful shutdown
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  // Release all session locks so users aren't blocked after restart
  releaseAllLocks().catch(() => {});

  // Close HTTP server (stop accepting new connections)
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    logger.warn('Forcing exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
