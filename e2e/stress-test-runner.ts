/**
 * Stress test runner for the Resume V2 pipeline API.
 *
 * Authenticates via Supabase, starts N pipelines concurrently (default: 3 at a time),
 * streams all SSE events, auto-approves gap coaching gates, collects final results,
 * and prints a summary table.
 *
 * Usage (from repo root):
 *   NODE_PATH=server/node_modules npx tsx e2e/stress-test-runner.ts
 *   NODE_PATH=server/node_modules npx tsx e2e/stress-test-runner.ts --profile 0
 *   NODE_PATH=server/node_modules npx tsx e2e/stress-test-runner.ts --concurrency 5
 *
 * @supabase/supabase-js is resolved from server/node_modules via NODE_PATH.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STRESS_TEST_PROFILES, type StressTestProfile } from './fixtures/stress-test-profiles.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://pvmfgfnbtqlipnnoeixu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XPbIzrH67TbmMQggn9QN_A_16iB5oPG';
const TEST_EMAIL = 'jjschrup@yahoo.com';
const TEST_PASSWORD = 'Scout123';
const API_BASE = 'http://localhost:3001/api';
const PIPELINE_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes per pipeline
const DEFAULT_CONCURRENCY = 3;
const HEARTBEAT_LOG_INTERVAL_MS = 30_000; // log "still running" every 30s

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseCLIArgs(): { profileIndex: number | null; concurrency: number } {
  const args = process.argv.slice(2);
  let profileIndex: number | null = null;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1] !== undefined) {
      profileIndex = parseInt(args[i + 1]!, 10);
      if (isNaN(profileIndex) || profileIndex < 0 || profileIndex >= STRESS_TEST_PROFILES.length) {
        console.error(`Invalid --profile index. Must be 0–${STRESS_TEST_PROFILES.length - 1}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1] !== undefined) {
      concurrency = parseInt(args[i + 1]!, 10);
      if (isNaN(concurrency) || concurrency < 1) {
        console.error('Invalid --concurrency value. Must be >= 1');
        process.exit(1);
      }
      i++;
    }
  }

  return { profileIndex, concurrency };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineResult {
  profileIndex: number;
  label: string;
  sessionId: string | null;
  status: 'pass' | 'fail';
  durationMs: number;
  atsScore: number | null;
  requirementCoverageScore: number | null;
  sectionsWritten: number | null;
  error: string | null;
  eventsReceived: number;
  gapCoachingCardsApproved: number;
}

interface GapCoachingCard {
  requirement: string;
  work_item_id?: string;
  importance: string;
  classification: string;
}

interface ParsedSSEEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  session_id?: string;
  error?: string;
  stage?: string;
}

// ─── Supabase Auth ────────────────────────────────────────────────────────────

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

// ─── API helpers ──────────────────────────────────────────────────────────────

async function startPipeline(
  token: string,
  profile: StressTestProfile,
): Promise<string> {
  const res = await fetch(`${API_BASE}/pipeline/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resume_text: (profile as any).resume_text ?? (profile as any).resumeText,
      job_description: (profile as any).job_description ?? (profile as any).jobDescription,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /pipeline/start returned ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { session_id: string; status: string };
  if (!json.session_id) {
    throw new Error(`POST /pipeline/start: no session_id in response: ${JSON.stringify(json)}`);
  }

  return json.session_id;
}

async function respondToGaps(
  token: string,
  sessionId: string,
  cards: GapCoachingCard[],
): Promise<void> {
  const responses = cards.map((card) => ({
    requirement: card.requirement,
    action: 'approve' as const,
  }));

  const res = await fetch(`${API_BASE}/pipeline/${sessionId}/respond-gaps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ responses }),
  });

  if (!res.ok && res.status !== 409) {
    // 409 means no pending gate — already resolved or pipeline moved on; not fatal
    const body = await res.text().catch(() => '');
    throw new Error(`POST /pipeline/${sessionId}/respond-gaps returned ${res.status}: ${body}`);
  }
}

async function fetchResult(
  token: string,
  sessionId: string,
  maxAttempts = 5,
  retryDelayMs = 2_000,
): Promise<Record<string, unknown>> {
  // The pipeline_complete SSE event can race the final DB snapshot persist.
  // Retry a few times with a short delay to allow the write to land.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }

    const res = await fetch(`${API_BASE}/pipeline/${sessionId}/result`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 409 means pipeline is still running — keep waiting
    if (res.status === 409) {
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 404 on attempt 1 is likely a DB race — retry silently
      if (res.status === 404 && attempt < maxAttempts) {
        continue;
      }
      throw new Error(`GET /pipeline/${sessionId}/result returned ${res.status}: ${body}`);
    }

    return (await res.json()) as Record<string, unknown>;
  }

  throw new Error(
    `GET /pipeline/${sessionId}/result failed after ${maxAttempts} attempts (pipeline may still be writing)`,
  );
}

// ─── SSE streaming ────────────────────────────────────────────────────────────

/**
 * Parse a raw SSE chunk into individual events.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 */
