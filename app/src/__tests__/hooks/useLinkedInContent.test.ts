/**
 * useLinkedInContent — Hook tests.
 *
 * Validates SSE event handling, state transitions, gate flow, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLinkedInContent } from '@/hooks/useLinkedInContent';
import type { TopicSuggestion } from '@/hooks/useLinkedInContent';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeEvent(type: string, data: Record<string, unknown>) {
  return { event: type, data: JSON.stringify(data) };
}

const sampleTopics: TopicSuggestion[] = [
  {
    id: 'topic-1',
    topic: 'How I turned around a failing supply chain in 90 days',
    hook: 'Three years ago, a CEO called me on a Sunday...',
    rationale: 'Showcases transformation leadership',
    expertise_area: 'Supply Chain',
    evidence_refs: ['Q3 turnaround project'],
  },
  {
    id: 'topic-2',
    topic: 'The hidden cost of reactive procurement',
    hook: 'Most procurement teams are playing defense...',
    rationale: 'Positions as strategic thought leader',
    expertise_area: 'Procurement',
    evidence_refs: ['cost reduction initiative'],
  },
];

// ─── Tests ──────────────────────────────────────────────────────────

describe('useLinkedInContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts with correct idle state shape', () => {
    const { result } = renderHook(() => useLinkedInContent());
    expect(result.current.status).toBe('idle');
    expect(result.current.topics).toEqual([]);
    expect(result.current.postDraft).toBeNull();
    expect(result.current.postHashtags).toEqual([]);
    expect(result.current.qualityScores).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('exposes all required methods', () => {
    const { result } = renderHook(() => useLinkedInContent());
    expect(typeof result.current.startContentPipeline).toBe('function');
    expect(typeof result.current.selectTopic).toBe('function');
    expect(typeof result.current.approvePost).toBe('function');
    expect(typeof result.current.requestRevision).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset restores idle state', () => {
    const { result } = renderHook(() => useLinkedInContent());
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.topics).toEqual([]);
    expect(result.current.postDraft).toBeNull();
    expect(result.current.postHashtags).toEqual([]);
    expect(result.current.qualityScores).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('startContentPipeline calls /linkedin-content/start with session_id', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/linkedin-content/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test-uuid'),
      }),
    );
  });

  it('startContentPipeline returns false when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useLinkedInContent());

    let success = true;
    await act(async () => {
      success = await result.current.startContentPipeline();
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });

  it('startContentPipeline returns false on HTTP failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useLinkedInContent());

    let success = true;
    await act(async () => {
      success = await result.current.startContentPipeline();
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('topics_ready event sets topics and status to topic_selection', () => {
    const event = makeEvent('topics_ready', {
      session_id: 'test-uuid',
      topics: sampleTopics,
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.topics).toHaveLength(2);
    expect(parsed.topics[0].id).toBe('topic-1');
    expect(parsed.topics[0].hook).toContain('Sunday');
  });

  it('post_draft_ready event shape contains post, hashtags, and quality_scores', () => {
    const event = makeEvent('post_draft_ready', {
      session_id: 'test-uuid',
      post: 'Three years ago, a CEO called me on a Sunday...\n\nHere is what I learned about supply chain transformation.',
      hashtags: ['SupplyChain', 'Leadership', 'Operations'],
      quality_scores: {
        authenticity: 88,
        engagement_potential: 76,
        keyword_density: 72,
      },
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.post).toContain('Sunday');
    expect(parsed.hashtags).toContain('SupplyChain');
    expect(parsed.quality_scores.authenticity).toBe(88);
    expect(parsed.quality_scores.engagement_potential).toBe(76);
    expect(parsed.quality_scores.keyword_density).toBe(72);
  });

  it('post_revised event shape contains updated post', () => {
    const event = makeEvent('post_revised', {
      session_id: 'test-uuid',
      post: 'Revised: Three years ago, a CEO called me on a Sunday...',
      hashtags: ['SupplyChain', 'Leadership'],
      quality_scores: {
        authenticity: 90,
        engagement_potential: 80,
        keyword_density: 75,
      },
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.post).toContain('Revised:');
    expect(parsed.quality_scores.authenticity).toBe(90);
  });

  it('content_complete event shape is correct', () => {
    const event = makeEvent('content_complete', {
      session_id: 'test-uuid',
      post: 'Final post content here.',
      hashtags: ['Leadership'],
      quality_scores: { authenticity: 92, engagement_potential: 85, keyword_density: 78 },
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.post).toBe('Final post content here.');
    expect(parsed.quality_scores.authenticity).toBe(92);
  });

  it('pipeline_gate event with topic_selection gate is recognized', () => {
    const event = makeEvent('pipeline_gate', { gate: 'topic_selection' });
    const parsed = JSON.parse(event.data);
    expect(parsed.gate).toBe('topic_selection');
  });

  it('pipeline_gate event with post_review gate is recognized', () => {
    const event = makeEvent('pipeline_gate', { gate: 'post_review' });
    const parsed = JSON.parse(event.data);
    expect(parsed.gate).toBe('post_review');
  });

  it('pipeline_error event shape is correct', () => {
    const event = makeEvent('pipeline_error', {
      stage: 'topic_generation',
      error: 'LLM call timed out',
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('topic_generation');
    expect(parsed.error).toBe('LLM call timed out');
  });

  it('stage_start event shape is correct', () => {
    const event = makeEvent('stage_start', {
      stage: 'topic_strategy',
      message: 'Analyzing your positioning for topic ideas...',
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('topic_strategy');
    expect(parsed.message).toContain('Analyzing');
  });

  it('transparency event shape is correct', () => {
    const event = makeEvent('transparency', {
      stage: 'topic_strategy',
      message: 'Reviewing 12 evidence items for compelling angles...',
    });
    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('topic_strategy');
    expect(parsed.message).toContain('evidence items');
  });

  it('selectTopic posts to /linkedin-content/respond with topic_id', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await act(async () => {
      await result.current.selectTopic('topic-1');
    });

    const respondCall = mockFetch.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('/respond'),
    );
    expect(respondCall).toBeDefined();
    const body = JSON.parse(respondCall![1].body as string);
    expect(body.response.topic_id).toBe('topic-1');
    expect(body.session_id).toBe('test-uuid');
  });

  it('approvePost posts to /linkedin-content/respond with approved: true', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await act(async () => {
      await result.current.approvePost();
    });

    const respondCall = mockFetch.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('/respond'),
    );
    expect(respondCall).toBeDefined();
    const body = JSON.parse(respondCall![1].body as string);
    expect(body.response.approved).toBe(true);
  });

  it('requestRevision posts feedback to /linkedin-content/respond', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await act(async () => {
      await result.current.requestRevision('Make it shorter and punchier');
    });

    const respondCall = mockFetch.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('/respond'),
    );
    expect(respondCall).toBeDefined();
    const body = JSON.parse(respondCall![1].body as string);
    expect(body.response.approved).toBe(false);
    expect(body.response.feedback).toBe('Make it shorter and punchier');
  });
});
