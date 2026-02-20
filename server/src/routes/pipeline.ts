import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections } from './sessions.js';
import { runPipeline } from '../agents/pipeline.js';
import type { PipelineSSEEvent, PipelineStage } from '../agents/types.js';
import logger, { createSessionLogger } from '../lib/logger.js';
import { sleep } from '../lib/sleep.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  raw_resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
});

const respondSchema = z.object({
  session_id: z.string().uuid(),
  gate: z.string().min(1).max(100).optional(),
  response: z.unknown(),
});

const pipeline = new Hono();
pipeline.use('*', authMiddleware);

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_PIPELINE_START_BODY_BYTES = parsePositiveInt(process.env.MAX_PIPELINE_START_BODY_BYTES, 220_000);
const MAX_PIPELINE_RESPOND_BODY_BYTES = parsePositiveInt(process.env.MAX_PIPELINE_RESPOND_BODY_BYTES, 120_000);
const MAX_SECTION_CONTEXT_EVIDENCE_ITEMS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_EVIDENCE_ITEMS, 20);
const MAX_SECTION_CONTEXT_KEYWORDS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_KEYWORDS, 40);
const MAX_SECTION_CONTEXT_GAPS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_GAPS, 40);
const MAX_SECTION_CONTEXT_ORDER_ITEMS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_ORDER_ITEMS, 40);
const MAX_SECTION_CONTEXT_TEXT_CHARS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_TEXT_CHARS, 700);
const MAX_SECTION_CONTEXT_BLUEPRINT_BYTES = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_BLUEPRINT_BYTES, 120_000);

function rejectOversizedJsonBody(c: Context, maxBytes: number): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) return null;
  const parsed = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed <= maxBytes) return null;
  return c.json({ error: `Request too large (max ${maxBytes} bytes)` }, 413);
}

function truncateText(value: string, maxChars = MAX_SECTION_CONTEXT_TEXT_CHARS): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function sanitizeBlueprintSlice(slice: Record<string, unknown>): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(slice);
    if (serialized.length <= MAX_SECTION_CONTEXT_BLUEPRINT_BYTES) return slice;
    return {
      truncated: true,
      reason: 'blueprint_slice_too_large',
      max_bytes: MAX_SECTION_CONTEXT_BLUEPRINT_BYTES,
      keys: Object.keys(slice).slice(0, 25),
    };
  } catch {
    return {
      truncated: true,
      reason: 'blueprint_slice_serialization_failed',
    };
  }
}

function sanitizeSectionContext(event: Extract<PipelineSSEEvent, { type: 'section_context' }>) {
  return {
    context_version: event.context_version,
    generated_at: event.generated_at,
    blueprint_slice: sanitizeBlueprintSlice(event.blueprint_slice),
    evidence: event.evidence.slice(0, MAX_SECTION_CONTEXT_EVIDENCE_ITEMS).map((e) => ({
      id: truncateText(e.id, 80),
      situation: truncateText(e.situation),
      action: truncateText(e.action),
      result: truncateText(e.result),
      metrics_defensible: e.metrics_defensible,
      user_validated: e.user_validated,
      mapped_requirements: e.mapped_requirements
        .slice(0, 8)
        .map((req) => truncateText(req, 180)),
      scope_metrics: Object.fromEntries(
        Object.entries(e.scope_metrics ?? {})
          .slice(0, 8)
          .map(([k, v]) => [truncateText(String(k), 40), truncateText(String(v), 120)]),
      ),
    })),
    keywords: event.keywords.slice(0, MAX_SECTION_CONTEXT_KEYWORDS).map((k) => ({
      keyword: truncateText(k.keyword, 80),
      target_density: k.target_density,
      current_count: k.current_count,
    })),
    gap_mappings: event.gap_mappings.slice(0, MAX_SECTION_CONTEXT_GAPS).map((g) => ({
      requirement: truncateText(g.requirement, 180),
      classification: g.classification,
    })),
    section_order: event.section_order.slice(0, MAX_SECTION_CONTEXT_ORDER_ITEMS).map((s) => truncateText(s, 60)),
    sections_approved: event.sections_approved.slice(0, MAX_SECTION_CONTEXT_ORDER_ITEMS).map((s) => truncateText(s, 60)),
  };
}

