import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../lib/logger.js';

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
});

const resumes = new Hono();

resumes.use('*', authMiddleware);

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

// GET /resumes/:id — Get a master resume
resumes.get('/:id', async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');

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

// PUT /resumes/:id/default — Mark an existing resume as the default base
resumes.put('/:id/default', async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('master_resumes')
    .select('id')
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError || !existing) {
    return c.json({ error: 'Resume not found' }, 404);
  }

  const { error: clearError } = await supabaseAdmin
    .from('master_resumes')
    .update({ is_default: false })
    .eq('user_id', user.id)
    .eq('is_default', true);

  if (clearError) {
    logger.error({ error: clearError.message }, 'Failed to clear existing default resume');
    return c.json({ error: 'Failed to update default resume' }, 500);
  }

  const { error: setError } = await supabaseAdmin
    .from('master_resumes')
    .update({ is_default: true })
    .eq('id', resumeId)
    .eq('user_id', user.id);

  if (setError) {
    logger.error({ error: setError.message }, 'Failed to set default resume');
    return c.json({ error: 'Failed to update default resume' }, 500);
  }

  return c.json({ status: 'ok', resume_id: resumeId, is_default: true });
});

// DELETE /resumes/:id — Delete a master resume
resumes.delete('/:id', async (c) => {
  const user = c.get('user');
  const resumeId = c.req.param('id');

  const { error } = await supabaseAdmin
    .from('master_resumes')
    .delete()
    .eq('id', resumeId)
    .eq('user_id', user.id);

  if (error) {
    logger.error({ resumeId, error: error.message }, 'Failed to delete resume');
    return c.json({ error: 'Failed to delete resume' }, 500);
  }

  return c.json({ status: 'deleted', resume_id: resumeId });
});

// POST /resumes — Upload/create a master resume (raw text)
resumes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = createResumeSchema.safeParse(body);
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
  } = parsed.data;

  const { data: latest } = await supabaseAdmin
    .from('master_resumes')
    .select('version')
    .eq('user_id', user.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existingDefault } = await supabaseAdmin
    .from('master_resumes')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  const makeDefault = Boolean(set_as_default) || !existingDefault;
  if (makeDefault) {
    const { error: clearError } = await supabaseAdmin
      .from('master_resumes')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true);
    if (clearError) {
      logger.error({ error: clearError.message }, 'Failed to clear existing default resume');
      return c.json({ error: 'Failed to create resume' }, 500);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('master_resumes')
    .insert({
      user_id: user.id,
      raw_text,
      summary: summary ?? '',
      experience: experience ?? [],
      skills: skills ?? {},
      education: education ?? [],
      certifications: certifications ?? [],
      contact_info: contact_info ?? {},
      source_session_id: source_session_id ?? null,
      is_default: makeDefault,
      version: (latest?.version ?? 0) + 1,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error: error.message }, 'Failed to create resume');
    return c.json({ error: 'Failed to create resume' }, 500);
  }

  return c.json({ resume: data }, 201);
});

export { resumes };
