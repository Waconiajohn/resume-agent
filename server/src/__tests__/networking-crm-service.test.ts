/**
 * Networking CRM Service — Unit tests for processNewTouchpoint and computeNextFollowupDate.
 *
 * Sprint 63-6 — Auto Follow-Up Scheduling (Four-Touch Discipline).
 *
 * Business rules under test:
 *   - Touch 1  → next_followup_at = NOW + 4 days
 *   - Touch 2  → next_followup_at = NOW + 6 days,  relationship_strength → 2
 *   - Touch 3  → next_followup_at = NOW + 6 days,  no strength bump
 *   - Touch 4+ → next_followup_at = null,           relationship_strength → 3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.mock() is hoisted to the top of the file by Vitest's transform. Variables
// referenced inside the factory must also be hoisted with vi.hoisted().

const { mockFromFn, mockWarn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFromFn },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
  },
}));

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import { processNewTouchpoint } from '../lib/networking-crm-service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a sample touchpoint row as returned by Supabase. */
function makeTouchpointRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tp-test-1',
    user_id: 'user-abc',
    contact_id: 'contact-xyz',
    type: 'email',
    notes: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Builds a chainable Supabase query builder mock that resolves to `result`
 * when awaited (via `.then`).
 */
function chainable(result: unknown = { data: null, error: null, count: null }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'eq', 'single'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // `.single()` resolves to the final result.
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  // Make the chain itself thenable so `await chain` works.
  (chain as Record<string, unknown>).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

/**
 * Builds a count-query chain (head: true — SELECT count, no rows).
 * Resolves to `{ count, error: null }`.
 */
function countChainable(count: number | null) {
  const chain: Record<string, unknown> = {};
  ['select', 'eq'].forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
  (chain as Record<string, unknown>).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve({ count, error: null }).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

/**
 * Builds an update-query chain. Resolves to `{ data: null, error }`.
 * `onUpdate` is called with the payload passed to `.update()` so tests can
 * inspect what was written.
 */
function updateChainable(
  error: { message: string } | null = null,
  onUpdate?: (payload: Record<string, unknown>) => void,
) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    onUpdate?.(payload);
    return chain;
  });
  chain.eq = vi.fn().mockReturnValue(chain);
  (chain as Record<string, unknown>).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve({ data: null, error }).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

/**
 * Wires `mockFromFn` for a standard three-call sequence:
 *   call 1 — contact_touchpoints INSERT
 *   call 2 — contact_touchpoints SELECT count
 *   call 3 — networking_contacts UPDATE
 *
 * Returns the update chain so tests can inspect the captured payload.
 */
function setupStandardMocks({
  touchpointRow = makeTouchpointRow(),
  touchCount = 1,
  insertError = null,
  updateError = null,
  onUpdate,
}: {
  touchpointRow?: ReturnType<typeof makeTouchpointRow>;
  touchCount?: number | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  onUpdate?: (payload: Record<string, unknown>) => void;
} = {}) {
  const insert = chainable({ data: insertError ? null : touchpointRow, error: insertError });
  const count = countChainable(touchCount);
  const update = updateChainable(updateError, onUpdate);

  mockFromFn
    .mockReturnValueOnce(insert)
    .mockReturnValueOnce(count)
    .mockReturnValueOnce(update);

  return { insert, count, update };
}

// ─── computeNextFollowupDate (via processNewTouchpoint) ──────────────────────

describe('computeNextFollowupDate — follow-up date scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('touch 1 (totalTouchpoints = 1) → next_followup_at is ~4 days from now', async () => {
    const before = Date.now();
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: 1, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    expect(capturedUpdate).not.toBeNull();
    const next = capturedUpdate!.next_followup_at as string;
    expect(next).not.toBeNull();

    const parsedMs = new Date(next).getTime();
    expect(parsedMs).toBeGreaterThanOrEqual(before + 4 * DAY_MS);
    expect(parsedMs).toBeLessThanOrEqual(Date.now() + 4 * DAY_MS + 2000);
  });

  it('touch 2 (totalTouchpoints = 2) → next_followup_at is ~6 days from now', async () => {
    const before = Date.now();
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: 2, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'call' });

    const next = capturedUpdate!.next_followup_at as string;
    expect(next).not.toBeNull();

    const parsedMs = new Date(next).getTime();
    expect(parsedMs).toBeGreaterThanOrEqual(before + 6 * DAY_MS);
    expect(parsedMs).toBeLessThanOrEqual(Date.now() + 6 * DAY_MS + 2000);
  });

  it('touch 3 (totalTouchpoints = 3) → next_followup_at is ~6 days from now', async () => {
    const before = Date.now();
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: 3, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'meeting' });

    const next = capturedUpdate!.next_followup_at as string;
    expect(next).not.toBeNull();

    const parsedMs = new Date(next).getTime();
    expect(parsedMs).toBeGreaterThanOrEqual(before + 6 * DAY_MS);
    expect(parsedMs).toBeLessThanOrEqual(Date.now() + 6 * DAY_MS + 2000);
  });

  it('touch 4 (totalTouchpoints = 4) → next_followup_at is null (sequence complete)', async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: 4, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'inmail' });

    expect(capturedUpdate!.next_followup_at).toBeNull();
  });

  it('touch 7+ (totalTouchpoints = 7) → next_followup_at is null (beyond sequence)', async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: 7, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    expect(capturedUpdate!.next_followup_at).toBeNull();
  });

  it('edge case: touchCount = 0 (null count coerced) → treated as first touch (+4 days)', async () => {
    const before = Date.now();
    let capturedUpdate: Record<string, unknown> | null = null;
    // Supabase returns null count → service coerces to 0 → <=1 branch → +4 days
    setupStandardMocks({ touchCount: null, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    const next = capturedUpdate!.next_followup_at as string;
    expect(next).not.toBeNull();
    const parsedMs = new Date(next).getTime();
    expect(parsedMs).toBeGreaterThanOrEqual(before + 4 * DAY_MS);
    expect(parsedMs).toBeLessThanOrEqual(Date.now() + 4 * DAY_MS + 2000);
  });
});