async function setPendingGate(sessionId: string, gate: string, data?: Record<string, unknown>) {
  // Preserve any queued early responses when opening a new gate.
  const { data: existing } = await supabaseAdmin
    .from('coach_sessions')
    .select('pending_gate_data')
    .eq('id', sessionId)
    .maybeSingle();
  const existingPayload = parsePendingGatePayload(existing?.pending_gate_data);
  const queue = getResponseQueue(existingPayload);
  const payload = withResponseQueue(data ?? {}, queue);

  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      pending_gate: gate,
      pending_gate_data: payload,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn({ session_id: sessionId, gate, error: error.message }, 'Failed to persist pending gate');
  }
}

async function clearPendingGate(sessionId: string, keepQueueFromPayload?: PendingGatePayload) {
  const queue = keepQueueFromPayload ? getResponseQueue(keepQueueFromPayload) : [];
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      pending_gate: null,
      pending_gate_data: queue.length > 0 ? { response_queue: queue } : null,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn({ session_id: sessionId, error: error.message }, 'Failed to clear pending gate');
  }
}

const PANEL_PERSIST_DEBOUNCE_MS = 250;
const MAX_QUEUED_PANEL_PERSISTS = parsePositiveInt(process.env.MAX_QUEUED_PANEL_PERSISTS, 5000);
const queuedPanelPersists = new Map<string, {
  panelType: string;
  panelData: unknown;
  timeout: ReturnType<typeof setTimeout>;
}>();

async function persistLastPanelState(sessionId: string, panelType: string, panelData: unknown) {
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      last_panel_type: panelType,
      last_panel_data: panelData,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn(
      { session_id: sessionId, panel_type: panelType, error: error.message },
      'Failed to persist last panel state',
    );
  }
}

function cancelQueuedPanelPersist(sessionId: string) {
  const queued = queuedPanelPersists.get(sessionId);
  if (!queued) return;
  clearTimeout(queued.timeout);
  queuedPanelPersists.delete(sessionId);
}

function queuePanelPersist(sessionId: string, panelType: string, panelData: unknown) {
  if (!queuedPanelPersists.has(sessionId) && queuedPanelPersists.size >= MAX_QUEUED_PANEL_PERSISTS) {
    const oldestSession = queuedPanelPersists.keys().next().value;
    if (oldestSession) {
      cancelQueuedPanelPersist(oldestSession);
      logger.warn(
        { evicted_session: oldestSession, queue_size: queuedPanelPersists.size },
        'Evicted queued panel persist entry due to capacity',
      );
    }
  }
  cancelQueuedPanelPersist(sessionId);
  const timeout = setTimeout(() => {
    queuedPanelPersists.delete(sessionId);
    void persistLastPanelState(sessionId, panelType, panelData);
  }, PANEL_PERSIST_DEBOUNCE_MS);
  timeout.unref?.();
  queuedPanelPersists.set(sessionId, { panelType, panelData, timeout });
}

async function flushQueuedPanelPersist(sessionId: string) {
  const queued = queuedPanelPersists.get(sessionId);
  if (!queued) return;
  clearTimeout(queued.timeout);
  queuedPanelPersists.delete(sessionId);
  await persistLastPanelState(sessionId, queued.panelType, queued.panelData);
}

const GATE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const GATE_POLL_BASE_MS = 250;
const GATE_POLL_MAX_MS = 2_000;
const STALE_PIPELINE_MS = 15 * 60 * 1000; // 15 minutes without DB state updates
const IN_PROCESS_PIPELINE_TTL_MS = 20 * 60 * 1000; // 20 minutes without process-local completion
const MAX_IN_PROCESS_PIPELINES = parsePositiveInt(process.env.MAX_IN_PROCESS_PIPELINES, 5000);
const CONFIGURED_MAX_RUNNING_PIPELINES_GLOBAL = parsePositiveInt(process.env.MAX_RUNNING_PIPELINES_GLOBAL, 1500);
const CONFIGURED_MAX_RUNNING_PIPELINES_PER_USER = parsePositiveInt(process.env.MAX_RUNNING_PIPELINES_PER_USER, 3);
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
const STALE_RECOVERY_COOLDOWN_MS = parsePositiveInt(process.env.STALE_RECOVERY_COOLDOWN_MS, 60_000);
const STALE_RECOVERY_BATCH_SIZE = parsePositiveInt(process.env.STALE_RECOVERY_BATCH_SIZE, 200);

