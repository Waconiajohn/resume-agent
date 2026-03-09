/**
 * AI Job Matcher — scores job listings against a user's positioning strategy.
 *
 * Loads the user's positioning_strategy and evidence_items from platform context,
 * builds a concise profile summary, then sends job batches to MODEL_MID for
 * 0-100 match scoring. Processes jobs in batches of 10; batch failures are
 * logged and skipped so a partial error never blocks the full result set.
 */

import logger from '../logger.js';
import { llm } from '../llm.js';
import { MODEL_MID } from '../llm.js';
import { getLatestUserContext } from '../platform-context.js';
import { repairJSON } from '../json-repair.js';
import type { JobResult } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MatchResult {
  external_id: string;
  match_score: number;
  matching_skills: string[];
  recommendation: string;
  gap_analysis: string;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface LLMMatchResult {
  external_id: string;
  match_score: number;
  matching_skills: string[];
  recommendation: string;
  gap_analysis: string;
}

interface LLMMatchBatchResponse {
  matches: LLMMatchResult[];
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Score a list of job results against the user's positioning strategy.
 *
 * Returns an array of MatchResult — one per job that was successfully scored.
 * Jobs in batches that fail LLM scoring are omitted rather than crashing.
 * If the user has no positioning strategy in platform context, returns [].
 */
export async function matchJobsToProfile(
  userId: string,
  jobs: JobResult[],
): Promise<MatchResult[]> {
  if (jobs.length === 0) return [];

  // Load strategy and evidence from platform context in parallel
  const [strategy, evidence] = await Promise.all([
    getLatestUserContext(userId, 'positioning_strategy'),
    getLatestUserContext(userId, 'evidence_item'),
  ]);

  if (!strategy?.content) {
    logger.info({ userId }, 'ai-matcher: no positioning_strategy found — skipping AI matching');
    return [];
  }

  const profileSummary = buildProfileSummary(strategy.content, evidence?.content ?? null);

  const BATCH_SIZE = 10;
  const allResults: MatchResult[] = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await scoreBatch(profileSummary, batch);
      allResults.push(...batchResults);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { userId, batchStart: i, batchSize: batch.length, error: message },
        'ai-matcher: batch scoring failed — skipping batch',
      );
      // Continue processing remaining batches
    }
  }

  logger.info(
    { userId, totalJobs: jobs.length, scoredJobs: allResults.length },
    'ai-matcher: scoring complete',
  );

  return allResults;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Build a concise (~500 char) profile summary from platform context data.
 * Extracts target roles, key skills, industry, and evidence highlights.
 */
function buildProfileSummary(
  strategyData: Record<string, unknown>,
  evidenceData: Record<string, unknown> | null,
): string {
  const parts: string[] = [];

  // Target roles
  const targetRoles = extractStringList(strategyData, [
    'target_roles',
    'targetRoles',
    'target_role',
    'roles',
  ]);
  if (targetRoles.length > 0) {
    parts.push(`Target roles: ${targetRoles.slice(0, 3).join(', ')}`);
  }

  // Title / positioning angle
  const positioningAngle = extractString(strategyData, [
    'positioning_angle',
    'positioningAngle',
    'positioning_statement',
    'summary',
    'headline',
  ]);
  if (positioningAngle) {
    parts.push(`Positioning: ${positioningAngle.slice(0, 150)}`);
  }

  // Key skills / competencies
  const skills = extractStringList(strategyData, [
    'key_skills',
    'keySkills',
    'core_competencies',
    'coreCompetencies',
    'skills',
    'competencies',
  ]);
  if (skills.length > 0) {
    parts.push(`Key skills: ${skills.slice(0, 8).join(', ')}`);
  }

  // Industry
  const industry = extractString(strategyData, [
    'industry',
    'target_industry',
    'targetIndustry',
    'sector',
  ]);
  if (industry) {
    parts.push(`Industry: ${industry}`);
  }

  // Evidence highlights (accomplishments with metrics)
  if (evidenceData) {
    const highlights = extractStringList(evidenceData, [
      'highlights',
      'accomplishments',
      'key_achievements',
      'achievements',
      'evidence',
    ]);
    if (highlights.length > 0) {
      // Keep only the first 2 highlights to stay within ~500 chars
      parts.push(`Key achievements: ${highlights.slice(0, 2).join(' | ').slice(0, 200)}`);
    }
  }

  const summary = parts.join('. ');
  // Hard cap at 600 chars to keep the LLM prompt manageable
  return summary.slice(0, 600);
}

