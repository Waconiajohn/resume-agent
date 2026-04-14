/**
 * Model A/B comparison: Run profile 0 through 3 different models
 * and compare the raw resume output quality.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');

const SUPABASE_URL = 'https://pvmfgfnbtqlipnnoeixu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XPbIzrH67TbmMQggn9QN_A_16iB5oPG';

const MODELS_TO_TEST = [
  { label: 'Qwen3 32B (current)', provider: 'groq', primary: 'qwen/qwen3-32b' },
  { label: 'DeepSeek V3.2', provider: 'deepseek', primary: 'deepseek-chat' },
  { label: 'Z.AI GLM-4.7', provider: 'zai', primary: 'glm-4.7' },
];

const profileArg = process.argv.find(a => a.startsWith('--model='));
const modelIndex = profileArg ? parseInt(profileArg.split('=')[1], 10) : -1;

async function getToken(): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email: 'jjschrup@yahoo.com', password: 'Scout123' });
  if (error) throw new Error(`Auth: ${error.message}`);
  return data.session!.access_token;
}

// This test works by setting LLM_PROVIDER env var and restarting the server.
// Since we can't restart the server mid-script, we'll test whatever model
// the server is currently configured for.
// 
// To test different models, change model-constants.ts and restart the server,
// then run: NODE_PATH=server/node_modules npx tsx e2e/model-compare.ts

async function run() {
  const token = await getToken();
  console.log('Authenticated. Testing current server model configuration.\n');
  
  // Import profile
  const { STRESS_TEST_PROFILES } = await import('./fixtures/stress-test-profiles.js');
  const profile = STRESS_TEST_PROFILES[0];
  const resumeText = (profile as any).resumeText ?? (profile as any).resume_text;
  const jobDescription = (profile as any).jobDescription ?? (profile as any).job_description;

  const API_BASE = 'http://localhost:3001/api';

  // Start pipeline
  const startRes = await fetch(`${API_BASE}/pipeline/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription }),
  });
  const startData = await startRes.json() as { session_id: string };
  console.log(`Pipeline started: ${startData.session_id}`);

  // Stream SSE
  const streamRes = await fetch(`${API_BASE}/pipeline/${startData.session_id}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assembledResume: any = null;
  let pendingCards: any[] = [];
  const startTime = Date.now();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes('\n\n')) {
      const idx = buffer.indexOf('\n\n');
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let eventType = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
      }
      if (!dataLine || eventType === 'heartbeat' || eventType === 'connected') continue;

      try {
        const parsed = JSON.parse(dataLine);
        const type = parsed.type ?? eventType;

        if (type === 'stage_start') process.stdout.write(`  ${parsed.stage}..`);

        if (type === 'gap_coaching' && Array.isArray(parsed.data)) {
          pendingCards = parsed.data;
        }

        if (type === 'pipeline_gate' && (parsed.gate === 'gap_coaching' || parsed.data?.gate === 'gap_coaching')) {
          // Auto-approve with context for partial, skip for missing
          const responses = pendingCards.map((card: any) => {
            if (card.classification === 'missing') return { requirement: card.requirement, action: 'skip' };
            if (card.classification === 'partial') return {
              requirement: card.requirement,
              action: 'context',
              user_context: `Yes, I have experience with this. ${(card.evidence_found ?? []).slice(0, 2).join('. ')}`,
            };
            return { requirement: card.requirement, action: 'approve' };
          });
          await fetch(`${API_BASE}/pipeline/${startData.session_id}/respond-gaps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ responses }),
          });
          pendingCards = [];
        }

        if (type === 'assembly_complete') {
          assembledResume = (parsed.data ?? parsed)?.final_resume;
        }

        if (type === 'pipeline_complete' || type === 'pipeline_error') {
          if (type === 'pipeline_error') console.log(`\n  ERROR: ${parsed.error ?? 'unknown'}`);
          break;
        }
      } catch {}
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n  Completed in ${elapsed}s\n`);

  if (!assembledResume) {
    console.log('No assembled resume captured.');
    return;
  }

  // Print summary
  console.log('='.repeat(80));
  console.log('EXECUTIVE SUMMARY:');
  console.log(assembledResume.executive_summary?.content ?? 'N/A');
  
  console.log('\nFIRST 5 EXPERIENCE BULLETS (VP role):');
  const vpRole = assembledResume.professional_experience?.[0];
  if (vpRole) {
    for (const b of (vpRole.bullets ?? []).slice(0, 5)) {
      const rs = b.review_state ?? 'none';
      const flag = rs === 'code_red' ? '🔴' : rs === 'confirm_fit' ? '🟡' : rs === 'strengthen' ? '🟡' : '✅';
      console.log(`  ${flag} ${b.text}`);
    }
  }

  // Count states
  const allBullets = (assembledResume.professional_experience ?? []).flatMap((e: any) => e.bullets ?? []);
  const green = allBullets.filter((b: any) => b.review_state === 'supported' || b.review_state === 'supported_rewrite').length;
  const yellow = allBullets.filter((b: any) => b.review_state === 'confirm_fit' || b.review_state === 'strengthen').length;
  const red = allBullets.filter((b: any) => b.review_state === 'code_red').length;
  console.log(`\nBULLET DISTRIBUTION: ${allBullets.length} total | ${green} green | ${yellow} yellow | ${red} red`);
  console.log('='.repeat(80));
}

run().catch(console.error);
