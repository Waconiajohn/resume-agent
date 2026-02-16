import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { repairJSON } from '../../lib/json-repair.js';

export async function executeExportResume(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ success: boolean; error?: string; code?: string; recoverable?: boolean }> {
  const atsScore = (input.ats_score as number) || 0;
  const requirementsAddressed = (input.requirements_addressed as number) || 0;
  const sectionsRewritten = (input.sections_rewritten as number) || 0;

  if (!ctx.masterResumeData) {
    return { success: false, error: 'No master resume data available for export', code: 'MISSING_RESUME', recoverable: false };
  }

  const base = ctx.masterResumeData;
  const tailored = ctx.tailoredSections;

  const summary = tailored?.summary ?? base.summary;
  const selectedAccomplishments = tailored?.selected_accomplishments;

  // Guard: propose_section_edit sometimes stores raw AI text (string) instead of a structured array
  let resolvedExperience: unknown = tailored?.experience;
  if (typeof resolvedExperience === 'string') {
    const parsed = repairJSON<Record<string, unknown>>(resolvedExperience);
    if (parsed?.proposed_content && Array.isArray(parsed.proposed_content)) {
      resolvedExperience = parsed.proposed_content;
    } else if (Array.isArray(parsed)) {
      resolvedExperience = parsed;
    } else {
      resolvedExperience = undefined; // Can't convert — fall back to base
    }
  }

  // Same guard for skills
  let resolvedSkills: unknown = tailored?.skills;
  if (typeof resolvedSkills === 'string') {
    const parsed = repairJSON<Record<string, unknown>>(resolvedSkills);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      resolvedSkills = parsed.proposed_content ?? parsed;
    } else {
      resolvedSkills = undefined;
    }
  }

  const experience = (Array.isArray(resolvedExperience) && resolvedExperience.length > 0
    ? (resolvedExperience as Array<Record<string, unknown>>)
    : base.experience ?? []
  ).map((exp) => ({
    company: (exp.company as string) ?? '',
    title: (exp.title as string) ?? '',
    start_date: (exp.start_date as string) ?? '',
    end_date: (exp.end_date as string) ?? '',
    location: (exp.location as string) ?? '',
    bullets: ((exp.bullets as Array<{ text: string; source: string }>) ?? []).map((b) => ({
      text: b.text ?? '',
      source: b.source ?? 'original',
    })),
  }));

  const skills = { ...(base.skills ?? {}) };
  const skillsSource = (resolvedSkills && typeof resolvedSkills === 'object' && !Array.isArray(resolvedSkills))
    ? resolvedSkills as Record<string, unknown>
    : tailored?.skills;
  if (skillsSource && typeof skillsSource === 'object' && !Array.isArray(skillsSource)) {
    for (const [category, items] of Object.entries(skillsSource as Record<string, string[]>)) {
      skills[category] = items;
    }
  }

  if (tailored?.title_adjustments) {
    for (const exp of experience) {
      const adjusted = tailored.title_adjustments[exp.title];
      if (adjusted) {
        exp.title = adjusted;
      }
    }
  }

  const education = (base.education ?? []).map((edu) => ({
    institution: edu.institution ?? '',
    degree: edu.degree ?? '',
    field: edu.field ?? '',
    year: edu.year ?? '',
  }));

  const certifications = (base.certifications ?? []).map((cert) => ({
    name: cert.name ?? '',
    issuer: cert.issuer ?? '',
    year: cert.year ?? '',
  }));

  // Extract section_order from selected design choice
  const selectedDesign = ctx.designChoices.find(d => d.selected);
  const sectionOrder = selectedDesign?.section_order;

  const resumeData = {
    summary,
    selected_accomplishments: selectedAccomplishments,
    experience,
    skills,
    education,
    certifications,
    ats_score: atsScore,
    contact_info: ctx.masterResumeData.contact_info,
    section_order: sectionOrder,
    company_name: ctx.companyResearch.company_name,
    job_title: ctx.jdAnalysis.job_title,
  };

  emit({ type: 'export_ready', resume: resumeData });

  // Persist resume in panel data so it survives SSE reconnect
  ctx.lastPanelType = 'completion';
  ctx.lastPanelData = {
    resume: resumeData,
    ats_score: atsScore,
    requirements_addressed: requirementsAddressed,
    sections_rewritten: sectionsRewritten,
  };

  emit({
    type: 'complete',
    ats_score: atsScore,
    requirements_addressed: requirementsAddressed,
    sections_rewritten: sectionsRewritten,
  });

  return { success: true };
}
