/**
 * Agent 4: Gap Analysis
 *
 * Compares the candidate against the benchmark with creative positioning strategies.
 * Doesn't just classify gaps — SOLVES them by finding adjacent real experience
 * and proposing how to position it.
 *
 * For inferred numbers (budgets from team sizes, etc.), backs off 10-20% from
 * the math so the candidate can comfortably defend the number in an interview.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import type {
  GapAnalysisInput,
  GapAnalysisOutput,
  GapClassification,
  GapStrategy,
  RequirementCategory,
  RequirementCoverageBreakdown,
  RequirementGap,
  RequirementSource,
} from '../types.js';

const JSON_OUTPUT_GUARDRAILS = `CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary, analysis, bullets, or notes outside the JSON object.
- Never serialize arrays as strings or as key/value text. "critical_gaps" and "pending_strategies" must always be JSON arrays.
- Never include comments, annotations, or fragments like #, //, "(implied)", or "critical_gaps=[...]" inside the JSON.
- Omit "strategy" entirely when it does not apply. Never output "strategy": {}.
- If a field is uncertain, use an empty string, empty array, or omit the optional field instead of prose.`;

const SYSTEM_PROMPT = `You are a $3,000/engagement executive resume strategist. Your specialty: finding creative, TRUTHFUL ways to close gaps between what a candidate has and what a job requires.

You NEVER fabricate experience. But you are CREATIVELY AGGRESSIVE about reframing real experience to close gaps:

CREATIVE STRATEGY EXAMPLES:
- "No budget management experience" → Do the math: team of 40 at ~$85K avg = $3.4M payroll. Back off to "$3M+ payroll budget" so they can defend it.
- "Requires Salesforce" but has HubSpot/Zoho → Position as "Enterprise CRM platforms including HubSpot and Zoho CRM" — same functional domain.
- "PMP certification required" but has 15 years of PM → "Extensive project and program leadership with working knowledge of PMI methodologies"
- "Revenue accountability" but ran support ops → Reframe: support operations that enabled revenue retention, customer lifetime value, upsell.
- "Call center centralization" but standardized processes → "Led initiatives to standardize operations across distributed teams" — that IS centralization.
- "AI automation experience" but implemented knowledge bases → "Automation-ready knowledge infrastructure enabling future AI/RAG capabilities"

IMPORTANT MATH RULE: When you infer a number from scope (like budget from team size), ALWAYS back off 10-20% from the calculated value. The candidate must be able to defend the number comfortably in an interview.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "requirements": [
    {
      "requirement": "what the job requires",
      "source": "job_description|benchmark",
      "category": "core_competency|strategic_responsibility|benchmark_leadership|benchmark_achievement|benchmark_skill|benchmark_certification|benchmark_industry|benchmark_differentiator",
      "score_domain": "ats|benchmark",
      "importance": "must_have|important|nice_to_have",
      "classification": "strong|partial|missing",
      "evidence": ["specific evidence from the candidate's background"],
      "source_evidence": "the JD or benchmark evidence that created this requirement",
      "strategy": {
        "real_experience": "what the candidate actually has that's adjacent",
        "positioning": "how to phrase it on the resume",
        "inferred_metric": "$3M+ payroll budget (optional — only if inferring a number)",
        "inference_rationale": "team of 40 × $85K avg = $3.4M, backed off to $3M+ (optional)",
        "ai_reasoning": "1-2 concise coaching sentences. Explain what you found, why it is relevant, and any math/logic in under 45 words.",
        "interview_questions": [
          {
            "question": "Your resume mentions managing operations at Company X. Can you tell us about the team size, budget responsibility, and geographic scope?",
            "rationale": "The JD requires P&L ownership — if they managed a team of 40+, the implied payroll budget alone could demonstrate budget accountability.",
            "looking_for": "Team size, budget figures, geographic span, or any P&L-adjacent responsibility"
          }
        ]
      }
    }
  ],
  "coverage_score": 75,
  "score_breakdown": {
    "job_description": {
      "total": 8,
      "strong": 3,
      "partial": 3,
      "missing": 2,
      "addressed": 6,
      "coverage_score": 75
    },
    "benchmark": {
      "total": 6,
      "strong": 2,
      "partial": 2,
      "missing": 2,
      "addressed": 4,
      "coverage_score": 67
    }
  },
  "strength_summary": "2-3 sentences on the candidate's strongest positioning angles",
  "critical_gaps": ["gaps that truly cannot be addressed — be honest"],
  "pending_strategies": [
    {
      "requirement": "the requirement being addressed",
      "strategy": {
        "real_experience": "what they actually have",
        "positioning": "proposed resume phrasing",
        "inferred_metric": "conservative number if applicable",
        "inference_rationale": "the math/logic",
        "ai_reasoning": "1-2 concise coaching sentences. Explain what you found, why it is relevant, and any math/logic in under 45 words.",
        "interview_questions": [
          {
            "question": "one targeted question referencing specific roles/companies from the resume",
            "rationale": "why this question could surface useful evidence",
            "looking_for": "what kind of answer would strengthen the positioning"
          }
        ]
      }
    }
  ]
}

RULES:
- Preserve the source, category, and importance from the canonical requirement catalog exactly as provided.
- score_domain = 'ats' for job_description requirements. score_domain = 'benchmark' for benchmark requirements.
- source_evidence must explain where the requirement came from in the JD or benchmark profile.
- Every requirement from the job gets classified (strong/partial/missing).
- Include benchmark-only requirements too, even when the candidate will never fully close all of them. Those should surface as benchmark alignment opportunities, not ATS blockers.
- For STRONG matches: provide the evidence. No strategy needed.
- For PARTIAL matches: provide evidence AND a creative strategy only when you can name concrete nearby proof from the candidate.
- For MISSING matches: provide a creative strategy only if concrete adjacent experience exists. If truly missing, put it in critical_gaps.
- If you cannot name concrete adjacent proof, omit strategy entirely instead of using placeholder coaching language.
- For benchmark items marked nice_to_have: only include a strategy when you find strong adjacent evidence. If the item is simply absent, leave strategy blank and do not add it to pending_strategies.
- HARD REQUIREMENT RULE: If the requirement is a degree, certification, license, years-of-experience threshold, or other explicit screen-out credential and the candidate does not clearly have it, classify it as missing and include it in critical_gaps. Do NOT use adjacent experience as if it fully solves the missing credential.
- If you offer adjacent framing for a hard requirement, the language must stay soft and truthful. It may explain related experience, but it cannot imply the candidate possesses the missing credential.
- Do not invent availability, travel, relocation, field-presence, on-call, or similar logistics requirements unless they are explicitly stated in the job description requirement itself.
- QUICK WIN RULE: Prefer strategies where the candidate already has nearby evidence that is simply under-explained on the resume. Those are the best items to strengthen first.
- pending_strategies: include the strategies that are worth coaching on before writing. Always include job_description strategies. For benchmark nice_to_have items, only include them when the strategy is genuinely useful.
- pending_strategies must contain only { requirement, strategy } objects with fully populated strategy fields. If there are none, return [].
- evidence: keep evidence arrays compact — use at most 2 short strings per requirement.
- source_evidence: keep it short and specific, ideally under 12 words.
- ai_reasoning: REQUIRED for every strategy (both in requirements[*].strategy and pending_strategies[*].strategy). Keep it short: 1-2 coaching sentences, under 45 words total. Mention the best evidence and any math only if it materially helps.
- interview_questions: REQUIRED for every strategy (partial and missing). Generate EXACTLY 1 targeted question that could surface hidden experience relevant to this gap. The question MUST reference specific roles, companies, or evidence from the candidate's resume — never ask generic questions like "Tell me about your experience with X". Include rationale and looking_for, but keep both concise.
- coverage_score should reflect overall addressed requirements across the full canonical list. score_breakdown must split that into job_description and benchmark.
- critical_gaps must contain only unresolved requirement strings, not explanations, evidence snippets, or serialized JSON.
- Be honest about critical_gaps — don't stretch beyond what's defensible.

${JSON_OUTPUT_GUARDRAILS}`;

const HIGH_VOLUME_REQUIREMENT_THRESHOLD = 35;
const HIGH_VOLUME_BENCHMARK_LIMIT = 8;

export async function runGapAnalysis(
  input: GapAnalysisInput,
  signal?: AbortSignal,
): Promise<GapAnalysisOutput> {
  const fullRequirementSeeds = buildCanonicalRequirements(input);
  const promptRequirementSeeds = buildPromptRequirements(input, fullRequirementSeeds);
  const shouldBackfillFromDeterministic = promptRequirementSeeds.length < fullRequirementSeeds.length;
  const userMessage = buildUserMessage(input, promptRequirementSeeds, fullRequirementSeeds.length);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const parsed = repairJSON<GapAnalysisOutput>(response.text);
    if (parsed) {
      return normalizeGapAnalysis(
        shouldBackfillFromDeterministic
          ? mergeWithDeterministicBackfill(parsed, input, fullRequirementSeeds)
          : reconcileModeledHardRequirements(parsed, input),
      );
    }

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Gap Analysis: first attempt unparseable, retrying with stricter prompt',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    const salvaged = tryRecoverGapAnalysisFromProviderError(error, input, fullRequirementSeeds, shouldBackfillFromDeterministic);
    if (salvaged) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Gap Analysis: recovered parseable JSON from provider failed_generation payload',
      );
      return salvaged;
    }
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Gap Analysis: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicGapAnalysis(input);
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: `You are a strict JSON formatter.\n${JSON_OUTPUT_GUARDRAILS}\nReturn ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.`,
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const retryParsed = repairJSON<GapAnalysisOutput>(retry.text);
    if (retryParsed) {
      return normalizeGapAnalysis(
        shouldBackfillFromDeterministic
          ? mergeWithDeterministicBackfill(retryParsed, input, fullRequirementSeeds)
          : reconcileModeledHardRequirements(retryParsed, input),
      );
    }

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Gap Analysis: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    const salvaged = tryRecoverGapAnalysisFromProviderError(error, input, fullRequirementSeeds, shouldBackfillFromDeterministic);
    if (salvaged) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Gap Analysis: recovered parseable JSON from retry failed_generation payload',
      );
      return salvaged;
    }
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Gap Analysis: retry failed, using deterministic fallback',
    );
  }

  return buildDeterministicGapAnalysis(input);
}

function buildUserMessage(
  input: GapAnalysisInput,
  promptRequirementSeeds: CanonicalRequirementSeed[],
  totalRequirementCount: number,
): string {
  const targetRoles = input.career_profile?.targeting.target_roles ?? [];
  const targetIndustries = input.career_profile?.targeting.target_industries ?? [];
  const coreStrengths = input.career_profile?.positioning.core_strengths ?? [];
  const proofThemes = input.career_profile?.positioning.proof_themes ?? [];
  const differentiators = input.career_profile?.positioning.differentiators ?? [];
  const adjacentPositioning = input.career_profile?.positioning.adjacent_positioning ?? [];
  const constraints = input.career_profile?.preferences.constraints ?? [];
  const achievements = input.benchmark.expected_achievements ?? [];
  const technicalSkills = input.benchmark.expected_technical_skills ?? [];
  const certifications = input.benchmark.expected_certifications ?? [];
  const industryKnowledge = input.benchmark.expected_industry_knowledge ?? [];
  const candidateCareerThemes = input.candidate.career_themes ?? [];
  const candidateQuantifiedOutcomes = input.candidate.quantified_outcomes ?? [];
  const candidateExperience = input.candidate.experience ?? [];
  const hiddenAccomplishments = input.candidate.hidden_accomplishments ?? [];
  const technologies = input.candidate.technologies ?? [];
  const candidateCertifications = input.candidate.certifications ?? [];
  const canonicalRequirements: string[] = [
    ...promptRequirementSeeds.map(
      requirement => `- [source=${requirement.source}][category=${requirement.category}][importance=${requirement.importance}] ${requirement.requirement} :: ${requirement.source_evidence}`,
    ),
  ];
  const highVolumeMode = promptRequirementSeeds.length < totalRequirementCount;

  const parts: string[] = [
    '## Canonical Requirement Catalog',
    ...canonicalRequirements,
    '',
  ];

  if (input.career_profile) {
    parts.push(
      '## Career Profile',
      `Profile summary: ${input.career_profile.profile_summary}`,
      `Target roles: ${targetRoles.join(', ') || 'Not yet defined'}`,
      `Target industries: ${targetIndustries.join(', ') || 'Not yet defined'}`,
      `Core strengths: ${coreStrengths.join(', ') || 'Not yet defined'}`,
      `Proof themes: ${proofThemes.join(', ') || 'Not yet defined'}`,
      `Differentiators: ${differentiators.join(', ') || 'Not yet defined'}`,
      `Adjacent positioning: ${adjacentPositioning.join(', ') || 'Not yet defined'}`,
      `Constraints: ${constraints.join(', ') || 'None recorded'}`,
      '',
    );
  }

  parts.push(
    '## Benchmark Candidate (the ideal hire)',
    `Profile: ${input.benchmark.ideal_profile_summary}`,
    `Leadership scope expected: ${input.benchmark.expected_leadership_scope}`,
    'Expected achievements:',
    ...achievements.map(
      a => `- ${a.area}: ${a.description} (typical metrics: ${a.typical_metrics})`
    ),
    '',
    '## Actual Candidate',
    `Career themes: ${candidateCareerThemes.join(', ')}`,
    `Leadership scope: ${input.candidate.leadership_scope}`,
    `Operational scale: ${input.candidate.operational_scale}`,
    '',
    'Quantified outcomes:',
    ...candidateQuantifiedOutcomes.map(
      o => `- [${o.metric_type}] ${o.outcome}: ${o.value}`
    ),
    '',
    'Experience:',
    ...candidateExperience.map(e => {
      const scope = e.inferred_scope
        ? ` (scope: team=${e.inferred_scope.team_size ?? '?'}, budget=${e.inferred_scope.budget ?? '?'}, geo=${e.inferred_scope.geography ?? '?'})`
        : '';
      return `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date})${scope}\n  ${e.bullets.slice(0, 3).join('\n  ')}`;
    }),
    '',
    'Hidden accomplishments detected:',
    ...hiddenAccomplishments.slice(0, 5).map(h => `- ${h}`),
    '',
    `Technologies: ${technologies.join(', ')}`,
    `Certifications: ${candidateCertifications.join(', ')}`,
  );

  if (input.user_context) {
    parts.push(
      '',
      '## Additional Context from User',
      input.user_context,
    );
  }

  parts.push(
    '',
    'Compare this candidate against EVERY requirement in the canonical requirement catalog. Classify each as strong/partial/missing. For partial and missing, propose creative positioning strategies.',
    'Keep the output compact. Use exactly 1 targeted interview question per strategy and keep ai_reasoning brief.',
    highVolumeMode
      ? `High-volume mode: this focused catalog contains the ${promptRequirementSeeds.length} highest-value requirements out of ${totalRequirementCount} total. Prioritize job-description coverage and the benchmark requirements with the strongest adjacent evidence.`
      : 'Focus coaching detail on the requirements with the strongest adjacent evidence.',
    'Return JSON only. Do not include markdown fences or any explanation outside the JSON object.',
  );

  return parts.join('\n');
}

function buildPromptRequirements(
  input: GapAnalysisInput,
  fullRequirementSeeds: CanonicalRequirementSeed[],
): CanonicalRequirementSeed[] {
  if (fullRequirementSeeds.length <= HIGH_VOLUME_REQUIREMENT_THRESHOLD) {
    return fullRequirementSeeds;
  }

  const corpus = buildEvidenceCorpus(input);
  const jobDescriptionSeeds = fullRequirementSeeds.filter((seed) => seed.source === 'job_description');
  const benchmarkSeeds = fullRequirementSeeds.filter((seed) => seed.source === 'benchmark');
  const benchmarkLeadership = benchmarkSeeds.find((seed) => seed.category === 'benchmark_leadership');
  const remainingBenchmarkSeeds = benchmarkSeeds.filter((seed) => seed !== benchmarkLeadership);

  const rankedBenchmarkSeeds = remainingBenchmarkSeeds
    .map((seed) => ({
      seed,
      relevanceScore: rankEvidence(`${seed.requirement} ${seed.source_evidence}`, corpus)[0]?.score ?? 0,
      categoryPriority: benchmarkCategoryPriority(seed.category),
      importancePriority: seed.importance === 'important' ? 1 : 0,
    }))
    .sort((left, right) => (
      right.relevanceScore - left.relevanceScore
      || right.importancePriority - left.importancePriority
      || right.categoryPriority - left.categoryPriority
      || left.seed.requirement.length - right.seed.requirement.length
    ));

  const benchmarkLimit = Math.max(
    8,
    Math.min(
      HIGH_VOLUME_BENCHMARK_LIMIT,
      HIGH_VOLUME_REQUIREMENT_THRESHOLD - jobDescriptionSeeds.length - (benchmarkLeadership ? 1 : 0),
    ),
  );

  const selectedBenchmarkSeeds = rankedBenchmarkSeeds
    .filter((entry, index) => entry.relevanceScore > 0 || index < benchmarkLimit)
    .slice(0, benchmarkLimit)
    .map((entry) => entry.seed);

  return [
    ...jobDescriptionSeeds,
    ...(benchmarkLeadership ? [benchmarkLeadership] : []),
    ...selectedBenchmarkSeeds,
  ];
}

function benchmarkCategoryPriority(category: RequirementCategory): number {
  switch (category) {
    case 'benchmark_leadership':
      return 5;
    case 'benchmark_achievement':
      return 4;
    case 'benchmark_skill':
      return 3;
    case 'benchmark_industry':
      return 2;
    case 'benchmark_certification':
      return 1;
    case 'benchmark_differentiator':
      return 0;
    default:
      return 0;
  }
}

function mergeWithDeterministicBackfill(
  output: GapAnalysisOutput,
  input: GapAnalysisInput,
  fullRequirementSeeds: CanonicalRequirementSeed[],
): GapAnalysisOutput {
  const deterministic = buildDeterministicGapAnalysis(input);
  const modeledRequirements = Array.isArray(output.requirements) ? output.requirements : [];
  if (modeledRequirements.length === 0) {
    return deterministic;
  }
  const modelRequirementsByKey = new Map(
    modeledRequirements.map((requirement) => {
      const normalizedRequirement = normalizeRequirement(requirement);
      return [requirementKey(normalizedRequirement), normalizedRequirement] as const;
    }),
  );
  const deterministicRequirementsByKey = new Map(
    deterministic.requirements.map((requirement) => [requirementKey(requirement), requirement] as const),
  );
  const modelPendingStrategies = Array.isArray(output.pending_strategies) ? output.pending_strategies : [];
  const modelPendingStrategiesByKey = new Map(
    modelPendingStrategies.map((item) => {
      const seed = findRequirementSeed(item.requirement, fullRequirementSeeds);
      const key = requirementKey({
        requirement: item.requirement,
        source: seed?.source ?? 'job_description',
      });
      return [key, item] as const;
    }),
  );

  const mergedRequirements = fullRequirementSeeds.map((seed) => {
    const key = requirementKey(seed);
    const modeled = modelRequirementsByKey.get(key);
    const deterministicRequirement = deterministicRequirementsByKey.get(key);
    if (modeled) {
      if (
        deterministicRequirement
        && shouldPreferDeterministicRequirement(modeled, deterministicRequirement, seed)
      ) {
        return shouldSuppressBackfilledStrategy(deterministicRequirement)
          ? { ...deterministicRequirement, strategy: undefined }
          : deterministicRequirement;
      }
      return modeled;
    }

    if (!deterministicRequirement) {
      return normalizeRequirement({
        requirement: seed.requirement,
        source: seed.source,
        category: seed.category,
        score_domain: seed.source === 'job_description' ? 'ats' : 'benchmark',
        importance: seed.importance,
        classification: 'missing',
        evidence: [],
        source_evidence: seed.source_evidence,
      });
    }

    return shouldSuppressBackfilledStrategy(deterministicRequirement)
      ? { ...deterministicRequirement, strategy: undefined }
      : deterministicRequirement;
  });

  const mergedPendingStrategies = mergedRequirements
    .filter((requirement) => requirement.strategy && requirement.classification !== 'strong')
    .filter((requirement) => !shouldSuppressBackfilledStrategy(requirement))
    .map((requirement) => (
      modelPendingStrategiesByKey.get(requirementKey(requirement))
      ?? { requirement: requirement.requirement, strategy: requirement.strategy! }
    ));

  return {
    ...output,
    requirements: mergedRequirements,
    pending_strategies: mergedPendingStrategies,
  };
}

function reconcileModeledHardRequirements(
  output: GapAnalysisOutput,
  input: GapAnalysisInput,
): GapAnalysisOutput {
  const deterministic = buildDeterministicGapAnalysis(input);
  const modeledRequirements = Array.isArray(output.requirements) ? output.requirements : [];
  if (modeledRequirements.length === 0) {
    return deterministic;
  }
  const deterministicRequirementsByKey = new Map(
    deterministic.requirements.map((requirement) => [requirementKey(requirement), requirement] as const),
  );

  const requirements = modeledRequirements.map((requirement) => {
    const normalizedRequirement = normalizeRequirement(requirement);
    const deterministicRequirement = deterministicRequirementsByKey.get(requirementKey(normalizedRequirement));
    if (!deterministicRequirement) {
      return normalizedRequirement;
    }

    return shouldPreferDeterministicRequirement(
      normalizedRequirement,
      deterministicRequirement,
      {
        requirement: normalizedRequirement.requirement,
        source_evidence: normalizedRequirement.source_evidence ?? '',
      },
    )
      ? deterministicRequirement
      : normalizedRequirement;
  });

  return {
    ...output,
    requirements,
  };
}

function findRequirementSeed(
  requirement: string,
  fullRequirementSeeds: CanonicalRequirementSeed[],
): CanonicalRequirementSeed | undefined {
  const normalizedRequirement = normalizeForSet(requirement);
  return fullRequirementSeeds.find((seed) => normalizeForSet(seed.requirement) === normalizedRequirement);
}

function shouldSuppressBackfilledStrategy(requirement: RequirementGap): boolean {
  return requirement.source === 'benchmark'
    && requirement.importance === 'nice_to_have'
    && requirement.classification === 'missing';
}

function shouldPreferDeterministicRequirement(
  modeled: RequirementGap,
  deterministic: RequirementGap,
  seed: Pick<CanonicalRequirementSeed, 'requirement' | 'source_evidence'>,
): boolean {
  if (!isHardRequirement(seed.requirement, seed.source_evidence)) {
    return false;
  }

  return classificationRank(deterministic.classification) > classificationRank(modeled.classification);
}

function classificationRank(classification: GapClassification): number {
  switch (classification) {
    case 'strong':
      return 3;
    case 'partial':
      return 2;
    case 'missing':
    default:
      return 1;
  }
}

function requirementKey(
  requirement: Pick<CanonicalRequirementSeed, 'requirement' | 'source'> | Pick<RequirementGap, 'requirement' | 'source'>,
): string {
  return `${requirement.source}:${normalizeForSet(requirement.requirement)}`;
}

function normalizeGapAnalysis(output: GapAnalysisOutput): GapAnalysisOutput {
  const requirements = Array.isArray(output.requirements)
    ? output.requirements.map(normalizeRequirement)
    : [];
  const rawPendingStrategies = Array.isArray(output.pending_strategies) ? output.pending_strategies : [];
  const rawCriticalGaps = Array.isArray(output.critical_gaps)
    ? output.critical_gaps.filter((gap): gap is string => typeof gap === 'string')
    : [];
  const strongRequirements = requirements
    .filter((requirement) => requirement.classification === 'strong')
    .map((requirement) => requirement.requirement);
  const hardGapRequirements = requirements
    .filter((requirement) => (
      requirement.classification === 'missing' &&
      isHardRequirement(requirement.requirement, requirement.source_evidence)
    ))
    .map((requirement) => requirement.requirement);

  const hardGapSet = new Set(hardGapRequirements.map(normalizeForSet));
  const jobBreakdown = computeCoverageBreakdown(requirements, 'job_description');
  const benchmarkBreakdown = computeCoverageBreakdown(requirements, 'benchmark');
  const total = jobBreakdown.total + benchmarkBreakdown.total;
  const addressed = jobBreakdown.addressed + benchmarkBreakdown.addressed;
  const criticalGaps = dedupeStrings([
    ...rawCriticalGaps
      .filter((gap) => !isRequirementAlreadySatisfiedByStrongMatch(gap, strongRequirements))
      .filter((gap) => !isLogisticsOnlyRequirement(gap)),
    ...hardGapRequirements,
  ]);
  const pendingStrategies = rawPendingStrategies.filter((item) => (
    !hardGapSet.has(normalizeForSet(item.requirement))
    && !isLogisticsOnlyRequirement(item.requirement)
    && Boolean(sanitizeGapStrategy(item.strategy))
  ));

  return {
    ...output,
    requirements,
    coverage_score: total > 0 ? Math.round((addressed / total) * 100) : 0,
    critical_gaps: criticalGaps,
    pending_strategies: pendingStrategies.map((item) => ({
      requirement: item.requirement,
      strategy: sanitizeGapStrategy(item.strategy)!,
    })),
    score_breakdown: {
      job_description: jobBreakdown,
      benchmark: benchmarkBreakdown,
    },
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function tryRecoverGapAnalysisFromProviderError(
  error: unknown,
  input: GapAnalysisInput,
  fullRequirementSeeds: CanonicalRequirementSeed[],
  shouldBackfillFromDeterministic: boolean,
): GapAnalysisOutput | null {
  const failedGeneration = extractFailedGeneration(error);
  if (!failedGeneration) return null;

  const normalizedFailedGeneration = normalizeFailedGenerationForRepair(failedGeneration);
  const repaired = repairJSON<GapAnalysisOutput>(normalizedFailedGeneration);
  if (repaired) {
    return normalizeGapAnalysis(
      shouldBackfillFromDeterministic
        ? mergeWithDeterministicBackfill(repaired, input, fullRequirementSeeds)
        : reconcileModeledHardRequirements(repaired, input),
    );
  }

  const partiallyRecovered = salvageGapAnalysisFromFailedGeneration(normalizedFailedGeneration);
  if (!partiallyRecovered) return null;

  return normalizeGapAnalysis(
    shouldBackfillFromDeterministic
      ? mergeWithDeterministicBackfill(partiallyRecovered, input, fullRequirementSeeds)
      : reconcileModeledHardRequirements(partiallyRecovered, input),
  );
}

function extractFailedGeneration(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/"failed_generation":"((?:\\.|[^"])*)"/);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

function normalizeFailedGenerationForRepair(value: string): string {
  return value
    .replace(/:\s*@/g, ': ')
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)=\s*\[/g, '"$1": [')
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)=\s*\{/g, '"$1": {')
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\[/g, '"$1": [')
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/g, '"$1": {')
    .replace(/"\s*,\s*\n/g, '",\n');
}

function salvageGapAnalysisFromFailedGeneration(raw: string): GapAnalysisOutput | null {
  const requirements = salvageRequirementObjects(raw);
  const criticalGaps = salvageStringArrayField(raw, 'critical_gaps');
  const strengthSummary = salvageStringField(raw, 'strength_summary');
  const pendingStrategies = requirements
    .filter((requirement) => requirement.classification !== 'strong' && Boolean(requirement.strategy))
    .map((requirement) => ({
      requirement: requirement.requirement,
      strategy: requirement.strategy!,
    }));

  if (requirements.length === 0 && criticalGaps.length === 0 && !(strengthSummary?.trim())) {
    return null;
  }

  return {
    requirements,
    coverage_score: 0,
    score_breakdown: {
      job_description: { total: 0, strong: 0, partial: 0, missing: 0, addressed: 0, coverage_score: 0 },
      benchmark: { total: 0, strong: 0, partial: 0, missing: 0, addressed: 0, coverage_score: 0 },
    },
    strength_summary: strengthSummary ?? 'Recovered from partially parseable provider JSON.',
    critical_gaps: criticalGaps,
    pending_strategies: pendingStrategies,
  };
}

function salvageRequirementObjects(raw: string): RequirementGap[] {
  const requirementsSection = extractSectionBetweenTopLevelFields(raw, 'requirements', 'coverage_score');
  if (!requirementsSection) return [];

  const matches = Array.from(requirementsSection.matchAll(/"requirement"\s*:/g));
  if (matches.length === 0) return [];

  const objectStarts = matches
    .map((match) => requirementsSection.lastIndexOf('{', match.index ?? 0))
    .filter((index) => index >= 0);
  const salvaged: RequirementGap[] = [];

  for (let index = 0; index < objectStarts.length; index += 1) {
    const start = objectStarts[index]!;
    const end = index + 1 < objectStarts.length ? objectStarts[index + 1]! : requirementsSection.length;
    const fragment = cleanPartialRequirementFragment(requirementsSection.slice(start, end));
    if (!fragment) continue;

    const repaired = repairJSON<RequirementGap>(fragment);
    if (!repaired || typeof repaired.requirement !== 'string') continue;
    salvaged.push(repaired);
  }

  return salvaged;
}

function extractSectionBetweenTopLevelFields(raw: string, field: string, nextField: string): string | null {
  const fieldIndex = raw.indexOf(`"${field}"`);
  if (fieldIndex === -1) return null;

  const fieldColonIndex = raw.indexOf(':', fieldIndex);
  if (fieldColonIndex === -1) return null;

  const nextFieldIndex = raw.indexOf(`"${nextField}"`, fieldColonIndex + 1);
  const endIndex = nextFieldIndex === -1 ? raw.length : nextFieldIndex;
  return raw.slice(fieldColonIndex + 1, endIndex);
}

function cleanPartialRequirementFragment(fragment: string): string | null {
  const firstBrace = fragment.indexOf('{');
  const lastBrace = fragment.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }

  let cleaned = fragment.slice(firstBrace, lastBrace + 1);

  while ((cleaned.match(/\[/g) ?? []).length < (cleaned.match(/\]/g) ?? []).length && /\]\s*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\]\s*$/, '');
  }

  const openBracketCount = (cleaned.match(/\[/g) ?? []).length;
  const closeBracketCount = (cleaned.match(/\]/g) ?? []).length;
  if (openBracketCount > closeBracketCount) {
    cleaned += ']'.repeat(openBracketCount - closeBracketCount);
  }

  const openBraceCount = (cleaned.match(/\{/g) ?? []).length;
  const closeBraceCount = (cleaned.match(/\}/g) ?? []).length;
  if (openBraceCount > closeBraceCount) {
    cleaned += '}'.repeat(openBraceCount - closeBraceCount);
  }

  return cleaned;
}

function salvageStringField(raw: string, field: string): string | null {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"])*)"`, 's'));
  if (!match?.[1]) return null;

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

function salvageStringArrayField(raw: string, field: string): string[] {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 's'));
  if (!match?.[1]) return [];

  return Array.from(match[1].matchAll(/"((?:\\.|[^"])*)"/g))
    .map((item) => {
      try {
        return JSON.parse(`"${item[1]}"`) as string;
      } catch {
        return '';
      }
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDeterministicGapAnalysis(input: GapAnalysisInput): GapAnalysisOutput {
  const corpus = buildEvidenceCorpus(input);
  const requirements = buildCanonicalRequirements(input).map((seed) => {
    const evaluation = evaluateRequirement(seed, corpus, input);
    const requirement: RequirementGap = {
      requirement: seed.requirement,
      source: seed.source,
      category: seed.category,
      score_domain: seed.source === 'job_description' ? 'ats' : 'benchmark',
      importance: seed.importance,
      classification: evaluation.classification,
      evidence: evaluation.evidence,
      source_evidence: seed.source_evidence,
      ...(evaluation.strategy ? { strategy: evaluation.strategy } : {}),
    };
    return requirement;
  });

  const strongHighlights = requirements
    .filter((requirement) => requirement.classification === 'strong')
    .slice(0, 3)
    .map((requirement) => requirement.requirement);

  const criticalGaps = requirements
    .filter((requirement) => requirement.classification === 'missing' && isHardRequirement(requirement.requirement, requirement.source_evidence))
    .map((requirement) => requirement.requirement);

  const pendingStrategies = requirements
    .filter((requirement) => requirement.strategy && requirement.classification !== 'strong')
    .filter((requirement) => !criticalGaps.some((gap) => normalizeForSet(gap) === normalizeForSet(requirement.requirement)))
    .map((requirement) => ({
      requirement: requirement.requirement,
      strategy: requirement.strategy!,
    }));

  const summary = strongHighlights.length > 0
    ? `The candidate already shows credible evidence for ${strongHighlights.slice(0, 2).join(' and ')}. The strongest next moves are the items with nearby proof that can be reframed more clearly for this role.`
    : 'The candidate has adjacent experience, but the current resume does not yet surface enough direct proof. The strongest next moves are the requirements with nearby evidence that can be tightened first.';

  return normalizeGapAnalysis({
    requirements,
    coverage_score: 0,
    strength_summary: summary,
    critical_gaps: criticalGaps,
    pending_strategies: pendingStrategies,
  });
}

type CanonicalRequirementSeed = {
  requirement: string;
  source: RequirementSource;
  category: RequirementCategory;
  importance: RequirementGap['importance'];
  source_evidence: string;
};

type EvidenceEntry = {
  text: string;
  origin: string;
};

function buildCanonicalRequirements(input: GapAnalysisInput): CanonicalRequirementSeed[] {
  const coreCompetencies = input.job_intelligence.core_competencies ?? [];
  const strategicResponsibilities = input.job_intelligence.strategic_responsibilities ?? [];
  const expectedAchievements = input.benchmark.expected_achievements ?? [];
  const expectedTechnicalSkills = input.benchmark.expected_technical_skills ?? [];
  const expectedCertifications = input.benchmark.expected_certifications ?? [];
  const expectedIndustryKnowledge = input.benchmark.expected_industry_knowledge ?? [];
  const differentiators = input.benchmark.differentiators ?? [];

  return [
    ...coreCompetencies.map((competency) => ({
      requirement: competency.competency,
      source: 'job_description' as const,
      category: 'core_competency' as const,
      importance: competency.importance,
      source_evidence: competency.evidence_from_jd,
    })),
    ...strategicResponsibilities.map((responsibility) => ({
      requirement: responsibility,
      source: 'job_description' as const,
      category: 'strategic_responsibility' as const,
      importance: 'important' as const,
      source_evidence: 'Strategic responsibility explicitly present in the job description',
    })),
    {
      requirement: input.benchmark.expected_leadership_scope,
      source: 'benchmark' as const,
      category: 'benchmark_leadership' as const,
      importance: 'important' as const,
      source_evidence: 'Leadership scope expected of the benchmark candidate',
    },
    ...expectedAchievements.map((achievement) => ({
      requirement: `${achievement.area}: ${achievement.description}`,
      source: 'benchmark' as const,
      category: 'benchmark_achievement' as const,
      importance: 'important' as const,
      source_evidence: `Typical metrics: ${achievement.typical_metrics}`,
    })),
    ...expectedTechnicalSkills.map((skill) => ({
      requirement: skill,
      source: 'benchmark' as const,
      category: 'benchmark_skill' as const,
      importance: 'important' as const,
      source_evidence: 'Benchmark technical skill',
    })),
    ...expectedCertifications.map((certification) => ({
      requirement: certification,
      source: 'benchmark' as const,
      category: 'benchmark_certification' as const,
      importance: 'nice_to_have' as const,
      source_evidence: 'Benchmark certification expectation',
    })),
    ...expectedIndustryKnowledge.map((knowledge) => ({
      requirement: knowledge,
      source: 'benchmark' as const,
      category: 'benchmark_industry' as const,
      importance: 'important' as const,
      source_evidence: 'Benchmark industry knowledge',
    })),
    ...differentiators.map((differentiator) => ({
      requirement: differentiator,
      source: 'benchmark' as const,
      category: 'benchmark_differentiator' as const,
      importance: 'nice_to_have' as const,
      source_evidence: 'What the benchmark candidate does better than the field',
    })),
  ];
}

function buildEvidenceCorpus(input: GapAnalysisInput): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [
    { text: input.candidate.leadership_scope, origin: 'leadership scope' },
    { text: input.candidate.operational_scale, origin: 'operational scale' },
    ...(input.candidate.career_themes ?? []).map((theme) => ({ text: theme, origin: 'career theme' })),
    ...(input.candidate.industry_depth ?? []).map((item) => ({ text: item, origin: 'industry depth' })),
    ...(input.candidate.hidden_accomplishments ?? []).map((item) => ({ text: item, origin: 'hidden accomplishment' })),
    ...(input.candidate.technologies ?? []).map((item) => ({ text: item, origin: 'technology' })),
    ...(input.candidate.certifications ?? []).map((item) => ({ text: item, origin: 'certification' })),
    ...(input.candidate.education ?? []).map((item) => ({
      text: `${item.degree} ${item.institution}${item.year ? ` ${item.year}` : ''}`.trim(),
      origin: 'education',
    })),
    ...(input.candidate.quantified_outcomes ?? []).map((item) => ({
      text: `${item.outcome}: ${item.value}`,
      origin: 'quantified outcome',
    })),
    ...(input.candidate.experience ?? []).flatMap((experience) => ([
      { text: `${experience.title} at ${experience.company}`, origin: 'experience header' },
      ...experience.bullets.map((bullet) => ({ text: bullet, origin: `${experience.company} bullet` })),
    ])),
  ];

  if (input.career_profile) {
    entries.push(
      ...input.career_profile.positioning.core_strengths.map((item) => ({ text: item, origin: 'career profile strength' })),
      ...input.career_profile.positioning.proof_themes.map((item) => ({ text: item, origin: 'career profile proof theme' })),
      ...input.career_profile.positioning.differentiators.map((item) => ({ text: item, origin: 'career profile differentiator' })),
      ...input.career_profile.positioning.adjacent_positioning.map((item) => ({ text: item, origin: 'career profile adjacent positioning' })),
    );
  }

  return entries.filter((entry) => entry.text && entry.text.trim().length > 0);
}

function evaluateRequirement(
  requirement: CanonicalRequirementSeed,
  corpus: EvidenceEntry[],
  input: GapAnalysisInput,
): {
  classification: GapClassification;
  evidence: string[];
  strategy?: GapStrategy;
} {
  const requirementText = `${requirement.requirement} ${requirement.source_evidence}`.trim();
  const hardRequirement = isHardRequirement(requirement.requirement, requirement.source_evidence);
  const educationText = input.candidate.education.map((item) => `${item.degree} ${item.institution}`).join(' ');
  const candidateCertifications = input.candidate.certifications.filter(Boolean);
  const certificationText = candidateCertifications.join(' ');
  const combinedCredentialText = `${educationText} ${certificationText}`.toLowerCase();

  if (/\byears? of experience\b|\bminimum of \d+ years\b|\b\d+\+?\s+years?\b/.test(requirementText.toLowerCase())) {
    const requiredYears = extractRequiredYears(requirementText);
    if (requiredYears !== null) {
      const meetsRequirement = input.candidate.career_span_years >= requiredYears;
      return {
        classification: meetsRequirement ? 'strong' : 'missing',
        evidence: meetsRequirement
          ? [`Career span: ${input.candidate.career_span_years} years`]
          : [],
      };
    }
  }

  if (/\b(certification|certified|license|licensed|licensure)\b/.test(requirementText.toLowerCase())) {
    const directMatch = matchesCredentialRequirement(requirement.requirement, candidateCertifications);
    return {
      classification: directMatch ? 'strong' : 'missing',
      evidence: directMatch ? candidateCertifications : [],
    };
  }

  if (/\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|foreign equivalent)\b/.test(requirementText.toLowerCase())) {
    const directMatch = matchesDegreeRequirement(requirementText, input.candidate.education);
    return {
      classification: directMatch ? 'strong' : 'missing',
      evidence: directMatch ? input.candidate.education.map((item) => `${item.degree} — ${item.institution}`) : [],
    };
  }

  const directSkillEvidence = findDirectSkillEvidence(requirementText, input);
  if (directSkillEvidence.length > 0) {
    return {
      classification: 'strong',
      evidence: directSkillEvidence.slice(0, 2),
    };
  }

  const rankedEvidence = rankEvidence(requirementText, corpus);
  const topEvidence = rankedEvidence.slice(0, 3);
  const evidence = topEvidence.map((item) => item.text);
  const topScore = topEvidence[0]?.score ?? 0;
  const hasNearEvidence = evidence.length > 0;

  const classification: GapClassification = hardRequirement
    ? (topScore >= 3 ? 'strong' : 'missing')
    : topScore >= 3
      ? 'strong'
      : hasNearEvidence
        ? 'partial'
        : 'missing';

  if (classification === 'strong') {
    return { classification, evidence };
  }

  const adjacentEvidence = evidence[0] ?? input.candidate.leadership_scope ?? input.candidate.operational_scale;
  if (!adjacentEvidence) {
    return { classification, evidence };
  }

  const strategy = buildFallbackStrategy(requirement, adjacentEvidence, input, hardRequirement);
  return {
    classification,
    evidence,
    strategy,
  };
}

function rankEvidence(requirementText: string, corpus: EvidenceEntry[]): Array<EvidenceEntry & { score: number }> {
  const keywords = extractKeywords(requirementText);

  return corpus
    .map((entry) => ({
      ...entry,
      score: scoreEvidence(entry.text, keywords),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.text.length - right.text.length);
}

function buildFallbackStrategy(
  requirement: CanonicalRequirementSeed,
  adjacentEvidence: string,
  input: GapAnalysisInput,
  hardRequirement: boolean,
): GapStrategy {
  const firstExperience = input.candidate.experience[0];
  const companyReference = firstExperience ? `${firstExperience.title} at ${firstExperience.company}` : 'your recent work';
  const gentlePositioning = hardRequirement
    ? `Acknowledge the credential gap honestly, then use ${adjacentEvidence} to show related experience without implying the missing requirement is already met.`
    : `Use ${adjacentEvidence} to strengthen how the resume proves ${requirement.requirement}.`;

  return {
    real_experience: adjacentEvidence,
    positioning: gentlePositioning,
    ai_reasoning: hardRequirement
      ? `I found adjacent evidence in ${companyReference}, but this still looks like a true hard requirement. The safest move is to surface the related experience honestly while keeping the missing credential visible as a real screening risk.`
      : `I found nearby proof in ${companyReference}. This looks more like an under-explained fit gap than a true miss, so the next move is to tighten the wording and add one specific detail the hiring team will care about.`,
    interview_questions: [
      {
        question: `In ${companyReference}, what specific example best proves "${requirement.requirement}"?`,
        rationale: 'A concrete example will turn the adjacent evidence into stronger, more defensible resume language.',
        looking_for: 'Scope, scale, stakeholders, measurable outcomes, or technical depth tied directly to the requirement.',
      },
    ],
  };
}

function extractRequiredYears(text: string): number | null {
  const match = text.match(/\b(?:minimum of\s*)?(\d+)\+?\s+years?\b/i);
  return match ? Number(match[1]) : null;
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9+.#/-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return [...new Set(tokens.filter((token) => !STOP_WORDS.has(token)))];
}

function scoreEvidence(text: string, keywords: string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'their',
  'have',
  'has',
  'had',
  'are',
  'was',
  'were',
  'will',
  'role',
  'job',
  'candidate',
  'experience',
  'required',
  'requirement',
  'must',
  'have',
  'nice',
  'important',
  'support',
  'provide',
  'including',
  'other',
  'related',
  'field',
  'level',
]);

function normalizeRequirement(requirement: RequirementGap): RequirementGap {
  const source: RequirementSource = requirement.source === 'benchmark' ? 'benchmark' : 'job_description';
  const evidence = Array.isArray(requirement.evidence)
    ? requirement.evidence.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 2)
    : [];
  const strategy = sanitizeGapStrategy(requirement.strategy);
  const sourceEvidence = sanitizeSourceEvidence(requirement.source_evidence, requirement.requirement);

  return {
    ...requirement,
    source,
    category: requirement.category ?? defaultCategoryForSource(source),
    score_domain: requirement.score_domain ?? (source === 'job_description' ? 'ats' : 'benchmark'),
    evidence,
    source_evidence: sourceEvidence,
    strategy: requirement.classification === 'strong' ? undefined : strategy,
  };
}

function normalizeForSet(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeForSet(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sanitizeSourceEvidence(sourceEvidence: string | undefined, requirement: string): string | undefined {
  const trimmed = typeof sourceEvidence === 'string' ? sourceEvidence.trim() : '';
  if (!trimmed) return undefined;
  if (/^#+\s*/.test(trimmed)) return requirement;
  if (/canonical requirement catalog/i.test(trimmed)) return requirement;
  if (/^(job description|benchmark|requirement catalog|resume evidence|required qualifications?)$/i.test(trimmed)) {
    return requirement;
  }
  return trimmed;
}

