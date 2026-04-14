/**
 * LLM-as-judge quality evaluation system for Resume V2 pipeline outputs.
 *
 * Runs 3 executive profiles through the pipeline, captures the assembled resume,
 * sends it to Claude with structured rubrics, and prints
 * per-dimension scores with specific callouts.
 *
 * Usage (from repo root):
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/quality-evaluator.ts
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/quality-evaluator.ts --profile 0
 *   ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/quality-evaluator.ts --skip-pipeline
 *
 * @supabase/supabase-js is resolved from server/node_modules via NODE_PATH.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { STRESS_TEST_PROFILES, type StressTestProfile } from './fixtures/stress-test-profiles.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://pvmfgfnbtqlipnnoeixu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XPbIzrH67TbmMQggn9QN_A_16iB5oPG';
const TEST_EMAIL = 'jjschrup@yahoo.com';
const TEST_PASSWORD = 'Scout123';
const API_BASE = 'http://localhost:3001/api';
const PIPELINE_TIMEOUT_MS = 10 * 60 * 1_000;
const HEARTBEAT_LOG_INTERVAL_MS = 30_000;
const CACHE_FILE = resolve(process.cwd(), 'e2e/quality-eval-cache.json');
const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const EVALUATION_PROFILES = [0, 3, 14];

// ─── CLI args ─────────────────────────────────────────────────────────────────

interface CLIArgs {
  profileIndex: number | null;
  skipPipeline: boolean;
}

function parseCLIArgs(): CLIArgs {
  const args = process.argv.slice(2);
  let profileIndex: number | null = null;
  let skipPipeline = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1] !== undefined) {
      profileIndex = parseInt(args[i + 1]!, 10);
      if (isNaN(profileIndex) || profileIndex < 0 || profileIndex >= STRESS_TEST_PROFILES.length) {
        console.error(`Invalid --profile index. Must be 0–${STRESS_TEST_PROFILES.length - 1}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--skip-pipeline') {
      skipPipeline = true;
    }
  }

  return { profileIndex, skipPipeline };
}

// ─── Quality evaluation types ─────────────────────────────────────────────────

interface QualityDimension {
  name: string;
  score: number;
  reasoning: string;
  callouts: string[];
}

interface QualityReport {
  product: string;
  profileLabel: string;
  overallScore: number;
  dimensions: QualityDimension[];
  criticalIssues: string[];
}

// ─── Pipeline capture types ───────────────────────────────────────────────────

interface CapturedResume {
  profileIndex: number;
  label: string;
  resumeText: string;
  jobDescription: string;
  assembledResumeJson: string;
  atsScore: number | null;
  durationMs: number;
}

interface CacheFile {
  capturedAt: string;
  results: CapturedResume[];
}

// ─── Supabase Auth ────────────────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  console.log(`[auth] Signing in as ${TEST_EMAIL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(`Authentication failed: ${error?.message ?? 'no session returned'}`);
  }

  console.log(`[auth] Authenticated. User ID: ${data.user.id}`);
  return data.session.access_token;
}

// ─── Pre-run cleanup ──────────────────────────────────────────────────────────

async function resetUserUsage(): Promise<void> {
  try {
    const envPath = resolve(process.cwd(), 'server/.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const getEnv = (key: string): string => {
      const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
      return match?.[1]?.trim() ?? '';
    };

    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const testUserId = '5b756a7a-3e35-4465-bcf4-69d92f160f21';

    if (!supabaseUrl || !serviceKey) return;

    const headers: Record<string, string> = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    };

    await fetch(`${supabaseUrl}/rest/v1/user_usage?user_id=eq.${testUserId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sessions_count: 0 }),
    });

    await fetch(
      `${supabaseUrl}/rest/v1/coach_sessions?user_id=eq.${testUserId}&pipeline_status=in.(running,waiting)`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ pipeline_status: 'error', pending_gate: null }),
      },
    );

    console.log('[setup] Usage reset and stuck pipelines cleared');
  } catch {
    console.warn('[setup] Could not reset usage — server/.env may be missing service key');
  }
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

interface ParsedSSEEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  gate?: string;
  session_id?: string;
  error?: string;
  stage?: string;
}

function parseSSEChunk(chunk: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = [];
  const blocks = chunk.split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split('\n');
    let eventType = 'message';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice('event: '.length).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice('data: '.length).trim();
      }
    }

    if (!dataLine) continue;

    try {
      const parsed = JSON.parse(dataLine) as ParsedSSEEvent;
      if (!parsed.type) {
        parsed.type = eventType;
      }
      events.push(parsed);
    } catch {
      events.push({ type: eventType, data: dataLine });
    }
  }

  return events;
}

// ─── Gap auto-responder ───────────────────────────────────────────────────────

interface GapCoachingCard {
  requirement: string;
  work_item_id?: string;
  importance: string;
  classification: string;
}

/**
 * Profile-specific evidence responses — what a real VP Ops (Profile 0)
 * would say when asked about gaps in their experience for a COO role.
 * These are realistic answers a 20-year manufacturing exec would give.
 */