/**
 * Send a batch of jobs plus the profile to MODEL_MID and parse match scores.
 * Throws if the LLM call fails. Individual jobs that fail to map are skipped.
 */
async function scoreBatch(
  profileSummary: string,
  batch: JobResult[],
): Promise<MatchResult[]> {
  const jobList = batch.map((job, idx) => {
    const descriptionSnippet = job.description
      ? job.description.slice(0, 500)
      : 'No description available';
    return [
      `Job ${idx + 1} (external_id: ${job.external_id}):`,
      `  Title: ${job.title}`,
      `  Company: ${job.company}`,
      `  Location: ${job.location ?? 'Not specified'}`,
      `  Description: ${descriptionSnippet}`,
    ].join('\n');
  }).join('\n\n');

  const systemPrompt = [
    'You are a job matching analyst for senior executives.',
    'Score each job listing 0-100 for fit against the candidate profile.',
    '',
    'Scoring criteria:',
    '  90-100: Exceptional fit — role aligns on title, industry, skills, and seniority',
    '  70-89:  Strong fit — most requirements match with minor gaps',
    '  50-69:  Moderate fit — some alignment but notable gaps or mismatches',
    '  30-49:  Weak fit — limited overlap, would require significant stretch',
    '  0-29:   Poor fit — fundamentally misaligned',
    '',
    'Return ONLY valid JSON in this exact format, no other text:',
    '{',
    '  "matches": [',
    '    {',
    '      "external_id": "<exact external_id from input>",',
    '      "match_score": <integer 0-100>,',
    '      "matching_skills": ["skill1", "skill2"],',
    '      "recommendation": "<1-2 sentences on fit>",',
    '      "gap_analysis": "<1-2 sentences on gaps or why strong fit>"',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const userPrompt = [
    `CANDIDATE PROFILE:\n${profileSummary}`,
    '',
    `JOB LISTINGS TO SCORE:\n${jobList}`,
    '',
    'Return scores for all jobs listed above.',
  ].join('\n');

  const response = await llm.chat({
    model: MODEL_MID,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 2048,
  });

  const parsed = repairJSON<LLMMatchBatchResponse>(response.text);
  if (!parsed || !Array.isArray(parsed.matches)) {
    throw new Error(`ai-matcher: failed to parse LLM response: ${response.text.slice(0, 200)}`);
  }

  const results: MatchResult[] = [];
  for (const match of parsed.matches) {
    // Validate required fields; skip malformed entries
    if (
      typeof match.external_id !== 'string' ||
      typeof match.match_score !== 'number'
    ) {
      logger.warn({ match }, 'ai-matcher: skipping malformed match entry');
      continue;
    }

    results.push({
      external_id: match.external_id,
      match_score: Math.max(0, Math.min(100, Math.round(match.match_score))),
      matching_skills: Array.isArray(match.matching_skills) ? match.matching_skills : [],
      recommendation: typeof match.recommendation === 'string' ? match.recommendation : '',
      gap_analysis: typeof match.gap_analysis === 'string' ? match.gap_analysis : '',
    });
  }

  return results;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

/** Try a list of candidate keys and return the first string value found. */
function extractString(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

/** Try a list of candidate keys and return the first string[] value found. */
function extractStringList(
  data: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const val = data[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
      return val as string[];
    }
  }
  return [];
}
