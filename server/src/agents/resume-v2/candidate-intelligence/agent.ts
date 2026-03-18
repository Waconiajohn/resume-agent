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
- raw_text: include the first 200 characters for downstream verification`;

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
      max_tokens: 8192,
      signal,
    });

    parsed = repairJSON<CandidateIntelligenceOutput>(response.text);

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
        system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
        messages: [
          { role: 'user' as const, content: `${SYSTEM_PROMPT}\n\nParse this resume into a structured candidate profile:\n\n${input.resume_text}` },
        ],
        max_tokens: 8192,
        signal,
      });

      parsed = repairJSON<CandidateIntelligenceOutput>(retry.text);

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
  parsed.raw_text = input.resume_text;

  return parsed;
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
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
  const education = extractEducation(lines);
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

function extractEducation(lines: string[]): CandidateIntelligenceOutput['education'] {
  return lines
    .filter((line) => /\b(BS|BA|MS|MBA|MA|PhD|Bachelor|Master|University|College)\b/i.test(line))
    .slice(0, 4)
    .map((line) => {
      const year = line.match(/\b(19|20)\d{2}\b/)?.[0];
      return {
        degree: line,
        institution: line,
        year,
      };
    });
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
