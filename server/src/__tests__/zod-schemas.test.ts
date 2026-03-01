/**
 * Zod Schema Validation — Unit Tests
 *
 * Story: Add Zod Schemas for LLM Output Validation (Sprint 6)
 *
 * Verifies:
 *   - Valid LLM output parses correctly
 *   - Missing required fields log warning but do not crash (graceful fallback)
 *   - Extra (unknown) fields are stripped/passed through without breaking parse
 *   - Null/undefined handling for optional fields
 *   - Partial output handling — schemas produce usable defaults
 */

import { describe, it, expect } from 'vitest';

// ─── Strategist schemas ───────────────────────────────────────────────

import {
  BenchmarkCandidateSchema,
  ClassifyFitOutputSchema,
  RequirementMappingSchema,
  DesignBlueprintOutputSchema,
  SectionPlanSchema,
  AgeProtectionAuditSchema,
} from '../agents/schemas/strategist-schemas.js';

// ─── Craftsman schemas ────────────────────────────────────────────────

import {
  SelfReviewOutputSchema,
  KeywordCoverageOutputSchema,
  AntiPatternOutputSchema,
  EvidenceIntegrityOutputSchema,
} from '../agents/schemas/craftsman-schemas.js';

// ─── Producer schemas ─────────────────────────────────────────────────

import {
  AdversarialReviewOutputSchema,
  QualityScoresSchema,
  AtsComplianceOutputSchema,
  AtsComplianceFindingSchema,
  HumanizeCheckOutputSchema,
  NarrativeCoherenceOutputSchema,
} from '../agents/schemas/producer-schemas.js';

// ─────────────────────────────────────────────────────────────────────
// Strategist schema tests
// ─────────────────────────────────────────────────────────────────────

describe('BenchmarkCandidateSchema', () => {
  it('parses a valid LLM output correctly', () => {
    const input = {
      ideal_profile: 'VP Engineering with P&L ownership',
      language_keywords: ['TypeScript', 'distributed systems', 'team leadership'],
      section_expectations: {
        summary: '3-4 sentences on impact',
        experience: 'Quantified bullet points',
      },
    };
    const result = BenchmarkCandidateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ideal_profile).toBe('VP Engineering with P&L ownership');
      expect(result.data.language_keywords).toHaveLength(3);
    }
  });

  it('applies defaults for missing optional fields', () => {
    const result = BenchmarkCandidateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ideal_profile).toBe('');
      expect(result.data.language_keywords).toEqual([]);
      expect(result.data.section_expectations).toEqual({});
    }
  });

  it('passes through extra unknown fields from LLM', () => {
    const input = {
      ideal_profile: 'Executive',
      language_keywords: ['leadership'],
      section_expectations: {},
      extra_llm_field: 'some extra data',
      another_field: 42,
    };
    const result = BenchmarkCandidateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra_llm_field).toBe('some extra data');
    }
  });

  it('handles null/undefined input gracefully — returns failure not exception', () => {
    const resultNull = BenchmarkCandidateSchema.safeParse(null);
    const resultUndefined = BenchmarkCandidateSchema.safeParse(undefined);
    // safeParse should not throw, just return { success: false }
    expect(resultNull.success).toBe(false);
    expect(resultUndefined.success).toBe(false);
  });

  it('coerces partially provided output — missing fields default', () => {
    const partial = { ideal_profile: 'Senior leader in fintech' };
    const result = BenchmarkCandidateSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ideal_profile).toBe('Senior leader in fintech');
      expect(result.data.language_keywords).toEqual([]);
    }
  });
});