function parseSSEChunk(chunk: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = [];
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
      const parsed = JSON.parse(dataLine) as ParsedSSEEvent;
      // If the JSON already has a `type` field use it, otherwise use SSE event line
      if (!parsed.type) {
        parsed.type = eventType;
      }
      events.push(parsed);
    } catch {
      // Non-JSON data (e.g., heartbeat ping) — wrap as raw event
      events.push({ type: eventType, data: dataLine });
    }
  }

  return events;
}

// ─── Single pipeline runner ───────────────────────────────────────────────────

async function runSinglePipeline(
  token: string,
  profileIndex: number,
  profile: StressTestProfile,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const tag = `[pipeline-${profileIndex}]`;

  console.log(`${tag} Starting: "${profile.label}"`);

  let sessionId: string | null = null;
  let eventsReceived = 0;
  let gapCoachingCardsApproved = 0;
  let atsScore: number | null = null;
  let requirementCoverageScore: number | null = null;
  let sectionsWritten: number | null = null;
  let lastGapCoachingCards: GapCoachingCard[] = [];
  // track gap_questions events for the gap_questions gate path
  let lastGapQuestions: Array<{ requirement: string }> = [];

  try {
    // ── 1. Start the pipeline ──────────────────────────────────────────────
    sessionId = await startPipeline(token, profile);
    console.log(`${tag} Session ID: ${sessionId}`);

    // ── 2. Open SSE stream and process events ─────────────────────────────
    const streamUrl = `${API_BASE}/pipeline/${sessionId}/stream`;

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, PIPELINE_TIMEOUT_MS);

    // Heartbeat logger so we know long-running pipelines are still alive
    let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`${tag} Still running… ${elapsed}s elapsed, ${eventsReceived} events so far`);
    }, HEARTBEAT_LOG_INTERVAL_MS);

    try {
      const streamRes = await fetch(streamUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: timeoutController.signal,
      });

      if (!streamRes.ok) {
        const body = await streamRes.text().catch(() => '');
        throw new Error(`SSE stream returned ${streamRes.status}: ${body}`);
      }

      if (!streamRes.body) {
        throw new Error('SSE stream response has no body');
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let pipelineComplete = false;

      while (!pipelineComplete) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newlines but keep incomplete blocks in buffer
        const lastDoubleNewline = buffer.lastIndexOf('\n\n');
        if (lastDoubleNewline === -1) continue;

        const toProcess = buffer.slice(0, lastDoubleNewline + 2);
        buffer = buffer.slice(lastDoubleNewline + 2);

        const events = parseSSEChunk(toProcess);

        for (const event of events) {
          eventsReceived++;

          switch (event.type) {
            case 'stage_start':
              console.log(`${tag} Stage started: ${event.stage ?? event.data?.stage ?? '?'}`);
              break;

            case 'stage_complete':
              console.log(
                `${tag} Stage complete: ${event.stage ?? event.data?.stage ?? '?'} ` +
                `(${Math.round((event.data?.duration_ms ?? 0) / 1000)}s)`,
              );
              break;

            case 'pre_scores': {
              const scores = event.data as {
                ats_match?: number;
                job_requirement_coverage_score?: number;
              } | undefined;
              if (scores) {
                atsScore = scores.ats_match ?? null;
                requirementCoverageScore = scores.job_requirement_coverage_score ?? null;
              }
              break;
            }

            case 'assembly_complete': {
              const assembly = event.data as {
                scores?: { ats_match?: number };
                final_resume?: {
                  professional_experience?: unknown[];
                  selected_accomplishments?: unknown[];
                  custom_sections?: unknown[];
                };
              } | undefined;

              if (assembly?.scores?.ats_match !== undefined) {
                atsScore = assembly.scores.ats_match;
              }
              if (assembly?.final_resume) {
                const fr = assembly.final_resume;
                // Count distinct resume sections written
                let count = 0;
                if (fr.professional_experience && fr.professional_experience.length > 0) count++;
                if (fr.selected_accomplishments && fr.selected_accomplishments.length > 0) count++;
                if (fr.custom_sections && fr.custom_sections.length > 0) count += fr.custom_sections.length;
                // Always count header + summary + competencies as base sections if present
                count += 3; // header, executive_summary, core_competencies
                sectionsWritten = count;
              }
              break;
            }

            case 'resume_draft': {
              const draft = event.data as {
                professional_experience?: unknown[];
                selected_accomplishments?: unknown[];
              } | undefined;
              if (draft && sectionsWritten === null) {
                let count = 3; // header + summary + competencies
                if (draft.professional_experience && draft.professional_experience.length > 0) count++;
                if (draft.selected_accomplishments && draft.selected_accomplishments.length > 0) count++;
                sectionsWritten = count;
              }
              break;
            }

            case 'gap_coaching': {
              // Auto-approve all gap coaching cards
              const cards = (Array.isArray(event.data) ? event.data : []) as GapCoachingCard[];
              lastGapCoachingCards = cards;
              console.log(`${tag} gap_coaching gate: ${cards.length} cards — auto-approving all`);

              if (cards.length > 0) {
                await respondToGaps(token, sessionId, cards);
                gapCoachingCardsApproved += cards.length;
                console.log(`${tag} Approved ${cards.length} gap coaching cards`);
              }
              break;
            }

            case 'gap_questions': {
              // gap_questions gate — approve all by mapping to gap responses
              const questions = (event.data?.questions ?? []) as Array<{
                id: string;
                requirement: string;
              }>;
              lastGapQuestions = questions;
              console.log(`${tag} gap_questions gate: ${questions.length} questions — auto-approving all`);

              if (questions.length > 0) {
                const cards: GapCoachingCard[] = questions.map((q) => ({
                  requirement: q.requirement ?? q.id,
                  importance: 'important',
                  classification: 'partial',
                }));
                await respondToGaps(token, sessionId, cards);
                gapCoachingCardsApproved += questions.length;
              }
              break;
            }

            case 'pipeline_complete':
              console.log(`${tag} pipeline_complete received`);
              pipelineComplete = true;
              break;

            case 'pipeline_error': {
              const errMsg = (event.error ?? event.data?.error ?? 'unknown pipeline error') as string;
              throw new Error(`pipeline_error event: ${errMsg}`);
            }

            case 'heartbeat':
              // silent — server keepalive
              eventsReceived--; // don't count heartbeats
              break;

            default:
              // other events (transparency, benchmark, gap_analysis, etc.) — just count
              break;
          }
        }
      }

      // Drain any remaining buffer
      if (buffer.trim()) {
        const remaining = parseSSEChunk(buffer + '\n\n');
        for (const event of remaining) {
          if (event.type === 'pipeline_complete') pipelineComplete = true;
          if (event.type === 'pipeline_error') {
            throw new Error(`pipeline_error: ${event.error ?? 'unknown'}`);
          }
        }
      }

      if (!pipelineComplete) {
        throw new Error('SSE stream closed without pipeline_complete event');
      }
    } finally {
      clearTimeout(timeoutId);
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    // ── 3. Fetch final result (optional enrichment — scores already captured from SSE) ─
    try {
      const result = await fetchResult(token, sessionId);

      // Extract scores from result only if not already set from SSE events
      if (result.version === 'v2') {
        const pipelineData = result.pipeline_data as Record<string, unknown> | undefined;
        const assembly = pipelineData?.assembly as Record<string, unknown> | undefined;
        const assemblyScores = assembly?.scores as Record<string, unknown> | undefined;

        if (assemblyScores?.ats_match !== undefined && atsScore === null) {
          atsScore = assemblyScores.ats_match as number;
        }

        // Try pre_scores for requirement coverage
        const preScores = pipelineData?.preScores as Record<string, unknown> | undefined;
        if (preScores?.job_requirement_coverage_score !== undefined && requirementCoverageScore === null) {
          requirementCoverageScore = preScores.job_requirement_coverage_score as number;
        }

        // Count sections from assembly final_resume
        const finalResume = assembly?.final_resume as Record<string, unknown> | undefined;
        if (finalResume && sectionsWritten === null) {
          let count = 3; // header + summary + competencies
          const profExp = finalResume.professional_experience as unknown[] | undefined;
          const selAcc = finalResume.selected_accomplishments as unknown[] | undefined;
          const custom = finalResume.custom_sections as unknown[] | undefined;
          if (profExp && profExp.length > 0) count++;
          if (selAcc && selAcc.length > 0) count++;
          if (custom) count += custom.length;
          sectionsWritten = count;
        }
      }
    } catch (resultErr: unknown) {
      // Result fetch failure is non-fatal — scores were already captured from SSE events.
      // Log a warning so the operator can investigate if needed.
      const msg = resultErr instanceof Error ? resultErr.message : String(resultErr);
      console.warn(`${tag} Result fetch warning (non-fatal): ${msg}`);
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `${tag} PASS in ${Math.round(durationMs / 1000)}s | ` +
      `ATS: ${atsScore ?? 'n/a'} | ` +
      `Coverage: ${requirementCoverageScore ?? 'n/a'} | ` +
      `Sections: ${sectionsWritten ?? 'n/a'} | ` +
      `Events: ${eventsReceived} | ` +
      `GapCards: ${gapCoachingCardsApproved}`,
    );

    return {
      profileIndex,
      label: profile.label,
      sessionId,
      status: 'pass',
      durationMs,
      atsScore,
      requirementCoverageScore,
      sectionsWritten,
      error: null,
      eventsReceived,
      gapCoachingCardsApproved,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.error(`${tag} FAIL in ${Math.round(durationMs / 1000)}s: ${errorMsg}`);

    return {
      profileIndex,
      label: profile.label,
      sessionId,
      status: 'fail',
      durationMs,
      atsScore,
      requirementCoverageScore,
      sectionsWritten,
      error: errorMsg,
      eventsReceived,
      gapCoachingCardsApproved,
    };
  }
}

