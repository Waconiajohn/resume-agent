/**
 * Networking Message Agent — Unit tests (Phase 2.3f).
 *
 * Covers:
 *  - Agent registration + tool catalogue + model tiers
 *  - Knowledge rules are non-empty
 *  - createInitialState normalization (recipient_type, messaging_method)
 *  - buildAgentMessage includes required context + revision feedback
 *  - message_review gate: approve / revise / direct-edit / requiresRerun
 *  - onComplete emits draft + gate
 *  - validateAfterAgent enforces the critical dependency
 *  - write_message respects char caps per messaging_method
 *  - computeNetworkingDefault stage rule (server-side resolver)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────
const mockLlmChat = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFrom, auth: { getUser: vi.fn() } },
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockLlmChat },
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

// Prevent the CRM touchpoint path from needing a full contacts stub.
vi.mock('../lib/networking-crm-service.js', () => ({
  processNewTouchpoint: vi.fn().mockResolvedValue({ touchpoint: { id: 'tp-1' } }),
}));

import { agentRegistry } from '../agents/runtime/agent-registry.js';
import '../agents/networking-message/writer/agent.js';
import { createNetworkingMessageProductConfig } from '../agents/networking-message/product.js';
import { writerTools } from '../agents/networking-message/writer/tools.js';
import { NETWORKING_MESSAGE_RULES } from '../agents/networking-message/knowledge/rules.js';
import {
  MESSAGING_METHOD_CHAR_CAP,
  type NetworkingMessageDraft,
  type NetworkingMessageState,
  type NetworkingMessageSSEEvent,
} from '../agents/networking-message/types.js';
import { computeNetworkingDefault } from '../routes/networking-message.js';

// ─── Registration ──────────────────────────────────────────────────────

describe('Networking Message Agent Registration', () => {
  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('networking-message', 'writer')).toBe(true);
  });

  it('networking-message domain appears in listDomains', () => {
    expect(agentRegistry.listDomains()).toContain('networking-message');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('networking-message', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('networking_message_drafting');
  });

  it('writer has 3 tools (assess_context + write_message + emit_transparency)', () => {
    const desc = agentRegistry.describe('networking-message', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(3);
    expect(desc!.tools).toContain('assess_context');
    expect(desc!.tools).toContain('write_message');
    expect(desc!.tools).toContain('emit_transparency');
  });
});

// ─── Tool catalogue ───────────────────────────────────────────────────

describe('Networking Message Tools', () => {
  it('assess_context is mid tier', () => {
    const tool = writerTools.find((t) => t.name === 'assess_context');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('mid');
  });

  it('write_message is primary tier', () => {
    const tool = writerTools.find((t) => t.name === 'write_message');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('primary');
  });

  it('each tool has a non-trivial description', () => {
    for (const tool of writerTools) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });
});

// ─── Knowledge rules ──────────────────────────────────────────────────

describe('Networking Message knowledge rules', () => {
  it('NETWORKING_MESSAGE_RULES contains all 5 recipient archetypes', () => {
    expect(NETWORKING_MESSAGE_RULES).toContain('former_colleague');
    expect(NETWORKING_MESSAGE_RULES).toContain('second_degree');
    expect(NETWORKING_MESSAGE_RULES).toContain('cold');
    expect(NETWORKING_MESSAGE_RULES).toContain('referrer');
    expect(NETWORKING_MESSAGE_RULES).toContain('other');
  });

  it('rules name each channel char cap', () => {
    expect(NETWORKING_MESSAGE_RULES).toContain('300');
    expect(NETWORKING_MESSAGE_RULES).toContain('1900');
    expect(NETWORKING_MESSAGE_RULES).toContain('8000');
  });
});

// ─── createInitialState ────────────────────────────────────────────────

describe('createInitialState normalization', () => {
  const build = createNetworkingMessageProductConfig;

  it('defaults messaging_method to connection_request when absent', () => {
    const s = build().createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      goal: 'ask for a 20-min call',
    }) as NetworkingMessageState;
    expect(s.messaging_method).toBe('connection_request');
  });

  it('respects explicit messaging_method override', () => {
    const s = build().createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'cold',
      messaging_method: 'inmail',
      goal: 'introduce myself',
    }) as NetworkingMessageState;
    expect(s.messaging_method).toBe('inmail');
  });

  it('coerces unknown recipient_type to "other"', () => {
    const s = build().createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'bogus-role',
      goal: 'goal',
    }) as NetworkingMessageState;
    expect(s.recipient_type).toBe('other');
  });

  it('coerces unknown messaging_method to default', () => {
    const s = build().createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      messaging_method: 'fax',
      goal: 'goal',
    }) as NetworkingMessageState;
    expect(s.messaging_method).toBe('connection_request');
  });
});

// ─── buildAgentMessage ────────────────────────────────────────────────

describe('buildAgentMessage', () => {
  const cfg = createNetworkingMessageProductConfig();

  function baseState(patch: Partial<NetworkingMessageState> = {}): NetworkingMessageState {
    return {
      ...(cfg.createInitialState('sess-1', 'user-1', {
        job_application_id: 'app-1',
        recipient_name: 'Alice',
        recipient_type: 'former_colleague',
        messaging_method: 'connection_request',
        goal: 'Schedule a 20-minute catch-up call',
      }) as NetworkingMessageState),
      ...patch,
    };
  }

  it('returns empty for unknown agent name', () => {
    const msg = cfg.buildAgentMessage('stranger', baseState(), {});
    expect(msg).toBe('');
  });

  it('includes recipient archetype, channel, goal, and character cap guidance', () => {
    const msg = cfg.buildAgentMessage('writer', baseState(), {}) as string;
    expect(msg).toContain('connection_request');
    expect(msg).toContain('Former colleague');
    expect(msg).toContain('Schedule a 20-minute');
    expect(msg).toContain(String(MESSAGING_METHOD_CHAR_CAP.connection_request));
  });

  it('injects target_application when provided by transformInput', () => {
    const state = baseState({
      target_application: {
        company_name: 'Medtronic',
        role_title: 'VP Supply Chain',
        jd_excerpt: 'Lead the supply chain transformation program.',
        stage: 'screening',
      },
    });
    const msg = cfg.buildAgentMessage('writer', state, {}) as string;
    expect(msg).toContain('Medtronic');
    expect(msg).toContain('VP Supply Chain');
    expect(msg).toContain('supply chain transformation');
  });

  it('surfaces revision_feedback on rerun', () => {
    const state = baseState({ revision_feedback: 'Make it shorter and lead with the mutual contact.' });
    const msg = cfg.buildAgentMessage('writer', state, {}) as string;
    expect(msg).toContain('User revision feedback');
    expect(msg).toContain('lead with the mutual contact');
  });
});

// ─── message_review gate ──────────────────────────────────────────────

describe('message_review gate onResponse', () => {
  const cfg = createNetworkingMessageProductConfig();
  const gate = cfg.agents[0].gates![0];

  function stateWithDraft(): NetworkingMessageState {
    const s = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      messaging_method: 'connection_request',
      goal: 'catch up',
    }) as NetworkingMessageState;
    s.draft = {
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      messaging_method: 'connection_request',
      goal: 'catch up',
      message_markdown: 'Original body.',
      char_count: 14,
    };
    s.revision_feedback = 'stale';
    return s;
  }

  it('approve clears revision_feedback, no rerun', () => {
    const s = stateWithDraft();
    gate.onResponse!(true, s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it("'approved' literal clears revision_feedback", () => {
    const s = stateWithDraft();
    gate.onResponse!('approved', s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('revise with {feedback} sets revision_feedback and triggers rerun', () => {
    const s = stateWithDraft();
    gate.onResponse!({ feedback: 'Shorter and more direct.' }, s);
    expect(s.revision_feedback).toBe('Shorter and more direct.');
    expect(gate.requiresRerun!(s)).toBe(true);
  });

  it('empty feedback string clears revision_feedback', () => {
    const s = stateWithDraft();
    gate.onResponse!({ feedback: '   ' }, s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('edited_content direct-edit mutates the draft and skips rerun', () => {
    const s = stateWithDraft();
    gate.onResponse!({ edited_content: 'User-edited body.' }, s);
    expect(s.draft?.message_markdown).toBe('User-edited body.');
    expect(s.draft?.char_count).toBe('User-edited body.'.length);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('unknown response shape clears revision_feedback', () => {
    const s = stateWithDraft();
    gate.onResponse!({ foo: 'bar' }, s);
    expect(s.revision_feedback).toBeUndefined();
  });

  it('condition is false before a draft exists', () => {
    const s = cfg.createInitialState('sess-1', 'user-1', {}) as NetworkingMessageState;
    expect(gate.condition!(s)).toBe(false);
  });

  it('condition is true once a draft is present', () => {
    expect(gate.condition!(stateWithDraft())).toBe(true);
  });
});

// ─── onComplete + finalize + validate ────────────────────────────────

describe('Writer phase onComplete', () => {
  const cfg = createNetworkingMessageProductConfig();

  it('transfers draft from scratchpad and emits gate events', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      goal: 'catch up',
    }) as NetworkingMessageState;
    state.revision_feedback = 'leftover';
    const events: NetworkingMessageSSEEvent[] = [];
    const draft: NetworkingMessageDraft = {
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      messaging_method: 'connection_request',
      goal: 'catch up',
      message_markdown: 'Hi Alice — saw your update …',
      char_count: 30,
    };

    cfg.agents[0].onComplete!({ draft }, state, (e) => events.push(e));

    expect(state.draft).toEqual(draft);
    expect(state.revision_feedback).toBeUndefined();
    const types = events.map((e) => e.type);
    expect(types).toContain('message_draft_ready');
    expect(types).toContain('pipeline_gate');
    const gateEvt = events.find((e) => e.type === 'pipeline_gate');
    expect(gateEvt && (gateEvt as { gate: string }).gate).toBe('message_review');
  });

  it('no emit when scratchpad lacks a draft', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'other',
      goal: 'hi',
    }) as NetworkingMessageState;
    const events: NetworkingMessageSSEEvent[] = [];
    cfg.agents[0].onComplete!({}, state, (e) => events.push(e));
    expect(events).toHaveLength(0);
  });
});

describe('finalizeResult', () => {
  const cfg = createNetworkingMessageProductConfig();

  it('emits message_complete when a draft exists', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'other',
      goal: 'hi',
    }) as NetworkingMessageState;
    state.draft = {
      recipient_name: 'Alice',
      recipient_type: 'other',
      messaging_method: 'connection_request',
      goal: 'hi',
      message_markdown: 'Body.',
      char_count: 5,
    };
    const events: NetworkingMessageSSEEvent[] = [];
    const res = cfg.finalizeResult(state, {}, (e) => events.push(e)) as { draft?: NetworkingMessageDraft };
    expect(res.draft).toEqual(state.draft);
    expect(events.some((e) => e.type === 'message_complete')).toBe(true);
  });

  it('does not emit message_complete when no draft exists', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'other',
      goal: 'hi',
    }) as NetworkingMessageState;
    const events: NetworkingMessageSSEEvent[] = [];
    cfg.finalizeResult(state, {}, (e) => events.push(e));
    expect(events.some((e) => e.type === 'message_complete')).toBe(false);
  });
});

describe('validateAfterAgent', () => {
  const cfg = createNetworkingMessageProductConfig();

  it('throws when writer finishes without a draft', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'other',
      goal: 'hi',
    }) as NetworkingMessageState;
    expect(() => cfg.validateAfterAgent!('writer', state)).toThrow(/did not produce/i);
  });

  it('passes once a draft is set', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'other',
      goal: 'hi',
    }) as NetworkingMessageState;
    state.draft = {
      recipient_name: 'Alice',
      recipient_type: 'other',
      messaging_method: 'connection_request',
      goal: 'hi',
      message_markdown: 'Body.',
      char_count: 5,
    };
    expect(() => cfg.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('is a no-op for other agent names', () => {
    const state = cfg.createInitialState('sess-1', 'user-1', {}) as NetworkingMessageState;
    expect(() => cfg.validateAfterAgent!('ghost', state)).not.toThrow();
  });
});

// ─── Char cap enforcement in write_message ────────────────────────────

describe('write_message char-cap enforcement', () => {
  const cfg = createNetworkingMessageProductConfig();

  function makeCtx(state: NetworkingMessageState) {
    return {
      sessionId: state.session_id,
      userId: state.user_id,
      emit: vi.fn(),
      waitForUser: vi.fn(),
      getState: () => state,
      updateState: vi.fn(),
      scratchpad: {} as Record<string, unknown>,
      signal: new AbortController().signal,
      sendMessage: vi.fn(),
    };
  }

  function writerTool(name: string) {
    return cfg.agents[0].config.tools.find((t) => t.name === name)!;
  }

  beforeEach(() => {
    mockLlmChat.mockReset();
  });

  it('clips an over-cap draft at a sentence boundary for connection_request', async () => {
    // Build a long message: 3 sentences well over 300 chars.
    const longBody =
      'This is the first sentence with a lot of words to push the total past 100. '
      + 'Here is a second sentence with even more words and detail to ensure the total is beyond the connection-request cap. '
      + 'And a third sentence that takes us well past the 300-character threshold so we can confirm the trimmer kicks in and cleans the result. '
      + 'A fourth sentence for good measure.';
    expect(longBody.length).toBeGreaterThan(300);

    mockLlmChat.mockResolvedValueOnce({
      text: JSON.stringify({ message: longBody, rationale: 'test' }),
    });

    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'former_colleague',
      messaging_method: 'connection_request',
      goal: 'catch up',
    }) as NetworkingMessageState;

    const ctx = makeCtx(state);
    const tool = writerTool('write_message');
    const result = (await tool.execute({}, ctx as never)) as {
      char_count: number;
      over_cap: boolean;
      char_cap: number;
    };

    expect(result.char_cap).toBe(300);
    expect(result.char_count).toBeLessThanOrEqual(300);
    expect(result.over_cap).toBe(false);
  });

  it('preserves an under-cap draft for inmail', async () => {
    mockLlmChat.mockResolvedValueOnce({
      text: JSON.stringify({ message: 'Short inmail body.', rationale: '' }),
    });

    const state = cfg.createInitialState('sess-1', 'user-1', {
      job_application_id: 'app-1',
      recipient_name: 'Alice',
      recipient_type: 'cold',
      messaging_method: 'inmail',
      goal: 'intro',
    }) as NetworkingMessageState;

    const ctx = makeCtx(state);
    const tool = writerTool('write_message');
    const result = (await tool.execute({}, ctx as never)) as {
      char_count: number;
      over_cap: boolean;
      char_cap: number;
    };

    expect(result.char_cap).toBe(1900);
    expect(result.char_count).toBe('Short inmail body.'.length);
    expect(result.over_cap).toBe(false);
  });
});

// ─── computeNetworkingDefault (stage rule) ────────────────────────────

describe('computeNetworkingDefault', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  function stubStage(stage: string) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { stage }, error: null }),
    };
    mockFrom.mockReturnValue(chain);
  }

  it('returns TRUE for saved', async () => {
    stubStage('saved');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(true);
  });

  it('returns TRUE for researching', async () => {
    stubStage('researching');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(true);
  });

  it('returns TRUE for applied', async () => {
    stubStage('applied');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(true);
  });

  it('returns TRUE for screening', async () => {
    stubStage('screening');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(true);
  });

  it('returns TRUE for interviewing', async () => {
    stubStage('interviewing');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(true);
  });

  it('returns FALSE for offer', async () => {
    stubStage('offer');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(false);
  });

  it('returns FALSE for closed_won', async () => {
    stubStage('closed_won');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(false);
  });

  it('returns FALSE for closed_lost', async () => {
    stubStage('closed_lost');
    expect(await computeNetworkingDefault('app-1', 'user-1')).toBe(false);
  });
});
