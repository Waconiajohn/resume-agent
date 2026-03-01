import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { requireFeature } from '../middleware/feature-guard.js';
import logger from '../lib/logger.js';
import { parsePositiveInt, parseJsonBodyWithLimit } from '../lib/http-body-guard.js';

const createResumeSchema = z.object({
  raw_text: z.string().min(1).max(100_000),
  summary: z.string().max(5000).optional(),
  experience: z.array(z.unknown()).max(50).optional(),
  skills: z.record(z.string(), z.array(z.string())).optional(),
  education: z.array(z.unknown()).max(20).optional(),
  certifications: z.array(z.unknown()).max(50).optional(),
  contact_info: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    location: z.string().optional(),
  }).optional(),
  set_as_default: z.boolean().optional(),
  source_session_id: z.string().uuid().optional(),
  evidence_items: z.array(z.object({
    text: z.string().min(10).max(2000),
    source: z.enum(['crafted', 'upgraded', 'interview']),
    category: z.string().max(100).optional(),
    source_session_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })).max(200).optional(),
});

type DefaultResumeRpcResult = {
  ok?: boolean;
  error?: string;
  resume_id?: string;
  new_default_resume_id?: string | null;
};

type CreateResumeRpcResult = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

const resumes = new Hono();

resumes.use('*', authMiddleware);

const MAX_CREATE_RESUME_BODY_BYTES = parsePositiveInt(process.env.MAX_CREATE_RESUME_BODY_BYTES, 220_000);

// GET /resumes — List user's master resumes
resumes.get('/', async (c) => {
  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('master_resumes')
    .select('id, summary, version, is_default, source_session_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return c.json({ error: 'Failed to load resumes' }, 500);
  }

  return c.json({ resumes: data });
});

// GET /resumes/default — Get user's default base resume (or most recent fallback)
resumes.get('/default', async (c) => {
  const user = c.get('user');

  const { data: explicitDefault, error: defaultError } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (defaultError) {
    logger.error({ error: defaultError.message }, 'Failed to load default resume');
    return c.json({ error: 'Failed to load default resume' }, 500);
  }

  if (explicitDefault) {
    return c.json({ resume: explicitDefault });
  }

  const { data: latest, error: latestError } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    logger.error({ error: latestError.message }, 'Failed to load fallback resume');
    return c.json({ error: 'Failed to load resume' }, 500);
  }

  return c.json({ resume: latest ?? null });
});

// GET /resumes/:id/history — Get version history for a master resume
resumes.get('/:id/history', async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');
  if (!isValidUuid(resumeId)) return c.json({ error: 'Invalid resume id' }, 400);

  // Verify ownership
  const { data: resume, error: resumeError } = await supabaseAdmin
    .from('master_resumes')
    .select('id')
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .single();

  if (resumeError || !resume) {
    return c.json({ error: 'Resume not found' }, 404);
  }

  const { data: history, error: historyError } = await supabaseAdmin
    .from('master_resume_history')
    .select('id, master_resume_id, changes_summary, changes_detail, created_at')
    .eq('master_resume_id', resumeId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (historyError) {
    logger.error({ resumeId, error: historyError.message }, 'Failed to load resume history');
    return c.json({ error: 'Failed to load history' }, 500);
  }

  return c.json({ history: history ?? [] });
});

// GET /resumes/:id — Get a master resume
resumes.get('/:id', async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');
  if (!isValidUuid(resumeId)) return c.json({ error: 'Invalid resume id' }, 400);

  const { data, error } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return c.json({ error: 'Resume not found' }, 404);
  }

  return c.json({ resume: data });
});

const updateResumeSchema = z.object({
  summary: z.string().max(5000).optional(),
  experience: z.array(z.unknown()).max(50).optional(),
  skills: z.record(z.string(), z.array(z.string())).optional(),
  education: z.array(z.unknown()).max(20).optional(),
  certifications: z.array(z.unknown()).max(50).optional(),
  evidence_items: z.array(z.object({
    text: z.string().min(10).max(2000),
    source: z.enum(['crafted', 'upgraded', 'interview']),
    category: z.string().max(100).optional(),
    source_session_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })).max(200).optional(),
  contact_info: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    location: z.string().optional(),
  }).optional(),
});

