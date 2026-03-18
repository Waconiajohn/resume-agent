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
- For PARTIAL matches: provide evidence AND a creative strategy to strengthen the positioning.
- For MISSING matches: provide a creative strategy if ANY adjacent experience exists. If truly missing, put it in critical_gaps.
- For benchmark items marked nice_to_have: only include a strategy when you find strong adjacent evidence. If the item is simply absent, leave strategy blank and do not add it to pending_strategies.
- HARD REQUIREMENT RULE: If the requirement is a degree, certification, license, years-of-experience threshold, or other explicit screen-out credential and the candidate does not clearly have it, classify it as missing and include it in critical_gaps. Do NOT use adjacent experience as if it fully solves the missing credential.
- If you offer adjacent framing for a hard requirement, the language must stay soft and truthful. It may explain related experience, but it cannot imply the candidate possesses the missing credential.
- QUICK WIN RULE: Prefer strategies where the candidate already has nearby evidence that is simply under-explained on the resume. Those are the best items to strengthen first.
- pending_strategies: include the strategies that are worth coaching on before writing. Always include job_description strategies. For benchmark nice_to_have items, only include them when the strategy is genuinely useful.
- evidence: keep evidence arrays compact — use at most 2 short strings per requirement.
- source_evidence: keep it short and specific, ideally under 12 words.
- ai_reasoning: REQUIRED for every strategy (both in requirements[*].strategy and pending_strategies[*].strategy). Keep it short: 1-2 coaching sentences, under 45 words total. Mention the best evidence and any math only if it materially helps.
- interview_questions: REQUIRED for every strategy (partial and missing). Generate EXACTLY 1 targeted question that could surface hidden experience relevant to this gap. The question MUST reference specific roles, companies, or evidence from the candidate's resume — never ask generic questions like "Tell me about your experience with X". Include rationale and looking_for, but keep both concise.
- coverage_score should reflect overall addressed requirements across the full canonical list. score_breakdown must split that into job_description and benchmark.
- Be honest about critical_gaps — don't stretch beyond what's defensible.

