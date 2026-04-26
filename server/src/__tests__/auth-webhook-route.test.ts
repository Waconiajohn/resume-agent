/**
 * Tests for /api/auth/webhook — Supabase Auth Hook receiver.
 *
 * Standard Webhooks signature: HMAC-SHA256 over `${id}.${timestamp}.${body}`,
 * header `webhook-signature: v1,<base64>` (multiple sigs space-separated
 * for rotation). We synthesize a valid signature with a known secret to
 * exercise the verify+route logic end-to-end.
 *
 * Failure cases also verified: missing headers (400), invalid sig (401),
 * stale timestamp (400), unrecognized event (200 ignored), DB error (500),
 * AUTH_HOOK_SECRET unset (503).
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

import { Hono } from 'hono';
import { authWebhookRoutes } from '../routes/auth-webhook.js';

const app = new Hono();
app.route('/auth/webhook', authWebhookRoutes);

const TEST_SECRET_BASE64 = Buffer.from('super-secret-test-key-32-bytes-long!').toString('base64');
const TEST_SECRET = `v1,whsec_${TEST_SECRET_BASE64}`;

function buildInsertChain(error: { message: string; code?: string } | null = null) {
  return { insert: vi.fn().mockResolvedValue({ data: null, error }) };
}

function signPayload(secret: string, id: string, timestamp: string, body: string): string {
  const base64Secret = secret.startsWith('v1,whsec_') ? secret.slice('v1,whsec_'.length) : secret;
  const secretBytes = Buffer.from(base64Secret, 'base64');
  const sig = crypto.createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${sig}`;
}

async function postSigned(body: object, opts: { secret?: string; tsOffsetSec?: number; bodyOverride?: string; sigOverride?: string; idOverride?: string } = {}) {
  const id = opts.idOverride ?? 'msg_01HQXYZ';
  const timestamp = String(Math.floor(Date.now() / 1000) + (opts.tsOffsetSec ?? 0));
  const rawBody = opts.bodyOverride ?? JSON.stringify(body);
  const signature = opts.sigOverride
    ?? signPayload(opts.secret ?? TEST_SECRET, id, timestamp, rawBody);
  return app.request('/auth/webhook', {
    method: 'POST',
    headers: {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
      'content-type': 'application/json',
    },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  process.env.AUTH_HOOK_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.AUTH_HOOK_SECRET;
});

describe('POST /api/auth/webhook', () => {
  it('records signed_in_failed when password verification fails', async () => {
    const insert = buildInsertChain();
    mockFrom.mockReturnValueOnce(insert);

    const res = await postSigned({ user_id: 'user-1', valid: false });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ recorded: true, event_type: 'signed_in_failed' });
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        event_type: 'signed_in_failed',
        ip_address: null,
        user_agent: null,
      }),
    );
  });

  it('records mfa_challenge_failed when MFA verification fails', async () => {
    const insert = buildInsertChain();
    mockFrom.mockReturnValueOnce(insert);

    const res = await postSigned({ user_id: 'user-1', valid: false, factor_type: 'totp', factor_id: 'f1' });
    expect(res.status).toBe(200);
    expect((await res.json()).event_type).toBe('mfa_challenge_failed');
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'mfa_challenge_failed',
        metadata: expect.objectContaining({ factor_type: 'totp', factor_id: 'f1' }),
      }),
    );
  });

  it('ignores successful attempts (frontend already records them)', async () => {
    const res = await postSigned({ user_id: 'user-1', valid: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 401 on a forged signature', async () => {
    const res = await postSigned({ user_id: 'user-1', valid: false }, { sigOverride: 'v1,definitely-wrong' });
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 400 when the timestamp is stale (> 5 min)', async () => {
    const res = await postSigned({ user_id: 'user-1', valid: false }, { tsOffsetSec: -10 * 60 });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 400 when required headers are missing', async () => {
    const res = await app.request('/auth/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 'u', valid: false }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 503 when AUTH_HOOK_SECRET is not configured', async () => {
    delete process.env.AUTH_HOOK_SECRET;
    const res = await postSigned({ user_id: 'u', valid: false });
    expect(res.status).toBe(503);
  });

  it('verifies signature against the raw body, not a re-stringified body', async () => {
    // Build a body whose JSON.stringify form differs in whitespace from
    // the signed canonical form. The verify path must use rawBody.
    const insert = buildInsertChain();
    mockFrom.mockReturnValueOnce(insert);

    const rawBody = '{"user_id":"u-spaced",  "valid": false}';
    const id = 'msg_ws';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(TEST_SECRET, id, timestamp, rawBody);

    const res = await app.request('/auth/webhook', {
      method: 'POST',
      headers: {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
        'content-type': 'application/json',
      },
      body: rawBody,
    });
    expect(res.status).toBe(200);
    expect(insert.insert).toHaveBeenCalled();
  });

  it('returns 500 (so Supabase retries) when the DB insert fails', async () => {
    mockFrom.mockReturnValueOnce(buildInsertChain({ message: 'db down', code: 'PGRST500' }));
    const res = await postSigned({ user_id: 'u', valid: false });
    expect(res.status).toBe(500);
  });

  it('accepts multiple signatures separated by space (secret rotation)', async () => {
    const insert = buildInsertChain();
    mockFrom.mockReturnValueOnce(insert);

    const id = 'msg_rotate';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ user_id: 'u-rot', valid: false });
    const goodSig = signPayload(TEST_SECRET, id, timestamp, rawBody);

    const res = await app.request('/auth/webhook', {
      method: 'POST',
      headers: {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        // Stale rotated-out secret first; current one second.
        'webhook-signature': `v1,oldwrongsig ${goodSig}`,
        'content-type': 'application/json',
      },
      body: rawBody,
    });
    expect(res.status).toBe(200);
    expect(insert.insert).toHaveBeenCalled();
  });
});
