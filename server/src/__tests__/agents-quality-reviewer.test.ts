import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockChat = vi.hoisted(() => vi.fn());
vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

import { runQualityReviewer } from '../agents/quality-reviewer.js';
import type {
  QualityReviewerInput,
  ArchitectOutput,
  JDAnalysis,
  EvidenceItem,
} from '../agents/types.js';

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function makeJDAnalysis(overrides?: Partial<JDAnalysis>): JDAnalysis {
  return {
    role_title: 'CTO',
    company: 'TechCorp',
    seniority_level: 'executive',
    must_haves: ['engineering leadership', 'cloud architecture', 'P&L ownership'],
    nice_to_haves: ['kubernetes'],
    implicit_requirements: ['executive presence'],
    language_keywords: ['cloud-native', 'P&L', 'engineering excellence'],
    ...overrides,
  };
}

function makeArchitectBlueprint(): ArchitectOutput {
  return {
    blueprint_version: '2.0',
    target_role: 'CTO at TechCorp',
    positioning_angle: 'Platform-first engineering executive',
    section_plan: {
      order: ['header', 'summary', 'selected_accomplishments', 'experience', 'skills', 'education_and_certifications'],
      rationale: 'Executive order',
    },
    summary_blueprint: {
      positioning_angle: 'Cloud-first engineering executive',
      must_include: ['cloud architecture', 'engineering leadership'],
      gap_reframe: {},
      tone_guidance: 'Executive, direct',
      keywords_to_embed: ['cloud-native', 'P&L'],
      authentic_phrases_to_echo: ['build for scale'],
      length: '3-4 sentences',
    },
    evidence_allocation: {
      selected_accomplishments: [],
      experience_section: {},
      unallocated_requirements: [],
    },
    skills_blueprint: {
      format: 'categorized',
      categories: [],
      keywords_still_missing: [],
      age_protection_removals: [],
    },
    experience_blueprint: { roles: [] },
    age_protection: { flags: [], clean: true },
    keyword_map: {
      'cloud-native': { target_density: 2, placements: ['summary'], current_count: 1, action: 'add' },
      'P&L': { target_density: 2, placements: ['summary', 'skills'], current_count: 0, action: 'add' },
    },
    global_rules: {
      voice: 'Executive, direct, metrics-forward.',
      bullet_format: 'Action verb → scope → method → measurable result',
      length_target: '2 pages maximum',
      ats_rules: 'No tables, no columns, standard section headers only',
    },
  };
}

function makeEvidenceLibrary(): EvidenceItem[] {
  return [
    {
      id: 'ev_001',
      situation: 'Legacy infrastructure causing frequent outages',
      action: 'Led full cloud migration over 18 months',
      result: 'Reduced costs by $2.4M annually',
      metrics_defensible: true,
      user_validated: true,
    },
    {
      id: 'ev_002',
      situation: 'Engineering org scaling challenges',
      action: 'Built hiring pipeline and onboarding program',
      result: 'Grew team from 8 to 45 engineers in 18 months',
      metrics_defensible: true,
      user_validated: true,
    },
  ];
}

function makeReviewerInput(): QualityReviewerInput {
  return {
    assembled_resume: {
      sections: {
        summary: 'Engineering executive who builds cloud-native platforms at scale...',
        experience: '• Led cloud migration reducing costs by $2.4M...',
      },
      full_text: `Jane Smith
CTO Candidate

Engineering executive who builds cloud-native platforms at scale. Reduced infrastructure costs by $2.4M annually while managing 45-person engineering organization. Deep expertise in P&L ownership and engineering excellence.

SELECTED ACCOMPLISHMENTS
• Reduced infrastructure costs by $2.4M via cloud migration
• Scaled engineering organization from 8 to 45 engineers

EXPERIENCE
VP Engineering | Acme Corp | 2019 – Present
• Led cloud migration and infrastructure modernization
• Managed $8M engineering budget (P&L ownership)
• Increased deployment frequency by 300%`,
    },
    architect_blueprint: makeArchitectBlueprint(),
    jd_analysis: makeJDAnalysis(),
    evidence_library: makeEvidenceLibrary(),
  };
}

