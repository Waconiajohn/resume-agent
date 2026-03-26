/**
 * Resume V2 Assembly Agent — Unit tests.
 *
 * Agent 10 is fully deterministic (no LLM). This suite exercises:
 * - runAssembly: output structure, score mapping, optional positioning_assessment
 * - applyToneFixes (via runAssembly): replacements across every section, edge cases
 * - computeQuickWins (via runAssembly): priority ordering, max-3 cap, default message
 * - buildPositioningAssessment (via runAssembly): requirement classification, addressed_by
 *   population from bullets and accomplishments, strategy_used, summary text, score mapping
 */

import { describe, expect, it } from 'vitest';

import { runAssembly } from '../agents/resume-v2/assembly/agent.js';
import type {
  AssemblyInput,
  ATSOptimizationOutput,
  ExecutiveToneOutput,
  GapAnalysisOutput,
  PreScores,
  ResumeDraftOutput,
  TruthVerificationOutput,
} from '../agents/resume-v2/types.js';

// ─── Fixture builders ─────────────────────────────────────────────────────────

function makeDraft(overrides?: Partial<ResumeDraftOutput>): ResumeDraftOutput {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-1234',
      email: 'jane@example.com',
      linkedin: 'linkedin.com/in/janedoe',
      branded_title: 'Enterprise Transformation Leader',
    },
    executive_summary: {
      content:
        'Seasoned executive who is responsible for driving synergistic outcomes ' +
        'and leveraging best-in-class solutions.',
      is_new: true,
    },
    core_competencies: [
      'Strategic Planning',
      'Team Leadership',
      'Responsible for P&L Management',
      'Cloud Infrastructure',
      'Stakeholder Alignment',
    ],
    selected_accomplishments: [
      {
        content:
          'Drove a 40% reduction in operational costs by leveraging cloud migration ' +
          'across 3 business units.',
        is_new: true,
        addresses_requirements: ['Cloud Infrastructure', 'Cost Reduction'],
        source: 'original' as const,
        confidence: 'strong' as const,
        evidence_found: '',
        requirement_source: 'job_description' as const,
      },
      {
        content:
          'Spearheaded enterprise transformation initiative impacting $120M revenue base.',
        is_new: false,
        addresses_requirements: ['Enterprise Transformation'],
        source: 'original' as const,
        confidence: 'strong' as const,
        evidence_found: '',
        requirement_source: 'job_description' as const,
      },
    ],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP of Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        scope_statement:
          'Responsible for leading a distributed team of 45 engineers across 6 product teams.',
        scope_statement_source: 'original' as const,
        scope_statement_confidence: 'strong' as const,
        scope_statement_evidence_found: '',
        bullets: [
          {
            text: 'Reduced deployment time by 60% through CI/CD improvements.',
            is_new: false,
            addresses_requirements: ['Cloud Infrastructure', 'DevOps'],
            source: 'original' as const,
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
          {
            text: 'Leveraged synergistic partnerships to drive $8M ARR growth.',
            is_new: true,
            addresses_requirements: ['Revenue Growth', 'Partnership Management'],
            source: 'original' as const,
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
          {
            text: 'Managed cross-functional teams to deliver ERP migration on time.',
            is_new: false,
            addresses_requirements: ['Enterprise Transformation'],
            source: 'original' as const,
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
        ],
      },
      {
        company: 'Beta Ltd',
        title: 'Director of Technology',
        start_date: 'Mar 2016',
        end_date: 'Dec 2019',
        scope_statement:
          'Led technology roadmap and responsible for $15M annual budget.',
        scope_statement_source: 'original' as const,
        scope_statement_confidence: 'strong' as const,
        scope_statement_evidence_found: '',
        bullets: [
          {
            text: 'Architected microservices platform supporting 5M daily active users.',
            is_new: false,
            addresses_requirements: ['Cloud Infrastructure', 'Scalability'],
            source: 'original' as const,
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
          {
            text: 'Implemented DevSecOps practices reducing security incidents by 70%.',
            is_new: true,
            addresses_requirements: ['DevOps', 'Security'],
            source: 'original' as const,
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
          {
            text: 'Hired and developed a high-performing team of 20 engineers.',
            is_new: false,
            addresses_requirements: ['Team Leadership'],
            source: 'original' as const,
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
        ],
      },
    ],
    education: [
      { degree: 'BS Computer Science', institution: 'MIT', year: '2005' },
    ],
    certifications: ['AWS Solutions Architect'],
    ...overrides,
  };
}

function makeTruthVerification(
  overrides?: Partial<TruthVerificationOutput>,
): TruthVerificationOutput {
  return {
    claims: [],
    truth_score: 85,
    flagged_items: [
      {
        claim: '$8M ARR growth',
        issue: 'Metric not found in original resume or candidate profile',
        recommendation: 'Remove or replace with a verified figure',
      },
    ],
    ...overrides,
  };
}

function makeATSOptimization(
  overrides?: Partial<ATSOptimizationOutput>,
): ATSOptimizationOutput {
  return {
    match_score: 78,
    keywords_found: [
      'Cloud Infrastructure',
      'DevOps',
      'Team Leadership',
      'Enterprise Transformation',
      'CI/CD',
    ],
    keywords_missing: ['Kubernetes', 'Agile at Scale'],
    keyword_suggestions: [],
    formatting_issues: [],
    ...overrides,
  };
}

function makeExecutiveTone(
  overrides?: Partial<ExecutiveToneOutput>,
): ExecutiveToneOutput {
  return {
    findings: [
      {
        text: 'responsible for',
        section: 'executive_summary',
        issue: 'junior_language',
        suggestion: 'overseeing',
      },
      {
        text: 'leveraging',
        section: 'core_competencies',
        issue: 'generic_filler',
        suggestion: 'applying',
      },
    ],
    tone_score: 82,
    banned_phrases_found: ['synergistic'],
    ...overrides,
  };
}

function makeGapAnalysis(
  overrides?: Partial<GapAnalysisOutput>,
): GapAnalysisOutput {
  return {
    requirements: [
      {
        requirement: 'Cloud Infrastructure',
        source: 'job_description',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Multiple cloud mentions in experience'],
        strategy: undefined,
      },
      {
        requirement: 'DevOps',
        source: 'job_description',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['CI/CD bullet', 'DevSecOps bullet'],
        strategy: undefined,
      },
      {
        requirement: 'Revenue Growth',
        source: 'benchmark',
        importance: 'important',
        classification: 'partial',
        evidence: ['ARR growth bullet (needs verification)'],
        strategy: {
          real_experience: 'Indirect revenue influence through platform improvements',
          positioning:
            'Repositioned as platform enablement driving revenue outcomes',
          inference_rationale:
            'Engineering efficiency improvements directly unblocked $8M product roadmap',
        },
      },
      {
        requirement: 'Kubernetes',
        source: 'job_description',
        importance: 'nice_to_have',
        classification: 'missing',
        evidence: [],
        strategy: undefined,
      },
    ],
    coverage_score: 72,
    strength_summary: 'Strong cloud and DevOps coverage; revenue gap partially addressed.',
    critical_gaps: ['Kubernetes'],
    pending_strategies: [
      {
        requirement: 'Revenue Growth',
        strategy: {
          real_experience: 'Indirect revenue influence',
          positioning: 'Repositioned as platform enablement',
          inference_rationale:
            'Engineering efficiency improvements directly unblocked $8M product roadmap',
        },
      },
    ],
    ...overrides,
  };
}

function makePreScores(overrides?: Partial<PreScores>): PreScores {
  return {
    ats_match: 55,
    keywords_found: ['Cloud Infrastructure', 'DevOps'],
    keywords_missing: ['Kubernetes', 'Agile at Scale', 'Revenue Growth'],
    ...overrides,
  };
}

function makeInput(overrides?: Partial<AssemblyInput>): AssemblyInput {
  return {
    draft: makeDraft(),
    truth_verification: makeTruthVerification(),
    ats_optimization: makeATSOptimization(),
    executive_tone: makeExecutiveTone(),
    gap_analysis: makeGapAnalysis(),
    pre_scores: makePreScores(),
    ...overrides,
  };
}

// ─── runAssembly: output structure ───────────────────────────────────────────

describe('runAssembly — output structure', () => {
  it('returns final_resume, scores, quick_wins, and positioning_assessment', () => {
    const result = runAssembly(makeInput());

    expect(result).toHaveProperty('final_resume');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('quick_wins');
    expect(result).toHaveProperty('positioning_assessment');
  });

  it('maps scores correctly from verification agents', () => {
    const result = runAssembly(makeInput());

    expect(result.scores.ats_match).toBe(78);
    expect(result.scores.truth).toBe(85);
    expect(result.scores.tone).toBe(82);
  });

  it('includes positioning_assessment when gap_analysis provided', () => {
    const result = runAssembly(makeInput({ gap_analysis: makeGapAnalysis() }));

    expect(result.positioning_assessment).toBeDefined();
  });

  it('omits positioning_assessment when gap_analysis is undefined', () => {
    const result = runAssembly(makeInput({ gap_analysis: undefined }));

    expect(result.positioning_assessment).toBeUndefined();
  });

  it('preserves header fields unchanged', () => {
    const result = runAssembly(makeInput());

    expect(result.final_resume.header.name).toBe('Jane Doe');
    expect(result.final_resume.header.branded_title).toBe('Enterprise Transformation Leader');
  });

  it('preserves education and certifications unchanged', () => {
    const result = runAssembly(makeInput());

    expect(result.final_resume.education).toHaveLength(1);
    expect(result.final_resume.certifications).toContain('AWS Solutions Architect');
  });
});

// ─── applyToneFixes ───────────────────────────────────────────────────────────

describe('applyToneFixes (via runAssembly)', () => {
  it('returns draft unchanged when findings array is empty', () => {
    const draft = makeDraft();
    const result = runAssembly(
      makeInput({ executive_tone: makeExecutiveTone({ findings: [] }) }),
    );

    expect(result.final_resume.executive_summary.content).toBe(
      draft.executive_summary.content,
    );
  });

  it('replaces text in executive_summary', () => {
    // Fixture summary contains "responsible for" → should become "overseeing"
    const result = runAssembly(makeInput());

    expect(result.final_resume.executive_summary.content).toContain('overseeing');
    expect(result.final_resume.executive_summary.content).not.toContain('responsible for');
  });

  it('replaces text in core_competencies', () => {
    // Fixture competencies contain "Responsible for P&L Management" and
    // "leveraging" / "best-in-class" appears in the summary — verify competency replacement
    // The finding is: "leveraging" → "applying"
    const draft = makeDraft({
      core_competencies: ['Leveraging Cloud Platforms', 'Strategic Planning'],
    });
    const result = runAssembly(makeInput({ draft }));

    expect(result.final_resume.core_competencies).toContain('applying Cloud Platforms');
    expect(result.final_resume.core_competencies).toContain('Strategic Planning');
  });

  it('replaces text in selected_accomplishments', () => {
    // Fixture accomplishment 1 contains "leveraging" → should become "applying"
    const result = runAssembly(makeInput());

    const accomplishment = result.final_resume.selected_accomplishments[0];
    expect(accomplishment.content).not.toContain('leveraging');
    expect(accomplishment.content).toContain('applying');
  });

  it('replaces text in professional_experience bullets', () => {
    // Build a draft where a bullet contains the exact finding text "leveraging"
    const draft = makeDraft({
      professional_experience: [
        {
          company: 'Acme Corp',
          title: 'VP of Engineering',
          start_date: 'Jan 2020',
          end_date: 'Present',
          scope_statement: 'Led a distributed engineering team.',
          scope_statement_source: 'original' as const,
          scope_statement_confidence: 'strong' as const,
          scope_statement_evidence_found: '',
          bullets: [
            {
              text: 'Reduced deployment time by 60% through CI/CD improvements.',
              is_new: false,
              addresses_requirements: ['DevOps'],
              source: 'original' as const,
              confidence: 'strong' as const,
              evidence_found: '',
              requirement_source: 'job_description' as const,
            },
            {
              text: 'Grew ARR by leveraging strategic partnerships.',
              is_new: true,
              addresses_requirements: ['Revenue Growth'],
              source: 'original' as const,
              confidence: 'strong' as const,
              evidence_found: '',
              requirement_source: 'job_description' as const,
            },
          ],
        },
      ],
    });
    const result = runAssembly(makeInput({ draft }));

    const acmeBullets = result.final_resume.professional_experience[0].bullets;
    // "leveraging" should have been replaced with "applying"
    expect(acmeBullets[1].text).toContain('applying');
    expect(acmeBullets[1].text).not.toContain('leveraging');
    // Unrelated bullet should be untouched
    expect(acmeBullets[0].text).toContain('CI/CD');
  });

  it('replaces text in professional_experience scope_statement', () => {
    // Both scope_statements contain "responsible for" → should become "overseeing"
    const result = runAssembly(makeInput());

    for (const exp of result.final_resume.professional_experience) {
      expect(exp.scope_statement).not.toMatch(/responsible for/i);
      expect(exp.scope_statement).toContain('overseeing');
    }
  });

  it('performs case-insensitive replacement', () => {
    // "leveraging" finding should replace "Leveraging" (capital L) in competencies
    const draft = makeDraft({
      core_competencies: ['LEVERAGING best practices', 'Strategic Planning'],
    });
    const result = runAssembly(makeInput({ draft }));

    expect(result.final_resume.core_competencies[0]).not.toMatch(/LEVERAGING/i);
    expect(result.final_resume.core_competencies[0]).toBe('applying best practices');
  });

  it('applies multiple replacements in the same text', () => {
    // Summary contains both "responsible for" and "leveraging best-in-class"
    const draft = makeDraft({
      executive_summary: {
        content: 'Executive responsible for leveraging cloud platforms.',
        is_new: true,
      },
    });
    const result = runAssembly(makeInput({ draft }));

    expect(result.final_resume.executive_summary.content).toBe(
      'Executive overseeing applying cloud platforms.',
    );
  });

  it('handles special regex characters in replacement text without throwing', () => {
    const draft = makeDraft({
      executive_summary: {
        content: 'Leader with $10M P&L responsibility.',
        is_new: true,
      },
    });
    const tone = makeExecutiveTone({
      findings: [
        {
          text: '$10M P&L',
          section: 'executive_summary',
          issue: 'junior_language',
          // Suggestion contains characters that are special in regex
          suggestion: '$10M (P&L) [verified]',
        },
      ],
    });

    expect(() => runAssembly(makeInput({ draft, executive_tone: tone }))).not.toThrow();
    const result = runAssembly(makeInput({ draft, executive_tone: tone }));
    expect(result.final_resume.executive_summary.content).toContain(
      '$10M (P&L) [verified]',
    );
  });

  it('does not mutate the original draft', () => {
    const draft = makeDraft();
    const originalSummary = draft.executive_summary.content;
    runAssembly(makeInput({ draft }));

    expect(draft.executive_summary.content).toBe(originalSummary);
  });

  it('returns draft unchanged when findings have no suggestion', () => {
    const draft = makeDraft();
    const tone = makeExecutiveTone({
      findings: [
        {
          text: 'responsible for',
          section: 'executive_summary',
          issue: 'junior_language',
          suggestion: '',
        },
      ],
    });
    const result = runAssembly(makeInput({ draft, executive_tone: tone }));

    // Empty suggestion means no replacement
    expect(result.final_resume.executive_summary.content).toBe(
      draft.executive_summary.content,
    );
  });
});

// ─── computeQuickWins ─────────────────────────────────────────────────────────

describe('computeQuickWins (via runAssembly)', () => {
  it('flagged truth items produce high-impact wins', () => {
    const result = runAssembly(makeInput());

    const highImpact = result.quick_wins.filter(w => w.impact === 'high');
    expect(highImpact.length).toBeGreaterThanOrEqual(1);
    expect(highImpact[0].description).toContain('Fix:');
    expect(highImpact[0].description).toContain('Remove or replace with a verified figure');
  });

  it('missing keywords produce medium-impact wins', () => {
    const result = runAssembly(makeInput());

    const medium = result.quick_wins.find(w => w.impact === 'medium');
    expect(medium).toBeDefined();
    expect(medium!.description).toContain('Add missing keywords');
    expect(medium!.description).toContain('Kubernetes');
  });

  it('banned phrases produce low-impact wins', () => {
    const result = runAssembly(makeInput());

    const low = result.quick_wins.find(
      w => w.impact === 'low' && w.description.includes('Remove banned phrases'),
    );
    expect(low).toBeDefined();
    expect(low!.description).toContain('synergistic');
  });

  it('caps quick wins at 3', () => {
    // 2 flagged items + missing keywords + banned phrases would be 4 without the cap
    const truth = makeTruthVerification({
      flagged_items: [
        {
          claim: 'Claim A',
          issue: 'Issue A',
          recommendation: 'Fix A',
        },
        {
          claim: 'Claim B',
          issue: 'Issue B',
          recommendation: 'Fix B',
        },
      ],
    });
    const result = runAssembly(makeInput({ truth_verification: truth }));

    expect(result.quick_wins.length).toBeLessThanOrEqual(3);
  });

  it('returns default well-optimized message when no issues found', () => {
    const input = makeInput({
      truth_verification: makeTruthVerification({ flagged_items: [] }),
      ats_optimization: makeATSOptimization({ keywords_missing: [] }),
      executive_tone: makeExecutiveTone({ banned_phrases_found: [], findings: [] }),
    });
    const result = runAssembly(input);

    expect(result.quick_wins).toHaveLength(1);
    expect(result.quick_wins[0].description).toContain('well-optimized');
    expect(result.quick_wins[0].impact).toBe('low');
  });

  it('prioritizes flagged truth items (high) over keywords (medium) over banned phrases (low)', () => {
    const result = runAssembly(makeInput());

    // The first item with the highest priority should come first
    const impacts = result.quick_wins.map(w => w.impact);
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...impacts].sort(
      (a, b) => priorityOrder[a] - priorityOrder[b],
    );
    expect(impacts).toEqual(sorted);
  });

  it('includes missing keyword text in the description', () => {
    const result = runAssembly(
      makeInput({
        ats_optimization: makeATSOptimization({
          keywords_missing: ['Kubernetes', 'Agile at Scale', 'SRE'],
        }),
      }),
    );

    const medium = result.quick_wins.find(w => w.impact === 'medium');
    expect(medium!.description).toContain('Kubernetes');
    expect(medium!.description).toContain('Agile at Scale');
    expect(medium!.description).toContain('SRE');
  });

  it('does not duplicate wins when only one source produces issues', () => {
    const input = makeInput({
      truth_verification: makeTruthVerification({ flagged_items: [] }),
      ats_optimization: makeATSOptimization({ keywords_missing: [] }),
      // Only banned phrases
    });
    const result = runAssembly(input);

    expect(result.quick_wins.length).toBe(1);
    expect(result.quick_wins[0].impact).toBe('low');
  });
});

// ─── buildPositioningAssessment ───────────────────────────────────────────────

describe('buildPositioningAssessment (via runAssembly)', () => {
  it('classifies strong requirements as status: strong', () => {
    const result = runAssembly(makeInput());

    const cloudEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Cloud Infrastructure',
    );
    expect(cloudEntry).toBeDefined();
    expect(cloudEntry!.status).toBe('strong');
  });

  it('classifies partial requirements with strategy and bullets as status: repositioned', () => {
    const result = runAssembly(makeInput());

    const revenueEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Revenue Growth',
    );
    expect(revenueEntry).toBeDefined();
    expect(revenueEntry!.status).toBe('repositioned');
  });

  it('classifies missing requirements as status: gap', () => {
    const result = runAssembly(makeInput());

    const k8sEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Kubernetes',
    );
    expect(k8sEntry).toBeDefined();
    expect(k8sEntry!.status).toBe('gap');
  });

  it('populates addressed_by from matching experience bullets', () => {
    const result = runAssembly(makeInput());

    const cloudEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Cloud Infrastructure',
    );
    // The fixture has bullets addressing "Cloud Infrastructure" in both experiences
    expect(cloudEntry!.addressed_by.length).toBeGreaterThan(0);

    const sections = cloudEntry!.addressed_by.map(a => a.section);
    expect(sections).toContain('VP of Engineering at Acme Corp');
  });

  it('populates addressed_by from selected_accomplishments', () => {
    const result = runAssembly(makeInput());

    // "Cloud Infrastructure" is also in selected_accomplishments[0].addresses_requirements
    const cloudEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Cloud Infrastructure',
    );
    const accomplishmentAddresses = cloudEntry!.addressed_by.filter(
      a => a.section === 'Selected Accomplishments',
    );
    expect(accomplishmentAddresses.length).toBeGreaterThan(0);
  });

  it('sets strategy_used for repositioned requirements', () => {
    const result = runAssembly(makeInput());

    const revenueEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Revenue Growth',
    );
    expect(revenueEntry!.strategy_used).toBeDefined();
    expect(revenueEntry!.strategy_used).toContain('Repositioned as platform enablement');
  });

  it('does not set strategy_used for strong requirements', () => {
    const result = runAssembly(makeInput());

    const cloudEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Cloud Infrastructure',
    );
    expect(cloudEntry!.strategy_used).toBeUndefined();
  });

  it('does not set strategy_used for missing requirements with no strategy', () => {
    const result = runAssembly(makeInput());

    const k8sEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Kubernetes',
    );
    expect(k8sEntry!.strategy_used).toBeUndefined();
  });

  it('summary includes correct strong count and total', () => {
    const result = runAssembly(makeInput());

    // Fixture: Cloud Infrastructure (strong), DevOps (strong), Revenue Growth (repositioned), Kubernetes (gap)
    // 2 strong out of 4 total
    expect(result.positioning_assessment!.summary).toContain('2 of 4');
  });

  it('summary mentions repositioned count when present', () => {
    const result = runAssembly(makeInput());

    expect(result.positioning_assessment!.summary).toContain('1 requirement');
  });

  it('summary mentions gaps when present', () => {
    const result = runAssembly(makeInput());

    expect(result.positioning_assessment!.summary).toContain('gap');
  });

  it('summary says "No critical gaps remain" when there are no gaps', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          source: 'job_description',
          importance: 'must_have',
          classification: 'strong',
          evidence: [],
          strategy: undefined,
        },
        {
          requirement: 'Team Leadership',
          source: 'job_description',
          importance: 'must_have',
          classification: 'strong',
          evidence: [],
          strategy: undefined,
        },
      ],
    });
    const result = runAssembly(makeInput({ gap_analysis: gap }));

    expect(result.positioning_assessment!.summary).toContain('No critical gaps remain');
  });

  it('uses pre_scores.ats_match as before_score', () => {
    const result = runAssembly(makeInput());

    expect(result.positioning_assessment!.before_score).toBe(55);
  });

  it('uses ats_optimization.match_score as after_score', () => {
    const result = runAssembly(makeInput());

    expect(result.positioning_assessment!.after_score).toBe(78);
  });

  it('uses 0 as before_score when pre_scores is not provided', () => {
    const result = runAssembly(makeInput({ pre_scores: undefined }));

    expect(result.positioning_assessment!.before_score).toBe(0);
  });

  it('performs case-insensitive requirement matching on bullets', () => {
    // Bullet addresses_requirements uses "cloud infrastructure" (lowercase)
    // Gap requirement is "Cloud Infrastructure" (title case) — should still match
    const draft = makeDraft({
      professional_experience: [
        {
          company: 'TestCo',
          title: 'CTO',
          start_date: '2020',
          end_date: 'Present',
          scope_statement: 'Led technology.',
          scope_statement_source: 'original' as const,
          scope_statement_confidence: 'strong' as const,
          scope_statement_evidence_found: '',
          bullets: [
            {
              text: 'Modernized cloud platform.',
              is_new: false,
              addresses_requirements: ['cloud infrastructure'],
              source: 'original' as const,
              confidence: 'strong' as const,
              evidence_found: '',
              requirement_source: 'job_description' as const,
            },
          ],
        },
      ],
    });
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          source: 'job_description',
          importance: 'must_have',
          classification: 'strong',
          evidence: [],
          strategy: undefined,
        },
      ],
    });
    const result = runAssembly(makeInput({ draft, gap_analysis: gap }));

    const cloudEntry = result.positioning_assessment!.requirement_map[0];
    expect(cloudEntry.addressed_by.length).toBeGreaterThan(0);
    expect(cloudEntry.addressed_by[0].section).toBe('CTO at TestCo');
  });

  it('performs case-insensitive requirement matching on selected_accomplishments', () => {
    const draft = makeDraft({
      selected_accomplishments: [
        {
          content: 'Led enterprise-wide cloud migration.',
          is_new: false,
          addresses_requirements: ['CLOUD INFRASTRUCTURE'],
          source: 'original' as const,
          confidence: 'strong' as const,
          evidence_found: '',
          requirement_source: 'job_description' as const,
        },
      ],
    });
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          source: 'job_description',
          importance: 'must_have',
          classification: 'strong',
          evidence: [],
          strategy: undefined,
        },
      ],
    });
    const result = runAssembly(makeInput({ draft, gap_analysis: gap }));

    const cloudEntry = result.positioning_assessment!.requirement_map[0];
    const accEntry = cloudEntry.addressed_by.find(
      a => a.section === 'Selected Accomplishments',
    );
    expect(accEntry).toBeDefined();
  });

  it('populates strategies_applied from inference_rationale when present', () => {
    const result = runAssembly(makeInput());

    // Revenue Growth has inference_rationale
    const appliedStrategy = result.positioning_assessment!.strategies_applied.find(
      s => s.startsWith('Revenue Growth'),
    );
    expect(appliedStrategy).toBeDefined();
    expect(appliedStrategy).toContain('Engineering efficiency improvements');
  });

  it('falls back to strategy.positioning in strategies_applied when no inference_rationale', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Revenue Growth',
          source: 'benchmark',
          importance: 'important',
          classification: 'partial',
          evidence: [],
          strategy: {
            real_experience: 'Indirect revenue influence',
            positioning: 'Positioned as revenue enabler',
            // No inference_rationale
          },
        },
      ],
    });
    // Need a bullet that addresses Revenue Growth so status is 'repositioned'
    const draft = makeDraft({
      professional_experience: [
        {
          company: 'Co',
          title: 'VP',
          start_date: '2020',
          end_date: 'Present',
          scope_statement: 'Led team.',
          scope_statement_source: 'original' as const,
          scope_statement_confidence: 'strong' as const,
          scope_statement_evidence_found: '',
          bullets: [
            {
              text: 'Drove revenue growth through platform improvements.',
              is_new: false,
              addresses_requirements: ['Revenue Growth'],
              source: 'original' as const,
              confidence: 'strong' as const,
              evidence_found: '',
              requirement_source: 'job_description' as const,
            },
          ],
        },
      ],
    });
    const result = runAssembly(makeInput({ draft, gap_analysis: gap }));

    const applied = result.positioning_assessment!.strategies_applied.find(
      s => s.startsWith('Revenue Growth'),
    );
    expect(applied).toBeDefined();
    expect(applied).toContain('Positioned as revenue enabler');
  });

  it('handles an empty requirements array gracefully', () => {
    const gap = makeGapAnalysis({ requirements: [] });
    const result = runAssembly(makeInput({ gap_analysis: gap }));

    expect(result.positioning_assessment!.requirement_map).toHaveLength(0);
    expect(result.positioning_assessment!.summary).toContain('0 of 0');
    expect(result.positioning_assessment!.summary).toContain('No critical gaps remain');
  });

  it('includes requirement importance in the map entries', () => {
    const result = runAssembly(makeInput());

    const cloudEntry = result.positioning_assessment!.requirement_map.find(
      r => r.requirement === 'Cloud Infrastructure',
    );
    expect(cloudEntry!.importance).toBe('must_have');
  });

  it('partial requirement with strategy but no matching bullets is classified as gap', () => {
    const draft = makeDraft({
      professional_experience: [
        {
          company: 'Co',
          title: 'VP',
          start_date: '2020',
          end_date: 'Present',
          scope_statement: 'Led team.',
          scope_statement_source: 'original' as const,
          scope_statement_confidence: 'strong' as const,
          scope_statement_evidence_found: '',
          bullets: [
            {
              text: 'Did something unrelated.',
              is_new: false,
              addresses_requirements: ['Something Else'],
              source: 'original' as const,
              confidence: 'strong' as const,
              evidence_found: '',
              requirement_source: 'job_description' as const,
            },
          ],
        },
      ],
      selected_accomplishments: [],
    });
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Revenue Growth',
          source: 'benchmark',
          importance: 'important',
          classification: 'partial',
          evidence: [],
          strategy: {
            real_experience: 'Some experience',
            positioning: 'Reposition it',
          },
        },
      ],
    });
    const result = runAssembly(makeInput({ draft, gap_analysis: gap }));

    const revenueEntry = result.positioning_assessment!.requirement_map[0];
    expect(revenueEntry.status).toBe('gap');
  });
});
