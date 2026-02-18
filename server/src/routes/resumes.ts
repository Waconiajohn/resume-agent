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
});

const resumes = new Hono();

resumes.use('*', authMiddleware);

// GET /resumes — List user's master resumes
resumes.get('/', async (c) => {
  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('master_resumes')
    .select('id, summary, version, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return c.json({ error: 'Failed to load resumes' }, 500);
  }

  return c.json({ resumes: data });
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
  const { raw_text, summary, experience, skills, education, certifications } = parsed.data;

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
      version: 1,
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