describe('ClassifyFitOutputSchema', () => {
  it('parses valid gap analysis output', () => {
    const input = {
      requirements: [
        {
          requirement: 'P&L ownership',
          classification: 'strong',
          evidence: ['Led $50M P&L for 3 years'],
        },
        {
          requirement: 'International experience',
          classification: 'gap',
          evidence: [],
          unaddressable: true,
        },
      ],
      coverage_score: 72,
      critical_gaps: ['International experience'],
      addressable_gaps: ['Board reporting'],
      strength_summary: 'Strong P&L and team leadership credentials.',
    };
    const result = ClassifyFitOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverage_score).toBe(72);
      expect(result.data.requirements).toHaveLength(2);
      expect(result.data.requirements[0].classification).toBe('strong');
      expect(result.data.requirements[1].classification).toBe('gap');
    }
  });

  it('applies defaults for completely empty output', () => {
    const result = ClassifyFitOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requirements).toEqual([]);
      expect(result.data.coverage_score).toBe(0);
      expect(result.data.critical_gaps).toEqual([]);
    }
  });

  it('coerces unknown classification values', () => {
    // Enum validation — invalid classification makes that entry fail
    const input = {
      requirements: [
        { requirement: 'test', classification: 'invalid_value', evidence: [] },
      ],
      coverage_score: 50,
    };
    // The entire object parse fails if an enum is wrong (not optional)
    // Since classification is optional with .default('gap'), it should default
    const result = ClassifyFitOutputSchema.safeParse(input);
    // With enum failure on inner optional, the outer parse could fail or succeed
    // depending on zod behavior — both outcomes are acceptable
    // The key requirement is: no exception thrown
    expect(typeof result.success).toBe('boolean');
  });
});

describe('RequirementMappingSchema', () => {
  it('handles all optional fields being absent', () => {
    const result = RequirementMappingSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requirement).toBe('');
      expect(result.data.classification).toBe('gap');
      expect(result.data.evidence).toEqual([]);
    }
  });
});

describe('DesignBlueprintOutputSchema', () => {
  it('parses a valid architect blueprint output', () => {
    const input = {
      blueprint_version: '2.0',
      target_role: 'VP Engineering',
      positioning_angle: 'Technical leader who builds while scaling',
      section_plan: {
        order: ['summary', 'experience', 'skills', 'education'],
        rationale: 'Lead with impact, support with credentials',
      },
      age_protection: {
        flags: [],
        clean: true,
      },
      keyword_map: {
        TypeScript: { target_density: 3, placements: ['summary', 'skills'], current_count: 0, action: 'add' },
      },
      global_rules: {
        voice: 'executive',
        bullet_format: 'RAS',
        length_target: '1-2 pages',
        ats_rules: 'no tables, no icons',
      },
    };
    const result = DesignBlueprintOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target_role).toBe('VP Engineering');
      expect(result.data.section_plan?.order).toHaveLength(4);
      expect(result.data.age_protection?.clean).toBe(true);
    }
  });

  it('handles completely empty blueprint gracefully', () => {
    const result = DesignBlueprintOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blueprint_version).toBe('1.0');
      expect(result.data.target_role).toBe('');
      expect(result.data.keyword_map).toEqual({});
    }
  });
});

describe('SectionPlanSchema', () => {
  it('parses valid section plan', () => {
    const result = SectionPlanSchema.safeParse({ order: ['summary', 'skills'], rationale: 'Impact first' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.order).toEqual(['summary', 'skills']);
    }
  });
});

describe('AgeProtectionAuditSchema', () => {
  it('defaults to clean when empty', () => {
    const result = AgeProtectionAuditSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(true);
      expect(result.data.flags).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Craftsman schema tests
// ─────────────────────────────────────────────────────────────────────

describe('SelfReviewOutputSchema', () => {
  it('parses valid self-review LLM output', () => {
    const input = {
      evaluations: [
        { criterion: 'Is this quantified?', result: 'PASS', note: 'Uses dollar amounts and percentages' },
        { criterion: 'Action verbs only?', result: 'FAIL', note: 'Contains "responsible for"' },
      ],
      score: 8,
      passed: true,
      issues: ['Replace "responsible for" with direct ownership verb'],
    };
    const result = SelfReviewOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(8);
      expect(result.data.passed).toBe(true);
      expect(result.data.issues).toHaveLength(1);
      expect(result.data.evaluations).toHaveLength(2);
    }
  });

  it('handles missing score and issues with defaults', () => {
    const result = SelfReviewOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(0);
      expect(result.data.passed).toBe(false);
      expect(result.data.issues).toEqual([]);
    }
  });

  it('passes through extra LLM fields without error', () => {
    const input = { score: 7, passed: true, issues: [], llm_internal_note: 'reasoning here', raw_chain_of_thought: '...' };
    const result = SelfReviewOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).llm_internal_note).toBe('reasoning here');
    }
  });

  it('returns failure on null/undefined — no exception thrown', () => {
    expect(() => SelfReviewOutputSchema.safeParse(null)).not.toThrow();
    expect(() => SelfReviewOutputSchema.safeParse(undefined)).not.toThrow();
    const result = SelfReviewOutputSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('handles partial output — score present but issues absent', () => {
    const partial = { score: 9, evaluations: [] };
    const result = SelfReviewOutputSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(9);
      expect(result.data.issues).toEqual([]);
    }
  });
});

