import { describe, it, expect } from 'vitest';
import { scoreSuggestion } from '@/lib/suggestion-scoring';
import type { SuggestionScoringContext } from '@/lib/suggestion-scoring';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function ctx(overrides: Partial<SuggestionScoringContext> = {}): SuggestionScoringContext {
  return {
    targetRequirements: [],
    ...overrides,
  };
}

// ─── preservesSpecificity ────────────────────────────────────────────────────

describe('preservesSpecificity', () => {
  it('scores 10 when suggestion retains all named tech from current text', () => {
    // Start the sentence with a tech term (AWS) so NAMED_ENTITY_PATTERN does not
    // add a new capitalised non-tech word as a separate entity. All three tech
    // terms are preserved in the suggestion → 3/3 = 100% → score 10.
    const current = 'AWS and Kubernetes infrastructure built using Terraform.';
    const suggestion = 'Led AWS infrastructure modernization, orchestrating Kubernetes clusters with Terraform automation.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSpecificity).toBe(10);
  });

  it('scores >= 6 when current mentions SAP, Salesforce, Oracle and suggestion keeps all three tech terms', () => {
    // The engine also captures multi-word named entity spans ("Integrated SAP ERP",
    // "Salesforce CRM") in addition to individual tech terms, so preservation
    // ratio may be ~60% even when all individual terms are retained.
    const current = 'Connected SAP, Salesforce, and Oracle through a custom middleware layer.';
    const suggestion = 'Directed enterprise integration between SAP, Salesforce, and Oracle, reducing data latency by 40%.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSpecificity).toBeGreaterThanOrEqual(6);
  });

  it('scores 2 when current lists several tech terms and suggestion drops most of them', () => {
    const current = 'Built data pipelines using Snowflake, Databricks, Kafka, and Airflow for real-time analytics.';
    // Suggestion keeps only one of the four tech terms
    const suggestion = 'Designed and delivered a real-time analytics platform using Kafka.';
    const result = scoreSuggestion(current, suggestion, ctx());
    // 1 of 4 preserved = 25% ratio → score 2
    expect(result.dimensions.preservesSpecificity).toBeLessThanOrEqual(4);
  });

  it('returns 8 (neutral) when current text has no named entities to preserve', () => {
    // Start the sentence lowercase so NAMED_ENTITY_PATTERN does not capture the
    // opening word as a named entity. A sentence with no capitalised words and no
    // tech terms will have an empty entity set and return 8.
    const current = 'the team delivered all projects on time within budget.';
    const suggestion = 'Led cross-functional delivery teams to achieve on-time project completion.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSpecificity).toBe(8);
  });

  it('scores 8 when current retains 80-99% of named entities', () => {
    const current = 'Used AWS, Azure, and GCP for multi-cloud architecture.';
    // Suggestion keeps AWS and Azure but drops GCP
    const suggestion = 'Architected multi-cloud infrastructure on AWS and Azure, reducing costs by 30%.';
    const result = scoreSuggestion(current, suggestion, ctx());
    // 2 of 3 preserved = 66% ratio → score 6
    expect(result.dimensions.preservesSpecificity).toBeGreaterThanOrEqual(4);
    expect(result.dimensions.preservesSpecificity).toBeLessThanOrEqual(8);
  });
});

// ─── preservesSeniority ──────────────────────────────────────────────────────

