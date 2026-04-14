/**
 * Cross-product stress test harness.
 *
 * Runs 3 executive profiles through a 5-product chain:
 *   1. Resume Pipeline (v2)
 *   2. LinkedIn Optimizer
 *   3. LinkedIn Content
 *   4. Job Search (REST)
 *   5. Interview Prep
 *
 * Profiles 0, 3, and 14 from STRESS_TEST_PROFILES are run sequentially.
 *
 * Usage (from repo root):
 *   NODE_PATH=server/node_modules npx tsx e2e/cross-product-runner.ts
 *   NODE_PATH=server/node_modules npx tsx e2e/cross-product-runner.ts --profile 0
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { STRESS_TEST_PROFILES } from './fixtures/stress-test-profiles.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://pvmfgfnbtqlipnnoeixu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XPbIzrH67TbmMQggn9QN_A_16iB5oPG';
const TEST_EMAIL = 'jjschrup@yahoo.com';
const TEST_PASSWORD = 'Scout123';
const API_BASE = 'http://localhost:3001/api';

// Profile indices to run
const PROFILE_INDICES = [0, 3, 14];

// Default timeout per product step
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

// Heartbeat log interval
const HEARTBEAT_INTERVAL_MS = 30_000;

// ─── CLI args ──────────────────────────────────────────────────────────────────

function parseCLIArgs(): { profileIndex: number | null } {
  const args = process.argv.slice(2);
  let profileIndex: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1] !== undefined) {
      profileIndex = parseInt(args[i + 1]!, 10);
      if (isNaN(profileIndex) || profileIndex < 0 || profileIndex >= STRESS_TEST_PROFILES.length) {
        console.error(`Invalid --profile index. Must be 0–${STRESS_TEST_PROFILES.length - 1}`);
        process.exit(1);
      }
      i++;
    }
  }

  return { profileIndex };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SSEEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

interface SSEPipelineOptions {
  label: string;
  startUrl: string;
  streamUrl: string; // {sessionId} replaced before use
  respondUrl?: string;
  body: Record<string, unknown>;
  token: string;
  completionEvents: string[]; // fires when any of these event types is received
  onGate?: (
    eventType: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
  ) => Promise<{ gate: string; response: unknown } | null>;
  timeoutMs?: number;
}

interface SSEPipelineResult {
  success: boolean;
  durationMs: number;
  events: SSEEvent[];
  error?: string;
}

interface ProductResult {
  product: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  summary: string;
  error?: string;
}

interface ProfileChainResult {
  profileIndex: number;
  label: string;
  products: ProductResult[];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  console.log(`[auth] Signing in as ${TEST_EMAIL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`Authentication failed: ${error?.message ?? 'no session returned'}`);
  }
  console.log(`[auth] Authenticated. User ID: ${data.user.id}`);
  return data.session.access_token;
}

// ─── Pre-run cleanup ──────────────────────────────────────────────────────────

async function resetUserUsage(): Promise<void> {
  try {
    const envPath = resolve(process.cwd(), 'server/.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const getEnv = (key: string): string => {
      const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
      return match?.[1]?.trim() ?? '';
    };

    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const testUserId = '5b756a7a-3e35-4465-bcf4-69d92f160f21';

    if (!supabaseUrl || !serviceKey) return;

    const headers: Record<string, string> = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    };

    await fetch(`${supabaseUrl}/rest/v1/user_usage?user_id=eq.${testUserId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sessions_count: 0 }),
    });

    await fetch(
      `${supabaseUrl}/rest/v1/coach_sessions?user_id=eq.${testUserId}&pipeline_status=in.(running,waiting)`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ pipeline_status: 'error', pending_gate: null }),
      },
    );

    console.log('[setup] Usage reset and stuck pipelines cleared');
  } catch {
    console.warn('[setup] Could not reset usage — server/.env may be missing service key');
  }
}

// ─── SSE Parsing ──────────────────────────────────────────────────────────────

function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = chunk.split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split('\n');
    let eventType = 'message';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice('event: '.length).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice('data: '.length).trim();
      }
    }

    if (!dataLine) continue;

    try {
      const parsed = JSON.parse(dataLine) as SSEEvent;
      if (!parsed.type) {
        parsed.type = eventType;
      }
      events.push(parsed);
    } catch {
      events.push({ type: eventType, data: dataLine });
    }
  }

  return events;
}

// ─── Shared SSE Runner ────────────────────────────────────────────────────────

async function runSSEPipeline(opts: SSEPipelineOptions): Promise<SSEPipelineResult> {
  const {
    label,
    startUrl,
    respondUrl,
    body,
    token,
    completionEvents,
    onGate,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  const startTime = Date.now();
  const collectedEvents: SSEEvent[] = [];

  // Step 1: POST to startUrl
  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!startRes.ok) {
    const body_text = await startRes.text().catch(() => '');
    return {
      success: false,
      durationMs: Date.now() - startTime,
      events: [],
      error: `POST ${startUrl} returned ${startRes.status}: ${body_text}`,
    };
  }

  const startJson = await startRes.json().catch(() => ({})) as Record<string, unknown>;

  // Determine sessionId — may be in the start response or was pre-generated
  const sessionId = (startJson.session_id as string | undefined)
    ?? (body.session_id as string | undefined)
    ?? '';

  if (!sessionId) {
    return {
      success: false,
      durationMs: Date.now() - startTime,
      events: [],
      error: `No session_id after POST to ${startUrl}`,
    };
  }

  const streamUrl = opts.streamUrl.replace('{sessionId}', sessionId);

  // Step 2: Open SSE stream
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  [${label}] Still running... ${elapsed}s elapsed, ${collectedEvents.length} events`);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const streamRes = await fetch(streamUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal: timeoutController.signal,
    });

    if (!streamRes.ok) {
      const body_text = await streamRes.text().catch(() => '');
      return {
        success: false,
        durationMs: Date.now() - startTime,
        events: collectedEvents,
        error: `SSE stream ${streamUrl} returned ${streamRes.status}: ${body_text}`,
      };
    }

    if (!streamRes.body) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        events: collectedEvents,
        error: 'SSE stream response has no body',
      };
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    while (!completed) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline === -1) continue;

      const toProcess = buffer.slice(0, lastDoubleNewline + 2);
      buffer = buffer.slice(lastDoubleNewline + 2);

      const events = parseSSEChunk(toProcess);

      for (const event of events) {
        // Skip heartbeat noise
        if (event.type === 'heartbeat') continue;

        collectedEvents.push(event);

        // Check for pipeline error
        if (event.type === 'pipeline_error') {
          const msg = (event.data?.error ?? event.data ?? 'unknown pipeline error') as string;
          return {
            success: false,
            durationMs: Date.now() - startTime,
            events: collectedEvents,
            error: `pipeline_error: ${msg}`,
          };
        }

        // Check for completion
        if (completionEvents.includes(event.type)) {
          completed = true;
          break;
        }

        // Handle gate events
        if (onGate && respondUrl) {
          const gateResponse = await onGate(event.type, event.data ?? event);
          if (gateResponse !== null) {
            // Wait for the server to persist the pending_gate in the DB before responding.
            // The SSE event arrives before setPendingGate() writes to the DB, causing a race.
            await new Promise(r => setTimeout(r, 2000));
            const respondRes = await fetch(respondUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                session_id: sessionId,
                gate: gateResponse.gate,
                response: gateResponse.response,
              }),
            });
            if (!respondRes.ok && respondRes.status !== 409) {
              const body_text = await respondRes.text().catch(() => '');
              console.warn(`  [${label}] Gate response attempt 1 failed ${respondRes.status}: ${body_text}`);
              // Retry once after another 2s — gate may not be persisted yet
              await new Promise(r => setTimeout(r, 2000));
              const retryRes = await fetch(respondUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, gate: gateResponse.gate, response: gateResponse.response }),
              });
              if (!retryRes.ok && retryRes.status !== 409) {
                console.warn(`  [${label}] Gate response retry also failed ${retryRes.status}`);
              }
            }
          }
        }
      }
    }

    // Drain remaining buffer
    if (buffer.trim()) {
      const remaining = parseSSEChunk(buffer + '\n\n');
      for (const event of remaining) {
        if (event.type === 'heartbeat') continue;
        collectedEvents.push(event);
        if (completionEvents.includes(event.type)) {
          completed = true;
          break;
        }
      }
    }

    if (!completed) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        events: collectedEvents,
        error: `SSE stream closed without a completion event (expected one of: ${completionEvents.join(', ')})`,
      };
    }

    return {
      success: true,
      durationMs: Date.now() - startTime,
      events: collectedEvents,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('aborted') || msg.includes('abort');
    return {
      success: false,
      durationMs: Date.now() - startTime,
      events: collectedEvents,
      error: isTimeout ? `Timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timeoutId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }
}

// ─── Product Runners ──────────────────────────────────────────────────────────

async function runResumePipeline(
  profile: { resumeText: string; jobDescription: string },
  token: string,
  tag: string,
): Promise<ProductResult & { sessionId: string | null; resumeText: string; jobDescription: string }> {
  console.log(`  [${tag}] Starting Resume Pipeline...`);
  const startTime = Date.now();

  let atsScore: number | null = null;
  let coverageScore: number | null = null;
  let sectionsWritten: number | null = null;

  // Use the v2 pipeline POST /start which returns session_id directly
  const startRes = await fetch(`${API_BASE}/pipeline/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resume_text: profile.resumeText,
      job_description: profile.jobDescription,
    }),
  }).catch((err: unknown) => {
    throw new Error(`POST /pipeline/start failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  if (!startRes.ok) {
    const body_text = await startRes.text().catch(() => '');
    return {
      product: 'Resume Pipeline',
      status: 'fail',
      durationMs: Date.now() - startTime,
      summary: `HTTP ${startRes.status}`,
      error: `POST /pipeline/start returned ${startRes.status}: ${body_text}`,
      sessionId: null,
      resumeText: profile.resumeText,
      jobDescription: profile.jobDescription,
    };
  }

  const startJson = await startRes.json() as { session_id: string };
  const sessionId = startJson.session_id;

  if (!sessionId) {
    return {
      product: 'Resume Pipeline',
      status: 'fail',
      durationMs: Date.now() - startTime,
      summary: 'No session_id',
      error: 'POST /pipeline/start: no session_id in response',
      sessionId: null,
      resumeText: profile.resumeText,
      jobDescription: profile.jobDescription,
    };
  }

  console.log(`  [${tag}] Resume session: ${sessionId}`);

  // Stream events with gap auto-approval
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);
  const heartbeatTimer = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  [${tag}] Resume still running... ${elapsed}s`);
  }, HEARTBEAT_INTERVAL_MS);

  let pipelineComplete = false;

  try {
    const streamRes = await fetch(`${API_BASE}/pipeline/${sessionId}/stream`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: timeoutController.signal,
    });

    if (!streamRes.ok || !streamRes.body) {
      throw new Error(`SSE stream returned ${streamRes.status}`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!pipelineComplete) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline === -1) continue;

      const toProcess = buffer.slice(0, lastDoubleNewline + 2);
      buffer = buffer.slice(lastDoubleNewline + 2);

      const events = parseSSEChunk(toProcess);

      for (const event of events) {
        if (event.type === 'heartbeat') continue;

        if (event.type === 'pre_scores') {
          const scores = event.data as { ats_match?: number; job_requirement_coverage_score?: number } | undefined;
          if (scores) {
            atsScore = scores.ats_match ?? atsScore;
            coverageScore = scores.job_requirement_coverage_score ?? coverageScore;
          }
        }

        if (event.type === 'assembly_complete') {
          const assembly = event.data as { scores?: { ats_match?: number }; final_resume?: Record<string, unknown> } | undefined;
          if (assembly?.scores?.ats_match !== undefined) atsScore = assembly.scores.ats_match;
          if (assembly?.final_resume) {
            const fr = assembly.final_resume;
            let count = 3;
            if (Array.isArray(fr.professional_experience) && fr.professional_experience.length > 0) count++;
            if (Array.isArray(fr.selected_accomplishments) && fr.selected_accomplishments.length > 0) count++;
            if (Array.isArray(fr.custom_sections)) count += fr.custom_sections.length;
            sectionsWritten = count;
          }
        }

        if (event.type === 'gap_coaching') {
          const cards = (Array.isArray(event.data) ? event.data : []) as Array<{ requirement: string; importance: string; classification: string }>;
          if (cards.length > 0) {
            console.log(`  [${tag}] gap_coaching: auto-approving ${cards.length} cards`);
            const responses = cards.map((c) => ({ requirement: c.requirement, action: 'approve' as const }));
            await fetch(`${API_BASE}/pipeline/${sessionId}/respond-gaps`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ responses }),
            }).catch(() => {/* non-fatal */});
          }
        }

        if (event.type === 'gap_questions') {
          const questions = (event.data?.questions ?? []) as Array<{ id: string; requirement: string }>;
          if (questions.length > 0) {
            console.log(`  [${tag}] gap_questions: auto-approving ${questions.length} questions`);
            const responses = questions.map((q) => ({
              requirement: q.requirement ?? q.id,
              action: 'approve' as const,
            }));
            await fetch(`${API_BASE}/pipeline/${sessionId}/respond-gaps`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ responses }),
            }).catch(() => {/* non-fatal */});
          }
        }

        if (event.type === 'pipeline_complete') {
          pipelineComplete = true;
          break;
        }

        if (event.type === 'pipeline_error') {
          throw new Error(`pipeline_error: ${event.data?.error ?? event.data ?? 'unknown'}`);
        }
      }
    }

    if (!pipelineComplete) throw new Error('Stream closed without pipeline_complete');
  } finally {
    clearTimeout(timeoutId);
    clearInterval(heartbeatTimer);
  }

  const durationMs = Date.now() - startTime;
  const atsPct = atsScore !== null ? `ATS=${atsScore}%` : 'ATS=n/a';
  const covPct = coverageScore !== null ? `Coverage=${coverageScore}%` : 'Coverage=n/a';
  const secStr = sectionsWritten !== null ? `Sections=${sectionsWritten}` : '';
  const parts = [atsPct, covPct, secStr].filter(Boolean);

  return {
    product: 'Resume Pipeline',
    status: 'pass',
    durationMs,
    summary: parts.join('  '),
    sessionId,
    resumeText: profile.resumeText,
    jobDescription: profile.jobDescription,
  };
}

