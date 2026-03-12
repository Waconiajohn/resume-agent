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
  const response = await llm.chat({
    model: MODEL_MID,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Parse this resume into a structured candidate profile:\n\n${input.resume_text}` },
    ],
    max_tokens: 4096,
    signal,
  });

  const parsed = repairJSON<CandidateIntelligenceOutput>(response.text);
  if (!parsed) throw new Error('Candidate Intelligence agent returned unparseable response');

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