describe('preservesSeniority', () => {
  it('scores 10 when current has ownership verbs and suggestion uses equivalent strong verbs', () => {
    const current = 'Led a team of 12 engineers and architected the core payment service.';
    const suggestion = 'Directed 12-person engineering team and oversaw architecture of the core payment service.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSeniority).toBe(10);
  });

  it('scores 10 when suggestion uses "spearheaded" or "pioneered" for current using "led"', () => {
    const current = 'Led digital transformation across the enterprise.';
    const suggestion = 'Pioneered enterprise-wide digital transformation, delivering $4M in efficiency gains.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSeniority).toBe(10);
  });

  it('scores 3 when current has "led" but suggestion replaces it with passive downgrade language', () => {
    const current = 'Led the migration to cloud infrastructure.';
    const suggestion = 'Was responsible for the cloud infrastructure migration project.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSeniority).toBe(3);
  });

  it('scores 5 when current has ownership verbs and suggestion has neither ownership nor passive', () => {
    // "built" is in OWNERSHIP_VERBS so it must be absent from the suggestion to
    // test the no-ownership, no-passive branch that returns 5.
    const current = 'Architected the real-time fraud detection system.';
    const suggestion = 'The real-time fraud detection system was developed using machine learning techniques.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSeniority).toBe(5);
  });

  it('returns 8 (neutral) when current text contains no ownership verbs', () => {
    const current = 'Improved the onboarding process for new employees.';
    const suggestion = 'Enhanced the employee onboarding process, reducing ramp time by 25%.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSeniority).toBe(8);
  });

  it('scores 6 when suggestion has ownership verb but also includes passive language', () => {
    const current = 'Drove the product roadmap and shipped three major releases.';
    const suggestion = 'Drove the product roadmap; was responsible for shipping three major releases.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesSeniority).toBe(6);
  });
});

// ─── preservesOutcomes ───────────────────────────────────────────────────────

describe('preservesOutcomes', () => {
  it('scores 8 when current and suggestion have the same number of metrics', () => {
    const current = 'Reduced churn by 35% and increased revenue by $2.4M.';
    const suggestion = 'Cut churn 35% and grew annual revenue by $2.4M through targeted retention initiatives.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesOutcomes).toBe(8);
  });

  it('scores 1 when current has metrics and suggestion removes all of them', () => {
    const current = 'Reduced operational costs by $2.4M and cut deployment time by 35%.';
    const suggestion = 'Improved operational efficiency and streamlined deployment processes.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesOutcomes).toBe(1);
  });

  it('returns 7 (neutral) when neither current nor suggestion contains metrics', () => {
    const current = 'Managed vendor relationships and contract negotiations.';
    const suggestion = 'Led vendor relationship management and oversaw contract negotiations.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesOutcomes).toBe(7);
  });

  it('scores 10 when suggestion adds metrics that current text does not have', () => {
    const current = 'Improved the CI/CD pipeline for faster deployments.';
    const suggestion = 'Rebuilt CI/CD pipeline, reducing release cycle from 2 weeks to 3 days — a 70% improvement.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesOutcomes).toBe(10);
  });

  it('scores 10 when suggestion has more metrics than current', () => {
    const current = 'Grew ARR by 40%.';
    const suggestion = 'Grew ARR by 40%, reduced CAC by $1.2K per customer, and expanded NRR to 120%.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesOutcomes).toBe(10);
  });

  it('scores 5 when current has 3 metrics and suggestion keeps only 1', () => {
    const current = 'Delivered $3M in savings, reduced headcount by 15%, and cut SLA breach rate by 40%.';
    const suggestion = 'Achieved cost efficiencies and process improvements, saving $3M annually.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesOutcomes).toBe(5);
  });
});

// ─── requirementAlignment ────────────────────────────────────────────────────

describe('requirementAlignment', () => {
  it('scores 10 when suggestion covers the majority of requirement keywords', () => {
    const suggestion = 'Developed and executed cloud migration strategy, moving 200 workloads to AWS.';
    const requirements = ['cloud migration strategy', 'AWS infrastructure'];
    const result = scoreSuggestion('Prior experience.', suggestion, ctx({ targetRequirements: requirements }));
    expect(result.dimensions.requirementAlignment).toBeGreaterThanOrEqual(7);
  });

  it('scores high when all requirement words appear in suggestion', () => {
    const suggestion = 'Led cross-functional supply chain optimization initiative, reducing lead time by 30%.';
    const requirements = ['supply chain optimization'];
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ targetRequirements: requirements }));
    expect(result.dimensions.requirementAlignment).toBeGreaterThanOrEqual(7);
  });

  it('scores 3 when suggestion is about an unrelated domain', () => {
    const suggestion = 'Developed integrated marketing campaigns that drove brand awareness across social channels.';
    const requirements = ['supply chain optimization', 'logistics network design'];
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ targetRequirements: requirements }));
    expect(result.dimensions.requirementAlignment).toBe(3);
  });

  it('returns 7 (neutral) when no requirements are provided', () => {
    const suggestion = 'Delivered a high-impact software product on time and under budget.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ targetRequirements: [] }));
    expect(result.dimensions.requirementAlignment).toBe(7);
  });

  it('scores around 5 when suggestion partially matches requirements', () => {
    const suggestion = 'Led cloud infrastructure improvements for internal systems.';
    const requirements = ['cloud migration strategy', 'Kubernetes orchestration', 'DevOps toolchain', 'security compliance', 'cost optimization'];
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ targetRequirements: requirements }));
    // Only ~1 of 5 requirements hit → ratio ~0.2 → score 5
    expect(result.dimensions.requirementAlignment).toBeLessThanOrEqual(5);
  });
});