const PROFILE_0_EVIDENCE: Record<string, string> = {
  // P&L ownership
  'p&l': 'After my VP Finance left in late 2024, I assumed full P&L sign-off authority for the $210M operating budget for 14 months. I owned cost-per-unit targets, capital allocation up to $5M, and monthly budget-vs-actual reviews. I presented the EBITDA bridge to our board quarterly during that period.',
  'budget': 'I managed the full $210M operating budget with sign-off authority on all operational spending. Capital requests over $5M went to the board but I prepared and presented the business cases. I also managed the $47M CNC modernization capital program end-to-end.',
  // Board experience
  'board': 'I presented quarterly to the Cincinnati Manufacturing Advisory Board (5 external members) covering operational KPIs, EBITDA bridge analysis, capital project ROI, and supply chain risk. I also presented annual strategic plans to the parent company executive committee.',
  'executive': 'I reported directly to the CEO and participated in monthly executive leadership meetings with the full C-suite. I led the operational portion of the annual strategic planning process and presented to the board twice per year.',
  // Multi-site / cross-divisional
  'multi-site': 'I managed three manufacturing facilities across the Cincinnati metro area — two stamping plants and one assembly plant. Total footprint was 420,000 sq ft with 1,100 employees. I coordinated production scheduling, quality standards, and Lean deployment across all three sites with a unified KPI dashboard.',
  'cross-divisional': 'I standardized operating procedures across all three plants including unified quality management systems, shared maintenance scheduling, and cross-trained supervisory teams. I also led the ERP consolidation project that brought all three sites onto a single platform.',
  'integration': 'I led the integration of a newly acquired stamping operation in 2022, standardizing their processes to match our existing plants within 6 months. This included quality system harmonization, ERP migration, and cross-training 180 employees.',
  // PE / recapitalization
  'recapitalization': 'I led the operational due diligence when Meridian explored a PE sale in 2023. I built the operational data room with 30+ KPI dashboards, presented the manufacturing EBITDA bridge to three PE firms, and identified $8M in additional savings opportunities for the value creation thesis.',
  'pe': 'During the 2023 PE exploration, I worked directly with the PE sponsors on operational modeling. I presented our Lean transformation ROI, capital efficiency metrics, and the remaining $8M opportunity pipeline. While the deal ultimately did not close, I built the full operational case.',
  // ERP / systems
  'erp': 'I led the selection and implementation of a plant-wide MES that integrated with our ERP. I also standardized quality management across all three plants onto a single QMS platform, replacing three legacy systems. The MES implementation reduced data entry time by 40% and gave us real-time OEE visibility.',
  // Working capital
  'working capital': 'At Fortis Components I redesigned the production scheduling system to reduce WIP inventory by 31%, freeing $4.8M in working capital. At Meridian I applied similar principles to optimize raw material ordering cycles, reducing carrying costs by $1.2M annually.',
  // Supplier management
  'supplier': 'I managed relationships with 40+ Tier 1 and Tier 2 suppliers. I renegotiated contracts for $6M in annual savings while improving on-time delivery from 81% to 96%. I also developed a supplier scorecard system that reduced quality rejects from incoming materials by 60%.',
};

/**
 * Simulate a real user responding to gap coaching questions.
 * Uses profile-specific evidence that matches what the candidate
 * would actually know and say about their experience.
 */