function makeValidReviewLLMOutput(scoreOverrides?: Partial<Record<string, number>>) {
  const scores = {
    hiring_manager_impact: 4,
    requirement_coverage: 85,
    ats_score: 88,
    authenticity: 82,
    evidence_integrity: 92,
    blueprint_compliance: 90,
    ...scoreOverrides,
  };

  return {
    scores,
    dimension_details: {
      hiring_manager_impact: {
        assessment: 'Strong first impression — leads with quantified achievements',
        issues: [],
      },
      requirement_coverage: {
        covered: ['engineering leadership', 'cloud architecture'],
        missing: ['P&L ownership unclear'],
        reframes_effective: [],
        reframes_weak: [],
      },
      ats_compliance: {
        keywords_found: ['cloud-native', 'engineering excellence'],
        keywords_missing: ['P&L'],
        keyword_coverage_pct: 67,
        section_header_issues: [],
        formatting_hazards: [],
      },
      authenticity: {
        issues: [],
        authentic_phrases_used: 2,
        authentic_phrases_available: 3,
      },
      evidence_integrity: {
        claims_checked: 5,
        claims_verified: 5,
        claims_flagged: [],
      },
      blueprint_compliance: {
        deviations: [],
      },
    },
    revision_instructions: [] as Array<{
      target_section: string;
      issue: string;
      instruction: string;
      priority: string;
    }>,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runQualityReviewer', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns QualityReviewerOutput with required fields', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput()));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('overall_pass');
  });

  it('returns approve decision when all scores meet thresholds', async () => {
    // All scores above pass thresholds: impact>=4, coverage>=80, ats>=80, authenticity>=75, integrity>=90, compliance>=85
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 4,
      requirement_coverage: 85,
      ats_score: 88,
      authenticity: 82,
      evidence_integrity: 95,
      blueprint_compliance: 90,
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('approve');
    expect(result.overall_pass).toBe(true);
  });

  it('returns revise decision when scores are below thresholds', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 3,
      requirement_coverage: 70,
      ats_score: 75,
      authenticity: 70,
      evidence_integrity: 85,
      blueprint_compliance: 80,
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('revise');
    expect(result.overall_pass).toBe(false);
  });

  it('returns redesign decision when requirement_coverage is below 60%', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 3,
      requirement_coverage: 50, // Below 60% → redesign
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('redesign');
    expect(result.overall_pass).toBe(false);
    expect(result.redesign_reason).toContain('Coverage 50%');
  });

  it('returns redesign decision when hiring_manager_impact is 2 or lower', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 2,
      requirement_coverage: 75,
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('redesign');
    expect(result.redesign_reason).toContain('Impact 2/5');
  });

  it('returns valid QualityScores with proper types', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput()));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(typeof result.scores.hiring_manager_impact).toBe('number');
    expect(typeof result.scores.requirement_coverage).toBe('number');
    expect(typeof result.scores.ats_score).toBe('number');
    expect(typeof result.scores.authenticity).toBe('number');
    expect(typeof result.scores.evidence_integrity).toBe('number');
    expect(typeof result.scores.blueprint_compliance).toBe('number');
  });

  it('clamps scores within valid ranges', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 10, // Out of range (1-5)
      requirement_coverage: 150, // Out of range (0-100)
      ats_score: -5, // Out of range (0-100)
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.scores.hiring_manager_impact).toBe(5);
    expect(result.scores.requirement_coverage).toBe(100);
    expect(result.scores.ats_score).toBe(0);
  });

  it('handles NaN scores by defaulting to minimum', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      scores: {
        hiring_manager_impact: 'not-a-number',
        requirement_coverage: null,
        ats_score: undefined,
        authenticity: 80,
        evidence_integrity: 90,
        blueprint_compliance: 88,
      },
      revision_instructions: [],
    }));

    const result = await runQualityReviewer(makeReviewerInput());

    // NaN scores should be clamped to minimum
    expect(result.scores.hiring_manager_impact).toBe(1);
    expect(result.scores.requirement_coverage).toBe(0);
    expect(result.scores.ats_score).toBe(0);
  });

  it('returns conservative fallback when LLM returns unparseable JSON', async () => {
    mockChat.mockResolvedValueOnce({ text: 'INVALID JSON', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });

    const result = await runQualityReviewer(makeReviewerInput());

    // Conservative fallback
    expect(result.decision).toBe('revise');
    expect(result.overall_pass).toBe(false);
    expect(result.revision_instructions).toBeDefined();
    expect(result.revision_instructions![0].target_section).toBe('all');
    expect(result.revision_instructions![0].priority).toBe('high');
  });

  it('generates revision_instructions when decision is revise', async () => {
    const output = makeValidReviewLLMOutput({
      hiring_manager_impact: 3,
      requirement_coverage: 70,
    });
    output.revision_instructions = [
      {
        target_section: 'summary',
        issue: 'P&L ownership not explicitly stated',
        instruction: 'Add explicit P&L dollar amount to summary',
        priority: 'high',
      },
      {
        target_section: 'experience_role_0',
        issue: 'No mention of engineering leadership scope',
        instruction: 'Add team size and organizational scope to first bullet',
        priority: 'medium',
      },
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('revise');
    expect(result.revision_instructions).toBeDefined();
    expect(result.revision_instructions!.length).toBeGreaterThan(0);
    expect(result.revision_instructions![0].target_section).toBe('summary');
  });

  it('filters low priority instructions for revise decision', async () => {
    const output = makeValidReviewLLMOutput({
      hiring_manager_impact: 3,
      requirement_coverage: 70,
    });
    output.revision_instructions = [
      {
        target_section: 'summary',
        issue: 'Missing metric',
        instruction: 'Add metric',
        priority: 'high',
      },
      {
        target_section: 'skills',
        issue: 'Minor formatting',
        instruction: 'Reorder skills',
        priority: 'low',
      },
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runQualityReviewer(makeReviewerInput());

    // Low priority should be filtered out for revise decision
    expect(result.revision_instructions?.every(r => r.priority !== 'low')).toBe(true);
  });

  it('normalizes revision instruction priority to medium when invalid', async () => {
    const output = makeValidReviewLLMOutput({ hiring_manager_impact: 3, requirement_coverage: 70 });
    output.revision_instructions = [
      {
        target_section: 'summary',
        issue: 'Missing metrics',
        instruction: 'Add $2.4M savings metric',
        priority: 'urgent', // Invalid priority
      },
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runQualityReviewer(makeReviewerInput());

    if (result.revision_instructions && result.revision_instructions.length > 0) {
      expect(result.revision_instructions[0].priority).toBe('medium');
    }
  });

  it('filters out revision instructions without issue or instruction', async () => {
    const output = makeValidReviewLLMOutput({ hiring_manager_impact: 3, requirement_coverage: 70 });
    output.revision_instructions = [
      {
        target_section: 'summary',
        issue: '', // empty issue
        instruction: 'Add metric',
        priority: 'high',
      },
      {
        target_section: 'experience',
        issue: 'Missing scope',
        instruction: '', // empty instruction
        priority: 'high',
      },
      {
        target_section: 'skills',
        issue: 'Reorder needed',
        instruction: 'Put cloud skills first',
        priority: 'medium',
      },
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runQualityReviewer(makeReviewerInput());

    // Only the valid instruction should remain
    if (result.revision_instructions) {
      for (const r of result.revision_instructions) {
        expect(r.issue).toBeTruthy();
        expect(r.instruction).toBeTruthy();
      }
    }
  });

  it('uses MODEL_PRIMARY for quality review', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput()));

    await runQualityReviewer(makeReviewerInput());

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-primary' }),
    );
  });

  it('revision_instructions is undefined when decision is approve', async () => {
    // All scores pass, no revision_instructions
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 4,
      requirement_coverage: 85,
      ats_score: 88,
      authenticity: 82,
      evidence_integrity: 95,
      blueprint_compliance: 90,
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('approve');
    // revision_instructions should be undefined or empty for approve
    expect(result.revision_instructions == null || result.revision_instructions.length === 0).toBe(true);
  });

  it('does not include redesign_reason for revise decisions', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidReviewLLMOutput({
      hiring_manager_impact: 3,
      requirement_coverage: 70,
    })));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.decision).toBe('revise');
    expect(result.redesign_reason).toBeUndefined();
  });

  it('uses default score of 3 for hiring_manager_impact when missing', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      scores: {
        // hiring_manager_impact missing
        requirement_coverage: 80,
        ats_score: 80,
        authenticity: 75,
        evidence_integrity: 90,
        blueprint_compliance: 85,
      },
      revision_instructions: [],
    }));

    const result = await runQualityReviewer(makeReviewerInput());

    expect(result.scores.hiring_manager_impact).toBe(3);
  });
});
