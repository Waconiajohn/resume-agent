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

import { runArchitect } from '../agents/architect.js';
import type {
  ArchitectInput,
  IntakeOutput,
  PositioningProfile,
  ResearchOutput,
  GapAnalystOutput,
} from '../agents/types.js';

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
        bullets: [
          'Led team of 45 engineers across 3 product lines',
          'Reduced infrastructure costs by $2.4M annually',
        ],
        inferred_scope: { team_size: '45', budget: '$8M' },
      },
      {
        company: 'StartupX',
        title: 'Engineering Manager',
        start_date: '2015',
        end_date: '2019',
        bullets: ['Built core platform from scratch'],
      },
    ],
    skills: ['AWS', 'Kubernetes', 'Python'],
    education: [{ degree: 'BS Computer Science', institution: 'UW', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 12,
    raw_text: 'Jane Smith VP Engineering...',
  };
}

function makePositioningProfile(): PositioningProfile {
  return {
    career_arc: {
      label: 'Builder',
      evidence: 'Built engineering orgs from scratch',
      user_description: 'I build things — teams, platforms, cultures',
    },
    top_capabilities: [
      {
        capability: 'Scales engineering organizations',
        evidence: ['Grew team from 2 to 45'],
        source: 'both',
      },
    ],
    evidence_library: [
      {
        id: 'ev_001',
        situation: 'Legacy infrastructure causing outages',
        action: 'Led full cloud migration',
        result: 'Reduced costs by $2.4M',
        metrics_defensible: true,
        user_validated: true,
      },
      {
        id: 'ev_002',
        situation: 'Engineering org scaling challenges',
        action: 'Built hiring pipeline and onboarding',
        result: 'Grew team from 8 to 45 in 18 months',
        metrics_defensible: true,
        user_validated: true,
      },
    ],
    signature_method: {
      name: 'Platform-First Engineering',
      what_it_improves: 'Reduces time-to-market',
      adopted_by_others: true,
    },
    unconscious_competence: 'Navigating ambiguity',
    domain_insight: 'Best orgs are built around developer experience',
    authentic_phrases: ['build for scale', 'platform-first thinking'],
    gaps_detected: [],
  };
}

function makeResearchOutput(): ResearchOutput {
  return {
    jd_analysis: {
      role_title: 'CTO',
      company: 'TechCorp',
      seniority_level: 'executive',
      must_haves: ['engineering leadership', 'cloud architecture', 'P&L ownership'],
      nice_to_haves: ['kubernetes'],
      implicit_requirements: ['executive presence'],
      language_keywords: ['cloud-native', 'P&L', 'engineering excellence'],
    },
    company_research: {
      company_name: 'TechCorp',
      industry: 'Enterprise Software',
      size: '2000 employees',
      culture_signals: ['collaborative', 'data-driven'],
    },
    benchmark_candidate: {
      ideal_profile: 'Seasoned CTO with cloud transformation experience.',
      language_keywords: ['cloud-native', 'engineering excellence', 'transformation'],
      section_expectations: {},
    },
  };
}

function makeGapAnalysis(): GapAnalystOutput {
  return {
    requirements: [
      { requirement: 'engineering leadership', classification: 'strong', evidence: ['Led 45 engineers'] },
      { requirement: 'cloud architecture', classification: 'strong', evidence: ['Reduced costs by $2.4M'] },
      { requirement: 'P&L ownership', classification: 'partial', evidence: ['Budget management implied'], strengthen: 'State P&L explicitly' },
      { requirement: 'kubernetes', classification: 'gap', evidence: [], mitigation: 'AWS EKS adjacent experience' },
    ],
    coverage_score: 62,
    critical_gaps: ['kubernetes'],
    addressable_gaps: ['kubernetes → AWS EKS adjacent experience'],
    strength_summary: 'Strong technical leadership with gaps in kubernetes.',
  };
}

function makeArchitectInput(): ArchitectInput {
  return {
    parsed_resume: makeIntakeOutput(),
    positioning: makePositioningProfile(),
    research: makeResearchOutput(),
    gap_analysis: makeGapAnalysis(),
  };
}

