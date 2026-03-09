/**
 * Boolean Search String Generator — Network Intelligence
 *
 * Uses MODEL_MID to extract skills, titles, and industries from resume text,
 * then generates LinkedIn, Indeed, and Google boolean search strings.
 *
 * TODO: The LLM extraction step should become a `generate_boolean_search` agent
 * tool in the Network Intelligence agent, following the same pattern as other
 * agent tools in server/src/agents/. See ADR-034 and the agent-tool-scaffold
 * skill for the 5-file sequence (tool def, schema, model routing, registration, test).
 */

import { llm, getModelForTier } from '../llm.js';
import { repairJSON } from '../json-repair.js';
import logger from '../logger.js';
import type { BooleanSearchResult } from './types.js';

// ─── In-memory search store (keyed by generated ID, LRU-capped) ─────────────

// TODO: When migrated to agent tool, replace this in-memory store with a
// Supabase-backed table so results survive process restarts and scale across
// multiple server instances.

const MAX_STORE_SIZE = 500;

/**
 * LRU-capped in-memory store for generated boolean search results.
 * Encapsulated in a class to give the store a clear lifecycle and make
 * it straightforward to swap out in tests or future agent migration.
 */
class BooleanSearchStore {
  private readonly store = new Map<string, BooleanSearchResult>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  set(id: string, result: BooleanSearchResult): void {
    this.store.set(id, result);
    this.prune();
  }

  get(id: string): BooleanSearchResult | undefined {
    return this.store.get(id);
  }

  /** Evict oldest entries when store exceeds cap. */
  private prune(): void {
    if (this.store.size <= this.maxSize) return;
    const excess = this.store.size - this.maxSize;
    const keys = this.store.keys();
    for (let i = 0; i < excess; i++) {
      const next = keys.next();
      if (next.done) break;
      this.store.delete(next.value);
    }
  }

  /** Expose size for testing. */
  get size(): number {
    return this.store.size;
  }
}

const searchStore = new BooleanSearchStore(MAX_STORE_SIZE);

// ─── LLM extraction ───────────────────────────────────────────────────────────

interface ExtractedTerms {
  skills: string[];
  titles: string[];
  industries: string[];
}

/**
 * Build the system prompt for resume term extraction.
 * Separated from the LLM call to improve testability and future agent migration.
 */
export function buildExtractTermsSystemPrompt(): string {
  return `You are a resume analyst. Extract key professional terms from the provided resume text.

Return ONLY a valid JSON object with these fields:
- skills: array of up to 15 specific technical/functional skills (e.g. "P&L management", "supply chain optimization", "SaaS")
- titles: array of up to 10 relevant job titles the candidate could hold or target (e.g. "VP Operations", "Director Supply Chain")
- industries: array of up to 5 industries the candidate has experience in (e.g. "manufacturing", "logistics", "retail")

Be specific and professional. No generic terms like "leadership" or "communication".`;
}

/**
 * Build the user prompt for resume term extraction.
 * Separated from the LLM call to improve testability and future agent migration.
 */
export function buildExtractTermsUserPrompt(resumeText: string): string {
  return `Extract professional terms from this resume:\n\n${resumeText.slice(0, 8000)}`;
}

async function extractTermsFromResume(resumeText: string): Promise<ExtractedTerms> {
  const model = getModelForTier('mid');

  const response = await llm.chat({
    model,
    system: buildExtractTermsSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: buildExtractTermsUserPrompt(resumeText),
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

  // Store with a timestamped ID (LRU eviction handled by BooleanSearchStore)
  const id = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  searchStore.set(id, result);

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

