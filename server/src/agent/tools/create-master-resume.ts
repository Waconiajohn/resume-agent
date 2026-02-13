import { anthropic, MODEL } from '../../lib/anthropic.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import type { SessionContext, MasterResumeData } from '../context.js';

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
): Promise<{ success: boolean; master_resume_id?: string; error?: string }> {
  const rawText = input.raw_text as string;

  if (!rawText?.trim()) {
    return { success: false, error: 'No resume text provided' };
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
      return { success: false, error: 'Failed to parse resume — no text response' };
    }

    structured = JSON.parse(textBlock.text);
  } catch (err) {
    console.error('Resume structuring error:', err);
    return {
      success: false,
      error: `Failed to structure resume: ${err instanceof Error ? err.message : 'Unknown error'}`,
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
    console.error('Master resume insert error:', insertError);
    return { success: false, error: 'Failed to save resume to database' };
  }

  const resumeId = data.id as string;

  ctx.masterResumeId = resumeId;
  ctx.masterResumeData = { ...structured, raw_text: rawText };

  await supabaseAdmin
    .from('coach_sessions')
    .update({ master_resume_id: resumeId })
    .eq('id', ctx.sessionId);

  return { success: true, master_resume_id: resumeId };
}