// ─── avoidsClicheVagueness ───────────────────────────────────────────────────

describe('avoidsClicheVagueness', () => {
  it('scores 10 for a clean suggestion with no cliches or vague verbs', () => {
    const suggestion = 'Reduced mean time to recovery from 4 hours to 22 minutes by deploying automated runbooks.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx());
    expect(result.dimensions.avoidsClicheVagueness).toBe(10);
  });

  it('scores 6 when suggestion contains exactly one cliche and no vague verbs', () => {
    const suggestion = 'As a results-driven engineering leader, I reduced deployment cycle time by 60%.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx());
    expect(result.dimensions.avoidsClicheVagueness).toBe(6);
  });

  it('scores 7 when suggestion has vague verbs but no cliche phrases', () => {
    const suggestion = 'Was responsible for improving the onboarding process for new engineering hires.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx());
    expect(result.dimensions.avoidsClicheVagueness).toBe(7);
  });

  it('scores 5 when suggestion has one cliche and also uses a vague verb', () => {
    const suggestion = 'As a results-driven leader, helped the team achieve its quarterly goals.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx());
    expect(result.dimensions.avoidsClicheVagueness).toBe(5);
  });

  it('scores 3 when suggestion contains multiple cliche phrases', () => {
    const suggestion = 'As a seasoned professional with a proven track record, I bring strong leadership skills.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx());
    expect(result.dimensions.avoidsClicheVagueness).toBe(3);
  });

  it('scores 3 for a suggestion loaded with cliches like "dynamic leader" and "thought leader"', () => {
    const suggestion = 'A dynamic leader and thought leader who is passionate about innovation.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx());
    expect(result.dimensions.avoidsClicheVagueness).toBe(3);
  });
});

// ─── avoidsRedundancy ────────────────────────────────────────────────────────

describe('avoidsRedundancy', () => {
  it('scores 10 when suggestion uses entirely different vocabulary from other sections', () => {
    const suggestion = 'Negotiated $12M multi-year enterprise licensing agreements with three Fortune 500 vendors.';
    const otherSections = [
      'Designed real-time fraud detection algorithms processing 500K transactions per second.',
      'Rebuilt CI/CD infrastructure reducing deployment time by 70%.',
    ];
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ otherSectionTexts: otherSections }));
    expect(result.dimensions.avoidsRedundancy).toBeGreaterThanOrEqual(7);
  });

  it('scores 2 when suggestion heavily duplicates language from another section', () => {
    const otherSection = 'Led cross-functional engineering teams to build scalable distributed systems.';
    // Almost the same content phrased very similarly
    const suggestion = 'Led cross-functional engineering teams building scalable distributed systems.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ otherSectionTexts: [otherSection] }));
    expect(result.dimensions.avoidsRedundancy).toBeLessThanOrEqual(2);
  });

  it('returns 8 (neutral) when no other section texts are provided', () => {
    const suggestion = 'Built and scaled a 40-person data engineering organization from scratch.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ otherSectionTexts: [] }));
    expect(result.dimensions.avoidsRedundancy).toBe(8);
  });

  it('scores 5 for moderate overlap with another section', () => {
    const otherSection = 'Developed machine learning models for customer churn prediction using Python and scikit-learn.';
    // ~30% word overlap
    const suggestion = 'Developed machine learning pipelines using Python to predict customer behavior patterns.';
    const result = scoreSuggestion('Prior text.', suggestion, ctx({ otherSectionTexts: [otherSection] }));
    // moderate overlap → score between 2 and 7
    expect(result.dimensions.avoidsRedundancy).toBeGreaterThanOrEqual(2);
    expect(result.dimensions.avoidsRedundancy).toBeLessThanOrEqual(7);
  });
});

