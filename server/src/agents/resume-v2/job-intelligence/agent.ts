/**
 * Agent 1: Job Intelligence
 *
 * Single-prompt agent that extracts structured intelligence from a job description.
 * Focuses on what the hiring manager actually cares about — ignores HR fluff.
 *
 * Model: MODEL_MID
 */

import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import type { JobIntelligenceInput, JobIntelligenceOutput } from '../types.js';

const SYSTEM_PROMPT = `You are a senior executive recruiter who has placed 500+ candidates at the VP/C-suite level. Your job is to deconstruct a job description and extract what the hiring manager ACTUALLY wants — not what HR wrote.

You read between the lines. You know that:
- "Fast-paced environment" means they're understaffed or chaotic
- "Stakeholder management" means internal politics are intense
- "Build and scale" means they don't have it yet
- "Transform" means what they have is broken
- "Strategic and hands-on" means you'll be doing both IC and leadership work
- Vague requirements are often the most important ones

You are also disciplined about what is explicitly REQUIRED versus what is merely nice to have.
If the job description names a degree, certification, license, years-of-experience threshold, industry background, or tool stack as required, preserve that requirement clearly in the output rather than smoothing it into something softer.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "company_name": "extracted from JD or 'Not specified'",
  "role_title": "exact title from JD",
  "seniority_level": "entry|mid|senior|director|vp|c_suite",
  "core_competencies": [
    {
      "competency": "what they need",
      "importance": "must_have|important|nice_to_have",
      "evidence_from_jd": "the JD text that signals this"
    }
  ],
  "strategic_responsibilities": ["what the role actually owns"],
  "business_problems": ["what problems this hire is expected to solve"],
  "cultural_signals": ["what the culture feels like based on language"],
  "hidden_hiring_signals": ["what they're NOT saying but clearly need"],
  "language_keywords": ["exact multi-word phrases as they appear in the JD — prefer 2-4 word phrases like 'cross-functional collaboration', 'P&L ownership', 'enterprise SaaS'. Include single words only when the phrase IS one word."],
  "industry": "industry/sector"
}

RULES:
- Extract the company name from the JD. If not present, use "Not specified".
- Classify competencies by importance: must_have = explicitly required or repeated, important = mentioned with emphasis, nice_to_have = listed but not emphasized.
- Hard requirements such as degrees, certifications, licenses, regulated-industry background, years-of-experience thresholds, and explicitly required tools/frameworks should usually be captured as must_have competencies using wording that stays close to the JD.
- Hidden hiring signals: infer what they need but didn't write (e.g., if they list 15 tools, they probably need someone to consolidate the tech stack).
- Language keywords: extract EXACT multi-word phrases as written in the JD (2-4 words preferred). Examples: "cross-functional collaboration", "P&L ownership", "enterprise SaaS", "change management". Single words are acceptable only when the concept is genuinely one word (e.g., "Salesforce", "Python"). These are ATS matching targets.
- Business problems: what's broken or missing that this hire fixes? These must be concrete business or operating problems, not generic goals like "drive growth" unless the JD actually says that.
- Avoid duplicative competencies that say the same thing in slightly different words.
- Do not invent company context, revenue, org scale, or urgency that the JD does not support.
- Be specific, not generic. "Revenue growth" is useless. "$50M ARR to $100M" is useful.`;