async function runLinkedInOptimizer(
  resumeText: string,
  token: string,
  tag: string,
): Promise<ProductResult> {
  console.log(`  [${tag}] Starting LinkedIn Optimizer...`);
  const sessionId = randomUUID();

  const result = await runSSEPipeline({
    label: `${tag}/linkedin-optimizer`,
    startUrl: `${API_BASE}/linkedin-optimizer/start`,
    streamUrl: `${API_BASE}/linkedin-optimizer/{sessionId}/stream`,
    respondUrl: `${API_BASE}/linkedin-optimizer/respond`,
    body: { session_id: sessionId, resume_text: resumeText },
    token,
    completionEvents: ['report_complete', 'pipeline_complete'],
    // No gates — fully autonomous
  });

  if (!result.success) {
    return {
      product: 'LinkedIn Optimizer',
      status: 'fail',
      durationMs: result.durationMs,
      summary: 'FAIL',
      error: result.error,
    };
  }

  // Extract quality score and findings count from report_complete event
  const reportEvent = result.events.find((e) => e.type === 'report_complete');
  const qualityScore = reportEvent?.data?.quality_score ?? reportEvent?.quality_score ?? null;
  // Count individual findings from audit_report if available
  const auditReport = reportEvent?.data?.audit_report ?? reportEvent?.audit_report;
  let findingsCount: number | null = null;
  if (auditReport && typeof auditReport === 'object') {
    const rec = auditReport as Record<string, unknown>;
    // findings may be in recommendations array or a separate findings array
    const recs = Array.isArray(rec.recommendations) ? rec.recommendations : null;
    const finds = Array.isArray(rec.findings) ? rec.findings : null;
    findingsCount = (recs?.length ?? 0) + (finds?.length ?? 0) || null;
  }

  const parts: string[] = [];
  if (qualityScore !== null) parts.push(`Score=${qualityScore}`);
  if (findingsCount !== null) parts.push(`Findings=${findingsCount}`);

  return {
    product: 'LinkedIn Optimizer',
    status: 'pass',
    durationMs: result.durationMs,
    summary: parts.length > 0 ? parts.join('  ') : 'complete',
  };
}