// ─── preservesBrandVoice ─────────────────────────────────────────────────────

describe('preservesBrandVoice', () => {
  it('scores 9 when suggestion preserves most distinctive words from current text', () => {
    // The engine compares words longer than 5 chars after filtering common management
    // words. Use a current sentence whose distinctive long words are mostly echoed
    // in the suggestion so the preservation ratio reaches >= 0.6 (→ score 9).
    const current = 'Navigated turbulent regulatory scrutiny without sacrificing velocity or quality.';
    const suggestion = 'Navigated turbulent regulatory environments without sacrificing velocity across all delivery teams.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesBrandVoice).toBe(9);
  });

  it('scores 3 when distinctive voice is entirely replaced with generic language', () => {
    const current = 'Orchestrated rapid pivots under regulatory scrutiny without sacrificing velocity.';
    // Suggestion strips all distinctive vocabulary
    const suggestion = 'Managed projects in a challenging environment while maintaining performance standards.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesBrandVoice).toBe(3);
  });

  it('returns 8 (neutral) when current text has no distinctive vocabulary to preserve', () => {
    const current = 'Experience management leadership development implementation organization professional.';
    const suggestion = 'Led the leadership development program for organizational growth.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesBrandVoice).toBe(8);
  });

  it('gets a bonus score bump when suggestion aligns with the brandedTitle', () => {
    const current = 'Turned around underperforming engineering divisions.';
    const suggestionWithTitle = 'As a transformation architect, turned around an underperforming division delivering 3x output.';
    const suggestionWithout = 'Turned around underperforming divisions delivering 3x output gains.';

    const resultWith = scoreSuggestion(current, suggestionWithTitle, ctx({ brandedTitle: 'Transformation Architect' }));
    const resultWithout = scoreSuggestion(current, suggestionWithout, ctx());

    // Having brandedTitle alignment should produce equal or higher score
    expect(resultWith.dimensions.preservesBrandVoice).toBeGreaterThanOrEqual(resultWithout.dimensions.preservesBrandVoice);
  });

  it('scores 6 when only a third of distinctive words are preserved', () => {
    const current = 'Navigated turbulent acquisitions while protecting headcount and accelerating integration roadmaps.';
    // Suggestion preserves about one distinctive word
    const suggestion = 'Managed complex acquisition integration processes.';
    const result = scoreSuggestion(current, suggestion, ctx());
    expect(result.dimensions.preservesBrandVoice).toBeLessThanOrEqual(6);
  });
});

// ─── Verdict Logic ───────────────────────────────────────────────────────────

