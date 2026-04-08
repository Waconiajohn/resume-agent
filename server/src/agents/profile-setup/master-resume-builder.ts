/**
 * Profile Setup — Master Resume Builder
 *
 * Pure data transformation: takes profile setup outputs and builds a master
 * resume payload, then persists it via the existing create_master_resume_atomic
 * RPC. No LLM calls.
 */

import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import type { ProfileSetupInput, IntakeAnalysis, InterviewAnswer, CareerIQProfileFull } from './types.js';

interface MasterResumeExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string;
  scope_statement?: string;
  bullets: Array<{ text: string; source: string }>;
}

interface EvidenceItem {
  text: string;
  source: 'interview';
  category: string;
  source_session_id: string;
  created_at: string;
}

interface MasterResumePayload {
  raw_text: string;
  summary: string;
  experience: MasterResumeExperience[];
  skills: Record<string, string[]>;
  education: Array<{ institution: string; degree: string; field: string; year: string }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  contact_info: { name?: string; email?: string; phone?: string; linkedin?: string; location?: string };
  evidence_items: EvidenceItem[];
}

/**
 * Transform profile setup data into a master resume payload.
 * Pure function — no side effects, no async.
 */
export function buildMasterResumePayload(
  input: ProfileSetupInput,
  intake: IntakeAnalysis,
  answers: InterviewAnswer[],
  profile: CareerIQProfileFull,
  sourceSessionId: string,
): MasterResumePayload {
  const now = new Date().toISOString();

  // 1. Map structured experience to master resume format.
  //    Entries where company === 'Education' are handled separately below.
  const experience: MasterResumeExperience[] = intake.structured_experience
    .filter((e) => e.company.toLowerCase() !== 'education')
    .map((e) => ({
      company: e.company,
      title: e.title,
      start_date: e.start_date,
      end_date: e.end_date,
      location: e.location,
      scope_statement: e.scope_statement || undefined,
      bullets: e.original_bullets.map((b) => ({ text: b, source: 'resume' as const })),
    }));

  // 2. Collect interview answers as standalone evidence items for the evidence
  //    browser and future evidence extraction. Do not promote raw interview
  //    prose directly into timeline bullets.
  const evidence_items: EvidenceItem[] = [];

  for (const answer of answers) {
    const question = intake.interview_questions[answer.question_index];
    if (!question) continue;

    // Always capture as a standalone evidence item regardless of company match.
    evidence_items.push({
      text: answer.answer,
      source: 'interview',
      category: question.what_we_are_looking_for || 'interview_response',
      source_session_id: sourceSessionId,
      created_at: now,
    });
  }

  // 3. Extract education: intake agent uses company === 'Education' as a sentinel.
  //    The prompt instructs the LLM to put the institution name in the location field,
  //    so e.location is the institution. Fall back to 'Unknown Institution' rather than
  //    e.title (which is the degree) to avoid duplicating the degree as the institution.
  const educationEntries = intake.structured_experience
    .filter((e) => e.company.toLowerCase() === 'education')
    .map((e) => ({
      institution: e.location || 'Unknown Institution',
      degree: e.title,
      field: '',
      year: e.end_date || e.start_date,
    }));

  // 4. Parse basic contact info from the first few lines of the resume text.
  const contact_info = parseContactInfo(input.resume_text);

  // 5. Parse skills section from the resume text (best-effort extraction).
  const skills = parseSkills(input.resume_text);

  // 6. Parse certifications section from the resume text.
  const certifications = parseCertifications(input.resume_text);

  // 7. Build the summary from the synthesized Why Me headline + body.
  const whyMe = profile.why_me_final;
  let summary: string;
  if (typeof whyMe === 'object' && whyMe !== null) {
    summary = [whyMe.headline, whyMe.body].filter(Boolean).join(' ');
  } else {
    logger.warn('Master resume builder: why_me_final is not an object — summary will be empty');
    summary = '';
  }

  // Filter evidence items that are too short for the Zod min(10) constraint on /resumes
  const validEvidence = evidence_items.filter((e) => e.text.length >= 10);

  return {
    raw_text: input.resume_text,
    summary,
    experience,
    skills,
    education: educationEntries,
    certifications,
    contact_info,
    evidence_items: validEvidence,
  };
}

/**
 * Persist the master resume payload using create_master_resume_atomic.
 * Failures are non-fatal — caller logs a warning and continues.
 */