// Track running pipelines to prevent double-start (in-process guard, complements DB check)
const runningPipelines = new Map<string, number>();

function pruneStaleRunningPipelines(now = Date.now()): void {
  for (const [sessionId, startedAt] of runningPipelines.entries()) {
    if (now - startedAt > IN_PROCESS_PIPELINE_TTL_MS) {
      runningPipelines.delete(sessionId);
      logger.warn({ session_id: sessionId }, 'Evicted stale in-process pipeline guard');
    }
  }
}

const runningPipelinesCleanupTimer = setInterval(() => {
  if (runningPipelines.size > 0) pruneStaleRunningPipelines();
}, 60_000);
runningPipelinesCleanupTimer.unref();

let lastStaleRecoveryAt = 0;
let staleRecoveryRuns = 0;
let staleRecoveredRows = 0;
let staleRecoveryHadMore = false;

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

export function getPipelineRouteStats() {
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
    queued_panel_persists: queuedPanelPersists.size,
    max_queued_panel_persists: MAX_QUEUED_PANEL_PERSISTS,
    max_pipeline_start_body_bytes: MAX_PIPELINE_START_BODY_BYTES,
    max_pipeline_respond_body_bytes: MAX_PIPELINE_RESPOND_BODY_BYTES,
    max_section_context_evidence_items: MAX_SECTION_CONTEXT_EVIDENCE_ITEMS,
    max_section_context_keywords: MAX_SECTION_CONTEXT_KEYWORDS,
    max_section_context_gaps: MAX_SECTION_CONTEXT_GAPS,
    max_section_context_order_items: MAX_SECTION_CONTEXT_ORDER_ITEMS,
    max_section_context_text_chars: MAX_SECTION_CONTEXT_TEXT_CHARS,
    max_section_context_blueprint_bytes: MAX_SECTION_CONTEXT_BLUEPRINT_BYTES,
  };
}

// Known pipeline stages for type-safe stale recovery
const PIPELINE_STAGES: PipelineStage[] = [
  'intake', 'positioning', 'research', 'gap_analysis', 'architect',
  'architect_review', 'section_writing', 'section_review', 'quality_review', 'revision', 'complete',
];

const JOB_URL_PATTERN = /^https?:\/\/\S+$/i;
const MAX_JOB_URL_REDIRECTS = 3;
const MAX_JOB_FETCH_BYTES = 2_000_000; // 2MB safety cap to avoid oversized pages

type PendingGatePayload = {
  created_at?: string;
  gate?: string;
  response?: unknown;
  response_gate?: string;
  responded_at?: string;
  response_queue?: Array<{
    gate: string;
    response: unknown;
    responded_at: string;
  }>;
  // Legacy single-buffer fields (kept for migration compatibility)
  buffered_gate?: string;
  buffered_response?: unknown;
  buffered_at?: string;
};

function parsePendingGatePayload(raw: unknown): PendingGatePayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as PendingGatePayload;
}

const MAX_BUFFERED_RESPONSES = 25;

function getResponseQueue(payload: PendingGatePayload): Array<{ gate: string; response: unknown; responded_at: string }> {
  const queue = Array.isArray(payload.response_queue)
    ? payload.response_queue.filter((item) =>
      item
      && typeof item === 'object'
      && typeof (item as { gate?: unknown }).gate === 'string'
      && 'response' in (item as Record<string, unknown>)
      && typeof (item as { responded_at?: unknown }).responded_at === 'string')
    : [];

  // Backward compatibility: fold old single buffered fields into the queue.
  if (payload.buffered_gate && 'buffered_response' in payload) {
    queue.push({
      gate: payload.buffered_gate,
      response: payload.buffered_response,
      responded_at: payload.buffered_at ?? new Date().toISOString(),
    });
  }

  return queue.slice(-MAX_BUFFERED_RESPONSES);
}

