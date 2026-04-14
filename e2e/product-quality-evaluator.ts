/**
 * Multi-product quality evaluator — LinkedIn Optimizer, Interview Prep, Cover Letter.
 *
 * Runs Profile 0 (VP Ops → COO) through each product pipeline, captures output,
 * evaluates with Claude Haiku using product-specific rubrics, and prints scores.
 *
 * Usage (from repo root):
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/product-quality-evaluator.ts
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/product-quality-evaluator.ts --product linkedin
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/product-quality-evaluator.ts --product interview
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/product-quality-evaluator.ts --product cover-letter
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { STRESS_TEST_PROFILES } from './fixtures/stress-test-profiles.js';

const SUPABASE_URL = 'https://pvmfgfnbtqlipnnoeixu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XPbIzrH67TbmMQggn9QN_A_16iB5oPG';
const TEST_EMAIL = 'jjschrup@yahoo.com';
const TEST_PASSWORD = 'Scout123';
const API_BASE = 'http://localhost:3001/api';
const PIPELINE_TIMEOUT_MS = 10 * 60 * 1_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const PROFILE_INDEX = 0;

type ProductFilter = 'linkedin' | 'interview' | 'cover-letter' | 'all';

function parseCLIArgs(): ProductFilter {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--product' && args[i + 1]) {
      const val = args[i + 1] as string;
      if (['linkedin', 'interview', 'cover-letter', 'all'].includes(val)) return val as ProductFilter;
      console.error(`Invalid --product "${val}". Must be: linkedin | interview | cover-letter | all`);
      process.exit(1);
    }
  }
  return 'all';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SSEEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface QualityDimension { name: string; score: number; reasoning: string; callouts: string[] }
interface QualityReport { product: string; overallScore: number; dimensions: QualityDimension[]; criticalIssues: string[] }
interface JudgeResult { dimensions: Array<{ name: string; score: number; reasoning: string; callouts: string[] }>; criticalIssues: string[] }

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  console.log(`[auth] Signing in as ${TEST_EMAIL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Authentication failed: ${error?.message ?? 'no session'}`);
  console.log(`[auth] Authenticated. User ID: ${data.user.id}`);
  return data.session.access_token;
}

async function resetUserUsage(): Promise<void> {
  try {
    const env = readFileSync(resolve(process.cwd(), 'server/.env'), 'utf-8');
    const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim() ?? '';
    const supabaseUrl = get('SUPABASE_URL'), serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
    const testUserId = '5b756a7a-3e35-4465-bcf4-69d92f160f21';
    if (!supabaseUrl || !serviceKey) return;
    const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    await fetch(`${supabaseUrl}/rest/v1/user_usage?user_id=eq.${testUserId}`, { method: 'PATCH', headers: h, body: JSON.stringify({ sessions_count: 0 }) });
    await fetch(`${supabaseUrl}/rest/v1/coach_sessions?user_id=eq.${testUserId}&pipeline_status=in.(running,waiting)`, { method: 'PATCH', headers: h, body: JSON.stringify({ pipeline_status: 'error', pending_gate: null }) });
    console.log('[setup] Usage reset and stuck pipelines cleared');
  } catch { console.warn('[setup] Could not reset usage — server/.env may be missing service key'); }
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  for (const block of chunk.split(/\n\n+/)) {
    if (!block.trim()) continue;
    let type = 'message', data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) type = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6).trim();
    }
    if (!data) continue;
    try { const p = JSON.parse(data) as SSEEvent; if (!p.type) p.type = type; events.push(p); }
    catch { events.push({ type, data }); }
  }
  return events;
}

interface SSERunOptions {
  label: string; startUrl: string; streamUrl: string; respondUrl: string;
  body: Record<string, unknown>; token: string; completionEvents: string[];
  onGate?: (type: string, data: unknown) => Promise<{ gate: string; response: unknown } | null>;
  onEvent?: (event: SSEEvent) => void;
}

async function runSSEPipeline(opts: SSERunOptions): Promise<{ success: boolean; durationMs: number; events: SSEEvent[]; error?: string }> {
  const t0 = Date.now();
  const collected: SSEEvent[] = [];

  const startRes = await fetch(opts.startUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.body),
  }).catch((e: unknown) => { throw new Error(`POST ${opts.startUrl}: ${String(e)}`); });

  if (!startRes.ok) {
    const t = await startRes.text().catch(() => '');
    return { success: false, durationMs: Date.now() - t0, events: [], error: `${startRes.status}: ${t}` };
  }

  const sj = await startRes.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = (sj.session_id ?? opts.body.session_id) as string | undefined;
  if (!sessionId) return { success: false, durationMs: Date.now() - t0, events: [], error: `No session_id` };

  const streamUrl = opts.streamUrl.replace('{sessionId}', sessionId);
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), PIPELINE_TIMEOUT_MS);
  let ht: ReturnType<typeof setInterval> | null = setInterval(() => {
    console.log(`  [${opts.label}] Running... ${Math.round((Date.now() - t0) / 1000)}s`);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const sRes = await fetch(streamUrl, { headers: { Authorization: `Bearer ${opts.token}`, Accept: 'text/event-stream' }, signal: ctrl.signal });
    if (!sRes.ok || !sRes.body) {
      const t = sRes.body ? await sRes.text().catch(() => '') : '';
      return { success: false, durationMs: Date.now() - t0, events: collected, error: `Stream ${sRes.status}: ${t}` };
    }

    const reader = sRes.body.getReader();
    const dec = new TextDecoder();
    let buf = '', done = false;

    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += dec.decode(value, { stream: true });
      const cut = buf.lastIndexOf('\n\n');
      if (cut === -1) continue;
      const toProcess = buf.slice(0, cut + 2);
      buf = buf.slice(cut + 2);

      for (const ev of parseSSEChunk(toProcess)) {
        if (ev.type === 'heartbeat') continue;
        collected.push(ev);
        opts.onEvent?.(ev);
        if (ev.type === 'pipeline_error') return { success: false, durationMs: Date.now() - t0, events: collected, error: String(ev.error ?? ev.data?.error ?? 'pipeline_error') };
        if (opts.completionEvents.includes(ev.type)) { done = true; break; }
        if (opts.onGate) {
          const resp = await opts.onGate(ev.type, ev.data ?? ev);
          if (resp) {
            await new Promise(r => setTimeout(r, 500));
            const rr = await fetch(opts.respondUrl, { method: 'POST', headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, gate: resp.gate, response: resp.response }) });
            if (!rr.ok && rr.status !== 409) {
              await new Promise(r => setTimeout(r, 2000));
              await fetch(opts.respondUrl, { method: 'POST', headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, gate: resp.gate, response: resp.response }) });
            }
          }
        }
      }
    }

    if (!done && buf.trim()) {
      for (const ev of parseSSEChunk(buf + '\n\n')) {
        if (ev.type === 'heartbeat') continue;
        collected.push(ev);
        if (opts.completionEvents.includes(ev.type)) { done = true; break; }
      }
    }

    if (!done) return { success: false, durationMs: Date.now() - t0, events: collected, error: 'Stream closed without completion event' };
    return { success: true, durationMs: Date.now() - t0, events: collected };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, durationMs: Date.now() - t0, events: collected, error: msg.includes('abort') ? 'Timed out' : msg };
  } finally {
    clearTimeout(tid);
    if (ht) { clearInterval(ht); ht = null; }
  }
}

// ─── Product output capturers ─────────────────────────────────────────────────

function pickText(ev: SSEEvent, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = ev[k] ?? ev.data?.[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (v && typeof v === 'object') return JSON.stringify(v, null, 2);
  }
  return null;
}

async function captureLinkedIn(resumeText: string, token: string): Promise<string | null> {
  console.log('[linkedin] Starting LinkedIn Optimizer...');
  const sessionId = randomUUID();
  let out: string | null = null;
  const result = await runSSEPipeline({
    label: 'linkedin', startUrl: `${API_BASE}/linkedin-optimizer/start`,
    streamUrl: `${API_BASE}/linkedin-optimizer/{sessionId}/stream`,
    respondUrl: `${API_BASE}/linkedin-optimizer/respond`,
    body: { session_id: sessionId, resume_text: resumeText }, token,
    completionEvents: ['report_complete', 'pipeline_complete'],
    onEvent: (ev) => { if (ev.type === 'report_complete') out ??= pickText(ev, 'report', 'audit_report'); },
  });
  if (!result.success) { console.error(`[linkedin] Failed: ${result.error}`); return null; }
  out ??= (() => { const ev = result.events.slice().reverse().find(e => e.type === 'report_complete'); return ev ? pickText(ev, 'report', 'audit_report') : null; })();
  console.log(`[linkedin] Captured ${out?.length ?? 0} chars in ${Math.round(result.durationMs / 1000)}s`);
  return out;
}

async function captureInterviewPrep(resumeText: string, jd: string, company: string, token: string): Promise<string | null> {
  console.log('[interview] Starting Interview Prep...');
  const sessionId = randomUUID();
  let out: string | null = null;
  const result = await runSSEPipeline({
    label: 'interview', startUrl: `${API_BASE}/interview-prep/start`,
    streamUrl: `${API_BASE}/interview-prep/{sessionId}/stream`,
    respondUrl: `${API_BASE}/interview-prep/respond`,
    body: { session_id: sessionId, resume_text: resumeText, job_description: jd, company_name: company }, token,
    completionEvents: ['report_complete', 'pipeline_complete'],
    onGate: async (type, data) => {
      if (type !== 'pipeline_gate') return null;
      const gate = (data as Record<string, unknown>)?.gate as string | undefined;
      if (gate === 'star_stories_review') { console.log('[interview] Approving star_stories_review'); return { gate, response: true }; }
      return null;
    },
    onEvent: (ev) => { if (ev.type === 'report_complete') out ??= pickText(ev, 'report'); },
  });
  if (!result.success) { console.error(`[interview] Failed: ${result.error}`); return null; }
  out ??= (() => { const ev = result.events.slice().reverse().find(e => e.type === 'report_complete' || e.type === 'pipeline_complete'); return ev ? pickText(ev, 'report') : null; })();
  console.log(`[interview] Captured ${out?.length ?? 0} chars in ${Math.round(result.durationMs / 1000)}s`);
  return out;
}

async function captureCoverLetter(resumeText: string, jd: string, company: string, token: string): Promise<string | null> {
  console.log('[cover-letter] Starting Cover Letter...');
  const sessionId = randomUUID();
  let out: string | null = null;
  const result = await runSSEPipeline({
    label: 'cover-letter', startUrl: `${API_BASE}/cover-letter/start`,
    streamUrl: `${API_BASE}/cover-letter/{sessionId}/stream`,
    respondUrl: `${API_BASE}/cover-letter/respond`,
    body: { session_id: sessionId, resume_text: resumeText, job_description: jd, company_name: company }, token,
    completionEvents: ['letter_complete', 'pipeline_complete'],
    onGate: async (type, data) => {
      if (type !== 'pipeline_gate') return null;
      const gate = (data as Record<string, unknown>)?.gate as string | undefined;
      if (gate === 'letter_review') { console.log('[cover-letter] Approving letter_review'); return { gate, response: { approved: true } }; }
      return null;
    },
    onEvent: (ev) => { if (ev.type === 'letter_complete') out ??= pickText(ev, 'letter', 'letter_text'); },
  });
  if (!result.success) { console.error(`[cover-letter] Failed: ${result.error}`); return null; }
  out ??= (() => { const ev = result.events.slice().reverse().find(e => e.type === 'letter_complete' || e.type === 'pipeline_complete'); return ev ? pickText(ev, 'letter', 'letter_text') : null; })();
  console.log(`[cover-letter] Captured ${out?.length ?? 0} chars in ${Math.round(result.durationMs / 1000)}s`);
  return out;
}

// ─── Rubrics ──────────────────────────────────────────────────────────────────

const RUBRIC_PREFIX = (resume: string, jd?: string) =>
  `## Source Resume:\n${resume.slice(0, 2500)}\n\n${jd ? `## Job Description:\n${jd.slice(0, 1500)}\n\n` : ''}`;

const JSON_SCHEMA = (dims: string[]) =>
  `Return ONLY valid JSON (no markdown fences):\n{"dimensions":[${dims.map(n => `{"name":"${n}","score":<1-10>,"reasoning":"<1-2 sentences>","callouts":["<quote>"]}`).join(',')}],"criticalIssues":["<issue>"]}`;

function buildLinkedInRubric(resume: string, report: string): string {
  const dims = ['headlineQuality', 'aboutSectionQuality', 'findingsAccuracy', 'actionability'];
  return `You are evaluating an AI-generated LinkedIn profile optimization report. Score rigorously — 7 means genuinely good, 4 means noticeably flawed.

${RUBRIC_PREFIX(resume)}## Report to Evaluate:\n${report.slice(0, 4000)}

Score each dimension 1-10. Quote specific text when flagging problems.
- **headlineQuality**: Is the recommended headline specific and positioning, not generic?
- **aboutSectionQuality**: Does the rewritten About tell a story grounded in THIS candidate's real experience?
- **findingsAccuracy**: Are the diagnostic findings relevant to this specific candidate, not boilerplate?
- **actionability**: Are recommendations specific enough to implement, or vague directives?

${JSON_SCHEMA(dims)}`;
}

function buildInterviewPrepRubric(resume: string, jd: string, report: string): string {
  const dims = ['companyResearchRelevance', 'questionsQuality', 'starStoryGrounding', 'authenticVoice'];
  return `You are evaluating an AI-generated interview preparation report. Score rigorously — 7 means genuinely good, 4 means noticeably flawed.

${RUBRIC_PREFIX(resume, jd)}## Report to Evaluate:\n${report.slice(0, 4000)}

Score each dimension 1-10. Quote specific text when flagging problems.
- **companyResearchRelevance**: Is company research specific to the target company, not generic industry talking points?
- **questionsQuality**: Are questions specific to this role/candidate, or generic ("Tell me about a time you led a team")?
- **starStoryGrounding**: Are STAR stories grounded in the candidate's actual resume experience, not fabricated?
- **authenticVoice**: Does it sound like real coaching or a template with placeholders filled in?

${JSON_SCHEMA(dims)}`;
}

function buildCoverLetterRubric(resume: string, jd: string, letter: string): string {
  const dims = ['personalization', 'authenticVoice', 'specificProof', 'compelling'];
  return `You are evaluating an AI-generated cover letter. Score rigorously — 7 means genuinely good, 4 means noticeably flawed.

${RUBRIC_PREFIX(resume, jd)}## Cover Letter to Evaluate:\n${letter.slice(0, 3000)}

Score each dimension 1-10. Quote specific text when flagging problems.
- **personalization**: Does it connect THIS candidate's experience to THIS role at THIS company?
- **authenticVoice**: Does it sound like a person wrote it? Flag AI-speak: "leveraged", "spearheaded", "orchestrated", "results-driven leader".
- **specificProof**: Does it cite specific accomplishments with metrics from the actual resume?
- **compelling**: Would a hiring manager read past the first paragraph? Does it avoid "I am writing to express my interest in..."?

${JSON_SCHEMA(dims)}`;
}

// ─── Judge & Evaluate ─────────────────────────────────────────────────────────

async function callJudge(prompt: string, apiKey: string): Promise<JudgeResult | null> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch (err) { console.error('[judge] Network error:', err instanceof Error ? err.message : err); return null; }

  if (!res.ok) { console.error(`[judge] API ${res.status}: ${await res.text().catch(() => '')}`); return null; }

  const json = await res.json() as { content?: Array<{ type: string; text?: string }>; error?: { message: string } };
  if (json.error) { console.error(`[judge] Error: ${json.error.message}`); return null; }

  const textBlock = json.content?.find(c => c.type === 'text');
  if (!textBlock?.text) { console.error('[judge] No text in response'); return null; }

  let raw = textBlock.text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);

  try { return JSON.parse(raw) as JudgeResult; }
  catch { console.error('[judge] Failed to parse JSON. Last 200 chars:', raw.slice(-200)); return null; }
}

async function evaluate(product: string, prompt: string, apiKey: string): Promise<QualityReport> {
  console.log(`[eval] Evaluating ${product}...`);
  const result = await callJudge(prompt, apiKey);
  if (!result) return { product, overallScore: 0, dimensions: [], criticalIssues: ['Evaluation failed'] };
  const dimensions = result.dimensions.map(d => ({ name: d.name, score: Math.round(d.score), reasoning: d.reasoning ?? '', callouts: Array.isArray(d.callouts) ? d.callouts : [] }));
  const overallScore = dimensions.length > 0 ? Math.round((dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length) * 10) / 10 : 0;
  return { product, overallScore, dimensions, criticalIssues: Array.isArray(result.criticalIssues) ? result.criticalIssues : [] };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function printReport(r: QualityReport): void {
  const W = 80, header = ` Quality Evaluation: ${r.product} `;
  console.log('\n' + '═'.repeat(W));
  console.log(' '.repeat(Math.max(0, Math.floor((W - header.length) / 2))) + header);
  console.log('═'.repeat(W) + '\n');
  if (r.dimensions.length === 0) { console.log('  Evaluation failed.'); return; }

  const bar = (s: number) => '█'.repeat(Math.round(s)) + '░'.repeat(10 - Math.round(s));
  const tag = (s: number) => s >= 8 ? 'Good' : s >= 6 ? 'Fair' : s >= 4 ? 'Weak' : 'Poor';

  for (const d of r.dimensions) {
    console.log(`  ${d.name.padEnd(28).slice(0, 28)}  ${String(d.score).padStart(2)}/10  ${bar(d.score)}  ${tag(d.score)}${d.score < 6 ? ' !' : ''}`);
    if (d.reasoning) {
      const words = d.reasoning.split(' ');
      let line = '    ';
      for (const w of words) { if ((line + w).length > 76) { console.log(line.trimEnd()); line = '    ' + w + ' '; } else line += w + ' '; }
      if (line.trim()) console.log(line.trimEnd());
    }
    for (const c of d.callouts.slice(0, 2)) console.log(`      -> "${c.length > 70 ? c.slice(0, 67) + '...' : c}"`);
  }
  console.log('\n  ' + '─'.repeat(W - 4));
  console.log(`  Overall Score: ${r.overallScore}/10\n`);
  if (r.criticalIssues.length > 0) {
    console.log('  Critical Issues:');
    for (const i of r.criticalIssues) console.log(`  • ${i.length > 74 ? i.slice(0, 71) + '...' : i}`);
    console.log('');
  }
  console.log('═'.repeat(W));
}

function printSummaryTable(reports: QualityReport[]): void {
  if (reports.length < 2) return;
  console.log('\n\n' + '═'.repeat(80) + '\n  MULTI-PRODUCT QUALITY SUMMARY\n' + '═'.repeat(80));
  const dims = reports[0]?.dimensions.map(d => d.name) ?? [];
  const labelW = 20, colW = 8;
  console.log('  ' + ['Product'.padEnd(labelW), 'Ovrl', ...dims.map(d => d.slice(0, colW - 1).padEnd(colW))].join('  '));
  console.log('─'.repeat(80));
  for (const r of reports) {
    const scores = dims.map(n => { const d = r.dimensions.find(x => x.name === n); return (d ? String(d.score) : '—').padEnd(colW); });
    console.log('  ' + [r.product.padEnd(labelW).slice(0, labelW), r.overallScore.toFixed(1).padEnd(4), ...scores].join('  '));
  }
  const totals: Record<string, { sum: number; count: number }> = {};
  for (const r of reports) for (const d of r.dimensions) { totals[d.name] ??= { sum: 0, count: 0 }; totals[d.name]!.sum += d.score; totals[d.name]!.count++; }
  const sorted = Object.entries(totals).map(([n, { sum, count }]) => ({ n, avg: sum / count })).sort((a, b) => a.avg - b.avg);
  if (sorted.length > 0) { console.log('\n  Weakest Dimensions:'); for (const d of sorted.slice(0, 3)) console.log(`  • ${d.n}: ${d.avg.toFixed(1)}/10`); }
  console.log('\n' + '═'.repeat(80));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const productFilter = parseCLIArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Usage: ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/product-quality-evaluator.ts');
    process.exit(1);
  }

  const profile = STRESS_TEST_PROFILES[PROFILE_INDEX];
  if (!profile) { console.error(`Profile ${PROFILE_INDEX} not found`); process.exit(1); }

  const companyMatch = profile.jobDescription.match(/(?:at|—)\s+([A-Z][A-Za-z &,.']+(?:Inc|LLC|Corp|Group|Holdings|Partners|Capital)?)/);
  const companyName = companyMatch?.[1]?.trim() ?? 'Coventry Industrial Holdings';

  console.log('\nMulti-Product Quality Evaluator');
  console.log(`Judge: ${JUDGE_MODEL}  |  Profile: ${profile.label} (index ${PROFILE_INDEX})  |  Products: ${productFilter}\n`);

  await resetUserUsage();

  let token!: string;
  try { token = await authenticate(); }
  catch (err) { console.error('Authentication failed:', err instanceof Error ? err.message : err); process.exit(1); }

  const reports: QualityReport[] = [];
  const run = (p: ProductFilter) => productFilter === 'all' || productFilter === p;

  if (run('linkedin')) {
    const out = await captureLinkedIn(profile.resumeText, token);
    if (out) { const r = await evaluate('LinkedIn Optimizer', buildLinkedInRubric(profile.resumeText, out), apiKey); reports.push(r); printReport(r); }
    else console.warn('[linkedin] No output captured — skipping evaluation');
  }

  if (run('interview')) {
    const out = await captureInterviewPrep(profile.resumeText, profile.jobDescription, companyName, token);
    if (out) { const r = await evaluate('Interview Prep', buildInterviewPrepRubric(profile.resumeText, profile.jobDescription, out), apiKey); reports.push(r); printReport(r); }
    else console.warn('[interview] No output captured — skipping evaluation');
  }

  if (run('cover-letter')) {
    const out = await captureCoverLetter(profile.resumeText, profile.jobDescription, companyName, token);
    if (out) { const r = await evaluate('Cover Letter', buildCoverLetterRubric(profile.resumeText, profile.jobDescription, out), apiKey); reports.push(r); printReport(r); }
    else console.warn('[cover-letter] No output captured — skipping evaluation');
  }

  if (reports.length > 1) printSummaryTable(reports);
  if (reports.length === 0) { console.log('No products evaluated.'); process.exit(1); }
}

main().catch((err) => { console.error('Fatal error:', err instanceof Error ? err.message : err); process.exit(1); });
