/**
 * Chrome Extension API Routes — /api/extension/*
 *
 * Feature-flagged via FF_EXTENSION.
 * Provides 8 endpoints consumed exclusively by the CareerIQ browser extension:
 *   POST /resume-lookup          — Look up a tailored resume for the current job URL
 *   POST /job-discover           — Record a newly discovered job listing
 *   POST /apply-status           — Mark a listing as applied
 *   GET  /auth-verify            — Lightweight token verification
 *   POST /infer-field            — AI-assisted form field mapping
 *   POST /token-exchange/create  — Create a one-time exchange code (authenticated)
 *   GET  /token-exchange         — Retrieve token by exchange code (no auth required)
 *   GET  /resume-pdf/:sessionId  — Fetch completed resume data for a session
 */

import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_EXTENSION } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { normalizeJobUrl, detectPlatform } from '../lib/url-normalizer.js';
import { llm, MODEL_LIGHT, MAX_TOKENS } from '../lib/llm.js';
import logger from '../lib/logger.js';

const log = logger.child({ route: 'extension' });

export const extensionRoutes = new Hono();

// ─── Token exchange store ──────────────────────────────────────────────────────
// In-memory, short-lived (5 min), one-time-use exchange codes.
// The code itself is the bearer — no auth required to redeem.

interface TokenExchangeEntry {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
}

const MAX_EXCHANGE_STORE_SIZE = 1000;
const TOKEN_EXCHANGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const tokenExchangeStore = new Map<string, TokenExchangeEntry>();

const exchangeCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of tokenExchangeStore) {
    if (now > entry.expiresAt) tokenExchangeStore.delete(code);
  }
}, 60_000);
exchangeCleanupTimer.unref();

// ─── Feature flag guard ────────────────────────────────────────────────────────

extensionRoutes.use('/*', async (c, next) => {
  if (!FF_EXTENSION) return c.json({ error: 'Extension API not enabled' }, 404);
  await next();
});

// ─── GET /token-exchange — no auth (code IS the credential) ──────────────────
// Registered BEFORE the global auth middleware so it is not subject to it.

const tokenExchangeQuerySchema = z.object({
  code: z.string().min(1),
});

extensionRoutes.get(
  '/token-exchange',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const query = c.req.query();
    const parsed = tokenExchangeQuerySchema.safeParse(query);
    if (!parsed.success) {
      return c.json({ error: 'Missing required query parameter: code' }, 400);
    }

    const { code } = parsed.data;
    const entry = tokenExchangeStore.get(code);

    if (!entry || Date.now() > entry.expiresAt) {
      tokenExchangeStore.delete(code);
      return c.json({ error: 'Invalid or expired exchange code' }, 404);
    }

    // One-time use — delete immediately after retrieval.
    tokenExchangeStore.delete(code);

    return c.json({ token: entry.token, userId: entry.userId });
  },
);

// ─── Auth required on all remaining routes ────────────────────────────────────

extensionRoutes.use('/*', authMiddleware);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const resumeLookupSchema = z.object({
  job_url: z.string().url(),
});

const resumePdfParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

const jobDiscoverSchema = z.object({
  job_url: z.string().url(),
  raw_url: z.string().url(),
  page_title: z.string().optional(),
  platform: z.string(),
});

const applyStatusSchema = z.object({
  job_url: z.string().url(),
  platform: z.string().optional(),
});

const inferFieldSchema = z.object({
  field_name: z.string(),
  field_value: z.string().max(200),
  form_snapshot: z.array(
    z.object({
      index: z.number().int().optional(),
      label: z.string().optional(),
      name: z.string().optional(),
      placeholder: z.string().optional(),
      type: z.string().optional(),
    }),
  ).max(30),
  platform: z.string(),
});

// ─── POST /resume-lookup ──────────────────────────────────────────────────────

extensionRoutes.post(
  '/resume-lookup',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = resumeLookupSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const normalizedUrl = normalizeJobUrl(parsed.data.job_url);

    // ── Primary path: job_applications → coach_sessions → session_workflow_artifacts ──

    const { data: jobApp } = await supabaseAdmin
      .from('job_applications')
      .select('id, job_title, company_name')
      .eq('normalized_url', normalizedUrl)
      .eq('user_id', user.id)
      .maybeSingle();

    if (jobApp) {
      const { data: session } = await supabaseAdmin
        .from('coach_sessions')
        .select('id')
        .eq('job_application_id', jobApp.id)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        const { data: artifact } = await supabaseAdmin
          .from('session_workflow_artifacts')
          .select('payload')
          .eq('session_id', session.id)
          .eq('node_key', 'export')
          .eq('artifact_type', 'completion')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (artifact?.payload) {
          const payload = artifact.payload as Record<string, unknown>;
          const resume = (payload.resume ?? null) as unknown;
          if (resume) {
            return c.json({
              resume,
              status: 'ready',
              job_title: jobApp.job_title ?? null,
              company_name: jobApp.company_name ?? null,
            });
          }
        }
      }
    }

    // ── Fallback path: application_pipeline ──────────────────────────────────

    const { data: pipelineRow } = await supabaseAdmin
      .from('application_pipeline')
      .select('id, role_title, company_name, resume_version_id')
      .eq('normalized_url', normalizedUrl)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pipelineRow?.resume_version_id) {
      return c.json({
        resume: null,
        status: 'ready',
        job_title: pipelineRow.role_title ?? null,
        company_name: pipelineRow.company_name ?? null,
        resume_version_id: pipelineRow.resume_version_id,
      });
    }

    return c.json({ resume: null, status: 'not_found' });
  },
);

