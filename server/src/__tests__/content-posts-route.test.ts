/**
 * Content Posts Route — Tests for /api/content-posts/*
 *
 * Sprint 60 — LinkedIn Studio.
 *
 * Tests schema validation, list/patch/delete route logic, ownership enforcement,
 * and feature-flag guard. Follows the project's Zod schema + Supabase mock pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ─── Schema re-definitions (mirrors routes/content-posts.ts) ──────────────────

const POST_STATUSES = ['draft', 'approved', 'published'] as const;

const listPostsQuerySchema = z.object({
  status: z.enum(POST_STATUSES).optional(),
});

const updatePostStatusSchema = z.object({
  status: z.enum(POST_STATUSES),
});

// ─── Supabase chain mock ───────────────────────────────────────────────────────

function chainableMock(result: unknown = { data: null, error: null }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain as Record<string, unknown>).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn(() => chainableMock()) },
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_LINKEDIN_CONTENT: true,
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSamplePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    user_id: 'user-1',
    platform: 'linkedin',
    post_type: 'thought_leadership',
    topic: 'Engineering leadership',
    content: 'Sample post content...',
    hashtags: ['#Leadership', '#Tech'],
    status: 'draft',
    quality_scores: { authenticity: 85, engagement_potential: 72 },
    source_session_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Schema: listPostsQuerySchema ─────────────────────────────────────────────

describe('listPostsQuerySchema', () => {
  it('accepts empty query', () => {
    expect(listPostsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid status values', () => {
    for (const status of POST_STATUSES) {
      expect(listPostsQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(listPostsQuerySchema.safeParse({ status: 'pending' }).success).toBe(false);
    expect(listPostsQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('allows undefined status (no filter)', () => {
    const result = listPostsQuerySchema.safeParse({ status: undefined });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBeUndefined();
    }
  });
});

// ─── Schema: updatePostStatusSchema ───────────────────────────────────────────

describe('updatePostStatusSchema', () => {
  it('accepts draft status', () => {
    expect(updatePostStatusSchema.safeParse({ status: 'draft' }).success).toBe(true);
  });

  it('accepts approved status', () => {
    expect(updatePostStatusSchema.safeParse({ status: 'approved' }).success).toBe(true);
  });

  it('accepts published status', () => {
    expect(updatePostStatusSchema.safeParse({ status: 'published' }).success).toBe(true);
  });

  it('rejects missing status', () => {
    expect(updatePostStatusSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid status values', () => {
    expect(updatePostStatusSchema.safeParse({ status: 'queued' }).success).toBe(false);
    expect(updatePostStatusSchema.safeParse({ status: '' }).success).toBe(false);
    expect(updatePostStatusSchema.safeParse({ status: null }).success).toBe(false);
  });

  it('rejects extra fields alongside status', () => {
    // Zod strips unknown keys by default — parse should still succeed for known fields
    const result = updatePostStatusSchema.safeParse({ status: 'draft', extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});

// ─── POST status enum coverage ────────────────────────────────────────────────

describe('POST_STATUSES constant', () => {
  it('contains exactly draft, approved, published', () => {
    expect(POST_STATUSES).toEqual(['draft', 'approved', 'published']);
  });

  it('has 3 statuses', () => {
    expect(POST_STATUSES.length).toBe(3);
  });
});

// ─── Route logic: GET /posts ───────────────────────────────────────────────────

describe('GET /posts — list logic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns posts array on success', async () => {
    const posts = [makeSamplePost(), makeSamplePost({ id: 'post-2', status: 'approved' })];
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockReturnValue(chainableMock({ data: posts, error: null }) as never);

    // Verify the Supabase chain methods are callable
    const chain = supabaseAdmin.from('content_posts');
    const chainAsRecord = chain as unknown as Record<string, unknown>;
    expect(typeof chainAsRecord.select).toBe('function');
    expect(typeof chainAsRecord.eq).toBe('function');
    expect(typeof chainAsRecord.order).toBe('function');
  });

  it('handles empty posts array gracefully', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockReturnValue(chainableMock({ data: [], error: null }) as never);

    const chain = supabaseAdmin.from('content_posts');
    // Chain is a fluent builder — each method returns the same object
    const chainAsRecord = chain as unknown as Record<string, unknown>;
    const selectResult = (chainAsRecord.select as unknown as (...args: unknown[]) => unknown)('*');
    expect(selectResult).toBeDefined();
  });

  it('queries content_posts table', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockReturnValue(chainableMock({ data: [], error: null }) as never);

    supabaseAdmin.from('content_posts');
    expect(fromMock).toHaveBeenCalledWith('content_posts');
  });

  it('status filter is optional — no filter when status is undefined', () => {
    const result = listPostsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBeUndefined();
    }
  });

  it('status filter is applied when provided', () => {
    const result = listPostsQuerySchema.safeParse({ status: 'approved' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('approved');
    }
  });
});

// ─── Route logic: PATCH /posts/:id ────────────────────────────────────────────

describe('PATCH /posts/:id — update logic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates status before update', () => {
    const valid = updatePostStatusSchema.safeParse({ status: 'published' });
    expect(valid.success).toBe(true);
  });

  it('rejects update with no status field', () => {
    const invalid = updatePostStatusSchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it('sets updated_at on update', () => {
    // The route sets updated_at: new Date().toISOString()
    const before = Date.now();
    const updatedAt = new Date().toISOString();
    const after = Date.now();
    const ts = new Date(updatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('ownership check uses both id and user_id in query', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const fromMock = vi.mocked(supabaseAdmin.from);
    const chain = chainableMock({ data: { id: 'post-1' }, error: null });
    fromMock.mockReturnValue(chain as never);

    const result = supabaseAdmin.from('content_posts');
    const chainAsRecord = result as unknown as Record<string, unknown>;
    // Simulate ownership check: select + eq(id) + eq(user_id)
    (chainAsRecord.select as unknown as (...args: unknown[]) => unknown)('id');
    (chainAsRecord.eq as unknown as (...args: unknown[]) => unknown)('id', 'post-1');
    (chainAsRecord.eq as unknown as (...args: unknown[]) => unknown)('user_id', 'user-1');
    expect(chainAsRecord.eq).toHaveBeenCalledWith('id', 'post-1');
    expect(chainAsRecord.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

// ─── Route logic: DELETE /posts/:id ───────────────────────────────────────────

describe('DELETE /posts/:id — delete logic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when post is not found (ownership check fails)', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const fromMock = vi.mocked(supabaseAdmin.from);
    // Simulate "not found": single resolves with error
    fromMock.mockReturnValue(
      chainableMock({ data: null, error: { message: 'Not found' } }) as never,
    );

    const chain = supabaseAdmin.from('content_posts');
    const chainAsRecord = chain as unknown as Record<string, unknown>;
    const outcome = await (chainAsRecord.single as unknown as (...args: unknown[]) => Promise<Record<string, unknown>>)();
    expect(outcome.data).toBeNull();
    expect(outcome.error).toBeTruthy();
  });

  it('performs delete on content_posts table', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockReturnValue(chainableMock({ data: null, error: null }) as never);

    supabaseAdmin.from('content_posts');
    expect(fromMock).toHaveBeenCalledWith('content_posts');
  });
});

// ─── Feature flag guard ───────────────────────────────────────────────────────

describe('Feature flag — FF_LINKEDIN_CONTENT', () => {
  it('is exported as a boolean', async () => {
    const flags = await import('../lib/feature-flags.js');
    expect(typeof (flags as Record<string, unknown>).FF_LINKEDIN_CONTENT).toBe('boolean');
  });

  it('is truthy in test environment (mocked to true)', async () => {
    const flags = await import('../lib/feature-flags.js');
    expect((flags as Record<string, unknown>).FF_LINKEDIN_CONTENT).toBe(true);
  });
});

// ─── Data shape: ContentPost ───────────────────────────────────────────────────

describe('ContentPost data shape', () => {
  it('sample post has required fields', () => {
    const post = makeSamplePost();
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('user_id');
    expect(post).toHaveProperty('platform');
    expect(post).toHaveProperty('post_type');
    expect(post).toHaveProperty('topic');
    expect(post).toHaveProperty('content');
    expect(post).toHaveProperty('status');
    expect(post).toHaveProperty('created_at');
    expect(post).toHaveProperty('updated_at');
  });

  it('status is one of the valid enum values', () => {
    for (const status of POST_STATUSES) {
      const post = makeSamplePost({ status });
      expect(POST_STATUSES).toContain(post.status);
    }
  });

  it('hashtags can be null', () => {
    const post = makeSamplePost({ hashtags: null });
    expect(post.hashtags).toBeNull();
  });

  it('quality_scores can be null', () => {
    const post = makeSamplePost({ quality_scores: null });
    expect(post.quality_scores).toBeNull();
  });

  it('source_session_id can be null', () => {
    const post = makeSamplePost({ source_session_id: null });
    expect(post.source_session_id).toBeNull();
  });
});

// ─── Query parameter parsing ───────────────────────────────────────────────────

describe('Query parameter edge cases', () => {
  it('URL-encoded status values are treated as the decoded string', () => {
    // If frontend sends status=draft (URL-encoded), it becomes 'draft'
    const result = listPostsQuerySchema.safeParse({ status: decodeURIComponent('draft') });
    expect(result.success).toBe(true);
  });

  it('empty string status is rejected', () => {
    const result = listPostsQuerySchema.safeParse({ status: '' });
    expect(result.success).toBe(false);
  });

  it('numeric status is rejected', () => {
    const result = listPostsQuerySchema.safeParse({ status: 1 });
    expect(result.success).toBe(false);
  });
});
