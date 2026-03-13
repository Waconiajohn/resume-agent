/**
 * Resume V2 — LLM Agent Unit Tests
 *
 * Tests all 9 LLM-calling agents in the Resume V2 pipeline.
 * Each agent follows the same pattern: single prompt → repairJSON → retry on failure.
 *
 * For each agent we verify:
 * 1. Successful parse on first attempt → returns parsed output
 * 2. Retry on first parse failure → returns retry result
 * 3. Both attempts fail → throws Error
 * 4. AbortSignal is forwarded to llm.chat
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoist mocks before any imports ────────────────────────────────────────

const mockLlmChat = vi.hoisted(() => vi.fn());
const mockRepairJSON = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockLlmChat },
  MODEL_PRIMARY: 'model-primary',
  MODEL_MID: 'model-mid',
  MODEL_LIGHT: 'model-light',
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: mockRepairJSON,
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// resume-rules is imported by resume-writer and executive-tone; provide a minimal stub
vi.mock('../agents/resume-v2/knowledge/resume-rules.js', () => ({
  getResumeRulesPrompt: () => '## RESUME RULES\n- Write strong bullets.',
  BANNED_PHRASES: ['responsible for', 'team player', 'results-oriented'],
}));

// ─── Agent imports (after mocks) ───────────────────────────────────────────

import { runJobIntelligence }      from '../agents/resume-v2/job-intelligence/agent.js';
import { runCandidateIntelligence } from '../agents/resume-v2/candidate-intelligence/agent.js';
import { runBenchmarkCandidate }   from '../agents/resume-v2/benchmark-candidate/agent.js';
import { runGapAnalysis }          from '../agents/resume-v2/gap-analysis/agent.js';
import { runNarrativeStrategy }    from '../agents/resume-v2/narrative-strategy/agent.js';
import { runResumeWriter }         from '../agents/resume-v2/resume-writer/agent.js';
import { runTruthVerification }    from '../agents/resume-v2/truth-verification/agent.js';
import { runATSOptimization }      from '../agents/resume-v2/ats-optimization/agent.js';
import { runExecutiveTone }        from '../agents/resume-v2/executive-tone/agent.js';

import type {
  JobIntelligenceOutput,
  JobIntelligenceInput,
  CandidateIntelligenceOutput,
  CandidateIntelligenceInput,
  BenchmarkCandidateOutput,
  BenchmarkCandidateInput,
  GapAnalysisOutput,
  GapAnalysisInput,
  NarrativeStrategyOutput,
  NarrativeStrategyInput,
  ResumeDraftOutput,
  ResumeWriterInput,
  TruthVerificationOutput,
  TruthVerificationInput,
  ATSOptimizationOutput,
  ATSOptimizationInput,
  ExecutiveToneOutput,
  ExecutiveToneInput,
  CandidateIntelligenceOutput as CandidateOutput,
  JobIntelligenceOutput as JobOutput,
} from '../agents/resume-v2/types.js';

// ─── Shared fixture data ────────────────────────────────────────────────────

const JOB_INTEL_OUTPUT: JobIntelligenceOutput = {
  company_name: 'Acme Corp',
  role_title: 'VP of Engineering',
  seniority_level: 'vp',
  core_competencies: [
    { competency: 'Cloud Architecture', importance: 'must_have', evidence_from_jd: 'Build and scale cloud platform' },
    { competency: 'Team Leadership', importance: 'important', evidence_from_jd: 'Lead 50+ engineers' },
  ],
  strategic_responsibilities: ['Own engineering roadmap', 'Drive platform reliability'],
  business_problems: ['Scaling from 1M to 10M users', 'Tech debt reduction'],
  cultural_signals: ['Fast-paced', 'High ownership'],
  hidden_hiring_signals: ['Current infra is a mess', 'Need someone to build culture'],
  language_keywords: ['cloud-native', 'platform engineering', 'P&L ownership'],
  industry: 'Technology',
};

const CANDIDATE_OUTPUT: CandidateIntelligenceOutput = {
  contact: {
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '555-0100',
    linkedin: 'https://linkedin.com/in/janesmith',
    location: 'San Francisco, CA',
  },
  career_themes: ['Engineering Leadership', 'Platform Scaling', 'Organizational Growth'],
  leadership_scope: 'Led 40-person engineering org across 3 product teams',
  quantified_outcomes: [
    { outcome: 'Reduced deployment time', metric_type: 'time', value: '60%' },
    { outcome: 'Grew ARR', metric_type: 'money', value: '$20M to $80M' },
  ],
  industry_depth: ['SaaS', 'FinTech'],
  technologies: ['AWS', 'Kubernetes', 'TypeScript', 'Go'],
  operational_scale: 'Multi-region, 99.99% SLA, 500K daily active users',
  career_span_years: 15,
  experience: [
    {
      company: 'Acme Startup',
      title: 'VP of Engineering',
      start_date: 'Jan 2020',
      end_date: 'Present',
      bullets: ['Built cloud platform from scratch', 'Scaled team from 10 to 40'],
    },
  ],
  education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2008' }],
  certifications: ['AWS Solutions Architect'],
  hidden_accomplishments: ['Built automation-ready knowledge infrastructure'],
  raw_text: 'Jane Smith\nVP of Engineering\njane@example.com',
};

const BENCHMARK_OUTPUT: BenchmarkCandidateOutput = {
  ideal_profile_summary: 'A seasoned engineering leader who has scaled platform infra at a Series C or later company.',
  expected_achievements: [
    { area: 'Platform Scaling', description: 'Scaled to 10M+ users', typical_metrics: '10x growth in 2 years' },
  ],
  expected_leadership_scope: '50-person engineering org, $5M+ budget',
  expected_industry_knowledge: ['Cloud infrastructure', 'Platform engineering'],
  expected_technical_skills: ['AWS', 'Kubernetes', 'Microservices'],
  expected_certifications: ['AWS Solutions Architect'],
  differentiators: ['Combination of technical depth and executive communication'],
};

const GAP_ANALYSIS_OUTPUT: GapAnalysisOutput = {
  requirements: [
    {
      requirement: 'Cloud Architecture',
      source: 'job_description',
      importance: 'must_have',
      classification: 'strong',
      evidence: ['Built cloud platform on AWS'],
    },
    {
      requirement: 'Budget Management',
      source: 'benchmark',
      importance: 'important',
      classification: 'partial',
      evidence: ['Managed $3M payroll'],
      strategy: {
        real_experience: 'Led 40-person team at ~$85K average',
        positioning: '$3M+ payroll budget accountability',
        inferred_metric: '$3M+',
        inference_rationale: '40 × $85K = $3.4M, backed off to $3M+',
        ai_reasoning: 'I found you managed a team of 40 engineers. That implies roughly $3M in payroll.',
      },
    },
  ],
  coverage_score: 82,
  strength_summary: 'Strong cloud and leadership background aligns well with the VP role.',
  critical_gaps: ['No direct P&L ownership'],
  pending_strategies: [
    {
      requirement: 'Budget Management',
      strategy: {
        real_experience: 'Led 40-person team',
        positioning: '$3M+ payroll budget accountability',
        inferred_metric: '$3M+',
        inference_rationale: '40 × $85K = $3.4M',
        ai_reasoning: 'Your team of 40 implies roughly $3M in payroll costs.',
      },
    },
  ],
};

const NARRATIVE_OUTPUT: NarrativeStrategyOutput = {
  primary_narrative: 'Platform Scale Architect',
  narrative_angle_rationale: 'The role demands platform ownership; candidate has done exactly that.',
  supporting_themes: ['Engineering at Scale', 'Culture Builder', 'Revenue-Aware Leader'],
  branded_title: 'VP of Engineering | Platform Scale & Cloud-Native Infrastructure | P&L Awareness',
  narrative_origin: 'Jane first fell in love with platform problems during her early days at a startup.',
  unique_differentiators: ['Built entire platform infra stack from zero to 500K DAUs'],
  why_me_story: 'Jane Smith walked into a chaotic engineering org and turned it into a machine...',
  why_me_concise: 'I build the engineering infrastructure that makes 10x growth possible without 10x headcount.',
  why_me_best_line: 'I scale platforms, not just teams.',
  gap_positioning_map: [
    {
      requirement: 'Budget Management',
      narrative_positioning: 'Frame payroll ownership as P&L awareness',
      where_to_feature: 'Professional experience — Acme Startup VP role',
      narrative_justification: 'Payroll accountability IS budget management at this scope',
    },
  ],
  interview_talking_points: ['Tell the story of scaling from 1M to 500K DAU in 18 months'],
  section_guidance: {
    summary_angle: 'Open with the scale narrative, not generic leadership clichés',
    competency_themes: ['Cloud-Native Architecture', 'Engineering Org Design'],
    accomplishment_priorities: ['Platform reliability wins', 'Team growth achievements'],
    experience_framing: { 'Acme Startup': 'Foundation-building chapter that made everything else possible' },
  },
};

const RESUME_DRAFT_OUTPUT: ResumeDraftOutput = {
  header: {
    name: 'Jane Smith',
    phone: '555-0100',
    email: 'jane@example.com',
    linkedin: 'https://linkedin.com/in/janesmith',
    branded_title: 'VP of Engineering | Platform Scale & Cloud-Native Infrastructure',
  },
  executive_summary: {
    content: 'Engineering leader who has scaled cloud platforms from startup to enterprise...',
    is_new: true,
  },
  core_competencies: ['Cloud Architecture', 'Platform Engineering', 'Team Leadership'],
  selected_accomplishments: [
    { content: 'Scaled platform to 500K DAU with 99.99% SLA', is_new: false, addresses_requirements: ['Cloud Architecture'] },
  ],
  professional_experience: [
    {
      company: 'Acme Startup',
      title: 'VP of Engineering',
      start_date: 'Jan 2020',
      end_date: 'Present',
      scope_statement: 'Led 40-person engineering org, $3M+ payroll accountability',
      bullets: [
        { text: 'Architected cloud platform serving 500K DAU at 99.99% uptime', is_new: false, addresses_requirements: ['Cloud Architecture'] },
      ],
    },
  ],
  education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2008' }],
  certifications: ['AWS Solutions Architect'],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns a resolved llm.chat response with the given text. */
