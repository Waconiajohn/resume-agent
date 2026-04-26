/**
 * Auth Hook receiver — POST /api/auth/webhook
 *
 * Sprint B (auth hardening). Receives Standard-Webhooks-signed events
 * from Supabase Auth Hooks (Password Verification, MFA Verification)
 * and writes the FAILURE cases into auth_audit_log.
 *
 * Successful sign-ins and MFA passes are already captured client-side
 * by AuthEventEmitter / MfaChallengeGate. The only events the
 * frontend can't see are the failures — someone trying to brute-force
 * a password, or someone passing the password but failing TOTP — and
 * those are exactly what an executive-product audit log needs.
 *
 * The route is public (no authMiddleware). Authentication is the
 * Standard Webhooks HMAC signature: if the signature doesn't verify
 * against AUTH_HOOK_SECRET, we return 401 and never write to the log.
 *
 * Wiring (one-time, in the Supabase dashboard):
 *   Authentication → Hooks → "Send Auth Hook" → set the URL to
 *   https://<server>/api/auth/webhook and copy the signing secret
 *   into the AUTH_HOOK_SECRET env var on the Hono server.
 *   Enable the Password Verification and MFA Verification hooks.
 */

import { Hono } from 'hono';
import crypto from 'node:crypto';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

export const authWebhookRoutes = new Hono();

// Tolerate up to 5 min of clock skew on the webhook timestamp.
const TIMESTAMP_TOLERANCE_S = 5 * 60;
// Body cap — auth hook payloads are tiny; anything bigger is suspicious.
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Verifies a Standard Webhooks signature header.
 *
 * The header looks like "v1,<base64sig> v1,<base64sig2>" — multiple
 * signatures are space-separated to support secret rotation. We accept
 * if any of them matches.
 *
 * The signed payload is `${id}.${timestamp}.${body}`, HMAC-SHA256 with
 * the secret bytes. Supabase secrets ship as `v1,whsec_<base64>`; we
 * accept either the prefixed form or the bare base64.
 */
function verifySignature(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const base64Secret = secret.startsWith('v1,whsec_')
    ? secret.slice('v1,whsec_'.length)
    : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(base64Secret, 'base64');
  } catch {
    return false;
  }
  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signed)
    .digest('base64');
  const candidates = signatureHeader.split(' ')
    .map((s) => (s.startsWith('v1,') ? s.slice(3) : null))
    .filter((s): s is string => !!s);
  // timingSafeEqual requires equal-length buffers; gate on length first.
  return candidates.some((c) => {
    const candidateBuf = Buffer.from(c);
    const expectedBuf = Buffer.from(expected);
    return candidateBuf.length === expectedBuf.length
      && crypto.timingSafeEqual(candidateBuf, expectedBuf);
  });
}

interface PasswordVerificationPayload {
  user_id: string;
  valid: boolean;
}

interface MfaVerificationPayload {
  user_id: string;
  factor_id?: string;
  factor_type?: string;
  valid: boolean;
}

interface HookEnvelope {
  type?: string;
  user_id?: string;
  valid?: boolean;
  factor_id?: string;
  factor_type?: string;
  // Allow other fields without losing them in the metadata roll-up.
  [key: string]: unknown;
}

/**
 * Maps the parsed payload to an audit-log event_type. Returns null if
 * the event isn't one we record (success cases, unknown types).
 */
function mapToEventType(payload: HookEnvelope): 'signed_in_failed' | 'mfa_challenge_failed' | null {
  if (typeof payload.valid !== 'boolean' || payload.valid === true) {
    return null;
  }
  // The hook's `type` field discriminates; fall back to the presence
  // of factor_type for older payload shapes.
  const isMfa = payload.factor_type === 'totp'
    || payload.factor_type === 'webauthn'
    || (typeof payload.type === 'string' && payload.type.includes('mfa'));
  if (isMfa) return 'mfa_challenge_failed';
  return 'signed_in_failed';
}

authWebhookRoutes.post('/', rateLimitMiddleware(600, 60_000), async (c) => {
  const secret = process.env.AUTH_HOOK_SECRET;
  if (!secret) {
    logger.warn('auth-webhook: AUTH_HOOK_SECRET not configured — rejecting');
    return c.json({ error: 'Webhook receiver not configured' }, 503);
  }

  const id = c.req.header('webhook-id');
  const timestamp = c.req.header('webhook-timestamp');
  const signature = c.req.header('webhook-signature');
  if (!id || !timestamp || !signature) {
    return c.json({ error: 'Missing webhook headers' }, 400);
  }

  // Reject stale or future-dated requests — limits replay window.
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return c.json({ error: 'Invalid webhook-timestamp' }, 400);
  }
  const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (skewSeconds > TIMESTAMP_TOLERANCE_S) {
    return c.json({ error: 'Webhook timestamp out of tolerance' }, 400);
  }

  // We need the raw body for signature verification — decode the
  // request stream once, cap the size to prevent memory abuse.
  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, 'auth-webhook: failed to read body');
    return c.json({ error: 'Failed to read body' }, 400);
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return c.json({ error: 'Body too large' }, 413);
  }

  if (!verifySignature(secret, id, timestamp, rawBody, signature)) {
    logger.warn({ id }, 'auth-webhook: signature verification failed');
    return c.json({ error: 'Signature verification failed' }, 401);
  }

  let payload: HookEnvelope;
  try {
    payload = JSON.parse(rawBody) as HookEnvelope;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const eventType = mapToEventType(payload);
  if (!eventType) {
    // Unrecognized event or successful attempt — ack but don't log.
    return c.json({ ignored: true });
  }
  if (typeof payload.user_id !== 'string') {
    // Some hook variants don't carry a user_id (e.g. anonymous attempts).
    // Log a warning so we know the audit gap exists; don't surface 400
    // to Supabase since retrying won't help.
    logger.warn({ id, eventType }, 'auth-webhook: payload missing user_id; skipping insert');
    return c.json({ ignored: true });
  }

  const metadata: Record<string, unknown> = {};
  if (payload.factor_type) metadata.factor_type = payload.factor_type;
  if (payload.factor_id) metadata.factor_id = payload.factor_id;
  if (payload.type) metadata.hook_type = payload.type;

  // The user-agent and IP captured here belong to Supabase's Auth
  // service, not the end user — we leave them null since they'd be
  // misleading. The metadata.factor_type / factor_id is sufficient for
  // correlation.
  const { error } = await supabaseAdmin.from('auth_audit_log').insert({
    user_id: payload.user_id,
    event_type: eventType,
    ip_address: null,
    user_agent: null,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  });

  if (error) {
    logger.error(
      { source: 'auth_audit_log', code: error.code, message: error.message, eventType },
      'auth-webhook: insert failed',
    );
    // Return 500 so Supabase will retry per Standard Webhooks semantics.
    return c.json({ error: 'Failed to record event' }, 500);
  }

  return c.json({ recorded: true, event_type: eventType });
});
