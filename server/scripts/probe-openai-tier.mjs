// Phase 5 Week 0 — OpenAI tier headroom probe.
//
// Goal: before flipping FF_V3_SHADOW_ENABLED=true in production, confirm the
// OpenAI project tier supports the expected concurrent-call pattern of the
// smart-hybrid pipeline without hitting rate limits.
//
// A single shadow run fires, in parallel (write stage):
//   ~6-11 write-position calls on gpt-5.4-mini
// Plus sequential:
//   1 strategize + 1 verify on gpt-4.1
//
// This probe simulates that fan-out with small requests and reads the
// x-ratelimit-* headers from the response to report current RPM/TPM limits.
//
// Usage:
//   node --env-file=.env scripts/probe-openai-tier.mjs

const API_KEY = process.env.OpenAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Error: OpenAI_API_KEY (or OPENAI_API_KEY) not set.');
  process.exit(1);
}

const API_BASE = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(model, purpose) {
  const started = Date.now();
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      // gpt-5 family requires max_completion_tokens and rejects custom temperature
      ...(model.startsWith('gpt-5') || /^o\d/.test(model)
        ? { max_completion_tokens: 10 }
        : { max_tokens: 10, temperature: 0 }),
      messages: [{ role: 'user', content: 'Reply with exactly the word OK.' }],
    }),
  });

  const durationMs = Date.now() - started;
  const headers = {};
  for (const [k, v] of res.headers.entries()) {
    if (k.startsWith('x-ratelimit-')) headers[k] = v;
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }

  return {
    purpose,
    model,
    status: res.status,
    ok: res.ok,
    durationMs,
    headers,
    error: body?.error?.message ?? null,
  };
}