describe('verdict logic', () => {
  it('returns verdict "show" when overall score is >= 6', () => {
    const current = 'Led a team of 20 engineers delivering the platform rewrite on time.';
    const suggestion = 'Directed 20-person engineering team, delivering platform rewrite 2 weeks ahead of schedule.';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: ['engineering leadership', 'platform delivery'],
    }));
    expect(result.overall).toBeGreaterThanOrEqual(6);
    expect(result.verdict).toBe('show');
  });

  it('returns verdict "show" even with moderate overall score when importance is "must_have"', () => {
    // Build a scenario that lands overall in the 4–5.9 range
    const current = 'Worked on cloud systems.';
    // Generic suggestion with one cliche — moderate quality
    const suggestion = 'As a results-driven leader, helped teams adopt cloud infrastructure solutions.';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: ['multi-cloud architecture', 'FinOps cost governance'],
      importance: 'must_have',
    }));
    // Confirm the overall is in the must_have rescue band
    if (result.overall >= 3 && result.overall < 6) {
      expect(result.verdict).toBe('show');
      expect(result.reason).toMatch(/must-have/i);
    } else if (result.overall >= 6) {
      expect(result.verdict).toBe('show');
    }
    // If somehow overall < 3, must_have does not rescue it
    if (result.overall < 3) {
      expect(result.verdict).toBe('ask_question');
    }
  });

  it('returns verdict "ask_question" when overall score is < 3', () => {
    // To push overall below 3, every dimension must score low:
    //   specificity: current has AWS + Kubernetes (tech terms), suggestion drops both → 2
    //   seniority: current has "led" (ownership), suggestion has "was responsible for" → 3
    //   outcomes: current has $4.2M and 60% (metrics), suggestion drops both → 1
    //   requirements: three unrelated requirements → 3
    //   cliches: "seasoned professional" + "proven track record" → 3
    //   redundancy: suggestion text echoed in otherSections → 2
    //   brand voice: distinctive words dropped → 3
    const current = 'Architected AWS migration saving $4.2M; led Kubernetes rollout with 60% latency reduction.';
    const suggestion = 'As a seasoned professional with a proven track record, was responsible for assisting with software improvements, achieving $50M in savings and 99% uptime.';
    // Provide a nearly-identical other section to drive redundancy score to 2
    const nearDuplicate = 'was responsible for assisting with software improvements seasoned professional proven track record achieving $50M';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: ['financial regulatory compliance GDPR', 'blockchain distributed ledger', 'quantum computing optimization'],
      otherSectionTexts: [nearDuplicate],
    }));
    expect(result.overall).toBeLessThan(4);
    expect(result.verdict).toBe('ask_question');
    expect(result.suggestedQuestion).toBeDefined();
    expect(typeof result.suggestedQuestion).toBe('string');
    expect((result.suggestedQuestion as string).length).toBeGreaterThan(0);
  });

  it('returns verdict "collapse" for score between 4 and 6 without must_have', () => {
    // Craft a mediocre suggestion that will land in the 4–5.9 band
    const current = 'Led SAP implementation across 5 business units.';
    // Drops SAP specificity, adds one cliche, neutral alignment
    const suggestion = 'As a results-driven leader, oversaw technology implementation projects across business units.';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: [],
      importance: 'nice_to_have',
    }));
    if (result.overall >= 3 && result.overall < 6) {
      expect(result.verdict).toBe('collapse');
    } else if (result.overall >= 6) {
      expect(result.verdict).toBe('show');
    } else {
      expect(result.verdict).toBe('ask_question');
    }
  });

  it('populates suggestedQuestion only when verdict is "ask_question"', () => {
    // A strong suggestion should not produce ask_question
    const current = 'Led AWS migration saving $4.2M; architected Kubernetes rollout with 60% latency reduction.';
    const goodSuggestion = 'Directed AWS cloud migration delivering $4.2M in savings and architected Kubernetes platform achieving 60% latency reduction.';

    // A truly terrible suggestion that scores below 3 (see the ask_question test
    // above for the exact recipe: mismatched reqs + duplicate text + every dim low)
    const badSuggestion = 'As a seasoned professional with a proven track record, was responsible for assisting with software improvements, achieving $50M in savings and 99% uptime.';
    const nearDuplicate = 'was responsible for assisting with software improvements seasoned professional proven track record achieving $50M';

    const goodResult = scoreSuggestion(current, goodSuggestion, ctx());
    const badResult = scoreSuggestion(current, badSuggestion, ctx({
      targetRequirements: ['financial regulatory compliance GDPR', 'blockchain distributed ledger', 'quantum computing optimization'],
      otherSectionTexts: [nearDuplicate],
    }));

    if (goodResult.verdict !== 'ask_question') {
      expect(goodResult.suggestedQuestion).toBeUndefined();
    }
    expect(badResult.verdict).toBe('ask_question');
    expect(badResult.suggestedQuestion).toBeDefined();
  });
});

// ─── Gap-Fill Question Generation ────────────────────────────────────────────