function buildRealisticGapResponse(card: GapCoachingCard): {
  requirement: string;
  action: 'approve' | 'context' | 'skip';
  user_context?: string;
} {
  const req = card.requirement.toLowerCase();
  const evidence = (card.evidence_found ?? []).join(' ').toLowerCase();
  const hasEvidence = evidence.length > 20;

  // If the card has strong evidence, approve it
  if (card.classification === 'strong' && hasEvidence) {
    return { requirement: card.requirement, action: 'approve' };
  }

  // Try to match against profile-specific evidence
  for (const [keyword, userEvidence] of Object.entries(PROFILE_0_EVIDENCE)) {
    if (req.includes(keyword)) {
      return {
        requirement: card.requirement,
        action: 'context',
        user_context: userEvidence,
      };
    }
  }

  // If the card has partial evidence but no profile match, provide generic strengthening
  if (card.classification === 'partial' && hasEvidence) {
    const evidenceText = card.evidence_found?.slice(0, 2).join('. ') ?? '';
    return {
      requirement: card.requirement,
      action: 'context',
      user_context: `Yes, this is accurate. ${evidenceText}`,
    };
  }

  // For requirements with no evidence and no profile match, SKIP honestly
  if (card.classification === 'missing' && !hasEvidence) {
    return { requirement: card.requirement, action: 'skip' };
  }

  // Default: approve with what we have
  return { requirement: card.requirement, action: 'approve' };
}

async function respondToGaps(
  token: string,
  sessionId: string,
  cards: GapCoachingCard[],
): Promise<void> {
  const responses = cards.map((card) => {
    const response = buildRealisticGapResponse(card);
    const label = response.action === 'skip' ? 'SKIP (no evidence)'
      : response.action === 'context' ? 'CONTEXT (providing evidence)'
      : 'APPROVE (strong match)';
    console.log(`    [gap] ${card.requirement}: ${label}`);
    return response;
  });

  const res = await fetch(`${API_BASE}/pipeline/${sessionId}/respond-gaps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ responses }),
  });

  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /pipeline/${sessionId}/respond-gaps returned ${res.status}: ${body}`);
  }
}

// ─── Pipeline runner that captures assembled resume ───────────────────────────

