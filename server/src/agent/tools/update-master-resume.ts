import { supabaseAdmin } from '../../lib/supabase.js';
import type { SessionContext } from '../context.js';
import { createSessionLogger } from '../../lib/logger.js';

export async function executeUpdateMasterResume(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ success: boolean; changes_applied: number; new_version: number; error?: string; code?: string; recoverable?: boolean }> {
  const masterResumeId = input.master_resume_id as string;
  const changes = input.changes as Array<{
    section: string;
    action: string;
    path: string;
    content: string;
    reasoning: string;
  }>;

  const { data: resume, error: loadError } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('id', masterResumeId)
    .eq('user_id', ctx.userId)
    .single();

  if (loadError || !resume) {
    return { success: false, changes_applied: 0, new_version: 0, error: 'Master resume not found', code: 'RESUME_NOT_FOUND', recoverable: false };
  }

  const log = createSessionLogger(ctx.sessionId);

  let appliedCount = 0;
  const resumeData = { ...resume } as Record<string, unknown>;

  for (const change of changes) {
    try {
      applyChange(resumeData, change);
      appliedCount++;
    } catch (e) {
      log.error({ path: change.path, err: e }, 'Failed to apply resume change');
    }
  }

  const newVersion = ((resume as Record<string, unknown>).version as number ?? 1) + 1;

  const { error: saveError } = await supabaseAdmin
    .from('master_resumes')
    .update({
      summary: resumeData.summary,
      experience: resumeData.experience,
      skills: resumeData.skills,
      education: resumeData.education,
      certifications: resumeData.certifications,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', masterResumeId)
    .eq('user_id', ctx.userId);

  if (saveError) {
    log.error({ error: saveError.message }, 'Master resume update error');
    return { success: false, changes_applied: 0, new_version: (resume as Record<string, unknown>).version as number, error: 'Failed to save resume updates', code: 'RESUME_UPDATE_FAILED', recoverable: true };
  }

  const { error: historyError } = await supabaseAdmin.from('master_resume_history').insert({
    master_resume_id: masterResumeId,
    job_application_id: ctx.jobApplicationId,
    changes_summary: `Applied ${appliedCount} changes from coach session`,
    changes_detail: { changes, session_id: ctx.sessionId },
  });
  if (historyError) {
    log.error({ error: historyError.message }, 'Failed to save resume change history');
  }

  return { success: true, changes_applied: appliedCount, new_version: newVersion };
}

function applyChange(
  resume: Record<string, unknown>,
  change: { section: string; action: string; path: string; content: string },
) {
  const { section, action, content } = change;

  if (section === 'summary' && action === 'update') {
    resume.summary = content;
    return;
  }

  if (section === 'experience') {
    const experience = resume.experience as Array<Record<string, unknown>>;
    if (!experience) return;

    const indexMatch = change.path.match(/experience\[(\d+)\]/);
    if (!indexMatch) return;

    const expIndex = parseInt(indexMatch[1]);
    if (expIndex >= experience.length) return;

    if (action === 'update' && change.path.includes('bullets')) {
      try {
        const parsed = JSON.parse(content) as Array<{ text: string; source: string }>;
        experience[expIndex].bullets = parsed;
      } catch {
        // Failed to parse bullets content — skip this change
      }
    } else if (action === 'add' && change.path.includes('bullets')) {
      const bullets = (experience[expIndex].bullets ?? []) as Array<{ text: string; source: string }>;
      bullets.push({ text: content, source: 'coach_session' });
      experience[expIndex].bullets = bullets;
    }
  }

  if (section === 'skills') {
    const skills = (resume.skills ?? {}) as Record<string, string[]>;
    if (action === 'add') {
      const categories = Object.keys(skills);
      const targetCategory = categories[0] ?? 'Additional Skills';
      if (!skills[targetCategory]) skills[targetCategory] = [];
      if (!skills[targetCategory].includes(content)) {
        skills[targetCategory].push(content);
      }
    }
    resume.skills = skills;
  }

  if (section === 'education') {
    const education = (resume.education ?? []) as Array<Record<string, string>>;
    if (action === 'add') {
      try {
        const entry = JSON.parse(content) as Record<string, string>;
        education.push({
          institution: entry.institution ?? '',
          degree: entry.degree ?? '',
          field: entry.field ?? '',
          year: entry.year ?? '',
        });
      } catch {
        education.push({ institution: content, degree: '', field: '', year: '' });
      }
    } else if (action === 'update') {
      const indexMatch = change.path.match(/education\[(\d+)\]/);
      if (indexMatch) {
        const idx = parseInt(indexMatch[1]);
        if (idx < education.length) {
          try {
            const entry = JSON.parse(content) as Record<string, string>;
            education[idx] = { ...education[idx], ...entry };
          } catch {
            // Failed to parse education update content — skip
          }
        }
      }
    }
    resume.education = education;
  }

  if (section === 'certifications') {
    const certifications = (resume.certifications ?? []) as Array<Record<string, string>>;
    if (action === 'add') {
      try {
        const entry = JSON.parse(content) as Record<string, string>;
        certifications.push({
          name: entry.name ?? '',
          issuer: entry.issuer ?? '',
          year: entry.year ?? '',
        });
      } catch {
        certifications.push({ name: content, issuer: '', year: '' });
      }
    } else if (action === 'update') {
      const indexMatch = change.path.match(/certifications\[(\d+)\]/);
      if (indexMatch) {
        const idx = parseInt(indexMatch[1]);
        if (idx < certifications.length) {
          try {
            const entry = JSON.parse(content) as Record<string, string>;
            certifications[idx] = { ...certifications[idx], ...entry };
          } catch {
            // Failed to parse certification update content — skip
          }
        }
      }
    }
    resume.certifications = certifications;
  }
}
