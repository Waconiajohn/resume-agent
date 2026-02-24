import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockChat = vi.hoisted(() => vi.fn());
const mockQueryWithFallback = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../lib/perplexity.js', () => ({
  queryWithFallback: mockQueryWithFallback,
}));

import { runResearchAgent } from '../agents/research.js';
import type { ResearchInput, IntakeOutput } from '../agents/types.js';

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function makeIntakeOutput(): IntakeOutput {
  return {
    contact: { name: 'Jane Smith', email: 'jane@example.com', phone: '', location: 'Seattle, WA' },
    summary: 'Engineering leader with 12 years in cloud infrastructure.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2019',
        end_date: 'Present',
        bullets: ['Led team of 45 engineers', 'Reduced costs by $2.4M'],
      },
    ],
    skills: ['AWS', 'Kubernetes', 'Python'],
    education: [{ degree: 'BS Computer Science', institution: 'UW', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 12,
    raw_text: 'Jane Smith VP Engineering...',
  };
}

let inputCounter = 0;

function makeResearchInput(suffix?: string): ResearchInput {
  // Vary the JD slightly each call to avoid module-level cache hits between tests
  const unique = suffix ?? String(inputCounter++);
  return {
    job_description: `Senior VP Engineering at TechCorp (variant ${unique}).
Requirements: 10+ years engineering leadership, cloud architecture experience, P&L ownership.
Nice to have: kubernetes, distributed systems.
We value innovation and collaboration.`,
    company_name: 'TechCorp',
    parsed_resume: makeIntakeOutput(),
  };
}

function makeJDLLMOutput() {
  return {
    role_title: 'Senior VP Engineering',
    company: 'TechCorp',
    seniority_level: 'executive',
    must_haves: ['10+ years engineering leadership', 'cloud architecture', 'P&L ownership'],
    nice_to_haves: ['kubernetes', 'distributed systems'],
    implicit_requirements: ['executive presence', 'board communication'],
    language_keywords: ['cloud architecture', 'P&L', 'engineering leadership'],
  };
}

