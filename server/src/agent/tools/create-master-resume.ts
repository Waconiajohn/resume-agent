import { anthropic, MODEL } from '../../lib/anthropic.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext, MasterResumeData } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { createSessionLogger } from '../../lib/logger.js';

const STRUCTURING_PROMPT = `You are a resume parser. Extract structured data from the following resume text and return ONLY valid JSON with this exact shape:

{
  "summary": "A concise professional summary",
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "YYYY-MM or approximate",
      "end_date": "YYYY-MM or Present",
      "location": "City, State or Remote",
      "bullets": [
        { "text": "Achievement or responsibility", "source": "original" }
      ]
    }
  ],
  "skills": { "Category Name": ["skill1", "skill2"] },
  "education": [
    { "institution": "University Name", "degree": "Degree Type", "field": "Field of Study", "year": "Graduation year" }
  ],
  "certifications": [
    { "name": "Certification Name", "issuer": "Issuing Organization", "year": "Year obtained" }
  ]
}

Rules:
- Extract ALL experience entries, ordered most recent first
- Every bullet should have "source": "original"
- Group skills into logical categories
- If a field is not present, use an empty array or empty string
- Return ONLY the JSON object, no markdown fences`;

export async function executeCreateMasterResume(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ success: boolean; master_resume_id?: string; error?: string; code?: string; recoverable?: boolean }> {
  const rawText = (input.raw_text as string)?.slice(0, 30_000);

  if (!rawText?.trim()) {
    return { success: false, error: 'No resume text provided', code: 'MISSING_INPUT', recoverable: false };
  }

  let structured: Omit<MasterResumeData, 'raw_text'>;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: `${STRUCTURING_PROMPT}\n\n---\n\nRESUME TEXT:\n${rawText}` }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { success: false, error: 'Failed to parse resume — no text response', code: 'AI_PARSE_FAILED', recoverable: true };
    }

    const repaired = repairJSON<Omit<MasterResumeData, 'raw_text'>>(textBlock.text);
    if (!repaired) {
      return { success: false, error: 'Failed to parse structured resume from AI response', code: 'JSON_PARSE_FAILED', recoverable: true };
    }
    structured = repaired;
  } catch (err) {
    const log = createSessionLogger(ctx.sessionId);
    log.error({ err }, 'Resume structuring error');
    return {
      success: false,
      error: `Failed to structure resume: ${err instanceof Error ? err.message : 'Unknown error'}`,
      code: 'AI_ERROR',
      recoverable: true,
    };
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('master_resumes')
    .insert({
      user_id: ctx.userId,
      summary: structured.summary,
      experience: structured.experience,
      skills: structured.skills,
      education: structured.education,
      certifications: structured.certifications,
      raw_text: rawText,
      version: 1,
    })
    .select('id')
    .single();

  if (insertError || !data) {
    const log = createSessionLogger(ctx.sessionId);
    log.error({ error: insertError?.message }, 'Master resume insert error');
    return { success: false, error: 'Failed to save resume to database', code: 'DB_INSERT_FAILED', recoverable: true };
  }

  const resumeId = data.id as string;

  ctx.masterResumeId = resumeId;
  ctx.masterResumeData = { ...structured, raw_text: rawText };

  // Emit onboarding summary panel with parsed resume stats
  const experienceYears = structured.experience?.length
    ? Math.max(...structured.experience.map(e => {
        const year = parseInt(e.start_date);
        return isNaN(year) ? 0 : new Date().getFullYear() - year;
      }))
    : undefined;

  emit({
    type: 'right_panel_update',
    panel_type: 'onboarding_summary',
    data: {
      years_of_experience: experienceYears,
      companies_count: structured.experience?.length ?? 0,
      skills_count: Object.values(structured.skills ?? {}).flat().length,
      strengths: structured.experience?.slice(0, 3).map(e => `${e.title} at ${e.company}`) ?? [],
    },
  });

  await supabaseAdmin
    .from('coach_sessions')
    .update({ master_resume_id: resumeId })
    .eq('id', ctx.sessionId)
    .eq('user_id', ctx.userId);

  return { success: true, master_resume_id: resumeId };
}