${JSON_OUTPUT_GUARDRAILS}`;

export async function runGapAnalysis(
  input: GapAnalysisInput,
  signal?: AbortSignal,
): Promise<GapAnalysisOutput> {
  const userMessage = buildUserMessage(input);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 8192,
      signal,
    });

    const parsed = repairJSON<GapAnalysisOutput>(response.text);
    if (parsed) return normalizeGapAnalysis(parsed);

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Gap Analysis: first attempt unparseable, retrying with stricter prompt',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Gap Analysis: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicGapAnalysis(input);
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      max_tokens: 8192,
      signal,
    });

    const retryParsed = repairJSON<GapAnalysisOutput>(retry.text);
    if (retryParsed) return normalizeGapAnalysis(retryParsed);

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Gap Analysis: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Gap Analysis: retry failed, using deterministic fallback',
    );
  }

  return buildDeterministicGapAnalysis(input);
}

function buildUserMessage(input: GapAnalysisInput): string {
  const canonicalRequirements: string[] = [
    ...input.job_intelligence.core_competencies.map(
      c => `- [source=job_description][category=core_competency][importance=${c.importance}] ${c.competency} :: ${c.evidence_from_jd}`,
    ),
    ...input.job_intelligence.strategic_responsibilities.map(
      responsibility => `- [source=job_description][category=strategic_responsibility][importance=important] ${responsibility} :: Strategic responsibility explicitly present in the JD`,
    ),
    `- [source=benchmark][category=benchmark_leadership][importance=important] ${input.benchmark.expected_leadership_scope} :: Leadership scope expected of the benchmark candidate`,
    ...input.benchmark.expected_achievements.map(
      a => `- [source=benchmark][category=benchmark_achievement][importance=important] ${a.area}: ${a.description} :: Typical metrics: ${a.typical_metrics}`,
    ),
    ...input.benchmark.expected_technical_skills.map(
      skill => `- [source=benchmark][category=benchmark_skill][importance=important] ${skill} :: Benchmark technical skill`,
    ),
    ...input.benchmark.expected_certifications.map(
      cert => `- [source=benchmark][category=benchmark_certification][importance=nice_to_have] ${cert} :: Benchmark certification expectation`,
    ),
    ...input.benchmark.expected_industry_knowledge.map(
      knowledge => `- [source=benchmark][category=benchmark_industry][importance=important] ${knowledge} :: Benchmark industry knowledge`,
    ),
    ...input.benchmark.differentiators.map(
      differentiator => `- [source=benchmark][category=benchmark_differentiator][importance=nice_to_have] ${differentiator} :: What makes the benchmark candidate stand out`,
    ),
  ];

  const parts: string[] = [
    '## Canonical Requirement Catalog',
    ...canonicalRequirements,
    '',
  ];

  if (input.career_profile) {
    parts.push(
      '## Career Profile',
      `Profile summary: ${input.career_profile.profile_summary}`,
      `Target roles: ${input.career_profile.targeting.target_roles.join(', ') || 'Not yet defined'}`,
      `Target industries: ${input.career_profile.targeting.target_industries.join(', ') || 'Not yet defined'}`,
      `Core strengths: ${input.career_profile.positioning.core_strengths.join(', ') || 'Not yet defined'}`,
      `Proof themes: ${input.career_profile.positioning.proof_themes.join(', ') || 'Not yet defined'}`,
      `Differentiators: ${input.career_profile.positioning.differentiators.join(', ') || 'Not yet defined'}`,
      `Adjacent positioning: ${input.career_profile.positioning.adjacent_positioning.join(', ') || 'Not yet defined'}`,
      `Constraints: ${input.career_profile.preferences.constraints.join(', ') || 'None recorded'}`,
      '',
    );
  }

  parts.push(
    '## Benchmark Candidate (the ideal hire)',
    `Profile: ${input.benchmark.ideal_profile_summary}`,
    `Leadership scope expected: ${input.benchmark.expected_leadership_scope}`,
    'Expected achievements:',
    ...input.benchmark.expected_achievements.map(
      a => `- ${a.area}: ${a.description} (typical metrics: ${a.typical_metrics})`
    ),
    '',
    '## Actual Candidate',
    `Career themes: ${input.candidate.career_themes.join(', ')}`,
    `Leadership scope: ${input.candidate.leadership_scope}`,
    `Operational scale: ${input.candidate.operational_scale}`,
    '',
    'Quantified outcomes:',
    ...input.candidate.quantified_outcomes.map(
      o => `- [${o.metric_type}] ${o.outcome}: ${o.value}`
    ),
    '',
    'Experience:',
    ...input.candidate.experience.map(e => {
      const scope = e.inferred_scope
        ? ` (scope: team=${e.inferred_scope.team_size ?? '?'}, budget=${e.inferred_scope.budget ?? '?'}, geo=${e.inferred_scope.geography ?? '?'})`
        : '';
      return `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date})${scope}\n  ${e.bullets.slice(0, 3).join('\n  ')}`;
    }),
    '',
    'Hidden accomplishments detected:',
    ...input.candidate.hidden_accomplishments.slice(0, 5).map(h => `- ${h}`),
    '',
    `Technologies: ${input.candidate.technologies.join(', ')}`,
    `Certifications: ${input.candidate.certifications.join(', ')}`,
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
    canonicalRequirements.length > 35
      ? 'High-volume mode: focus detailed strategies on job-description requirements and only coach benchmark nice-to-have items when the adjacent evidence is genuinely strong.'
      : 'Focus coaching detail on the requirements with the strongest adjacent evidence.',
    'Return JSON only. Do not include markdown fences or any explanation outside the JSON object.',
  );

  return parts.join('\n');
}

function normalizeGapAnalysis(output: GapAnalysisOutput): GapAnalysisOutput {
  const requirements = output.requirements.map(normalizeRequirement);
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
    ...(output.critical_gaps ?? []).filter((gap) => !isRequirementAlreadySatisfiedByStrongMatch(gap, strongRequirements)),
    ...hardGapRequirements,
  ]);
  const pendingStrategies = (output.pending_strategies ?? []).filter((item) => (
    !hardGapSet.has(normalizeForSet(item.requirement))
  ));

  return {
    ...output,
    requirements,
    coverage_score: total > 0 ? Math.round((addressed / total) * 100) : 0,
    critical_gaps: criticalGaps,
    pending_strategies: pendingStrategies,
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
  return [
    ...input.job_intelligence.core_competencies.map((competency) => ({
      requirement: competency.competency,
      source: 'job_description' as const,
      category: 'core_competency' as const,
      importance: competency.importance,
      source_evidence: competency.evidence_from_jd,
    })),
    ...input.job_intelligence.strategic_responsibilities.map((responsibility) => ({
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
    ...input.benchmark.expected_achievements.map((achievement) => ({
      requirement: `${achievement.area}: ${achievement.description}`,
      source: 'benchmark' as const,
      category: 'benchmark_achievement' as const,
      importance: 'important' as const,
      source_evidence: `Typical metrics: ${achievement.typical_metrics}`,
    })),
    ...input.benchmark.expected_technical_skills.map((skill) => ({
      requirement: skill,
      source: 'benchmark' as const,
      category: 'benchmark_skill' as const,
      importance: 'important' as const,
      source_evidence: 'Benchmark technical skill',
    })),
    ...input.benchmark.expected_certifications.map((certification) => ({
      requirement: certification,
      source: 'benchmark' as const,
      category: 'benchmark_certification' as const,
      importance: 'nice_to_have' as const,
      source_evidence: 'Benchmark certification expectation',
    })),
    ...input.benchmark.expected_industry_knowledge.map((knowledge) => ({
      requirement: knowledge,
      source: 'benchmark' as const,
      category: 'benchmark_industry' as const,
      importance: 'important' as const,
      source_evidence: 'Benchmark industry knowledge',
    })),
    ...input.benchmark.differentiators.map((differentiator) => ({
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
    ...input.candidate.career_themes.map((theme) => ({ text: theme, origin: 'career theme' })),
    ...input.candidate.hidden_accomplishments.map((item) => ({ text: item, origin: 'hidden accomplishment' })),
    ...input.candidate.technologies.map((item) => ({ text: item, origin: 'technology' })),
    ...input.candidate.certifications.map((item) => ({ text: item, origin: 'certification' })),
    ...input.candidate.education.map((item) => ({
      text: `${item.degree} ${item.institution}${item.year ? ` ${item.year}` : ''}`.trim(),
      origin: 'education',
    })),
    ...input.candidate.quantified_outcomes.map((item) => ({
      text: `${item.outcome}: ${item.value}`,
      origin: 'quantified outcome',
    })),
    ...input.candidate.experience.flatMap((experience) => ([
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
    const directMatch = combinedCredentialText.length > 0;
    return {
      classification: directMatch ? 'strong' : 'missing',
      evidence: directMatch ? input.candidate.education.map((item) => `${item.degree} — ${item.institution}`) : [],
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

  return {
    ...requirement,
    source,
    category: requirement.category ?? defaultCategoryForSource(source),
    score_domain: requirement.score_domain ?? (source === 'job_description' ? 'ats' : 'benchmark'),
    source_evidence: requirement.source_evidence,
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

  return false;
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
