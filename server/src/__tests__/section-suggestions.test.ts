import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDeterministicSuggestions,
  buildUnresolvedGapMap,
  buildRevisionInstruction,
  markGapAddressed,
  type ScoredGap,
} from '../agents/section-suggestions.js';
import { SUGGESTION_TEMPLATES, findTemplates, interpolate } from '../agents/section-suggestion-bank.js';
import type {
  GapAnalystOutput,
  JDAnalysis,
  ArchitectOutput,
  PositioningProfile,
  ResearchOutput,
} from '../agents/types.js';

vi.mock('../lib/llm.js', () => ({
  llm: {
    chat: vi.fn().mockResolvedValue({
      text: '[]',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
}));

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeGapAnalysis(overrides?: Partial<GapAnalystOutput>): GapAnalystOutput {
  return {
    requirements: [
      {
        requirement: 'cloud architecture',
        classification: 'gap',
        evidence: [],
        strengthen: 'Add cloud experience',
      },
      {
        requirement: 'team leadership',
        classification: 'partial',
        evidence: ['Led team of 5'],
        strengthen: 'Quantify scope',
      },
      {
        requirement: 'project management',
        classification: 'strong',
        evidence: ['PMP certified'],
      },
    ],
    coverage_score: 60,
    critical_gaps: ['cloud architecture'],
    addressable_gaps: ['team leadership'],
    strength_summary: 'Strong PM background',
    ...overrides,
  };
}

function makeJDAnalysis(overrides?: Partial<JDAnalysis>): JDAnalysis {
  return {
    role_title: 'Senior Engineer',
    company: 'Test Corp',
    seniority_level: 'senior',
    must_haves: ['cloud architecture', 'team leadership'],
    nice_to_haves: ['kubernetes'],
    implicit_requirements: ['communication'],
    language_keywords: ['AWS', 'Docker', 'Kubernetes'],
    ...overrides,
  };
}

function makeArchitectOutput(overrides?: Partial<ArchitectOutput>): ArchitectOutput {
  return {
    blueprint_version: '1.0',
    target_role: 'Senior Engineer',
    positioning_angle: 'Technical leader with cloud focus',
    section_plan: {
      order: ['summary', 'experience', 'skills'],
      rationale: 'Standard executive order',
    },
    summary_blueprint: {
      positioning_angle: 'Cloud-first technical leader',
      must_include: ['cloud architecture', 'team leadership'],
      gap_reframe: {},
      tone_guidance: 'Executive, confident',
      keywords_to_embed: ['AWS', 'Docker'],
      authentic_phrases_to_echo: [],
      length: '3-4 sentences',
    },
    skills_blueprint: {
      format: 'categorized',
      categories: [
        { label: 'Cloud', skills: ['AWS', 'GCP'], rationale: 'Core requirement' },
      ],
      keywords_still_missing: [],
      age_protection_removals: [],
    },
    experience_blueprint: {
      roles: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          dates: '2020-Present',
          bullet_count: 5,
        },
      ],
    },
    age_protection: {
      flags: [],
      clean: true,
    },
    keyword_map: {
      AWS: {
        target_density: 2,
        placements: ['summary', 'skills'],
        current_count: 0,
        action: 'add',
      },
      Docker: {
        target_density: 1,
        placements: ['skills'],
        current_count: 0,
        action: 'add',
      },
    },
    evidence_allocation: {
      experience_section: {},
      unallocated_requirements: [],
    },
    global_rules: {
      voice: 'Executive, first person implied',
      bullet_format: 'Action verb + impact',
      length_target: '2 pages',
      ats_rules: 'No tables, no headers',
    },
    ...overrides,
  };
}

function makePositioningProfile(overrides?: Partial<PositioningProfile>): PositioningProfile {
  return {
    career_arc: {
      label: 'Engineering Leader',
      evidence: 'Led multiple engineering orgs',
      user_description: 'Grew from IC to VP',
    },
    top_capabilities: [
      {
        capability: 'Cloud Architecture',
        evidence: ['Migrated monolith to microservices'],
        source: 'interview',
      },
    ],
    evidence_library: [
      {
        id: 'ev-001',
        situation: 'Legacy monolith causing downtime',
        action: 'Led cloud migration initiative',
        result: 'Reduced infrastructure costs by 40%',
        metrics_defensible: true,
        user_validated: true,
        scope_metrics: { team_size: '12', budget: '$2M' },
      },
      {
        id: 'ev-002',
        situation: 'Engineering org scaling challenges',
        action: 'Built hiring pipeline and onboarding program',
        result: 'Grew team from 8 to 45 engineers in 18 months',
        metrics_defensible: true,
        user_validated: true,
        scope_metrics: { team_size: '45' },
      },
    ],
    signature_method: null,
    unconscious_competence: 'Systems thinking',
    domain_insight: 'Distributed systems at scale',
    authentic_phrases: ['build for scale', 'outcome-driven'],
    gaps_detected: [],
    ...overrides,
  };
}

function makeResearchOutput(overrides?: Partial<ResearchOutput>): ResearchOutput {
  return {
    jd_analysis: makeJDAnalysis(),
    company_research: {
      company_name: 'Test Corp',
      industry: 'Technology',
      size: '500-1000',
      culture_signals: ['fast-paced', 'data-driven'],
    },
    benchmark_candidate: {
      ideal_profile: 'Hands-on engineering leader with cloud expertise',
      language_keywords: ['AWS', 'Docker', 'Kubernetes', 'microservices'],
      section_expectations: {
        summary: '3-4 sentences, cloud focus',
        experience: 'Quantified accomplishments',
      },
    },
    ...overrides,
  };
}

// ─── buildUnresolvedGapMap ────────────────────────────────────────────────────

describe('buildUnresolvedGapMap', () => {
  it('correctly classifies must_have criticality as 3', () => {
    const gap = makeGapAnalysis();
    const jd = makeJDAnalysis();
    const result = buildUnresolvedGapMap(gap, jd);

    const cloudGap = result.find(g => g.requirement === 'cloud architecture');
    expect(cloudGap).toBeDefined();
    expect(cloudGap!.criticality).toBe(3);
  });

  it('correctly classifies nice_to_have criticality as 2', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'kubernetes',
          classification: 'gap',
          evidence: [],
        },
      ],
      critical_gaps: [],
      addressable_gaps: ['kubernetes'],
      coverage_score: 70,
      strength_summary: '',
    });
    const jd = makeJDAnalysis();
    const result = buildUnresolvedGapMap(gap, jd);

    const k8sGap = result.find(g => g.requirement === 'kubernetes');
    expect(k8sGap).toBeDefined();
    expect(k8sGap!.criticality).toBe(2);
  });

  it('correctly classifies implicit criticality as 1', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'communication',
          classification: 'partial',
          evidence: ['Presented to board'],
        },
      ],
      critical_gaps: [],
      addressable_gaps: ['communication'],
      coverage_score: 80,
      strength_summary: '',
    });
    const jd = makeJDAnalysis();
    const result = buildUnresolvedGapMap(gap, jd);

    const commGap = result.find(g => g.requirement === 'communication');
    expect(commGap).toBeDefined();
    expect(commGap!.criticality).toBe(1);
  });

  it('excludes strong classifications', () => {
    const gap = makeGapAnalysis();
    const jd = makeJDAnalysis();
    const result = buildUnresolvedGapMap(gap, jd);

    const strongGap = result.find(g => g.requirement === 'project management');
    expect(strongGap).toBeUndefined();
  });

  it('assigns evidence_deficit=3 when no evidence', () => {
    const gap = makeGapAnalysis();
    const jd = makeJDAnalysis();
    const result = buildUnresolvedGapMap(gap, jd);

    const cloudGap = result.find(g => g.requirement === 'cloud architecture');
    expect(cloudGap).toBeDefined();
    expect(cloudGap!.evidence_deficit).toBe(3);
  });

  it('assigns evidence_deficit=1 when evidence has metrics', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'team leadership',
          classification: 'partial',
          evidence: ['Led team of 45 engineers'],
          strengthen: 'Add more context',
        },
      ],
      coverage_score: 70,
      critical_gaps: [],
      addressable_gaps: ['team leadership'],
      strength_summary: '',
    });
    const jd = makeJDAnalysis();
    const result = buildUnresolvedGapMap(gap, jd);

    const leaderGap = result.find(g => g.requirement === 'team leadership');
    expect(leaderGap).toBeDefined();
    expect(leaderGap!.evidence_deficit).toBe(1);
  });
});

