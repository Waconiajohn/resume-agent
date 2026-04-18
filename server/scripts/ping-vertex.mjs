import { VertexProvider, getVertexAccessToken } from '../src/lib/llm-provider.ts';

const project = process.env.VERTEX_PROJECT || process.env.GCP_PROJECT;
console.error('VERTEX_PROJECT:', project ? 'set' : 'MISSING');
console.error('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'set' : 'unset');

try {
  const token = await getVertexAccessToken();
  console.error('Token obtained (length):', token.length);
} catch (e) {
  console.error('Token error:', e.message);
  process.exit(1);
}

const p = new VertexProvider({ project, region: 'global', accessToken: '' });
const res = await p.chat({
  model: 'deepseek-ai/deepseek-v3.2-maas',
  system: 'You are a helpful assistant. Reply with exactly one word.',
  messages: [{ role: 'user', content: 'Say PING.' }],
  max_tokens: 10,
  temperature: 0.0,
});
console.log('TEXT:', JSON.stringify(res.text));
console.log('USAGE:', res.usage);