function withResponseQueue(payload: PendingGatePayload, queue: Array<{ gate: string; response: unknown; responded_at: string }>): PendingGatePayload {
  const normalized = {
    ...payload,
    response_queue: queue.slice(-MAX_BUFFERED_RESPONSES),
  };
  delete normalized.buffered_gate;
  delete normalized.buffered_response;
  delete normalized.buffered_at;
  return normalized;
}

function gatePollDelayMs(attempt: number): number {
  const backoff = Math.min(GATE_POLL_MAX_MS, Math.floor(GATE_POLL_BASE_MS * Math.pow(1.35, attempt)));
  const jitter = Math.floor(Math.random() * 120);
  return backoff + jitter;
}

async function getPipelineState(sessionId: string): Promise<{
  pipeline_status: string | null;
  pipeline_stage: string | null;
  pending_gate: string | null;
  pending_gate_data: unknown;
  updated_at: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('pipeline_status, pipeline_stage, pending_gate, pending_gate_data, updated_at')
    .eq('id', sessionId)
    .single();
  if (error) return null;
  return data;
}

async function waitForGateResponse<T>(sessionId: string, gate: string): Promise<T> {
  const startedAt = Date.now();
  let pollAttempt = 0;
  let lastPayload: PendingGatePayload = {};

  // First consume any buffered early response for this exact gate.
  const initial = await getPipelineState(sessionId);
  const initialPayload = parsePendingGatePayload(initial?.pending_gate_data);
  const initialQueue = getResponseQueue(initialPayload);
  let initialIdx = -1;
  for (let i = initialQueue.length - 1; i >= 0; i -= 1) {
    if (initialQueue[i].gate === gate) {
      initialIdx = i;
      break;
    }
  }
  if (initialIdx >= 0) {
    const [match] = initialQueue.splice(initialIdx, 1);
    const nextPayload = withResponseQueue(
      initialPayload,
      initialQueue.filter((item) => item.gate !== gate),
    );
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pending_gate_data: nextPayload })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, gate, error: error.message }, 'Failed to consume queued gate response');
    }
    return match.response as T;
  }

  await setPendingGate(sessionId, gate, {
    gate,
    created_at: new Date().toISOString(),
  });

  while (Date.now() - startedAt < GATE_TIMEOUT_MS) {
    const state = await getPipelineState(sessionId);
    if (!state) {
      await sleep(gatePollDelayMs(pollAttempt));
      pollAttempt += 1;
      continue;
    }

    if (state.pipeline_status !== 'running') {
      throw new Error(`Gate '${gate}' aborted because pipeline status is '${state.pipeline_status ?? 'unknown'}'`);
    }

    const payload = parsePendingGatePayload(state.pending_gate_data);
    lastPayload = payload;
    const responseGate = payload.response_gate ?? payload.gate ?? state.pending_gate ?? null;
    if (responseGate === gate && 'response' in payload) {
      await clearPendingGate(sessionId, payload);
      return payload.response as T;
    }

    await sleep(gatePollDelayMs(pollAttempt));
    pollAttempt += 1;
  }

  await clearPendingGate(sessionId, lastPayload);
  throw new Error(`Gate '${gate}' timed out after ${GATE_TIMEOUT_MS}ms`);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  return false;
}