export async function runJobIntelligence(
  input: JobIntelligenceInput,
  signal?: AbortSignal,
): Promise<JobIntelligenceOutput> {
  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Analyze this job description:\n\n${input.job_description}` },
      ],
      max_tokens: 4096,
      signal,
    });

    const parsed = repairJSON<JobIntelligenceOutput>(response.text);
    if (parsed) return parsed;

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Job Intelligence: first attempt unparseable, retrying with stricter prompt',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Job Intelligence: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicJobIntelligence(input);
  }

  try {
    const retry = await llm.chat({
      model: MODEL_MID,
      system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
      messages: [
        { role: 'user', content: `${SYSTEM_PROMPT}\n\nAnalyze this job description:\n\n${input.job_description}` },
      ],
      max_tokens: 4096,
      signal,
    });

    const retryParsed = repairJSON<JobIntelligenceOutput>(retry.text);
    if (retryParsed) return retryParsed;

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Job Intelligence: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Job Intelligence: retry failed, using deterministic fallback',
    );
  }

  return buildDeterministicJobIntelligence(input);
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function buildDeterministicJobIntelligence(input: JobIntelligenceInput): JobIntelligenceOutput {
  const normalizedText = input.job_description.replace(/\r/g, '');
  const lines = normalizedText
    .split('\n')
    .map((line) => stripBullet(line.trim()))
    .filter(Boolean);
  const lowerText = normalizedText.toLowerCase();

  const role_title = extractRoleTitle(lines);
  const company_name = extractCompanyName(lines, role_title);
  const seniority_level = inferSeniorityLevel(`${role_title}\n${normalizedText}`);
  const core_competencies = buildCoreCompetencies(lines, lowerText);
  const strategic_responsibilities = buildStrategicResponsibilities(lines, core_competencies);
  const business_problems = buildBusinessProblems(lines, core_competencies, strategic_responsibilities);
  const cultural_signals = buildCulturalSignals(lowerText);
  const hidden_hiring_signals = buildHiddenSignals(lowerText, strategic_responsibilities);
  const language_keywords = buildLanguageKeywords(core_competencies, normalizedText);
  const industry = inferIndustry(lowerText);

  return {
    company_name,
    role_title,
    seniority_level,
    core_competencies,
    strategic_responsibilities,
    business_problems,
    cultural_signals,
    hidden_hiring_signals,
    language_keywords,
    industry,
  };
}

function buildCoreCompetencies(
  lines: string[],
  lowerText: string,
): JobIntelligenceOutput['core_competencies'] {
  const candidates = lines
    .filter((line) => /must|required|requirement|experience|knowledge|ability|degree|certification|license|proficiency|expertise/i.test(line))
    .slice(0, 8)
    .map((line) => ({
      competency: normalizeRequirementText(line),
      importance: inferImportance(line),
      evidence_from_jd: line,
    }))
    .filter((item) => item.competency.length > 0);

  if (candidates.length > 0) {
    return dedupeCompetencies(candidates);
  }

  const fallbackKeywords = [
    ['engineering', 'Engineering leadership'],
    ['operations', 'Operations leadership'],
    ['stakeholder', 'Stakeholder management'],
    ['project', 'Project management'],
    ['strategy', 'Strategic planning'],
    ['sales', 'Sales leadership'],
    ['marketing', 'Marketing strategy'],
    ['data', 'Data analysis'],
  ].filter(([needle]) => lowerText.includes(needle));

  const seeded = fallbackKeywords.slice(0, 5).map(([, competency]) => ({
    competency,
    importance: 'important' as const,
    evidence_from_jd: `Inferred from repeated job-description language around ${competency.toLowerCase()}.`,
  }));

  return seeded.length > 0
    ? seeded
    : [
        {
          competency: 'Role-specific functional experience',
          importance: 'important',
          evidence_from_jd: 'The job description requires direct evidence of fit for the target role.',
        },
      ];
}

function buildStrategicResponsibilities(
  lines: string[],
  coreCompetencies: JobIntelligenceOutput['core_competencies'],
): string[] {
  const responsibilityLines = lines
    .filter((line) => /lead|own|build|drive|manage|support|optimi[sz]e|develop|oversee|deliver|partner|execute/i.test(line))
    .map((line) => normalizeSentence(line))
    .filter(Boolean);

  if (responsibilityLines.length > 0) {
    return dedupeStrings(responsibilityLines).slice(0, 6);
  }

  return coreCompetencies.slice(0, 3).map((item) => `Demonstrate ${item.competency.toLowerCase()} in this role`);
}

function buildBusinessProblems(
  lines: string[],
  coreCompetencies: JobIntelligenceOutput['core_competencies'],
  strategicResponsibilities: string[],
): string[] {
  const problemLines = lines
    .filter((line) => /improve|reduce|increase|scale|transform|moderni[sz]e|efficien|growth|safety|quality|reliability/i.test(line))
    .map((line) => normalizeSentence(line))
    .filter(Boolean);

  if (problemLines.length > 0) {
    return dedupeStrings(problemLines).slice(0, 5);
  }

  return dedupeStrings([
    ...coreCompetencies.slice(0, 2).map((item) => `Need proven results tied to ${item.competency.toLowerCase()}`),
    ...strategicResponsibilities.slice(0, 2).map((item) => `Need someone who can quickly take ownership of: ${item}`),
  ]).slice(0, 4);
}

function buildCulturalSignals(lowerText: string): string[] {
  const signals: string[] = [];
  if (lowerText.includes('fast-paced')) signals.push('Fast-paced environment');
  if (lowerText.includes('collaborative')) signals.push('Collaborative cross-functional culture');
  if (lowerText.includes('ownership')) signals.push('High-ownership expectations');
  if (lowerText.includes('entrepreneur')) signals.push('Builder mindset expected');
  if (lowerText.includes('customer')) signals.push('Customer-centric operating style');
  return signals.length > 0 ? signals : ['Execution-focused environment'];
}

function buildHiddenSignals(lowerText: string, strategicResponsibilities: string[]): string[] {
  const signals: string[] = [];
  if (lowerText.includes('build')) signals.push('The company likely needs capability-building, not just maintenance.');
  if (lowerText.includes('transform') || lowerText.includes('change')) {
    signals.push('The existing operating model likely needs meaningful change.');
  }
  if (lowerText.includes('cross-functional') || lowerText.includes('stakeholder')) {
    signals.push('Influence across functions will matter as much as direct execution.');
  }
  if (lowerText.includes('optimi') || lowerText.includes('efficien')) {
    signals.push('They expect measurable operating improvements, not just stewardship.');
  }
  if (signals.length > 0) return signals;
  return strategicResponsibilities.length > 0
    ? ['The hiring manager is looking for someone who can take ownership quickly and show proof fast.']
    : [];
}

function buildLanguageKeywords(
  coreCompetencies: JobIntelligenceOutput['core_competencies'],
  jobDescription: string,
): string[] {
  const quotedPhrases = Array.from(
    jobDescription.matchAll(/\b([A-Z][A-Za-z0-9&/+.-]+(?:\s+[A-Z][A-Za-z0-9&/+.-]+){0,2})\b/g),
    (match) => match[1]?.trim() ?? '',
  );

  return dedupeStrings([
    ...coreCompetencies.map((item) => item.competency),
    ...quotedPhrases.filter((phrase) => phrase.split(/\s+/).length <= 4),
  ]).slice(0, 12);
}

function extractRoleTitle(lines: string[]): string {
  const roleLine = lines.find((line) => /\b(chief|officer|president|vice president|vp|director|manager|lead|head|engineer|architect|specialist)\b/i.test(line));
  return roleLine ? normalizeSentence(roleLine) : (lines[0] || 'Target role');
}

function extractCompanyName(lines: string[], roleTitle: string): string {
  const explicitCompany = lines.find((line) => /^company\s*:/i.test(line));
  if (explicitCompany) {
    return explicitCompany.replace(/^company\s*:/i, '').trim() || 'Not specified';
  }

  const rolePattern = new RegExp(roleTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const lineWithAt = lines.find((line) => rolePattern.test(line) && /\bat\b/i.test(line));
  if (lineWithAt) {
    const match = lineWithAt.match(/\bat\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  return 'Not specified';
}

function inferSeniorityLevel(text: string): JobIntelligenceOutput['seniority_level'] {
  const normalized = text.toLowerCase();
  if (/\b(chief|cfo|cio|coo|ceo|president|c-suite|c suite)\b/.test(normalized)) return 'c_suite';
  if (/\b(vp|vice president|svp|evp)\b/.test(normalized)) return 'vp';
  if (/\b(director|head of)\b/.test(normalized)) return 'director';
  if (/\b(senior|principal|staff)\b/.test(normalized)) return 'senior';
  if (/\b(manager|lead)\b/.test(normalized)) return 'mid';
  return 'entry';
}

function inferImportance(line: string): 'must_have' | 'important' | 'nice_to_have' {
  if (/\bmust|required|requirement|minimum|license|certification|degree\b/i.test(line)) return 'must_have';
  if (/\bpreferred|nice to have|bonus|plus\b/i.test(line)) return 'nice_to_have';
  return 'important';
}

function normalizeRequirementText(line: string): string {
  return line
    .replace(/^(requirements?|qualifications?|responsibilities?)\s*:\s*/i, '')
    .replace(/^(must|required|preferred)\s+(have|be|possess)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function normalizeSentence(line: string): string {
  return line.replace(/\s+/g, ' ').trim().replace(/[.;:,]+$/, '');
}

function stripBullet(line: string): string {
  return line.replace(/^[-*•]+\s*/, '').trim();
}

function inferIndustry(lowerText: string): string {
  if (/\bsaas|software|cloud|platform\b/.test(lowerText)) return 'Technology';
  if (/\bhealthcare|hospital|clinical\b/.test(lowerText)) return 'Healthcare';
  if (/\bfinancial|bank|fintech|insurance\b/.test(lowerText)) return 'Financial Services';
  if (/\boil|gas|drilling|energy\b/.test(lowerText)) return 'Energy';
  if (/\bmanufacturing|plant|supply chain\b/.test(lowerText)) return 'Industrial';
  if (/\bmarketing|brand|advertising\b/.test(lowerText)) return 'Marketing';
  return 'Not specified';
}

function dedupeCompetencies(
  values: JobIntelligenceOutput['core_competencies'],
): JobIntelligenceOutput['core_competencies'] {
  const seen = new Set<string>();
  const result: JobIntelligenceOutput['core_competencies'] = [];
  for (const value of values) {
    const key = value.competency.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return result;
}
