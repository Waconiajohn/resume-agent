/**
 * Pre-test cleanup: resets user usage and clears stuck pipeline sessions
 * via direct Supabase REST API calls with the service role key.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_USER_ID = process.env.TEST_USER_ID || '5b756a7a-3e35-4465-bcf4-69d92f160f21';

function loadSupabaseConfig(): { url: string; serviceKey: string } {
  const envPath = resolve(process.cwd(), 'server/.env');
  const content = readFileSync(envPath, 'utf-8');
  const get = (key: string): string => {
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match?.[1]?.trim() ?? '';
  };
  return {
    url: get('SUPABASE_URL'),
    serviceKey: get('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

/**
 * Clean up test state before running the full pipeline E2E test.
 * - Resets the test user's session count to 0 (avoids "Monthly session limit reached")
 * - Marks any stuck `running` pipelines as `error` (avoids "Too many active pipelines")
 */
export async function cleanupBeforeTest(): Promise<void> {
  const { url, serviceKey } = loadSupabaseConfig();
  if (!url || !serviceKey) {
    throw new Error(
      '[cleanup] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env',
    );
  }

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  // 1. Reset session usage count to 0
  // eslint-disable-next-line no-console
  console.log('[cleanup] Resetting user_usage.sessions_count to 0...');
  const usageRes = await fetch(
    `${url}/rest/v1/user_usage?user_id=eq.${TEST_USER_ID}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sessions_count: 0 }),
    },
  );
  // eslint-disable-next-line no-console
  console.log(`[cleanup] user_usage reset: HTTP ${usageRes.status}`);

  // 2. Clear any stuck "running" pipelines for this user
  // eslint-disable-next-line no-console
  console.log('[cleanup] Clearing stuck running pipelines...');
  const pipelineRes = await fetch(
    `${url}/rest/v1/coach_sessions?user_id=eq.${TEST_USER_ID}&pipeline_status=eq.running`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        pipeline_status: 'error',
        pending_gate: null,
        pending_gate_data: null,
      }),
    },
  );
  // eslint-disable-next-line no-console
  console.log(`[cleanup] stuck pipelines cleared: HTTP ${pipelineRes.status}`);

  // 3. Reset in-memory SSE rate-limit state on the server
  // eslint-disable-next-line no-console
  console.log('[cleanup] Resetting SSE rate-limit state...');
  const rlRes = await fetch('http://localhost:3001/api/admin/reset-rate-limits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  // eslint-disable-next-line no-console
  console.log(`[cleanup] rate-limit reset: HTTP ${rlRes.status}`);

  // eslint-disable-next-line no-console
  console.log('[cleanup] Pre-test cleanup complete.');
}