function isPrivateIPv6(ip: string): boolean {
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

function isPrivateHost(hostname: string): boolean {
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

  // Validate DNS target addresses to reduce SSRF via public hostname -> private IP.
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

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractVisibleTextFromHtml(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withLineBreaks = noScripts.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|br|tr|td)>/gi, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withoutTags).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function resolveJobDescriptionInput(input: string): Promise<string> {
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
      const body = await res.text();
      if (body.length > MAX_JOB_FETCH_BYTES) {
        throw new Error('Job URL content is too large. Please paste the job description text directly.');
      }
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

// POST /pipeline/start
// Body: { session_id, raw_resume_text, job_description, company_name }
pipeline.post('/start', rateLimitMiddleware(5, 60_000), async (c) => {
  const oversized = rejectOversizedJsonBody(c, MAX_PIPELINE_START_BODY_BYTES);
  if (oversized) return oversized;

  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }
  const { session_id, raw_resume_text, job_description, company_name } = parsed.data;
  let resolvedJobDescription = job_description.trim();
  try {
    resolvedJobDescription = await resolveJobDescriptionInput(job_description);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid job description input' }, 400);
  }

  // Verify session belongs to user
  const { data: session, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, status, pipeline_status, updated_at')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single();

  if (error || !session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Prevent restarting completed sessions.
  if (session.status === 'completed') {
    return c.json({ error: 'Pipeline already completed for this session' }, 409);
  }
  if (session.pipeline_status === 'complete') {
    return c.json({ error: 'Pipeline already completed for this session' }, 409);
  }

  await recoverGlobalStalePipelines();

  // In-process dedup guard (complements DB-level claim below)
  const inProcessStartedAt = runningPipelines.get(session_id);
  if (typeof inProcessStartedAt === 'number') {
    const staleInProcess = Date.now() - inProcessStartedAt > IN_PROCESS_PIPELINE_TTL_MS;
    if (!staleInProcess) {
      return c.json({ error: 'Pipeline already running for this session' }, 409);
    }
    runningPipelines.delete(session_id);
    logger.warn({ session_id }, 'Cleared stale in-process pipeline guard before restart');
  }

  pruneStaleRunningPipelines();
  if (!runningPipelines.has(session_id) && runningPipelines.size >= MAX_IN_PROCESS_PIPELINES) {
    logger.error({ active_local_pipelines: runningPipelines.size }, 'In-process pipeline guard reached capacity');
    return c.json({ error: 'Server is at capacity. Please retry shortly.' }, 503);
  }

  if (session.pipeline_status === 'running') {
    const updatedAtMs = Date.parse(session.updated_at ?? '');
    const isStale = Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS);
    if (!isStale) {
      return c.json({ error: 'Pipeline already running for this session' }, 409);
    }

    logger.warn({ session_id }, 'Recovering stale running pipeline before restart');
    const { error: recoverError } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        pipeline_status: 'error',
        pending_gate: null,
        pending_gate_data: null,
      })
      .eq('id', session_id)
      .eq('user_id', user.id)
      .eq('pipeline_status', 'running');

    if (recoverError) {
      logger.error({ session_id, error: recoverError.message }, 'Failed to recover stale pipeline state');
      return c.json({ error: 'Failed to recover stale pipeline state' }, 500);
    }
  }

  const userCapacity = await hasRunningPipelineCapacity(MAX_RUNNING_PIPELINES_PER_USER, user.id);
  if (userCapacity.error) {
    logger.error({ user_id: user.id, error: userCapacity.error }, 'Failed to read user running pipeline count');
    return c.json({ error: 'Failed to verify pipeline capacity' }, 503);
  }
  if (userCapacity.reached) {
    return c.json({
      error: 'Too many active pipelines. Please wait for one to finish before starting another.',
      code: 'PIPELINE_CAPACITY',
    }, 429);
  }

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

  // Atomically claim this session's pipeline slot (cross-instance safe).
  const { data: claimedSession, error: claimError } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      pipeline_status: 'running',
      pipeline_stage: 'intake',
      pending_gate: null,
      pending_gate_data: null,
    })
    .eq('id', session_id)
    .eq('user_id', user.id)
    .or('pipeline_status.is.null,pipeline_status.eq.error')
    .select('id')
    .maybeSingle();

  if (claimError) {
    logger.error({ session_id, error: claimError.message }, 'Failed to claim pipeline slot');
    return c.json({ error: 'Failed to start pipeline' }, 500);
  }
  if (!claimedSession) {
    return c.json({ error: 'Pipeline already running or completed for this session' }, 409);
  }

  // Capture the most recently emitted section_context to merge into section_draft persistence.
  let latestSectionContext: {
    section: string;
    context: {
      context_version: number;
      generated_at: string;
      blueprint_slice: Record<string, unknown>;
      evidence: Array<{
        id: string;
        situation: string;
        action: string;
        result: string;
        metrics_defensible: boolean;
        user_validated: boolean;
        mapped_requirements: string[];
        scope_metrics: Record<string, string>;
      }>;
      keywords: Array<{
        keyword: string;
        target_density: number;
        current_count: number;
      }>;
      gap_mappings: Array<{
        requirement: string;
        classification: 'strong' | 'partial' | 'gap';
      }>;
      section_order: string[];
      sections_approved: string[];
    };
  } | null = null;

  // Create emit function that bridges to SSE
  const emit = (event: PipelineSSEEvent) => {
    if (event.type === 'stage_start') {
      void (async () => {
        try {
          const { error } = await supabaseAdmin
            .from('coach_sessions')
            .update({ pipeline_stage: event.stage })
            .eq('id', session_id);
          if (error) {
            logger.warn({ session_id, stage: event.stage, error: error.message }, 'Failed to persist pipeline stage');
          }
        } catch (err) {
          logger.warn(
            { session_id, stage: event.stage, error: err instanceof Error ? err.message : String(err) },
            'Failed to persist pipeline stage',
          );
        }
      })();
    }
    // Persist questionnaire events for session restore
    if (event.type === 'questionnaire') {
      queuePanelPersist(session_id, 'questionnaire', event);
    }
    // Persist right_panel_update events for session restore
    if (event.type === 'right_panel_update') {
      queuePanelPersist(session_id, event.panel_type, event.data);
    }
    // Capture section_context for merging into subsequent section_draft persistence
    if (event.type === 'section_context') {
      const sanitizedContext = sanitizeSectionContext(event);
      latestSectionContext = {
        section: event.section,
        context: sanitizedContext,
      };
    }
    // Persist section_draft as section_review panel for restore, merging any section_context
    if (event.type === 'section_draft') {
      const contextForSection =
        latestSectionContext?.section === event.section
          ? latestSectionContext.context
          : null;
      queuePanelPersist(session_id, 'section_review', {
        section: event.section,
        content: event.content,
        review_token: event.review_token,
        ...(contextForSection ? { context: contextForSection } : {}),
      });
    }
    // Persist blueprint_ready for restore
    if (event.type === 'blueprint_ready') {
      queuePanelPersist(session_id, 'blueprint_review', event.blueprint);
    }
    // Persist final completion payload with precedence over queued intermediate panels
    if (event.type === 'pipeline_complete') {
      cancelQueuedPanelPersist(session_id);
      void persistLastPanelState(session_id, 'completion', { resume: event.resume });
    }
    if (event.type === 'pipeline_error') {
      cancelQueuedPanelPersist(session_id);
    }
    const emitters = sseConnections.get(session_id);
    if (emitters) {
      for (const emitter of emitters) {
        try { emitter(event as never); } catch { /* closed */ }
      }
    }
  };

  // Create waitForUser function (DB-backed so /respond can land on any instance).
  const waitForUser = <T>(gate: string): Promise<T> => waitForGateResponse<T>(session_id, gate);

  // Start pipeline in background (fire-and-forget)
  const log = createSessionLogger(session_id);

  runningPipelines.set(session_id, Date.now());
  runPipeline({
    session_id,
    user_id: user.id,
    raw_resume_text,
    job_description: resolvedJobDescription,
    company_name,
    emit,
    waitForUser,
  }).then(async (state) => {
    log.info({ stage: state.current_stage, revision_count: state.revision_count }, 'Pipeline completed');
    await flushQueuedPanelPersist(session_id);
    await supabaseAdmin
      .from('coach_sessions')
      .update({ pipeline_status: 'complete', pending_gate: null, pending_gate_data: null })
      .eq('id', session_id);
  }).catch(async (error) => {
    log.error({ error: error instanceof Error ? error.message : error }, 'Pipeline failed');
    // Note: runPipeline already emits pipeline_error before re-throwing — do NOT emit a second one here.
    await flushQueuedPanelPersist(session_id);
    await supabaseAdmin
      .from('coach_sessions')
      .update({ pipeline_status: 'error', pending_gate: null, pending_gate_data: null })
      .eq('id', session_id);
  }).finally(() => {
    runningPipelines.delete(session_id);
    cancelQueuedPanelPersist(session_id);
    void clearPendingGate(session_id);
  });

  return c.json({ status: 'started', session_id });
});

