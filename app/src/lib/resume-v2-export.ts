/**
 * resume-v2-export — Converts ResumeDraft (v2 pipeline) to FinalResume (export libs)
 */

import type { ResumeDraft } from '@/types/resume-v2';
import type { FinalResume, ContactInfo, MasterResumeExperience, MasterResumeEducation } from '@/types/resume';

export function resumeDraftToFinalResume(draft: ResumeDraft, opts?: {
  companyName?: string;
  jobTitle?: string;
  atsScore?: number;
}): FinalResume {
  const contact: ContactInfo = {
    name: draft.header.name,
    email: draft.header.email,
    phone: draft.header.phone,
    linkedin: draft.header.linkedin,
  };

  const experience: MasterResumeExperience[] = draft.professional_experience.map(exp => ({
    company: exp.company,
    title: exp.title,
    start_date: exp.start_date,
    end_date: exp.end_date,
    location: '',
    bullets: exp.bullets.map(b => ({ text: b.text, source: 'crafted' })),
  }));

  const education: MasterResumeEducation[] = draft.education.map(ed => ({
    institution: ed.institution,
    degree: ed.degree,
    field: '',
    year: ed.year ?? '',
  }));

  const certifications = draft.certifications.map(c => ({
    name: c,
    issuer: '',
    year: '',
  }));

  // Build raw sections for the export libs' fallback paths
  const rawSections: Record<string, string> = {};

  // Branded title as a subtitle
  if (draft.header.branded_title) {
    rawSections['branded_title'] = draft.header.branded_title;
  }

  // Executive summary
  rawSections['executive_summary'] = draft.executive_summary.content;

  // Core competencies
  if (draft.core_competencies.length > 0) {
    rawSections['core_competencies'] = draft.core_competencies.join(' | ');
  }

  // Selected accomplishments
  if (draft.selected_accomplishments.length > 0) {
    rawSections['selected_accomplishments'] = draft.selected_accomplishments
      .map(a => `• ${a.content}`)
      .join('\n');
  }

  // Scope statements (not in FinalResume experience.bullets — inject into raw)
  draft.professional_experience.forEach((exp, i) => {
    if (exp.scope_statement) {
      rawSections[`experience_scope_${i}`] = exp.scope_statement;
    }
  });

  // Earlier career
  if (draft.earlier_career && draft.earlier_career.length > 0) {
    rawSections['earlier_career'] = draft.earlier_career
      .map(ec => `${ec.title}, ${ec.company} (${ec.dates})`)
      .join('\n');
  }

  const skills: Record<string, string[]> = {};
  if (draft.core_competencies.length > 0) {
    skills['Core Competencies'] = draft.core_competencies;
  }

  return {
    summary: draft.executive_summary.content,
    experience,
    skills,
    education,
    certifications,
    selected_accomplishments: draft.selected_accomplishments.length > 0
      ? draft.selected_accomplishments.map(a => a.content).join('\n')
      : undefined,
    ats_score: opts?.atsScore ?? 0,
    contact_info: contact,
    company_name: opts?.companyName,
    job_title: opts?.jobTitle,
    _raw_sections: rawSections,
  };
}