async function runLinkedInContent(
  token: string,
  tag: string,
): Promise<ProductResult> {
  console.log(`  [${tag}] Starting LinkedIn Content...`);
  const sessionId = randomUUID();

  // Capture topics from topics_ready event for use when responding to gate
  let capturedTopics: unknown[] | null = null;

  const result = await runSSEPipeline({
    label: `${tag}/linkedin-content`,
    startUrl: `${API_BASE}/linkedin-content/start`,
    streamUrl: `${API_BASE}/linkedin-content/{sessionId}/stream`,
    respondUrl: `${API_BASE}/linkedin-content/respond`,
    body: { session_id: sessionId },
    token,
    completionEvents: ['content_complete', 'pipeline_complete'],
    onGate: async (eventType, data) => {
      // Capture topic data from topics_ready event (fires before pipeline_gate)
      if (eventType === 'topics_ready') {
        const topics = data?.topics ?? data?.data?.topics;
        if (Array.isArray(topics)) capturedTopics = topics;
        return null;
      }

      if (eventType !== 'pipeline_gate') return null;
      const gate = (data?.gate ?? '') as string;

      if (gate === 'topic_selection') {
        const topics = capturedTopics ?? data?.topics ?? data?.data?.topics;
        const firstTopic = Array.isArray(topics) ? topics[0] : null;
        const topicResponse = firstTopic
          ? { topic_id: firstTopic.id ?? firstTopic.topic_id ?? '0' }
          : { topic_id: '0' };
        console.log(`  [${tag}] Responding to topic_selection gate (${Array.isArray(topics) ? topics.length : 0} topics)`);
        return { gate: 'topic_selection', response: topicResponse };
      }

      if (gate === 'post_review') {
        console.log(`  [${tag}] Approving post_review gate`);
        return { gate: 'post_review', response: { approved: true } };
      }

      return null;
    },
  });

  if (!result.success) {
    return {
      product: 'LinkedIn Content',
      status: 'fail',
      durationMs: result.durationMs,
      summary: 'FAIL',
      error: result.error,
    };
  }

  const completionEvent = result.events.find((e) => e.type === 'content_complete' || e.type === 'pipeline_complete');
  const post = (completionEvent?.data?.post ?? completionEvent?.post ?? '') as string;
  const hashtags = (completionEvent?.data?.hashtags ?? completionEvent?.hashtags ?? []) as string[];
  const qualityScores = completionEvent?.data?.quality_scores ?? completionEvent?.quality_scores;
  const overallQuality = qualityScores?.overall ?? qualityScores?.overall_score ?? null;

  const parts: string[] = [];
  if (post) parts.push(`Post=${post.length}chars`);
  if (hashtags.length > 0) parts.push(`Tags=${hashtags.length}`);
  if (overallQuality !== null) parts.push(`Quality=${overallQuality}`);

  return {
    product: 'LinkedIn Content',
    status: 'pass',
    durationMs: result.durationMs,
    summary: parts.length > 0 ? parts.join('  ') : 'complete',
  };
}