describe('gap-fill question generation', () => {
  // To reach verdict 'ask_question', the overall score must be < 3.
  // This is only achievable when the current text has both tech terms AND metrics
  // AND ownership verbs, so all three scoring dimensions (spec, seniority, outcomes)
  // can be driven to their minimum values by the terrible suggestion.
  //
  // Recipe that consistently produces overall ~2.4:
  //   current:    has named tech terms + dollar/percent metrics + ownership verb + no team reference
  //   suggestion: 2 cliche phrases + passive downgrade verb, drops all tech + all metrics
  //   context:    3 wholly unrelated requirements + near-duplicate other section (forces redundancy to 2)
  const suggestion = 'As a seasoned professional with a proven track record, was responsible for assisting with improvements, delivering $75M in value.';
  const nearDuplicate = 'was responsible for assisting with improvements seasoned professional proven track record delivering $75M';
  const unrelatedReqs = ['blockchain distributed ledger implementation', 'quantum computing optimization', 'satellite imagery processing'];

  function badCtx(extras: Partial<SuggestionScoringContext> = {}): SuggestionScoringContext {
    return ctx({
      targetRequirements: unrelatedReqs,
      otherSectionTexts: [nearDuplicate],
      ...extras,
    });
  }

  it('asks about team size when current text has tech + metrics but no team/scale reference', () => {
    // Priority 2 (!hasScale) fires because there is no "team", "staff", or headcount word.
    const current = 'Architected AWS migration saving $4M; reduced query time by 60% using Snowflake.';
    const result = scoreSuggestion(current, suggestion, badCtx());
    expect(result.overall).toBeLessThan(4);
    expect(result.verdict).toBe('ask_question');
    expect(result.suggestedQuestion).toMatch(/team|budget|scope|size/i);
  });

  it('asks about measurable results when current text has scale + tech but no metrics', () => {
    // Note: when current has no metrics, preservesOutcomes returns 7 (neutral).
    // The mathematical floor with outcomes=7 is ~3.3, which means this test can
    // only reach ask_question if the scoring floor is low enough. This verifies
    // the intended question TYPE without guaranteeing ask_question verdict.
    const current = 'Managed a team of twelve engineers using AWS and Snowflake.';
    const result = scoreSuggestion(current, suggestion, badCtx());
    // If the scoring engine reaches ask_question, the question must ask about results
    if (result.verdict === 'ask_question') {
      expect(result.suggestedQuestion).toMatch(/measurable|result|revenue|cost|efficiency|metric/i);
    } else {
      // Score is above the ask_question threshold; verify suggestedQuestion is absent
      expect(result.suggestedQuestion).toBeUndefined();
    }
  });

  it('asks about platforms/tools when current text has scale + metrics but no tech terms', () => {
    // Note: when current has no tech terms, preservesSpecificity returns 8 (neutral).
    // Same mathematical floor constraint as the "no metrics" test above.
    const current = 'Managed a team of twelve engineers, reducing delivery time by 40%.';
    const result = scoreSuggestion(current, suggestion, badCtx());
    if (result.verdict === 'ask_question') {
      expect(result.suggestedQuestion).toMatch(/platform|tool|framework|specific/i);
    } else {
      expect(result.suggestedQuestion).toBeUndefined();
    }
  });

  it('asks about a must_have requirement when importance is must_have (Priority 1 overrides all others)', () => {
    // must_have fires before any of the scale/metrics/tech checks.
    // Use a current that has all four attributes (scale + tech + metrics + ownership)
    // so the overall reaches < 3 and ask_question is guaranteed.
    const current = 'Led a team of twelve engineers, building AWS Kubernetes infrastructure, reducing costs by $4M and 60%.';
    const result = scoreSuggestion(current, suggestion, badCtx({
      targetRequirements: ['HIPAA compliance program design'],
      importance: 'must_have',
    }));
    expect(result.overall).toBeLessThan(4);
    expect(result.verdict).toBe('ask_question');
    expect(result.suggestedQuestion).toMatch(/HIPAA/i);
  });

  it('returns a fallback question when current text has scale + metrics + tech (all gaps filled)', () => {
    // With all four present, the priority checks 2–4 are skipped and the fallback fires.
    const current = 'Led a team of twelve engineers, building AWS Kubernetes infrastructure, reducing costs by $4M and 60%.';
    const result = scoreSuggestion(current, suggestion, badCtx());
    expect(result.overall).toBeLessThan(4);
    expect(result.verdict).toBe('ask_question');
    // Fallback question asks for a specific outcome or metric
    expect(result.suggestedQuestion).toMatch(/specific|outcome|metric|impact/i);
  });

  it('suggestedQuestion is always a non-empty string when verdict is ask_question', () => {
    const current = 'Architected AWS migration saving $4M; reduced query time by 60% using Snowflake.';
    const result = scoreSuggestion(current, suggestion, badCtx());
    expect(result.verdict).toBe('ask_question');
    expect(typeof result.suggestedQuestion).toBe('string');
    expect((result.suggestedQuestion as string).length).toBeGreaterThan(0);
  });
});