// ─── POST /job-discover ───────────────────────────────────────────────────────

extensionRoutes.post(
  '/job-discover',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = jobDiscoverSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const normalizedUrl = normalizeJobUrl(parsed.data.job_url);
    const platform = detectPlatform(parsed.data.job_url);

    const { data, error } = await supabaseAdmin
      .from('application_pipeline')
      .upsert(
        {
          user_id: user.id,
          role_title: parsed.data.page_title ?? null,
          url: normalizedUrl,
          normalized_url: normalizedUrl,
          source: 'extension',
          stage: 'saved',
          discovered_via: 'extension',
          platform,
        },
        { onConflict: 'user_id,normalized_url', ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();

    if (error) {
      log.error({ error: error.message, userId: user.id }, 'extension: job-discover upsert failed');
      return c.json({ error: 'Failed to record job' }, 500);
    }

    return c.json({ saved: true, data }, 200);
  },
);

// ─── POST /apply-status ───────────────────────────────────────────────────────

extensionRoutes.post(
  '/apply-status',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = applyStatusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const normalizedUrl = normalizeJobUrl(parsed.data.job_url);

    const { data, error } = await supabaseAdmin
      .from('application_pipeline')
      .update({ stage: 'applied', applied_via: 'extension' })
      .eq('normalized_url', normalizedUrl)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      log.error({ error: error.message, userId: user.id }, 'extension: apply-status update failed');
      return c.json({ error: 'Failed to update application status' }, 500);
    }

    if (!data) {
      return c.json({ updated: false, reason: 'no_matching_record' }, 200);
    }

    return c.json({ updated: true, data }, 200);
  },
);

// ─── GET /auth-verify ─────────────────────────────────────────────────────────

extensionRoutes.get(
  '/auth-verify',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');
    return c.json({ authenticated: true, user: { id: user.id, email: user.email } });
  },
);

// ─── POST /infer-field ────────────────────────────────────────────────────────

extensionRoutes.post(
  '/infer-field',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = inferFieldSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { field_name, field_value, form_snapshot, platform } = parsed.data;

    const snapshotText = form_snapshot
      .map((f, i) =>
        `[${i}] label="${f.label ?? ''}" name="${f.name ?? ''}" placeholder="${f.placeholder ?? ''}" type="${f.type ?? ''}"`,
      )
      .join('\n');

    const systemPrompt = `You are a form-field mapping assistant for the ${platform} job application platform.

Given a target field name and its value, identify which element in the form snapshot best corresponds to that field.

Respond with ONLY a JSON object in this exact format:
{"element_index": <number or null>}

Use null if no element matches.`;

    const userMessage = `Target field: "${field_name}"
Current value: "${field_value}"

Form elements:
${snapshotText}

Which element index should receive this value?`;

    try {
      const response = await llm.chat({
        model: MODEL_LIGHT,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 64,
      });

      let elementIndex: number | null = null;
      try {
        const jsonMatch = response.text.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { element_index?: number | null };
          elementIndex = typeof parsed.element_index === 'number' ? parsed.element_index : null;
        }
      } catch {
        // Malformed LLM response — return null
      }

      return c.json({ element_index: elementIndex });
    } catch (err) {
      log.error({ err, userId: user.id }, 'extension: infer-field LLM call failed');
      return c.json({ error: 'Field inference failed' }, 500);
    }
  },
);

// ─── POST /token-exchange/create — authenticated ──────────────────────────────
// Creates a one-time exchange code the extension can redeem for the user's
// access token. Auth middleware is already applied globally above.

extensionRoutes.post(
  '/token-exchange/create',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const user = c.get('user');

    if (tokenExchangeStore.size >= MAX_EXCHANGE_STORE_SIZE) {
      log.warn({ userId: user.id }, 'extension: token exchange store is full');
      return c.json({ error: 'Service temporarily unavailable. Please try again later.' }, 503);
    }

    const code = randomBytes(16).toString('hex');
    tokenExchangeStore.set(code, {
      token: user.accessToken,
      userId: user.id,
      email: user.email,
      expiresAt: Date.now() + TOKEN_EXCHANGE_TTL_MS,
    });

    log.info({ userId: user.id }, 'extension: token exchange code created');
    return c.json({ code });
  },
);

// ─── GET /resume-pdf/:sessionId ───────────────────────────────────────────────

extensionRoutes.get(
  '/resume-pdf/:sessionId',
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const user = c.get('user');

    const parsed = resumePdfParamsSchema.safeParse({ sessionId: c.req.param('sessionId') });
    if (!parsed.success) {
      return c.json({ error: 'Invalid session ID' }, 400);
    }

    const { sessionId } = parsed.data;

    // Verify the session belongs to the authenticated user
    const { data: session } = await supabaseAdmin
      .from('coach_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Look up the completed resume artifact
    const { data: artifact } = await supabaseAdmin
      .from('session_workflow_artifacts')
      .select('payload')
      .eq('session_id', sessionId)
      .eq('node_key', 'export')
      .eq('artifact_type', 'completion')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!artifact?.payload) {
      return c.json({ error: 'No completed resume found for this session' }, 404);
    }

    const payload = artifact.payload as Record<string, unknown>;
    const resume = payload.resume ?? null;

    if (!resume) {
      return c.json({ error: 'No completed resume found for this session' }, 404);
    }

    c.header('Content-Disposition', 'attachment; filename="resume.json"');
    return c.json(resume);
  },
);