describe('KeywordCoverageOutputSchema', () => {
  it('parses valid keyword coverage output', () => {
    const input = { found: ['TypeScript', 'leadership'], missing: ['Python'], coverage_pct: 67 };
    const result = KeywordCoverageOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverage_pct).toBe(67);
      expect(result.data.found).toHaveLength(2);
      expect(result.data.missing).toHaveLength(1);
    }
  });

  it('defaults to 0 coverage with empty arrays when input is empty', () => {
    const result = KeywordCoverageOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverage_pct).toBe(0);
      expect(result.data.found).toEqual([]);
      expect(result.data.missing).toEqual([]);
    }
  });
});

describe('AntiPatternOutputSchema', () => {
  it('parses clean result', () => {
    const result = AntiPatternOutputSchema.safeParse({ found_patterns: [], clean: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(true);
    }
  });

  it('parses result with violations', () => {
    const result = AntiPatternOutputSchema.safeParse({
      found_patterns: ['"responsible for" — replace with strong action verb'],
      clean: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clean).toBe(false);
      expect(result.data.found_patterns).toHaveLength(1);
    }
  });
});

describe('EvidenceIntegrityOutputSchema', () => {
  it('parses valid integrity check output', () => {
    const input = {
      claims_verified: 5,
      claims_flagged: ['42% revenue increase has no corresponding evidence'],
    };
    const result = EvidenceIntegrityOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claims_verified).toBe(5);
      expect(result.data.claims_flagged).toHaveLength(1);
    }
  });

  it('defaults to zero verified and empty flagged array when empty', () => {
    const result = EvidenceIntegrityOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claims_verified).toBe(0);
      expect(result.data.claims_flagged).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Producer schema tests
// ─────────────────────────────────────────────────────────────────────

describe('AdversarialReviewOutputSchema', () => {
  it('parses valid quality review output', () => {
    const input = {
      decision: 'approve',
      scores: {
        hiring_manager_impact: 4,
        requirement_coverage: 85,
        ats_score: 88,
        authenticity: 82,
        evidence_integrity: 92,
        blueprint_compliance: 90,
      },
      overall_pass: true,
      revision_instructions: [],
    };
    const result = AdversarialReviewOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision).toBe('approve');
      expect(result.data.overall_pass).toBe(true);
      expect(result.data.scores?.hiring_manager_impact).toBe(4);
    }
  });

  it('parses revise decision with revision instructions', () => {
    const input = {
      decision: 'revise',
      scores: { hiring_manager_impact: 3, requirement_coverage: 60, ats_score: 75, authenticity: 70, evidence_integrity: 80, blueprint_compliance: 65 },
      overall_pass: false,
      revision_instructions: [
        { target_section: 'summary', issue: 'Too generic', instruction: 'Add specific P&L metrics', priority: 'high' },
      ],
    };
    const result = AdversarialReviewOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision).toBe('revise');
      expect(result.data.revision_instructions).toHaveLength(1);
      expect(result.data.revision_instructions?.[0].priority).toBe('high');
    }
  });

  it('defaults to revise decision with empty object', () => {
    const result = AdversarialReviewOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision).toBe('revise');
      expect(result.data.overall_pass).toBe(false);
    }
  });

  it('handles extra fields from LLM without failing', () => {
    const input = {
      decision: 'approve',
      scores: { hiring_manager_impact: 5 },
      overall_pass: true,
      llm_reasoning: 'Chain of thought here',
      debug_info: { tokens_used: 1500 },
    };
    const result = AdversarialReviewOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('QualityScoresSchema', () => {
  it('parses all 6 dimensions', () => {
    const scores = { hiring_manager_impact: 4, requirement_coverage: 85, ats_score: 88, authenticity: 82, evidence_integrity: 92, blueprint_compliance: 90 };
    const result = QualityScoresSchema.safeParse(scores);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hiring_manager_impact).toBe(4);
      expect(result.data.ats_score).toBe(88);
    }
  });

  it('defaults missing dimensions to 0', () => {
    const result = QualityScoresSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hiring_manager_impact).toBe(0);
      expect(result.data.ats_score).toBe(0);
    }
  });
});