export async function createInitialMasterResume(
  userId: string,
  payload: MasterResumePayload,
  sourceSessionId: string | null,
): Promise<{ success: boolean; resumeId?: string }> {
  try {
    const { data, error } = await supabaseAdmin.rpc('create_master_resume_atomic', {
      p_user_id: userId,
      p_raw_text: payload.raw_text,
      p_summary: payload.summary,
      p_experience: payload.experience,
      p_skills: payload.skills,
      p_education: payload.education,
      p_certifications: payload.certifications,
      p_contact_info: payload.contact_info,
      p_source_session_id: sourceSessionId,
      p_set_as_default: true,
      p_evidence_items: payload.evidence_items,
    });

    if (error) {
      logger.error({ userId, error: error.message }, 'PSG-4: master resume RPC error');
      return { success: false };
    }

    const resumeId =
      data !== null && typeof data === 'object' && 'id' in data
        ? String((data as Record<string, unknown>).id)
        : undefined;

    return { success: true, resumeId };
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      'PSG-4: master resume creation threw',
    );
    return { success: false };
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Extract contact info from the top of a resume.
 * Operates on the first 5 lines where name, email, phone, and location
 * typically appear.
 */
function parseContactInfo(resumeText: string): {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
} {
  const lines = resumeText.split('\n').slice(0, 5);
  const header = lines.join(' ');

  const emailMatch = header.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const phoneMatch = header.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const linkedinMatch = header.match(/linkedin\.com\/in\/[\w-]+/i);
  const locationMatch = header.match(/([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?,\s*[A-Z]{2})\b/);

  // First non-empty line is conventionally the candidate's name.
  // Skip lines that are clearly not names (common resume headers, dates, etc.)
  const NON_NAME_PATTERNS = /^(resume|curriculum\s+vitae|confidential|updated|date:|page\s+\d)/i;
  const name = lines.find((l) => {
    const t = l.trim();
    return t.length > 0 && !NON_NAME_PATTERNS.test(t);
  })?.trim();

  return {
    name: name || undefined,
    email: emailMatch?.[0] || undefined,
    phone: phoneMatch?.[0] || undefined,
    linkedin: linkedinMatch?.[0] ? `https://${linkedinMatch[0]}` : undefined,
    location: locationMatch?.[1] || undefined,
  };
}

/**
 * Extract a skills map from a SKILLS / TECHNICAL SKILLS / CORE COMPETENCIES
 * section.  Lines matching "Category: item1, item2" are parsed into entries.
 * Returns an empty object when no skills section is found.
 */
function parseSkills(resumeText: string): Record<string, string[]> {
  const skills: Record<string, string[]> = {};
  const lines = resumeText.split('\n');

  let inSkills = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS|SKILLS\s*[&]\s*EXPERTISE|SKILLS SUMMARY)$/i.test(trimmed)) {
      inSkills = true;
      continue;
    }

    // A new all-caps section header signals the end of the skills block.
    if (inSkills && /^[A-Z][A-Z\s]{2,}$/.test(trimmed) && !/^[A-Za-z]+:/.test(trimmed)) {
      break;
    }

    if (inSkills && trimmed.length > 0) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        // "Category: item1, item2" format
        const category = trimmed.substring(0, colonIdx).trim();
        const items = trimmed
          .substring(colonIdx + 1)
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (items.length > 0) {
          skills[category] = items;
        }
      } else {
        // Flat comma-separated list without a category prefix
        const items = trimmed.split(/[,;•|]/).map((s) => s.trim()).filter((s) => s.length > 0);
        if (items.length > 1) {
          const existing = skills['General'] ?? [];
          skills['General'] = [...existing, ...items];
        }
      }
    }
  }

  return skills;
}

/**
 * Extract certifications from a CERTIFICATIONS / LICENSES section.
 * Each line (with or without a leading dash) becomes one certification entry.
 * issuer and year are left empty — the user can fill them in later.
 */
function parseCertifications(resumeText: string): Array<{ name: string; issuer: string; year: string }> {
  const certs: Array<{ name: string; issuer: string; year: string }> = [];
  const lines = resumeText.split('\n');

  let inCerts = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(CERTIFICATIONS?|LICENSES?(\s+(AND|&)\s+CERTIFICATIONS?)?)$/i.test(trimmed)) {
      inCerts = true;
      continue;
    }

    // A new all-caps section header signals the end of the certs block.
    // Colon guard: don't exit on cert names that happen to be all-caps (e.g. PMP, CISSP, CPA).
    if (inCerts && /^[A-Z][A-Z\s]{2,}$/.test(trimmed) && !/^[A-Za-z]+:/.test(trimmed) && trimmed.length > 15) {
      break;
    }

    if (inCerts && trimmed.length > 0) {
      const certName = trimmed.startsWith('-') ? trimmed.substring(1).trim() : trimmed;
      if (certName.length > 0) {
        certs.push({ name: certName, issuer: '', year: '' });
      }
    }
  }

  return certs;
}