// POST /pipeline/respond
// Body: { session_id, gate, response }
pipeline.post('/respond', rateLimitMiddleware(30, 60_000), async (c) => {
  const oversized = rejectOversizedJsonBody(c, MAX_PIPELINE_RESPOND_BODY_BYTES);
  if (oversized) return oversized;

  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }
  const { session_id, gate, response } = parsed.data;

  // Verify session belongs to user
  const { data: session, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single();

  if (error || !session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const dbState = await getPipelineState(session_id);
  if (!dbState) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (dbState.pipeline_status !== 'running') {
    return c.json({ error: 'Pipeline is not running for this session' }, 409);
  }
  const updatedAtMs = Date.parse(dbState.updated_at ?? '');
  const staleRunning = Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS);
  if (staleRunning) {
    runningPipelines.delete(session_id);
    await supabaseAdmin
      .from('coach_sessions')
      .update({
        pipeline_status: 'error',
        pending_gate: null,
        pending_gate_data: null,
      })
      .eq('id', session_id)
      .eq('pipeline_status', 'running');

    // Notify connected SSE clients about the stale state
    const staleStage = PIPELINE_STAGES.includes(dbState.pipeline_stage as PipelineStage)
      ? (dbState.pipeline_stage as PipelineStage)
      : 'intake';
    const emitters = sseConnections.get(session_id);
    if (emitters) {
      for (const emitter of emitters) {
        try {
          emitter({
            type: 'pipeline_error',
            stage: staleStage,
            error: 'Pipeline state became stale after a server restart. Please restart the pipeline.',
          } as never);
        } catch {
          // Connection may already be closed.
        }
      }
    }

    return c.json({
      error: 'Pipeline state became stale after a server restart. Please restart the pipeline from this session.',
      code: 'STALE_PIPELINE',
    }, 409);
  }

  if (dbState.pending_gate) {
    // Optional: verify gate name matches
    if (gate && dbState.pending_gate !== gate) {
      return c.json({ error: `Expected gate '${dbState.pending_gate}', got '${gate}'` }, 400);
    }

    const currentPayload = parsePendingGatePayload(dbState.pending_gate_data);
    const payload: PendingGatePayload = {
      ...currentPayload,
      gate: dbState.pending_gate,
      response,
      response_gate: dbState.pending_gate,
      responded_at: new Date().toISOString(),
    };

    const { error: persistError } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pending_gate_data: payload })
      .eq('id', session_id)
      .eq('pending_gate', dbState.pending_gate);

    if (persistError) {
      logger.error({ session_id, gate: dbState.pending_gate, error: persistError.message }, 'Failed to persist gate response');
      return c.json({ error: 'Failed to persist gate response' }, 500);
    }

    return c.json({ status: 'ok', gate: dbState.pending_gate });
  }

  // No pending gate yet — buffer the response in DB so waitForUser can consume it later.
  if (gate) {
    const currentPayload = parsePendingGatePayload(dbState.pending_gate_data);
    const queue = getResponseQueue(currentPayload).filter((item) => item.gate !== gate);
    queue.push({
      gate,
      response,
      responded_at: new Date().toISOString(),
    });
    const payload = withResponseQueue(currentPayload, queue);
    const { error: bufferError } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pending_gate_data: payload })
      .eq('id', session_id);
    if (bufferError) {
      logger.error({ session_id, gate, error: bufferError.message }, 'Failed to buffer early gate response');
      return c.json({ error: 'Failed to buffer gate response' }, 500);
    }
    logger.info({ session_id, gate }, 'Buffered early gate response in DB');
    return c.json({ status: 'buffered', gate });
  }

  return c.json({ error: 'No pending gate for this session' }, 404);
});

// GET /pipeline/status
// Returns whether a pipeline is running and what gate is pending
pipeline.get('/status', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.query('session_id');

  if (!sessionId) {
    return c.json({ error: 'Missing session_id' }, 400);
  }

  // Verify session belongs to user
  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const { data: dbSession } = await supabaseAdmin
    .from('coach_sessions')
    .select('pipeline_status, pipeline_stage, pending_gate, updated_at')
    .eq('id', sessionId)
    .single();
  const running = dbSession?.pipeline_status === 'running';
  const pendingGate = dbSession?.pending_gate ?? null;
  const updatedAtMs = Date.parse(dbSession?.updated_at ?? '');
  const stalePipeline = running && Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs > STALE_PIPELINE_MS);

  return c.json({
    running,
    pending_gate: pendingGate,
    stale_pipeline: stalePipeline,
    pipeline_stage: dbSession?.pipeline_stage ?? null,
  });
});

export { pipeline };