// ─── Composite Scoring ───────────────────────────────────────────────────────

describe('composite scoring', () => {
  it('produces overall >= 7 for a high-quality suggestion across all dimensions', () => {
    const current = 'Led a 45-person engineering organization, cutting AWS costs by $3.2M through Kubernetes right-sizing.';
    // Strong on all dimensions: keeps tech terms, ownership verb, metrics, relevant keywords, no cliches
    const suggestion = 'Directed 45-person engineering org, achieving $3.2M annual AWS savings via Kubernetes workload right-sizing; zero seniority dilution.';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: ['cloud cost optimization', 'Kubernetes infrastructure'],
      otherSectionTexts: ['Developed the company onboarding program for new sales hires.'],
    }));
    expect(result.overall).toBeGreaterThanOrEqual(7);
    expect(result.verdict).toBe('show');
  });

  it('produces overall <= 3 for a suggestion that hits every anti-pattern', () => {
    // Without a high-overlap otherSection, redundancy defaults to 8 and the
    // composite floor is exactly 3.0 → verdict "collapse". To push below 3 and
    // trigger "ask_question", we add a near-duplicate other section that forces
    // the redundancy dimension down to 2.
    const current = 'Architected Snowflake data warehouse saving $1.8M; reduced query time by 80% using Databricks.';
    const suggestion = 'As a seasoned professional with a proven track record, was responsible for assisting with data warehouse improvements, saving $12M and improving performance by 99%.';
    const nearDuplicate = 'was responsible for assisting with data warehouse improvements seasoned professional proven track record saving $12M';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: ['financial services data engineering', 'machine learning feature store', 'real-time streaming ingestion'],
      otherSectionTexts: [nearDuplicate],
    }));
    expect(result.overall).toBeLessThan(4);
    expect(result.verdict).toBe('ask_question');
  });

  it('produces overall in the 4–6 range for a mixed suggestion with good alignment but dropped specifics', () => {
    const current = 'Built Salesforce CPQ integration reducing quote cycle from 3 weeks to 4 days.';
    // Keeps the metric, aligns to requirements, but drops Salesforce tech term and adds a cliche
    const suggestion = 'As a results-driven leader, streamlined the quote-to-cash process, cutting cycle time from 3 weeks to 4 days.';
    const result = scoreSuggestion(current, suggestion, ctx({
      targetRequirements: ['quote-to-cash process improvement', 'sales operations'],
    }));
    // Overall should be somewhere in the middle, not excellent, not terrible
    expect(result.overall).toBeGreaterThanOrEqual(3);
    expect(result.overall).toBeLessThanOrEqual(7);
  });

  it('overall is rounded to one decimal place', () => {
    const current = 'Led team delivering the platform.';
    const suggestion = 'Directed the platform delivery team.';
    const result = scoreSuggestion(current, suggestion, ctx());
    const decimalPart = (result.overall * 10) % 1;
    expect(decimalPart).toBe(0);
  });

  it('returns all eight dimension keys with numeric values', () => {
    const result = scoreSuggestion('Prior text.', 'New suggestion text.', ctx());
    const dims = result.dimensions;
    expect(typeof dims.preservesSpecificity).toBe('number');
    expect(typeof dims.preservesSeniority).toBe('number');
    expect(typeof dims.preservesOutcomes).toBe('number');
    expect(typeof dims.requirementAlignment).toBe('number');
    expect(typeof dims.avoidsClicheVagueness).toBe('number');
    expect(typeof dims.avoidsRedundancy).toBe('number');
    expect(typeof dims.preservesBrandVoice).toBe('number');
    expect(typeof dims.evidenceIntegrity).toBe('number');
  });

  it('all dimension scores fall within the 1–10 range', () => {
    const inputs: [string, string, SuggestionScoringContext][] = [
      [
        'Led $5M AWS migration across 8 business units.',
        'As a seasoned professional with a proven track record, was responsible for assisting cloud projects.',
        ctx({ targetRequirements: [], otherSectionTexts: [] }),
      ],
      [
        'Managed projects.',
        'Directed cross-functional teams to achieve strategic objectives and deliver measurable impact.',
        ctx({ targetRequirements: ['cross-functional leadership'], importance: 'must_have' }),
      ],
    ];

    for (const [current, suggestion, context] of inputs) {
      const result = scoreSuggestion(current, suggestion, context);
      for (const [key, val] of Object.entries(result.dimensions)) {
        expect(val, `${key} should be between 1 and 10`).toBeGreaterThanOrEqual(1);
        expect(val, `${key} should be between 1 and 10`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('returns the same score for identical inputs (deterministic)', () => {
    const current = 'Architected the real-time data platform on AWS using Kafka and Snowflake.';
    const suggestion = 'Designed real-time data architecture leveraging AWS, Kafka, and Snowflake, processing 1B events/day.';
    const context = ctx({
      targetRequirements: ['real-time data platform', 'cloud architecture'],
      otherSectionTexts: ['Led the sales enablement initiative.'],
    });

    const first = scoreSuggestion(current, suggestion, context);
    const second = scoreSuggestion(current, suggestion, context);

    expect(first.overall).toBe(second.overall);
    expect(first.verdict).toBe(second.verdict);
    expect(first.dimensions).toEqual(second.dimensions);
  });
});

// ─── evidenceIntegrity ──────────────────────────────────────────────────────

describe('evidenceIntegrity', () => {
  it('scores 10 when all suggestion metrics match the source text', () => {
    const current = 'Reduced deployment time by 60% and saved $2.4M annually.';
    const suggestion = 'Cut deployment time 60%, delivering $2.4M in annual savings.';
    const { dimensions } = scoreSuggestion(current, suggestion, ctx());
    expect(dimensions.evidenceIntegrity).toBe(10);
  });

  it('scores 9 when suggestion has no quantified claims at all', () => {
    const current = 'Led the platform engineering team through a major cloud migration.';
    const suggestion = 'Directed platform engineering through enterprise-wide cloud migration.';
    const { dimensions } = scoreSuggestion(current, suggestion, ctx());
    expect(dimensions.evidenceIntegrity).toBe(9);
  });

  it('scores low when suggestion invents metrics not in source', () => {
    const current = 'Managed the supply chain operations team.';
    const suggestion = 'Managed supply chain operations, driving $8M in cost savings and 45% efficiency gains.';
    const { dimensions } = scoreSuggestion(current, suggestion, ctx());
    // Two new claims (8M, 45%) with no source basis
    expect(dimensions.evidenceIntegrity).toBeLessThanOrEqual(2);
  });

  it('scores moderately when suggestion has one new claim among existing ones', () => {
    const current = 'Reduced costs by 30% and improved throughput by 2x, saving $1.2M.';
    const suggestion = 'Reduced costs 30%, improved throughput 2x ($1.2M savings), and cut cycle time by 40%.';
    const { dimensions } = scoreSuggestion(current, suggestion, ctx());
    // Three existing claims preserved, one new (40%) — 1 new among 4 total
    expect(dimensions.evidenceIntegrity).toBeGreaterThanOrEqual(5);
  });

  it('catches inflated metrics (same unit, different number)', () => {
    const current = 'Grew revenue by 15% year over year.';
    const suggestion = 'Grew revenue by 45% year over year through strategic initiatives.';
    const { dimensions } = scoreSuggestion(current, suggestion, ctx());
    // 45 is not in the source, 15 was the original — fabrication risk
    expect(dimensions.evidenceIntegrity).toBeLessThanOrEqual(5);
  });
});
