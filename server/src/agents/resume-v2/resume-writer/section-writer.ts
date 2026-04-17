/**
 * Section-by-section resume writer
 *
 * Splits the single-pass 32K-token resume writer into 5 focused LLM calls,
 * each with section-specific rules and explicit cross-section evidence tracking.
 *
 * Why: A single prompt with 50+ rules and 20K tokens of output causes the model
 * to drop structural rules, repeat evidence across sections, and produce thin
 * custom sections. One focused call per section group fixes all three failure modes.
 *
 * Call sequence:
 *   1. Executive Summary  (2048 max tokens)
 *   2. Selected Accomplishments + Core Competencies  (4096 + 2048, can overlap in time but run sequentially here)
 *   3. Core Competencies  (2048 max tokens)
 *   4. Custom Sections  (4096 max tokens, after accomplishments so used evidence is known)
 *   5. Professional Experience  (16384 max tokens, after all above)
 *
 * Output: ResumeDraftOutput — same type as the monolithic writer.
 * Post-processing (ensureBulletMetadata, deterministicRequirementMatch, applySectionPlanning, etc.)
 * stays in agent.ts and runs on the merged output just like before.
 */

import { resumeV2Llm } from '../../../lib/llm.js';
import { RESUME_V2_WRITER_MODEL } from '../../../lib/model-constants.js';
import { chatWithTruncationRetry as _chatWithTruncationRetry } from '../../../lib/llm-retry.js';
import { createCombinedAbortSignal, type ChatParams, type ChatResponse } from '../../../lib/llm-provider.js';

/** Section-writer LLM call — uses the Resume V2-scoped provider (DeepSeek when available) */
function chatWithRetry(params: ChatParams, options?: { retryMaxTokens?: number }): Promise<ChatResponse> {
  return _chatWithTruncationRetry(
    { temperature: 0.5, ...params },  // Default temp 0.5 for consistent, human-sounding writing
    { ...options, provider: resumeV2Llm },
  );
}
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { SOURCE_DISCIPLINE } from '../knowledge/resume-rules.js';
import { buildWriterSectionStrategy } from '../section-planning.js';
import { getAuthoritativeSourceExperience } from '../source-resume-outline.js';
import type {
  ResumeWriterInput,
  ResumeDraftOutput,
  ResumeBullet,
  ResumeCustomSection,
  ResumePriorityTarget,
} from '../types.js';

// ─── Constants ───────────────────────────────────────────────────────

const JSON_RULES = `Return exactly one JSON object. First character must be {, last must be }. No markdown fences. No prose outside the JSON.`;

const RETRY_SYSTEM =
  'You are a JSON extraction machine. Return ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary, no text before or after the JSON object.';

// ─── Abort helper ────────────────────────────────────────────────────

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

// ─── Evidence tracking ───────────────────────────────────────────────

/**
 * Extract key proof phrases from section output for cross-section deduplication.
 * We take the first 120 characters of each content line — enough to identify a
 * repeated proof point without being so long that minor rewording defeats the check.
 */
function extractUsedEvidence(lines: string[]): string[] {
  return lines
    .map((line) => line.trim().slice(0, 200).toLowerCase())
    .filter((line) => line.length > 20);
}

function formatUsedEvidence(usedEvidence: string[]): string {
  if (usedEvidence.length === 0) return 'None yet.';
  return usedEvidence.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
}

// ─── Section 1: Executive Summary ───────────────────────────────────

const SUMMARY_SYSTEM = `You are a ghostwriter for a senior executive. A hiring manager will spend 6 seconds on this summary. Your job: make those 6 seconds count.

STEP 1 — EXTRACT THE CANDIDATE'S VOICE
Before writing anything, read the candidate's original resume text below. Find 3-5 phrases where the candidate sounds most like themselves — specific language, industry terms, accomplishments they clearly own. Write these down mentally. Your summary must echo THEIR voice, not yours.

STEP 2 — IDENTIFY THE JOB'S TOP NEED
Read the top JD requirements provided below. What is the #1 problem this company is hiring someone to solve? Your summary must answer: "This person solves THAT problem."

STEP 3 — WRITE THE SUMMARY
Write 3-4 sentences. Total: 60-100 words. Follow this structure:

SENTENCE 1 — WHO THEY ARE (not what they've done):
Write how a trusted colleague would introduce them at a conference.
  ✓ "Operations executive who turns around underperforming manufacturing plants."
  ✓ "Finance leader who builds reporting infrastructure that boards actually use."
  ✗ "Results-driven professional with 22 years of experience in operations."
  ✗ "Seasoned leader passionate about driving operational excellence."

SENTENCE 2 — THEIR STRONGEST PROOF (with a number):
One accomplishment that directly addresses the job's top need. Use the XYZ formula: Accomplished [X] as measured by [Y] by doing [Z].
  ✓ "Turned around a $210M division — eliminated $18M in waste, improved throughput 22% in under two years."
  ✓ "Built the FP&A function from scratch, delivering the first board-ready financial model within 90 days."
  ✗ "Proven track record of driving improvements and delivering results."

SENTENCE 3 — WHY THIS ROLE (connect to the JD):
Bridge their experience to what THIS specific job needs. Be concrete.
  ✓ "Combines deep Lean expertise with hands-on budget management across 3 plants serving automotive OEMs."
  ✗ "Passionate about operational excellence and committed to continuous improvement."

STEP 4 — SELF-CRITIQUE
Before outputting, check your summary against these tests:
- PERSON TEST: Could you hear a real person say this at a dinner party? If it sounds like a LinkedIn bot, rewrite.
- SPECIFICITY TEST: Does every sentence contain at least one concrete detail (number, company type, methodology, industry)?
- BUZZWORD TEST: Scan for these AI fingerprints and REMOVE any you find: spearheaded, leveraged, orchestrated, championed, fostered, driving [noun], ensuring [noun], cross-functional collaboration, stakeholder engagement, transformational, innovative solutions, best-in-class, cutting-edge, holistic, robust, end-to-end, operational excellence, proven track record, results-driven, seasoned professional.
- XYZ TEST: Does sentence 2 follow Accomplished [X] as measured by [Y] by doing [Z]?
- FLOW TEST: Read the summary as one paragraph. Does it flow naturally from sentence to sentence? Or does it feel like three bullets mashed together? If the latter, rewrite transitions.

If any test fails, revise that sentence before outputting.

HARD CONSTRAINTS:
- No first-person pronouns (I, my, we, our)
- No naming the target company
- Every metric must come from the source resume — never invent numbers
- If career span > 20 years: say "deep expertise" not "30 years of experience"
- Read your summary aloud before outputting. If any sentence has the same word appearing twice, rewrite it. If any sentence has more than 2 commas, split it into two sentences.
- Each sentence should make ONE point. Do not chain multiple accomplishments with "and" or commas.
  BAD: "Reduced costs by $18M delivering 22% throughput improvement and 0.9% defect rate through structured value stream mapping and capital-efficient kaizen cycles."
  GOOD: "Cut $18M in annual waste through plant-wide Lean transformation. Improved throughput 22% while driving defect rates down to 0.9%."
- The summary must read as smooth prose, not a compressed bullet list. Write it as if you were introducing this person to a CEO at a dinner — clear, confident, brief.

${SOURCE_DISCIPLINE}
${JSON_RULES}`;

interface SummaryResult {
  content: string;
  is_new: boolean;
}

