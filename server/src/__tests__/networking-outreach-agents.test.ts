/**
 * Networking Outreach Agent (#13) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * message types, and ProductConfig behavior.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock supabase before any imports that trigger it
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({ data: null, error: null }),
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
  },
}));

// ─── Types & Constants ───────────────────────────────────────────────

import {
  MESSAGE_SEQUENCE,
  MESSAGE_TYPE_LABELS,
  MESSAGE_TIMING,
} from '../agents/networking-outreach/types.js';

import type {
  OutreachMessageType,
  NetworkingOutreachState,
  NetworkingOutreachSSEEvent,
  TargetAnalysis,
  CommonGround,
  ConnectionPath,
  OutreachPlan,
  OutreachMessage,
} from '../agents/networking-outreach/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_CONNECTION_REQUEST,
  RULE_2_FOLLOW_UPS,
  RULE_3_VALUE_OFFER,
  RULE_4_MEETING_REQUEST,
  RULE_5_PERSONALIZATION,
  RULE_6_TONE,
  RULE_7_SELF_REVIEW,
  NETWORKING_OUTREACH_RULES,
} from '../agents/networking-outreach/knowledge/rules.js';

// ─── Agent Configs ───────────────────────────────────────────────────

import { researcherConfig } from '../agents/networking-outreach/researcher/agent.js';
import { writerConfig } from '../agents/networking-outreach/writer/agent.js';

// ─── Researcher Tools ────────────────────────────────────────────────

import { researcherTools } from '../agents/networking-outreach/researcher/tools.js';

// ─── Writer Tools ────────────────────────────────────────────────────

import { writerTools } from '../agents/networking-outreach/writer/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createNetworkingOutreachProductConfig } from '../agents/networking-outreach/product.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ═══════════════════════════════════════════════════════════════════════
// Message Types & Constants
// ═══════════════════════════════════════════════════════════════════════

describe('Networking Outreach — Message Types', () => {
  it('MESSAGE_SEQUENCE has 5 message types in order', () => {
    expect(MESSAGE_SEQUENCE).toEqual([
      'connection_request',
      'follow_up_1',
      'follow_up_2',
      'value_offer',
      'meeting_request',
    ]);
  });

  it('MESSAGE_TYPE_LABELS has labels for all message types', () => {
    for (const type of MESSAGE_SEQUENCE) {
      expect(MESSAGE_TYPE_LABELS[type]).toBeTruthy();
      expect(typeof MESSAGE_TYPE_LABELS[type]).toBe('string');
    }
  });

  it('MESSAGE_TIMING has timing for all message types', () => {
    for (const type of MESSAGE_SEQUENCE) {
      expect(MESSAGE_TIMING[type]).toBeTruthy();
      expect(typeof MESSAGE_TIMING[type]).toBe('string');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Networking Outreach — Knowledge Rules', () => {
  it('RULE_0 covers networking philosophy', () => {
    expect(RULE_0_PHILOSOPHY).toContain('NETWORKING PHILOSOPHY');
    expect(RULE_0_PHILOSOPHY).toContain('Give before you ask');
  });

  it('RULE_1 covers connection request with 300 char limit', () => {
    expect(RULE_1_CONNECTION_REQUEST).toContain('CONNECTION REQUEST');
    expect(RULE_1_CONNECTION_REQUEST).toContain('300 characters');
  });

  it('RULE_2 covers follow-up messages with timing', () => {
    expect(RULE_2_FOLLOW_UPS).toContain('FOLLOW-UP');
    expect(RULE_2_FOLLOW_UPS).toContain('3 days after acceptance');
  });

  it('RULE_3 covers value offer types', () => {
    expect(RULE_3_VALUE_OFFER).toContain('VALUE OFFER');
    expect(RULE_3_VALUE_OFFER).toContain('Insight sharing');
  });

  it('RULE_4 covers meeting request guidelines', () => {
    expect(RULE_4_MEETING_REQUEST).toContain('MEETING REQUEST');
    expect(RULE_4_MEETING_REQUEST).toContain('15-20 minutes');
  });

  it('RULE_5 covers personalization hooks', () => {
    expect(RULE_5_PERSONALIZATION).toContain('PERSONALIZATION');
    expect(RULE_5_PERSONALIZATION).toContain('Shared experience');
  });

  it('RULE_6 covers tone and voice', () => {
    expect(RULE_6_TONE).toContain('TONE');
    expect(RULE_6_TONE).toContain('Warm but not effusive');
  });

  it('RULE_7 covers self-review checklist', () => {
    expect(RULE_7_SELF_REVIEW).toContain('SELF-REVIEW');
    expect(RULE_7_SELF_REVIEW).toContain('Character limit test');
  });

  it('NETWORKING_OUTREACH_RULES combines all 10 rules', () => {
    expect(NETWORKING_OUTREACH_RULES).toContain('RULE 0');
    expect(NETWORKING_OUTREACH_RULES).toContain('RULE 7');
    expect(NETWORKING_OUTREACH_RULES).toContain('RULE 8');
    expect(NETWORKING_OUTREACH_RULES).toContain('RULE 9');
    expect(NETWORKING_OUTREACH_RULES.split('---').length).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Networking Outreach — Agent Registration', () => {
  describe('Researcher agent', () => {
    it('has correct identity', () => {
      expect(researcherConfig.identity.name).toBe('researcher');
      expect(researcherConfig.identity.domain).toBe('networking-outreach');
    });

    it('has 4 capabilities', () => {
      expect(researcherConfig.capabilities).toHaveLength(4);
      expect(researcherConfig.capabilities).toContain('target_analysis');
      expect(researcherConfig.capabilities).toContain('common_ground_identification');
      expect(researcherConfig.capabilities).toContain('connection_assessment');
      expect(researcherConfig.capabilities).toContain('outreach_planning');
    });

    it('uses orchestrator model', () => {
      expect(researcherConfig.model).toBe('orchestrator');
    });

    it('has 7 max rounds', () => {
      expect(researcherConfig.max_rounds).toBe(7);
    });

    it('has tools including emit_transparency', () => {
      const toolNames = researcherConfig.tools.map((t) => t.name);
      expect(toolNames).toContain('analyze_target');
      expect(toolNames).toContain('find_common_ground');
      expect(toolNames).toContain('assess_connection_path');
      expect(toolNames).toContain('plan_outreach_sequence');
      expect(toolNames).toContain('emit_transparency');
    });
  });

  describe('Writer agent', () => {
    it('has correct identity', () => {
      expect(writerConfig.identity.name).toBe('writer');
      expect(writerConfig.identity.domain).toBe('networking-outreach');
    });

    it('has 4 capabilities', () => {
      expect(writerConfig.capabilities).toHaveLength(4);
      expect(writerConfig.capabilities).toContain('outreach_writing');
      expect(writerConfig.capabilities).toContain('sequence_assembly');
    });

    it('uses primary model', () => {
      expect(writerConfig.model).toBe('primary');
    });

    it('has 8 max rounds', () => {
      expect(writerConfig.max_rounds).toBe(8);
    });

    it('has tools including emit_transparency', () => {
      const toolNames = writerConfig.tools.map((t) => t.name);
      expect(toolNames).toContain('write_connection_request');
      expect(toolNames).toContain('write_follow_up');
      expect(toolNames).toContain('write_value_offer');
      expect(toolNames).toContain('write_meeting_request');
      expect(toolNames).toContain('assemble_sequence');
      expect(toolNames).toContain('emit_transparency');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Networking Outreach — Tool Model Tiers', () => {
  it('researcher tools use correct tiers', () => {
    const tiers = Object.fromEntries(researcherTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.analyze_target).toBe('light');
    expect(tiers.find_common_ground).toBe('mid');
    expect(tiers.assess_connection_path).toBe('mid');
    expect(tiers.plan_outreach_sequence).toBe('mid');
  });

  it('writer tools use correct tiers', () => {
    const tiers = Object.fromEntries(writerTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.write_connection_request).toBe('primary');
    expect(tiers.write_follow_up).toBe('primary');
    expect(tiers.write_value_offer).toBe('primary');
    expect(tiers.write_meeting_request).toBe('primary');
    expect(tiers.assemble_sequence).toBe('mid');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Networking Outreach — ProductConfig', () => {
  const config = createNetworkingOutreachProductConfig();

  it('has domain networking-outreach', () => {
    expect(config.domain).toBe('networking-outreach');
  });

  it('has 2 agents: researcher → writer', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('researcher');
    expect(config.agents[1].name).toBe('writer');
  });

  it('researcher stage message references research', () => {
    expect(config.agents[0].stageMessage?.startStage).toBe('research');
    expect(config.agents[0].stageMessage?.start).toContain('target');
  });

  it('writer stage message references writing', () => {
    expect(config.agents[1].stageMessage?.startStage).toBe('writing');
    expect(config.agents[1].stageMessage?.start).toContain('outreach');
  });

  it('createInitialState produces valid state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      target_input: {
        target_name: 'Jane Doe',
        target_title: 'VP Ops',
        target_company: 'Acme',
      },
    });
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('research');
    expect(state.messages).toEqual([]);
  });

  it('createInitialState preserves shared_context when provided', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Operator who helps leaders stabilize and scale execution';
    const state = config.createInitialState('sess-1', 'user-1', {
      shared_context: sharedContext,
    });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Operator who helps leaders stabilize and scale execution');
  });

  it('buildAgentMessage for researcher includes target info', async () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      target_input: {
        target_name: 'Jane Doe',
        target_title: 'VP Ops',
        target_company: 'Acme',
      },
    });
    const msg = await config.buildAgentMessage('researcher', state, {
      resume_text: 'John Doe, 20 years experience...',
      target_input: {
        target_name: 'Jane Doe',
        target_title: 'VP Ops',
        target_company: 'Acme',
      },
    });
    expect(msg).toContain('Jane Doe');
    expect(msg).toContain('VP Ops');
    expect(msg).toContain('Acme');
    expect(msg).toContain('Objective');
  });

  it('buildAgentMessage for writer includes sequence objectives', async () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = await config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('connection request');
    expect(msg).toContain('meeting request');
    expect(msg).toContain('assembled sequence');
  });

  it('buildAgentMessage for researcher includes shared context when legacy room context is absent', async () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Known for helping operators rebuild execution discipline under pressure';
    sharedContext.positioningStrategy.positioningAngle = 'Operations leader who turns pressure into clarity';
    const state = config.createInitialState('sess-1', 'user-1', {
      target_input: {
        target_name: 'Jane Doe',
        target_title: 'VP Ops',
        target_company: 'Acme',
      },
      shared_context: sharedContext,
    });

    const msg = await config.buildAgentMessage('researcher', state, {
      resume_text: 'John Doe, 20 years experience...',
      target_input: {
        target_name: 'Jane Doe',
        target_title: 'VP Ops',
        target_company: 'Acme',
      },
    });

    expect(msg).toContain('Known for helping operators rebuild execution discipline under pressure');
    expect(msg).toContain('Operations leader who turns pressure into clarity');
  });

  it('buildAgentMessage for unknown agent returns empty', async () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(await config.buildAgentMessage('unknown', state, {})).toBe('');
  });

  it('finalizeResult emits sequence_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Outreach Sequence';
    state.quality_score = 85;
    state.messages = [
      { type: 'connection_request', subject: '', body: 'Hi', char_count: 2, personalization_hooks: [], timing: '', quality_score: 85 },
    ] as OutreachMessage[];

    const events: NetworkingOutreachSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('sequence_complete');
    const evt = events[0] as Extract<NetworkingOutreachSSEEvent, { type: 'sequence_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.quality_score).toBe(85);
    expect(evt.message_count).toBe(1);
  });

  it('validateAfterAgent throws if researcher produces no target_analysis', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('researcher', state)).toThrow('target analysis');
  });

  it('validateAfterAgent passes if researcher produces target_analysis', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.target_analysis = {
      target_name: 'Jane',
      target_title: 'VP',
      target_company: 'Acme',
      professional_interests: [],
      recent_activity: [],
      industry: 'Tech',
      seniority: 'VP',
    };
    expect(() => config.validateAfterAgent!('researcher', state)).not.toThrow();
  });

  it('validateAfterAgent throws if writer produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.messages = [{ type: 'connection_request', subject: '', body: 'Hi', char_count: 2, personalization_hooks: [], timing: '', quality_score: 80 }] as OutreachMessage[];
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('final report');
  });

  it('validateAfterAgent throws if writer produces no messages', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Report';
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('outreach messages');
  });

  it('validateAfterAgent passes if writer produces report and messages', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Report';
    state.messages = [{ type: 'connection_request', subject: '', body: 'Hi', char_count: 2, personalization_hooks: [], timing: '', quality_score: 80 }] as OutreachMessage[];
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('emitError emits pipeline_error event', () => {
    const events: NetworkingOutreachSSEEvent[] = [];
    config.emitError!('research', 'Something failed', (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pipeline_error');
  });

  it('researcher onComplete copies research state from scratchpad', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      target_analysis: {
        target_name: 'Jane',
        target_title: 'VP',
        target_company: 'Acme',
        professional_interests: [],
        recent_activity: [],
        industry: 'Tech',
        seniority: 'VP',
      },
      common_ground: {
        shared_connections: ['Industry events'],
        industry_overlap: ['Manufacturing'],
        complementary_expertise: [],
        mutual_interests: [],
        recommended_angle: 'Industry overlap',
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.target_analysis?.target_name).toBe('Jane');
    expect(state.common_ground?.recommended_angle).toBe('Industry overlap');
  });

  it('writer onComplete copies messages and report from scratchpad', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      final_report: '# Report',
      quality_score: 90,
      messages: [{ type: 'connection_request', body: 'Hi' }],
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.final_report).toBe('# Report');
    expect(state.quality_score).toBe(90);
    expect(state.messages).toHaveLength(1);
  });
});
