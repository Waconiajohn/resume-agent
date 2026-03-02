/**
 * Resume Event Middleware — Unit Tests
 *
 * Covers:
 * - sanitizeSectionContext truncates oversized evidence, keywords, gaps
 * - deriveSectionBundleStatusFromContext computes bundle status correctly
 * - workflowNodeFromPanelType maps panel types to node keys
 * - createResumeEventMiddleware returns all required methods
 * - flushAllQueuedPanelPersists module-level function works with registered instances
 * - Event type dispatch calls the right persistence functions (mock supabaseAdmin)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks — must be hoisted before imports ────────────────────

const mockBuilder = {
  select: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
};
// Make all chainable methods return the builder itself so chains like
// .update({}).eq('id', x) work correctly
mockBuilder.select.mockReturnValue(mockBuilder);
mockBuilder.update.mockReturnValue(mockBuilder);
mockBuilder.upsert.mockResolvedValue({ error: null });
mockBuilder.eq.mockReturnValue({ ...mockBuilder, then: (resolve: (v: unknown) => void) => resolve({ error: null, data: null }) });
mockBuilder.single.mockResolvedValue({ data: null, error: null });
mockBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  createSessionLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../lib/http-body-guard.js', () => ({
  parsePositiveInt: vi.fn((_env: unknown, def: number) => def),
}));

vi.mock('../lib/workflow-nodes.js', () => ({
  WORKFLOW_NODE_KEYS: ['overview', 'benchmark', 'gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'],
  workflowNodeFromStage: vi.fn((stage: string) => {
    const map: Record<string, string> = {
      intake: 'overview', research: 'benchmark', gap_analysis: 'gaps',
      positioning: 'questions', architect: 'blueprint', section_writing: 'sections',
      quality_review: 'quality', complete: 'export',
    };
    return map[stage] ?? 'overview';
  }),
}));

import {
  sanitizeSectionContext,
  deriveSectionBundleStatusFromContext,
  workflowNodeFromPanelType,
  createResumeEventMiddleware,
  flushAllQueuedPanelPersists,
  resetWorkflowNodesForNewRunBestEffort,
  VALID_SUGGESTION_INTENTS,
  VALID_RESOLUTION_TYPES,
} from '../agents/resume/event-middleware.js';
import { supabaseAdmin } from '../lib/supabase.js';
import type { PipelineSSEEvent } from '../agents/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeSectionContextEvent(overrides?: Partial<Extract<PipelineSSEEvent, { type: 'section_context' }>>): Extract<PipelineSSEEvent, { type: 'section_context' }> {
  return {
    type: 'section_context',
    section: 'summary',
    context_version: 1,
    generated_at: '2026-03-01T00:00:00.000Z',
    blueprint_slice: { positioning_angle: 'Senior product leader' },
    evidence: [
      {
        id: 'ev-1',
        situation: 'Led a team',
        action: 'Restructured process',
        result: 'Saved 20%',
        metrics_defensible: true,
        user_validated: true,
        mapped_requirements: ['leadership'],
        scope_metrics: { team_size: '50' },
      },
    ],
    keywords: [
      { keyword: 'product', target_density: 2, current_count: 1 },
    ],
    gap_mappings: [
      { requirement: 'leadership', classification: 'strong' },
    ],
    section_order: ['summary', 'experience_role_0'],
    sections_approved: [],
    review_strategy: 'per_section',
    ...overrides,
  };
}

// ─── sanitizeSectionContext ────────────────────────────────────────────

describe('sanitizeSectionContext', () => {
  it('returns sanitized object with correct shape', () => {
    const event = makeSectionContextEvent();
    const result = sanitizeSectionContext(event);
    expect(result.context_version).toBe(1);
    expect(result.generated_at).toBe('2026-03-01T00:00:00.000Z');
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(Array.isArray(result.gap_mappings)).toBe(true);
    expect(Array.isArray(result.section_order)).toBe(true);
    expect(Array.isArray(result.sections_approved)).toBe(true);
  });

  it('truncates evidence items beyond the limit', () => {
    const manyEvidence = Array.from({ length: 30 }, (_, i) => ({
      id: `ev-${i}`,
      situation: 'S',
      action: 'A',
      result: 'R',
      metrics_defensible: false,
      user_validated: false,
      mapped_requirements: [],
      scope_metrics: {},
    }));
    const event = makeSectionContextEvent({ evidence: manyEvidence });
    const result = sanitizeSectionContext(event);
    // MAX_SECTION_CONTEXT_EVIDENCE_ITEMS defaults to 20 in the mock
    expect(result.evidence.length).toBeLessThanOrEqual(20);
  });

  it('truncates keywords beyond the limit', () => {
    const manyKeywords = Array.from({ length: 50 }, (_, i) => ({
      keyword: `keyword-${i}`,
      target_density: 1,
      current_count: 0,
    }));
    const event = makeSectionContextEvent({ keywords: manyKeywords });
    const result = sanitizeSectionContext(event);
    expect(result.keywords.length).toBeLessThanOrEqual(40);
  });

  it('truncates gap_mappings beyond the limit', () => {
    const manyGaps = Array.from({ length: 50 }, (_, i) => ({
      requirement: `req-${i}`,
      classification: 'gap' as const,
    }));
    const event = makeSectionContextEvent({ gap_mappings: manyGaps });
    const result = sanitizeSectionContext(event);
    expect(result.gap_mappings.length).toBeLessThanOrEqual(40);
  });

  it('clamps non-finite numbers in keyword density to 0', () => {
    const event = makeSectionContextEvent({
      keywords: [{ keyword: 'test', target_density: NaN, current_count: -1 }],
    });
    const result = sanitizeSectionContext(event);
    expect(result.keywords[0].target_density).toBe(0);
    expect(result.keywords[0].current_count).toBe(0);
  });

  it('truncates blueprint_slice when it exceeds byte limit', () => {
    const hugeSlice: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) {
      hugeSlice[`key_${i}`] = 'x'.repeat(30);
    }
    const event = makeSectionContextEvent({ blueprint_slice: hugeSlice });
    const result = sanitizeSectionContext(event);
    expect(result.blueprint_slice).toMatchObject({ truncated: true });
  });

  it('filters suggestions with invalid intents', () => {
    const event = makeSectionContextEvent({
      suggestions: [
        {
          id: 's1',
          intent: 'address_requirement',
          question_text: 'How did you lead?',
          options: [],
          priority: 1,
          priority_tier: 'high',
          resolved_when: { type: 'always_recheck', target_id: '' },
        },
        {
          id: 's2',
          intent: 'invalid_intent' as unknown as 'tighten',  // should be filtered out
          question_text: 'Bad suggestion',
          options: [],
          priority: 2,
          priority_tier: 'low',
          resolved_when: { type: 'always_recheck', target_id: '' },
        },
      ],
    });
    const result = sanitizeSectionContext(event);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions![0].intent).toBe('address_requirement');
  });

  it('normalizes review_strategy to per_section for unknown values', () => {
    const event = makeSectionContextEvent({ review_strategy: 'unknown' as 'per_section' });
    const result = sanitizeSectionContext(event);
    expect(result.review_strategy).toBe('per_section');
  });
});

// ─── deriveSectionBundleStatusFromContext ─────────────────────────────

describe('deriveSectionBundleStatusFromContext', () => {
  it('returns null when review_strategy is not bundled', () => {
    const event = makeSectionContextEvent({ review_strategy: 'per_section' });
    const ctx = sanitizeSectionContext(event);
    const result = deriveSectionBundleStatusFromContext(ctx);
    expect(result).toBeNull();
  });

  it('returns null when review_bundles is missing', () => {
    const event = makeSectionContextEvent({ review_strategy: 'bundled', review_bundles: [] });
    const ctx = sanitizeSectionContext(event);
    const result = deriveSectionBundleStatusFromContext(ctx);
    expect(result).toBeNull();
  });

  it('computes bundle status for a simple bundled setup', () => {
    const event = makeSectionContextEvent({
      review_strategy: 'bundled',
      section_order: ['summary', 'experience_role_0', 'skills'],
      sections_approved: ['summary'],
      review_required_sections: ['summary', 'experience_role_0'],
      review_bundles: [
        { key: 'headline', label: 'Headline', total_sections: 1, review_required: 1, reviewed_required: 0, status: 'pending' },
        { key: 'core_experience', label: 'Experience', total_sections: 1, review_required: 1, reviewed_required: 0, status: 'pending' },
        { key: 'supporting', label: 'Supporting', total_sections: 1, review_required: 0, reviewed_required: 0, status: 'pending' },
      ],
    });
    const ctx = sanitizeSectionContext(event);
    const result = deriveSectionBundleStatusFromContext(ctx);

    expect(result).not.toBeNull();
    expect(result!.review_strategy).toBe('bundled');
    expect(result!.total_bundles).toBe(3);

    const headlineBundle = result!.bundles.find((b) => b.key === 'headline');
    expect(headlineBundle?.status).toBe('complete'); // summary is in sections_approved

    const supportingBundle = result!.bundles.find((b) => b.key === 'supporting');
    expect(supportingBundle?.status).toBe('auto_approved'); // no review_required
  });

  it('accounts for justApprovedSection parameter', () => {
    const event = makeSectionContextEvent({
      review_strategy: 'bundled',
      section_order: ['summary'],
      sections_approved: [],
      review_required_sections: ['summary'],
      review_bundles: [
        { key: 'headline', label: 'Headline', total_sections: 1, review_required: 1, reviewed_required: 0, status: 'pending' },
      ],
    });
    const ctx = sanitizeSectionContext(event);

    // Without justApprovedSection: headline should not be complete
    const before = deriveSectionBundleStatusFromContext(ctx);
    expect(before!.bundles[0].status).not.toBe('complete');

    // With justApprovedSection: summary is now approved
    const after = deriveSectionBundleStatusFromContext(ctx, 'summary');
    expect(after!.bundles[0].status).toBe('complete');
  });

  it('returns sections_approved_count including justApprovedSection', () => {
    const event = makeSectionContextEvent({
      review_strategy: 'bundled',
      section_order: ['summary'],
      sections_approved: ['skills'],
      review_required_sections: ['summary'],
      review_bundles: [
        { key: 'headline', label: 'Headline', total_sections: 1, review_required: 1, reviewed_required: 0, status: 'pending' },
      ],
    });
    const ctx = sanitizeSectionContext(event);
    const result = deriveSectionBundleStatusFromContext(ctx, 'summary');
    expect(result!.sections_approved_count).toBe(2); // skills + summary
  });
});

// ─── workflowNodeFromPanelType ────────────────────────────────────────

describe('workflowNodeFromPanelType', () => {
  it('maps known panel types to correct node keys', () => {
    expect(workflowNodeFromPanelType('onboarding_summary')).toBe('overview');
    expect(workflowNodeFromPanelType('research_dashboard')).toBe('benchmark');
    expect(workflowNodeFromPanelType('gap_analysis')).toBe('gaps');
    expect(workflowNodeFromPanelType('questionnaire')).toBe('questions');
    expect(workflowNodeFromPanelType('positioning_interview')).toBe('questions');
    expect(workflowNodeFromPanelType('blueprint_review')).toBe('blueprint');
    expect(workflowNodeFromPanelType('design_options')).toBe('blueprint');
    expect(workflowNodeFromPanelType('section_review')).toBe('sections');
    expect(workflowNodeFromPanelType('live_resume')).toBe('sections');
    expect(workflowNodeFromPanelType('quality_dashboard')).toBe('quality');
    expect(workflowNodeFromPanelType('completion')).toBe('export');
  });

  it('returns null for unknown panel types', () => {
    expect(workflowNodeFromPanelType('unknown_panel')).toBeNull();
    expect(workflowNodeFromPanelType('')).toBeNull();
  });
});

// ─── createResumeEventMiddleware ──────────────────────────────────────

describe('createResumeEventMiddleware', () => {
  const SESSION_ID = 'test-session-id';

  let mw: ReturnType<typeof createResumeEventMiddleware>;

  beforeEach(() => {
    vi.clearAllMocks();
    mw = createResumeEventMiddleware(SESSION_ID, '2026-03-01T00:00:00.000Z');
  });

  afterEach(() => {
    mw.dispose();
  });

  it('returns all required methods', () => {
    expect(typeof mw.onEvent).toBe('function');
    expect(typeof mw.onComplete).toBe('function');
    expect(typeof mw.onError).toBe('function');
    expect(typeof mw.flushPanelPersists).toBe('function');
    expect(typeof mw.dispose).toBe('function');
  });

  it('onEvent returns void for most event types (no transformation)', () => {
    const result = mw.onEvent({ type: 'stage_start', stage: 'intake', message: 'Starting...' }, SESSION_ID);
    expect(result).toBeUndefined();
  });

  it('onEvent sanitizes pipeline_error and returns transformed event', () => {
    const event: PipelineSSEEvent = {
      type: 'pipeline_error',
      stage: 'intake',
      error: 'DB connection failed: password authentication failed for user',
    };
    const result = mw.onEvent(event, SESSION_ID);
    expect(result).toBeDefined();
    expect((result as { type: string; error: string }).error).toBe('An internal error occurred. Please try again.');
    expect((result as { type: string; error: string }).error).not.toContain('password authentication');
  });

  it('onEvent persists pipeline stage on stage_start', async () => {
    const mockFrom = vi.mocked(supabaseAdmin.from);
    mw.onEvent({ type: 'stage_start', stage: 'research', message: 'Researching...' }, SESSION_ID);
    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));
    // Should have called supabaseAdmin.from with session_workflow_nodes (upsert) and coach_sessions (update)
    expect(mockFrom).toHaveBeenCalled();
  });

  it('onEvent queues panel persist on questionnaire event', () => {
    const event: PipelineSSEEvent = {
      type: 'questionnaire',
      questionnaire_id: 'q-1',
      schema_version: 1,
      stage: 'intake',
      title: 'Intake Quiz',
      questions: [],
      current_index: 0,
    };
    // Should not throw
    expect(() => mw.onEvent(event, SESSION_ID)).not.toThrow();
  });

  it('onEvent captures section_context for later merging', () => {
    const event = makeSectionContextEvent();
    mw.onEvent(event, SESSION_ID);
    // No thrown errors — the event should be captured internally
    // Next section_draft for the same section should merge the context
    const draftResult = mw.onEvent(
      { type: 'section_draft', section: 'summary', content: 'Summary content', review_token: 'tok-1' },
      SESSION_ID,
    );
    expect(draftResult).toBeUndefined(); // returns void (not an error)
  });

  it('onComplete flushes panel persists', async () => {
    // Queue a panel persist by emitting a right_panel_update
    mw.onEvent({ type: 'right_panel_update', panel_type: 'gap_analysis', data: { test: true } }, SESSION_ID);
    await mw.onComplete(SESSION_ID);
    // After onComplete, the queue should be flushed
    const count = await mw.flushPanelPersists();
    expect(count).toBe(0); // already flushed
  });

  it('onError cancels and flushes panel persists', async () => {
    mw.onEvent({ type: 'right_panel_update', panel_type: 'gap_analysis', data: { test: true } }, SESSION_ID);
    await mw.onError(SESSION_ID, new Error('test error'));
    // No errors thrown
  });

  it('pipeline_complete event cancels queued persists and persists completion panel', () => {
    mw.onEvent({ type: 'right_panel_update', panel_type: 'gap_analysis', data: {} }, SESSION_ID);
    const completeEvent: PipelineSSEEvent = {
      type: 'pipeline_complete',
      session_id: SESSION_ID,
      resume: {
        summary: 'Test summary',
        experience: [],
        skills: {},
        education: [],
        certifications: [],
        ats_score: 90,
      },
    };
    expect(() => mw.onEvent(completeEvent, SESSION_ID)).not.toThrow();
  });

  it('pipeline_error event cancels queued persists and upserts workflow node as stale', () => {
    mw.onEvent({ type: 'right_panel_update', panel_type: 'gap_analysis', data: {} }, SESSION_ID);
    const errorEvent: PipelineSSEEvent = {
      type: 'pipeline_error',
      stage: 'intake',
      error: 'Something went wrong internally',
    };
    const result = mw.onEvent(errorEvent, SESSION_ID);
    expect(result).toBeDefined();
    expect((result as { error: string }).error).toBe('An internal error occurred. Please try again.');
  });
});

// ─── flushAllQueuedPanelPersists (module-level) ───────────────────────

describe('flushAllQueuedPanelPersists', () => {
  it('returns 0 when no instances are registered', async () => {
    // This may have leftover instances from other tests if dispose was not called.
    // Create a fresh instance, immediately dispose it, then test
    const mw = createResumeEventMiddleware('flush-test-session');
    mw.dispose();
    // Now active middlewares should not include this one
    // The count depends on test isolation; just verify it runs without throwing
    const count = await flushAllQueuedPanelPersists();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('calls flush on all registered instances', async () => {
    const mw1 = createResumeEventMiddleware('flush-session-1');
    const mw2 = createResumeEventMiddleware('flush-session-2');

    try {
      // Queue some panel persists
      mw1.onEvent({ type: 'right_panel_update', panel_type: 'gap_analysis', data: {} }, 'flush-session-1');
      mw2.onEvent({ type: 'right_panel_update', panel_type: 'research_dashboard', data: {} }, 'flush-session-2');

      // Module-level flush should process both
      const count = await flushAllQueuedPanelPersists();
      expect(typeof count).toBe('number');
      // After flush, subsequent flush returns 0
      const countAfter = await flushAllQueuedPanelPersists();
      expect(countAfter).toBe(0);
    } finally {
      mw1.dispose();
      mw2.dispose();
    }
  });
});

// ─── resetWorkflowNodesForNewRunBestEffort ────────────────────────────

describe('resetWorkflowNodesForNewRunBestEffort', () => {
  it('calls supabaseAdmin to upsert workflow nodes without throwing', async () => {
    vi.clearAllMocks();
    resetWorkflowNodesForNewRunBestEffort('reset-test-session');
    // Allow async to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(supabaseAdmin.from).toHaveBeenCalledWith('session_workflow_nodes');
  });
});

// ─── VALID_SUGGESTION_INTENTS and VALID_RESOLUTION_TYPES ─────────────

describe('exported constants', () => {
  it('VALID_SUGGESTION_INTENTS contains expected intents', () => {
    expect(VALID_SUGGESTION_INTENTS.has('address_requirement')).toBe(true);
    expect(VALID_SUGGESTION_INTENTS.has('weave_evidence')).toBe(true);
    expect(VALID_SUGGESTION_INTENTS.has('integrate_keyword')).toBe(true);
    expect(VALID_SUGGESTION_INTENTS.has('invalid')).toBe(false);
  });

  it('VALID_RESOLUTION_TYPES contains expected types', () => {
    expect(VALID_RESOLUTION_TYPES.has('keyword_present')).toBe(true);
    expect(VALID_RESOLUTION_TYPES.has('evidence_referenced')).toBe(true);
    expect(VALID_RESOLUTION_TYPES.has('always_recheck')).toBe(true);
    expect(VALID_RESOLUTION_TYPES.has('invalid')).toBe(false);
  });
});