// PUT /resumes/:id — Update a master resume (partial)
resumes.put('/:id', rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');
  if (!isValidUuid(resumeId)) return c.json({ error: 'Invalid resume id' }, 400);

  const parsedBody = await parseJsonBodyWithLimit(c, MAX_CREATE_RESUME_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = updateResumeSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }

  // Load current resume + verify ownership
  const { data: existing, error: loadError } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .single();

  if (loadError || !existing) {
    return c.json({ error: 'Resume not found' }, 404);
  }

  const changes = parsed.data;
  const changedFields = Object.keys(changes).filter((k) => changes[k as keyof typeof changes] !== undefined);
  if (changedFields.length === 0) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  const newVersion = ((existing as Record<string, unknown>).version as number ?? 1) + 1;

  // Build update payload
  const updatePayload: Record<string, unknown> = { version: newVersion, updated_at: new Date().toISOString() };
  for (const field of changedFields) {
    updatePayload[field] = changes[field as keyof typeof changes];
  }

  // If experience/skills/education/certifications/summary changed, rebuild raw_text
  if (changes.summary !== undefined || changes.experience !== undefined || changes.skills !== undefined || changes.education !== undefined || changes.certifications !== undefined) {
    const existingRow = existing as Record<string, unknown>;
    const parts: string[] = [];
    const summary = changes.summary ?? existingRow.summary;
    if (summary) parts.push(summary as string);
    const experience = (changes.experience ?? existingRow.experience) as Array<{ company?: string; title?: string; bullets?: Array<{ text?: string }> }>;
    if (Array.isArray(experience)) {
      for (const role of experience) {
        parts.push(`${role.company ?? ''} — ${role.title ?? ''}`);
        if (Array.isArray(role.bullets)) {
          for (const b of role.bullets) {
            if (typeof b?.text === 'string') parts.push(`• ${b.text}`);
          }
        }
      }
    }
    updatePayload.raw_text = parts.join('\n');
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('master_resumes')
    .update(updatePayload)
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (updateError || !updated) {
    logger.error({ resumeId, error: updateError?.message }, 'Failed to update resume');
    return c.json({ error: 'Failed to update resume' }, 500);
  }

  // Insert history row
  const existingVersion = (existing as Record<string, unknown>).version as number ?? 1;
  const changesSummary = `Updated ${changedFields.join(', ')} (v${existingVersion} → v${newVersion})`;
  await supabaseAdmin
    .from('master_resume_history')
    .insert({
      master_resume_id: resumeId,
      user_id: user.id,
      changes_summary: changesSummary,
      changes_detail: { fields: changedFields, previous_version: existingVersion },
    })
    .then(({ error: historyError }) => {
      if (historyError) {
        logger.error({ resumeId, error: historyError.message }, 'Failed to insert history row');
      }
    });

  return c.json({ resume: updated });
});

// PUT /resumes/:id/default — Mark an existing resume as the default base
resumes.put('/:id/default', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');
  if (!isValidUuid(resumeId)) return c.json({ error: 'Invalid resume id' }, 400);

  const { data, error } = await supabaseAdmin
    .rpc('set_default_master_resume', {
      p_user_id: user.id,
      p_resume_id: resumeId,
    });

  if (error) {
    logger.error({ error: error.message, resumeId }, 'Failed to set default resume via RPC');
    return c.json({ error: 'Failed to update default resume' }, 500);
  }

  const result = (data ?? {}) as DefaultResumeRpcResult;
  if (!result.ok) {
    if (result.error === 'NOT_FOUND') {
      return c.json({ error: 'Resume not found' }, 404);
    }
    return c.json({ error: 'Failed to update default resume' }, 500);
  }

  return c.json({ status: 'ok', resume_id: result.resume_id ?? resumeId, is_default: true });
});

// DELETE /resumes/:id — Delete a master resume
resumes.delete('/:id', rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');
  if (!isValidUuid(resumeId)) return c.json({ error: 'Invalid resume id' }, 400);

  const { data, error } = await supabaseAdmin
    .rpc('delete_master_resume_with_fallback_default', {
      p_user_id: user.id,
      p_resume_id: resumeId,
    });
  if (error) {
    logger.error({ resumeId, error: error.message }, 'Failed to delete resume via RPC');
    return c.json({ error: 'Failed to delete resume' }, 500);
  }

  const result = (data ?? {}) as DefaultResumeRpcResult;
  if (!result.ok) {
    if (result.error === 'NOT_FOUND') {
      return c.json({ error: 'Resume not found' }, 404);
    }
    return c.json({ error: 'Failed to delete resume' }, 500);
  }

  return c.json({
    status: 'deleted',
    resume_id: result.resume_id ?? resumeId,
    new_default_resume_id: result.new_default_resume_id ?? null,
  });
});

// POST /resumes — Upload/create a master resume (raw text)
resumes.post('/', rateLimitMiddleware(20, 60_000), async (c) => {
  const parsedBody = await parseJsonBodyWithLimit(c, MAX_CREATE_RESUME_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const user = c.get('user');
  const parsed = createResumeSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }
  const {
    raw_text,
    summary,
    experience,
    skills,
    education,
    certifications,
    contact_info,
    set_as_default,
    source_session_id,
    evidence_items,
  } = parsed.data;

  const { data, error } = await supabaseAdmin
    .rpc('create_master_resume_atomic', {
      p_user_id: user.id,
      p_raw_text: raw_text,
      p_summary: summary ?? '',
      p_experience: experience ?? [],
      p_skills: skills ?? {},
      p_education: education ?? [],
      p_certifications: certifications ?? [],
      p_contact_info: contact_info ?? {},
      p_source_session_id: source_session_id ?? null,
      p_set_as_default: Boolean(set_as_default),
      p_evidence_items: evidence_items ?? [],
    });

  if (error) {
    logger.error({ error: error.message }, 'Failed to create resume');
    return c.json({ error: 'Failed to create resume' }, 500);
  }

  if (!data || typeof data !== 'object') {
    logger.error({ data }, 'create_master_resume_atomic returned invalid payload');
    return c.json({ error: 'Failed to create resume' }, 500);
  }

  return c.json({ resume: data as CreateResumeRpcResult }, 201);
});

// POST /resumes/export-docx — Gate check for DOCX export (feature-guarded)
// The actual DOCX generation happens client-side; this endpoint validates
// that the user's plan includes DOCX export before the browser generates the file.
resumes.post('/export-docx', requireFeature('export_docx'), async (c) => {
  return c.json({ allowed: true });
});

export { resumes };