async function callSummarySection(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<SummaryResult> {
  const { candidate, narrative, benchmark } = input;

  const topOutcomes = candidate.quantified_outcomes.slice(0, 5).map(
    (o) => `- [${o.metric_type}] ${o.outcome}: ${o.value}`,
  ).join('\n');

  const directMatchLines = (benchmark.direct_matches ?? []).slice(0, 3).map(
    (m) => `- [${m.strength}] ${m.jd_requirement} → ${m.candidate_evidence}`,
  ).join('\n');

  // Compute authoritative career span — prefer the larger of declared vs computed from experience dates.
  const sourceExperience = getAuthoritativeSourceExperience(candidate);
  const currentYear = new Date().getFullYear();
  const earliestYear = sourceExperience.reduce((earliest, exp) => {
    const year = parseInt(exp.start_date.replace(/\D/g, '').slice(0, 4), 10);
    return year > 1970 && year < earliest ? year : earliest;
  }, currentYear);
  const computedYears = currentYear - earliestYear;
  const careerYears = Math.max(candidate.career_span_years, computedYears);

  // Never use branded_title for the summary — it contains pipe-delimited marketing
  // fragments that poison the output. Derive a clean role descriptor from source data.
  const topRole = sourceExperience[0];
  const cleanRoleTitle = topRole?.title?.trim() || 'Senior operations leader';
  const domain = candidate.career_themes.slice(0, 2).join(' and ') || 'operations';

  // Extract top 3 requirements for summary targeting
  const top3Requirements = (input.gap_analysis?.requirements ?? [])
    .filter((r) => r.classification === 'strong' || r.classification === 'partial')
    .slice(0, 3)
    .map((r) => r.requirement);

  const requirementBlock = top3Requirements.length > 0
    ? `\n\nTHE THREE JD REQUIREMENTS THAT MATTER MOST FOR THIS ROLE:\n${top3Requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nYour summary MUST address at least 2 of these 3 requirements explicitly.`
    : '';

  // Build a clean, focused user message with ONLY verified facts.
  // No branded title, no narrative scaffolding, no positioning frames.
  const targetRole = input.job_intelligence?.role_title ?? 'the target role';

  // Pick the single strongest verified outcome
  const topOutcome = candidate.quantified_outcomes[0];
  const proofLine = topOutcome
    ? `${topOutcome.outcome}: ${topOutcome.value}`
    : '';

  // Strongest JD fit from gap analysis
  const strongestFit = (input.gap_analysis?.requirements ?? [])
    .filter(r => r.classification === 'strong')
    .slice(0, 2)
    .map(r => r.requirement)
    .join(' and ');

  // Known gaps — DO NOT claim these
  const hardGaps = (input.gap_analysis?.requirements ?? [])
    .filter(r => r.classification === 'missing')
    .slice(0, 3)
    .map(r => r.requirement);

  const userMessage = [
    `Write a 3-sentence executive summary for this person applying to a ${targetRole} role.`,
    '',
    `WHO: ${cleanRoleTitle} with ${careerYears} years in ${domain}.`,
    `SCALE: ${candidate.leadership_scope}. ${candidate.operational_scale}.`,
    proofLine ? `STRONGEST OUTCOME: ${proofLine}` : '',
    strongestFit ? `BEST FIT FOR JD: ${strongestFit}` : '',
    hardGaps.length > 0 ? `DO NOT CLAIM: ${hardGaps.join('; ')}` : '',
    '',
    requirementBlock,
    '',
    'Return JSON: { "content": "3-sentence summary", "is_new": true }',
  ].filter(Boolean).join('\n');

  const parse = async (text: string): Promise<SummaryResult | null> => {
    const parsed = repairJSON<SummaryResult>(text);
    if (!parsed?.content || typeof parsed.content !== 'string') return null;

    let content = parsed.content.trim();

    // ── Strict validator: reject and fix garbage patterns ──

    // Reject pipe-delimited branded titles (e.g., "Leader | Domain | Scale")
    if (content.includes('|') || content.includes('/')) {
      const firstPipe = content.indexOf('|');
      const firstSlash = content.indexOf('/');
      const cutPoint = Math.min(
        firstPipe >= 0 ? firstPipe : content.length,
        firstSlash >= 0 ? firstSlash : content.length,
      );
      // Find the end of the branded-title fragment and strip it
      const afterFragment = content.indexOf('.', cutPoint);
      if (afterFragment > 0) {
        content = content.slice(afterFragment + 1).trim();
        logger.warn('section-writer: stripped pipe/slash branded title fragment from summary');
      }
    }

    // Reject repeated metrics (same number appearing 2+ times)
    const numbers = content.match(/\$?\d[\d,.]*[BMK%]?/g) ?? [];
    const seen = new Set<string>();
    for (const num of numbers) {
      const normalized = num.replace(/[$,%BMK]/g, '');
      if (normalized.length >= 2 && seen.has(normalized)) {
        // Deduplicate: remove the second sentence containing the repeated number
        const sentences = content.split(/\.\s+/);
        const deduped = sentences.filter((s, i) => {
          if (i === 0) return true; // Keep first sentence always
          return !s.includes(num);
        });
        content = deduped.join('. ');
        if (!content.endsWith('.')) content += '.';
        logger.warn({ repeatedMetric: num }, 'section-writer: removed sentence with repeated metric from summary');
        break; // Fix one at a time
      }
      seen.add(normalized);
    }

    // Ensure content starts with a proper identity sentence, not a marketing label
    if (/^[A-Z][a-z]+ [A-Z]/.test(content) && content.split(' ').length < 5) {
      // Looks like a bare title fragment — prefix with clean role
      content = `${cleanRoleTitle} in ${domain}. ${content}`;
    }

    // Final length check
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 15) {
      logger.warn({ wordCount }, 'section-writer: summary too short after validation');
      return null; // Force fallback
    }

    parsed.content = content;
    return parsed;
  };

  const start = Date.now();
  logger.info('section-writer: calling summary section');

  try {
    const response = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      signal,
    });

    const result = await parse(response.text);
    if (result) {
      logger.info({ duration_ms: Date.now() - start }, 'section-writer: summary complete');
      return result;
    }

    logger.warn({ snippet: response.text.slice(0, 300) }, 'section-writer: summary parse failed, retrying');

    const retry = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: RETRY_SYSTEM,
      messages: [{ role: 'user', content: `${SUMMARY_SYSTEM}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      signal,
    });

    const retryResult = await parse(retry.text);
    if (retryResult) {
      logger.info({ duration_ms: Date.now() - start }, 'section-writer: summary complete (retry)');
      return retryResult;
    }
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'section-writer: summary LLM call failed, using deterministic fallback',
    );
  }

  // Deterministic fallback: clean role title + top metric (no branded_title)
  const fallbackMetric = candidate.quantified_outcomes[0]
    ? `${candidate.quantified_outcomes[0].outcome}: ${candidate.quantified_outcomes[0].value}.`
    : '';
  const fallbackContent = [
    `${cleanRoleTitle} with deep expertise in ${domain}.`,
    fallbackMetric,
    strongestFit ? `Background aligns with roles requiring ${strongestFit}.` : '',
  ].filter(Boolean).join(' ');

  logger.info({ duration_ms: Date.now() - start }, 'section-writer: summary fallback used');
  return { content: fallbackContent, is_new: true };
}

// ─── Section 2: Selected Accomplishments ─────────────────────────────

const ACCOMPLISHMENTS_SYSTEM = `You are an expert executive resume writer. Your only job right now is to write 3-4 Selected Accomplishments — the spectacular proof points that make a hiring manager stop and re-read.

## WHAT MAKES A GREAT ACCOMPLISHMENT
- One primary JD requirement it proves — every accomplishment must be tied to a real job need
- Format: Strong Action Verb + What You Did (with context) + Measurable Result
- Every accomplishment must have a substantive metric: $X saved, Y% improved, Z people/systems/sites impacted
- "Managed" and "Supported" are NOT strong verbs — use Drove, Championed, Transformed, Negotiated, Architected, Scaled
- Must be traceable to the original resume — no fabrication

## HARD RULES
- 3-4 accomplishments maximum — quality over quantity
- Each accomplishment must address a DIFFERENT primary JD requirement — do not repeat proof themes
- No accomplishment may duplicate evidence already used in another section
- Every accomplishment must have is_new set correctly (true if enhanced beyond verbatim original)

## OUTPUT FORMAT
Return this JSON object:
{
  "accomplishments": [
    {
      "content": "Strong action verb sentence with metric",
      "is_new": false,
      "addresses_requirements": ["requirement name"],
      "source": "original",
      "requirement_source": "job_description",
      "evidence_found": "quote from original resume or empty string",
      "confidence": "strong"
    }
  ]
}

${SOURCE_DISCIPLINE}
${JSON_RULES}`;

interface AccomplishmentItem {
  content: string;
  is_new: boolean;
  addresses_requirements: string[];
  source: 'original' | 'enhanced' | 'drafted';
  requirement_source: 'job_description' | 'benchmark';
  evidence_found: string;
  confidence: 'strong' | 'partial' | 'needs_validation';
}

interface AccomplishmentsResult {
  accomplishments: AccomplishmentItem[];
}

async function callAccomplishmentsSection(
  input: ResumeWriterInput,
  executiveSummary: string,
  selectedTargets: ResumePriorityTarget[],
  signal?: AbortSignal,
): Promise<AccomplishmentsResult> {
  const { candidate, job_intelligence } = input;
  const sourceExperience = getAuthoritativeSourceExperience(candidate);

  const targetLines = selectedTargets.slice(0, 5).map(
    (t, i) => `${i + 1}. ${t.requirement} (${t.source === 'benchmark' ? 'benchmark signal' : 'job need'}; ${t.importance})${t.source_evidence ? ` — evidence: ${t.source_evidence}` : ''}`,
  ).join('\n');

  const evidencePool = sourceExperience
    .flatMap((exp) => exp.bullets.map((b) => `[${exp.company}] ${b}`))
    .slice(0, 30)
    .map((b, i) => `${i + 1}. ${b}`)
    .join('\n');

  const topRequirements = job_intelligence.core_competencies
    .filter((c) => c.importance === 'must_have')
    .slice(0, 5)
    .map((c) => `- [${c.importance}] ${c.competency}: ${c.evidence_from_jd}`)
    .join('\n');

  const userMessage = [
    '## EXECUTIVE SUMMARY (written above — your accomplishments must reinforce this narrative)',
    executiveSummary,
    '',
    '## PRIORITY TARGETS — write accomplishments that prove THESE needs first',
    targetLines || 'Use the top must_have JD requirements below.',
    '',
    '## TOP JD REQUIREMENTS',
    topRequirements,
    '',
    '## EVIDENCE POOL (original resume bullets — trace every accomplishment to one of these)',
    evidencePool,
    '',
    `Career span: ${candidate.career_span_years} years`,
    `Quantified outcomes: ${candidate.quantified_outcomes.slice(0, 5).map((o) => `${o.outcome}: ${o.value}`).join('; ')}`,
  ].join('\n');

  const parse = (text: string): AccomplishmentsResult | null => {
    const parsed = repairJSON<AccomplishmentsResult>(text);
    if (parsed?.accomplishments && Array.isArray(parsed.accomplishments)) return parsed;
    return null;
  };

  const start = Date.now();
  logger.info('section-writer: calling accomplishments section');

  try {
    const response = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: ACCOMPLISHMENTS_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const result = parse(response.text);
    if (result) {
      logger.info({ duration_ms: Date.now() - start, count: result.accomplishments.length }, 'section-writer: accomplishments complete');
      return result;
    }

    logger.warn({ snippet: response.text.slice(0, 300) }, 'section-writer: accomplishments parse failed, retrying');

    const retry = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: RETRY_SYSTEM,
      messages: [{ role: 'user', content: `${ACCOMPLISHMENTS_SYSTEM}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const retryResult = parse(retry.text);
    if (retryResult) {
      logger.info({ duration_ms: Date.now() - start }, 'section-writer: accomplishments complete (retry)');
      return retryResult;
    }
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'section-writer: accomplishments LLM call failed, using deterministic fallback',
    );
  }

  // Deterministic fallback: top 3 quantified outcomes
  const fallbackAccomplishments: AccomplishmentItem[] = candidate.quantified_outcomes
    .slice(0, 3)
    .map((o) => ({
      content: `${o.outcome}: ${o.value}`,
      is_new: false,
      addresses_requirements: [],
      source: 'original' as const,
      requirement_source: 'job_description' as const,
      evidence_found: `${o.outcome}: ${o.value}`,
      confidence: 'strong' as const,
    }));

  logger.info({ duration_ms: Date.now() - start }, 'section-writer: accomplishments fallback used');
  return { accomplishments: fallbackAccomplishments };
}

