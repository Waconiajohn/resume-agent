import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { sessions } from './routes/sessions.js';
import { resumes } from './routes/resumes.js';
import { supabaseAdmin } from './lib/supabase.js';

const app = new Hono();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

app.use('*', cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.get('/health', async (c) => {
  const checks: Record<string, string> = {};

  // Check Supabase connectivity
  try {
    const { error } = await supabaseAdmin.from('coach_sessions').select('id').limit(1);
    checks.database = error ? 'degraded' : 'ok';
  } catch {
    checks.database = 'down';
  }

  // Check Anthropic API key is set
  checks.anthropic = process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing';

  const overallStatus = Object.values(checks).every(v => v === 'ok' || v === 'configured') ? 'ok' : 'degraded';

  return c.json({ status: overallStatus, checks, timestamp: new Date().toISOString() });
});

app.route('/api/sessions', sessions);
app.route('/api/resumes', resumes);

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = parseInt(process.env.PORT ?? '3001');

console.log(`Resume Agent server starting on port ${port}...`);

serve({ fetch: app.fetch, port });

console.log(`Server running at http://localhost:${port}`);