async function runAndCapturePipeline(
  token: string,
  profileIndex: number,
  profile: StressTestProfile,
): Promise<CapturedResume> {
  const startTime = Date.now();
  const tag = `[pipeline-${profileIndex}]`;

  console.log(`${tag} Starting: "${profile.label}"`);

  // Start pipeline
  const startRes = await fetch(`${API_BASE}/pipeline/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resume_text: (profile as unknown as Record<string, string>).resume_text ?? profile.resumeText,
      job_description: (profile as unknown as Record<string, string>).job_description ?? profile.jobDescription,
    }),
  });

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '');
    throw new Error(`POST /pipeline/start returned ${startRes.status}: ${body}`);
  }

  const startJson = (await startRes.json()) as { session_id: string };
  if (!startJson.session_id) {
    throw new Error(`POST /pipeline/start: no session_id in response`);
  }

  const sessionId = startJson.session_id;
  console.log(`${tag} Session ID: ${sessionId}`);

  // Stream SSE events
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), PIPELINE_TIMEOUT_MS);

  let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`${tag} Still running... ${elapsed}s elapsed`);
  }, HEARTBEAT_LOG_INTERVAL_MS);

  let assembledResumeJson = '';
  let atsScore: number | null = null;

  try {
    const streamRes = await fetch(`${API_BASE}/pipeline/${sessionId}/stream`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal: timeoutController.signal,
    });

    if (!streamRes.ok) {
      const body = await streamRes.text().catch(() => '');
      throw new Error(`SSE stream returned ${streamRes.status}: ${body}`);
    }

    if (!streamRes.body) {
      throw new Error('SSE stream response has no body');
    }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pipelineComplete = false;
  let pendingGapCards: GapCoachingCard[] = [];

    while (!pipelineComplete) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline === -1) continue;

      const toProcess = buffer.slice(0, lastDoubleNewline + 2);
      buffer = buffer.slice(lastDoubleNewline + 2);

      const events = parseSSEChunk(toProcess);

      for (const event of events) {
        switch (event.type) {
          case 'stage_start':
            console.log(`${tag} Stage: ${event.stage ?? event.data?.stage ?? '?'}`);
            break;

          case 'assembly_complete': {
            // This is the primary capture target — the fully assembled resume
            const assembled = event.data as {
              final_resume?: unknown;
              scores?: { ats_match?: number };
            } | undefined;

            if (assembled?.final_resume) {
              assembledResumeJson = JSON.stringify(assembled.final_resume, null, 2);
            }
            if (assembled?.scores?.ats_match !== undefined) {
              atsScore = assembled.scores.ats_match;
            }
            break;
          }

          case 'resume_draft': {
            // Fallback capture if assembly_complete doesn't fire
            if (!assembledResumeJson && event.data) {
              assembledResumeJson = JSON.stringify(event.data, null, 2);
            }
            break;
          }

          case 'gap_coaching': {
            const cards = (Array.isArray(event.data) ? event.data : []) as GapCoachingCard[];
            if (cards.length > 0) {
              pendingGapCards = cards;
              console.log(`${tag} captured gap_coaching cards: ${cards.length}`);
            }
            break;
          }

          case 'gap_questions': {
            const questions = (event.data?.questions ?? []) as Array<{
              id: string;
              requirement: string;
            }>;
            if (questions.length > 0) {
              pendingGapCards = questions.map((q) => ({
                requirement: q.requirement ?? q.id,
                importance: 'important',
                classification: 'partial',
              }));
              console.log(`${tag} captured gap_questions cards: ${questions.length}`);
            }
            break;
          }

          case 'pipeline_gate':
            if (event.data?.gate === 'gap_coaching' || event.gate === 'gap_coaching') {
              if (pendingGapCards.length > 0) {
                console.log(`${tag} pipeline_gate: gap_coaching — auto-approving ${pendingGapCards.length} cards`);
                await respondToGaps(token, sessionId, pendingGapCards);
                pendingGapCards = [];
              } else {
                console.log(`${tag} pipeline_gate: gap_coaching with no cached cards`);
              }
            }
            break;

          case 'pipeline_complete':
            console.log(`${tag} pipeline_complete`);
            pipelineComplete = true;
            break;

          case 'pipeline_error': {
            const errMsg = (event.error ?? event.data?.error ?? 'unknown pipeline error') as string;
            throw new Error(`pipeline_error: ${errMsg}`);
          }

          default:
            break;
        }
      }
    }

    if (!pipelineComplete) {
      throw new Error('SSE stream closed without pipeline_complete event');
    }
  } finally {
    clearTimeout(timeoutId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  if (!assembledResumeJson) {
    throw new Error(`${tag} Pipeline completed but no assembled resume was captured`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`${tag} Captured in ${Math.round(durationMs / 1000)}s | ATS: ${atsScore ?? 'n/a'}`);

  return {
    profileIndex,
    label: profile.label,
    resumeText: profile.resumeText,
    jobDescription: profile.jobDescription,
    assembledResumeJson,
    atsScore,
    durationMs,
  };
}

// ─── Resume text extractor ────────────────────────────────────────────────────

/**
 * Flatten the assembled ResumeDraftOutput JSON into a plain text representation
 * suitable for LLM evaluation. Preserves all bullets, section headers, and
 * executive summary — the things the judge needs to evaluate quality.
 */
function flattenResumeToText(assembledResumeJson: string): string {
  let resume: Record<string, unknown>;
  try {
    resume = JSON.parse(assembledResumeJson) as Record<string, unknown>;
  } catch {
    return assembledResumeJson; // return raw if not parseable
  }

  const lines: string[] = [];

  // Header
  const header = resume.header as Record<string, string> | undefined;
  if (header) {
    if (header.name) lines.push(header.name.toUpperCase());
    if (header.branded_title) lines.push(header.branded_title);
    const contact = [header.phone, header.email, header.linkedin].filter(Boolean).join(' | ');
    if (contact) lines.push(contact);
    lines.push('');
  }

  // Executive Summary
  const summary = resume.executive_summary as { content?: string } | undefined;
  if (summary?.content) {
    lines.push('EXECUTIVE SUMMARY');
    lines.push(summary.content);
    lines.push('');
  }

  // Core Competencies
  const competencies = resume.core_competencies as string[] | undefined;
  if (competencies && competencies.length > 0) {
    lines.push('CORE COMPETENCIES');
    lines.push(competencies.join(' | '));
    lines.push('');
  }

  // Selected Accomplishments
  const accomplishments = resume.selected_accomplishments as Array<{ content: string }> | undefined;
  if (accomplishments && accomplishments.length > 0) {
    lines.push('SELECTED ACCOMPLISHMENTS');
    for (const acc of accomplishments) {
      lines.push(`• ${acc.content}`);
    }
    lines.push('');
  }

  // Professional Experience
  const experience = resume.professional_experience as Array<{
    title: string;
    company: string;
    dates?: string;
    start_date?: string;
    end_date?: string;
    scope_statement?: string;
    bullets: Array<{ text: string }>;
  }> | undefined;

  if (experience && experience.length > 0) {
    lines.push('PROFESSIONAL EXPERIENCE');
    for (const role of experience) {
      const roleDates = typeof role.dates === 'string' && role.dates.trim().length > 0
        ? role.dates
        : [role.start_date, role.end_date].filter(Boolean).join(' – ');
      lines.push(`${role.title} | ${role.company}${roleDates ? ` | ${roleDates}` : ''}`);
      if (role.scope_statement) {
        lines.push(role.scope_statement);
      }
      for (const bullet of role.bullets) {
        lines.push(`• ${bullet.text}`);
      }
      lines.push('');
    }
  }

  // Education
  const education = resume.education as Array<{
    degree: string;
    institution: string;
    year?: string;
  }> | undefined;
  if (education && education.length > 0) {
    lines.push('EDUCATION');
    for (const edu of education) {
      lines.push(`${edu.degree} | ${edu.institution}${edu.year ? ` | ${edu.year}` : ''}`);
    }
    lines.push('');
  }

  // Certifications
  const certs = resume.certifications as string[] | undefined;
  if (certs && certs.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const cert of certs) {
      lines.push(`• ${cert}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Anthropic judge call ─────────────────────────────────────────────────────

interface AnthropicMessage {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  error?: { message: string };
}

interface JudgeEvalResult {
  dimensions: Array<{
    name: string;
    score: number;
    reasoning: string;
    callouts: string[];
  }>;
  criticalIssues: string[];
}

async function callClaudeJudge(
  prompt: string,
  apiKey: string,
): Promise<JudgeEvalResult | null> {
  const body: AnthropicMessage = {
    model: JUDGE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[judge] Network error calling Anthropic:', err instanceof Error ? err.message : err);
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[judge] Anthropic API returned ${res.status}: ${text}`);
    return null;
  }

  const json = (await res.json()) as AnthropicResponse;

  if (json.error) {
    console.error(`[judge] Anthropic API error: ${json.error.message}`);
    return null;
  }

  const textBlock = json.content?.find((c) => c.type === 'text');
  if (!textBlock?.text) {
    console.error('[judge] No text in Anthropic response');
    return null;
  }

  // Extract JSON from the response — Claude may wrap it in markdown code fences
  let raw = textBlock.text.trim();
  // Strip markdown code fences (```json ... ```)
  raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  // Extract the outermost JSON object
  const braceStart = raw.indexOf('{');
  const braceEnd = raw.lastIndexOf('}');
  const jsonStr = braceStart >= 0 && braceEnd > braceStart ? raw.slice(braceStart, braceEnd + 1) : raw;

  try {
    return JSON.parse(jsonStr) as JudgeEvalResult;
  } catch {
    // Try repairing common JSON issues from LLM output
    try {
      // Fix unescaped quotes inside strings by replacing problematic patterns
      const repaired = jsonStr
        .replace(/\n/g, '\\n')  // escape literal newlines inside strings
        .replace(/\t/g, '\\t')  // escape tabs
        .replace(/[\x00-\x1f]/g, ' '); // remove control chars
      return JSON.parse(repaired) as JudgeEvalResult;
    } catch {
      // Last resort: extract dimension scores with regex
      const dimensions: Array<{ name: string; score: number; reasoning: string; callouts: string[] }> = [];
      const dimRegex = /"name"\s*:\s*"(\w+)"[\s\S]*?"score"\s*:\s*(\d+)[\s\S]*?"reasoning"\s*:\s*"([^"]*(?:\\"[^"]*)*)"/g;
      let match;
      while ((match = dimRegex.exec(jsonStr)) !== null) {
        dimensions.push({ name: match[1], score: parseInt(match[2], 10), reasoning: match[3].replace(/\\"/g, '"').replace(/\\n/g, ' '), callouts: [] });
      }
      if (dimensions.length > 0) {
        // Extract critical issues
        const issuesMatch = jsonStr.match(/"criticalIssues"\s*:\s*\[([\s\S]*?)\]/);
        const criticalIssues: string[] = [];
        if (issuesMatch) {
          const issueStrings = issuesMatch[1].match(/"([^"]*(?:\\"[^"]*)*)"/g);
          if (issueStrings) {
            for (const s of issueStrings) criticalIssues.push(s.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
          }
        }
        console.log(`[judge] Recovered ${dimensions.length} dimensions via regex fallback`);
        return { dimensions, criticalIssues } as JudgeEvalResult;
      }
      console.error('[judge] Failed to parse JSON. Last 200 chars:', raw.slice(-200));
      return null;
    }
  }
}

// ─── Resume bullet rubric ─────────────────────────────────────────────────────

function buildResumeBulletRubricPrompt(
  resumeText: string,
  jobDescription: string,
  generatedResumeText: string,
): string {
  return `You are evaluating the quality of an AI-generated executive resume. Be a rigorous, honest evaluator. Your scores should reflect actual quality — a 7 means genuinely good, a 4 means noticeably flawed.

## Source Resume (what the candidate actually has on their original resume):
${resumeText.slice(0, 3000)}

## Target Job Description:
${jobDescription.slice(0, 2000)}

## Generated Resume to Evaluate:
${generatedResumeText.slice(0, 4000)}

## Scoring Rubric

Score each dimension 1-10. Be specific — quote actual text from the generated resume when flagging problems.

Dimensions:
1. **preservesExperience** — Does each bullet reflect real experience from the source resume? Flag any bullet where the metric, company, or claim is NOT in the original. Fabricated specifics are a critical failure.
2. **humanVoice** — Does it sound like a senior executive wrote it, or like ChatGPT? Flag AI-speak: "spearheaded", "leveraged", "orchestrated", "drove transformational", "synergized", "cutting-edge", "best-in-class", "robust", "holistic", "dynamic", "fostered a culture of", "championed initiatives".
3. **specificityAndMetrics** — Are bullets specific with real numbers, or vague? Flag: "improved efficiency", "enhanced performance", "increased revenue" without concrete figures. Good bullets have dollar amounts, percentages, team sizes, timeframes.
4. **avoidsClichePatterns** — Does it avoid repetitive sentence structures? Flag if more than 4 bullets start with the same verb (e.g. "Led...", "Managed...", "Developed..."), or if bullets all follow an identical "Action verb + scope + by X% improvement" formula.
5. **executiveSummaryQuality** — Is the executive summary positioning the candidate for THIS specific role, or is it a generic career bio? Does it open with something other than "[Name] is a seasoned professional with X years of..."? Does it avoid cliches?
6. **roleRelevance** — Do the bullets and summary emphasize experience most relevant to the TARGET JD requirements, or do they just mirror the source resume without strategic focus?

Return ONLY valid JSON (no markdown fences, no explanation outside the JSON):
{
  "dimensions": [
    {
      "name": "preservesExperience",
      "score": <1-10>,
      "reasoning": "<1-2 sentences>",
      "callouts": ["<exact quote from generated resume that is problematic>"]
    },
    {
      "name": "humanVoice",
      "score": <1-10>,
      "reasoning": "<1-2 sentences>",
      "callouts": ["<exact AI-speak phrase found>"]
    },
    {
      "name": "specificityAndMetrics",
      "score": <1-10>,
      "reasoning": "<1-2 sentences>",
      "callouts": ["<vague bullet text>"]
    },
    {
      "name": "avoidsClichePatterns",
      "score": <1-10>,
      "reasoning": "<1-2 sentences>",
      "callouts": ["<repeated pattern example>"]
    },
    {
      "name": "executiveSummaryQuality",
      "score": <1-10>,
      "reasoning": "<1-2 sentences>",
      "callouts": ["<problematic phrase from summary>"]
    },
    {
      "name": "roleRelevance",
      "score": <1-10>,
      "reasoning": "<1-2 sentences>",
      "callouts": ["<bullet that misses the JD focus>"]
    }
  ],
  "criticalIssues": ["<anything that would make a senior executive cringe or distrust the output>"]
}`;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

async function evaluateResume(
  captured: CapturedResume,
  apiKey: string,
): Promise<QualityReport> {
  const generatedResumeText = flattenResumeToText(captured.assembledResumeJson);

  const prompt = buildResumeBulletRubricPrompt(
    captured.resumeText,
    captured.jobDescription,
    generatedResumeText,
  );

  console.log(`[eval] Evaluating "${captured.label}" with ${JUDGE_MODEL}...`);

  const result = await callClaudeJudge(prompt, apiKey);

  if (!result) {
    return {
      product: 'Resume V2',
      profileLabel: captured.label,
      overallScore: 0,
      dimensions: [],
      criticalIssues: ['Evaluation failed — could not reach judge or parse response'],
    };
  }

  const dimensions: QualityDimension[] = result.dimensions.map((d) => ({
    name: d.name,
    score: Math.round(d.score),
    reasoning: d.reasoning ?? '',
    callouts: Array.isArray(d.callouts) ? d.callouts : [],
  }));

  const overallScore =
    dimensions.length > 0
      ? Math.round((dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length) * 10) / 10
      : 0;

  return {
    product: 'Resume V2',
    profileLabel: captured.label,
    overallScore,
    dimensions,
    criticalIssues: Array.isArray(result.criticalIssues) ? result.criticalIssues : [],
  };
}

// ─── Report printer ───────────────────────────────────────────────────────────

const DIM_LABELS: Record<string, string> = {
  preservesExperience:    'preservesExperience   ',
  humanVoice:             'humanVoice            ',
  specificityAndMetrics:  'specificityAndMetrics ',
  avoidsClichePatterns:   'avoidsClichePatterns  ',
  executiveSummaryQuality:'executiveSummaryQuality',
  roleRelevance:          'roleRelevance         ',
};

function scoreBar(score: number): string {
  const filled = Math.round(score);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return bar;
}

function scoreLabel(score: number): string {
  if (score >= 8) return 'Good';
  if (score >= 6) return 'Fair';
  if (score >= 4) return 'Weak';
  return 'Poor';
}

function printQualityReport(report: QualityReport): void {
  const width = 80;
  const header = ` Quality Evaluation: ${report.profileLabel} `;
  const pad = Math.max(0, Math.floor((width - header.length) / 2));

  console.log('\n' + '═'.repeat(width));
  console.log(' '.repeat(pad) + header);
  console.log('═'.repeat(width));
  console.log('');

  if (report.dimensions.length === 0) {
    console.log('  Evaluation failed — no dimension scores available.');
    if (report.criticalIssues.length > 0) {
      console.log(`  Error: ${report.criticalIssues[0]}`);
    }
    console.log('');
    return;
  }

  console.log('  Resume Bullet Quality');
  console.log('  ' + '─'.repeat(width - 4));

  for (const dim of report.dimensions) {
    const label = (DIM_LABELS[dim.name] ?? dim.name.padEnd(22)).slice(0, 23);
    const scoreStr = `${dim.score}/10`;
    const bar = scoreBar(dim.score);
    const tag = dim.score < 6 ? ' ⚠' : '';
    console.log(`  ${label}  ${scoreStr.padStart(5)}  ${bar}  ${scoreLabel(dim.score)}${tag}`);

    if (dim.reasoning) {
      // Word-wrap reasoning at 72 chars
      const reasoningLine = `    ${dim.reasoning}`;
      if (reasoningLine.length <= 76) {
        console.log(reasoningLine);
      } else {
        const words = dim.reasoning.split(' ');
        let line = '    ';
        for (const word of words) {
          if ((line + word).length > 76) {
            console.log(line.trimEnd());
            line = '    ' + word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line.trim()) console.log(line.trimEnd());
      }
    }

    if (dim.callouts.length > 0) {
      for (const callout of dim.callouts.slice(0, 3)) {
        const truncated = callout.length > 72 ? callout.slice(0, 69) + '...' : callout;
        console.log(`      -> "${truncated}"`);
      }
    }
  }

  console.log('');
  console.log('  ' + '─'.repeat(width - 4));
  console.log(`  Overall Score: ${report.overallScore}/10`);
  console.log('');

  if (report.criticalIssues.length > 0) {
    console.log('  Critical Issues:');
    for (const issue of report.criticalIssues) {
      const truncated = issue.length > 74 ? issue.slice(0, 71) + '...' : issue;
      console.log(`  • ${truncated}`);
    }
    console.log('');
  }

  console.log('═'.repeat(width));
}

function printSummaryTable(reports: QualityReport[]): void {
  if (reports.length === 0) return;

  console.log('\n\n' + '═'.repeat(80));
  console.log('  QUALITY EVALUATION SUMMARY');
  console.log('═'.repeat(80));

  // Header row
  const allDimNames = reports[0]?.dimensions.map((d) => d.name) ?? [];
  const colWidth = 7;
  const labelWidth = 32;

  const headerParts = ['Profile'.padEnd(labelWidth), 'Ovrl'];
  for (const dim of allDimNames) {
    headerParts.push(dim.slice(0, colWidth - 1).padEnd(colWidth));
  }
  console.log('  ' + headerParts.join('  '));
  console.log('─'.repeat(80));

  for (const report of reports) {
    const label = report.profileLabel.slice(0, labelWidth - 1).padEnd(labelWidth);
    const overall = report.overallScore.toFixed(1).padEnd(4);
    const dimScores = allDimNames.map((name) => {
      const dim = report.dimensions.find((d) => d.name === name);
      return (dim ? dim.score.toString() : '—').padEnd(colWidth);
    });
    console.log('  ' + [label, overall, ...dimScores].join('  '));
  }

  console.log('═'.repeat(80));

  // Worst dimensions across all reports
  const dimTotals: Record<string, { sum: number; count: number }> = {};
  for (const report of reports) {
    for (const dim of report.dimensions) {
      if (!dimTotals[dim.name]) dimTotals[dim.name] = { sum: 0, count: 0 };
      dimTotals[dim.name]!.sum += dim.score;
      dimTotals[dim.name]!.count++;
    }
  }

  const dimAverages = Object.entries(dimTotals)
    .map(([name, { sum, count }]) => ({ name, avg: sum / count }))
    .sort((a, b) => a.avg - b.avg);

  if (dimAverages.length > 0) {
    console.log('\n  Weakest Dimensions (averaged across all profiles):');
    for (const dim of dimAverages.slice(0, 3)) {
      console.log(`  • ${dim.name}: ${dim.avg.toFixed(1)}/10`);
    }
  }

  console.log('');
}

// ─── Cache I/O ────────────────────────────────────────────────────────────────

function loadCache(): CacheFile | null {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    console.warn('[cache] Failed to read cache file — will re-run pipelines');
    return null;
  }
}

function saveCache(results: CapturedResume[]): void {
  const cache: CacheFile = {
    capturedAt: new Date().toISOString(),
    results,
  };
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  console.log(`[cache] Results saved to ${CACHE_FILE}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { profileIndex, skipPipeline } = parseCLIArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Usage: ANTHROPIC_API_KEY=xxx NODE_PATH=server/node_modules npx tsx e2e/quality-evaluator.ts');
    process.exit(1);
  }

  // Determine which profile indices to run
  const indicesToRun =
    profileIndex !== null ? [profileIndex] : EVALUATION_PROFILES;

  console.log('');
  console.log('Resume V2 Quality Evaluator');
  console.log(`Judge model:  ${JUDGE_MODEL}`);
  console.log(`Profiles:     ${indicesToRun.join(', ')}`);
  console.log(`Skip pipeline: ${skipPipeline}`);
  console.log(`API base:     ${API_BASE}`);
  console.log('');

  let capturedResults: CapturedResume[] = [];

  if (skipPipeline) {
    // ── Load from cache ───────────────────────────────────────────────────
    const cache = loadCache();
    if (!cache) {
      console.error('[cache] No cache file found at', CACHE_FILE);
      console.error('Run without --skip-pipeline first to populate the cache.');
      process.exit(1);
    }

    console.log(`[cache] Loaded ${cache.results.length} cached results from ${cache.capturedAt}`);

    // Filter to requested profiles
    capturedResults = cache.results.filter((r) => indicesToRun.includes(r.profileIndex));

    if (capturedResults.length === 0) {
      console.error('[cache] No cached results match the requested profiles');
      process.exit(1);
    }
  } else {
    // ── Run pipelines ─────────────────────────────────────────────────────
    await resetUserUsage();

    let token: string;
    try {
      token = await authenticate();
    } catch (err) {
      console.error('Authentication failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }

    // Reset rate limits (best-effort)
    await fetch(`${API_BASE}/admin/reset-rate-limits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).catch(() => {});

    // Run pipelines sequentially (quality eval doesn't need concurrency)
    for (const idx of indicesToRun) {
      const profile = STRESS_TEST_PROFILES[idx];
      if (!profile) {
        console.error(`Profile index ${idx} not found`);
        continue;
      }

      try {
        const captured = await runAndCapturePipeline(token, idx, profile);
        capturedResults.push(captured);
      } catch (err) {
        console.error(
          `[pipeline-${idx}] Failed:`,
          err instanceof Error ? err.message : err,
        );
        // Continue with remaining profiles
      }
    }

    if (capturedResults.length === 0) {
      console.error('All pipelines failed — nothing to evaluate');
      process.exit(1);
    }

    // Save to cache for --skip-pipeline reruns
    saveCache(capturedResults);
  }

  // ── Run quality evaluations ───────────────────────────────────────────
  const reports: QualityReport[] = [];

  for (const captured of capturedResults) {
    const report = await evaluateResume(captured, apiKey);
    reports.push(report);
    printQualityReport(report);
  }

  // ── Summary table ─────────────────────────────────────────────────────
  if (reports.length > 1) {
    printSummaryTable(reports);
  }

  // Exit with error if any profile scored below 5 overall
  const anyLowScore = reports.some((r) => r.overallScore > 0 && r.overallScore < 5);
  if (anyLowScore) {
    console.log('One or more profiles scored below 5.0/10 — output quality needs attention.\n');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