function llmResponse(text: string) {
  return Promise.resolve({ text });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Resume V2 — LLM Agent Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Job Intelligence', () => {
    const input: JobIntelligenceInput = { job_description: 'We need a VP of Engineering...' };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(JOB_INTEL_OUTPUT);

      const result = await runJobIntelligence(input);

      expect(result).toEqual(JOB_INTEL_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
      expect(mockRepairJSON).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null and returns retry result', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'not json' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(JOB_INTEL_OUTPUT);

      const result = await runJobIntelligence(input);

      expect(result).toEqual(JOB_INTEL_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
      expect(mockRepairJSON).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts return unparseable responses', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runJobIntelligence(input)).rejects.toThrow(
        'Job Intelligence agent returned unparseable response after 2 attempts',
      );
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(JOB_INTEL_OUTPUT);

      await runJobIntelligence(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('uses MODEL_MID for both attempts', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(JOB_INTEL_OUTPUT);

      await runJobIntelligence(input);

      for (const call of mockLlmChat.mock.calls) {
        expect(call[0]).toMatchObject({ model: 'model-mid' });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Candidate Intelligence', () => {
    const input: CandidateIntelligenceInput = {
      resume_text: 'Jane Smith\nVP of Engineering\njane@example.com\n555-0100',
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(CANDIDATE_OUTPUT);

      const result = await runCandidateIntelligence(input);

      // raw_text is overwritten by the agent with the full input resume_text
      expect(result.contact.name).toBe('Jane Smith');
      expect(result.raw_text).toBe(input.resume_text);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'not json' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(CANDIDATE_OUTPUT);

      const result = await runCandidateIntelligence(input);

      expect(result.contact.name).toBe('Jane Smith');
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts return unparseable responses', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runCandidateIntelligence(input)).rejects.toThrow(
        'Candidate Intelligence agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(CANDIDATE_OUTPUT);

      await runCandidateIntelligence(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('replaces placeholder name "john doe" with first line of resume', async () => {
      const placeholderOutput: CandidateIntelligenceOutput = {
        ...CANDIDATE_OUTPUT,
        contact: { ...CANDIDATE_OUTPUT.contact, name: 'John Doe' },
      };
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(placeholderOutput);

      const result = await runCandidateIntelligence(input);

      // First line of resume_text is "Jane Smith" — should replace the placeholder
      expect(result.contact.name).toBe('Jane Smith');
    });

    it('always overwrites raw_text with full input resume_text', async () => {
      const outputWithShortRawText: CandidateIntelligenceOutput = {
        ...CANDIDATE_OUTPUT,
        raw_text: 'truncated',
      };
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(outputWithShortRawText);

      const result = await runCandidateIntelligence(input);

      expect(result.raw_text).toBe(input.resume_text);
    });

    it('uses MODEL_MID', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(CANDIDATE_OUTPUT);

      await runCandidateIntelligence(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-mid' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Benchmark Candidate', () => {
    const input: BenchmarkCandidateInput = { job_intelligence: JOB_INTEL_OUTPUT };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(BENCHMARK_OUTPUT);

      const result = await runBenchmarkCandidate(input);

      expect(result).toEqual(BENCHMARK_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(BENCHMARK_OUTPUT);

      const result = await runBenchmarkCandidate(input);

      expect(result).toEqual(BENCHMARK_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runBenchmarkCandidate(input)).rejects.toThrow(
        'Benchmark Candidate agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(BENCHMARK_OUTPUT);

      await runBenchmarkCandidate(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('uses MODEL_PRIMARY', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(BENCHMARK_OUTPUT);

      await runBenchmarkCandidate(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-primary' }),
      );
    });

    it('builds user message including role title and competencies from input', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(BENCHMARK_OUTPUT);

      await runBenchmarkCandidate(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('VP of Engineering');
      expect(userMessage).toContain('Cloud Architecture');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Gap Analysis', () => {
    const input: GapAnalysisInput = {
      candidate: CANDIDATE_OUTPUT,
      benchmark: BENCHMARK_OUTPUT,
      job_intelligence: JOB_INTEL_OUTPUT,
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(GAP_ANALYSIS_OUTPUT);

      const result = await runGapAnalysis(input);

      expect(result).toEqual(GAP_ANALYSIS_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(GAP_ANALYSIS_OUTPUT);

      const result = await runGapAnalysis(input);

      expect(result).toEqual(GAP_ANALYSIS_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runGapAnalysis(input)).rejects.toThrow(
        'Gap Analysis agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(GAP_ANALYSIS_OUTPUT);

      await runGapAnalysis(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('includes optional user_context in user message when provided', async () => {
      const inputWithContext: GapAnalysisInput = {
        ...input,
        user_context: 'I also managed vendor contracts worth $2M annually.',
      };
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(GAP_ANALYSIS_OUTPUT);

      await runGapAnalysis(inputWithContext);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('I also managed vendor contracts');
    });

    it('uses MODEL_PRIMARY', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(GAP_ANALYSIS_OUTPUT);

      await runGapAnalysis(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-primary' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Narrative Strategy', () => {
    const input: NarrativeStrategyInput = {
      gap_analysis: GAP_ANALYSIS_OUTPUT,
      candidate: CANDIDATE_OUTPUT,
      job_intelligence: JOB_INTEL_OUTPUT,
      approved_strategies: [
        {
          requirement: 'Budget Management',
          strategy: {
            real_experience: 'Led 40-person team',
            positioning: '$3M+ payroll budget accountability',
          },
        },
      ],
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(NARRATIVE_OUTPUT);

      const result = await runNarrativeStrategy(input);

      expect(result).toEqual(NARRATIVE_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(NARRATIVE_OUTPUT);

      const result = await runNarrativeStrategy(input);

      expect(result).toEqual(NARRATIVE_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runNarrativeStrategy(input)).rejects.toThrow(
        'Narrative Strategy agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(NARRATIVE_OUTPUT);

      await runNarrativeStrategy(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('includes approved strategies in user message', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(NARRATIVE_OUTPUT);

      await runNarrativeStrategy(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('$3M+ payroll budget accountability');
    });

    it('includes benchmark differentiators in user message when provided', async () => {
      const inputWithDiffs: NarrativeStrategyInput = {
        ...input,
        benchmark_differentiators: ['Unique combination of deep cloud expertise and executive communication'],
      };
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(NARRATIVE_OUTPUT);

      await runNarrativeStrategy(inputWithDiffs);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('Benchmark Differentiators');
      expect(userMessage).toContain('deep cloud expertise');
    });

    it('omits benchmark differentiators block when not provided', async () => {
      const inputNoDiffs: NarrativeStrategyInput = {
        ...input,
        benchmark_differentiators: undefined,
      };
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(NARRATIVE_OUTPUT);

      await runNarrativeStrategy(inputNoDiffs);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).not.toContain('Benchmark Differentiators');
    });

    it('uses MODEL_PRIMARY', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(NARRATIVE_OUTPUT);

      await runNarrativeStrategy(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-primary' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Resume Writer', () => {
    const input: ResumeWriterInput = {
      job_intelligence: JOB_INTEL_OUTPUT,
      candidate: CANDIDATE_OUTPUT,
      benchmark: BENCHMARK_OUTPUT,
      gap_analysis: GAP_ANALYSIS_OUTPUT,
      narrative: NARRATIVE_OUTPUT,
      approved_strategies: [
        {
          requirement: 'Budget Management',
          strategy: {
            real_experience: 'Led 40-person team',
            positioning: '$3M+ payroll budget accountability',
            inferred_metric: '$3M+',
          },
        },
      ],
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(RESUME_DRAFT_OUTPUT);

      const result = await runResumeWriter(input);

      expect(result).toEqual(RESUME_DRAFT_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(RESUME_DRAFT_OUTPUT);

      const result = await runResumeWriter(input);

      expect(result).toEqual(RESUME_DRAFT_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runResumeWriter(input)).rejects.toThrow(
        'Resume Writer agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(RESUME_DRAFT_OUTPUT);

      await runResumeWriter(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('replaces placeholder name "john doe" with candidate contact info', async () => {
      const placeholderDraft: ResumeDraftOutput = {
        ...RESUME_DRAFT_OUTPUT,
        header: { ...RESUME_DRAFT_OUTPUT.header, name: 'John Doe' },
      };
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(placeholderDraft);

      const result = await runResumeWriter(input);

      expect(result.header.name).toBe('Jane Smith');
      expect(result.header.email).toBe('jane@example.com');
      expect(result.header.phone).toBe('555-0100');
    });

    it('includes gap positioning map in user message when provided', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(RESUME_DRAFT_OUTPUT);

      await runResumeWriter(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('GAP POSITIONING MAP');
      expect(userMessage).toContain('Budget Management');
    });

    it('uses MODEL_PRIMARY', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(RESUME_DRAFT_OUTPUT);

      await runResumeWriter(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-primary' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Truth Verification', () => {
    const TRUTH_OUTPUT: TruthVerificationOutput = {
      claims: [
        {
          claim: 'Scaled platform to 500K DAU',
          section: 'professional_experience',
          source_found: true,
          source_text: 'Grew platform to 500K daily active users',
          confidence: 'verified',
        },
      ],
      truth_score: 95,
      flagged_items: [],
    };

    const input: TruthVerificationInput = {
      draft: RESUME_DRAFT_OUTPUT,
      original_resume: 'Jane Smith\nVP of Engineering\nGrew platform to 500K daily active users',
      candidate: CANDIDATE_OUTPUT,
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TRUTH_OUTPUT);

      const result = await runTruthVerification(input);

      expect(result).toEqual(TRUTH_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(TRUTH_OUTPUT);

      const result = await runTruthVerification(input);

      expect(result).toEqual(TRUTH_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runTruthVerification(input)).rejects.toThrow(
        'Truth Verification agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TRUTH_OUTPUT);

      await runTruthVerification(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('includes original_resume in user message for source-of-truth comparison', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TRUTH_OUTPUT);

      await runTruthVerification(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('Original Resume (source of truth)');
      expect(userMessage).toContain('Grew platform to 500K daily active users');
    });

    it('includes draft content in user message', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TRUTH_OUTPUT);

      await runTruthVerification(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('Resume Draft to Verify');
      expect(userMessage).toContain('Jane Smith');
    });

    it('uses MODEL_PRIMARY', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TRUTH_OUTPUT);

      await runTruthVerification(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-primary' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('ATS Optimization', () => {
    const ATS_OUTPUT: ATSOptimizationOutput = {
      match_score: 82,
      keywords_found: ['cloud-native', 'platform engineering'],
      keywords_missing: ['P&L ownership'],
      keyword_suggestions: [
        {
          keyword: 'P&L ownership',
          suggested_placement: 'executive_summary',
          natural_phrasing: 'Full P&L ownership across engineering and infrastructure spend',
        },
      ],
      formatting_issues: [],
    };

    const input: ATSOptimizationInput = {
      draft: RESUME_DRAFT_OUTPUT,
      job_intelligence: JOB_INTEL_OUTPUT,
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(ATS_OUTPUT);

      const result = await runATSOptimization(input);

      expect(result).toEqual(ATS_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(ATS_OUTPUT);

      const result = await runATSOptimization(input);

      expect(result).toEqual(ATS_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runATSOptimization(input)).rejects.toThrow(
        'ATS Optimization agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(ATS_OUTPUT);

      await runATSOptimization(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('includes JD keywords in user message', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(ATS_OUTPUT);

      await runATSOptimization(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('cloud-native');
      expect(userMessage).toContain('platform engineering');
    });

    it('uses MODEL_LIGHT', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(ATS_OUTPUT);

      await runATSOptimization(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-light' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Executive Tone', () => {
    const TONE_OUTPUT: ExecutiveToneOutput = {
      findings: [
        {
          text: 'was responsible for managing the team',
          section: 'professional_experience',
          issue: 'passive_voice',
          suggestion: 'Orchestrated and directed a 40-person engineering organization',
        },
      ],
      tone_score: 88,
      banned_phrases_found: ['responsible for'],
    };

    const input: ExecutiveToneInput = {
      draft: RESUME_DRAFT_OUTPUT,
    };

    it('returns parsed output on first successful attempt', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TONE_OUTPUT);

      const result = await runExecutiveTone(input);

      expect(result).toEqual(TONE_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(1);
    });

    it('retries when first repairJSON returns null', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad' })
        .mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(TONE_OUTPUT);

      const result = await runExecutiveTone(input);

      expect(result).toEqual(TONE_OUTPUT);
      expect(mockLlmChat).toHaveBeenCalledTimes(2);
    });

    it('throws when both attempts fail', async () => {
      mockLlmChat
        .mockResolvedValueOnce({ text: 'bad1' })
        .mockResolvedValueOnce({ text: 'bad2' });
      mockRepairJSON.mockReturnValue(null);

      await expect(runExecutiveTone(input)).rejects.toThrow(
        'Executive Tone agent returned unparseable response after 2 attempts',
      );
    });

    it('forwards AbortSignal to llm.chat', async () => {
      const controller = new AbortController();
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TONE_OUTPUT);

      await runExecutiveTone(input, controller.signal);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('formats draft sections into user message for tone audit', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TONE_OUTPUT);

      await runExecutiveTone(input);

      const userMessage: string = mockLlmChat.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('SUMMARY');
      expect(userMessage).toContain('SELECTED ACCOMPLISHMENTS');
      expect(userMessage).toContain('PROFESSIONAL EXPERIENCE');
    });

    it('uses MODEL_MID', async () => {
      mockLlmChat.mockResolvedValueOnce({ text: '{}' });
      mockRepairJSON.mockReturnValueOnce(TONE_OUTPUT);

      await runExecutiveTone(input);

      expect(mockLlmChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model-mid' }),
      );
    });
  });
});
