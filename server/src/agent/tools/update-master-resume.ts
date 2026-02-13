import { supabaseAdmin } from '../../lib/supabase.js';
import type { SessionContext } from '../context.js';

export async function executeUpdateMasterResume(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ success: boolean; changes_applied: number; new_version: number }> {
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
    .single();

  if (loadError || !resume) {
    return { success: false, changes_applied: 0, new_version: 0 };
  }

  let appliedCount = 0;
  const resumeData = { ...resume } as Record<string, unknown>;

  for (const change of changes) {
    try {
      applyChange(resumeData, change);
      appliedCount++;
    } catch (e) {
      console.error(`Failed to apply change to ${change.path}:`, e);
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
    .eq('id', masterResumeId);

  if (saveError) {
    console.error('Master resume update error:', saveError);
    return { success: false, changes_applied: 0, new_version: (resume as Record<string, unknown>).version as number };
  }

  await supabaseAdmin.from('master_resume_history').insert({
    master_resume_id: masterResumeId,
    job_application_id: ctx.jobApplicationId,
    changes_summary: `Applied ${appliedCount} changes from coach session`,
    changes_detail: { changes, session_id: ctx.sessionId },
  });

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

    if (action === 'add' && change.path.includes('bullets')) {
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
}
