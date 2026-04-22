/**
 * resume-v3-export — Converts V3 pipeline output to the FinalResume shape the
 * DOCX/PDF export libs expect.
 *
 * V3 splits its output across two objects:
 *   - `structured` holds the parsed source resume (contact, education, certs,
 *     skills, custom sections).
 *   - `written` holds the tailored pipeline output (summary, coreCompetencies,
 *     selectedAccomplishments, positions[].bullets).
 *
 * Contact + education + certifications always come from `structured` (the
 * pipeline doesn't rewrite these). Summary + bullets + competencies come from
 * `written`. Position metadata (title/company/dates) comes from `written` when
 * present — v3 keeps those aligned with the source — so we trust the written
 * side for the exported experience section.
 *
 * The FinalResume contract and downstream renderers (export-docx, export-pdf)
 * are shared with v2, so mapping unknowns into `_raw_sections` keeps
 * template-level rendering consistent between v2 and v3 for things the
 * FinalResume schema does not formalize (scope statements, custom sections).
 */

import type {
  V3StructuredResume,
  V3WrittenResume,
} from '@/hooks/useV3Pipeline';
import type {
  FinalResume,
  ContactInfo,
  MasterResumeExperience,
  MasterResumeEducation,
  MasterResumeCertification,
} from '@/types/resume';

export function v3ToFinalResume(
  structured: V3StructuredResume,
  written: V3WrittenResume,
  opts?: {
    companyName?: string;
    jobTitle?: string;
    atsScore?: number;
  },
): FinalResume {
  const contact: ContactInfo = {
    name: structured.contact.fullName,
    email: structured.contact.email ?? undefined,
    phone: structured.contact.phone ?? undefined,
    linkedin: structured.contact.linkedin ?? undefined,
    location: structured.contact.location ?? undefined,
  };

  // Experience is drawn from the written side — it carries the tailored
  // bullets and scopes. Date display is preserved via the DateRange.raw string
  // to match what the user saw on screen.
  const experience: MasterResumeExperience[] = written.positions.map((p) => ({
    company: p.company,
    title: p.title,
    start_date: p.dates.start ?? '',
    end_date: p.dates.end ?? '',
    location: '',
    scope_statement: p.scope ?? undefined,
    bullets: p.bullets.map((b) => ({
      text: b.text,
      source: b.is_new ? 'crafted' : 'verbatim',
    })),
  }));

  const education: MasterResumeEducation[] = structured.education.map((ed) => ({
    institution: ed.institution,
    degree: ed.degree,
    field: '',
    year: ed.graduationYear ?? '',
  }));

  const certifications: MasterResumeCertification[] = structured.certifications.map((c) => ({
    name: c.name,
    issuer: c.issuer ?? '',
    year: c.year ?? '',
  }));

  // Skills — v3 emits `coreCompetencies` on the written side; fall back to
  // `structured.skills` if the written list is empty.
  const skills: Record<string, string[]> = {};
  if (written.coreCompetencies.length > 0) {
    skills['Core Competencies'] = written.coreCompetencies;
  } else if (structured.skills.length > 0) {
    skills['Skills'] = structured.skills;
  }

  // Raw section fallbacks: template renderers read these when the schema
  // doesn't carry the data (e.g. scope statements, custom sections).
  const rawSections: Record<string, string> = {};
  rawSections['executive_summary'] = written.summary;

  if (written.coreCompetencies.length > 0) {
    rawSections['core_competencies'] = written.coreCompetencies.join(' | ');
  }

  if (written.selectedAccomplishments.length > 0) {
    rawSections['selected_accomplishments'] = written.selectedAccomplishments
      .map((a) => `• ${a}`)
      .join('\n');
  }

  written.positions.forEach((p, i) => {
    if (p.scope) rawSections[`experience_scope_${i}`] = p.scope;
  });

  written.customSections.forEach((cs) => {
    const body = cs.entries.map((e) => `• ${e.text}`).join('\n');
    if (body) rawSections[cs.title] = body;
  });

  return {
    summary: written.summary,
    experience,
    skills,
    education,
    certifications,
    selected_accomplishments:
      written.selectedAccomplishments.length > 0
        ? written.selectedAccomplishments.join('\n')
        : undefined,
    ats_score: opts?.atsScore ?? 0,
    contact_info: contact,
    company_name: opts?.companyName,
    job_title: opts?.jobTitle,
    _raw_sections: rawSections,
  };
}
