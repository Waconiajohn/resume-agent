#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

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

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function runSupabaseMigrationList() {
  const child = spawnSync(
    'supabase',
    ['migration', 'list', '--linked', '--workdir', repoRoot],
    { encoding: 'utf8', env: process.env },
  );

  const stdout = child.stdout ?? '';
  const stderr = child.stderr ?? '';
  const combined = `${stdout}\n${stderr}`.trim();

  if (child.status !== 0) {
    throw new Error(combined || `supabase migration list exited ${child.status}`);
  }

  return combined;
}

function parseListTable(output) {
  const local = new Set();
  const remote = new Set();

  for (const line of output.split('\n')) {
    if (!line.includes('|')) continue;
    if (line.includes('Local') && line.includes('Remote')) continue;
    if (line.includes('---')) continue;

    const cols = line.split('|').map((v) => v.trim());
    if (cols.length < 2) continue;

    const localVersion = cols[0];
    const remoteVersion = cols[1];

    if (/^\d+$/.test(localVersion)) local.add(localVersion);
    if (/^\d+$/.test(remoteVersion)) remote.add(remoteVersion);
  }

  return {
    local: Array.from(local).sort(),
    remote: Array.from(remote).sort(),
  };
}

function diffVersions(local, remote) {
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  return {
    remoteOnly: remote.filter((v) => !localSet.has(v)),
    localOnly: local.filter((v) => !remoteSet.has(v)),
  };
}

function printHumanReport(summary) {
  console.log(`Migration drift check: ${summary.ok ? 'OK' : 'DRIFT DETECTED'}`);
  console.log(`Local versions:  ${summary.local_count}`);
  console.log(`Remote versions: ${summary.remote_count}`);
  if (summary.remote_only.length > 0) {
    console.log(`Remote-only: ${summary.remote_only.join(', ')}`);
  }
  if (summary.local_only.length > 0) {
    console.log(`Local-only:  ${summary.local_only.join(', ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const json = toBool(args.json, true);

  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error('SUPABASE_ACCESS_TOKEN is required. Source server/.env first.');
    process.exit(2);
  }

  const output = runSupabaseMigrationList();
  const parsed = parseListTable(output);
  const diff = diffVersions(parsed.local, parsed.remote);
  const summary = {
    ok: diff.remoteOnly.length === 0 && diff.localOnly.length === 0,
    local_count: parsed.local.length,
    remote_count: parsed.remote.length,
    remote_only: diff.remoteOnly,
    local_only: diff.localOnly,
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHumanReport(summary);
  }

  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[check-migration-drift] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