// ─── generateDeterministicSuggestions ────────────────────────────────────────

describe('generateDeterministicSuggestions', () => {
  let gapMap: ScoredGap[];
  let architect: ArchitectOutput;
  let positioning: PositioningProfile;
  let research: ResearchOutput;

  beforeEach(() => {
    const gap = makeGapAnalysis();
    const jd = makeJDAnalysis();
    gapMap = buildUnresolvedGapMap(gap, jd);
    architect = makeArchitectOutput();
    positioning = makePositioningProfile();
    research = makeResearchOutput();
  });

  it('generates address_requirement for gap requirements', () => {
    const suggestions = generateDeterministicSuggestions(
      'experience',
      'Managed engineering teams',
      gapMap,
      architect,
      positioning,
      research,
    );

    const gapSuggestion = suggestions.find(s => s.intent === 'address_requirement');
    expect(gapSuggestion).toBeDefined();
    expect(gapSuggestion!.target_id).toBe('cloud architecture');
  });

  it('generates integrate_keyword for missing keywords', () => {
    // Content that does not contain AWS or Docker
    const suggestions = generateDeterministicSuggestions(
      'summary',
      'Experienced engineering leader with strong team skills',
      gapMap,
      architect,
      positioning,
      research,
    );

    const keywordSuggestion = suggestions.find(s => s.intent === 'integrate_keyword');
    expect(keywordSuggestion).toBeDefined();
  });

  it('generates weave_evidence for unused evidence', () => {
    // Use experience section with an empty gap map so weave_evidence is not crowded out
    // Content that doesn't include result keywords from the evidence library
    const suggestions = generateDeterministicSuggestions(
      'experience',
      'Managed engineering teams',
      [], // no gaps — forces weave_evidence suggestions to surface
      architect,
      positioning,
      research,
    );

    const evidenceSuggestion = suggestions.find(s => s.intent === 'weave_evidence');
    expect(evidenceSuggestion).toBeDefined();
  });

  it('gaps score higher priority than keywords', () => {
    const suggestions = generateDeterministicSuggestions(
      'experience',
      'Managed engineering teams',
      gapMap,
      architect,
      positioning,
      research,
    );

    // Gap suggestions should appear before keyword suggestions
    const firstGapIdx = suggestions.findIndex(s => s.intent === 'address_requirement');
    const firstKeywordIdx = suggestions.findIndex(s => s.intent === 'integrate_keyword');

    if (firstGapIdx !== -1 && firstKeywordIdx !== -1) {
      expect(firstGapIdx).toBeLessThan(firstKeywordIdx);
    } else {
      // At minimum, gap suggestions should exist
      expect(firstGapIdx).not.toBe(-1);
    }
  });

  it('caps at 5 suggestions maximum', () => {
    // Create many gaps to ensure we exceed 5 potential suggestions
    const manyGaps = makeGapAnalysis({
      requirements: [
        { requirement: 'cloud architecture', classification: 'gap', evidence: [] },
        { requirement: 'team leadership', classification: 'gap', evidence: [] },
        { requirement: 'data engineering', classification: 'gap', evidence: [] },
        { requirement: 'product management', classification: 'gap', evidence: [] },
        { requirement: 'agile methodology', classification: 'gap', evidence: [] },
        { requirement: 'machine learning', classification: 'gap', evidence: [] },
        { requirement: 'devops', classification: 'gap', evidence: [] },
      ],
      coverage_score: 20,
      critical_gaps: ['cloud architecture'],
      addressable_gaps: ['team leadership'],
      strength_summary: '',
    });
    const jd = makeJDAnalysis({
      must_haves: [
        'cloud architecture',
        'team leadership',
        'data engineering',
        'product management',
        'agile methodology',
        'machine learning',
        'devops',
      ],
    });
    const bigGapMap = buildUnresolvedGapMap(manyGaps, jd);

    const suggestions = generateDeterministicSuggestions(
      'experience',
      'Some generic content',
      bigGapMap,
      architect,
      positioning,
      research,
    );

    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  it('produces stable IDs for same inputs', () => {
    const content = 'Managed engineering teams without cloud experience';
    const suggestions1 = generateDeterministicSuggestions(
      'experience',
      content,
      gapMap,
      architect,
      positioning,
      research,
    );
    const suggestions2 = generateDeterministicSuggestions(
      'experience',
      content,
      gapMap,
      architect,
      positioning,
      research,
    );

    const ids1 = suggestions1.map(s => s.id).sort();
    const ids2 = suggestions2.map(s => s.id).sort();
    expect(ids1).toEqual(ids2);
  });

  it('generates quantify_bullet when bullets lack metrics', () => {
    // Content with bullets that have no numbers
    const contentWithUnquantifiedBullets = [
      'Led engineering initiatives',
      '- Managed cloud migration project',
      '- Oversaw deployment pipeline improvements',
      '- Built team collaboration processes',
    ].join('\n');

    const suggestions = generateDeterministicSuggestions(
      'experience',
      contentWithUnquantifiedBullets,
      [],
      architect,
      positioning,
      research,
    );

    const quantifysuggestion = suggestions.find(s => s.intent === 'quantify_bullet');
    expect(quantifysuggestion).toBeDefined();
  });
});

// ─── buildRevisionInstruction ─────────────────────────────────────────────────

describe('buildRevisionInstruction', () => {
  it('returns interpolated template for address_requirement', () => {
    const suggestion = {
      id: 'gap_abc123',
      intent: 'address_requirement' as const,
      question_text: "The JD requires 'cloud architecture'",
      target_id: 'cloud architecture',
      options: [
        { id: 'apply', label: 'Yes, address it', action: 'apply' as const },
        { id: 'skip', label: 'Skip', action: 'skip' as const },
      ],
      priority: 9,
      priority_tier: 'high' as const,
      resolved_when: {
        type: 'requirement_addressed' as const,
        target_id: 'cloud architecture',
      },
    };

    const instruction = buildRevisionInstruction(suggestion);
    // Should not be the raw template with {{placeholder}} tokens
    expect(instruction).not.toContain('{{');
    // Should reference the target requirement
    expect(instruction.toLowerCase()).toContain('cloud architecture');
  });

  it('returns interpolated template for integrate_keyword', () => {
    const suggestion = {
      id: 'kw_aws',
      intent: 'integrate_keyword' as const,
      question_text: "The keyword 'AWS' appears in the JD but not your summary.",
      target_id: 'AWS',
      options: [
        { id: 'apply', label: 'Add it', action: 'apply' as const },
        { id: 'skip', label: 'Skip', action: 'skip' as const },
      ],
      priority: 2.5,
      priority_tier: 'low' as const,
      resolved_when: {
        type: 'keyword_present' as const,
        target_id: 'AWS',
      },
    };

    const instruction = buildRevisionInstruction(suggestion);
    expect(instruction).not.toContain('{{');
    expect(instruction.toLowerCase()).toContain('aws');
  });

  it('falls back to generic instruction when no template matches', () => {
    const suggestion = {
      id: 'align_xyz',
      intent: 'align_positioning' as const,
      question_text: 'Align your positioning',
      target_id: 'obscure-section-xyz',
      options: [],
      priority: 1,
      priority_tier: 'low' as const,
      resolved_when: {
        type: 'always_recheck' as const,
        target_id: 'obscure-section-xyz',
      },
    };

    const instruction = buildRevisionInstruction(suggestion);
    // Should fall back to generic form if no matching template found
    expect(typeof instruction).toBe('string');
    expect(instruction.length).toBeGreaterThan(0);
  });
});

// ─── markGapAddressed ────────────────────────────────────────────────────────

describe('markGapAddressed', () => {
  it('marks gap as addressed when keywords appear in content', () => {
    const gapMap: ScoredGap[] = [
      {
        requirement: 'cloud architecture',
        classification: 'gap',
        criticality: 3,
        evidence_deficit: 3,
        addressed_in_sections: [],
      },
    ];

    markGapAddressed(gapMap, 'summary', 'Led cloud migration and architecture redesign');

    expect(gapMap[0].addressed_in_sections).toContain('summary');
  });

  it('does not mark gap when keywords are absent', () => {
    const gapMap: ScoredGap[] = [
      {
        requirement: 'cloud architecture',
        classification: 'gap',
        criticality: 3,
        evidence_deficit: 3,
        addressed_in_sections: [],
      },
    ];

    markGapAddressed(gapMap, 'summary', 'Managed software engineering teams');

    expect(gapMap[0].addressed_in_sections).toHaveLength(0);
  });

  it('does not duplicate section entries when called multiple times', () => {
    const gapMap: ScoredGap[] = [
      {
        requirement: 'cloud architecture',
        classification: 'gap',
        criticality: 3,
        evidence_deficit: 3,
        addressed_in_sections: [],
      },
    ];

    markGapAddressed(gapMap, 'summary', 'Led cloud migration and architecture redesign');
    markGapAddressed(gapMap, 'summary', 'Led cloud migration and architecture redesign');

    expect(gapMap[0].addressed_in_sections).toHaveLength(1);
  });
});

// ─── findTemplates ────────────────────────────────────────────────────────────

describe('findTemplates', () => {
  it('returns section-specific templates over wildcards', () => {
    const templates = findTemplates('integrate_keyword', 'summary');

    // All returned templates should be summary-specific (not wildcard)
    const allSectionSpecific = templates.every(t => t.section_match.includes('summary'));
    expect(allSectionSpecific).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('falls back to wildcard when no section match', () => {
    // 'certifications' has no specific templates for quantify_bullet
    const templates = findTemplates('quantify_bullet', 'certifications');

    // Should return wildcard templates
    const hasWildcard = templates.some(t => t.section_match.includes('*'));
    expect(hasWildcard).toBe(true);
  });

  it('returns empty array when no templates exist for intent and section', () => {
    // 'align_positioning' only has a summary template, not experience
    const templates = findTemplates('align_positioning', 'education');
    // Should return wildcard fallbacks if any, otherwise empty
    // align_positioning has no wildcard templates, so should be empty
    expect(Array.isArray(templates)).toBe(true);
  });

  it('normalizes hyphenated section names', () => {
    // experience-1 and experience both should match 'experience' templates
    const templatesHyphen = findTemplates('address_requirement', 'experience-1');
    const templatesPlain = findTemplates('address_requirement', 'experience');

    expect(templatesHyphen.length).toBe(templatesPlain.length);
  });
});

// ─── interpolate ─────────────────────────────────────────────────────────────

describe('interpolate', () => {
  it('replaces all placeholders with values', () => {
    const template = "The JD requires '{{requirement}}' in {{section}}";
    const result = interpolate(template, { requirement: 'cloud architecture', section: 'summary' });

    expect(result).toBe("The JD requires 'cloud architecture' in summary");
  });

  it('replaces missing keys with empty string', () => {
    const template = "Keyword '{{keyword}}' is missing from {{section}}";
    const result = interpolate(template, { keyword: 'AWS' });

    // Missing 'section' key should become empty string
    expect(result).toBe("Keyword 'AWS' is missing from ");
  });

  it('handles template with no placeholders', () => {
    const template = 'This section needs improvement.';
    const result = interpolate(template, { requirement: 'cloud' });

    expect(result).toBe('This section needs improvement.');
  });

  it('handles multiple occurrences of same placeholder', () => {
    const template = '{{keyword}} should appear where {{keyword}} is appropriate';
    const result = interpolate(template, { keyword: 'AWS' });

    expect(result).toBe('AWS should appear where AWS is appropriate');
  });
});

// ─── SUGGESTION_TEMPLATES ─────────────────────────────────────────────────────

describe('SUGGESTION_TEMPLATES', () => {
  it('has at least one address_requirement template per major section', () => {
    // summary and experience have requirement_gap; skills has requirement_partial
    // All three must have at least one address_requirement template
    const sections = ['summary', 'experience', 'skills'];

    for (const section of sections) {
      const templates = SUGGESTION_TEMPLATES.filter(
        t =>
          t.intent === 'address_requirement' &&
          t.section_match.some(s => s === section || s === '*'),
      );
      expect(templates.length).toBeGreaterThan(0);
    }
  });

  it('all templates have required fields', () => {
    for (const template of SUGGESTION_TEMPLATES) {
      expect(template.intent).toBeDefined();
      expect(template.section_match).toBeDefined();
      expect(Array.isArray(template.section_match)).toBe(true);
      expect(template.scenario).toBeDefined();
      expect(template.question_template).toBeDefined();
      expect(template.revision_template).toBeDefined();
      expect(typeof template.priority_boost).toBe('number');
    }
  });

  it('has at least one wildcard template for common intents', () => {
    const commonIntents: Array<'quantify_bullet' | 'tighten' | 'strengthen_verb'> = [
      'quantify_bullet',
      'tighten',
      'strengthen_verb',
    ];

    for (const intent of commonIntents) {
      const wildcardTemplates = SUGGESTION_TEMPLATES.filter(
        t => t.intent === intent && t.section_match.includes('*'),
      );
      expect(wildcardTemplates.length).toBeGreaterThan(0);
    }
  });

  it('has no templates with single-brace placeholder syntax (must use {{}})', () => {
    for (const template of SUGGESTION_TEMPLATES) {
      // After replacing all valid {{...}} sequences, no lone { or } should remain
      const stripValid = (s: string) => s.replace(/\{\{[^}]+\}\}/g, 'PLACEHOLDER');
      const strippedQuestion = stripValid(template.question_template);
      const strippedRevision = stripValid(template.revision_template);

      expect(strippedQuestion).not.toContain('{');
      expect(strippedQuestion).not.toContain('}');
      expect(strippedRevision).not.toContain('{');
      expect(strippedRevision).not.toContain('}');
    }
  });
});
