/**
 * Thank You Note Agent (#18) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * note format type constants, and ProductConfig behavior.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies before any imports that pull them in
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
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
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ─── Types & Constants ───────────────────────────────────────────────

import {
  NOTE_FORMATS,
  NOTE_FORMAT_LABELS,
} from '../agents/thank-you-note/types.js';

import type {
  ThankYouNoteState,
  ThankYouNoteSSEEvent,
} from '../agents/thank-you-note/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_TIMELINESS,
  RULE_2_PERSONALIZATION,
  RULE_3_EXECUTIVE_TONE,
  RULE_4_FORMAT_GUIDANCE,
  RULE_5_ANTI_PATTERNS,
  RULE_6_SELF_REVIEW,
  THANK_YOU_NOTE_RULES,
} from '../agents/thank-you-note/knowledge/rules.js';

// ─── Agent Registry ──────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Configs (trigger registration side effects) ───────────────

import { writerConfig } from '../agents/thank-you-note/writer/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { writerTools } from '../agents/thank-you-note/writer/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createThankYouNoteProductConfig } from '../agents/thank-you-note/product.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Thank You Note Agent Registration', () => {
  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('thank-you-note', 'writer')).toBe(true);
  });

  it('thank-you-note domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('thank-you-note');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('thank-you-note', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('note_writing');
    expect(desc!.capabilities).toContain('interview_analysis');
    expect(desc!.capabilities).toContain('personalization');
    expect(desc!.capabilities).toContain('format_adaptation');
  });

  it('writer has correct tool count (5 + emit_transparency = 6)', () => {
    const desc = agentRegistry.describe('thank-you-note', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(6);
  });

  it('writer tools include expected names', () => {
    const desc = agentRegistry.describe('thank-you-note', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('analyze_interview_context');
    expect(desc!.tools).toContain('write_thank_you_note');
    expect(desc!.tools).toContain('personalize_per_recipient');
    expect(desc!.tools).toContain('assemble_note_set');
    expect(desc!.tools).toContain('emit_timing_warning');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers writer for note_writing', () => {
    const creators = agentRegistry.findByCapability('note_writing', 'thank-you-note');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('findByCapability discovers writer for personalization', () => {
    const creators = agentRegistry.findByCapability('personalization', 'thank-you-note');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('writer model is primary', () => {
    expect(writerConfig.model).toBe('primary');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Thank You Note Tool Model Tiers', () => {
  it('writer tools have correct model tiers', () => {
    const tiers = Object.fromEntries(writerTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.analyze_interview_context).toBe('mid');
    expect(tiers.write_thank_you_note).toBe('primary');
    expect(tiers.personalize_per_recipient).toBe('mid');
    expect(tiers.assemble_note_set).toBe('mid');
    expect(tiers.emit_timing_warning).toBe('orchestrator');
  });

  it('all tools have descriptions (length > 20)', () => {
    for (const tool of writerTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of writerTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('write_thank_you_note description mentions recipient_role calibration', () => {
    const writeTool = writerTools.find((t) => t.name === 'write_thank_you_note');
    expect(writeTool).toBeDefined();
    expect(writeTool!.description.toLowerCase()).toContain('recipient_role');
  });

  it('analyze_interview_context description mentions themes', () => {
    const analyzeTool = writerTools.find((t) => t.name === 'analyze_interview_context');
    expect(analyzeTool).toBeDefined();
    expect(analyzeTool!.description.toLowerCase()).toContain('themes');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Thank You Note Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_TIMELINESS', value: RULE_1_TIMELINESS },
    { name: 'RULE_2_PERSONALIZATION', value: RULE_2_PERSONALIZATION },
    { name: 'RULE_3_EXECUTIVE_TONE', value: RULE_3_EXECUTIVE_TONE },
    { name: 'RULE_4_FORMAT_GUIDANCE', value: RULE_4_FORMAT_GUIDANCE },
    { name: 'RULE_5_ANTI_PATTERNS', value: RULE_5_ANTI_PATTERNS },
    { name: 'RULE_6_SELF_REVIEW', value: RULE_6_SELF_REVIEW },
  ];

  it('all 7 rules are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('THANK_YOU_NOTE_RULES combines all 7 rules', () => {
    expect(THANK_YOU_NOTE_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(THANK_YOU_NOTE_RULES).toContain(rule.value);
    }
  });

  it('RULE_0_PHILOSOPHY mentions gratitude', () => {
    expect(RULE_0_PHILOSOPHY.toLowerCase()).toContain('gratitude');
  });

  it('RULE_1_TIMELINESS mentions 24-hour', () => {
    expect(RULE_1_TIMELINESS).toContain('24-hour');
  });

  it('RULE_2_PERSONALIZATION mentions specific topic', () => {
    expect(RULE_2_PERSONALIZATION.toLowerCase()).toContain('specific');
  });

  it('RULE_3_EXECUTIVE_TONE mentions peer-level', () => {
    expect(RULE_3_EXECUTIVE_TONE.toLowerCase()).toContain('peer-level');
  });

  it('RULE_4_FORMAT_GUIDANCE mentions email, handwritten, and linkedin', () => {
    expect(RULE_4_FORMAT_GUIDANCE).toContain('Email');
    expect(RULE_4_FORMAT_GUIDANCE).toContain('Handwritten');
    expect(RULE_4_FORMAT_GUIDANCE).toContain('LinkedIn');
  });

  it('RULE_5_ANTI_PATTERNS mentions desperation', () => {
    expect(RULE_5_ANTI_PATTERNS.toLowerCase()).toContain('desperation');
  });

  it('RULE_6_SELF_REVIEW mentions personalization depth', () => {
    expect(RULE_6_SELF_REVIEW.toLowerCase()).toContain('personalization depth');
  });

  it('each rule has some markdown formatting', () => {
    for (const rule of rules) {
      const hasMarkdown = rule.value.includes('#') || rule.value.includes('- ') || rule.value.includes('*');
      expect(hasMarkdown).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Type Constants
// ═══════════════════════════════════════════════════════════════════════

describe('Thank You Note Type Constants', () => {
  it('NOTE_FORMATS has exactly 3 entries', () => {
    expect(NOTE_FORMATS).toHaveLength(3);
  });

  it('all note formats have labels', () => {
    for (const format of NOTE_FORMATS) {
      expect(NOTE_FORMAT_LABELS[format]).toBeTruthy();
      expect(typeof NOTE_FORMAT_LABELS[format]).toBe('string');
    }
  });

  it('NOTE_FORMATS includes email, handwritten, linkedin_message', () => {
    expect(NOTE_FORMATS).toContain('email');
    expect(NOTE_FORMATS).toContain('handwritten');
    expect(NOTE_FORMATS).toContain('linkedin_message');
  });

  it('NOTE_FORMATS are in correct order', () => {
    expect(NOTE_FORMATS).toEqual(['email', 'handwritten', 'linkedin_message']);
  });

  it('NOTE_FORMAT_LABELS values are human-readable', () => {
    expect(NOTE_FORMAT_LABELS.email).toBe('Email');
    expect(NOTE_FORMAT_LABELS.handwritten).toBe('Handwritten Note');
    expect(NOTE_FORMAT_LABELS.linkedin_message).toBe('LinkedIn Message');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Thank You Note ProductConfig', () => {
  const config = createThankYouNoteProductConfig();

  it('creates a valid product config with domain thank-you-note', () => {
    expect(config.domain).toBe('thank-you-note');
  });

  it('has 1 agent (writer) — single-agent pipeline', () => {
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('writer');
  });

  it('has stage message on writer (startStage: writing)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state with current_stage=writing', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('writing');
  });

  it('createInitialState defaults recipients to empty array when not specified', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.recipients).toEqual([]);
  });

  it('createInitialState defaults notes to empty array', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.notes).toEqual([]);
  });

  it('createInitialState preserves shared_context when provided', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Trusted operator who leaves interviewers with high-confidence follow-through';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    expect(state.shared_context?.careerNarrative.careerArc).toBe('Trusted operator who leaves interviewers with high-confidence follow-through');
  });

  it('createInitialState accepts recipients input with normalized roles', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      recipients: [
        { role: 'hiring_manager', name: 'Jane Doe', title: 'VP Engineering', topics_discussed: ['system design'] },
      ],
    });
    expect(state.recipients).toHaveLength(1);
    expect(state.recipients[0].name).toBe('Jane Doe');
    expect(state.recipients[0].role).toBe('hiring_manager');
  });

  it('createInitialState coerces unknown role to "other"', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      recipients: [{ role: 'bogus-role', name: 'Sam' }],
    });
    expect(state.recipients[0].role).toBe('other');
  });

  it('createInitialState drops recipients missing a name', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      recipients: [
        { role: 'hiring_manager', name: '' },
        { role: 'hiring_manager', name: 'Real Name' },
      ],
    });
    expect(state.recipients).toHaveLength(1);
    expect(state.recipients[0].name).toBe('Real Name');
  });

  it('createInitialState accepts company and role', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      company: 'Acme Corp',
      role: 'VP Operations',
    });
    expect(state.interview_context.company).toBe('Acme Corp');
    expect(state.interview_context.role).toBe('VP Operations');
  });

  it('buildAgentMessage for writer includes resume text', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      company: 'Acme Corp',
      role: 'VP Operations',
    });
    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Jane Smith, 15 years of technology leadership...',
    });
    expect(msg).toContain('Jane Smith');
    expect(msg).toContain('Resume');
  });

  it('buildAgentMessage for writer includes interview context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      company: 'Acme Corp',
      role: 'VP Operations',
      recipients: [
        { role: 'hiring_manager', name: 'Bob Jones', title: 'CEO', topics_discussed: ['strategy', 'growth'] },
      ],
    });
    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Acme Corp');
    expect(msg).toContain('VP Operations');
    expect(msg).toContain('Bob Jones');
    expect(msg).toContain('strategy');
  });

  it('buildAgentMessage for writer includes Career Profile when in platform_context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      company: 'Acme Corp',
      role: 'VP Ops',
      platform_context: {
        career_profile: {
          version: 'career_profile_v2',
          source: 'career_profile',
          generated_at: '2026-03-16T00:00:00.000Z',
          targeting: {
            target_roles: ['VP Operations'],
            target_industries: ['Manufacturing'],
            seniority: 'VP',
            transition_type: 'growth',
            preferred_company_environments: [],
          },
          positioning: {
            core_strengths: ['Transformation'],
            proof_themes: ['Execution'],
            differentiators: ['Operator'],
            adjacent_positioning: [],
            positioning_statement: 'Digital transformation operator',
            narrative_summary: 'Operator',
            leadership_scope: 'Enterprise',
            scope_of_responsibility: 'Operations',
          },
          narrative: {
            colleagues_came_for_what: '',
            known_for_what: '',
            why_not_me: '',
            story_snippet: '',
          },
          preferences: {
            must_haves: [],
            constraints: [],
            compensation_direction: '',
          },
          coaching: {
            financial_segment: '',
            emotional_state: '',
            coaching_tone: '',
            urgency_score: 0,
            recommended_starting_point: '',
          },
          evidence_positioning_statements: [],
          profile_signals: {
            clarity: 'green',
            alignment: 'green',
            differentiation: 'green',
          },
          completeness: {
            overall_score: 100,
            dashboard_state: 'strong',
            sections: [],
          },
          profile_summary: 'Digital transformation leader',
        },
      },
    });
    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Digital transformation leader');
  });

  it('buildAgentMessage for writer includes canonical shared context when legacy room context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Known for following through on the promises made in the room';
    sharedContext.positioningStrategy.positioningAngle = 'Executive follow-up should reinforce fit without sounding canned';
    const state = config.createInitialState('sess-1', 'user-1', {
      company: 'Acme Corp',
      role: 'VP Operations',
      shared_context: sharedContext,
    });

    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Resume here...',
    });

    expect(msg).toContain('Known for following through on the promises made in the room');
    expect(msg).toContain('Executive follow-up should reinforce fit without sounding canned');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when writer produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('final report');
  });

  it('validateAfterAgent throws when writer produces no notes', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Report';
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('notes');
  });

  it('validateAfterAgent passes when writer produces final_report and notes', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Thank You Note Collection';
    state.notes = [{
      recipient_role: 'hiring_manager',
      recipient_name: 'Jane',
      recipient_title: 'CEO',
      format: 'email' as const,
      content: 'Thank you for the conversation...',
      personalization_notes: 'Referenced strategy discussion',
      quality_score: 85,
    }];
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('finalizeResult emits collection_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Thank You Note Collection Report';
    state.quality_score = 88;
    state.notes = [
      {
        recipient_role: 'hiring_manager',
        recipient_name: 'Jane',
        recipient_title: 'CEO',
        format: 'email',
        content: 'A polished thank-you note...',
        personalization_notes: 'Referenced strategy discussion',
        quality_score: 88,
      },
    ];

    const events: ThankYouNoteSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('collection_complete');
    const evt = events[0] as Extract<ThankYouNoteSSEEvent, { type: 'collection_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.report).toBe('# Thank You Note Collection Report');
    expect(evt.quality_score).toBe(88);
    expect(evt.note_count).toBe(1);

    const res = result as Record<string, unknown>;
    expect(res.report).toBe('# Thank You Note Collection Report');
    expect(res.quality_score).toBe(88);
  });

  it('onComplete transfers notes, final_report, quality_score from scratchpad to state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      notes: [
        {
          recipient_role: 'hiring_manager',
          recipient_name: 'Jane',
          recipient_title: 'CEO',
          format: 'email',
          content: 'A thank-you note...',
          personalization_notes: 'Referenced strategy',
          quality_score: 90,
        },
      ],
      final_report: '# Thank You Note Collection — Jane Smith',
      quality_score: 90,
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].recipient_name).toBe('Jane');
    expect(state.final_report).toBe('# Thank You Note Collection — Jane Smith');
    expect(state.quality_score).toBe(90);
  });
});
