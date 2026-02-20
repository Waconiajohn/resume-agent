import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { requestIdMiddleware } from './middleware/request-id.js';
import { sessions, getSessionRouteStats } from './routes/sessions.js';
import { resumes } from './routes/resumes.js';
import { pipeline, getPipelineRouteStats } from './routes/pipeline.js';
import { supabaseAdmin } from './lib/supabase.js';
import { releaseAllLocks } from './lib/session-lock.js';
import { getRateLimitStats } from './middleware/rate-limit.js';
import { getAuthCacheStats } from './middleware/auth.js';
import { getRequestMetrics, recordRequestMetric } from './lib/request-metrics.js';
import logger from './lib/logger.js';

const app = new Hono();
let shuttingDown = false;

const isProduction = process.env.NODE_ENV === 'production';
const maxHeapUsedMb = (() => {
  const parsed = Number.parseInt(process.env.MAX_HEAP_USED_MB ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
})();
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : isProduction
    ? [] // Block all CORS in production if not configured
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

if (isProduction && !process.env.ALLOWED_ORIGINS) {
  logger.error('ALLOWED_ORIGINS not set in production — all cross-origin requests will be blocked');
}

app.use('*', requestIdMiddleware);

app.use('*', async (c, next) => {
  const startedAt = Date.now();
  let status = 500;
  try {
    const requestPath = c.req.path;
    const bypass = requestPath === '/health' || requestPath === '/metrics';

    if (shuttingDown && !bypass) {
      status = 503;
      return c.json({ error: 'Server is restarting. Please retry shortly.' }, 503);
    }

    if (maxHeapUsedMb > 0 && !bypass) {
      const heapUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      if (heapUsedMb >= maxHeapUsedMb) {
        status = 503;
        return c.json({
          error: 'Server temporarily overloaded. Please retry shortly.',
          code: 'OVERLOADED',
        }, 503);
      }
    }

    await next();
    status = c.res.status;
  } finally {
    recordRequestMetric(status, Date.now() - startedAt);
  }
});

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

  const configuredProvider = process.env.LLM_PROVIDER?.toLowerCase();
  const llmProvider = configuredProvider === 'zai' || configuredProvider === 'anthropic'
    ? configuredProvider
    : (process.env.ZAI_API_KEY ? 'zai' : 'anthropic');
  const llmKeyPresent = llmProvider === 'zai'
    ? Boolean(process.env.ZAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
  const status = shuttingDown
    ? 'draining'
    : (dbOk && llmKeyPresent ? 'ok' : 'degraded');
  return c.json({ status, shutting_down: shuttingDown, timestamp: new Date().toISOString() });
});

const startTime = Date.now();

app.get('/metrics', (c) => {
  const metricsKey = process.env.METRICS_KEY;
  if (metricsKey) {
    if (c.req.header('Authorization') !== `Bearer ${metricsKey}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  } else if (isProduction) {
    return c.json({ error: 'Not found' }, 404);
  }

  const memUsage = process.memoryUsage();
  const sessionStats = getSessionRouteStats();
  const pipelineStats = getPipelineRouteStats();
  const rateLimitStats = getRateLimitStats();
  const authCacheStats = getAuthCacheStats();
  const requestStats = getRequestMetrics();
  return c.json({
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    shutting_down: shuttingDown,
    // Backward-compatible top-level metrics
    active_sse_sessions: sessionStats.active_sse_sessions,
    total_sse_emitters: sessionStats.total_sse_emitters,
    session_runtime: sessionStats,
    pipeline_runtime: pipelineStats,
    rate_limit_runtime: rateLimitStats,
    auth_cache_runtime: authCacheStats,
    http_runtime: requestStats,
    load_shedding: {
      max_heap_used_mb: maxHeapUsedMb,
      active: maxHeapUsedMb > 0,
      heap_used_mb_now: Math.round(memUsage.heapUsed / 1024 / 1024),
    },
    memory: {
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    node_version: process.version,
  });
});

app.route('/api/sessions', sessions);
app.route('/api/resumes', resumes);
app.route('/api/pipeline', pipeline);

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

app.onError((err, c) => {
  const requestId = c.get('requestId');
  logger.error({ err, requestId }, 'Unhandled error');
  return c.json({ error: 'Internal server error', request_id: requestId }, 500);
});

const port = parseInt(process.env.PORT ?? '3001');

logger.info({ port }, 'Resume Agent server starting');

const server = serve({ fetch: app.fetch, port });

logger.info({ port }, `Server running at http://localhost:${port}`);

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