// ─── Section 3: Core Competencies ────────────────────────────────────

const COMPETENCIES_SYSTEM = `You are an expert executive resume writer. Your only job right now is to write 12-18 Core Competencies for an executive resume.

## RULES
- Mirror exact phrases from the job description wherever possible — this section is the primary ATS keyword magnet
- Group by narrative themes, not as a raw keyword dump
- Include BOTH technical domain skills AND strategic soft skills appropriate to the candidate's seniority level
- Soft skills like "Cross-Functional Collaboration," "Executive Stakeholder Communication," "Change Management," and "Strategic Planning" signal seniority and belong on executive resumes — include them whether or not the JD mentions them
- Only exclude truly meaningless generics that add zero signal at any level: "hard worker," "team player," "self-starter," "detail-oriented," "people person"
- For executive candidates, AI readiness means leadership of technology adoption and digital transformation — frame it at the executive level: "AI-Enabled Process Optimization" not "Machine Learning"
- Include the candidate's domain strengths and industry-specific technical capabilities
- Avoid duplicating competencies — each entry should be distinct

## OUTPUT FORMAT
Return this JSON object:
{ "competencies": ["skill1", "skill2", "skill3", ...] }

12 minimum, 18 maximum. Quality over exhaustiveness.

${SOURCE_DISCIPLINE}
${JSON_RULES}`;

interface CompetenciesResult {
  competencies: string[];
}