async function runJobSearch(
  query: string,
  location: string,
  token: string,
  tag: string,
): Promise<ProductResult> {
  console.log(`  [${tag}] Running Job Search...`);
  const startTime = Date.now();

  const res = await fetch(`${API_BASE}/job-search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      location,
      filters: { datePosted: '14d' as const },
    }),
  }).catch((err: unknown) => {
    throw new Error(`POST /job-search failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  const durationMs = Date.now() - startTime;

  if (!res.ok) {
    const body_text = await res.text().catch(() => '');
    // feature_disabled is a soft failure — report as skip
    if (res.status === 200) {
      const json = await res.json().catch(() => ({}) as Record<string, unknown>) as Record<string, unknown>;
      if (json.feature_disabled) {
        return { product: 'Job Search', status: 'skip', durationMs, summary: 'feature_disabled' };
      }
    }
    return {
      product: 'Job Search',
      status: 'fail',
      durationMs,
      summary: `HTTP ${res.status}`,
      error: `POST /job-search returned ${res.status}: ${body_text}`,
    };
  }

  const json = await res.json() as Record<string, unknown>;

  // feature disabled response returns 200 with feature_disabled=true
  if (json.feature_disabled) {
    return { product: 'Job Search', status: 'skip', durationMs, summary: 'feature_disabled' };
  }

  const jobs = (Array.isArray(json.jobs) ? json.jobs : []) as Array<Record<string, unknown>>;
  const topTitle = jobs.length > 0 ? (jobs[0]?.title as string | undefined) ?? '?' : 'none';
  const topCompany = jobs.length > 0 ? (jobs[0]?.company as string | undefined) ?? '?' : '';
  const topMatch = topTitle + (topCompany ? `, ${topCompany}` : '');

  return {
    product: 'Job Search',
    status: 'pass',
    durationMs,
    summary: `Jobs=${jobs.length}  TopMatch="${topMatch}"`,
  };
}

async function runInterviewPrep(
  resumeText: string,
  jobDescription: string,
  companyName: string,
  token: string,
  tag: string,
): Promise<ProductResult> {
  console.log(`  [${tag}] Starting Interview Prep...`);
  const sessionId = randomUUID();

  const result = await runSSEPipeline({
    label: `${tag}/interview-prep`,
    startUrl: `${API_BASE}/interview-prep/start`,
    streamUrl: `${API_BASE}/interview-prep/{sessionId}/stream`,
    respondUrl: `${API_BASE}/interview-prep/respond`,
    body: {
      session_id: sessionId,
      resume_text: resumeText,
      job_description: jobDescription,
      company_name: companyName,
    },
    token,
    completionEvents: ['report_complete', 'pipeline_complete'],
    onGate: async (eventType, data) => {
      if (eventType !== 'pipeline_gate') return null;
      const gate = (data?.gate ?? data?.data?.gate ?? '') as string;
      if (gate === 'star_stories_review') {
        console.log(`  [${tag}] Approving star_stories_review gate`);
        return { gate: 'star_stories_review', response: true };
      }
      return null;
    },
  });

  if (!result.success) {
    return {
      product: 'Interview Prep',
      status: 'fail',
      durationMs: result.durationMs,
      summary: 'FAIL',
      error: result.error,
    };
  }

  const reportEvent = result.events.find((e) => e.type === 'report_complete' || e.type === 'pipeline_complete');
  const report = (reportEvent?.data?.report ?? reportEvent?.report ?? '') as string;
  const qualityScore = reportEvent?.data?.quality_score ?? reportEvent?.quality_score ?? null;

  const parts: string[] = [];
  if (report) parts.push(`Report=${report.length}chars`);
  if (qualityScore !== null) parts.push(`Score=${qualityScore}`);

  return {
    product: 'Interview Prep',
    status: 'pass',
    durationMs: result.durationMs,
    summary: parts.length > 0 ? parts.join('  ') : 'complete',
  };
}

// ─── Profile Chain Runner ─────────────────────────────────────────────────────

async function runProfileChain(
  profileIndex: number,
  token: string,
): Promise<ProfileChainResult> {
  const profile = STRESS_TEST_PROFILES[profileIndex];
  if (!profile) {
    throw new Error(`No profile at index ${profileIndex}`);
  }

  const label = profile.label;
  const tag = `profile-${profileIndex}`;
  const products: ProductResult[] = [];

  console.log('');
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Profile ${profileIndex}: ${label}`);
  console.log(`${'═'.repeat(70)}`);

  // Extract a company name from the job description (first company-like noun)
  const companyMatch = profile.jobDescription.match(/(?:at|—)\s+([A-Z][A-Za-z &,.']+(?:Inc|LLC|Corp|Group|Holdings|Partners|Capital)?)/);
  const companyName = companyMatch?.[1]?.trim() ?? 'the company';

  // Extract a job search query from the label (e.g. "VP Ops → COO" → "COO")
  const targetRole = label.includes('→') ? label.split('→')[1]?.trim() ?? label : label;

  // ── 1. Resume Pipeline ──────────────────────────────────────────────────
  let resumeResult: Awaited<ReturnType<typeof runResumePipeline>>;
  try {
    resumeResult = await runResumePipeline(
      { resumeText: profile.resumeText, jobDescription: profile.jobDescription },
      token,
      tag,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    resumeResult = {
      product: 'Resume Pipeline',
      status: 'fail',
      durationMs: 0,
      summary: 'FAIL',
      error: msg,
      sessionId: null,
      resumeText: profile.resumeText,
      jobDescription: profile.jobDescription,
    };
  }
  products.push(resumeResult);
  printProductLine(resumeResult);

  // ── 2. LinkedIn Optimizer ────────────────────────────────────────────────
  let linkedInOptimizerResult: ProductResult;
  try {
    linkedInOptimizerResult = await runLinkedInOptimizer(profile.resumeText, token, tag);
  } catch (err: unknown) {
    linkedInOptimizerResult = {
      product: 'LinkedIn Optimizer',
      status: 'fail',
      durationMs: 0,
      summary: 'FAIL',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  products.push(linkedInOptimizerResult);
  printProductLine(linkedInOptimizerResult);

  // ── 3. LinkedIn Content ──────────────────────────────────────────────────
  let linkedInContentResult: ProductResult;
  try {
    linkedInContentResult = await runLinkedInContent(token, tag);
  } catch (err: unknown) {
    linkedInContentResult = {
      product: 'LinkedIn Content',
      status: 'fail',
      durationMs: 0,
      summary: 'FAIL',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  products.push(linkedInContentResult);
  printProductLine(linkedInContentResult);

  // ── 4. Job Search ─────────────────────────────────────────────────────────
  let jobSearchResult: ProductResult;
  try {
    jobSearchResult = await runJobSearch(targetRole, '', token, tag);
  } catch (err: unknown) {
    jobSearchResult = {
      product: 'Job Search',
      status: 'fail',
      durationMs: 0,
      summary: 'FAIL',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  products.push(jobSearchResult);
  printProductLine(jobSearchResult);

  // ── 5. Interview Prep ─────────────────────────────────────────────────────
  let interviewPrepResult: ProductResult;
  try {
    interviewPrepResult = await runInterviewPrep(
      profile.resumeText,
      profile.jobDescription,
      companyName,
      token,
      tag,
    );
  } catch (err: unknown) {
    interviewPrepResult = {
      product: 'Interview Prep',
      status: 'fail',
      durationMs: 0,
      summary: 'FAIL',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  products.push(interviewPrepResult);
  printProductLine(interviewPrepResult);

  return { profileIndex, label, products };
}

// ─── Output Helpers ───────────────────────────────────────────────────────────

function productLabel(name: string): string {
  return name.padEnd(22);
}

function statusLabel(status: 'pass' | 'fail' | 'skip'): string {
  if (status === 'pass') return 'PASS';
  if (status === 'skip') return 'SKIP';
  return 'FAIL';
}

function printProductLine(r: ProductResult): void {
  const dur = `${Math.round(r.durationMs / 1000)}s`.padStart(5);
  const status = statusLabel(r.status).padEnd(5);
  console.log(`  ${productLabel(r.product)}  ${status}  ${dur}  ${r.summary}`);
  if (r.error && r.status === 'fail') {
    const truncated = r.error.length > 100 ? r.error.slice(0, 97) + '...' : r.error;
    console.log(`    ERROR: ${truncated}`);
  }
}

function printFinalSummary(chains: ProfileChainResult[]): void {
  console.log('');
  console.log('═'.repeat(100));
  console.log('  CROSS-PRODUCT STRESS TEST — FINAL SUMMARY');
  console.log('═'.repeat(100));

  // Stats
  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;

  for (const chain of chains) {
    for (const p of chain.products) {
      if (p.status === 'pass') totalPass++;
      else if (p.status === 'fail') totalFail++;
      else totalSkip++;
    }
  }

  const totalCells = chains.length * (chains[0]?.products.length ?? 0);
  console.log(`  Profiles: ${chains.length}  |  Products per chain: ${chains[0]?.products.length ?? 0}  |  Total cells: ${totalCells}`);
  console.log(`  Pass: ${totalPass}  |  Fail: ${totalFail}  |  Skip: ${totalSkip}`);
  console.log('─'.repeat(100));

  for (const chain of chains) {
    console.log('');
    console.log(`  Profile ${chain.profileIndex}: ${chain.label}`);
    for (const p of chain.products) {
      const dur = `${Math.round(p.durationMs / 1000)}s`.padStart(5);
      const status = statusLabel(p.status).padEnd(5);
      console.log(`    ${productLabel(p.product)}  ${status}  ${dur}  ${p.summary}`);
      if (p.error && p.status === 'fail') {
        const truncated = p.error.length > 90 ? p.error.slice(0, 87) + '...' : p.error;
        console.log(`      ERROR: ${truncated}`);
      }
    }
  }

  console.log('');
  console.log('═'.repeat(100));
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { profileIndex } = parseCLIArgs();

  const indicesToRun = profileIndex !== null ? [profileIndex] : PROFILE_INDICES;

  console.log('');
  console.log('Cross-Product Stress Test Runner');
  console.log(`Profiles:  ${indicesToRun.join(', ')}`);
  console.log(`Products:  Resume Pipeline, LinkedIn Optimizer, LinkedIn Content, Job Search, Interview Prep`);
  console.log(`API base:  ${API_BASE}`);
  console.log(`Timeout:   ${DEFAULT_TIMEOUT_MS / 60_000} minutes per product`);
  console.log('');

  // Pre-flight reset
  await resetUserUsage();

  // Authenticate
  let token: string;
  try {
    token = await authenticate();
  } catch (err: unknown) {
    console.error('Authentication failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const wallStart = Date.now();
  const results: ProfileChainResult[] = [];

  // Run profiles sequentially
  for (const idx of indicesToRun) {
    const chainResult = await runProfileChain(idx, token).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[profile-${idx}] Chain failed with unhandled error: ${msg}`);
      const profile = STRESS_TEST_PROFILES[idx];
      return {
        profileIndex: idx,
        label: profile?.label ?? `Profile ${idx}`,
        products: [] as ProductResult[],
      };
    });
    results.push(chainResult);
  }

  const wallMs = Date.now() - wallStart;
  console.log(`\nAll chains finished. Wall time: ${Math.round(wallMs / 1000)}s`);

  printFinalSummary(results);

  const anyFailed = results.some((r) => r.products.some((p) => p.status === 'fail'));
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('Unhandled error in cross-product runner:', err);
  process.exit(1);
});
