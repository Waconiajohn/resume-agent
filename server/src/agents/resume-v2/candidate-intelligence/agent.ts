/**
 * Agent 2: Candidate Intelligence
 *
 * Single-prompt agent that parses a resume into a structured candidate profile.
 * Detects hidden accomplishments. Infers scope from context.
 * Parses contact info accurately — no "John Doe" ever.
 *
 * Model: MODEL_MID
 */

import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import type { CandidateIntelligenceInput, CandidateIntelligenceOutput } from '../types.js';

const JSON_OUTPUT_GUARDRAILS = `CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary, analysis, bullets, or notes outside the JSON object.
- Keep arrays as arrays. Never replace an array with a single object or string.
- If a field is uncertain, use an empty string, empty array, or 0 instead of prose.`;

const SYSTEM_PROMPT = `You are a senior executive career strategist. You've reviewed 10,000+ executive resumes. Your job is to extract a structured profile from a resume, surfacing not just what's written but what's IMPLIED.

Most executives' professional lives are only ~1% reflected on their resume. Your job is to surface the other 99%:
- If someone managed a team of 40, they managed a $3M+ payroll budget (infer it)
- If someone "standardized processes across regions," they did centralization work
- If someone "implemented a knowledge base," they built automation-ready infrastructure
- If someone ran support operations, they enabled revenue retention and customer lifetime value

CONTACT INFO — CRITICAL:
- Extract the candidate's ACTUAL name from the resume. NEVER output "John Doe" or any placeholder.
- Parse phone, email, LinkedIn URL accurately.
- If any field is missing, use empty string — never fabricate contact info.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "contact": {
    "name": "actual name from resume",
    "email": "actual email",
    "phone": "actual phone",
    "linkedin": "LinkedIn URL if present",
    "location": "city/state if present"
  },
  "career_themes": ["3-5 overarching themes across their career"],
  "leadership_scope": "description of largest scope led (team size, budget, geography)",
  "quantified_outcomes": [
    {
      "outcome": "what they achieved",
      "metric_type": "money|time|volume|scope",
      "value": "the number"
    }
  ],
  "industry_depth": ["industries with deep experience"],
  "technologies": ["technologies and tools mentioned"],
  "operational_scale": "description of operational complexity",
  "career_span_years": 15,
  "experience": [
    {
      "company": "company name",
      "title": "job title",
      "start_date": "start date as written",
      "end_date": "end date as written",
      "bullets": ["original bullet points"],
      "inferred_scope": {
        "team_size": "if mentioned or inferable",
        "budget": "if mentioned or inferable",
        "geography": "if mentioned or inferable",
        "revenue_impact": "if mentioned or inferable"
      }
    }
  ],
  "education": [{"degree": "...", "institution": "...", "year": "if present"}],
  "certifications": ["list of certifications"],
  "hidden_accomplishments": ["things implied but not stated on the resume"],
  "raw_text": "first 200 chars of the resume for verification"
}

RULES:
- Extract ALL experience entries, not just recent ones
- Infer scope where context allows (team of 40 → ~$3M payroll budget)
- Hidden accomplishments: what did they ACTUALLY achieve that isn't stated?
- Career themes: look across the entire career, not just the most recent role
- quantified_outcomes: extract EVERY metric mentioned anywhere on the resume
- raw_text: include the first 200 characters for downstream verification

${JSON_OUTPUT_GUARDRAILS}`;

