#!/usr/bin/env node
import process from 'node:process';

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const item = raw.slice(2);
    const eq = item.indexOf('=');
    if (eq === -1) {
      out[item] = 'true';
      continue;
    }
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.url ?? process.env.READY_CHECK_URL ?? '').trim();
  const timeoutMs = toPositiveInt(args['timeout-ms'] ?? process.env.READY_CHECK_TIMEOUT_MS, 45_000);
  const intervalMs = toPositiveInt(args['interval-ms'] ?? process.env.READY_CHECK_INTERVAL_MS, 1000);
  const requestTimeoutMs = toPositiveInt(
    args['request-timeout-ms'] ?? process.env.READY_CHECK_REQUEST_TIMEOUT_MS,
    Math.min(intervalMs, 5_000),
  );

  if (!baseUrl) {
    console.error('[check-ready] Missing URL. Set READY_CHECK_URL or pass --url=https://your-host.');
    process.exit(2);
  }

  let readyUrl = '';
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.error(`[check-ready] Unsupported URL protocol: ${parsed.protocol}`);
      process.exit(2);
    }
    if (parsed.username || parsed.password) {
      console.error('[check-ready] URL must not include embedded credentials.');
      process.exit(2);
    }
    readyUrl = `${parsed.toString().replace(/\/+$/, '')}/ready`;
  } catch {
    console.error(`[check-ready] Invalid URL: ${baseUrl}`);
    process.exit(2);
  }
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let lastStatus = 0;
  let lastBody = null;
  let lastError = null;

  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetch(readyUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      lastStatus = res.status;
      const body = await res.json().catch(() => null);
      lastBody = body;
      if (res.ok && body && body.ready === true) {
        console.log(JSON.stringify({
          ok: true,
          ready_url: readyUrl,
          attempts,
          status: res.status,
          body,
        }, null, 2));
        process.exit(0);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(intervalMs);
  }

  console.error(JSON.stringify({
    ok: false,
    ready_url: readyUrl,
    attempts,
    timeout_ms: timeoutMs,
    request_timeout_ms: requestTimeoutMs,
    last_status: lastStatus || null,
    last_body: lastBody,
    last_error: lastError,
  }, null, 2));
  process.exit(1);
}

main().catch((err) => {
  console.error(`[check-ready] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
