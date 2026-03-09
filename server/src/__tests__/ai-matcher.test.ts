/**
 * AI Matcher — unit tests for server/src/lib/job-search/ai-matcher.ts
 *
 * Sprint 58, Story: Job Command Center backend tests.
 *
 * Pattern: vi.hoisted + vi.mock for llm, platform-context, and json-repair.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockLlmChat = vi.hoisted(() => vi.fn());
const mockGetLatestUserContext = vi.hoisted(() => vi.fn());
const mockRepairJSON = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockLlmChat },
  MODEL_MID: 'mock-model-mid',
}));

vi.mock('../lib/platform-context.js', () => ({
  getLatestUserContext: mockGetLatestUserContext,
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: mockRepairJSON,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { matchJobsToProfile } from '../lib/job-search/ai-matcher.js';
import type { JobResult } from '../lib/job-search/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(id: string, overrides: Partial<JobResult> = {}): JobResult {
  return {
    external_id: `jsearch_${id}`,
    title: 'VP of Engineering',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    salary_min: null,
    salary_max: null,
    description: 'Lead engineering teams at scale.',
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'jsearch',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    ...overrides,
  };
}

function makeStrategyContext(overrides: Record<string, unknown> = {}) {
  return {
    content: {
      target_roles: ['VP of Engineering', 'CTO'],
      positioning_angle: 'Experienced engineering leader who scales teams.',
      key_skills: ['TypeScript', 'System Design', 'Team Building'],
      industry: 'Technology',
      ...overrides,
    },
  };
}

function makeLLMMatchResponse(jobs: JobResult[]) {
  return {
    matches: jobs.map((job) => ({
      external_id: job.external_id,
      match_score: 85,
      matching_skills: ['TypeScript', 'System Design'],
      recommendation: 'Strong fit for this role.',
      gap_analysis: 'Minor gaps in cloud infrastructure.',
    })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('matchJobsToProfile — empty input', () => {
  it('returns empty array immediately when jobs list is empty', async () => {
    const result = await matchJobsToProfile('user-1', []);
    expect(result).toEqual([]);
    expect(mockGetLatestUserContext).not.toHaveBeenCalled();
  });
});

describe('matchJobsToProfile — no positioning_strategy in context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No positioning_strategy (null) and no evidence
    mockGetLatestUserContext.mockResolvedValue(null);
  });

  it('returns empty array when positioning_strategy context is null', async () => {
    const result = await matchJobsToProfile('user-1', [makeJob('j1')]);
    expect(result).toEqual([]);
  });

  it('returns empty array when strategy content is null', async () => {
    mockGetLatestUserContext.mockResolvedValue({ content: null });
    const result = await matchJobsToProfile('user-1', [makeJob('j1')]);
    expect(result).toEqual([]);
  });

  it('does not call llm.chat when there is no strategy', async () => {
    await matchJobsToProfile('user-1', [makeJob('j1')]);
    expect(mockLlmChat).not.toHaveBeenCalled();
  });
});

describe('matchJobsToProfile — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestUserContext.mockImplementation((_userId: string, type: string) => {
      if (type === 'positioning_strategy') return Promise.resolve(makeStrategyContext());
      return Promise.resolve(null);
    });
  });

  it('returns match results for a single job', async () => {
    const job = makeJob('j1');
    const llmResponse = makeLLMMatchResponse([job]);
    mockRepairJSON.mockReturnValue(llmResponse);
    mockLlmChat.mockResolvedValue({ text: JSON.stringify(llmResponse) });

    const results = await matchJobsToProfile('user-1', [job]);

    expect(results).toHaveLength(1);
    expect(results[0].external_id).toBe('jsearch_j1');
    expect(results[0].match_score).toBe(85);
    expect(results[0].matching_skills).toEqual(['TypeScript', 'System Design']);
    expect(typeof results[0].recommendation).toBe('string');
    expect(typeof results[0].gap_analysis).toBe('string');
  });

  it('calls llm.chat once for a batch of 10 or fewer jobs', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => makeJob(`j${i}`));
    const llmResponse = makeLLMMatchResponse(jobs);
    mockRepairJSON.mockReturnValue(llmResponse);
    mockLlmChat.mockResolvedValue({ text: JSON.stringify(llmResponse) });

    await matchJobsToProfile('user-1', jobs);

    expect(mockLlmChat).toHaveBeenCalledTimes(1);
  });

  it('processes jobs in batches of 10', async () => {
    const jobs = Array.from({ length: 25 }, (_, i) => makeJob(`j${i}`));

    mockRepairJSON.mockImplementation(() => ({ matches: [] }));
    mockLlmChat.mockResolvedValue({ text: '{}' });

    await matchJobsToProfile('user-1', jobs);

    // 25 jobs → 3 batches (10 + 10 + 5)
    expect(mockLlmChat).toHaveBeenCalledTimes(3);
  });

  it('match_score is clamped to 0-100 range', async () => {
    const job = makeJob('j1');
    mockRepairJSON.mockReturnValue({
      matches: [
        {
          external_id: job.external_id,
          match_score: 150, // out of range
          matching_skills: [],
          recommendation: '',
          gap_analysis: '',
        },
      ],
    });
    mockLlmChat.mockResolvedValue({ text: '{}' });

    const results = await matchJobsToProfile('user-1', [job]);

    expect(results[0].match_score).toBe(100);
  });

  it('match_score is clamped to 0 when negative', async () => {
    const job = makeJob('j1');
    mockRepairJSON.mockReturnValue({
      matches: [
        {
          external_id: job.external_id,
          match_score: -10,
          matching_skills: [],
          recommendation: '',
          gap_analysis: '',
        },
      ],
    });
    mockLlmChat.mockResolvedValue({ text: '{}' });

    const results = await matchJobsToProfile('user-1', [job]);

    expect(results[0].match_score).toBe(0);
  });

  it('defaults matching_skills to empty array when missing from LLM response', async () => {
    const job = makeJob('j1');
    mockRepairJSON.mockReturnValue({
      matches: [
        {
          external_id: job.external_id,
          match_score: 70,
          // no matching_skills field
          recommendation: 'Good fit',
          gap_analysis: 'Minor gaps',
        },
      ],
    });
    mockLlmChat.mockResolvedValue({ text: '{}' });

    const results = await matchJobsToProfile('user-1', [job]);

    expect(results[0].matching_skills).toEqual([]);
  });

  it('includes evidence highlights in profile summary when evidence context exists', async () => {
    mockGetLatestUserContext.mockImplementation((_userId: string, type: string) => {
      if (type === 'positioning_strategy') return Promise.resolve(makeStrategyContext());
      if (type === 'evidence_item') {
        return Promise.resolve({
          content: {
            highlights: ['Led team of 45 engineers', 'Reduced deploy time by 60%'],
          },
        });
      }
      return Promise.resolve(null);
    });

    const job = makeJob('j1');
    mockRepairJSON.mockReturnValue(makeLLMMatchResponse([job]));
    mockLlmChat.mockResolvedValue({ text: '{}' });

    await matchJobsToProfile('user-1', [job]);

    // Verify that llm.chat was called with a prompt containing evidence data
    const callArgs = mockLlmChat.mock.calls[0][0] as { system: string; messages: Array<{ content: string }> };
    const userPrompt = callArgs.messages[0].content;
    expect(userPrompt).toContain('Led team of 45 engineers');
  });
});

describe('matchJobsToProfile — LLM failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset implementation queues that clearAllMocks does not clear
    mockRepairJSON.mockReset();
    mockLlmChat.mockReset();
    mockGetLatestUserContext.mockImplementation((_userId: string, type: string) => {
      if (type === 'positioning_strategy') return Promise.resolve(makeStrategyContext());
      return Promise.resolve(null);
    });
  });

  it('returns partial results when one batch fails', async () => {
    const jobs = Array.from({ length: 15 }, (_, i) => makeJob(`j${i}`));

    // First batch (10 jobs) succeeds
    const firstBatchResponse = makeLLMMatchResponse(jobs.slice(0, 10));
    // Second batch (5 jobs) fails
    mockLlmChat
      .mockResolvedValueOnce({ text: JSON.stringify(firstBatchResponse) })
      .mockRejectedValueOnce(new Error('LLM timeout'));

    mockRepairJSON
      .mockReturnValueOnce(firstBatchResponse)
      .mockReturnValueOnce(null);

    const results = await matchJobsToProfile('user-1', jobs);

    // Should have results from the first batch only (10 jobs)
    expect(results).toHaveLength(10);
  });

  it('returns empty array when all batches fail', async () => {
    const jobs = [makeJob('j1'), makeJob('j2')];
    mockLlmChat.mockRejectedValue(new Error('LLM unavailable'));

    const results = await matchJobsToProfile('user-1', jobs);

    expect(results).toEqual([]);
  });

  it('skips malformed match entries without throwing', async () => {
    const job = makeJob('j1');
    const batchResponse = {
      matches: [
        { external_id: 123, match_score: 'not-a-number' }, // malformed — external_id not string
        {
          external_id: job.external_id,
          match_score: 75,
          matching_skills: ['TypeScript'],
          recommendation: 'Good fit',
          gap_analysis: 'Minor gaps',
        },
      ],
    };
    mockLlmChat.mockResolvedValueOnce({ text: JSON.stringify(batchResponse) });
    mockRepairJSON.mockReturnValueOnce(batchResponse);

    const results = await matchJobsToProfile('user-1', [job]);

    // Only the valid entry should be returned
    expect(results).toHaveLength(1);
    expect(results[0].external_id).toBe(job.external_id);
  });

  it('treats null repairJSON result as batch failure (returns empty array)', async () => {
    const job = makeJob('j1');
    mockLlmChat.mockResolvedValue({ text: 'invalid json' });
    mockRepairJSON.mockReturnValue(null); // null → scoreBatch throws

    // The batch failure is caught; result is empty, not an exception
    const results = await matchJobsToProfile('user-1', [job]);
    expect(results).toEqual([]);
  });
});