function looksLikeResumePositioning(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const wordCount = trimmed.split(/\s+/).length;
  const hasStrongVerb = /\b(led|built|developed|tracked|drove|improved|managed|owned|created|launched|delivered|oversaw|designed|implemented|optimized|reduced|increased|grew|guided|ran|used|partnered)\b/i.test(trimmed);
  const looksLikeLabel = /\b(experience|expertise|background|exposure)\b/i.test(trimmed) && wordCount <= 6;
  const looksLikeScopePhrase = /\b(accountability|ownership|management|oversight|responsibility|scope)\b/i.test(trimmed);
  const hasMetricSignal = /[$%]|\b\d+|\bpayroll\b|\bbudget\b|\brevenue\b|\bcost\b/i.test(trimmed);

  if (looksLikeLabel) return false;
  if (wordCount < 4 && !(looksLikeScopePhrase && hasMetricSignal)) return false;

  return hasStrongVerb || wordCount >= 8 || (looksLikeScopePhrase && hasMetricSignal);
}

function sanitizeGapStrategy(strategy: RequirementGap['strategy']): RequirementGap['strategy'] {
  if (!strategy || typeof strategy !== 'object') return undefined;

  const questions = Array.isArray(strategy.interview_questions)
    ? strategy.interview_questions
      .filter((item): item is NonNullable<GapStrategy['interview_questions']>[number] => Boolean(
        item
        && typeof item.question === 'string'
        && typeof item.rationale === 'string'
        && typeof item.looking_for === 'string',
      ))
      .map((item) => ({
        question: item.question.trim(),
        rationale: item.rationale.trim(),
        looking_for: item.looking_for.trim(),
      }))
      .filter((item) => item.question && item.rationale && item.looking_for)
      .slice(0, 1)
    : [];

  const normalized: GapStrategy = {
    real_experience: typeof strategy.real_experience === 'string' ? strategy.real_experience.trim() : '',
    positioning: typeof strategy.positioning === 'string' ? strategy.positioning.trim() : '',
  };

  if (!normalized.real_experience || !normalized.positioning || !looksLikeResumePositioning(normalized.positioning)) {
    return undefined;
  }

  if (typeof strategy.inferred_metric === 'string' && strategy.inferred_metric.trim()) {
    normalized.inferred_metric = strategy.inferred_metric.trim();
  }
  if (typeof strategy.inference_rationale === 'string' && strategy.inference_rationale.trim()) {
    normalized.inference_rationale = strategy.inference_rationale.trim();
  }
  if (typeof strategy.ai_reasoning === 'string' && strategy.ai_reasoning.trim()) {
    normalized.ai_reasoning = strategy.ai_reasoning.trim();
  }
  if (questions.length > 0) {
    normalized.interview_questions = questions;
  }

  return normalized;
}

