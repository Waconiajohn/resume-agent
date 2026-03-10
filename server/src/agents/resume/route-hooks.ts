/**
 * Resume Route Hooks
 *
 * Implements the ProductRouteConfig lifecycle hooks for the resume pipeline:
 * - resumeBeforeStart  → onBeforeStart
 * - resumeTransformInput → transformInput
 * - resumeOnRespond    → onRespond
 *
 * Also exports:
 * - registerRunningPipeline / unregisterRunningPipeline — called by the factory wiring layer
 * - getPipelineRouteStats — operational metrics endpoint helper
 * - PIPELINE_STAGES — type-safe list of known resume pipeline stages
 * - Workflow persistence helpers shared with the event middleware (Story 4)
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Context } from 'hono';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getEmotionalBaseline } from '../../lib/emotional-baseline.js';
import { getUserContext } from '../../lib/platform-context.js';
import { parsePositiveInt } from '../../lib/http-body-guard.js';
import { sseConnections } from '../../routes/sessions.js';
import { STALE_PIPELINE_MS } from '../../routes/product-route-factory.js';
import type { DbPipelineState } from '../../routes/product-route-factory.js';
import type { PipelineStage, MasterResumeData } from '../types.js';

// ─── Re-export DbPipelineState for callers that prefer this import path ──────

export type { DbPipelineState };

// ─── Pipeline stage registry ──────────────────────────────────────────

export const PIPELINE_STAGES: PipelineStage[] = [
  'intake', 'research', 'positioning', 'gap_analysis', 'architect',
  'architect_review', 'section_writing', 'section_review', 'quality_review', 'revision', 'complete',
];

// ─── Capacity / in-process tracking constants ────────────────────────

const IN_PROCESS_PIPELINE_TTL_MS = 20 * 60 * 1000;
export const MAX_IN_PROCESS_PIPELINES = parsePositiveInt(process.env.MAX_IN_PROCESS_PIPELINES, 5000);
export const CONFIGURED_MAX_RUNNING_PIPELINES_GLOBAL = parsePositiveInt(process.env.MAX_RUNNING_PIPELINES_GLOBAL, 1500);
export const CONFIGURED_MAX_RUNNING_PIPELINES_PER_USER = parsePositiveInt(process.env.MAX_RUNNING_PIPELINES_PER_USER, 3);

const MAX_RUNNING_PIPELINES_GLOBAL = CONFIGURED_MAX_RUNNING_PIPELINES_GLOBAL;
const MAX_RUNNING_PIPELINES_PER_USER = Math.min(
  CONFIGURED_MAX_RUNNING_PIPELINES_PER_USER,
  MAX_RUNNING_PIPELINES_GLOBAL,
);

if (CONFIGURED_MAX_RUNNING_PIPELINES_PER_USER > MAX_RUNNING_PIPELINES_GLOBAL) {
  logger.warn({
    configured_per_user: CONFIGURED_MAX_RUNNING_PIPELINES_PER_USER,
    max_global: MAX_RUNNING_PIPELINES_GLOBAL,
    effective_per_user: MAX_RUNNING_PIPELINES_PER_USER,
  }, 'Clamped MAX_RUNNING_PIPELINES_PER_USER to MAX_RUNNING_PIPELINES_GLOBAL');
}
if (MAX_IN_PROCESS_PIPELINES < MAX_RUNNING_PIPELINES_GLOBAL) {
  logger.warn({
    max_in_process_local: MAX_IN_PROCESS_PIPELINES,
    max_running_global: MAX_RUNNING_PIPELINES_GLOBAL,
  }, 'MAX_IN_PROCESS_PIPELINES is lower than global pipeline cap; local guard will trigger first');
}

// DB-backed global pipeline limit via session_locks table
const MAX_GLOBAL_PIPELINES = (() => {
  const parsed = parseInt(process.env.MAX_GLOBAL_PIPELINES ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
})();

export const STALE_RECOVERY_COOLDOWN_MS = parsePositiveInt(process.env.STALE_RECOVERY_COOLDOWN_MS, 60_000);
export const STALE_RECOVERY_BATCH_SIZE = parsePositiveInt(process.env.STALE_RECOVERY_BATCH_SIZE, 200);

// ─── Module-level in-process pipeline tracking ───────────────────────

const runningPipelines = new Map<string, number>();

const runningPipelinesCleanupTimer = setInterval(() => {
  if (runningPipelines.size > 0) pruneStaleRunningPipelines();
}, 60_000);
runningPipelinesCleanupTimer.unref();

let lastStaleRecoveryAt = 0;
let staleRecoveryRuns = 0;
let staleRecoveredRows = 0;
let staleRecoveryHadMore = false;

// ─── Running pipeline registry (used by factory wiring layer) ─────────

export function registerRunningPipeline(sessionId: string): void {
  runningPipelines.set(sessionId, Date.now());
}

export function unregisterRunningPipeline(sessionId: string): void {
  runningPipelines.delete(sessionId);
}

// ─── Stale pipeline helpers ───────────────────────────────────────────

function pruneStaleRunningPipelines(now = Date.now()): void {
  for (const [sessionId, startedAt] of runningPipelines.entries()) {
    if (now - startedAt > IN_PROCESS_PIPELINE_TTL_MS) {
      runningPipelines.delete(sessionId);
      logger.warn({ session_id: sessionId }, 'Evicted stale in-process pipeline guard');
    }
  }
}

async function recoverGlobalStalePipelines(opts?: { now?: number; force?: boolean }): Promise<void> {
  const now = opts?.now ?? Date.now();
  if (!opts?.force && now - lastStaleRecoveryAt < STALE_RECOVERY_COOLDOWN_MS) return;
  lastStaleRecoveryAt = now;
  staleRecoveryRuns += 1;
  const staleBeforeIso = new Date(now - STALE_PIPELINE_MS).toISOString();
  try {
    const { data: staleRows, error: staleScanError } = await supabaseAdmin
      .from('coach_sessions')
      .select('id')
      .eq('pipeline_status', 'running')
      .lt('updated_at', staleBeforeIso)
      .order('updated_at', { ascending: true })
      .limit(STALE_RECOVERY_BATCH_SIZE);
    if (staleScanError) {
      logger.warn({ error: staleScanError.message }, 'Failed to scan stale running pipelines');
      return;
    }

    const staleIds = (staleRows ?? [])
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (staleIds.length <= 0) {
      staleRecoveredRows = 0;
      staleRecoveryHadMore = false;
      return;
    }

    const { error: recoverError } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        pipeline_status: 'error',
        pending_gate: null,
        pending_gate_data: null,
      })
      .in('id', staleIds)
      .eq('pipeline_status', 'running');
    if (recoverError) {
      logger.warn({ error: recoverError.message }, 'Failed to recover stale running pipelines');
      return;
    }

    staleRecoveredRows = staleIds.length;
    staleRecoveryHadMore = staleIds.length >= STALE_RECOVERY_BATCH_SIZE;
    logger.warn(
      { recovered: staleRecoveredRows, had_more: staleRecoveryHadMore },
      'Recovered stale running pipelines',
    );
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Stale running pipeline recovery failed');
  }
}

async function hasRunningPipelineCapacity(limit: number, userId?: string): Promise<{ reached: boolean; error?: string }> {
  let query = supabaseAdmin
    .from('coach_sessions')
    .select('id')
    .eq('pipeline_status', 'running')
    .order('updated_at', { ascending: false })
    .limit(limit + 1);
  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) {
    return { reached: false, error: error.message };
  }

  return { reached: (data?.length ?? 0) >= limit };
}

// ─── SSRF protection helpers ──────────────────────────────────────────

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true;          // 0.0.0.0/8
  if (a === 10) return true;         // 10.0.0.0/8
  if (a === 127) return true;        // loopback
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === '::' || normalized === '::1') return true; // unspecified / loopback
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.replace(/^::ffff:/, '');
    return isPrivateIPv4(mapped);
  }

  // Unique local addresses (fc00::/7)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-local addresses (fe80::/10)
  if (/^fe[89ab]/.test(normalized)) return true;
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPrivateIPv4(host);
  if (ipVersion === 6) return isPrivateIPv6(host);
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.trim().toLowerCase();
  if (isPrivateHost(host)) {
    throw new Error('This URL host is not allowed. Please paste the job description text directly.');
  }

  if (isIP(host) === 0) {
    let ips: Array<{ address: string }> = [];
    try {
      const resolved = await lookup(host, { all: true, verbatim: true });
      ips = Array.isArray(resolved) ? resolved : [resolved];
    } catch {
      throw new Error('Unable to resolve job URL host. Please paste the job description text directly.');
    }

    if (ips.length === 0) {
      throw new Error('Unable to resolve job URL host. Please paste the job description text directly.');
    }
    for (const record of ips) {
      if (isPrivateHost(record.address)) {
        throw new Error('This URL host is not allowed. Please paste the job description text directly.');
      }
    }
  }
}

// ─── JD URL resolution ────────────────────────────────────────────────

export const JOB_URL_PATTERN = /^https?:\/\/\S+$/i;
export const MAX_JOB_URL_REDIRECTS = 3;
export const MAX_JOB_FETCH_BYTES = 2_000_000; // 2MB safety cap

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function extractVisibleTextFromHtml(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withLineBreaks = noScripts.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|br|tr|td)>/gi, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withoutTags).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function readResponseTextWithByteLimit(res: Response, maxBytes: number): Promise<string> {
  const stream = res.body;
  if (!stream) return '';

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

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
      throw new Error('Job URL content is too large. Please paste the job description text directly.');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function resolveJobDescriptionInput(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!JOB_URL_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid job URL. Please paste full job description text or a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http/https job URLs are supported.');
  }
  let currentUrl = url;

  for (let redirects = 0; redirects <= MAX_JOB_URL_REDIRECTS; redirects += 1) {
    await assertPublicHost(currentUrl.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(currentUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Resume-Agent/1.0 (+job-description-fetch)',
          Accept: 'text/html, text/plain;q=0.9, */*;q=0.1',
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (redirects >= MAX_JOB_URL_REDIRECTS) {
          throw new Error('Job URL redirected too many times. Please paste JD text directly.');
        }
        const location = res.headers.get('location');
        if (!location) {
          throw new Error('Job URL redirect did not include a location. Please paste JD text directly.');
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new Error('Job URL redirect target is invalid. Please paste JD text directly.');
        }
        if (!['http:', 'https:'].includes(nextUrl.protocol)) {
          throw new Error('Job URL redirect uses an unsupported protocol.');
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch job URL (${res.status}). Please paste JD text instead.`);
      }
      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        const bytes = Number.parseInt(contentLength, 10);
        if (Number.isFinite(bytes) && bytes > MAX_JOB_FETCH_BYTES) {
          throw new Error('Job URL content is too large. Please paste the job description text directly.');
        }
      }
      const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
      const body = await readResponseTextWithByteLimit(res, MAX_JOB_FETCH_BYTES);
      const text = contentType.includes('text/plain') ? body.trim() : extractVisibleTextFromHtml(body);
      if (text.length < 200) {
        throw new Error('Could not extract enough job description text from the URL. Please paste JD text directly.');
      }
      return text.slice(0, 50_000);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Fetching job URL timed out. Please paste the job description text directly.');
      }
      throw err instanceof Error ? err : new Error('Unable to fetch job URL. Please paste JD text directly.');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Unable to fetch job URL. Please paste JD text directly.');
}

// ─── Workflow persistence helpers — imported from shared module ───────
import {
  persistWorkflowArtifactBestEffort,
  upsertWorkflowNodeStatusBestEffort,
  resetWorkflowNodesForNewRunBestEffort,
} from '../../lib/workflow-persistence.js';
export {
  persistWorkflowArtifactBestEffort,
  upsertWorkflowNodeStatusBestEffort,
  resetWorkflowNodesForNewRunBestEffort,
};

// ─── Question response persistence ───────────────────────────────────

function inferQuestionResponseStatus(response: unknown): 'answered' | 'skipped' | 'deferred' {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (r.status === 'deferred' || r.deferred === true) return 'deferred';
    if (r.skipped === true) return 'skipped';
  }
  return 'answered';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractQuestionnaireResponsesForPersistence(response: unknown): Array<{
  question_id: string;
  stage: string;
  status: 'answered' | 'skipped' | 'deferred';
  response: unknown;
  impact_tag?: string | null;
}> {
  const payload = asRecord(response);
  if (!payload) return [];
  const questionnaireId = typeof payload.questionnaire_id === 'string' ? payload.questionnaire_id.trim() : '';
  const stage = typeof payload.stage === 'string' && payload.stage.trim() ? payload.stage.trim() : 'unknown';
  const responses = Array.isArray(payload.responses) ? payload.responses : [];
  if (!questionnaireId || responses.length === 0) return [];

  const rows: Array<{
    question_id: string;
    stage: string;
    status: 'answered' | 'skipped' | 'deferred';
    response: unknown;
    impact_tag?: string | null;
  }> = [];

  for (const item of responses) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const rawQuestionId = typeof rec.question_id === 'string' ? rec.question_id.trim() : '';
    if (!rawQuestionId) continue;
    const impactTag = rec.impact_tag === 'high' || rec.impact_tag === 'medium' || rec.impact_tag === 'low'
      ? rec.impact_tag
      : null;
    rows.push({
      question_id: `${questionnaireId}:${rawQuestionId}`,
      stage,
      status: inferQuestionResponseStatus(rec),
      response: {
        selected_option_ids: Array.isArray(rec.selected_option_ids)
          ? rec.selected_option_ids.filter((v): v is string => typeof v === 'string').slice(0, 12)
          : [],
        ...(typeof rec.custom_text === 'string' ? { custom_text: rec.custom_text } : {}),
        skipped: rec.skipped === true,
        ...(impactTag ? { impact_tag: impactTag } : {}),
        ...(typeof rec.payoff_hint === 'string' ? { payoff_hint: rec.payoff_hint.slice(0, 240) } : {}),
        ...(Array.isArray(rec.topic_keys)
          ? {
              topic_keys: rec.topic_keys
                .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                .map((v) => v.trim().toLowerCase())
                .slice(0, 8),
            }
          : {}),
        ...(typeof rec.benchmark_edit_version === 'number'
          ? { benchmark_edit_version: rec.benchmark_edit_version }
          : (rec.benchmark_edit_version === null ? { benchmark_edit_version: null } : {})),
      },
      impact_tag: impactTag,
    });
  }

  return rows;
}

export async function persistQuestionResponseBestEffort(
  sessionId: string,
  questionId: string,
  stage: string,
  response: unknown,
): Promise<void> {
  const status = inferQuestionResponseStatus(response);
  const payload = {
    session_id: sessionId,
    question_id: questionId,
    stage,
    status,
    response,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from('session_question_responses')
    .upsert(payload, { onConflict: 'session_id,question_id' });
  if (error) {
    logger.warn(
      { session_id: sessionId, question_id: questionId, error: error.message },
      'Failed to persist question response',
    );
  }

  const nestedQuestionnaireRows = extractQuestionnaireResponsesForPersistence(response).map((row) => ({
    session_id: sessionId,
    question_id: row.question_id,
    stage: row.stage,
    status: row.status,
    response: row.response,
    impact_tag: row.impact_tag ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (nestedQuestionnaireRows.length > 0) {
    const { error: nestedError } = await supabaseAdmin
      .from('session_question_responses')
      .upsert(nestedQuestionnaireRows, { onConflict: 'session_id,question_id' });
    if (nestedError) {
      logger.warn(
        { session_id: sessionId, question_id: questionId, error: nestedError.message },
        'Failed to persist questionnaire response analytics rows',
      );
    }
  }
}

// ─── onBeforeStart hook ───────────────────────────────────────────────

/**
 * Pre-pipeline validation for the resume product.
 *
 * Sequence:
 * 1. JD URL resolution — resolves job_description field from URL if needed; returns 400 on failure
 * 2. Global stale pipeline recovery — periodic scan + reset of stuck 'running' sessions
 * 3. In-process dedup guard — rejects if same session already tracked locally
 * 4. Per-session stale recovery — resets stale-running session before restart
 * 5. Per-user pipeline capacity check — 429 if user has too many running
 * 6. Global pipeline capacity check (DB coach_sessions) — 503 if platform is over limit
 * 7. Global pipeline capacity check (session_locks table) — 503 if lock count exceeded
 * 8. Claim pipeline slot via RPC — atomic 409 guard
 * 9. Workflow artifact initialization — fire-and-forget for the new run
 *
 * Returns a Response to short-circuit on any error. Returns void to proceed.
 */
export async function resumeBeforeStart(
  input: Record<string, unknown>,
  c: Context,
  session: Record<string, unknown>,
): Promise<Response | void> {
  const sessionId = input.session_id as string;
  const userId = ((c.get('user') as unknown) as Record<string, unknown>).id as string;

  // 1. JD URL resolution
  const rawJobDescription = typeof input.job_description === 'string' ? input.job_description : '';
  try {
    const resolved = await resolveJobDescriptionInput(rawJobDescription);
    // Mutate input so transformInput and buildProductConfig see the resolved text
    input.job_description = resolved;
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid job description input' }, 400);
  }

  // 2. Global stale pipeline recovery (rate-limited by STALE_RECOVERY_COOLDOWN_MS)
  await recoverGlobalStalePipelines();

  // 3. In-process dedup guard
  const inProcessStartedAt = runningPipelines.get(sessionId);
  if (typeof inProcessStartedAt === 'number') {
    const staleInProcess = Date.now() - inProcessStartedAt > IN_PROCESS_PIPELINE_TTL_MS;
    if (!staleInProcess) {
      return c.json({ error: 'Pipeline already running for this session' }, 409);
    }
    runningPipelines.delete(sessionId);
    logger.warn({ session_id: sessionId }, 'Cleared stale in-process pipeline guard before restart');
  }

  pruneStaleRunningPipelines();
  if (!runningPipelines.has(sessionId) && runningPipelines.size >= MAX_IN_PROCESS_PIPELINES) {
    logger.error({ active_local_pipelines: runningPipelines.size }, 'In-process pipeline guard reached capacity');
    return c.json({ error: 'Server is at capacity. Please retry shortly.' }, 503);
  }

  // 4. Per-session stale recovery
  if (session.pipeline_status === 'running') {
    const updatedAtMs = Date.parse(session.updated_at as string ?? '');
    const isStale = Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS);
    if (!isStale) {
      return c.json({ error: 'Pipeline already running for this session' }, 409);
    }

    logger.warn({ session_id: sessionId }, 'Recovering stale running pipeline before restart');
    const { error: recoverError } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        pipeline_status: 'error',
        pending_gate: null,
        pending_gate_data: null,
      })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('pipeline_status', 'running');

    if (recoverError) {
      logger.error({ session_id: sessionId, error: recoverError.message }, 'Failed to recover stale pipeline state');
      return c.json({ error: 'Failed to recover stale pipeline state' }, 500);
    }

    // Update the session record so the factory's stale snapshot doesn't false-409
    session.pipeline_status = 'error';
  }

  // 5. Per-user pipeline capacity check
  const userCapacity = await hasRunningPipelineCapacity(MAX_RUNNING_PIPELINES_PER_USER, userId);
  if (userCapacity.error) {
    logger.error({ user_id: userId, error: userCapacity.error }, 'Failed to read user running pipeline count');
    return c.json({ error: 'Failed to verify pipeline capacity' }, 503);
  }
  if (userCapacity.reached) {
    return c.json({
      error: 'Too many active pipelines. Please wait for one to finish before starting another.',
      code: 'PIPELINE_CAPACITY',
    }, 429);
  }

  // 6. Global pipeline capacity check via coach_sessions
  let globalCapacity = await hasRunningPipelineCapacity(MAX_RUNNING_PIPELINES_GLOBAL);
  if (globalCapacity.error) {
    logger.error({ error: globalCapacity.error }, 'Failed to read global running pipeline count');
    return c.json({ error: 'Failed to verify global pipeline capacity' }, 503);
  }
  if (globalCapacity.reached) {
    await recoverGlobalStalePipelines({ force: true });
    globalCapacity = await hasRunningPipelineCapacity(MAX_RUNNING_PIPELINES_GLOBAL);
  }
  if (globalCapacity.error) {
    logger.error({ error: globalCapacity.error }, 'Failed to read global running pipeline count after stale recovery');
    return c.json({ error: 'Failed to verify global pipeline capacity' }, 503);
  }
  if (globalCapacity.reached) {
    return c.json({
      error: 'Service is at pipeline capacity. Please retry shortly.',
      code: 'GLOBAL_PIPELINE_CAPACITY',
    }, 503);
  }

  // 7. Cross-instance capacity check via session_locks table
  try {
    const { count, error: countError } = await supabaseAdmin
      .from('session_locks')
      .select('*', { count: 'exact', head: true })
      .gt('locked_at', new Date(Date.now() - IN_PROCESS_PIPELINE_TTL_MS).toISOString());

    if (!countError && typeof count === 'number' && count >= MAX_GLOBAL_PIPELINES) {
      return c.json({
        error: 'Server is at capacity. Please try again in a few minutes.',
        code: 'CAPACITY_LIMIT',
      }, 503);
    }
  } catch (err) {
    // Fail open — do not block pipelines if the DB capacity check itself fails
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Global pipeline limit check failed — allowing pipeline',
    );
  }

  // 8. Atomically claim the pipeline slot
  const { data: claimResult, error: claimError } = await supabaseAdmin
    .rpc('claim_pipeline_slot', {
      p_session_id: sessionId,
      p_user_id: userId,
    });

  if (claimError) {
    logger.error(
      {
        session_id: sessionId,
        error: claimError.message,
        code: claimError.code,
        details: claimError.details,
        hint: claimError.hint,
      },
      'Failed to claim pipeline slot',
    );
    return c.json({ error: 'Failed to start pipeline' }, 500);
  }
  if (!claimResult) {
    return c.json({ error: 'Pipeline already running or completed for this session' }, 409);
  }

  // 9. Workflow artifact initialization (fire-and-forget)
  const workflowMode = typeof input.workflow_mode === 'string' ? input.workflow_mode : 'balanced';
  const minimumEvidenceTarget = typeof input.minimum_evidence_target === 'number' ? input.minimum_evidence_target : null;

  resetWorkflowNodesForNewRunBestEffort(sessionId);

  persistWorkflowArtifactBestEffort(sessionId, 'overview', 'draft_readiness', {
    type: 'draft_readiness_update',
    stage: 'intake',
    workflow_mode: workflowMode,
    evidence_count: 0,
    minimum_evidence_target: minimumEvidenceTarget,
    coverage_score: 0,
    coverage_threshold: null,
    ready: false,
    note: 'A new run has started. Draft readiness will update after gap analysis.',
    reset_at: new Date().toISOString(),
  }, 'system');

  persistWorkflowArtifactBestEffort(sessionId, 'overview', 'workflow_replan_status', {
    type: 'workflow_replan_cleared',
    cleared_at: new Date().toISOString(),
    reason: 'new_pipeline_run_started',
  }, 'system');

  persistWorkflowArtifactBestEffort(sessionId, 'overview', 'pipeline_start_request', {
    session_id: sessionId,
    raw_resume_text: input.raw_resume_text,
    job_description_input: rawJobDescription,
    job_description_resolved: input.job_description,
    company_name: input.company_name,
    workflow_mode: workflowMode,
    minimum_evidence_target: minimumEvidenceTarget,
    resume_priority: input.resume_priority ?? null,
    seniority_delta: input.seniority_delta ?? null,
    requested_at: new Date().toISOString(),
  }, 'system');

  persistWorkflowArtifactBestEffort(sessionId, 'overview', 'workflow_preferences', {
    workflow_mode: workflowMode,
    minimum_evidence_target: minimumEvidenceTarget,
    source: 'pipeline_start',
    updated_at: new Date().toISOString(),
  }, 'system');

  const pipelineRunStartedAt = new Date().toISOString();
  persistWorkflowArtifactBestEffort(sessionId, 'overview', 'pipeline_runtime_metrics', {
    run_started_at: pipelineRunStartedAt,
    first_progress_at: null,
    first_progress_event_type: null,
    first_progress_delay_ms: null,
    first_action_ready_at: null,
    first_action_ready_event_type: null,
    first_action_ready_delay_ms: null,
    latest_event_at: pipelineRunStartedAt,
    latest_event_type: 'pipeline_start',
    stage_durations_ms: {},
  }, 'system');

  // Persist run-started-at in input so the event middleware can compute delay metrics
  input._pipeline_run_started_at = pipelineRunStartedAt;
}

// ─── transformInput hook ──────────────────────────────────────────────

/**
 * Input enrichment for the resume product.
 *
 * Loads the master resume from the database when the session has one linked
 * and adds it to the input record so buildProductConfig can pass it to the agents.
 */
export async function resumeTransformInput(
  input: Record<string, unknown>,
  session: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const enriched = { ...input };

  const masterResumeId = typeof session.master_resume_id === 'string' && session.master_resume_id
    ? session.master_resume_id
    : undefined;

  if (!masterResumeId) {
    return enriched;
  }

  enriched.master_resume_id = masterResumeId;

  try {
    const { data: mrData, error: mrError } = await supabaseAdmin
      .from('master_resumes')
      .select('id, summary, experience, skills, education, certifications, evidence_items, contact_info, raw_text, version')
      .eq('id', masterResumeId)
      .single();

    if (mrError) {
      logger.warn(
        { error: mrError.message, code: mrError.code, master_resume_id: masterResumeId },
        'Failed to load master resume — continuing without it',
      );
      return enriched;
    }

    if (mrData) {
      const raw = mrData as unknown as MasterResumeData;
      const masterResume: MasterResumeData = {
        ...raw,
        evidence_items: Array.isArray(raw.evidence_items) ? raw.evidence_items : [],
      };
      enriched.master_resume = masterResume;
      logger.info(
        { master_resume_id: masterResumeId, version: masterResume.version },
        'Master resume loaded for pipeline',
      );
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), master_resume_id: masterResumeId },
      'Failed to load master resume — continuing without it',
    );
  }

  // Load emotional baseline and platform context for personalization
  const userId = typeof session.user_id === 'string' ? session.user_id : undefined;
  if (userId) {
    try {
      const baseline = await getEmotionalBaseline(userId);
      if (baseline) {
        enriched.emotional_baseline = baseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Resume: failed to load emotional baseline (continuing without it)',
      );
    }

    try {
      const [positioningCtx, clientProfileCtx, emotionalBaselineCtx] = await Promise.all([
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'client_profile'),
        getUserContext(userId, 'emotional_baseline'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (positioningCtx.length > 0) {
        platformContext.positioning_strategy = positioningCtx[0].content;
      }
      if (clientProfileCtx.length > 0) {
        platformContext.client_profile = clientProfileCtx[0].content;
      }
      if (emotionalBaselineCtx.length > 0) {
        platformContext.emotional_baseline = emotionalBaselineCtx[0].content;
      }

      if (Object.keys(platformContext).length > 0) {
        enriched.platform_context = platformContext;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Resume: failed to load platform context (continuing without it)',
      );
    }
  }

  return enriched;
}

// ─── onRespond hook ───────────────────────────────────────────────────

/**
 * Post-gate-response processing for the resume product.
 *
 * Persists the question/gate response for analytics. The stale pipeline
 * detection and architect_review normalization are handled in the route
 * handler itself before this hook is called.
 */
export async function resumeOnRespond(
  sessionId: string,
  gate: string,
  response: unknown,
  _dbState: DbPipelineState,
): Promise<void> {
  const stage = typeof _dbState.pipeline_stage === 'string' && _dbState.pipeline_stage
    ? _dbState.pipeline_stage
    : 'unknown';
  await persistQuestionResponseBestEffort(sessionId, gate, stage, response);
}

// ─── Stale pipeline SSE notification (used by respond wiring layer) ──

/**
 * Notifies connected SSE clients that a pipeline has gone stale and updates
 * the DB to error status. Called from the pipeline respond wiring layer when
 * updated_at is too old.
 */
export async function handleStalePipelineOnRespond(
  sessionId: string,
  dbState: DbPipelineState,
): Promise<void> {
  runningPipelines.delete(sessionId);
  await supabaseAdmin
    .from('coach_sessions')
    .update({
      pipeline_status: 'error',
      pending_gate: null,
      pending_gate_data: null,
    })
    .eq('id', sessionId)
    .eq('pipeline_status', 'running');

  const staleStage = PIPELINE_STAGES.includes(dbState.pipeline_stage as PipelineStage)
    ? (dbState.pipeline_stage as PipelineStage)
    : 'intake';

  const emitters = sseConnections.get(sessionId);
  if (emitters) {
    for (const emitter of emitters) {
      try {
        emitter({
          type: 'pipeline_error',
          stage: staleStage,
          error: 'Pipeline state became stale after a server restart. Please restart the pipeline.',
        });
      } catch {
        // Connection may already be closed.
      }
    }
  }
}

// ─── Operational metrics ──────────────────────────────────────────────

export function getPipelineRouteStats(): Record<string, unknown> {
  return {
    running_pipelines_local: runningPipelines.size,
    max_running_pipelines_local: MAX_IN_PROCESS_PIPELINES,
    max_running_pipelines_per_user: MAX_RUNNING_PIPELINES_PER_USER,
    max_running_pipelines_global: MAX_RUNNING_PIPELINES_GLOBAL,
    stale_recovery_runs: staleRecoveryRuns,
    stale_recovery_cooldown_ms: STALE_RECOVERY_COOLDOWN_MS,
    stale_recovery_batch_size: STALE_RECOVERY_BATCH_SIZE,
    stale_recovery_last_at: lastStaleRecoveryAt ? new Date(lastStaleRecoveryAt).toISOString() : null,
    stale_recovery_last_count: staleRecoveredRows,
    stale_recovery_last_had_more: staleRecoveryHadMore,
    max_global_pipelines: MAX_GLOBAL_PIPELINES,
    stale_pipeline_ms: STALE_PIPELINE_MS,
    in_process_pipeline_ttl_ms: IN_PROCESS_PIPELINE_TTL_MS,
  };
}
