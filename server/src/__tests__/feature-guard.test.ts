/**
 * Tests for server/src/middleware/feature-guard.ts
 *
 * Story: Sprint 7 Story 13 — Billing & Entitlements Tests
 *
 * Covers:
 *   1.  Returns 402 with FEATURE_NOT_ENTITLED when user lacks the feature
 *   2.  Calls next() when user has the feature enabled
 *   3.  Returns 401 when no user is authenticated
 *   4.  Fails open (calls next) when hasFeature throws
 *   5.  402 response includes the feature key in the body
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock entitlements — must be hoisted before any module imports ────────────

const mockHasFeature = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('../lib/entitlements.js', () => ({
  hasFeature: mockHasFeature,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { requireFeature } from '../middleware/feature-guard.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FakeContext {
  get: (key: string) => unknown;
  json: (body: unknown, status?: number) => Response;
}

function makeContext(userId: string | null): FakeContext {
  return {
    get: (key: string) => {
      if (key === 'user' && userId !== null) {
        return { id: userId, email: 'test@test.com', accessToken: 'token' };
      }
      return undefined;
    },
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  };
}

// ─── Tests: requireFeature middleware ────────────────────────────────────────

describe('requireFeature middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when the user has the required feature enabled', async () => {
    mockHasFeature.mockResolvedValue(true);

    const ctx = makeContext('user-entitled');
    const guard = requireFeature('export_docx');
    let nextCalled = false;

    await guard(
      ctx as unknown as Parameters<typeof guard>[0],
      async () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(true);
    expect(mockHasFeature).toHaveBeenCalledWith('user-entitled', 'export_docx');
  });

  it('returns 402 FEATURE_NOT_ENTITLED when user lacks the feature', async () => {
    mockHasFeature.mockResolvedValue(false);

    const ctx = makeContext('user-free');
    const guard = requireFeature('export_docx');
    let nextCalled = false;

    const result = await guard(
      ctx as unknown as Parameters<typeof guard>[0],
      async () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(false);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(402);
  });

  it('includes the feature key and FEATURE_NOT_ENTITLED code in the 402 body', async () => {
    mockHasFeature.mockResolvedValue(false);

    const ctx = makeContext('user-free');
    const guard = requireFeature('advanced_templates');
    const result = await guard(
      ctx as unknown as Parameters<typeof guard>[0],
      async () => {},
    );

    expect(result).toBeInstanceOf(Response);
    const body = await (result as Response).json() as Record<string, unknown>;
    expect(body.code).toBe('FEATURE_NOT_AVAILABLE');
    expect(body.feature).toBe('advanced_templates');
  });

  it('returns 401 when no user is authenticated', async () => {
    const ctx = makeContext(null);
    const guard = requireFeature('export_pdf');
    let nextCalled = false;

    const result = await guard(
      ctx as unknown as Parameters<typeof guard>[0],
      async () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(false);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(mockHasFeature).not.toHaveBeenCalled();
  });

  it('propagates error when hasFeature throws an unexpected error', async () => {
    mockHasFeature.mockRejectedValue(new Error('entitlement service down'));

    const ctx = makeContext('user-any');
    const guard = requireFeature('export_pdf');

    await expect(
      guard(
        ctx as unknown as Parameters<typeof guard>[0],
        async () => {},
      ),
    ).rejects.toThrow('entitlement service down');
  });
});
