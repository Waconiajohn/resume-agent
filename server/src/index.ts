import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { requestIdMiddleware } from './middleware/request-id.js';
import { sessions, getSessionRouteStats } from './routes/sessions.js';
import { resumes } from './routes/resumes.js';
import { v3Pipeline } from './routes/v3-pipeline.js';
import { workflow } from './routes/workflow.js';
import { billing } from './routes/billing.js';
import { admin } from './routes/admin.js';
import { affiliates } from './routes/affiliates.js';
import { coverLetterRoutes } from './routes/cover-letter.js';
import { interviewPrepRoutes } from './routes/interview-prep.js';
import { linkedInOptimizerRoutes } from './routes/linkedin-optimizer.js';
import { contentCalendarRoutes } from './routes/content-calendar.js';
import { networkingOutreachRoutes } from './routes/networking-outreach.js';
import { jobTrackerRoutes } from './routes/job-tracker.js';
import { salaryNegotiationRoutes } from './routes/salary-negotiation.js';
import { executiveBioRoutes } from './routes/executive-bio.js';
import { caseStudyRoutes } from './routes/case-study.js';
import { thankYouNoteRoutes } from './routes/thank-you-note.js';
import { ninetyDayPlanRoutes } from './routes/ninety-day-plan.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { networkingContacts } from './routes/networking-contacts.js';
import { jobFinderRoutes } from './routes/job-finder.js';
import { linkedInContentRoutes } from './routes/linkedin-content.js';
import { linkedInEditorRoutes } from './routes/linkedin-editor.js';
import { applicationPipelineRoutes } from './routes/application-pipeline.js';
import { mockInterviewRoutes } from './routes/mock-interview.js';
import { negotiationSimulationRoutes } from './routes/negotiation-simulation.js';
import { interviewDebriefRoutes } from './routes/interview-debrief.js';
import { momentumRoutes } from './routes/momentum.js';
import { retirementBridgeRoutes } from './routes/retirement-bridge.js';
import { plannerHandoffRoutes } from './routes/planner-handoff.js';
import { b2bAdminRoutes } from './routes/b2b-admin.js';
import { jobSearchRoutes } from './routes/job-search.js';
import { watchlistRoutes } from './routes/watchlist.js';
import { contentPostsRoutes } from './routes/content-posts.js';
import { linkedInToolsRoutes } from './routes/linkedin-tools.js';
import { extensionRoutes } from './routes/extension.js';
import { coachRoutes } from './routes/coach.js';
import { platformContextRoutes } from './routes/platform-context.js';
import { products } from './routes/products.js';
import { productTelemetryRoutes } from './routes/product-telemetry.js';
import { ni } from './routes/ni.js';
import { waitlistRoutes } from './routes/waitlist.js';
import { discoveryRoutes } from './routes/discovery.js';
import { profileSetupRoutes } from './routes/profile-setup.js';
import { supabaseAdmin } from './lib/supabase.js';
import { releaseAllLocks } from './lib/session-lock.js';
import { getRateLimitStats } from './middleware/rate-limit.js';
import { getAuthCacheStats } from './middleware/auth.js';
import { getRequestMetrics, recordRequestMetric } from './lib/request-metrics.js';
import { getPipelineMetrics } from './lib/pipeline-metrics.js';
import logger from './lib/logger.js';
import { initSentry, captureErrorWithContext, flushSentry } from './lib/sentry.js';
import { validateRegisteredAgents } from './agents/runtime/agent-registry.js';
import { FF_V3_PRIMARY } from './lib/feature-flags.js';
import { createRedisBusIfConfigured, type RedisBus } from './agents/runtime/redis-bus.js';
import { setAgentBus } from './agents/runtime/bus-factory.js';
import { startHotReload, stopHotReload } from './agents/runtime/hot-reload.js';

const app = new Hono();
let shuttingDown = false;
let redisBus: RedisBus | null = null;

// Initialize Sentry error tracking (no-op if SENTRY_DSN not set)
initSentry();