function isRequirementAlreadySatisfiedByStrongMatch(
  risk: string,
  strongRequirements: string[],
): boolean {
  const normalizedRisk = normalizeForSet(risk);
  if (strongRequirements.some((item) => normalizeForSet(item) === normalizedRisk)) {
    return true;
  }

  const riskYears = extractRequiredYears(risk);
  if (riskYears !== null) {
    const strongYears = strongRequirements
      .map((item) => extractRequiredYears(item))
      .filter((value): value is number => value !== null);
    if (strongYears.some((value) => value >= riskYears)) {
      return true;
    }
  }

  if (isEquivalentCredentialRequirement(risk, strongRequirements)) {
    return true;
  }

  return false;
}

function isLogisticsOnlyRequirement(value: string): boolean {
  const normalized = normalizeForSet(value);
  if (!normalized) return false;
  const logisticsPattern = /\b(travel|relocation|on call|on-call|onsite|on-site|field presence|field support|shift schedule|weekend availability|availability)\b/;
  const businessPattern = /\b(operations|execution|strategy|leadership|stakeholder|delivery|manufacturing|cloud|platform|program|product|marketing|finance|compliance)\b/;
  return logisticsPattern.test(normalized) && !businessPattern.test(normalized);
}

function isEquivalentCredentialRequirement(
  risk: string,
  strongRequirements: string[],
): boolean {
  const normalizedRisk = canonicalizeCredentialText(risk);
  if (!normalizedRisk) return false;

  const riskLooksCredentialLike = /\b(bachelor|master|mba|phd|doctorate|degree|engineering|operations management|business|marketing|certification|certified|license|licensed|licensure)\b/.test(normalizedRisk);
  if (!riskLooksCredentialLike) return false;

  return strongRequirements.some((requirement) => {
    const normalizedRequirement = canonicalizeCredentialText(requirement);
    if (!normalizedRequirement) return false;
    if (normalizedRequirement === normalizedRisk) return true;
    if (normalizedRequirement.includes(normalizedRisk) || normalizedRisk.includes(normalizedRequirement)) return true;

    const stopTokens = new Set(['bachelor', 'bachelors', 'master', 'masters', 'mba', 'phd', 'doctorate', 'degree', 'higher', 'field', 'fields', 'foreign', 'equivalent', 'other', 'related', 'relevant', 'or', 'and', 'required', 'preferred', 'preference']);
    const riskTokens = normalizedRisk.split(/\s+/).filter((token) => token.length >= 3 && !stopTokens.has(token));
    const requirementTokens = normalizedRequirement.split(/\s+/).filter((token) => token.length >= 3 && !stopTokens.has(token));

    if (riskTokens.length === 0 || requirementTokens.length === 0) {
      return false;
    }

    const riskSet = new Set(riskTokens);
    const requirementSet = new Set(requirementTokens);
    const sharedCount = [...riskSet].filter((token) => requirementSet.has(token)).length;
    return sharedCount >= Math.min(riskSet.size, requirementSet.size);
  });
}

