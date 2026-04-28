/**
 * Follow-Up Email Agent — Unit tests.
 *
 * Phase 2.3d. Exercises:
 * - Writer registers in the agent registry
 * - ProductConfig shape is well-formed
 * - Tool catalog + model tiers
 * - Knowledge rules are non-empty
 * - createInitialState normalizes follow_up_number / tone / situation
 * - buildAgentMessage includes prior context + revision feedback
 * - email_review gate: approve / revise / direct-edit / requiresRerun
 * - onComplete emits email_draft_ready + pipeline_gate
 * - finalizeResult emits email_complete
 * - validateAfterAgent enforces the critical dependency
 *
 * Multi-turn refinement is verified at the gate-logic layer:
 * approve clears revision_feedback; a new {feedback} response sets it and
 * requiresRerun turns TRUE — which is the coordinator's signal to rerun
 * the writer with the new feedback in its message.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    }),
  },
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

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// Trigger registration.
import '../agents/follow-up-email/writer/agent.js';

import { createFollowUpEmailProductConfig } from '../agents/follow-up-email/product.js';
import { writerTools } from '../agents/follow-up-email/writer/tools.js';
import { FOLLOW_UP_EMAIL_RULES } from '../agents/follow-up-email/knowledge/rules.js';
import { llm } from '../lib/llm.js';
import {
  defaultToneForFollowUpNumber,
  defaultSituationForFollowUpNumber,
  type FollowUpEmailDraft,
  type FollowUpEmailSSEEvent,
  type FollowUpEmailState,
} from '../agents/follow-up-email/types.js';

// ─── Registration ──────────────────────────────────────────────────────

describe('Follow-Up Email Agent Registration', () => {
  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('follow-up-email', 'writer')).toBe(true);
  });

  it('follow-up-email domain appears in listDomains', () => {
    expect(agentRegistry.listDomains()).toContain('follow-up-email');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('follow-up-email', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('follow_up_email_drafting');
  });

  it('writer has 2 tools (draft_follow_up_email + emit_transparency)', () => {
    const desc = agentRegistry.describe('follow-up-email', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(2);
    expect(desc!.tools).toContain('draft_follow_up_email');
    expect(desc!.tools).toContain('emit_transparency');
  });
});

// ─── Tool catalogue ───────────────────────────────────────────────────

describe('Follow-Up Email Tools', () => {
  it('draft_follow_up_email is a primary-tier tool', () => {
    const tool = writerTools.find((t) => t.name === 'draft_follow_up_email');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('primary');
  });

  it('every tool has a non-trivial description', () => {
    for (const tool of writerTools) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('every tool has input_schema of type object', () => {
    for (const tool of writerTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('parses repaired JSON into subject and body instead of showing raw JSON', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      text: JSON.stringify({
        subject: 'First 90 days',
        body: 'Ellen, I appreciated the conversation about stabilizing the divisions.',
        tone_notes: 'Warm and specific.',
        timing_guidance: 'Send mid-morning.',
      }),
      usage: { input_tokens: 0, output_tokens: 0 },
      tool_calls: [],
    });

    const cfg = createFollowUpEmailProductConfig();
    const state = cfg.createInitialState('sess', 'user', {
      company_name: 'Jrgpartners',
      role_title: 'VP Manufacturing',
      recipient_name: 'Ellen Carter',
      recipient_title: 'COO',
      specific_context: 'first 90 days',
    });
    const scratchpad: Record<string, unknown> = {};
    const tool = writerTools.find((t) => t.name === 'draft_follow_up_email');

    await tool!.execute({}, {
      getState: () => state,
      scratchpad,
    } as never);

    const draft = scratchpad.draft as FollowUpEmailDraft;
    expect(draft.subject).toBe('First 90 days');
    expect(draft.body).toBe('Ellen, I appreciated the conversation about stabilizing the divisions.');
    expect(draft.body).not.toContain('"subject"');
  });
});

// ─── Knowledge ────────────────────────────────────────────────────────

describe('Follow-Up Email Knowledge Rules', () => {
  it('FOLLOW_UP_EMAIL_RULES is a non-empty string', () => {
    expect(typeof FOLLOW_UP_EMAIL_RULES).toBe('string');
    expect(FOLLOW_UP_EMAIL_RULES.length).toBeGreaterThan(200);
  });

  it('names the three tone variants', () => {
    expect(FOLLOW_UP_EMAIL_RULES).toContain('warm');
    expect(FOLLOW_UP_EMAIL_RULES).toContain('direct');
    expect(FOLLOW_UP_EMAIL_RULES).toContain('value-add');
  });

  it('names the sequence ladder (nudge #1/#2/#3)', () => {
    expect(FOLLOW_UP_EMAIL_RULES).toContain('follow_up_number');
    expect(FOLLOW_UP_EMAIL_RULES).toMatch(/first nudge/i);
  });
});

// ─── Defaults ─────────────────────────────────────────────────────────

describe('Follow-Up Email tone defaults', () => {
  it('follow_up_number 1 → warm', () => {
    expect(defaultToneForFollowUpNumber(1)).toBe('warm');
  });
  it('follow_up_number 2 → direct', () => {
    expect(defaultToneForFollowUpNumber(2)).toBe('direct');
  });
  it('follow_up_number 3+ → value-add', () => {
    expect(defaultToneForFollowUpNumber(3)).toBe('value-add');
    expect(defaultToneForFollowUpNumber(7)).toBe('value-add');
  });
  it('defaultSituationForFollowUpNumber maps correctly', () => {
    expect(defaultSituationForFollowUpNumber(1)).toBe('post_interview');
    expect(defaultSituationForFollowUpNumber(2)).toBe('no_response');
    expect(defaultSituationForFollowUpNumber(3)).toBe('keep_warm');
  });
});

// ─── ProductConfig shape ──────────────────────────────────────────────

describe('Follow-Up Email ProductConfig', () => {
  it('has the expected domain + single writer agent', () => {
    const cfg = createFollowUpEmailProductConfig();
    expect(cfg.domain).toBe('follow-up-email');
    expect(cfg.agents).toHaveLength(1);
    expect(cfg.agents[0].name).toBe('writer');
    expect(cfg.agents[0].stageMessage?.startStage).toBe('drafting');
  });

  it('writer agent has exactly one gate: email_review', () => {
    const cfg = createFollowUpEmailProductConfig();
    const gates = cfg.agents[0].gates ?? [];
    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe('email_review');
  });
});

// ─── createInitialState ───────────────────────────────────────────────

describe('createInitialState normalization', () => {
  const build = createFollowUpEmailProductConfig;

  it('defaults follow_up_number to 1 when absent', () => {
    const state = build().createInitialState('sess', 'user', {});
    expect(state.follow_up_number).toBe(1);
    expect(state.tone).toBe('warm');
    expect(state.situation).toBe('post_interview');
  });

  it('coerces non-integer follow_up_number to a sane integer', () => {
    const state = build().createInitialState('sess', 'user', { follow_up_number: 2.9 });
    expect(state.follow_up_number).toBe(2);
    expect(state.tone).toBe('direct');
  });

  it('floors follow_up_number below 1 back to 1', () => {
    const state = build().createInitialState('sess', 'user', { follow_up_number: 0 });
    expect(state.follow_up_number).toBe(1);
  });

  it('respects explicit tone override', () => {
    const state = build().createInitialState('sess', 'user', {
      follow_up_number: 2,
      tone: 'warm',
    });
    expect(state.tone).toBe('warm');
  });

  it('normalizes an unknown tone value back to the default', () => {
    const state = build().createInitialState('sess', 'user', {
      follow_up_number: 1,
      tone: 'sassy',
    });
    expect(state.tone).toBe('warm');
  });

  it('normalizes an unknown situation value back to the default', () => {
    const state = build().createInitialState('sess', 'user', {
      follow_up_number: 2,
      situation: 'bonkers',
    });
    expect(state.situation).toBe('no_response');
  });

  it('passes pre-fetched prior_interview_prep through to state', () => {
    const state = build().createInitialState('sess', 'user', {
      prior_interview_prep: { report_excerpt: 'summary text' },
    });
    expect(state.prior_interview_prep?.report_excerpt).toBe('summary text');
  });

  it('passes pre-fetched activity_signals through to state', () => {
    const state = build().createInitialState('sess', 'user', {
      activity_signals: {
        thank_you_sent: true,
        most_recent_interview_date: '2026-04-20',
        days_since_interview: 3,
      },
    });
    expect(state.activity_signals.thank_you_sent).toBe(true);
    expect(state.activity_signals.days_since_interview).toBe(3);
  });

  it('falls back to a safe empty activity_signals object when none supplied', () => {
    const state = build().createInitialState('sess', 'user', {});
    expect(state.activity_signals.thank_you_sent).toBe(false);
  });
});

// ─── buildAgentMessage ────────────────────────────────────────────────

describe('buildAgentMessage', () => {
  const cfg = createFollowUpEmailProductConfig();

  function stateWith(patch: Partial<FollowUpEmailState>): FollowUpEmailState {
    const base = cfg.createInitialState('sess', 'user', {
      follow_up_number: 1,
      company_name: 'Acme',
      role_title: 'VP Ops',
    });
    return { ...base, ...patch };
  }

  it('returns empty string for an unknown agent name', () => {
    const msg = cfg.buildAgentMessage('stranger', stateWith({}), {});
    expect(msg).toBe('');
  });

  it('includes sequence, tone, company, and role for the writer', () => {
    const msg = cfg.buildAgentMessage('writer', stateWith({}), {});
    expect(msg).toContain('Sequence #1');
    expect(msg).toContain('tone: warm');
    expect(msg).toContain('Acme');
    expect(msg).toContain('VP Ops');
  });

  it('injects prior_interview_prep excerpt when present', () => {
    const state = stateWith({
      prior_interview_prep: {
        report_excerpt: 'Discussed Q3 roadmap prioritization with hiring manager',
      },
    });
    const msg = cfg.buildAgentMessage('writer', state, {});
    expect(msg).toContain('Prior interview-prep report excerpt');
    expect(msg).toContain('Q3 roadmap prioritization');
  });

  it('notes thank-you-sent status and days-since-interview when available', () => {
    const state = stateWith({
      activity_signals: {
        thank_you_sent: true,
        most_recent_interview_date: '2026-04-18',
        days_since_interview: 5,
      },
    });
    const msg = cfg.buildAgentMessage('writer', state, {}) as string;
    expect(msg.toLowerCase()).toContain('thank-you note has already been sent');
    expect(msg).toContain('5 days ago');
  });

  it('surfaces revision_feedback for the writer to apply', () => {
    const state = stateWith({
      revision_feedback: 'Please shorten the body by one paragraph and be more direct.',
    });
    const msg = cfg.buildAgentMessage('writer', state, {});
    expect(msg).toContain('User revision feedback');
    expect(msg).toContain('shorten the body');
  });
});

// ─── email_review gate behavior ───────────────────────────────────────

describe('email_review gate onResponse', () => {
  const cfg = createFollowUpEmailProductConfig();
  const gate = cfg.agents[0].gates![0];

  const baseDraft: FollowUpEmailDraft = {
    situation: 'post_interview',
    tone: 'warm',
    follow_up_number: 1,
    subject: 'Re: VP Ops — follow-up',
    body: 'Original body.',
    tone_notes: 'warm',
    timing_guidance: 'send tomorrow',
  };

  function freshState(): FollowUpEmailState {
    return {
      ...cfg.createInitialState('sess', 'user', { follow_up_number: 1 }),
      draft: { ...baseDraft },
      revision_feedback: 'stale',
    };
  }

  it('approve (true) clears revision_feedback and does not trigger a rerun', () => {
    const s = freshState();
    gate.onResponse!(true, s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it("approve ('approved' literal) clears revision_feedback", () => {
    const s = freshState();
    gate.onResponse!('approved', s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('revise with {feedback} sets revision_feedback and requiresRerun returns true', () => {
    const s = freshState();
    gate.onResponse!({ feedback: 'Make it shorter and more assertive.' }, s);
    expect(s.revision_feedback).toBe('Make it shorter and more assertive.');
    expect(gate.requiresRerun!(s)).toBe(true);
  });

  it('revise with empty feedback clears revision_feedback (prevents phantom rerun)', () => {
    const s = freshState();
    gate.onResponse!({ feedback: '   ' }, s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('direct-edit with edited_subject + edited_body mutates draft and clears feedback', () => {
    const s = freshState();
    gate.onResponse!(
      { edited_subject: 'New subject', edited_body: 'New body.' },
      s,
    );
    expect(s.draft?.subject).toBe('New subject');
    expect(s.draft?.body).toBe('New body.');
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });

  it('direct-edit with only edited_body leaves subject alone', () => {
    const s = freshState();
    gate.onResponse!({ edited_body: 'Trimmed body.' }, s);
    expect(s.draft?.subject).toBe(baseDraft.subject);
    expect(s.draft?.body).toBe('Trimmed body.');
  });

  it('unknown response shape clears revision_feedback', () => {
    const s = freshState();
    gate.onResponse!({ totally_unrelated: 42 }, s);
    expect(s.revision_feedback).toBeUndefined();
  });

  it('gate.condition is false before a draft exists', () => {
    const s = cfg.createInitialState('sess', 'user', {});
    expect(gate.condition!(s)).toBe(false);
  });

  it('gate.condition is true once a draft is present', () => {
    const s = freshState();
    expect(gate.condition!(s)).toBe(true);
  });
});

// ─── Multi-turn refinement (end-to-end gate loop) ────────────────────

describe('Multi-turn refinement loop', () => {
  const cfg = createFollowUpEmailProductConfig();
  const gate = cfg.agents[0].gates![0];

  it('survives three rounds: revise → revise → approve', () => {
    const s: FollowUpEmailState = {
      ...cfg.createInitialState('sess', 'user', { follow_up_number: 1 }),
      draft: {
        situation: 'post_interview',
        tone: 'warm',
        follow_up_number: 1,
        subject: 'Subject v1',
        body: 'Body v1',
        tone_notes: '',
        timing_guidance: '',
      },
    };

    // Round 1: user asks for changes.
    gate.onResponse!({ feedback: 'shorter' }, s);
    expect(s.revision_feedback).toBe('shorter');
    expect(gate.requiresRerun!(s)).toBe(true);

    // The coordinator would rerun the writer, which would clear
    // revision_feedback in its phase onComplete after draft replacement.
    // We simulate: the writer produces a new draft and onComplete clears
    // the feedback.
    cfg.agents[0].onComplete!({ draft: { ...s.draft!, body: 'Body v2' } }, s, () => {});
    expect(s.revision_feedback).toBeUndefined();
    expect(s.draft?.body).toBe('Body v2');

    // Round 2: another revision.
    gate.onResponse!({ feedback: 'reference Q3 roadmap' }, s);
    expect(s.revision_feedback).toBe('reference Q3 roadmap');
    expect(gate.requiresRerun!(s)).toBe(true);
    cfg.agents[0].onComplete!({ draft: { ...s.draft!, body: 'Body v3' } }, s, () => {});
    expect(s.draft?.body).toBe('Body v3');

    // Round 3: approve.
    gate.onResponse!(true, s);
    expect(s.revision_feedback).toBeUndefined();
    expect(gate.requiresRerun!(s)).toBe(false);
  });
});

// ─── onComplete emits + validateAfterAgent ────────────────────────────

describe('Writer phase onComplete', () => {
  const cfg = createFollowUpEmailProductConfig();

  it('transfers scratchpad.draft to state.draft and emits the gate', () => {
    const state: FollowUpEmailState = {
      ...cfg.createInitialState('sess', 'user', { follow_up_number: 1 }),
      revision_feedback: 'leftover',
    };
    const events: FollowUpEmailSSEEvent[] = [];
    const draft: FollowUpEmailDraft = {
      situation: 'post_interview',
      tone: 'warm',
      follow_up_number: 1,
      subject: 'Subject',
      body: 'Body',
      tone_notes: '',
      timing_guidance: '',
    };

    cfg.agents[0].onComplete!({ draft }, state, (e) => events.push(e));

    expect(state.draft).toEqual(draft);
    expect(state.revision_feedback).toBeUndefined();
    const emittedTypes = events.map((e) => e.type);
    expect(emittedTypes).toContain('email_draft_ready');
    expect(emittedTypes).toContain('pipeline_gate');
    const gateEvent = events.find((e) => e.type === 'pipeline_gate');
    expect(gateEvent && (gateEvent as { gate: string }).gate).toBe('email_review');
  });

  it('does not emit when scratchpad has no draft', () => {
    const state = cfg.createInitialState('sess', 'user', {});
    const events: FollowUpEmailSSEEvent[] = [];
    cfg.agents[0].onComplete!({}, state, (e) => events.push(e));
    expect(events).toHaveLength(0);
  });
});

describe('validateAfterAgent', () => {
  const cfg = createFollowUpEmailProductConfig();

  it('throws when writer finishes without a draft', () => {
    const state = cfg.createInitialState('sess', 'user', {});
    expect(() => cfg.validateAfterAgent!('writer', state)).toThrow(/did not produce/i);
  });

  it('passes once a draft is set', () => {
    const state: FollowUpEmailState = {
      ...cfg.createInitialState('sess', 'user', {}),
      draft: {
        situation: 'post_interview',
        tone: 'warm',
        follow_up_number: 1,
        subject: 'S',
        body: 'B',
        tone_notes: '',
        timing_guidance: '',
      },
    };
    expect(() => cfg.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('is a no-op for other agent names', () => {
    const state = cfg.createInitialState('sess', 'user', {});
    expect(() => cfg.validateAfterAgent!('ghost', state)).not.toThrow();
  });
});

describe('finalizeResult', () => {
  const cfg = createFollowUpEmailProductConfig();

  it('emits email_complete when a draft exists', () => {
    const draft: FollowUpEmailDraft = {
      situation: 'post_interview',
      tone: 'warm',
      follow_up_number: 1,
      subject: 'S',
      body: 'B',
      tone_notes: '',
      timing_guidance: '',
    };
    const state: FollowUpEmailState = {
      ...cfg.createInitialState('sess', 'user', {}),
      draft,
    };
    const events: FollowUpEmailSSEEvent[] = [];
    const result = cfg.finalizeResult(state, {}, (e) => events.push(e)) as { draft?: FollowUpEmailDraft };
    expect(result.draft).toEqual(draft);
    expect(events.some((e) => e.type === 'email_complete')).toBe(true);
  });

  it('does not emit email_complete when no draft ever landed', () => {
    const state = cfg.createInitialState('sess', 'user', {});
    const events: FollowUpEmailSSEEvent[] = [];
    cfg.finalizeResult(state, {}, (e) => events.push(e));
    expect(events.some((e) => e.type === 'email_complete')).toBe(false);
  });
});
