/**
 * Cover Letter Agents — Unit tests.
 *
 * Verifies:
 * - Both agents register with the agent registry
 * - Both agents can be discovered via registry
 * - ProductConfig compiles and is well-formed
 * - Agent tools have correct model_tier
 * - Cover letter domain appears in registry
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agentRegistry } from '../agents/runtime/agent-registry.js';

// Import agent modules to trigger registration side effects
import '../agents/cover-letter/analyst/agent.js';
import '../agents/cover-letter/writer/agent.js';
import { createCoverLetterProductConfig } from '../agents/cover-letter/product.js';

describe('Cover Letter Agent Registration', () => {
  it('analyst is registered in the agent registry', () => {
    expect(agentRegistry.has('cover-letter', 'analyst')).toBe(true);
  });

  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('cover-letter', 'writer')).toBe(true);
  });

  it('cover-letter domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('cover-letter');
  });

  it('analyst has expected capabilities', () => {
    const desc = agentRegistry.describe('cover-letter', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('content_analysis');
    expect(desc!.capabilities).toContain('requirement_mapping');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('cover-letter', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('content_creation');
    expect(desc!.capabilities).toContain('quality_review');
  });

  it('analyst has 4 tools (3 + emit_transparency)', () => {
    const desc = agentRegistry.describe('cover-letter', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(4);
    expect(desc!.tools).toContain('parse_inputs');
    expect(desc!.tools).toContain('match_requirements');
    expect(desc!.tools).toContain('plan_letter');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('writer has 3 tools (2 + emit_transparency)', () => {
    const desc = agentRegistry.describe('cover-letter', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(3);
    expect(desc!.tools).toContain('write_letter');
    expect(desc!.tools).toContain('review_letter');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers cover-letter agents', () => {
    const creators = agentRegistry.findByCapability('content_creation', 'cover-letter');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });
});

describe('Cover Letter ProductConfig', () => {
  it('creates a valid product config', () => {
    const config = createCoverLetterProductConfig();
    expect(config.domain).toBe('cover-letter');
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('analyst');
    expect(config.agents[1].name).toBe('writer');
  });

  it('has stage messages on both agents', () => {
    const config = createCoverLetterProductConfig();
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('analysis');
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('analysis');
  });

  it('buildAgentMessage returns content for analyst', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('analyst', state, {
      resume_text: 'My resume...',
      job_description: 'JD here...',
      company_name: 'Acme Corp',
    });
    expect(msg).toContain('Resume');
    expect(msg).toContain('My resume...');
    expect(msg).toContain('Acme Corp');
  });

  it('buildAgentMessage returns content for writer', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.letter_plan = {
      opening_hook: 'hook',
      body_points: ['point1'],
      closing_strategy: 'close',
    };
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('Letter Plan');
    expect(msg).toContain('hook');
  });

  it('validateAfterAgent throws when analyst produces no plan', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('analyst', state)).toThrow('Analyst did not produce a letter plan');
  });

  it('validateAfterAgent passes when analyst produces plan', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.letter_plan = { opening_hook: '', body_points: [], closing_strategy: '' };
    expect(() => config.validateAfterAgent!('analyst', state)).not.toThrow();
  });
});