function canonicalizeCredentialText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(preferred|preference|preferred qualification|nice[- ]to[- ]have|bonus|plus|required|requirement)\b/g, ' ')
    .replace(/\b(certification|certified|license|licensed|licensure)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesCredentialRequirement(requirement: string, certifications: string[]): boolean {
  const normalizedRequirement = canonicalizeCredentialText(requirement);
  if (!normalizedRequirement) return false;

  return certifications.some((certification) => {
    const normalizedCertification = canonicalizeCredentialText(certification);
    if (!normalizedCertification) return false;
    return normalizedCertification.includes(normalizedRequirement)
      || normalizedRequirement.includes(normalizedCertification);
  });
}

function matchesDegreeRequirement(
  requirement: string,
  education: Array<{ degree: string; institution: string; year?: string }>,
): boolean {
  if (education.length === 0) return false;

  const normalizedRequirement = canonicalizeCredentialText(requirement);
  const requiresBachelors = /\b(bachelor|b\s*s|b\s*a|bs|ba|beng|bsc)\b/.test(normalizedRequirement);
  const requiresMasters = /\b(master|m\s*s|m\s*a|ms|ma|mba)\b/.test(normalizedRequirement);
  const requiresDoctorate = /\b(phd|doctorate|doctor)\b/.test(normalizedRequirement);
  const requiresEngineering = /\bengineering|engineer\b/.test(normalizedRequirement);
  const requiresBusiness = /\bbusiness|operations management|management\b/.test(normalizedRequirement);
  const requiresMarketing = /\bmarketing\b/.test(normalizedRequirement);
  const hasAlternativeBranches = /\bor\b/.test(normalizedRequirement);

  return education.some((item) => {
    const degreeText = canonicalizeCredentialText(`${item.degree} ${item.institution}`);
    if (!degreeText) return false;

    const levelMatch = requiresDoctorate
      ? /\b(phd|doctorate|doctor)\b/.test(degreeText)
      : requiresMasters
        ? /\b(master|m\s*s|m\s*a|ms|ma|mba)\b/.test(degreeText)
        : requiresBachelors
          ? /\b(bachelor|b\s*s|b\s*a|bs|ba|beng|bsc)\b/.test(degreeText)
          : true;

    if (!levelMatch) return false;

    const branchChecks = [
      requiresEngineering ? /\bengineering|engineer\b/.test(degreeText) : null,
      requiresBusiness ? /\bbusiness|operations management|management|mba\b/.test(degreeText) : null,
      requiresMarketing ? /\bmarketing\b/.test(degreeText) : null,
    ].filter((value): value is boolean => value !== null);

    if (branchChecks.length > 1 && hasAlternativeBranches) {
      return branchChecks.some(Boolean);
    }

    if (requiresEngineering && !/\bengineering|engineer\b/.test(degreeText)) return false;
    if (requiresBusiness && !/\bbusiness|operations management|management|mba\b/.test(degreeText)) return false;
    if (requiresMarketing && !/\bmarketing\b/.test(degreeText)) return false;

    return true;
  });
}

function findDirectSkillEvidence(
  requirement: string,
  input: GapAnalysisInput,
): string[] {
  const normalizedRequirement = requirement.toLowerCase();
  const exactMatches = [
    ...input.candidate.technologies,
    ...input.candidate.certifications,
    ...input.candidate.industry_depth,
  ].filter((item) => {
    const normalizedItem = item.toLowerCase();
    if (!normalizedItem) return false;
    if (normalizedRequirement.includes(normalizedItem)) return true;
    if (normalizedItem === 'gcp' && /google cloud|gcp/.test(normalizedRequirement)) return true;
    if (normalizedItem === 'aws' && /\baws\b/.test(normalizedRequirement)) return true;
    if (normalizedItem === 'azure' && /\bazure\b/.test(normalizedRequirement)) return true;
    return false;
  });

  const multiCloudMatches = ['aws', 'azure', 'gcp']
    .filter((cloud) => normalizedRequirement.includes(cloud) || (cloud === 'gcp' && normalizedRequirement.includes('google cloud')))
    .filter((cloud) => input.candidate.technologies.some((item) => {
      const normalizedItem = item.toLowerCase();
      return normalizedItem === cloud || (cloud === 'gcp' && normalizedItem === 'google cloud');
    }));

  if (multiCloudMatches.length >= 2) {
    return Array.from(new Set(multiCloudMatches.map((cloud) => cloud.toUpperCase())));
  }

  if (/regulated industr|soc 2|hipaa|pci-dss|pci dss/.test(normalizedRequirement)) {
    const regulatedEvidence = [
      ...input.candidate.industry_depth,
      ...input.candidate.hidden_accomplishments,
      ...input.candidate.experience.flatMap((experience) => experience.bullets),
    ].filter((item) => /financial|finance|healthcare|hipaa|pci|soc 2|regulated/i.test(item));
    if (regulatedEvidence.length > 0) {
      return regulatedEvidence.slice(0, 2);
    }
  }

  return Array.from(new Set(exactMatches)).slice(0, 2);
}

function isHardRequirement(requirement: string, sourceEvidence?: string): boolean {
  const combined = `${requirement} ${sourceEvidence ?? ''}`.toLowerCase();
  if (isPreferredOnlyQualification(combined)) return false;
  return /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|required|requirement|foreign equivalent|years of experience|year experience|minimum of \d+ years|\d+\+?\s+years?)\b/.test(combined);
}