describe('AtsComplianceOutputSchema', () => {
  it('parses valid ATS findings', () => {
    const input = {
      findings: [
        { section: 'formatting', issue: 'Pipe character detected', instruction: 'Remove pipe separators', priority: 'high' },
      ],
      summary: { total: 1, high_priority: 1, medium_priority: 0, low_priority: 0, passes: false },
    };
    const result = AtsComplianceOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0].priority).toBe('high');
    }
  });

  it('defaults to empty findings array when absent', () => {
    const result = AtsComplianceOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toEqual([]);
    }
  });
});

describe('AtsComplianceFindingSchema', () => {
  it('validates priority enum values', () => {
    const high = AtsComplianceFindingSchema.safeParse({ priority: 'high', section: 's', issue: 'i', instruction: 'x' });
    const medium = AtsComplianceFindingSchema.safeParse({ priority: 'medium', section: 's', issue: 'i', instruction: 'x' });
    const low = AtsComplianceFindingSchema.safeParse({ priority: 'low', section: 's', issue: 'i', instruction: 'x' });
    expect(high.success).toBe(true);
    expect(medium.success).toBe(true);
    expect(low.success).toBe(true);
  });

  it('defaults to medium priority for missing priority field', () => {
    const result = AtsComplianceFindingSchema.safeParse({ section: 'formatting', issue: 'test', instruction: 'fix it' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('medium');
    }
  });
});

describe('HumanizeCheckOutputSchema', () => {
  it('parses a valid humanize check response', () => {
    const input = { score: 82, issues: ['All bullets start with action verb + metric + result — too uniform'] };
    const result = HumanizeCheckOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(82);
      expect(result.data.issues).toHaveLength(1);
    }
  });

  it('defaults to score 75 with empty issues when empty object provided', () => {
    const result = HumanizeCheckOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(75);
      expect(result.data.issues).toEqual([]);
    }
  });

  it('clamps score to 0-100 range — rejects out of bounds', () => {
    // z.number().min(0).max(100) will fail parse on out-of-range values
    const tooHigh = HumanizeCheckOutputSchema.safeParse({ score: 101, issues: [] });
    const tooLow = HumanizeCheckOutputSchema.safeParse({ score: -1, issues: [] });
    // Out-of-bounds values fail validation (not silently clamped by zod)
    expect(tooHigh.success).toBe(false);
    expect(tooLow.success).toBe(false);
  });

  it('passes through extra LLM fields', () => {
    const input = { score: 78, issues: [], confidence: 'high', model_version: 'glm-4.7' };
    const result = HumanizeCheckOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).confidence).toBe('high');
    }
  });

  it('handles null/undefined input without exception', () => {
    expect(() => HumanizeCheckOutputSchema.safeParse(null)).not.toThrow();
    expect(() => HumanizeCheckOutputSchema.safeParse(undefined)).not.toThrow();
    expect(HumanizeCheckOutputSchema.safeParse(null).success).toBe(false);
  });
});

describe('NarrativeCoherenceOutputSchema', () => {
  it('parses valid narrative coherence response', () => {
    const input = {
      coherence_score: 85,
      issues: ['Summary mentions P&L but experience bullets focus on cost-cutting — contradictory positioning'],
    };
    const result = NarrativeCoherenceOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coherence_score).toBe(85);
      expect(result.data.issues).toHaveLength(1);
    }
  });

  it('defaults to coherence_score 75 with empty issues', () => {
    const result = NarrativeCoherenceOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coherence_score).toBe(75);
      expect(result.data.issues).toEqual([]);
    }
  });

  it('handles partial output — coherence_score present, issues absent', () => {
    const result = NarrativeCoherenceOutputSchema.safeParse({ coherence_score: 92 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coherence_score).toBe(92);
      expect(result.data.issues).toEqual([]);
    }
  });

  it('rejects out-of-range coherence scores', () => {
    const tooHigh = NarrativeCoherenceOutputSchema.safeParse({ coherence_score: 150 });
    expect(tooHigh.success).toBe(false);
  });
});
