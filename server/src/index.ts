import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { sessions } from './routes/sessions.js';
import { resumes } from './routes/resumes.js';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true,
}));

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
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