// ─── Semaphore ────────────────────────────────────────────────────────────────

class Semaphore {
  private available: number;
  private waitQueue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.available = concurrency;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => this.waitQueue.push(resolve));
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.available++;
    }
  }
}

// ─── Concurrency runner ───────────────────────────────────────────────────────

async function runWithSemaphore(
  token: string,
  profiles: Array<{ index: number; profile: StressTestProfile }>,
  concurrency: number,
): Promise<PipelineResult[]> {
  const semaphore = new Semaphore(concurrency);
  const results: PipelineResult[] = new Array(profiles.length);

  const tasks = profiles.map(({ index, profile }, arrayPos) =>
    (async () => {
      await semaphore.acquire();
      try {
        results[arrayPos] = await runSinglePipeline(token, index, profile);
      } finally {
        semaphore.release();
      }
    })(),
  );

  await Promise.all(tasks);
  return results;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printSummaryTable(results: PipelineResult[]): void {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const avgSecs = results.length > 0 ? Math.round(totalMs / results.length / 1000) : 0;

  console.log('\n');
  console.log('═'.repeat(110));
  console.log('  STRESS TEST SUMMARY');
  console.log('═'.repeat(110));
  console.log(
    `  Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Avg duration: ${avgSecs}s`,
  );
  console.log('─'.repeat(110));

  const colWidths = {
    idx:      4,
    status:   6,
    duration: 8,
    ats:      6,
    coverage: 10,
    sections: 9,
    events:   7,
    gaps:     5,
    label:    0, // fills remaining
  };

  const headerParts = [
    '#'.padEnd(colWidths.idx),
    'Status'.padEnd(colWidths.status),
    'Dur(s)'.padEnd(colWidths.duration),
    'ATS%'.padEnd(colWidths.ats),
    'Coverage%'.padEnd(colWidths.coverage),
    'Sections'.padEnd(colWidths.sections),
    'Events'.padEnd(colWidths.events),
    'Gaps'.padEnd(colWidths.gaps),
    'Profile',
  ];

  console.log('  ' + headerParts.join('  '));
  console.log('─'.repeat(110));

  for (const r of results) {
    const statusStr = r.status === 'pass' ? 'PASS' : 'FAIL';
    const durStr = Math.round(r.durationMs / 1000).toString();
    const atsStr = r.atsScore !== null ? r.atsScore.toString() : '—';
    const covStr = r.requirementCoverageScore !== null ? r.requirementCoverageScore.toString() : '—';
    const secStr = r.sectionsWritten !== null ? r.sectionsWritten.toString() : '—';
    const evStr = r.eventsReceived.toString();
    const gapStr = r.gapCoachingCardsApproved.toString();

    const rowParts = [
      r.profileIndex.toString().padEnd(colWidths.idx),
      statusStr.padEnd(colWidths.status),
      durStr.padEnd(colWidths.duration),
      atsStr.padEnd(colWidths.ats),
      covStr.padEnd(colWidths.coverage),
      secStr.padEnd(colWidths.sections),
      evStr.padEnd(colWidths.events),
      gapStr.padEnd(colWidths.gaps),
      r.label,
    ];

    console.log('  ' + rowParts.join('  '));

    if (r.error) {
      const truncated = r.error.length > 90 ? r.error.slice(0, 87) + '...' : r.error;
      console.log('    ERROR: ' + truncated);
    }
  }

  console.log('═'.repeat(110));

  // Per-result session IDs for debugging
  if (results.some((r) => r.sessionId)) {
    console.log('\n  Session IDs:');
    for (const r of results) {
      if (r.sessionId) {
        console.log(`    [${r.profileIndex}] ${r.sessionId} — ${r.label}`);
      }
    }
  }

  console.log('');
}

// ─── Pre-run cleanup ──────────────────────────────────────────────────────────

async function resetUsageLimit(token: string): Promise<void> {
  // Reset rate limits so multiple pipeline runs don't hit session caps
  try {
    await fetch(`${API_BASE}/admin/reset-rate-limits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    // Non-fatal — admin endpoint may not be available
  }
}

async function resetUserUsage(): Promise<void> {
  // Directly clear session usage via service key if available
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

    // Reset session usage count
    await fetch(`${supabaseUrl}/rest/v1/user_usage?user_id=eq.${testUserId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sessions_count: 0 }),
    });

    // Clear any stuck running/waiting pipelines
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { profileIndex, concurrency } = parseCLIArgs();

  const profilesToRun =
    profileIndex !== null
      ? [{ index: profileIndex, profile: STRESS_TEST_PROFILES[profileIndex]! }]
      : STRESS_TEST_PROFILES.map((profile, index) => ({ index, profile }));

  console.log('');
  console.log('Resume V2 Pipeline Stress Test Runner');
  console.log(`Profiles:    ${profilesToRun.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`API base:    ${API_BASE}`);
  console.log(`Timeout:     ${PIPELINE_TIMEOUT_MS / 60_000} minutes per pipeline`);
  console.log('');

  // ── Pre-flight: reset usage and stuck sessions ─────────────────────────
  await resetUserUsage();

  // ── Authenticate ───────────────────────────────────────────────────────
  let token: string;
  try {
    token = await authenticate();
  } catch (err: unknown) {
    console.error('Authentication failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  await resetUsageLimit(token);

  const wallStart = Date.now();

  // ── Run pipelines with concurrency control ────────────────────────────
  const results = await runWithSemaphore(token, profilesToRun, concurrency);

  const wallMs = Date.now() - wallStart;
  console.log(`\nAll pipelines finished. Wall time: ${Math.round(wallMs / 1000)}s`);

  // ── Print summary table ───────────────────────────────────────────────
  printSummaryTable(results);

  // Exit with non-zero code if any pipeline failed
  const anyFailed = results.some((r) => r.status === 'fail');
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('Unhandled error in stress test runner:', err);
  process.exit(1);
});