async function callCompetenciesSection(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<CompetenciesResult> {
  const { candidate, job_intelligence, narrative } = input;

  const jdKeywords = job_intelligence.language_keywords.slice(0, 30).join(', ');
  const competencyThemes = narrative.section_guidance.competency_themes.join(', ');
  const technologies = (candidate.technologies ?? []).slice(0, 20).join(', ');
  const mustHaveCompetencies = job_intelligence.core_competencies
    .filter((c) => c.importance === 'must_have')
    .map((c) => c.competency)
    .join(', ');

  const userMessage = [
    '## JD KEYWORDS (mirror these exactly where possible)',
    jdKeywords,
    '',
    '## JD MUST-HAVE COMPETENCIES',
    mustHaveCompetencies,
    '',
    '## NARRATIVE COMPETENCY THEMES (group skills around these)',
    competencyThemes,
    '',
    technologies ? `## CANDIDATE TECHNOLOGIES\n${technologies}` : '',
    `\nIndustry depth: ${(candidate.industry_depth ?? []).slice(0, 5).join(', ')}`,
    `Career themes: ${candidate.career_themes.slice(0, 4).join(', ')}`,
  ].filter(Boolean).join('\n');

  const parse = (text: string): CompetenciesResult | null => {
    const parsed = repairJSON<CompetenciesResult>(text);
    if (parsed?.competencies && Array.isArray(parsed.competencies) && parsed.competencies.length >= 8) {
      return parsed;
    }
    return null;
  };

  const start = Date.now();
  logger.info('section-writer: calling competencies section');

  try {
    const response = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: COMPETENCIES_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      signal,
    });

    const result = parse(response.text);
    if (result) {
      logger.info({ duration_ms: Date.now() - start, count: result.competencies.length }, 'section-writer: competencies complete');
      return result;
    }

    logger.warn({ snippet: response.text.slice(0, 300) }, 'section-writer: competencies parse failed, retrying');

    const retry = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: RETRY_SYSTEM,
      messages: [{ role: 'user', content: `${COMPETENCIES_SYSTEM}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      signal,
    });

    const retryResult = parse(retry.text);
    if (retryResult) {
      logger.info({ duration_ms: Date.now() - start }, 'section-writer: competencies complete (retry)');
      return retryResult;
    }
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'section-writer: competencies LLM call failed, using deterministic fallback',
    );
  }

  // Deterministic fallback: JD keywords + competency themes + candidate technologies, deduplicated
  const seen = new Set<string>();
  const fallback: string[] = [];
  const candidates = [
    ...narrative.section_guidance.competency_themes,
    ...job_intelligence.language_keywords,
    ...(candidate.technologies ?? []),
  ];
  for (const item of candidates) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    fallback.push(item.trim());
    if (fallback.length >= 18) break;
  }

  logger.info({ duration_ms: Date.now() - start }, 'section-writer: competencies fallback used');
  return { competencies: fallback.slice(0, 18) };
}

// ─── Section 4: Custom Sections ───────────────────────────────────────

const CUSTOM_SECTIONS_SYSTEM = `You are an expert executive resume writer. Your only job right now is to write content for recommended custom resume sections.

## CRITICAL RULE — EVIDENCE EXCLUSIVITY
Each custom section must contain UNIQUE proof NOT already used in Selected Accomplishments or other sections.
If the evidence pool for a section is too thin to produce 2+ unique proof points, return an empty lines array for that section — it will be filtered out automatically.
Do NOT repeat accomplishments, metrics, or proof points that appear in the "Already Used Evidence" list below.

## TRUTHFULNESS — DO NOT SILENTLY INVENT
You may CREATIVELY REFRAME real experience to fit a section's theme. That is expected and valuable.
You may NOT invent accomplishments, tools, methodologies, or metrics that do not appear in the candidate's background.

The difference:
- GOOD (creative reframe): Candidate did "automated server provisioning with Ansible" → reframe as "Implemented infrastructure automation reducing manual overhead and enabling scalable operations"
- BAD (invention): Candidate has no ML experience → write "Developed machine learning models to optimize resource utilization" — this is fabrication

When evidence is genuinely thin for a section, you have two options:
1. Write what IS real, even if it's only 1-2 lines of reframed proof. The system will surface these as areas for the candidate to strengthen.
2. Return empty lines if nothing real can fill the section. The section will be filtered out.

Either option is better than inventing accomplishments the candidate cannot defend in an interview.

## SECTION CONTENT GUIDELINES
- Each line must be substantive: action + context + result
- Lines should read as resume bullets, not as paragraph prose
- Back off 10-20% on inferred metrics and mark with "~" or "up to"
- Every line must trace back to the original resume or user-provided context — creative reframing of real experience is encouraged, invention of new experience is not

## OUTPUT FORMAT
Return this JSON object:
{
  "sections": [
    {
      "id": "section_id_here",
      "lines": ["line 1", "line 2", "line 3"]
    }
  ]
}

Return an entry for EVERY recommended section. If a section has insufficient unique evidence, return an empty lines array: { "id": "...", "lines": [] }

${SOURCE_DISCIPLINE}
${JSON_RULES}`;

interface CustomSectionOutput {
  id: string;
  lines: string[];
}

interface CustomSectionsResult {
  sections: CustomSectionOutput[];
}

async function callCustomSections(
  input: ResumeWriterInput,
  usedEvidence: string[],
  signal?: AbortSignal,
): Promise<CustomSectionsResult> {
  const { candidate, job_intelligence } = input;
  const sectionStrategy = buildWriterSectionStrategy(candidate, input.gap_analysis);
  const recommendedSections = sectionStrategy.recommended_custom_sections;

  if (recommendedSections.length === 0) {
    return { sections: [] };
  }

  const sectionDescriptions = recommendedSections.map((section) => [
    `### ${section.title} (id: ${section.id})`,
    `Why it belongs: ${section.rationale ?? 'Role-relevant proof.'}`,
    section.summary ? `Section framing: ${section.summary}` : '',
    section.lines.length > 0
      ? `Seed evidence (rewrite with your own framing):\n${section.lines.map((l) => `  - ${l}`).join('\n')}`
      : 'No seed evidence available — use candidate background below.',
  ].filter(Boolean).join('\n')).join('\n\n');

  const aiReadiness = candidate.ai_readiness;
  const aiSignals = aiReadiness && aiReadiness.strength !== 'none' && aiReadiness.strength !== 'minimal'
    ? aiReadiness.signals.map((s) => s.executive_framing || s.evidence).filter(Boolean).slice(0, 4).map((s) => `- ${s}`).join('\n')
    : '';

  const userMessage = [
    '## RECOMMENDED CUSTOM SECTIONS',
    sectionDescriptions,
    '',
    '## ALREADY USED EVIDENCE (do NOT repeat any of these proof points)',
    formatUsedEvidence(usedEvidence),
    '',
    '## CANDIDATE BACKGROUND (draw additional evidence from here)',
    `Career span: ${candidate.career_span_years} years`,
    `Career themes: ${candidate.career_themes.slice(0, 4).join(', ')}`,
    `Operational scale: ${candidate.operational_scale}`,
    `Hidden accomplishments: ${(candidate.hidden_accomplishments ?? []).slice(0, 5).join('; ')}`,
    aiSignals ? `\nAI Readiness signals:\n${aiSignals}` : '',
    '',
    '## JD CONTEXT',
    `Business problems this role solves: ${job_intelligence.business_problems.slice(0, 3).join('; ')}`,
    `Strategic responsibilities: ${job_intelligence.strategic_responsibilities.slice(0, 3).join('; ')}`,
  ].filter(Boolean).join('\n');

  const parse = (text: string): CustomSectionsResult | null => {
    const parsed = repairJSON<CustomSectionsResult>(text);
    if (parsed?.sections && Array.isArray(parsed.sections)) return parsed;
    return null;
  };

  const start = Date.now();
  logger.info({ count: recommendedSections.length }, 'section-writer: calling custom sections');

  try {
    const response = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: CUSTOM_SECTIONS_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const result = parse(response.text);
    if (result) {
      logger.info({ duration_ms: Date.now() - start, count: result.sections.length }, 'section-writer: custom sections complete');
      return result;
    }

    logger.warn({ snippet: response.text.slice(0, 300) }, 'section-writer: custom sections parse failed, retrying');

    const retry = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: RETRY_SYSTEM,
      messages: [{ role: 'user', content: `${CUSTOM_SECTIONS_SYSTEM}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const retryResult = parse(retry.text);
    if (retryResult) {
      logger.info({ duration_ms: Date.now() - start }, 'section-writer: custom sections complete (retry)');
      return retryResult;
    }
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'section-writer: custom sections LLM call failed, using empty fallback',
    );
  }

  // Deterministic fallback: skip custom sections (empty array — they are optional)
  logger.info({ duration_ms: Date.now() - start }, 'section-writer: custom sections fallback (empty)');
  return { sections: [] };
}

// ─── Section 5: Professional Experience ──────────────────────────────

const EXPERIENCE_SYSTEM = `You are a ghostwriter for a senior executive. You are rewriting ONE role in their Professional Experience section. A separate parallel call handles each other role, so focus only on the single role in the user message.

## EVIDENCE-BOUND WRITING — YOUR #1 RULE

You are rewriting the candidate's resume to better address the target role. You may ONLY use facts from these sources:

1. The candidate's original resume text (provided in SOURCE POSITION below)
2. User-confirmed evidence (marked "USER CONFIRMED" in the gap strategies)
3. Conservative inferences the user explicitly approved

You may NOT:
- Invent metrics, team sizes, budgets, or certifications
- Upgrade "managed" to "owned" without user confirmation
- Add company names, client names, or project details not in the source
- Convert "collaborated on" to "led" without evidence

When evidence is thin for a requirement, write a SHORTER, HONEST bullet rather than a LONGER, FABRICATED one. A resume with 3 strong honest bullets per role is better than 6 polished lies.

STEP 1 — READ THE SOURCE ROLE
Before writing, study the candidate's original entry for this role. Note:
- Their actual job title and company
- Their real scope (team size, budget, geography)
- The specific metrics and outcomes they reported
- Their natural language — how THEY describe their work
You will preserve their facts and echo their voice. You will NOT invent new facts.

STEP 2 — MAP JD REQUIREMENTS TO THIS ROLE
The user message includes the top 3 JD requirements. Before writing any bullets, decide:
- Does this role have strong evidence for any of these requirements?
- For requirements this role can prove, prioritize them in the bullets you write
- If this role has no evidence for a requirement, do not address it here — another role will cover it
- Never fabricate evidence to hit a requirement

STEP 3 — WRITE THE ROLE
Write:

A) SCOPE STATEMENT (1 natural sentence about the role's scale):
  ✓ "Ran day-to-day operations across 3 manufacturing plants, 1,100 employees, and a $210M operating budget."
  ✗ "Scope: 3 plants, 1,100 FTEs, $210M budget" (never use labels)
  ✗ "Oversaw comprehensive operational oversight of multi-facility enterprise" (corporate fluff)

B) BULLETS using the XYZ formula: Accomplished [X] as measured by [Y] by doing [Z]

For each bullet, CHOOSE the right story format:

TRANSFORMATION (use when they FIXED something broken):
  "Inherited [broken state]. [What they did — specifically how]. [Measurable result]."
  Example: "Took over a warehouse with 23% annual turnover and no training program. Introduced structured mentoring pairing veteran leads with new hires. Turnover dropped to 9% in 18 months, saving $340K in recruiting."

GROWTH (use when they BUILT something or GREW people):
  "Built/Grew [what] from [start state] to [end state]. [How they did it]. [What it enabled]."
  Example: "Grew the data team from 2 analysts to 8, including 3 data scientists. Stood up Snowflake and Looker from scratch. Delivered the first exec dashboard within 90 days — now used in every board meeting."

RECOVERY (use when they SOLVED a crisis):
  "When [what went wrong], [how fast they diagnosed it]. [What they changed]. [Result]."
  Example: "When a key supplier missed delivery by 3 weeks, identified 2 backup vendors within 48 hours. Renegotiated terms and split the order. Production resumed on schedule — zero customer impact."

IMPACT (simple action → result — limit to 30% of bullets):
  "Reduced [X] by [Y%] through [specific method]."
  Example: "Cut deployment time from 2 weeks to 4 hours by building a CI/CD pipeline with Jenkins and Terraform."

Prefer story-format bullets when the source evidence supports them. But never force a story structure by inventing details.

STEP 4 — CHECK YOUR WORK
Before finalizing, scan your output:

VERB DEDUP — check this role:
  If any verb appears as the opener of 2+ bullets in this role, rewrite one.
  Avoid "Led" as an opener — use more specific verbs (Built, Grew, Negotiated, Restructured, Closed, Won, Shipped, etc.).

BANNED LANGUAGE — these are AI fingerprints. Using them WILL be caught:
  Spearheaded, Championed, Orchestrated, Fostered, Pioneered
  "Driving [noun]", "Ensuring [noun]", "Fostering [noun]"
  "Cross-functional collaboration", "Stakeholder engagement"
  "Transformational", "Innovative solutions", "Best-in-class"
  "End-to-end", "Holistic", "Robust", "Cutting-edge", "Operational excellence"

PREFERRED VERBS (concrete, human):
  Built, Grew, Cut, Launched, Designed, Negotiated, Reduced, Expanded, Closed,
  Fixed, Hired, Shipped, Opened, Restructured, Merged, Won, Saved, Automated,
  Standardized, Eliminated, Inherited, Took over, Stood up, Consolidated

STEP 5 — SELF-CRITIQUE
Before outputting, verify:
1. Every metric in your output comes from the source resume or user-confirmed evidence (no invented numbers)
2. No verb appears as opener of 2+ bullets in this role
3. No sentence sounds like it was written by ChatGPT — read each aloud mentally
4. You did not upgrade any verb (e.g., "collaborated" → "led") without user confirmation

If any check fails, fix it before outputting.

## CAREER CONTEXT — 45+ EXECUTIVES
- If a candidate has a gap > 6 months between roles, do NOT draw attention to it. The scope statement for the surrounding roles should imply continuity. If narrative guidance mentions a transition period, frame it positively in the scope statement.
- If a candidate appears overqualified for the target role (their recent title is more senior), de-emphasize hierarchical titles in scope statements. Focus on the WORK and PROBLEMS, not the org chart position. Emphasize transferable capabilities.
- If a candidate has 20+ years of experience, weight recent roles (last 10 years) heavily with full bullet detail. Older roles get fewer bullets and should emphasize transferable themes, not dated specifics. Use "Earlier Career" section for roles 15+ years ago that have low relevance to the target.

## SECTION BOUNDARIES — DO NOT MIX
This is a professional experience entry ONLY (role with company, title, dates, bullets).
Do NOT include any of the following in the bullets or scope:
- CERTIFICATIONS (e.g., "AWS SA Pro, CKA, Terraform Associate")
- SKILLS lists (e.g., "AWS, GCP, Docker, Kubernetes...")
- EDUCATION entries (e.g., "B.S. Computer Science | Oregon State University")
- Raw text from the input that isn't an accomplishment

These belong in separate resume sections, NOT inside professional experience.

## HARD RULES
- Scope statement required for this role if it has meaningful responsibility (team size, budget, geography, P&L)
- Scope statements must read as natural sentences about the role's scale — NEVER start with labels like "Brief scope:", "Scope:", "Team:", or "Budget:" — write it as a sentence a human would say
- Preserve ALL specific metrics, dollar amounts, percentages, team sizes, site counts from the original
- Do NOT repeat proof points already used in Selected Accomplishments or custom sections (see Used Evidence below)
- Professional Experience bullets for this role must cover DIFFERENT achievements than any Selected Accomplishment drawn from it
- Mark is_new: true for ANY content you wrote, rephrased, or enhanced beyond the original resume
- BANNED openers: "Responsible for", "Helped", "Assisted", "Supported", "Participated in", "Worked on"
- Include metrics where the source provides them — but NEVER invent a number to meet a quota
- No first-person pronouns

## OUTPUT FORMAT
Return this JSON object for the single role you just rewrote:
{
  "position": {
    "company": "Company Name",
    "title": "Job Title",
    "start_date": "Start",
    "end_date": "End",
    "scope_statement": "Ran day-to-day operations across 3 manufacturing plants, 1,100 employees, and a $210M operating budget.",
    "scope_statement_is_new": true,
    "scope_statement_source": "enhanced",
    "scope_statement_confidence": "strong",
    "scope_statement_evidence_found": "original text or empty string",
    "bullets": [
      {
        "text": "Strong action verb sentence with metric",
        "is_new": false,
        "addresses_requirements": ["requirement name"],
        "source": "original",
        "requirement_source": "job_description",
        "evidence_found": "quote from original resume or empty string",
        "confidence": "strong"
      }
    ]
  }
}

${SOURCE_DISCIPLINE}
${JSON_RULES}`;

interface ExperienceBulletRaw {
  text: string;
  is_new: boolean;
  addresses_requirements: string[];
  source: 'original' | 'enhanced' | 'drafted';
  requirement_source: 'job_description' | 'benchmark';
  evidence_found: string;
  confidence: 'strong' | 'partial' | 'needs_validation';
}

interface ExperiencePositionRaw {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  scope_statement: string;
  scope_statement_is_new?: boolean;
  scope_statement_source: 'original' | 'enhanced' | 'drafted';
  scope_statement_confidence: 'strong' | 'partial' | 'needs_validation';
  scope_statement_evidence_found: string;
  bullets: ExperienceBulletRaw[];
}

interface ExperienceResult {
  positions: ExperiencePositionRaw[];
}

type SourcePosition = ReturnType<typeof getAuthoritativeSourceExperience>[number];

/** Per-position call timeout — was 60s (observed timeout), raised to 90s for safety. */
const PER_POSITION_TIMEOUT_MS = 90_000;

/** Cross-role context shared by every per-position LLM call. Built once per section run. */
interface SharedExperienceContext {
  topRequirements: string;
  top3RequirementBlock: string;
  experienceStrategies: string;
  relevantGapEntries: string;
  framingEntries: string;
  primaryNarrative: string;
  positioningFrame: string;
  accomplishmentTexts: string[];
  usedEvidence: string[];
}

function buildSharedExperienceContext(
  input: ResumeWriterInput,
  usedEvidence: string[],
  accomplishmentTexts: string[],
): SharedExperienceContext {
  const { job_intelligence, narrative, approved_strategies } = input;

  const topRequirements = job_intelligence.core_competencies
    .slice(0, 8)
    .map((c) => `- [${c.importance}] ${c.competency}`)
    .join('\n');

  const top3 = (input.gap_analysis?.requirements ?? [])
    .filter((r) => r.classification === 'strong' || r.classification === 'partial')
    .slice(0, 3)
    .map((r) => r.requirement);

  const top3RequirementBlock = top3.length > 0
    ? `## TOP 3 JD REQUIREMENTS — cover any you have evidence for in this role\n${top3.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const experienceStrategies = approved_strategies
    .filter((s) => !s.target_section || s.target_section === 'auto' || s.target_section === 'experience')
    .slice(0, 6)
    .map((s) => {
      const metricNote = s.strategy.inferred_metric
        ? ` [INFERRED — use only if user confirmed: ${s.strategy.inferred_metric}]`
        : '';
      const userEvidence = s.strategy.verified_user_evidence
        ? `\n  USER CONFIRMED: "${s.strategy.verified_user_evidence}" <- TRUST THIS`
        : '';
      const placement = s.target_company ? ` (company: ${s.target_company})` : '';
      return `- ${s.requirement}: ${s.strategy.positioning}${metricNote}${userEvidence}${placement}`;
    })
    .join('\n');

  const relevantGapEntries = (narrative.gap_positioning_map ?? [])
    .filter((entry) => entry.where_to_feature.toLowerCase().includes('experience'))
    .slice(0, 5)
    .map((entry) => `- Requirement: ${entry.requirement}\n  How to frame: ${entry.narrative_positioning}\n  Justification: ${entry.narrative_justification}`)
    .join('\n');

  const experienceFraming = narrative.section_guidance.experience_framing ?? {};
  const framingEntries = Object.entries(experienceFraming)
    .slice(0, 6)
    .map(([company, framing]) => `- ${company}: ${framing}`)
    .join('\n');

  return {
    topRequirements,
    top3RequirementBlock,
    experienceStrategies,
    relevantGapEntries,
    framingEntries,
    primaryNarrative: narrative.primary_narrative,
    positioningFrame: input.benchmark.positioning_frame ?? 'Not set',
    accomplishmentTexts,
    usedEvidence,
  };
}

function buildSinglePositionMessage(exp: SourcePosition, ctx: SharedExperienceContext): string {
  const scopeParts = exp.inferred_scope
    ? `team=${exp.inferred_scope.team_size ?? '?'}, budget=${exp.inferred_scope.budget ?? '?'}, geo=${exp.inferred_scope.geography ?? '?'}`
    : 'unknown scope';
  const bulletLines = exp.bullets.map((b) => `  - ${b}`).join('\n');
  const positionBlock = [
    `### ${exp.title} at ${exp.company} (${exp.start_date} – ${exp.end_date})`,
    `  Scope signals: ${scopeParts}`,
    bulletLines,
    `  [DETAIL FLOOR: Preserve at least ${exp.bullets.length} distinct bullet-level proof points.]`,
    `  [PROOF FLOOR: Keep all concrete specifics — metrics, named systems, site counts, geographies, product names, dollar amounts. Improve wording without genericizing evidence.]`,
  ].join('\n');

  return [
    '## SOURCE POSITION (rewrite THIS ONE role only — a separate call handles each other role)',
    positionBlock,
    '',
    '## CROSS-SECTION RULE — MANDATORY',
    'The following accomplishments are ALREADY featured in the Selected Accomplishments section above Professional Experience.',
    'A hiring manager reads top to bottom — if they see the same achievement twice, it looks sloppy.',
    '',
    'THESE EXACT ACCOMPLISHMENTS MUST NOT APPEAR AS BULLETS FOR THIS ROLE (not even rephrased):',
    ...ctx.accomplishmentTexts.map((t, i) => `  ${i + 1}. "${t}"`),
    '',
    'For each bullet you write, check: does it describe the SAME achievement as any accomplishment above?',
    '- Same metric (e.g., "35% cost reduction", "50M+ API requests") → it overlaps. Write a DIFFERENT achievement from this role.',
    '- Different aspect of the same project (the HOW, the team growth, the process) → acceptable, but do not repeat the headline metric.',
    '',
    'ADDITIONAL USED EVIDENCE (from custom sections):',
    formatUsedEvidence(ctx.usedEvidence),
    '',
    ctx.top3RequirementBlock,
    '',
    '## ALL JD REQUIREMENTS (broader targeting)',
    ctx.topRequirements,
    '',
    ctx.experienceStrategies
      ? [
          '## EVIDENCE HIERARCHY — READ THIS BEFORE WRITING GAP STRATEGIES',
          'When writing bullets to address gap requirements:',
          '1. HIGHEST TRUST: Lines marked "USER CONFIRMED" — use these verbatim or lightly rewrite',
          '2. MEDIUM TRUST: Original resume text (SOURCE POSITION above) — reframe for the target role but preserve facts',
          '3. LOW TRUST: Lines marked "INFERRED" — use only if the user confirmed the inference',
          '4. NEVER USE: Any metric, scope, or claim not in the above three categories',
          '',
          `## GAP STRATEGIES TO SURFACE IN EXPERIENCE\n${ctx.experienceStrategies}`,
        ].join('\n')
      : '',
    ctx.relevantGapEntries
      ? `\n## GAP POSITIONING MAP (experience-targeted entries)\n${ctx.relevantGapEntries}`
      : '',
    ctx.framingEntries
      ? `\n## EXPERIENCE FRAMING GUIDANCE (from narrative strategy)\n${ctx.framingEntries}`
      : '',
    '',
    '## NARRATIVE NORTH STAR',
    `Primary narrative: ${ctx.primaryNarrative}`,
    `Positioning frame: ${ctx.positioningFrame}`,
    '',
    '## OUTPUT',
    `Return JSON: { "position": { ... } } for the single role "${exp.title} at ${exp.company}".`,
  ].filter(Boolean).join('\n');
}

function sourcePositionFallback(exp: SourcePosition): ExperiencePositionRaw {
  return {
    company: exp.company,
    title: exp.title,
    start_date: exp.start_date,
    end_date: exp.end_date,
    scope_statement: [
      exp.inferred_scope?.team_size ? `Team: ${exp.inferred_scope.team_size}` : '',
      exp.inferred_scope?.budget ? `Budget: ${exp.inferred_scope.budget}` : '',
      exp.inferred_scope?.geography ? `Geography: ${exp.inferred_scope.geography}` : '',
    ].filter(Boolean).join('. ') || 'Scope not specified.',
    scope_statement_is_new: false,
    scope_statement_source: 'original' as const,
    scope_statement_confidence: 'partial' as const,
    scope_statement_evidence_found: '',
    bullets: exp.bullets.map((b) => ({
      text: b,
      is_new: false,
      addresses_requirements: [],
      source: 'original' as const,
      requirement_source: 'job_description' as const,
      evidence_found: b,
      confidence: 'strong' as const,
    })),
  };
}

/**
 * Write ONE position. Wrapped in its own 90-second abort signal so a stuck call
 * doesn't hold up the parallel batch. Single retry with the strict JSON system
 * prompt; on parse failure or provider error, falls back to source bullets for
 * this role only (other roles still get LLM-authored output).
 */
async function callSinglePosition(
  exp: SourcePosition,
  ctx: SharedExperienceContext,
  signal?: AbortSignal,
): Promise<ExperiencePositionRaw> {
  const userMessage = buildSinglePositionMessage(exp, ctx);

  const parse = (text: string): ExperiencePositionRaw | null => {
    const parsed = repairJSON<{ position?: ExperiencePositionRaw; positions?: ExperiencePositionRaw[] }>(text);
    if (parsed?.position && typeof parsed.position === 'object' && !Array.isArray(parsed.position)) {
      return parsed.position;
    }
    // Tolerate legacy { positions: [one] } shape in case the model ignores the new schema
    if (parsed?.positions && Array.isArray(parsed.positions) && parsed.positions.length > 0) {
      return parsed.positions[0] ?? null;
    }
    return null;
  };

  const { signal: combinedSignal, cleanup } = createCombinedAbortSignal(signal, PER_POSITION_TIMEOUT_MS);
  const start = Date.now();

  try {
    const response = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: EXPERIENCE_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal: combinedSignal,
    });

    const result = parse(response.text);
    if (result) {
      logger.info(
        { duration_ms: Date.now() - start, company: exp.company, bullets: result.bullets?.length ?? 0 },
        'section-writer: single position complete',
      );
      return result;
    }

    logger.warn(
      { company: exp.company, snippet: response.text.slice(0, 200) },
      'section-writer: single position parse failed, retrying',
    );

    const retry = await chatWithRetry({
      model: RESUME_V2_WRITER_MODEL,
      system: RETRY_SYSTEM,
      messages: [{ role: 'user', content: `${EXPERIENCE_SYSTEM}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal: combinedSignal,
    });

    const retryResult = parse(retry.text);
    if (retryResult) {
      logger.info(
        { duration_ms: Date.now() - start, company: exp.company },
        'section-writer: single position complete (retry)',
      );
      return retryResult;
    }

    logger.warn(
      { company: exp.company },
      'section-writer: single position retry unparseable — source passthrough',
    );
    return sourcePositionFallback(exp);
  } finally {
    cleanup();
  }
}

/**
 * Parallelized experience writer.
 *
 * Prior implementation: one LLM call with all N positions in the payload, 16K
 * max_tokens, regularly timing out at 60s on 8+ position resumes.
 *
 * Now: one LLM call per position via `Promise.all`. Each call runs with a 90s
 * abort signal. Per-position 4K max_tokens is ample for one role. Wall time is
 * bounded by the slowest position (~5-10s typical, ~15s worst case) instead of
 * summing. A single-position failure falls back to source bullets for that role
 * only — it does not break the other parallel calls.
 *
 * Trade-off: we lose the prior "write each role aware of every other role" prompt
 * coherence. Cross-role dedup relied on by the old prompt (e.g. "NEVER use 'Led'
 * more than once in the entire section") now becomes best-effort within-role.
 * The accomplishments section still runs globally and handles the most important
 * cross-role decisions. Post-processing in agent.ts (ensureBulletMetadata,
 * deterministicRequirementMatch, applySectionPlanning) is unchanged.
 */
async function callExperienceSection(
  input: ResumeWriterInput,
  usedEvidence: string[],
  accomplishmentTexts: string[],
  signal?: AbortSignal,
): Promise<ExperienceResult> {
  const sourceExperience = getAuthoritativeSourceExperience(input.candidate);

  if (sourceExperience.length === 0) {
    return { positions: [] };
  }

  const ctx = buildSharedExperienceContext(input, usedEvidence, accomplishmentTexts);

  const start = Date.now();
  logger.info(
    { position_count: sourceExperience.length },
    'section-writer: calling experience section (parallel per-position)',
  );

  const positions = await Promise.all(
    sourceExperience.map((exp) =>
      callSinglePosition(exp, ctx, signal).catch((err) => {
        if (shouldRethrowForAbort(err, signal)) throw err;
        logger.warn(
          {
            company: exp.company,
            title: exp.title,
            error: err instanceof Error ? err.message : String(err),
          },
          'section-writer: single position LLM call failed — source passthrough for this role',
        );
        return sourcePositionFallback(exp);
      }),
    ),
  );

  logger.info(
    { duration_ms: Date.now() - start, position_count: positions.length },
    'section-writer: experience complete (parallel)',
  );
  return { positions };
}

// ─── Derive selected accomplishment targets ──────────────────────────
// Minimal version used here: takes top must_have requirements from gap analysis
// The full version in agent.ts runs the full evidence-scoring algorithm on the
// merged draft, so this just primes the accomplishments call with priority targets.

function deriveSimpleAccomplishmentTargets(input: ResumeWriterInput): ResumePriorityTarget[] {
  const accomplishmentPriorities = Array.isArray(input.narrative.section_guidance.accomplishment_priorities)
    ? input.narrative.section_guidance.accomplishment_priorities
    : [];

  const eligible = input.gap_analysis.requirements.filter(
    (req) => req.source === 'job_description' && req.importance !== 'nice_to_have',
  );

  // Prefer requirements that match the narrative accomplishment_priorities
  const ranked = [...eligible].sort((a, b) => {
    const aInPriority = accomplishmentPriorities.some(
      (p) => p.toLowerCase().includes(a.requirement.toLowerCase().slice(0, 20)),
    );
    const bInPriority = accomplishmentPriorities.some(
      (p) => p.toLowerCase().includes(b.requirement.toLowerCase().slice(0, 20)),
    );
    if (aInPriority && !bInPriority) return -1;
    if (!aInPriority && bInPriority) return 1;
    const importanceOrder: Record<string, number> = { must_have: 0, important: 1, nice_to_have: 2 };
    return (importanceOrder[a.importance] ?? 2) - (importanceOrder[b.importance] ?? 2);
  });

  return ranked.slice(0, 5).map((req) => ({
    requirement: req.requirement,
    source: req.source,
    importance: req.importance,
    source_evidence: req.source_evidence,
  }));
}

// ─── Merge custom section LLM output with recommended section metadata ──

function classifyEvidenceStrength(
  lines: string[],
  sourceCorpus: string,
): 'strong' | 'aspirational' | 'unsupported' {
  if (lines.length === 0) return 'unsupported';

  // Check how many lines have traceable evidence in the source resume corpus
  let traceable = 0;
  for (const line of lines) {
    const normalized = line.toLowerCase();
    // Extract key proof signals — numbers, percentages, named systems, dollar amounts
    const proofTokens = normalized.match(/\$[\d.]+[mk]?|\d+%|\d+\+?\s+(?:years?|engineers?|teams?|nodes?|microservices|applications)/g) ?? [];
    const hasProofInSource = proofTokens.some((token) => sourceCorpus.includes(token));
    // Also check for substantial word overlap (3+ significant words matching)
    const words = normalized.split(/\s+/).filter((w) => w.length > 4);
    const matchingWords = words.filter((w) => sourceCorpus.includes(w));
    if (hasProofInSource || matchingWords.length >= 4) {
      traceable++;
    }
  }

  const traceableRatio = traceable / lines.length;
  if (traceableRatio >= 0.7) return 'strong';
  if (traceableRatio >= 0.3) return 'aspirational';
  return 'unsupported';
}

function mergeCustomSections(
  llmSections: CustomSectionOutput[],
  recommended: ResumeCustomSection[],
  sourceCorpus: string,
): ResumeCustomSection[] {
  const llmMap = new Map(llmSections.map((s) => [s.id, s.lines]));

  return recommended
    .map((section): ResumeCustomSection => {
      const llmLines = llmMap.get(section.id);
      // If LLM returned lines for this section, use them; otherwise fall through to seed lines
      const lines = llmLines && llmLines.length > 0
        ? llmLines.filter((l) => l.trim().length > 0)
        : section.lines;

      // Classify how well lines trace back to actual resume evidence.
      // 'aspirational' or 'unsupported' sections get flagged for user review in the UI.
      const evidence_strength = classifyEvidenceStrength(lines, sourceCorpus);

      // Don't carry section-planning guidance text into display output.
      // The summary was useful as writer guidance but reads as internal notes on the resume.
      return { ...section, lines, summary: undefined, evidence_strength };
    })
    .filter((section) => section.lines.length >= 2); // drop thin sections
}

// ─── Main export ─────────────────────────────────────────────────────

/**
 * Run the section-by-section resume writer.
 *
 * Makes 5 focused LLM calls (summary, accomplishments, competencies, custom sections,
 * experience) and merges them into a ResumeDraftOutput. Evidence tracking prevents
 * cross-section repetition. Each call falls back to deterministic content on failure.
 *
 * The output is identical in shape to what the monolithic writer produces.
 * All post-processing in agent.ts (ensureBulletMetadata, deterministicRequirementMatch,
 * applySectionPlanning, sanitizeDraftForDisplay) runs on this output unchanged.
 */
export async function runSectionBySection(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<ResumeDraftOutput> {
  const pipelineStart = Date.now();
  logger.info('section-writer: starting section-by-section pipeline');

  // Derive simple accomplishment targets for priming Call 2.
  // The definitive targets are computed by agent.ts after the full draft is assembled.
  const selectedTargets = deriveSimpleAccomplishmentTargets(input);

  // ── Call 1: Executive Summary ────────────────────────────────────
  const summaryResult = await callSummarySection(input, signal);
  const usedEvidence: string[] = extractUsedEvidence([summaryResult.content]);

  // ── Call 2: Selected Accomplishments ────────────────────────────
  const accomplishmentsResult = await callAccomplishmentsSection(
    input,
    summaryResult.content,
    selectedTargets,
    signal,
  );
  // Track all accomplishment content to prevent experience repeating it
  for (const acc of accomplishmentsResult.accomplishments) {
    usedEvidence.push(...extractUsedEvidence([acc.content]));
  }

  // ── Call 3: Core Competencies ───────────────────────────────────
  // Runs after accomplishments so the system has narrative coherence context,
  // but competencies don't consume accomplishment evidence — they run independently.
  const competenciesResult = await callCompetenciesSection(input, signal);

  // ── Call 4: Custom Sections ─────────────────────────────────────
  const customSectionsResult = await callCustomSections(input, [...usedEvidence], signal);
  // Track custom section content before experience call
  for (const section of customSectionsResult.sections) {
    usedEvidence.push(...extractUsedEvidence(section.lines));
  }

  // ── Call 5: Professional Experience ─────────────────────────────
  // Pass exact accomplishment texts so the experience prompt can block repeats precisely
  const accomplishmentTexts = accomplishmentsResult.accomplishments.map((a) => a.content);
  const experienceResult = await callExperienceSection(input, [...usedEvidence], accomplishmentTexts, signal);

  // ── Merge custom section LLM output with section metadata ───────
  // Build a source corpus from the candidate's actual resume for evidence tracing
  const sourceCorpus = getAuthoritativeSourceExperience(input.candidate)
    .flatMap((exp) => exp.bullets)
    .join('\n')
    .toLowerCase();

  const sectionStrategy = buildWriterSectionStrategy(input.candidate, input.gap_analysis);
  const mergedCustomSections = mergeCustomSections(
    customSectionsResult.sections,
    sectionStrategy.recommended_custom_sections,
    sourceCorpus,
  );

  // ── Assemble ResumeDraftOutput ───────────────────────────────────
  const draft: ResumeDraftOutput = {
    header: {
      name: input.candidate.contact.name,
      phone: input.candidate.contact.phone,
      email: input.candidate.contact.email,
      linkedin: input.candidate.contact.linkedin,
      branded_title: input.narrative.branded_title,
    },
    executive_summary: summaryResult,
    core_competencies: competenciesResult.competencies,
    selected_accomplishments: accomplishmentsResult.accomplishments.map((acc) => ({
      content: acc.content,
      is_new: acc.is_new,
      addresses_requirements: acc.addresses_requirements,
      source: acc.source,
      requirement_source: acc.requirement_source,
      evidence_found: acc.evidence_found,
      confidence: acc.confidence,
    })),
    professional_experience: experienceResult.positions.map((pos) => ({
      company: pos.company,
      title: pos.title,
      start_date: pos.start_date,
      end_date: pos.end_date,
      scope_statement: pos.scope_statement,
      scope_statement_is_new: pos.scope_statement_is_new ?? false,
      scope_statement_source: pos.scope_statement_source,
      scope_statement_confidence: pos.scope_statement_confidence,
      scope_statement_evidence_found: pos.scope_statement_evidence_found,
      bullets: pos.bullets.map((b): ResumeBullet => ({
        text: b.text,
        is_new: b.is_new,
        addresses_requirements: b.addresses_requirements,
        source: b.source,
        requirement_source: b.requirement_source,
        evidence_found: b.evidence_found,
        confidence: b.confidence,
      })),
    })),
    education: input.candidate.education ?? [],
    certifications: input.candidate.certifications ?? [],
    custom_sections: mergedCustomSections,
    // section_plan is NOT set here — applySectionPlanning() adds it in agent.ts post-processing
  };

  logger.info(
    {
      duration_ms: Date.now() - pipelineStart,
      sections: {
        accomplishments: draft.selected_accomplishments.length,
        competencies: draft.core_competencies.length,
        experience_positions: draft.professional_experience.length,
        custom_sections: (draft.custom_sections ?? []).length,
      },
    },
    'section-writer: pipeline complete',
  );

  return draft;
}
