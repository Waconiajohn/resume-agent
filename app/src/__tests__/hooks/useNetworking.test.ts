/**
 * useNetworking — Phase 2.3f hook tests.
 *
 * Happy-path start, SSE event normalization, revise + direct-edit gate
 * responses, reset.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworking } from '@/hooks/useNetworking';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

vi.mock('@/lib/sse-parser', () => ({ parseSSEStream: vi.fn() }));

vi.mock('@/lib/create-product-session', () => ({
  createProductSession: vi.fn().mockResolvedValue({
    accessToken: 'test-token',
    session: { id: 'test-session-uuid' },
  }),
}));

function makeEvent(type: string, data: Record<string, unknown>) {
  return { event: type, data: JSON.stringify(data) };
}

const sampleInput = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  resumeText: 'Jane Smith, VP Ops with 15 years of supply-chain leadership.',
  recipientName: 'Alice Chen',
  recipientType: 'former_colleague' as const,
  messagingMethod: 'connection_request' as const,
  goal: 'Reconnect and ask about her new team.',
};

describe('useNetworking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts in idle state with null draft', () => {
    const { result } = renderHook(() => useNetworking());
    expect(result.current.status).toBe('idle');
    expect(result.current.draft).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('startPipeline POSTs to /networking-message/start with the expected body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useNetworking());
    await act(async () => { await result.current.startPipeline(sampleInput); });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/networking-message/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Alice Chen'),
      }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.job_application_id).toBe(sampleInput.applicationId);
    expect(body.recipient_type).toBe('former_colleague');
    expect(body.messaging_method).toBe('connection_request');
    expect(body.goal).toContain('Reconnect');
  });

  it('handles message_draft_ready → sets draft on state', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('message_draft_ready', {
          session_id: 'test-session-uuid',
          draft: {
            recipient_name: 'Alice Chen',
            recipient_type: 'former_colleague',
            messaging_method: 'connection_request',
            goal: 'Reconnect',
            message_markdown: 'Hi Alice — saw your update on the platform team.',
            char_count: 48,
          },
        });
      },
    });

    const { result } = renderHook(() => useNetworking());
    await act(async () => { await result.current.startPipeline(sampleInput); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.draft).not.toBeNull();
    expect(result.current.draft?.recipient_name).toBe('Alice Chen');
    expect(result.current.draft?.char_count).toBe(48);
  });

  it('pipeline_gate(message_review) transitions status to message_review', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('pipeline_gate', { gate: 'message_review' });
      },
    });

    const { result } = renderHook(() => useNetworking());
    await act(async () => { await result.current.startPipeline(sampleInput); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.status).toBe('message_review');
    expect(result.current.pendingGate).toBe('message_review');
  });

  it('respondToGate (revise) POSTs feedback and transitions back to running', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('pipeline_gate', { gate: 'message_review' });
      },
    });

    const { result } = renderHook(() => useNetworking());
    await act(async () => { await result.current.startPipeline(sampleInput); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.status).toBe('message_review');

    await act(async () => {
      await result.current.respondToGate('message_review', { feedback: 'Shorter please.' });
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/api/networking-message/respond',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Shorter please'),
      }),
    );
    expect(result.current.status).toBe('running');
    expect(result.current.pendingGate).toBeNull();
  });

  it('respondToGate (edited_content) POSTs without flipping status back to running', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('pipeline_gate', { gate: 'message_review' });
      },
    });

    const { result } = renderHook(() => useNetworking());
    await act(async () => { await result.current.startPipeline(sampleInput); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.status).toBe('message_review');

    await act(async () => {
      await result.current.respondToGate('message_review', { edited_content: 'User-edited body.' });
    });

    // edited_content does not flip status; the factory clears the gate server-side.
    expect(result.current.status).toBe('message_review');
  });

  it('reset returns to idle', () => {
    const { result } = renderHook(() => useNetworking());
    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.draft).toBeNull();
  });

  it('handles pipeline_error (sets error + status=error)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('pipeline_error', { stage: 'drafting', error: 'LLM provider timeout' });
      },
    });

    const { result } = renderHook(() => useNetworking());
    await act(async () => { await result.current.startPipeline(sampleInput); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('LLM provider timeout');
  });
});