async function main() {
  console.log('# Phase 5 Week 0 — OpenAI tier headroom probe');
  console.log(`# Started at: ${new Date().toISOString()}`);
  console.log();

  // Test 1: sequential single-call to each model to capture baseline headers.
  console.log('## Sequential baseline');
  const seqStrategize = await callOpenAI('gpt-4.1', 'strategize-seq');
  console.log(
    `gpt-4.1 (strategize):  status=${seqStrategize.status} ${seqStrategize.durationMs}ms  ` +
      `rpm=${seqStrategize.headers['x-ratelimit-limit-requests'] ?? '?'} ` +
      `rpm-remaining=${seqStrategize.headers['x-ratelimit-remaining-requests'] ?? '?'}  ` +
      `tpm=${seqStrategize.headers['x-ratelimit-limit-tokens'] ?? '?'} ` +
      `tpm-remaining=${seqStrategize.headers['x-ratelimit-remaining-tokens'] ?? '?'}`,
  );
  if (seqStrategize.error) console.log(`  error: ${seqStrategize.error}`);

  const seqWrite = await callOpenAI('gpt-5.4-mini', 'write-position-seq');
  console.log(
    `gpt-5.4-mini (write):  status=${seqWrite.status} ${seqWrite.durationMs}ms  ` +
      `rpm=${seqWrite.headers['x-ratelimit-limit-requests'] ?? '?'} ` +
      `rpm-remaining=${seqWrite.headers['x-ratelimit-remaining-requests'] ?? '?'}  ` +
      `tpm=${seqWrite.headers['x-ratelimit-limit-tokens'] ?? '?'} ` +
      `tpm-remaining=${seqWrite.headers['x-ratelimit-remaining-tokens'] ?? '?'}`,
  );
  if (seqWrite.error) console.log(`  error: ${seqWrite.error}`);
  console.log();

  // Test 2: simulate one shadow run's write fan-out.
  console.log('## Fan-out simulation (10 parallel write-position calls)');
  const fanStart = Date.now();
  const fanoutResults = await Promise.all(
    Array.from({ length: 10 }, (_, i) => callOpenAI('gpt-5.4-mini', `fanout-${i}`)),
  );
  const fanDuration = Date.now() - fanStart;
  const fanSuccess = fanoutResults.filter((r) => r.ok).length;
  const fan429 = fanoutResults.filter((r) => r.status === 429).length;
  const fanOtherErrors = fanoutResults.filter((r) => !r.ok && r.status !== 429).length;
  console.log(
    `  10-parallel gpt-5.4-mini: ${fanSuccess}/10 ok, ${fan429}/10 rate-limited, ${fanOtherErrors}/10 other errors; wall-clock ${fanDuration}ms`,
  );
  if (fanOtherErrors > 0) {
    for (const r of fanoutResults.filter((x) => !x.ok && x.status !== 429)) {
      console.log(`  ✗ ${r.purpose}: status=${r.status} ${r.error ?? ''}`);
    }
  }
  if (fan429 > 0) {
    const r = fanoutResults.find((x) => x.status === 429);
    console.log(
      `  ⚠ 429 rate-limit observed — current tier likely insufficient for shadow fan-out. Consider tier upgrade before Gate 1.`,
    );
    if (r?.headers['x-ratelimit-reset-requests']) {
      console.log(`  rate-limit resets in: ${r.headers['x-ratelimit-reset-requests']}`);
    }
  }
  console.log();

  // Test 3: simulate a full shadow run's OpenAI burst (1 strategize + 10 write + 1 verify).
  console.log('## Full-run simulation (1 strategize + 10 writes + 1 verify, sequential-then-parallel)');
  const runStart = Date.now();
  await callOpenAI('gpt-4.1', 'strategize');
  const writeCalls = Array.from({ length: 10 }, (_, i) => callOpenAI('gpt-5.4-mini', `write-${i}`));
  const writeResults = await Promise.all(writeCalls);
  await callOpenAI('gpt-4.1', 'verify');
  const runDuration = Date.now() - runStart;
  const writeOk = writeResults.filter((r) => r.ok).length;
  console.log(`  full-run parallelism: ${writeOk}/10 writes ok, total ${runDuration}ms`);
  console.log();

  // Summary + recommendation.
  console.log('## Summary');
  const rpmLimit = Number.parseInt(seqStrategize.headers['x-ratelimit-limit-requests'] ?? '0', 10);
  const tpmLimit = Number.parseInt(seqStrategize.headers['x-ratelimit-limit-tokens'] ?? '0', 10);
  const writeRpmLimit = Number.parseInt(seqWrite.headers['x-ratelimit-limit-requests'] ?? '0', 10);

  const EXPECTED_SHADOW_CALLS_PER_MIN = 120; // conservative: 1 shadow run/min × 10 calls avg = 120 rpm burst on the write model
  const HEADROOM_FLOOR = 2.0; // require 2× the expected burst as headroom
  const okRpm = writeRpmLimit >= EXPECTED_SHADOW_CALLS_PER_MIN * HEADROOM_FLOOR;

  console.log(`gpt-4.1 RPM limit: ${rpmLimit}`);
  console.log(`gpt-4.1 TPM limit: ${tpmLimit}`);
  console.log(`gpt-5.4-mini RPM limit: ${writeRpmLimit}`);
  console.log(`Expected shadow burst (write model): ~${EXPECTED_SHADOW_CALLS_PER_MIN} rpm`);
  console.log(`Headroom required (${HEADROOM_FLOOR}×): ${EXPECTED_SHADOW_CALLS_PER_MIN * HEADROOM_FLOOR} rpm`);
  console.log();

  if (fan429 > 0) {
    console.log('RECOMMENDATION: ⚠ TIER UPGRADE REQUIRED before shadow activation.');
    console.log('  Observed 429 rate-limit during 10-parallel write simulation.');
    console.log('  Request tier upgrade via OpenAI dashboard → Billing → Usage tier.');
  } else if (!okRpm) {
    console.log('RECOMMENDATION: ⚠ Headroom is thin. Consider tier upgrade.');
    console.log(`  Current RPM limit ${writeRpmLimit} < ${EXPECTED_SHADOW_CALLS_PER_MIN * HEADROOM_FLOOR} target.`);
  } else {
    console.log('RECOMMENDATION: ✓ Current tier supports expected shadow volume.');
    console.log(`  RPM limit ${writeRpmLimit} >= ${EXPECTED_SHADOW_CALLS_PER_MIN * HEADROOM_FLOOR} (2× expected burst).`);
  }
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
