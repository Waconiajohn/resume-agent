/**
 * Unit tests for server/src/lib/ni/boolean-search.ts
 *
 * Tests:
 *   - generateBooleanSearch: LLM extraction + string generation
 *   - getBooleanSearch: in-memory retrieval
 *   - String builder correctness: LinkedIn, Indeed, Google
 *   - Graceful degradation when LLM fails
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockLlm = vi.hoisted(() => ({
  chat: vi.fn(),
}));

vi.mock('../lib/llm.js', () => ({
  llm: mockLlm,
  getModelForTier: vi.fn().mockReturnValue('test-model-mid'),
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Module under test ─────────────────────────────────────────────────────────

import { generateBooleanSearch, getBooleanSearch } from '../lib/ni/boolean-search.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_TERMS = {
  skills: ['P&L management', 'supply chain optimization', 'SaaS', 'ERP implementation', 'lean manufacturing'],
  titles: ['VP Operations', 'Director Supply Chain', 'Chief Operating Officer'],
  industries: ['manufacturing', 'logistics'],
};

const SAMPLE_RESUME = `
John Smith — VP Operations
Led $500M supply chain transformation at Acme Corp.
Skills: P&L management, SaaS, ERP implementation, lean manufacturing.
Industries: manufacturing, logistics.
`;

function mockLlmSuccess(): void {
  mockLlm.chat.mockResolvedValue({
    text: JSON.stringify(SAMPLE_TERMS),
    usage: { input_tokens: 100, output_tokens: 200 },
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('generateBooleanSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls LLM with mid tier model and resume text', async () => {
    mockLlmSuccess();
    await generateBooleanSearch(SAMPLE_RESUME, []);

    expect(mockLlm.chat).toHaveBeenCalledOnce();
    const callArgs = mockLlm.chat.mock.calls[0][0] as { model: string; messages: Array<{ role: string; content: string }> };
    expect(callArgs.model).toBe('test-model-mid');
    expect(callArgs.messages[0].content).toContain(SAMPLE_RESUME.trim().slice(0, 100));
  });

  it('returns a result with linkedin, indeed, google, extractedTerms, generatedAt', async () => {
    mockLlmSuccess();
    const { result } = await generateBooleanSearch(SAMPLE_RESUME);

    expect(result).toHaveProperty('linkedin');
    expect(result).toHaveProperty('indeed');
    expect(result).toHaveProperty('google');
    expect(result).toHaveProperty('extractedTerms');
    expect(result).toHaveProperty('generatedAt');
    expect(typeof result.linkedin).toBe('string');
    expect(result.linkedin.length).toBeGreaterThan(0);
  });

  it('returns an id that can be used to retrieve the result', async () => {
    mockLlmSuccess();
    const { id, result } = await generateBooleanSearch(SAMPLE_RESUME);

    expect(id).toMatch(/^bs_/);
    const retrieved = getBooleanSearch(id);
    expect(retrieved).toEqual(result);
  });

  it('includes target titles in generated strings', async () => {
    mockLlmSuccess();
    const targetTitles = ['Chief Supply Chain Officer', 'EVP Operations'];
    const { result } = await generateBooleanSearch(SAMPLE_RESUME, targetTitles);

    expect(result.linkedin).toContain('Chief Supply Chain Officer');
    expect(result.linkedin).toContain('EVP Operations');
    expect(result.indeed).toContain('Chief Supply Chain Officer');
  });

  it('linkedin string includes negative terms', async () => {
    mockLlmSuccess();
    const { result } = await generateBooleanSearch(SAMPLE_RESUME);
    expect(result.linkedin).toContain('-intern');
    expect(result.linkedin).toContain('-entry');
  });

  it('google string includes site: filters', async () => {
    mockLlmSuccess();
    const { result } = await generateBooleanSearch(SAMPLE_RESUME);
    expect(result.google).toContain('site:linkedin.com/jobs');
    expect(result.google).toContain('site:indeed.com');
  });

  it('indeed string uses title: prefix when titles exist', async () => {
    mockLlmSuccess();
    const { result } = await generateBooleanSearch(SAMPLE_RESUME, ['VP Operations']);
    expect(result.indeed).toContain('title:(');
  });

  it('populates extractedTerms from LLM response', async () => {
    mockLlmSuccess();
    const { result } = await generateBooleanSearch(SAMPLE_RESUME);

    expect(result.extractedTerms.skills).toEqual(SAMPLE_TERMS.skills);
    expect(result.extractedTerms.titles).toEqual(SAMPLE_TERMS.titles);
    expect(result.extractedTerms.industries).toEqual(SAMPLE_TERMS.industries);
  });

  it('gracefully degrades when LLM returns invalid JSON', async () => {
    mockLlm.chat.mockResolvedValue({ text: 'not valid json at all', usage: { input_tokens: 0, output_tokens: 0 } });

    const { result } = await generateBooleanSearch(SAMPLE_RESUME);
    // Should still return a result, just with empty extracted terms
    expect(result.extractedTerms.skills).toEqual([]);
    expect(result.extractedTerms.titles).toEqual([]);
    expect(result.extractedTerms.industries).toEqual([]);
    expect(typeof result.linkedin).toBe('string');
  });

  it('gracefully degrades when LLM call throws', async () => {
    mockLlm.chat.mockRejectedValue(new Error('Network error'));

    const { result } = await generateBooleanSearch(SAMPLE_RESUME);
    expect(result.extractedTerms.skills).toEqual([]);
    expect(typeof result.linkedin).toBe('string');
  });

  it('caps extracted terms at defined limits (skills 15, titles 10, industries 5)', async () => {
    const oversized = {
      skills: Array.from({ length: 30 }, (_, i) => `Skill ${i}`),
      titles: Array.from({ length: 20 }, (_, i) => `Title ${i}`),
      industries: Array.from({ length: 10 }, (_, i) => `Industry ${i}`),
    };
    mockLlm.chat.mockResolvedValue({ text: JSON.stringify(oversized), usage: { input_tokens: 0, output_tokens: 0 } });

    const { result } = await generateBooleanSearch(SAMPLE_RESUME);
    expect(result.extractedTerms.skills.length).toBeLessThanOrEqual(15);
    expect(result.extractedTerms.titles.length).toBeLessThanOrEqual(10);
    expect(result.extractedTerms.industries.length).toBeLessThanOrEqual(5);
  });

  it('deduplicates target titles with extracted titles', async () => {
    // Target titles overlap with LLM-extracted titles
    mockLlmSuccess(); // SAMPLE_TERMS.titles includes "VP Operations"
    const targetTitles = ['VP Operations', 'New Title'];

    const { result } = await generateBooleanSearch(SAMPLE_RESUME, targetTitles);

    // Should appear once in the linkedin string — count occurrences
    const occurrences = (result.linkedin.match(/"VP Operations"/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe('getBooleanSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for unknown id', () => {
    const result = getBooleanSearch('bs_nonexistent_abc123');
    expect(result).toBeNull();
  });

  it('returns stored result for valid id', async () => {
    mockLlmSuccess();
    const { id, result } = await generateBooleanSearch(SAMPLE_RESUME);
    const retrieved = getBooleanSearch(id);
    expect(retrieved).toEqual(result);
  });
});
