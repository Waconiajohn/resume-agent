// Adapt a v3 StructuredResume (classify output) into a master_resumes
// payload for first-time auto-initialization.
//
// Called from the pipeline after classify completes when the user has no
// default master resume yet. Produces the payload shape expected by
// `create_master_resume_atomic` RPC — which also drives POST /api/resumes.

import type { StructuredResume } from '../types.js';
import type {
  V3MasterContactInfo,
  V3MasterExperienceRow,
  V3MasterEducationRow,
  V3MasterCertificationRow,
  V3MasterEvidenceItem,
} from './types.js';

export interface V3CreateMasterPayload {
  raw_text: string;
  summary: string;
  experience: V3MasterExperienceRow[];
  skills: Record<string, string[]>;
  education: V3MasterEducationRow[];
  certifications: V3MasterCertificationRow[];
  contact_info: V3MasterContactInfo;
  source_session_id: string | null;
  set_as_default: boolean;
  evidence_items: V3MasterEvidenceItem[];
}

export interface AdaptClassifyToMasterOptions {
  sessionId: string;
  setAsDefault?: boolean;
  /**
   * Optional v3 summary text, if strategize/write has already produced one.
   * When omitted, we synthesize a thin summary from the candidate's
   * discipline + first position's scope (keeps the master viewable in the UI
   * before any write has happened).
   */
  summaryOverride?: string;
}

export function adaptStructuredResumeToMaster(
  resume: StructuredResume,
  opts: AdaptClassifyToMasterOptions,
): V3CreateMasterPayload {
  const contactInfo: V3MasterContactInfo = {
    name: resume.contact.fullName,
    ...(resume.contact.email ? { email: resume.contact.email } : {}),
    ...(resume.contact.phone ? { phone: resume.contact.phone } : {}),
    ...(resume.contact.linkedin ? { linkedin: resume.contact.linkedin } : {}),
    ...(resume.contact.location ? { location: resume.contact.location } : {}),
  };

  const experience: V3MasterExperienceRow[] = resume.positions.map((p) => ({
    company: p.company,
    title: p.title,
    start_date: p.dates.start ?? null,
    end_date: p.dates.end ?? null,
    location: p.location ?? null,
    scope_statement: p.scope ?? null,
    bullets: p.bullets.map((b) => ({
      text: b.text,
      source: 'resume' as const,
    })),
  }));

  const education: V3MasterEducationRow[] = resume.education.map((e) => ({
    degree: e.degree,
    institution: e.institution,
    location: e.location ?? null,
    year: e.graduationYear ?? null,
    notes: e.notes ?? null,
  }));

  const certifications: V3MasterCertificationRow[] = resume.certifications.map((c) => ({
    name: c.name,
    issuer: c.issuer ?? null,
    year: c.year ?? null,
  }));

  // Skills live flat on StructuredResume. master_resumes.skills is a
  // category → [names] map; bucket everything under a default "Skills" key
  // so the UI renders consistently. Future: classify or a post-process
  // could categorize.
  const skills: Record<string, string[]> = resume.skills.length > 0
    ? { Skills: [...resume.skills] }
    : {};

  // Initialize evidence_items from crossRoleHighlights so the vault starts
  // with the candidate's self-described wins. Each highlight gets a stable
  // category so future dedup logic can identify them.
  const evidenceItems: V3MasterEvidenceItem[] = resume.crossRoleHighlights.map((h) => ({
    text: h.text,
    source: 'crafted' as const,
    category: 'cross_role_highlight',
    source_session_id: opts.sessionId,
    created_at: new Date().toISOString(),
  }));

  const summary = opts.summaryOverride
    ?? buildThinSummary(resume);

  const rawText = buildRawTextRollup({
    summary,
    contactInfo,
    experience,
    education,
    certifications,
    skills,
  });

  return {
    raw_text: rawText,
    summary,
    experience,
    skills,
    education,
    certifications,
    contact_info: contactInfo,
    source_session_id: null, // v3 pipeline is session-less; rows still link via evidence_items
    set_as_default: opts.setAsDefault ?? true,
    evidence_items: evidenceItems,
  };
}

/**
 * Build a thin, placeholder-style summary when strategize hasn't produced
 * one yet. Useful for the first-run auto-init path where the master is
 * created immediately after classify.
 */
function buildThinSummary(resume: StructuredResume): string {
  const discipline = resume.discipline?.trim();
  const firstScope = resume.positions[0]?.scope?.trim();
  if (discipline && firstScope) {
    return `${discipline}. ${firstScope}`;
  }
  if (discipline) return discipline;
  if (firstScope) return firstScope;
  return 'Senior professional.';
}

/**
 * Build a plain-text rollup of the structured content for
 * `master_resumes.raw_text`. Used by full-text search and as a fallback for
 * legacy consumers that read raw_text instead of structured columns.
 */
function buildRawTextRollup(parts: {
  summary: string;
  contactInfo: V3MasterContactInfo;
  experience: V3MasterExperienceRow[];
  education: V3MasterEducationRow[];
  certifications: V3MasterCertificationRow[];
  skills: Record<string, string[]>;
}): string {
  const lines: string[] = [];
  if (parts.contactInfo.name) lines.push(parts.contactInfo.name);
  const contactLine = [
    parts.contactInfo.email,
    parts.contactInfo.phone,
    parts.contactInfo.linkedin,
    parts.contactInfo.location,
  ].filter(Boolean).join(' · ');
  if (contactLine) lines.push(contactLine);
  if (parts.summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(parts.summary);
  }
  if (parts.experience.length > 0) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const role of parts.experience) {
      const dateRange = [role.start_date, role.end_date].filter(Boolean).join(' – ');
      lines.push(`${role.company} — ${role.title}${dateRange ? ` (${dateRange})` : ''}`);
      if (role.scope_statement) lines.push(role.scope_statement);
      for (const b of role.bullets) {
        lines.push(`• ${b.text}`);
      }
      lines.push('');
    }
  }
  if (parts.education.length > 0) {
    lines.push('EDUCATION');
    for (const e of parts.education) {
      lines.push(`${e.degree} — ${e.institution}${e.year ? ` (${e.year})` : ''}`);
    }
    lines.push('');
  }
  if (parts.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const c of parts.certifications) {
      lines.push([c.name, c.issuer, c.year].filter(Boolean).join(' · '));
    }
    lines.push('');
  }
  for (const [cat, list] of Object.entries(parts.skills)) {
    if (list.length === 0) continue;
    lines.push(`${cat.toUpperCase()}: ${list.join(', ')}`);
  }
  return lines.join('\n').trim();
}