export async function runCandidateIntelligence(
  input: CandidateIntelligenceInput,
  signal?: AbortSignal,
): Promise<CandidateIntelligenceOutput> {
  let parsed: CandidateIntelligenceOutput | null = null;

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user' as const, content: `Parse this resume into a structured candidate profile:\n\n${input.resume_text}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    parsed = normalizeCandidateIntelligence(repairJSON<CandidateIntelligenceOutput>(response.text), input.resume_text);

    if (!parsed) {
      logger.warn(
        { rawSnippet: response.text.substring(0, 500) },
        'Candidate Intelligence: first attempt unparseable, retrying with stricter prompt',
      );
    }
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Candidate Intelligence: first attempt failed, using deterministic fallback',
    );
    parsed = buildDeterministicCandidateIntelligence(input);
  }

  if (!parsed) {
    try {
      const retry = await llm.chat({
        model: MODEL_MID,
        system: `You are a JSON extraction machine.\n${JSON_OUTPUT_GUARDRAILS}`,
        messages: [
          { role: 'user' as const, content: `${SYSTEM_PROMPT}\n\nParse this resume into a structured candidate profile:\n\n${input.resume_text}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 8192,
        signal,
      });

      parsed = normalizeCandidateIntelligence(repairJSON<CandidateIntelligenceOutput>(retry.text), input.resume_text);

      if (!parsed) {
        logger.error(
          { rawSnippet: retry.text.substring(0, 500) },
          'Candidate Intelligence: retry returned unparseable response, using deterministic fallback',
        );
        parsed = buildDeterministicCandidateIntelligence(input);
      }
    } catch (error) {
      if (shouldRethrowForAbort(error, signal)) throw error;
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Candidate Intelligence: retry failed, using deterministic fallback',
      );
      parsed = buildDeterministicCandidateIntelligence(input);
    }
  }

  parsed = normalizeCandidateIntelligence(parsed, input.resume_text);
  if (!parsed) {
    parsed = buildDeterministicCandidateIntelligence(input);
  }

  // Guardrail: never allow placeholder names
  if (!parsed.contact?.name || parsed.contact.name.toLowerCase().includes('john doe')) {
    // Extract name from first line of resume as fallback
    const firstLine = input.resume_text.trim().split('\n')[0]?.trim() ?? '';
    parsed.contact = {
      ...(parsed.contact ?? {}),
      name: firstLine.length > 0 && firstLine.length < 60 ? firstLine : '',
    };
  }

  // Preserve full raw text for downstream agents
  parsed.education = salvageEducationFromResume(parsed.education, input.resume_text);
  parsed.raw_text = input.resume_text;

  return parsed;
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function normalizeCandidateIntelligence(
  parsed: CandidateIntelligenceOutput | null,
  resumeText: string,
): CandidateIntelligenceOutput | null {
  if (!parsed) return null;

  const normalizedEducation = coerceEducationArray(parsed.education);
  const normalizedExperience = coerceExperienceArray(parsed.experience);

  return {
    contact: {
      name: parsed.contact?.name ?? '',
      email: parsed.contact?.email ?? '',
      phone: parsed.contact?.phone ?? '',
      linkedin: parsed.contact?.linkedin ?? '',
      location: parsed.contact?.location ?? '',
    },
    career_themes: coerceStringArray(parsed.career_themes),
    leadership_scope: parsed.leadership_scope ?? '',
    quantified_outcomes: coerceQuantifiedOutcomes(parsed.quantified_outcomes),
    industry_depth: coerceStringArray(parsed.industry_depth),
    technologies: coerceStringArray(parsed.technologies),
    operational_scale: parsed.operational_scale ?? '',
    career_span_years: typeof parsed.career_span_years === 'number' && Number.isFinite(parsed.career_span_years)
      ? parsed.career_span_years
      : inferCareerSpanYears(resumeText),
    experience: normalizedExperience,
    education: normalizedEducation,
    certifications: coerceStringArray(parsed.certifications),
    hidden_accomplishments: coerceStringArray(parsed.hidden_accomplishments),
    raw_text: parsed.raw_text ?? resumeText,
  };
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeStrings(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean));
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function coerceExperienceArray(value: unknown): CandidateIntelligenceOutput['experience'] {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    return [{
      company: typeof entry.company === 'string' ? entry.company : '',
      title: typeof entry.title === 'string' ? entry.title : '',
      start_date: typeof entry.start_date === 'string' ? entry.start_date : '',
      end_date: typeof entry.end_date === 'string' ? entry.end_date : '',
      bullets: coerceStringArray(entry.bullets),
      inferred_scope: entry.inferred_scope && typeof entry.inferred_scope === 'object'
        ? {
            team_size: typeof (entry.inferred_scope as Record<string, unknown>).team_size === 'string' ? (entry.inferred_scope as Record<string, unknown>).team_size as string : undefined,
            budget: typeof (entry.inferred_scope as Record<string, unknown>).budget === 'string' ? (entry.inferred_scope as Record<string, unknown>).budget as string : undefined,
            geography: typeof (entry.inferred_scope as Record<string, unknown>).geography === 'string' ? (entry.inferred_scope as Record<string, unknown>).geography as string : undefined,
            revenue_impact: typeof (entry.inferred_scope as Record<string, unknown>).revenue_impact === 'string' ? (entry.inferred_scope as Record<string, unknown>).revenue_impact as string : undefined,
          }
        : {},
    }];
  });
}

function coerceEducationArray(value: unknown): CandidateIntelligenceOutput['education'] {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return dedupeEducationEntries(items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const degree = typeof entry.degree === 'string' ? entry.degree.trim() : '';
    const institution = typeof entry.institution === 'string' ? entry.institution.trim() : '';
    const year = typeof entry.year === 'string' ? entry.year.trim() : undefined;
    if (!degree && !institution) return [];
    return [{ degree, institution, year }];
  }));
}

function coerceQuantifiedOutcomes(value: unknown): CandidateIntelligenceOutput['quantified_outcomes'] {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const outcome = typeof entry.outcome === 'string' ? entry.outcome.trim() : '';
    if (!outcome) return [];
    const metric_type = entry.metric_type === 'money' || entry.metric_type === 'time' || entry.metric_type === 'volume' || entry.metric_type === 'scope'
      ? entry.metric_type
      : inferMetricType(outcome);
    const valueText = typeof entry.value === 'string' && entry.value.trim()
      ? entry.value.trim()
      : extractMetricValue(outcome);
    return [{ outcome, metric_type, value: valueText }];
  });
}

function buildDeterministicCandidateIntelligence(
  input: CandidateIntelligenceInput,
): CandidateIntelligenceOutput {
  const text = input.resume_text.replace(/\r/g, '');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const lowerText = text.toLowerCase();

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const phone = text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)?.[0] ?? '';
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0]
    ?? text.match(/linkedin\.com\/[^\s)]+/i)?.[0]
    ?? '';
  const name = inferName(lines);
  const location = inferLocation(lines);
  const technologies = inferTechnologies(lowerText);
  const quantified_outcomes = extractQuantifiedOutcomes(lines);
  const experience = extractExperience(lines);
  const education = extractEducation(lines, text);
  const certifications = extractCertifications(lines);
  const career_themes = inferCareerThemes(lowerText, technologies);
  const leadership_scope = inferLeadershipScope(lines);
  const operational_scale = inferOperationalScale(quantified_outcomes, lines);
  const career_span_years = inferCareerSpanYears(text);
  const hidden_accomplishments = inferHiddenAccomplishments(career_themes, technologies, quantified_outcomes);

  return {
    contact: {
      name,
      email,
      phone,
      linkedin,
      location,
    },
    career_themes,
    leadership_scope,
    quantified_outcomes,
    industry_depth: inferIndustryDepth(lowerText),
    technologies,
    operational_scale,
    career_span_years,
    experience,
    education,
    certifications,
    hidden_accomplishments,
    raw_text: input.resume_text,
  };
}

function inferName(lines: string[]): string {
  const firstLine = lines[0] ?? '';
  if (firstLine.length > 0 && firstLine.length < 60 && !/@|\d{3}|\bresume\b/i.test(firstLine)) {
    return firstLine;
  }
  return '';
}

function inferLocation(lines: string[]): string {
  return lines.find((line) => /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/.test(line)) ?? '';
}

function inferTechnologies(lowerText: string): string[] {
  const known = [
    'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'terraform', 'python', 'java',
    'typescript', 'javascript', 'salesforce', 'hubspot', 'sap', 'oracle', 'sql',
    'power bi', 'tableau', 'excel', 'jira', 'servicenow',
  ];
  return known
    .filter((item) => lowerText.includes(item))
    .map((item) => item.split(' ').map(capitalizeToken).join(' '));
}

function extractQuantifiedOutcomes(lines: string[]): CandidateIntelligenceOutput['quantified_outcomes'] {
  return lines
    .filter((line) => /[%$]|\b\d+(?:\.\d+)?\s?(?:million|billion|k|m)?\b/i.test(line))
    .slice(0, 10)
    .map((line) => ({
      outcome: line,
      metric_type: inferMetricType(line),
      value: extractMetricValue(line),
    }));
}

function extractExperience(lines: string[]): CandidateIntelligenceOutput['experience'] {
  const bulletLines = lines.filter((line) => /^[-*•]/.test(line)).map((line) => line.replace(/^[-*•]\s*/, ''));
  if (bulletLines.length > 0) {
    return [{
      company: 'Prior Experience',
      title: 'Career Experience',
      start_date: '',
      end_date: '',
      bullets: bulletLines.slice(0, 12),
      inferred_scope: {},
    }];
  }

  const roleLines = lines.filter((line) => /\b(manager|director|vp|vice president|engineer|lead|head|chief|specialist)\b/i.test(line));
  const title = roleLines[0] ?? 'Career Experience';
  return [{
    company: 'Prior Experience',
    title,
    start_date: '',
    end_date: '',
    bullets: lines.slice(1, 10),
    inferred_scope: {},
  }];
}

function extractEducation(
  lines: string[],
  fullText = lines.join('\n'),
): CandidateIntelligenceOutput['education'] {
  const fromLines = lines
    .filter((line) => /\b(BS|BA|MS|MBA|MA|PhD|Bachelor|Master|University|College|School|Institute)\b/i.test(line))
    .slice(0, 8)
    .map(parseEducationLine)
    .filter((entry): entry is CandidateIntelligenceOutput['education'][number] => Boolean(entry));

  const fromText = extractEducationFromText(fullText);

  return dedupeEducationEntries([...fromText, ...fromLines]);
}

function extractCertifications(lines: string[]): string[] {
  return dedupeStrings(lines.filter((line) => /\b(certified|certification|certificate|PMP|AWS|CFA|SHRM|PE)\b/i.test(line)).slice(0, 6));
}

function inferCareerThemes(lowerText: string, technologies: string[]): string[] {
  const themes: string[] = [];
  if (/\boperations|operational\b/.test(lowerText)) themes.push('Operations leadership');
  if (/\bengineering|technical|platform\b/.test(lowerText)) themes.push('Technical execution');
  if (/\bstrategy|strategic\b/.test(lowerText)) themes.push('Strategic planning');
  if (/\btransform|change\b/.test(lowerText)) themes.push('Transformation leadership');
  if (/\bgrowth|revenue|sales\b/.test(lowerText)) themes.push('Growth orientation');
  if (/\bproject|program\b/.test(lowerText)) themes.push('Program delivery');
  if (themes.length === 0 && technologies.length > 0) themes.push('Technology-enabled leadership');
  return themes.length > 0 ? themes.slice(0, 5) : ['Cross-functional leadership'];
}

function inferLeadershipScope(lines: string[]): string {
  const line = lines.find((entry) => /\b(team|managed|led|supervised|directed|oversaw)\b/i.test(entry));
  return line ?? 'Leadership scope not clearly stated in the source resume.';
}

function inferOperationalScale(
  quantifiedOutcomes: CandidateIntelligenceOutput['quantified_outcomes'],
  lines: string[],
): string {
  return quantifiedOutcomes[0]?.outcome
    ?? lines.find((line) => /\b(global|regional|enterprise|multi-site|multi site|nationwide)\b/i.test(line))
    ?? 'Operational scale not clearly stated in the source resume.';
}

function inferCareerSpanYears(text: string): number {
  const years = Array.from(text.matchAll(/\b(19|20)\d{2}\b/g), (match) => Number(match[0]));
  if (years.length < 2) return 0;
  return Math.max(0, Math.max(...years) - Math.min(...years));
}

function inferHiddenAccomplishments(
  careerThemes: string[],
  technologies: string[],
  quantifiedOutcomes: CandidateIntelligenceOutput['quantified_outcomes'],
): string[] {
  const items = [
    careerThemes[0] ? `${careerThemes[0]} across adjacent roles and business contexts` : '',
    technologies[0] ? `Applied ${technologies[0]} in a way that likely supported broader business outcomes` : '',
    quantifiedOutcomes[0]?.outcome ? `Delivered measurable outcomes that can be positioned more prominently in the resume narrative` : '',
  ].filter(Boolean);
  return dedupeStrings(items).slice(0, 5);
}

function inferIndustryDepth(lowerText: string): string[] {
  const industries = [
    ['healthcare', 'Healthcare'],
    ['finance', 'Financial Services'],
    ['fintech', 'FinTech'],
    ['saas', 'SaaS'],
    ['software', 'Technology'],
    ['energy', 'Energy'],
    ['manufacturing', 'Manufacturing'],
    ['retail', 'Retail'],
    ['telecom', 'Telecommunications'],
  ].filter(([needle]) => lowerText.includes(needle)).map(([, label]) => label);

  return industries.length > 0 ? dedupeStrings(industries) : ['Industry not clearly specified'];
}

function inferMetricType(line: string): 'money' | 'time' | 'volume' | 'scope' {
  if (/[$]|million|billion|\barr\b|\brevenue\b/i.test(line)) return 'money';
  if (/\b(days?|hours?|weeks?|months?|years?)\b|%/i.test(line) && /reduc|improv|acceler|faster/i.test(line)) return 'time';
  if (/\b(users?|customers?|clients?|accounts?|sites?|locations?)\b/i.test(line)) return 'volume';
  return 'scope';
}

function extractMetricValue(line: string): string {
  return line.match(/[$]?\d[\d,]*(?:\.\d+)?\s?(?:%|million|billion|k|m)?/i)?.[0] ?? 'Not specified';
}

function capitalizeToken(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1);
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

function salvageEducationFromResume(
  existing: CandidateIntelligenceOutput['education'],
  resumeText: string,
): CandidateIntelligenceOutput['education'] {
  const lines = resumeText.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const extracted = extractEducation(lines, resumeText);
  if (extracted.length === 0) return existing;
  if (existing.length === 0) return extracted;

  return dedupeEducationEntries([
    ...existing.map((entry) => enrichEducationEntry(entry, findEducationFallback(entry, extracted))),
    ...extracted,
  ]);
}

function enrichEducationEntry(
  current: CandidateIntelligenceOutput['education'][number],
  fallback?: CandidateIntelligenceOutput['education'][number],
): CandidateIntelligenceOutput['education'][number] {
  if (!fallback) return current;

  const currentDegree = current.degree ?? '';
  const fallbackDegree = fallback.degree ?? '';
  const currentInstitution = current.institution ?? '';
  const fallbackInstitution = fallback.institution ?? '';

  const degree = isEducationDegreeTooGeneric(currentDegree) && !isEducationDegreeTooGeneric(fallbackDegree)
    ? fallbackDegree
    : currentDegree || fallbackDegree;

  const institution = isEducationInstitutionTooGeneric(currentInstitution) && !isEducationInstitutionTooGeneric(fallbackInstitution)
    ? fallbackInstitution
    : currentInstitution || fallbackInstitution;

  return {
    degree,
    institution,
    year: current.year ?? fallback.year,
  };
}

function parseEducationLine(
  rawLine: string,
): CandidateIntelligenceOutput['education'][number] | null {
  const line = rawLine
    .replace(/\s+/g, ' ')
    .replace(/\bEDUCATION\b\s*(?:\|\s*\w+)?/i, '')
    .trim()
    .replace(/^[-*•]\s*/, '');

  if (!line) return null;

  const preciseMatch = extractEducationFromText(line)[0];
  if (preciseMatch) {
    return preciseMatch;
  }

  const year = line.match(/\b(19|20)\d{2}\b/)?.[0];
  const institutionMatches = Array.from(
    line.matchAll(/[A-Z][A-Za-z&.\- ]*(?:University|College|School|Institute|Academy)[A-Za-z&.\- ]*/g),
    (match) => match[0].trim(),
  ).filter(Boolean);
  const institution = institutionMatches.at(-1) ?? line;

  let degree = line;
  if (institutionMatches.length > 0) {
    degree = line
      .replace(institution, '')
      .replace(/[,\-|]+$/g, '')
      .replace(/\s+,/g, ',')
      .trim();
  }

  degree = degree
    .replace(/\bdegree\b/gi, 'degree')
    .replace(/\s+,/g, ',')
    .trim();

  if (!degree && institution) {
    degree = institution;
  }

  return {
    degree: degree || line,
    institution,
    year,
  };
}

function isEducationDegreeTooGeneric(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/\((?:b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  return /^(bachelor(?: of science| of arts)?|master(?: of science| of arts)?|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|mba|phd|doctorate)(?: degree)?$/i.test(normalized);
}

function isEducationInstitutionTooGeneric(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return !normalized || /\b(bachelor|master|mba|phd|degree|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?)\b/.test(normalized);
}

function dedupeEducationEntries(
  entries: CandidateIntelligenceOutput['education'],
): CandidateIntelligenceOutput['education'] {
  const deduped: CandidateIntelligenceOutput['education'] = [];

  for (const entry of entries) {
    const normalizedInstitution = (entry.institution ?? '').toLowerCase().trim();
    const normalizedDegree = (entry.degree ?? '').toLowerCase().trim();
    const existingIndex = deduped.findIndex((candidate) => {
      const candidateInstitution = (candidate.institution ?? '').toLowerCase().trim();
      const candidateDegree = (candidate.degree ?? '').toLowerCase().trim();
      const entryLevel = inferDegreeLevel(entry.degree ?? '');
      const candidateLevel = inferDegreeLevel(candidate.degree ?? '');
      return (
        (normalizedInstitution && normalizedInstitution === candidateInstitution)
        || (normalizedDegree && normalizedDegree === candidateDegree)
        || Boolean(entryLevel && candidateLevel && entryLevel === candidateLevel)
      );
    });

    if (existingIndex === -1) {
      deduped.push(entry);
      continue;
    }

    deduped[existingIndex] = pickPreferredEducationEntry(deduped[existingIndex], entry);
  }

  return deduped;
}

function findEducationFallback(
  current: CandidateIntelligenceOutput['education'][number],
  extracted: CandidateIntelligenceOutput['education'],
): CandidateIntelligenceOutput['education'][number] | undefined {
  const currentInstitution = (current.institution ?? '').toLowerCase().trim();
  const currentDegree = (current.degree ?? '').toLowerCase().trim();
  const currentLevel = inferDegreeLevel(current.degree ?? '');

  return extracted.find((entry) => {
    const entryInstitution = (entry.institution ?? '').toLowerCase().trim();
    const entryDegree = (entry.degree ?? '').toLowerCase().trim();
    const entryLevel = inferDegreeLevel(entry.degree ?? '');

    if (currentInstitution && entryInstitution && currentInstitution === entryInstitution) {
      return true;
    }

    if (currentDegree && entryDegree && currentDegree === entryDegree) {
      return true;
    }

    return Boolean(currentLevel && entryLevel && currentLevel === entryLevel);
  });
}

function inferDegreeLevel(value: string): 'bachelor' | 'master' | 'doctorate' | 'mba' | '' {
  const normalized = value.toLowerCase();
  if (/\bmba\b/.test(normalized)) return 'mba';
  if (/\b(phd|doctorate|doctor)\b/.test(normalized)) return 'doctorate';
  if (/\b(master|m\.?s\.?|m\.?a\.?)\b/.test(normalized)) return 'master';
  if (/\b(bachelor|b\.?s\.?|b\.?a\.?)\b/.test(normalized)) return 'bachelor';
  return '';
}

function pickPreferredEducationEntry(
  left: CandidateIntelligenceOutput['education'][number],
  right: CandidateIntelligenceOutput['education'][number],
): CandidateIntelligenceOutput['education'][number] {
  const enrichedLeft = enrichEducationEntry(left, right);
  const enrichedRight = enrichEducationEntry(right, left);

  return scoreEducationEntry(enrichedRight) > scoreEducationEntry(enrichedLeft)
    ? enrichedRight
    : enrichedLeft;
}

function scoreEducationEntry(entry: CandidateIntelligenceOutput['education'][number]): number {
  const degree = entry.degree ?? '';
  const institution = entry.institution ?? '';
  let score = 0;

  if (looksLikeNoisyEducationText(degree)) score -= 8;
  if (looksLikeNoisyEducationText(institution)) score -= 4;
  if (!isEducationDegreeTooGeneric(degree)) score += 4;
  if (/\b(in|major|concentration|specialization)\b/i.test(degree)) score += 3;
  if (/\b(engineering|science|business|math|finance|marketing|operations|computer)\b/i.test(degree)) score += 2;
  if (!isEducationInstitutionTooGeneric(institution)) score += 2;
  if (entry.year) score += 1;
  if (degree.length > 24 && degree.length < 120) score += 1;

  return score;
}

function extractEducationFromText(text: string): CandidateIntelligenceOutput['education'] {
  const normalized = text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const degreePrefix = String.raw`\b(?:Bachelor|Master|Doctor(?:ate)?|Associate|MBA|PhD|B\.?\s*S\.?|B\.?\s*A\.?|M\.?\s*S\.?|M\.?\s*A\.?)\b`;
  const pattern = new RegExp(
    `${degreePrefix}[^,;|\\n]{0,140}?(?:\\s+degree)?\\s*,?\\s*(?:from\\s+)?([A-Z][A-Za-z&.\\- ]+(?:University|College|School|Institute|Academy)(?:\\s+(?:of|at|and|the|&|[A-Z][A-Za-z&.\\-]+)){0,6})\\b`,
    'gi',
  );
  const matches = Array.from(normalized.matchAll(pattern));
  const entries: CandidateIntelligenceOutput['education'] = [];

  for (const match of matches) {
    const degree = cleanEducationDegree(extractDegreePortion(match[0] ?? '', match[1] ?? ''));
    const institution = cleanEducationInstitution(match[1] ?? '');
    const trailingSlice = normalized.slice(match.index ?? 0, (match.index ?? 0) + (match[0]?.length ?? 0) + 12);
    const year = trailingSlice.match(/\b(19|20)\d{2}\b/)?.[0];

    if (!degree || !institution) continue;
    entries.push({ degree, institution, year });
  }

  return dedupeEducationEntries(entries);
}

function extractDegreePortion(matchText: string, institution: string): string {
  return matchText.replace(institution, '').replace(/[,\-|]+$/g, '').trim();
}

function cleanEducationDegree(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/(?:\s*\|\s*[A-Z][A-Za-z ]+)+$/g, '')
    .replace(/[,\-|]+$/g, '')
    .trim();
}

function cleanEducationInstitution(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\b(?:College|School)\s+of\s+(?:Engineering|Business|Management|Technology)\b.*$/i, '')
    .replace(/\b(?:Technology Skills|Technical Skills|Skills|Certifications|Experience|Professional Experience|Summary)\b.*$/i, '')
    .replace(/[,\-|]+$/g, '')
    .trim();
}

function looksLikeNoisyEducationText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return (
    normalized.length > 140
    || /@/.test(normalized)
    || /\(\d{3}\)|\d{3}[-.)\s]\d{3}[-.\s]\d{4}/.test(normalized)
    || /[•]/.test(normalized)
    || /\b(?:managed|drilled|reduced|improved|implemented|developed|supervised)\b/i.test(normalized)
  );
}