function isPreferredOnlyQualification(text: string): boolean {
  const hasPreferredSignal = /\b(preferred|preference|preferred qualification|nice[- ]to[- ]have|bonus|plus)\b/.test(text);
  const hasRequiredSignal = /\b(required|must have|must-have|minimum|mandatory|screen(?:-| )out|foreign equivalent|years of experience|year experience|minimum of \d+ years)\b/.test(text);
  return hasPreferredSignal && !hasRequiredSignal;
}

function defaultCategoryForSource(source: RequirementSource): RequirementCategory {
  return source === 'job_description' ? 'core_competency' : 'benchmark_achievement';
}

function computeCoverageBreakdown(
  requirements: RequirementGap[],
  source: RequirementSource,
): RequirementCoverageBreakdown {
  const scoped = requirements.filter((requirement) => requirement.source === source);
  const strong = scoped.filter((requirement) => requirement.classification === 'strong').length;
  const partial = scoped.filter((requirement) => requirement.classification === 'partial').length;
  const missing = scoped.filter((requirement) => requirement.classification === 'missing').length;
  const addressed = strong + partial;
  const total = scoped.length;

  return {
    total,
    strong,
    partial,
    missing,
    addressed,
    coverage_score: total > 0 ? Math.round((addressed / total) * 100) : 0,
  };
}
