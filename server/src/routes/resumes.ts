import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

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

// POST /resumes — Upload/create a master resume (raw text)
resumes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { raw_text, summary, experience, skills, education, certifications } = body as {
    raw_text: string;
    summary?: string;
    experience?: unknown[];
    skills?: Record<string, string[]>;
    education?: unknown[];
    certifications?: unknown[];
  };

  if (!raw_text?.trim()) {
    return c.json({ error: 'raw_text is required' }, 400);
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
      version: 1,
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: 'Failed to create resume', details: error.message }, 500);
  }

  return c.json({ resume: data }, 201);
});

export { resumes };
