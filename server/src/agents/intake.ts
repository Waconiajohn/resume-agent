/**
 * Agent 1: Intake Agent
 *
 * Parses raw resume text into structured data. Pure extraction — no strategic decisions.
 * Uses MODEL_LIGHT (free tier).
 */

import { llm, MODEL_LIGHT } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import type { IntakeInput, IntakeOutput, ExperienceEntry, EducationEntry } from './types.js';

const PARSE_PROMPT = `You are a resume parser. Extract structured data from the following resume text and return ONLY valid JSON with this exact shape:

{
  "contact": {
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "+1-555-123-4567",
    "linkedin": "linkedin.com/in/username",
    "location": "City, State"
  },
  "summary": "The existing professional summary text, verbatim",
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "2019",
      "end_date": "Present",
      "bullets": [
        "Achievement or responsibility bullet point"
      ],
      "inferred_scope": {
        "team_size": "22 direct reports",
        "budget": "$4.2M",
        "geography": "North America"
      }
    }
  ],
  "skills": ["skill1", "skill2", "skill3"],
  "education": [
    { "degree": "BS Computer Science", "institution": "MIT", "year": "2005" }
  ],
  "certifications": ["PMP", "AWS Solutions Architect"]
}

Rules:
- Extract contact info from the resume header. Name is typically the first line.
- Extract ALL experience entries, ordered most recent first.
- For each experience entry, infer scope if mentioned (team size, budget/revenue, geography).
  Only include inferred_scope fields that are explicitly stated or clearly implied.
- Preserve bullet points verbatim — do not rewrite or summarize them.
- Skills should be a flat array of individual skills (not categorized).
- Education year is the graduation year if visible. Omit year field if not found.
- Certifications as a flat array of names.
- If a field is not present in the resume, use empty string or empty array.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

/**
 * Run the Intake Agent: parse raw resume text into structured data.
 */
export async function runIntakeAgent(input: IntakeInput): Promise<IntakeOutput> {
  const rawText = input.raw_resume_text.slice(0, 30_000);

  if (!rawText.trim()) {
    throw new Error('No resume text provided');
  }

  const response = await llm.chat({
    model: MODEL_LIGHT,
    max_tokens: 8192,
    system: PARSE_PROMPT,
    messages: [{ role: 'user', content: `RESUME TEXT:\n${rawText}` }],
  });

  if (!response.text) {
    throw new Error('Intake Agent: LLM returned empty response');
  }

  const parsed = repairJSON<Record<string, unknown>>(response.text);
  if (!parsed) {
    throw new Error('Intake Agent: failed to parse JSON from LLM response');
  }

  // Validate and normalize contact info
  const rawContact = (parsed.contact ?? parsed.contact_info ?? {}) as Record<string, unknown>;
  const contact = {
    name: sanitizeString(rawContact.name, 200),
    email: sanitizeString(rawContact.email, 200),
    phone: sanitizeString(rawContact.phone, 50),
    location: sanitizeString(rawContact.location, 200),
    ...(rawContact.linkedin ? { linkedin: sanitizeString(rawContact.linkedin, 300) } : {}),
  };

  // Fallback: if name is empty, try first line of resume
  if (!contact.name && rawText) {
    const firstLine = rawText.split('\n').find(l => l.trim())?.trim() ?? '';
    if (firstLine.length > 1 && firstLine.length < 60 && !/[@()\d{4,}http]/.test(firstLine)) {
      contact.name = firstLine;
    }
  }

  // Normalize experience entries
  const rawExperience = (parsed.experience ?? []) as Record<string, unknown>[];
  const experience: ExperienceEntry[] = rawExperience.map(e => ({
    company: String(e.company ?? ''),
    title: String(e.title ?? ''),
    start_date: String(e.start_date ?? ''),
    end_date: String(e.end_date ?? ''),
    bullets: normalizeBullets(e.bullets),
    ...(e.inferred_scope ? { inferred_scope: normalizeScope(e.inferred_scope) } : {}),
  }));

  // Normalize skills to flat array
  const rawSkills = parsed.skills;
  let skills: string[];
  if (Array.isArray(rawSkills)) {
    skills = rawSkills.map(s => String(s)).filter(Boolean);
  } else if (rawSkills && typeof rawSkills === 'object') {
    // Handle categorized skills: { "Category": ["skill1", "skill2"] }
    skills = Object.values(rawSkills as Record<string, unknown>)
      .flat()
      .map(s => String(s))
      .filter(Boolean);
  } else {
    skills = [];
  }

  // Normalize education
  const rawEducation = (parsed.education ?? []) as Record<string, unknown>[];
  const education: EducationEntry[] = rawEducation.map(e => ({
    degree: String(e.degree ?? e.field ?? ''),
    institution: String(e.institution ?? ''),
    ...(e.year ? { year: String(e.year) } : {}),
  }));

  // Normalize certifications to flat array
  const rawCerts = parsed.certifications;
  let certifications: string[];
  if (Array.isArray(rawCerts)) {
    certifications = rawCerts.map(c => {
      if (typeof c === 'string') return c;
      if (typeof c === 'object' && c !== null) return String((c as Record<string, unknown>).name ?? '');
      return '';
    }).filter(Boolean);
  } else {
    certifications = [];
  }

  // Calculate career span — use regex to extract 4-digit year from date strings
  // that may include month names (e.g. "Jan 2018", "March 2022 – Present")
  const extractYear = (dateStr: string): number => {
    const match = dateStr.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : NaN;
  };
  const years = experience
    .flatMap(e => [extractYear(e.start_date), extractYear(e.end_date)])
    .filter(y => !isNaN(y) && y > 1950 && y <= new Date().getFullYear() + 1);
  const career_span_years = years.length >= 2
    ? Math.max(...years) - Math.min(...years)
    : 0;

  return {
    contact,
    summary: String(parsed.summary ?? ''),
    experience,
    skills,
    education,
    certifications,
    career_span_years,
    raw_text: rawText,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function normalizeBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(b => {
    if (typeof b === 'string') return b;
    if (typeof b === 'object' && b !== null) return String((b as Record<string, unknown>).text ?? '');
    return '';
  }).filter(Boolean);
}

function normalizeScope(raw: unknown): ExperienceEntry['inferred_scope'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const scope: ExperienceEntry['inferred_scope'] = {};
  if (s.team_size) scope.team_size = String(s.team_size);
  if (s.budget) scope.budget = String(s.budget);
  if (s.geography) scope.geography = String(s.geography);
  return Object.keys(scope).length > 0 ? scope : undefined;
}
