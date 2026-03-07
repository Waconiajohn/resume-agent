/**
 * Boolean Search String Generator — Network Intelligence
 *
 * Uses MODEL_MID to extract skills, titles, and industries from resume text,
 * then generates LinkedIn, Indeed, and Google boolean search strings.
 */

import { llm, getModelForTier } from '../llm.js';
import { repairJSON } from '../json-repair.js';
import logger from '../logger.js';
import type { BooleanSearchResult } from './types.js';

// ─── In-memory search store (keyed by generated ID, LRU-capped) ─────────────

const MAX_STORE_SIZE = 500;
const searchStore = new Map<string, BooleanSearchResult>();

/** Evict oldest entries when store exceeds cap. */
function pruneStore(): void {
  if (searchStore.size <= MAX_STORE_SIZE) return;
  const excess = searchStore.size - MAX_STORE_SIZE;
  const keys = searchStore.keys();
  for (let i = 0; i < excess; i++) {
    const next = keys.next();
    if (next.done) break;
    searchStore.delete(next.value);
  }
}

// ─── LLM extraction ───────────────────────────────────────────────────────────

interface ExtractedTerms {
  skills: string[];
  titles: string[];
  industries: string[];
}

const EXTRACT_SYSTEM_PROMPT = `You are a resume analyst. Extract key professional terms from the provided resume text.

Return ONLY a valid JSON object with these fields:
- skills: array of up to 15 specific technical/functional skills (e.g. "P&L management", "supply chain optimization", "SaaS")
- titles: array of up to 10 relevant job titles the candidate could hold or target (e.g. "VP Operations", "Director Supply Chain")
- industries: array of up to 5 industries the candidate has experience in (e.g. "manufacturing", "logistics", "retail")

Be specific and professional. No generic terms like "leadership" or "communication".`;

async function extractTermsFromResume(resumeText: string): Promise<ExtractedTerms> {
  const model = getModelForTier('mid');

  const response = await llm.chat({
    model,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Extract professional terms from this resume:\n\n${resumeText.slice(0, 8000)}`,
      },
    ],
    max_tokens: 1024,
  });

  const parsed = repairJSON<ExtractedTerms>(response.text);

  if (
    !parsed ||
    !Array.isArray(parsed.skills) ||
    !Array.isArray(parsed.titles) ||
    !Array.isArray(parsed.industries)
  ) {
    logger.warn({ responseText: response.text.slice(0, 200) }, 'boolean-search: LLM extraction returned invalid JSON, using empty terms');
    return { skills: [], titles: [], industries: [] };
  }

  return {
    skills: parsed.skills.filter((s): s is string => typeof s === 'string').slice(0, 15),
    titles: parsed.titles.filter((t): t is string => typeof t === 'string').slice(0, 10),
    industries: parsed.industries.filter((i): i is string => typeof i === 'string').slice(0, 5),
  };
}

// ─── Boolean string builders ──────────────────────────────────────────────────

/**
 * Wrap terms in quotes and join with OR.
 * Returns empty string if no terms provided.
 */
function orGroup(terms: string[]): string {
  if (terms.length === 0) return '';
  return terms.map((t) => `"${t}"`).join(' OR ');
}

/**
 * Build a LinkedIn boolean search string.
 * Format: (title OR title) AND (skill OR skill) AND (industry OR industry) -negative
 */
function buildLinkedinString(
  titles: string[],
  skills: string[],
  industries: string[],
  extraTitles: string[],
): string {
  const allTitles = [...new Set([...extraTitles, ...titles])].slice(0, 8);
  const topSkills = skills.slice(0, 6);
  const topIndustries = industries.slice(0, 3);

  const parts: string[] = [];

  if (allTitles.length > 0) {
    parts.push(`(${orGroup(allTitles)})`);
  }

  if (topSkills.length > 0) {
    parts.push(`(${orGroup(topSkills)})`);
  }

  if (topIndustries.length > 0) {
    parts.push(`(${orGroup(topIndustries)})`);
  }

  const base = parts.join(' AND ');

  // Common negative terms to filter noise
  const negatives = '-intern -entry -junior -"entry level"';

  return base ? `${base} ${negatives}` : negatives;
}

/**
 * Build an Indeed search string.
 * Indeed uses simpler boolean: quoted phrases with OR, plus title: prefix.
 */
function buildIndeedString(
  titles: string[],
  skills: string[],
  extraTitles: string[],
): string {
  const allTitles = [...new Set([...extraTitles, ...titles])].slice(0, 5);
  const topSkills = skills.slice(0, 4);

  const titlePart = allTitles.length > 0
    ? `title:(${allTitles.map((t) => `"${t}"`).join(' OR ')})`
    : '';

  const skillPart = topSkills.length > 0
    ? topSkills.map((s) => `"${s}"`).join(' OR ')
    : '';

  const parts = [titlePart, skillPart].filter(Boolean);
  return parts.join(' ') || '"executive" "management"';
}

/**
 * Build a Google site search string targeting job boards and LinkedIn.
 * Format: site:linkedin.com/jobs OR site:indeed.com "title" "skill"
 */
function buildGoogleString(
  titles: string[],
  skills: string[],
  industries: string[],
  extraTitles: string[],
): string {
  const allTitles = [...new Set([...extraTitles, ...titles])].slice(0, 4);
  const topSkills = skills.slice(0, 3);
  const topIndustries = industries.slice(0, 2);

  const sites = '(site:linkedin.com/jobs OR site:indeed.com OR site:glassdoor.com)';

  const termParts: string[] = [];

  if (allTitles.length > 0) {
    termParts.push(`(${orGroup(allTitles)})`);
  }

  if (topSkills.length > 0) {
    termParts.push(`(${orGroup(topSkills)})`);
  }

  if (topIndustries.length > 0) {
    termParts.push(`(${orGroup(topIndustries)})`);
  }

  const termString = termParts.join(' AND ');
  return termString ? `${sites} ${termString}` : sites;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate boolean search strings from resume text and optional target titles.
 * Stores the result in memory and returns it with a generated ID.
 */
export async function generateBooleanSearch(
  resumeText: string,
  targetTitles: string[] = [],
): Promise<{ id: string; result: BooleanSearchResult }> {
  logger.info({ resumeLength: resumeText.length, targetTitleCount: targetTitles.length }, 'boolean-search: starting extraction');

  let extractedTerms: ExtractedTerms;
  try {
    extractedTerms = await extractTermsFromResume(resumeText);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'boolean-search: LLM extraction failed, using empty terms',
    );
    extractedTerms = { skills: [], titles: [], industries: [] };
  }

  const { skills, titles, industries } = extractedTerms;

  // Merge extracted titles with caller-supplied target titles (deduplicated)
  const allTitles = [...new Set([...targetTitles, ...titles])];

  const result: BooleanSearchResult = {
    linkedin: buildLinkedinString(allTitles, skills, industries, targetTitles),
    indeed: buildIndeedString(allTitles, skills, targetTitles),
    google: buildGoogleString(allTitles, skills, industries, targetTitles),
    extractedTerms: { skills, titles, industries },
    generatedAt: new Date().toISOString(),
  };

  // Store with a timestamped ID (prune oldest if over cap)
  const id = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  searchStore.set(id, result);
  pruneStore();

  logger.info(
    { id, skillCount: skills.length, titleCount: titles.length },
    'boolean-search: generation complete',
  );

  return { id, result };
}

/**
 * Retrieve a previously generated boolean search by ID.
 */
export function getBooleanSearch(id: string): BooleanSearchResult | null {
  return searchStore.get(id) ?? null;
}