// ─── processNewTouchpoint — DB writes ─────────────────────────────────────────

describe('processNewTouchpoint — DB write behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts touchpoint into contact_touchpoints with correct user/contact/type/notes fields', async () => {
    const { insert } = setupStandardMocks({ touchCount: 1 });

    await processNewTouchpoint({
      userId: 'user-abc',
      contactId: 'contact-xyz',
      type: 'call',
      notes: 'Discussed Q2 plans',
    });

    expect(mockFromFn).toHaveBeenNthCalledWith(1, 'contact_touchpoints');
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        contact_id: 'contact-xyz',
        type: 'call',
        notes: 'Discussed Q2 plans',
      }),
    );
  });

  it('updates networking_contacts with last_contact_date and next_followup_at', async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: 1, onUpdate: (p) => { capturedUpdate = p; } });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    expect(mockFromFn).toHaveBeenNthCalledWith(3, 'networking_contacts');
    expect(capturedUpdate).toHaveProperty('last_contact_date');
    expect(capturedUpdate).toHaveProperty('next_followup_at');
  });

  it('scopes the count query to both contact_id and user_id', async () => {
    const { count } = setupStandardMocks({ touchCount: 1 });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    expect(count.eq).toHaveBeenCalledWith('contact_id', 'contact-xyz');
    expect(count.eq).toHaveBeenCalledWith('user_id', 'user-abc');
  });

  it('returns the created touchpoint row', async () => {
    setupStandardMocks({
      touchpointRow: makeTouchpointRow({ id: 'tp-returned', type: 'call' }),
      touchCount: 1,
    });

    const result = await processNewTouchpoint({
      userId: 'user-abc',
      contactId: 'contact-xyz',
      type: 'call',
    });

    expect(result.touchpoint.id).toBe('tp-returned');
    expect(result.touchpoint.type).toBe('call');
  });

  it('stores null when notes is not provided', async () => {
    const { insert } = setupStandardMocks({ touchCount: 1 });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });
});

// ─── processNewTouchpoint — relationship_strength milestones ──────────────────

describe('processNewTouchpoint — relationship_strength milestones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Runs processNewTouchpoint with the given touch count and returns the update payload. */
  async function getContactUpdateForCount(count: number | null): Promise<Record<string, unknown>> {
    let capturedUpdate: Record<string, unknown> | null = null;
    setupStandardMocks({ touchCount: count, onUpdate: (p) => { capturedUpdate = p; } });
    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });
    return capturedUpdate!;
  }

  it('touch 1 → no relationship_strength in the contact update', async () => {
    const update = await getContactUpdateForCount(1);
    expect(update).not.toHaveProperty('relationship_strength');
  });

  it('touch 2 → relationship_strength bumped to 2', async () => {
    const update = await getContactUpdateForCount(2);
    expect(update.relationship_strength).toBe(2);
  });

  it('touch 3 → no relationship_strength bump (not a milestone)', async () => {
    const update = await getContactUpdateForCount(3);
    expect(update).not.toHaveProperty('relationship_strength');
  });

  it('touch 4 → relationship_strength bumped to 3', async () => {
    const update = await getContactUpdateForCount(4);
    expect(update.relationship_strength).toBe(3);
  });

  it('touch 5 → no relationship_strength bump (milestones are only at 2 and 4)', async () => {
    const update = await getContactUpdateForCount(5);
    expect(update).not.toHaveProperty('relationship_strength');
  });
});

// ─── processNewTouchpoint — error handling ────────────────────────────────────

describe('processNewTouchpoint — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the INSERT returns a Supabase error', async () => {
    const insert = chainable({ data: null, error: { message: 'insert failed' } });
    mockFromFn.mockReturnValueOnce(insert);

    await expect(
      processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' }),
    ).rejects.toThrow('insert failed');
  });

  it('throws when the INSERT returns no data and no error', async () => {
    const insert = chainable({ data: null, error: null });
    mockFromFn.mockReturnValueOnce(insert);

    await expect(
      processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' }),
    ).rejects.toThrow('Touchpoint insert returned no data');
  });

  it('contact UPDATE failure is non-fatal — still resolves with the touchpoint', async () => {
    setupStandardMocks({
      touchpointRow: makeTouchpointRow({ id: 'tp-ok' }),
      touchCount: 1,
      updateError: { message: 'contact update DB error' },
    });

    const result = await processNewTouchpoint({
      userId: 'user-abc',
      contactId: 'contact-xyz',
      type: 'email',
    });

    expect(result.touchpoint.id).toBe('tp-ok');
  });

  it('logs a warn (not error) when the contact UPDATE fails', async () => {
    setupStandardMocks({
      touchCount: 1,
      updateError: { message: 'DB down' },
    });

    await processNewTouchpoint({ userId: 'user-abc', contactId: 'contact-xyz', type: 'email' });

    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'DB down', contactId: 'contact-xyz' }),
      expect.stringContaining('non-fatal'),
    );
  });
});