function makeBenchmarkLLMOutput() {
  return {
    ideal_profile: 'Seasoned engineering executive with proven cloud transformation experience and strong P&L ownership.',
    language_keywords: ['cloud-native', 'distributed systems', 'engineering excellence'],
    section_expectations: {
      summary: '3-4 sentences highlighting scale and cloud expertise',
      experience: 'Quantified accomplishments showing team scale and revenue impact',
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runResearchAgent', () => {
  beforeEach(() => {
    mockChat.mockReset();
    mockQueryWithFallback.mockReset();
  });

  it('returns ResearchOutput with all three components', async () => {
    // JD analysis call (MODEL_LIGHT)
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeJDLLMOutput()));
    // Company research via perplexity
    mockQueryWithFallback.mockResolvedValueOnce(
      'TechCorp is a cloud-focused technology company with approximately 2000 employees. ' +
      'They value innovation and have a strong engineering culture. ' +
      'The industry focus is enterprise software and cloud infrastructure.',
    );
    // Benchmark call (MODEL_MID)
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    const result = await runResearchAgent(makeResearchInput());

    expect(result).toHaveProperty('jd_analysis');
    expect(result).toHaveProperty('company_research');
    expect(result).toHaveProperty('benchmark_candidate');
  });

  it('parses JD analysis with correct fields', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeJDLLMOutput()));
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp is a tech company with a collaborative culture.');
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    const result = await runResearchAgent(makeResearchInput());

    expect(result.jd_analysis.role_title).toBe('Senior VP Engineering');
    expect(result.jd_analysis.company).toBe('TechCorp');
    expect(result.jd_analysis.seniority_level).toBe('executive');
    expect(result.jd_analysis.must_haves).toContain('cloud architecture');
    expect(result.jd_analysis.nice_to_haves).toContain('kubernetes');
    expect(result.jd_analysis.language_keywords).toContain('P&L');
  });

  it('parses benchmark candidate with merged keywords', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeJDLLMOutput()));
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp culture: collaborative, data-driven, innovative.');
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    const result = await runResearchAgent(makeResearchInput());

    // Benchmark keywords should be deduped union of LLM output + JD keywords
    expect(result.benchmark_candidate.ideal_profile).toContain('engineering executive');
    expect(result.benchmark_candidate.language_keywords).toContain('cloud-native');
    // JD keywords should also be present after merge
    expect(result.benchmark_candidate.language_keywords).toContain('P&L');
  });

  it('normalizes executive seniority_level from verbose strings', async () => {
    const jdOutput = { ...makeJDLLMOutput(), seniority_level: 'VP level' };
    mockChat.mockResolvedValueOnce(makeLLMResponse(jdOutput));
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp is innovative.');
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    // Use a unique suffix to avoid hitting the module-level JD cache from prior tests
    const result = await runResearchAgent(makeResearchInput('seniority-vp'));
    // "VP level" contains 'vp', should normalize to 'executive'
    expect(result.jd_analysis.seniority_level).toBe('executive');
  });

  it('normalizes senior seniority_level from "Senior Staff" string', async () => {
    const jdOutput = { ...makeJDLLMOutput(), seniority_level: 'Senior Staff Engineer' };
    mockChat.mockResolvedValueOnce(makeLLMResponse(jdOutput));
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp is innovative.');
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    // Use a unique suffix to avoid hitting the module-level JD cache from prior tests
    const result = await runResearchAgent(makeResearchInput('seniority-senior-staff'));
    expect(result.jd_analysis.seniority_level).toBe('senior');
  });

  it('falls back to default JD analysis when LLM returns null/invalid JSON', async () => {
    // repairJSON will return null for truly malformed text
    mockChat.mockResolvedValueOnce({ text: '%%%invalid%%%', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp culture info.');
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    // Use a unique suffix to bypass the module-level JD cache
    const result = await runResearchAgent(makeResearchInput('jd-fallback-unique-xyz'));

    // Should return safe fallback
    expect(result.jd_analysis.role_title).toBe('Unknown');
    expect(result.jd_analysis.must_haves).toEqual([]);
    expect(result.jd_analysis.language_keywords).toEqual([]);
  });

  it('returns empty company research when company name is blank', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeJDLLMOutput()));
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    const input = makeResearchInput();
    input.company_name = '';

    const result = await runResearchAgent(input);
    expect(result.company_research.company_name).toBe('');
    expect(result.company_research.culture_signals).toEqual([]);
    // perplexity should not be called for blank company
    expect(mockQueryWithFallback).not.toHaveBeenCalled();
  });

  it('handles partial data gracefully from benchmark LLM response', async () => {
    // Use a unique JD analysis output with a different role_title to avoid the benchmark cache
    const uniqueJDOutput = { ...makeJDLLMOutput(), role_title: 'Chief Architect (unique-fallback-test)' };
    mockChat.mockResolvedValueOnce(makeLLMResponse(uniqueJDOutput));
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp is a tech company.');
    // Benchmark returns invalid JSON → fallback triggered
    mockChat.mockResolvedValueOnce({ text: 'invalid', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });

    // Use a unique suffix to bypass the module-level JD (text) cache
    const result = await runResearchAgent(makeResearchInput('benchmark-fallback-unique-abc'));

    // Fallback should use JD keywords and return empty ideal_profile
    expect(result.benchmark_candidate.ideal_profile).toBe('');
    expect(result.benchmark_candidate.language_keywords).toEqual(
      expect.arrayContaining(['cloud architecture', 'P&L', 'engineering leadership']),
    );
  });

  it('extracts company research culture_signals from perplexity text', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeJDLLMOutput()));
    mockQueryWithFallback.mockResolvedValueOnce(
      'TechCorp has a strong engineering culture focused on collaboration and innovation. ' +
      'Their mission is to transform enterprise workflows. ' +
      'The team values diversity and inclusion.',
    );
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeBenchmarkLLMOutput()));

    const result = await runResearchAgent(makeResearchInput());

    expect(result.company_research.company_name).toBe('TechCorp');
    // culture_signals should contain sentences mentioning culture/values keywords
    expect(result.company_research.culture_signals.length).toBeGreaterThan(0);
  });

  it('deduplicates merged language_keywords in benchmark', async () => {
    // JD keywords and benchmark keywords overlap
    const jdOutput = { ...makeJDLLMOutput(), language_keywords: ['cloud architecture', 'kubernetes'] };
    const benchmarkOutput = { ...makeBenchmarkLLMOutput(), language_keywords: ['cloud architecture', 'distributed systems'] };
    mockChat.mockResolvedValueOnce(makeLLMResponse(jdOutput));
    mockQueryWithFallback.mockResolvedValueOnce('TechCorp is innovative.');
    mockChat.mockResolvedValueOnce(makeLLMResponse(benchmarkOutput));

    const result = await runResearchAgent(makeResearchInput());

    // cloud architecture should appear exactly once
    const cloudCount = result.benchmark_candidate.language_keywords.filter(k => k === 'cloud architecture').length;
    expect(cloudCount).toBe(1);
  });
});
