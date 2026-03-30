// @vitest-environment jsdom
/**
 * useContentPosts hook — unit tests.
 *
 * Sprint 60 — LinkedIn Studio.
 * Tests: initial state, fetchPosts, updatePostStatus, deletePost,
 * auth header handling, and error states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

// ─── Hoisted mock helpers ─────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  }),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { useContentPosts, type ContentPost } from '../useContentPosts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePost(overrides: Partial<ContentPost> = {}): ContentPost {
  return {
    id: 'post-1',
    user_id: 'user-1',
    platform: 'linkedin',
    post_type: 'thought_leadership',
    topic: 'Engineering leadership',
    content: 'This is a sample post about leadership in engineering...',
    hashtags: ['#Leadership', '#Engineering'],
    status: 'draft',
    quality_scores: { authenticity: 85, engagement_potential: 72 },
    source_session_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('useContentPosts — initial state', () => {
  it('starts with empty posts array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('auto-fetches posts on mount', async () => {
    const posts = [makePost()];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    expect(result.current.posts).toHaveLength(1);
  });
});

// ─── fetchPosts ───────────────────────────────────────────────────────────────

describe('useContentPosts — fetchPosts', () => {
  it('sets loading = true during fetch', async () => {
    let resolveResponse: (v: Response) => void;
    const fetchPromise = new Promise<Response>((res) => { resolveResponse = res; });
    vi.mocked(fetch).mockReturnValueOnce(fetchPromise);

    const { result } = renderHook(() => useContentPosts());

    // Initially loading from auto-fetch
    expect(result.current.loading).toBe(true);

    act(() => {
      resolveResponse!(new Response(JSON.stringify({ posts: [] }), { status: 200 }));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('fetches posts without status filter by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toBe('http://localhost:3001/api/content-posts/posts');
  });

  it('includes status in URL when filtering', async () => {
    // First call: auto-fetch on mount
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );
    // Second call: filter fetch
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchPosts('approved');
    });

    const url = (vi.mocked(fetch).mock.calls[1][0] as string);
    expect(url).toContain('status=approved');
  });

  it('populates posts array on success', async () => {
    const posts = [makePost(), makePost({ id: 'post-2', status: 'approved' })];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.posts).toHaveLength(2));
  });

  it('drops malformed fetched posts instead of storing invalid entries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          posts: [
            makePost(),
            { id: 'broken-post' },
            {
              ...makePost({ id: 'post-2' }),
              hashtags: ['#Valid', 42, '  '],
              quality_scores: { authenticity: '91', engagement_potential: '80' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toHaveLength(2);
    expect(result.current.posts[1].hashtags).toEqual(['#Valid']);
    expect(result.current.posts[1].quality_scores).toEqual({
      authenticity: 91,
      engagement_potential: 80,
    });
  });

  it('sets error on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('401');
  });

  it('sets error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
  });

  it('sets error when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useContentPosts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Not authenticated');
  });

  it('clears stale posts when auth is lost on a later fetch', async () => {
    const posts = [makePost()];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    await act(async () => {
      await result.current.fetchPosts();
    });

    expect(result.current.posts).toEqual([]);
    expect(result.current.error).toBe('Not authenticated');
  });

  it('clears stale posts when the feature is disabled', async () => {
    const posts = [makePost()];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ feature_disabled: true }), { status: 200 }),
    );

    await act(async () => {
      await result.current.fetchPosts();
    });

    expect(result.current.posts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sends Authorization header with token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const init = callArgs[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });
});

// ─── updatePostStatus ─────────────────────────────────────────────────────────

describe('useContentPosts — updatePostStatus', () => {
  it('returns true on success and updates local state', async () => {
    const initialPost = makePost({ status: 'draft' });
    const updatedPost = makePost({ status: 'approved' });

    // Auto-fetch returns initial post
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [initialPost] }), { status: 200 }),
    );
    // PATCH call returns updated post
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ post: updatedPost }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.updatePostStatus('post-1', 'approved');
    });

    expect(success).toBe(true);
    expect(result.current.posts[0].status).toBe('approved');
  });

  it('returns false when not authenticated', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set the Once mock AFTER the auto-fetch has completed so it applies
    // to the updatePostStatus getAuthHeader call, not the mount fetch.
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.updatePostStatus('post-1', 'approved');
    });

    expect(success).toBe(false);
  });

  it('returns false on non-OK PATCH response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.updatePostStatus('post-1', 'approved');
    });

    expect(success).toBe(false);
  });

  it('returns false and preserves local state when PATCH returns a malformed post', async () => {
    const initialPost = makePost({ status: 'draft' });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [initialPost] }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ post: { id: 'post-1' } }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.updatePostStatus('post-1', 'approved');
    });

    expect(success).toBe(false);
    expect(result.current.posts[0].status).toBe('draft');
  });

  it('sends PATCH method with JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ post: makePost({ status: 'published' }) }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePostStatus('post-1', 'published');
    });

    const patchCall = vi.mocked(fetch).mock.calls[1];
    const init = patchCall[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'published' });
  });

  it('does not update other posts in local state', async () => {
    const post1 = makePost({ id: 'post-1', status: 'draft' });
    const post2 = makePost({ id: 'post-2', status: 'draft' });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [post1, post2] }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ post: { ...post1, status: 'approved' } }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(2));

    await act(async () => {
      await result.current.updatePostStatus('post-1', 'approved');
    });

    expect(result.current.posts.find((p) => p.id === 'post-1')?.status).toBe('approved');
    expect(result.current.posts.find((p) => p.id === 'post-2')?.status).toBe('draft');
  });
});

// ─── deletePost ───────────────────────────────────────────────────────────────

describe('useContentPosts — deletePost', () => {
  it('returns true on success and removes post from local state', async () => {
    const posts = [makePost({ id: 'post-1' }), makePost({ id: 'post-2' })];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(2));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deletePost('post-1');
    });

    expect(success).toBe(true);
    expect(result.current.posts).toHaveLength(1);
    expect(result.current.posts[0].id).toBe('post-2');
  });

  it('returns false when not authenticated', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set the Once mock AFTER the auto-fetch has completed so it applies
    // to the deletePost getAuthHeader call, not the mount fetch.
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deletePost('post-1');
    });

    expect(success).toBe(false);
  });

  it('returns false on non-OK DELETE response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deletePost('post-1');
    });

    expect(success).toBe(false);
  });

  it('sends DELETE method', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deletePost('post-1');
    });

    const deleteCall = vi.mocked(fetch).mock.calls[1];
    const init = deleteCall[1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });

  it('returns false on network error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [] }), { status: 200 }),
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useContentPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deletePost('post-1');
    });

    expect(success).toBe(false);
  });
});
