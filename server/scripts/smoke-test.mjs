#!/usr/bin/env node
/**
 * Production smoke test — verifies deployment health.
 * Usage: BASE_URL=https://api.careeragent.ai node server/scripts/smoke-test.mjs
 * Optional: SMOKE_TEST_TOKEN=<jwt> for authenticated checks
 * Exit 0 on success, 1 on any failure.
 */

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const TOKEN = process.env.SMOKE_TEST_TOKEN || '';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// Colored console output helpers
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetries(name, fn) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(yellow(`  \u27f3 ${name}: retry ${attempt}/${MAX_RETRIES} \u2014 ${err.message}`));
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
}

async function checkHealth() {
  const res = await fetchWithTimeout(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`expected HTTP 200, got ${res.status}`);
  }
  const body = await res.json();
  if (body.status !== 'ok') {
    throw new Error(`expected status "ok", got "${body.status}" (db_ok=${body.db_ok}, llm_key_present=${body.llm_key_present})`);
  }
}

async function checkReady() {
  const res = await fetchWithTimeout(`${BASE_URL}/ready`);
  if (res.status !== 200) {
    throw new Error(`expected HTTP 200, got ${res.status}`);
  }
  const body = await res.json();
  if (body.ready !== true) {
    throw new Error(`expected ready=true, got ready=${body.ready} (db_ok=${body.db_ok}, llm_key_ok=${body.llm_key_ok})`);
  }
}

async function checkAuth() {
  if (!TOKEN) {
    return 'skipped';
  }
  const res = await fetchWithTimeout(`${BASE_URL}/api/sessions?limit=1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (res.status !== 200) {
    throw new Error(`expected HTTP 200, got ${res.status}`);
  }
}

const checks = [
  { name: 'Health', fn: checkHealth },
  { name: 'Readiness', fn: checkReady },
  { name: 'Authenticated API', fn: checkAuth },
];

let passed = 0;
let failed = 0;
let skipped = 0;

console.log(bold(`\nSmoke Test \u2014 ${BASE_URL}\n`));

for (const check of checks) {
  try {
    const result = await withRetries(check.name, check.fn);
    if (result === 'skipped') {
      console.log(yellow(`  \u2296 ${check.name}: skipped`));
      skipped++;
    } else {
      console.log(green(`  \u2713 ${check.name}: passed`));
      passed++;
    }
  } catch (err) {
    console.log(red(`  \u2717 ${check.name}: ${err.message}`));
    failed++;
  }
}

const parts = [green(`${passed} passed`)];
if (skipped) parts.push(yellow(`${skipped} skipped`));
if (failed) parts.push(red(`${failed} failed`));

console.log(`\n${bold('Results:')} ${parts.join(', ')}\n`);
process.exit(failed > 0 ? 1 : 0);