const isProduction = process.env.NODE_ENV === 'production';
const maxHeapUsedMb = (() => {
  const parsed = Number.parseInt(process.env.MAX_HEAP_USED_MB ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
})();
const healthCheckCacheTtlMs = (() => {
  const parsed = Number.parseInt(process.env.HEALTH_CHECK_CACHE_TTL_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5_000;
})();
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : isProduction
    ? [] // Block all CORS in production if not configured
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

function getHeapUsedMb() {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

function isHeapOverloaded() {
  if (maxHeapUsedMb <= 0) return false;
  return getHeapUsedMb() >= maxHeapUsedMb;
}

if (isProduction && !process.env.ALLOWED_ORIGINS) {
  logger.error('ALLOWED_ORIGINS not set in production — all cross-origin requests will be blocked');
}

// Build CSP once at startup — values are static for the lifetime of the process.
const cspConnectSrc = [
  "'self'",
  ...allowedOrigins,
  ...(process.env.SENTRY_DSN ? ['https://*.ingest.sentry.io'] : []),
].join(' ');

const cspHeader = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  `connect-src ${cspConnectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

app.use('*', requestIdMiddleware);

app.use('*', async (c, next) => {
  const startedAt = Date.now();
  let status = 500;
  try {
    const requestPath = c.req.path;
    const bypass = requestPath === '/health' || requestPath === '/ready' || requestPath === '/metrics';

    if (shuttingDown && !bypass) {
      status = 503;
      return c.json({ error: 'Server is restarting. Please retry shortly.' }, 503);
    }

    if (maxHeapUsedMb > 0 && !bypass) {
      const heapUsedMb = getHeapUsedMb();
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

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', cspHeader);
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const directProto = (() => {
    try {
      return new URL(c.req.url).protocol;
    } catch {
      return '';
    }
  })();
  const requestIsHttps = forwardedProto === 'https' || directProto === 'https:';
  if (isProduction && requestIsHttps) {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
});

app.use('*', cors({
  origin: allowedOrigins,
  credentials: true,
}));

let cachedHealthCheck: {
  checkedAt: number;
  dbOk: boolean;
  llmKeyPresent: boolean;
} | null = null;

async function getHealthSnapshot(now = Date.now()) {
  const configuredProvider = process.env.LLM_PROVIDER?.toLowerCase();
  const llmKeyPresentNow = Boolean(
    process.env.GROQ_API_KEY
    || process.env.ZAI_API_KEY
    || process.env.ANTHROPIC_API_KEY
    || process.env.DEEPSEEK_API_KEY
  );

  const cache = cachedHealthCheck;
  const canUseCache =
    cache
    && now - cache.checkedAt < healthCheckCacheTtlMs
    && cache.llmKeyPresent === llmKeyPresentNow;
  let dbOk = false;
  if (canUseCache && cache) {
    dbOk = cache.dbOk;
  } else {
    // Lightweight public health check — no config details exposed
    try {
      const { error } = await supabaseAdmin.from('coach_sessions').select('id').limit(1);
      dbOk = !error;
    } catch {
      // db down
    }
    cachedHealthCheck = {
      checkedAt: now,
      dbOk,
      llmKeyPresent: llmKeyPresentNow,
    };
  }

  return {
    dbOk,
    llmKeyPresent: llmKeyPresentNow,
    heapUsedMb: getHeapUsedMb(),
    heapOverloaded: isHeapOverloaded(),
    canUseCache: Boolean(canUseCache),
    checkedAt: cachedHealthCheck?.checkedAt ?? null,
  };
}

app.get('/health', async (c) => {
  c.header('Cache-Control', 'no-store');
  const health = await getHealthSnapshot();
  const status = shuttingDown
    ? 'draining'
    : (health.dbOk && health.llmKeyPresent && !health.heapOverloaded ? 'ok' : 'degraded');
  return c.json({
    status,
    shutting_down: shuttingDown,
    heap_overloaded: health.heapOverloaded,
    heap_used_mb: health.heapUsedMb,
    cached: health.canUseCache,
    checked_at: health.checkedAt ? new Date(health.checkedAt).toISOString() : null,
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (c) => {
  c.header('Cache-Control', 'no-store');
  const health = await getHealthSnapshot();
  const ready = !shuttingDown && health.dbOk && health.llmKeyPresent && !health.heapOverloaded;
  return c.json({
    ready,
    shutting_down: shuttingDown,
    db_ok: health.dbOk,
    llm_key_ok: health.llmKeyPresent,
    heap_overloaded: health.heapOverloaded,
    heap_used_mb: health.heapUsedMb,
    checked_at: health.checkedAt ? new Date(health.checkedAt).toISOString() : null,
    timestamp: new Date().toISOString(),
  }, ready ? 200 : 503);
});

const startTime = Date.now();

app.get('/metrics', (c) => {
  c.header('Cache-Control', 'no-store');
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
  // v2 pipeline runtime stats removed after Phase F cutover.
  const pipelineStats = { active_pipelines: 0, total_started: 0, total_completed: 0, total_failed: 0 } as const;
  const rateLimitStats = getRateLimitStats();
  const authCacheStats = getAuthCacheStats();
  const requestStats = getRequestMetrics();
  const pipelineBusinessStats = getPipelineMetrics();
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
    pipeline_business: pipelineBusinessStats,
    load_shedding: {
      max_heap_used_mb: maxHeapUsedMb,
      active: maxHeapUsedMb > 0,
      heap_used_mb_now: Math.round(memUsage.heapUsed / 1024 / 1024),
    },
    health_runtime: {
      cache_ttl_ms: healthCheckCacheTtlMs,
      cached_check_at: cachedHealthCheck ? new Date(cachedHealthCheck.checkedAt).toISOString() : null,
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
// v2 pipeline route removed in Phase F cutover. See docs/v3-rebuild/v2-archaeology.md
// to retrieve the v2 source if needed.
if (FF_V3_PRIMARY) {
  app.route('/api/v3-pipeline', v3Pipeline);
}
app.route('/api/workflow', workflow);
app.route('/api/billing', billing);
app.route('/api/admin', admin);
app.route('/api/affiliates', affiliates);
app.route('/api/cover-letter', coverLetterRoutes);
app.route('/api/interview-prep', interviewPrepRoutes);
app.route('/api/linkedin-optimizer', linkedInOptimizerRoutes);
app.route('/api/content-calendar', contentCalendarRoutes);
app.route('/api/networking-outreach', networkingOutreachRoutes);
app.route('/api/job-tracker', jobTrackerRoutes);
app.route('/api/salary-negotiation', salaryNegotiationRoutes);
app.route('/api/executive-bio', executiveBioRoutes);
app.route('/api/case-study', caseStudyRoutes);
app.route('/api/thank-you-note', thankYouNoteRoutes);
app.route('/api/ninety-day-plan', ninetyDayPlanRoutes);
app.route('/api/onboarding', onboardingRoutes);
app.route('/api/networking', networkingContacts);
app.route('/api/job-finder', jobFinderRoutes);
app.route('/api/linkedin-content', linkedInContentRoutes);
app.route('/api/linkedin-editor', linkedInEditorRoutes);
app.route('/api/applications', applicationPipelineRoutes);
app.route('/api/mock-interview', mockInterviewRoutes);
app.route('/api/negotiation-simulation', negotiationSimulationRoutes);
app.route('/api/interview-debriefs', interviewDebriefRoutes);
app.route('/api/momentum', momentumRoutes);
app.route('/api/retirement-bridge', retirementBridgeRoutes);
app.route('/api/planner-handoff', plannerHandoffRoutes);
app.route('/api/b2b', b2bAdminRoutes);
app.route('/api/job-search', jobSearchRoutes);
app.route('/api/watchlist', watchlistRoutes);
app.route('/api/content-posts', contentPostsRoutes);
app.route('/api/linkedin-tools', linkedInToolsRoutes);
app.route('/api/extension', extensionRoutes);
app.route('/api/coach', coachRoutes);
app.route('/api/platform-context', platformContextRoutes);
app.route('/api/products', products);
app.route('/api/product-telemetry', productTelemetryRoutes);
app.route('/api/ni', ni);
app.route('/api/waitlist', waitlistRoutes);
app.route('/api/discovery', discoveryRoutes);
app.route('/api/profile-setup', profileSetupRoutes);

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

app.onError((err, c) => {
  const requestId = c.get('requestId');
  captureErrorWithContext(err, {
    severity: 'P0',
    category: 'unhandled_request_error',
    extra: { path: c.req.path, method: c.req.method, requestId },
  });
  logger.error({ err, requestId }, 'Unhandled error');
  return c.json({ error: 'Internal server error', request_id: requestId }, 500);
});

let server: ReturnType<typeof serve> | null = null;

function shutdown(signal: string) {
  if (shuttingDown) return;
  if (!server) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  stopHotReload();

  const flushTasks = Promise.allSettled([
    releaseAllLocks(),
    Promise.resolve(0), // TODO: drain active v2 pipeline sessions before exit (ticket: INFRA-drain-v2)
    flushSentry(2000),
    redisBus ? redisBus.disconnect() : Promise.resolve(),
  ]).then((_results) => {
    logger.info('Completed shutdown flush tasks');
  }).catch((err: unknown) => {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Shutdown flush tasks failed');
  });

  // Close HTTP server (stop accepting new connections)
  server.close(() => {
    // Give shutdown flush tasks a short budget before exiting.
    void Promise.race([
      flushTasks,
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]).finally(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    logger.warn('Forcing exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

const port = parseInt(process.env.PORT ?? '3001');
const host = process.env.HOST ?? '0.0.0.0';

export function startServer() {
  if (server) return server;

  logger.info({ port, host }, 'Resume Agent server starting');

  // Run startup registry validation — warns about tools missing model_tier.
  // All agents register on module load (via their route imports above), so the
  // registry is fully populated by the time startServer() is called.
  const { valid: validToolCount, warnings: registryWarnings } = validateRegisteredAgents();
  logger.info({ valid_tool_count: validToolCount }, 'Agent registry validation complete');
  for (const w of registryWarnings) {
    logger.warn(w);
  }

  startHotReload();

  server = serve({ fetch: app.fetch, port, hostname: host });
  logger.info({ port, host }, `Server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    captureErrorWithContext(reason, { severity: 'P1', category: 'unhandled_rejection' });
    logger.error({ reason }, 'Unhandled promise rejection');
    shutdown('UNHANDLED_REJECTION');
  });
  process.on('uncaughtException', (err) => {
    captureErrorWithContext(err, { severity: 'P0', category: 'uncaught_exception' });
    logger.error({ err }, 'Uncaught exception');
    shutdown('UNCAUGHT_EXCEPTION');
  });

  return server;
}

function isMainModule(): boolean {
  const current = fileURLToPath(import.meta.url);
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(current);
}

if (isMainModule()) {
  createRedisBusIfConfigured().then((bus) => {
    if (bus) {
      redisBus = bus;
      setAgentBus(bus);
      logger.info('RedisBus active — agent messages routed via Redis');
    }
    startServer();
  }).catch((err: unknown) => {
    logger.error({ err }, 'Redis bus init failed — falling back to in-memory bus');
    startServer();
  });
}

export { app };