function makeValidBlueprintLLMOutput() {
  return {
    blueprint_version: '2.0',
    target_role: 'CTO at TechCorp',
    positioning_angle: 'Platform-first engineering executive who scales organizations and drives cloud transformation',

    section_plan: {
      order: ['header', 'summary', 'selected_accomplishments', 'experience', 'skills', 'education_and_certifications'],
      rationale: 'Lead with accomplishments to showcase executive impact before experience details',
    },

    summary_blueprint: {
      positioning_angle: 'Engineering executive who builds scalable platforms and drives cloud transformation',
      must_include: ['engineering leadership at scale', 'cloud transformation', 'P&L ownership'],
      gap_reframe: { 'P&L ownership': 'Frame budget authority as strategic financial stewardship' },
      tone_guidance: 'Executive, direct, outcomes-focused — echo "build for scale" and "platform-first thinking"',
      keywords_to_embed: ['cloud-native', 'engineering excellence', 'P&L'],
      authentic_phrases_to_echo: ['build for scale', 'platform-first thinking'],
      length: '3-4 sentences',
    },

    evidence_allocation: {
      selected_accomplishments: [
        {
          evidence_id: 'ev_001',
          achievement: 'Led cloud migration that reduced infrastructure costs by $2.4M annually',
          maps_to_requirements: ['cloud architecture'],
          placement_rationale: 'Top accomplishment — directly addresses must-have',
          enhancement: 'Add team size and timeline',
        },
        {
          evidence_id: 'ev_002',
          achievement: 'Scaled engineering org from 8 to 45 engineers in 18 months',
          maps_to_requirements: ['engineering leadership'],
          placement_rationale: 'Shows scale — critical for executive positioning',
          enhancement: '',
        },
      ],
      experience_section: {
        role_0: {
          company: 'Acme Corp',
          bullets_to_write: [
            {
              focus: 'Strategic technology leadership and cloud architecture',
              maps_to: 'cloud architecture',
              evidence_source: 'resume.experience.0.bullet.1',
              instruction: 'Lead with $2.4M savings metric',
              target_metric: '$2.4M',
            },
          ],
          bullets_to_keep: [],
          bullets_to_cut: [],
        },
      },
      unallocated_requirements: [
        { requirement: 'kubernetes', resolution: 'Cannot be addressed — marked as gap' },
      ],
    },

    skills_blueprint: {
      format: 'categorized',
      categories: [
        { label: 'Cloud & Infrastructure', skills: ['AWS', 'Kubernetes'], rationale: 'Primary JD requirement' },
        { label: 'Leadership & Strategy', skills: ['P&L', 'Team Scaling'], rationale: 'Executive differentiators' },
      ],
      keywords_still_missing: ['distributed systems'],
      age_protection_removals: [],
    },

    experience_blueprint: {
      roles: [
        { company: 'Acme Corp', title: 'VP Engineering', dates: '2019 – Present', bullet_count: 5 },
        { company: 'StartupX', title: 'Engineering Manager', dates: '2015 – 2019', bullet_count: 3 },
      ],
      earlier_career: undefined,
    },

    age_protection: {
      flags: [
        { item: 'Graduation year 2005', risk: 'Reveals candidate is 40+ years old', action: 'Remove graduation year from education' },
      ],
      clean: false,
    },

    keyword_map: {
      'cloud-native': { target_density: 2, placements: ['summary', 'experience_role_0'], current_count: 0, action: 'Add to summary and experience' },
      'P&L': { target_density: 2, placements: ['summary', 'skills'], current_count: 0, action: 'Add explicitly' },
    },

    global_rules: {
      voice: 'Executive, direct, metrics-forward. Echo "build for scale" and "platform-first thinking".',
      bullet_format: 'Action verb → scope → method → measurable result',
      length_target: '2 pages maximum',
      ats_rules: 'No tables, no columns, standard section headers only',
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runArchitect', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns ArchitectOutput with all required fields', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidBlueprintLLMOutput()));

    const result = await runArchitect(makeArchitectInput());

    expect(result).toHaveProperty('blueprint_version');
    expect(result).toHaveProperty('target_role');
    expect(result).toHaveProperty('positioning_angle');
    expect(result).toHaveProperty('section_plan');
    expect(result).toHaveProperty('summary_blueprint');
    expect(result).toHaveProperty('evidence_allocation');
    expect(result).toHaveProperty('skills_blueprint');
    expect(result).toHaveProperty('experience_blueprint');
    expect(result).toHaveProperty('age_protection');
    expect(result).toHaveProperty('keyword_map');
    expect(result).toHaveProperty('global_rules');
  });

  it('normalizes section order using canonical names', async () => {
    const output = makeValidBlueprintLLMOutput();
    output.section_plan.order = ['header', 'professional_summary', 'work_experience', 'core_competencies', 'education'];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());

    expect(result.section_plan.order).toContain('summary');
    expect(result.section_plan.order).toContain('experience');
    expect(result.section_plan.order).toContain('skills');
    expect(result.section_plan.order).toContain('education_and_certifications');
    // Original raw names should not appear
    expect(result.section_plan.order).not.toContain('professional_summary');
    expect(result.section_plan.order).not.toContain('work_experience');
  });

  it('deduplicates section order when duplicates present', async () => {
    const output = makeValidBlueprintLLMOutput();
    output.section_plan.order = ['header', 'summary', 'experience', 'summary', 'skills'];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());

    const summaryCount = result.section_plan.order.filter(s => s === 'summary').length;
    expect(summaryCount).toBe(1);
  });

  it('includes age_protection audit with flags', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidBlueprintLLMOutput()));

    const result = await runArchitect(makeArchitectInput());

    expect(result.age_protection.flags).toHaveLength(1);
    expect(result.age_protection.flags[0].item).toContain('2005');
    expect(result.age_protection.clean).toBe(false);
  });

  it('returns keyword_map with KeywordTarget structure', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidBlueprintLLMOutput()));

    const result = await runArchitect(makeArchitectInput());

    expect(result.keyword_map['cloud-native']).toBeDefined();
    expect(result.keyword_map['cloud-native'].target_density).toBe(2);
    expect(result.keyword_map['cloud-native'].placements).toContain('summary');
    expect(result.keyword_map['cloud-native'].current_count).toBe(0);
  });

  it('validates and corrects target_role when LLM uses template placeholder', async () => {
    const output = makeValidBlueprintLLMOutput();
    output.target_role = 'CTO at company'; // placeholder ending
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());
    // Should fall back to expected target role
    expect(result.target_role).toBe('CTO at TechCorp');
  });

  it('validates and corrects target_role when missing', async () => {
    const output = makeValidBlueprintLLMOutput();
    output.target_role = '';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());
    expect(result.target_role).toBe('CTO at TechCorp');
  });

  it('deduplicates evidence allocation (accomplishment IDs not in experience bullets)', async () => {
    const output = makeValidBlueprintLLMOutput();
    // Add a bullet that uses same evidence_id as an accomplishment
    output.evidence_allocation.experience_section.role_0.bullets_to_write = [
      {
        focus: 'Cloud migration leadership',
        maps_to: 'cloud architecture',
        evidence_source: 'ev_001', // Same as selected_accomplishments[0].evidence_id
        instruction: 'Lead with savings',
        target_metric: '$2.4M',
      },
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());

    // ev_001 is in selected_accomplishments, so bullets_to_write for role_0 should have it removed
    const role0Bullets = result.evidence_allocation.experience_section?.role_0?.bullets_to_write ?? [];
    expect(role0Bullets.some(b => b.evidence_source === 'ev_001')).toBe(false);
  });

  it('returns default blueprint when all LLM parse attempts fail', async () => {
    // Both attempts fail to parse
    mockChat.mockResolvedValue({ text: 'TOTALLY_INVALID_JSON', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });

    const result = await runArchitect(makeArchitectInput());

    // Should return default blueprint without throwing
    expect(result.blueprint_version).toBe('2.0');
    expect(result.target_role).toBe('CTO at TechCorp');
    expect(result.section_plan.order).toContain('summary');
    expect(result.section_plan.order).toContain('experience');
  });

  it('retries on first parse failure then succeeds on second attempt', async () => {
    // First attempt fails, second succeeds
    mockChat.mockResolvedValueOnce({ text: 'INVALID', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidBlueprintLLMOutput()));

    const result = await runArchitect(makeArchitectInput());

    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(result.target_role).toBe('CTO at TechCorp');
  });

  it('includes user_preferences block in prompt when provided', async () => {
    const input = makeArchitectInput();
    input.user_preferences = {
      primary_goal: 'land executive role',
      resume_priority: 'impact',
      seniority_delta: 'step up',
    };
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidBlueprintLLMOutput()));

    await runArchitect(input);

    // Check that the LLM was called with content that references the user preferences
    const callArgs = mockChat.mock.calls[0][0];
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain('land executive role');
  });

  it('normalizes skills_blueprint format to categorized', async () => {
    const output = makeValidBlueprintLLMOutput();
    (output.skills_blueprint as Record<string, unknown>).format = 'flat'; // invalid
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());
    expect(result.skills_blueprint.format).toBe('categorized');
  });

  it('falls back to default section order when LLM section_plan has no valid sections', async () => {
    const output = makeValidBlueprintLLMOutput();
    output.section_plan.order = ['nonexistent_section', 'another_invalid_one'];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runArchitect(makeArchitectInput());
    // All invalid sections filtered out → use default
    expect(result.section_plan.order.length).toBeGreaterThan(0);
    expect(result.section_plan.order).toContain('summary');
  });
});
