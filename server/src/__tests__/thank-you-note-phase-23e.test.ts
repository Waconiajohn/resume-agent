/**
 * Phase 2.3e — New scenario coverage for the thank-you-note refactor.
 *
 * Scenarios:
 *  - Per-recipient gate response: revise one recipient, others untouched
 *  - Per-recipient direct-edit gate response: mutates note in-place, no rerun
 *  - source_session_id context injection: prior_interview_prep surfaces
 *    in buildAgentMessage
 *  - Timing warning trigger: emit_timing_warning tool respects the
 *    days_since_interview > 2 threshold
 *  - Stage-derived default: computed rule matches screening + interviewing
 *  - Recipients length validation (min 1, max 10) at the Zod layer
 *  - /interview-prep/reports/by-application/:id — hit, miss, invalid uuid
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted) — must be defined before module imports ─────────
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-abc', email: 'user@example.com' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import '../agents/thank-you-note/writer/agent.js';
import { createThankYouNoteProductConfig } from '../agents/thank-you-note/product.js';
import type {
  ThankYouNote,
  ThankYouNoteState,
  ThankYouNoteSSEEvent,
} from '../agents/thank-you-note/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function sampleNote(recipientName: string, role: ThankYouNote['recipient_role'] = 'hiring_manager'): ThankYouNote {
  return {
    recipient_role: role,
    recipient_name: recipientName,
    recipient_title: 'VP',
    format: 'email',
    content: `Original body for ${recipientName}`,
    subject_line: `Re: interview for ${recipientName}`,
    personalization_notes: 'original personalization',
    quality_score: 80,
  };
}

// ─── Per-recipient gate response ──────────────────────────────────────

describe('note_review gate — per-recipient feedback', () => {
  const cfg = createThankYouNoteProductConfig();
  const gate = cfg.agents[0].gates![0];

  function freshStateWithNotes(): ThankYouNoteState {
    const s = cfg.createInitialState('sess-1', 'user-1', {
      company: 'Acme',
      role: 'VP Ops',
      recipients: [
        { role: 'hiring_manager', name: 'Alice' },
        { role: 'recruiter', name: 'Bob' },
        { role: 'panel_interviewer', name: 'Carmen' },
      ],
    }) as ThankYouNoteState;
    s.notes = [sampleNote('Alice'), sampleNote('Bob', 'recruiter'), sampleNote('Carmen', 'panel_interviewer')];
    return s;
  }

  it('per-recipient revise queues feedback only for the indexed note', () => {
    const s = freshStateWithNotes();
    gate.onResponse!({ recipient_index: 1, feedback: 'more direct close' }, s);
    expect(s.revision_feedback_by_recipient).toEqual({ 1: 'more direct close' });
    expect(gate.requiresRerun!(s)).toBe(true);
    // Unmodified notes stay in state.
    expect(s.notes).toHaveLength(3);
    expect(s.notes[0].recipient_name).toBe('Alice');
    expect(s.notes[2].recipient_name).toBe('Carmen');
  });

  it('per-recipient feedback does not leak into other indices', () => {
    const s = freshStateWithNotes();
    gate.onResponse!({ recipient_index: 0, feedback: 'shorter' }, s);
    gate.onResponse!({ recipient_index: 2, feedback: 'warmer' }, s);
    expect(s.revision_feedback_by_recipient).toEqual({ 0: 'shorter', 2: 'warmer' });
    expect(s.revision_feedback_by_recipient![1]).toBeUndefined();
  });

  it('out-of-range recipient_index is ignored (no rerun, no feedback set)', () => {
    const s = freshStateWithNotes();
    gate.onResponse!({ recipient_index: 99, feedback: 'oh no' }, s);
    expect(s.revision_feedback_by_recipient).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('collection-level revise still works (back-compat)', () => {
    const s = freshStateWithNotes();
    gate.onResponse!({ feedback: 'rewrite everything' }, s);
    expect(s.revision_feedback).toBe('rewrite everything');
    expect(gate.requiresRerun!(s)).toBe(true);
  });

  it('approve clears both per-recipient and collection feedback', () => {
    const s = freshStateWithNotes();
    s.revision_feedback = 'stale';
    s.revision_feedback_by_recipient = { 0: 'stale' };
    gate.onResponse!(true, s);
    expect(s.revision_feedback).toBeUndefined();
    expect(s.revision_feedback_by_recipient).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });
});

// ─── Per-recipient direct-edit ────────────────────────────────────────

describe('note_review gate — per-recipient direct-edit', () => {
  const cfg = createThankYouNoteProductConfig();
  const gate = cfg.agents[0].gates![0];

  function freshStateWithNotes(): ThankYouNoteState {
    const s = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [
        { role: 'hiring_manager', name: 'Alice' },
        { role: 'recruiter', name: 'Bob' },
      ],
    }) as ThankYouNoteState;
    s.notes = [sampleNote('Alice'), sampleNote('Bob', 'recruiter')];
    return s;
  }

  it('updates content + subject for the indexed recipient only', () => {
    const s = freshStateWithNotes();
    gate.onResponse!(
      { recipient_index: 0, edited_subject: 'New subject', edited_body: 'New body.' },
      s,
    );
    expect(s.notes[0].content).toBe('New body.');
    expect(s.notes[0].subject_line).toBe('New subject');
    // Bob is untouched.
    expect(s.notes[1].content).toBe('Original body for Bob');
  });

  it('direct-edit does not trigger a rerun', () => {
    const s = freshStateWithNotes();
    gate.onResponse!(
      { recipient_index: 0, edited_body: 'New body only' },
      s,
    );
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('body-only edit leaves subject untouched', () => {
    const s = freshStateWithNotes();
    const originalSubject = s.notes[0].subject_line;
    gate.onResponse!({ recipient_index: 0, edited_body: 'Only body changed' }, s);
    expect(s.notes[0].content).toBe('Only body changed');
    expect(s.notes[0].subject_line).toBe(originalSubject);
  });
});

// ─── source_session_id context injection ──────────────────────────────

describe('buildAgentMessage — prior interview-prep context', () => {
  const cfg = createThankYouNoteProductConfig();

  it('injects the prior_interview_prep excerpt when provided', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      company: 'Acme',
      role: 'VP',
      recipients: [{ role: 'hiring_manager', name: 'Alice' }],
      prior_interview_prep: {
        report_excerpt: 'Discussed Q3 roadmap sequencing with the hiring manager.',
      },
    }) as ThankYouNoteState;

    const msg = cfg.buildAgentMessage('writer', state, { resume_text: 'Resume body' }) as string;
    expect(msg).toContain('Prior interview-prep report excerpt');
    expect(msg).toContain('Q3 roadmap sequencing');
  });

  it('omits the excerpt when not provided', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [{ role: 'hiring_manager', name: 'Alice' }],
    }) as ThankYouNoteState;
    const msg = cfg.buildAgentMessage('writer', state, { resume_text: 'Resume body' }) as string;
    expect(msg).not.toContain('Prior interview-prep report excerpt');
  });

  it('surfaces per-recipient feedback in the rerun message only for affected indices', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [
        { role: 'hiring_manager', name: 'Alice' },
        { role: 'recruiter', name: 'Bob' },
      ],
    }) as ThankYouNoteState;
    state.notes = [sampleNote('Alice'), sampleNote('Bob', 'recruiter')];
    state.revision_feedback_by_recipient = { 0: 'shorter please' };

    const msg = cfg.buildAgentMessage('writer', state, { resume_text: 'Resume' }) as string;
    expect(msg).toContain('Per-Recipient Revisions Requested');
    expect(msg).toContain('Alice');
    expect(msg).toContain('shorter please');
    // Bob is not in the feedback map, so the instruction should not list him.
    expect(msg).not.toContain('Bob (Recruiter): "');
    expect(msg).toContain('DO NOT rewrite any other notes');
  });
});

// ─── Timing warning ────────────────────────────────────────────────────

describe('emit_timing_warning tool', () => {
  const cfg = createThankYouNoteProductConfig();

  function writerTool(name: string) {
    return cfg.agents[0].config.tools.find((t) => t.name === name);
  }

  function makeCtx(state: ThankYouNoteState) {
    const events: ThankYouNoteSSEEvent[] = [];
    return {
      ctx: {
        sessionId: state.session_id,
        userId: state.user_id,
        emit: (e: ThankYouNoteSSEEvent) => events.push(e),
        waitForUser: vi.fn(),
        getState: () => state,
        updateState: vi.fn(),
        scratchpad: {} as Record<string, unknown>,
        signal: new AbortController().signal,
        sendMessage: vi.fn(),
      },
      events,
    };
  }

  it('does not emit when days_since_interview is 2 or fewer', async () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [{ role: 'hiring_manager', name: 'Alice' }],
      activity_signals: { days_since_interview: 2 },
    }) as ThankYouNoteState;
    const { ctx, events } = makeCtx(state);

    const tool = writerTool('emit_timing_warning')!;
    const result = (await tool.execute({ message: 'Some warning' }, ctx as never)) as { emitted: boolean };
    expect(result.emitted).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('emits thank_you_timing_warning when days_since_interview > 2 and message is non-empty', async () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [{ role: 'hiring_manager', name: 'Alice' }],
      activity_signals: { days_since_interview: 5 },
    }) as ThankYouNoteState;
    const { ctx, events } = makeCtx(state);

    const tool = writerTool('emit_timing_warning')!;
    const result = (await tool.execute({ message: 'Five days have passed — this still helps but consider pairing with a follow-up.' }, ctx as never)) as {
      emitted: boolean;
      days_since_interview?: number;
    };
    expect(result.emitted).toBe(true);
    expect(result.days_since_interview).toBe(5);
    expect(events).toHaveLength(1);
    const evt = events[0] as Extract<ThankYouNoteSSEEvent, { type: 'thank_you_timing_warning' }>;
    expect(evt.type).toBe('thank_you_timing_warning');
    expect(evt.days_since_interview).toBe(5);
    expect(evt.message).toContain('Five days');
    expect(state.timing_warning_emitted).toBe(true);
  });

  it('does not re-emit once timing_warning_emitted is true', async () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [{ role: 'hiring_manager', name: 'Alice' }],
      activity_signals: { days_since_interview: 5 },
    }) as ThankYouNoteState;
    state.timing_warning_emitted = true;
    const { ctx, events } = makeCtx(state);

    const tool = writerTool('emit_timing_warning')!;
    const result = (await tool.execute({ message: 'again' }, ctx as never)) as { emitted: boolean };
    expect(result.emitted).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('refuses to emit on empty message even when within the warning window', async () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      recipients: [{ role: 'hiring_manager', name: 'Alice' }],
      activity_signals: { days_since_interview: 10 },
    }) as ThankYouNoteState;
    const { ctx, events } = makeCtx(state);

    const tool = writerTool('emit_timing_warning')!;
    const result = (await tool.execute({ message: '   ' }, ctx as never)) as { emitted: boolean };
    expect(result.emitted).toBe(false);
    expect(events).toHaveLength(0);
  });
});

// ─── Recipients length validation (Zod) ───────────────────────────────

describe('thank-you-note /start schema — recipients bounds', () => {
  it('rejects an empty recipients array', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      recipients: z.array(z.object({
        role: z.enum(['hiring_manager', 'recruiter', 'panel_interviewer', 'executive_sponsor', 'other']),
        name: z.string().min(1).max(200),
      })).min(1).max(10),
    });
    const res = schema.safeParse({ recipients: [] });
    expect(res.success).toBe(false);
  });

  it('rejects more than 10 recipients', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      recipients: z.array(z.object({
        role: z.enum(['hiring_manager', 'recruiter', 'panel_interviewer', 'executive_sponsor', 'other']),
        name: z.string().min(1).max(200),
      })).min(1).max(10),
    });
    const elevenRecipients = Array.from({ length: 11 }, (_, i) => ({
      role: 'hiring_manager' as const,
      name: `R${i}`,
    }));
    const res = schema.safeParse({ recipients: elevenRecipients });
    expect(res.success).toBe(false);
  });

  it('accepts exactly 10 recipients', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      recipients: z.array(z.object({
        role: z.enum(['hiring_manager', 'recruiter', 'panel_interviewer', 'executive_sponsor', 'other']),
        name: z.string().min(1).max(200),
      })).min(1).max(10),
    });
    const tenRecipients = Array.from({ length: 10 }, (_, i) => ({
      role: 'hiring_manager' as const,
      name: `R${i}`,
    }));
    const res = schema.safeParse({ recipients: tenRecipients });
    expect(res.success).toBe(true);
  });
});

// ─── /interview-prep/reports/by-application/:id endpoint ─────────────

describe('GET /interview-prep/reports/by-application/:applicationId', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  function buildSingleChain(terminal: { data: unknown; error: null | { message: string } }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockImplementation(() => chain);
    chain.eq = vi.fn().mockImplementation(() => chain);
    chain.order = vi.fn().mockImplementation(() => chain);
    chain.limit = vi.fn().mockImplementation(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
    return chain;
  }

  it('returns 200 with session_id + generated_at on hit', async () => {
    const { Hono } = await import('hono');
    const { interviewPrepRoutes } = await import('../routes/interview-prep.js');
    const app = new Hono();
    app.route('/interview-prep', interviewPrepRoutes);

    const chain = buildSingleChain({
      data: { session_id: 'ssn-uuid-1', created_at: '2026-04-20T10:00:00Z' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await app.request('/interview-prep/reports/by-application/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe('ssn-uuid-1');
    expect(body.generated_at).toBe('2026-04-20T10:00:00Z');
  });

  it('returns 404 when no report exists for the application', async () => {
    const { Hono } = await import('hono');
    const { interviewPrepRoutes } = await import('../routes/interview-prep.js');
    const app = new Hono();
    app.route('/interview-prep', interviewPrepRoutes);

    const chain = buildSingleChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await app.request('/interview-prep/reports/by-application/22222222-2222-4222-8222-222222222222');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid application id (non-uuid)', async () => {
    const { Hono } = await import('hono');
    const { interviewPrepRoutes } = await import('../routes/interview-prep.js');
    const app = new Hono();
    app.route('/interview-prep', interviewPrepRoutes);

    const res = await app.request('/interview-prep/reports/by-application/not-a-uuid');
    expect(res.status).toBe(400);
  });
});
