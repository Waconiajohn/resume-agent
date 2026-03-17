/**
 * Agent Hot-Reload — Development-only file watcher for agent config directories.
 *
 * When HOT_RELOAD=true and NODE_ENV=development, watches agent source directories
 * for changes and logs invalidation notices so developers know a server restart
 * is needed to pick up the change.
 *
 * Safety rules:
 *  1. Only active when NODE_ENV === 'development' AND HOT_RELOAD === 'true'.
 *  2. Never performs live code replacement (Node ESM module cache is not
 *     patchable at runtime without vm.Module; the goal is dev visibility).
 *  3. Guards against mid-execution reloads by tracking active pipeline sessions.
 *     If a pipeline is running for an agent's domain, the reload notice is
 *     deferred until no sessions are active.
 *
 * Opt-in via: HOT_RELOAD=true in server/.env
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../../lib/logger.js';

const DEBOUNCE_MS = 300;
const MAX_DEFERRED_NOTICES = 50;

// Directories to watch — relative to `server/src/agents/`
const AGENT_SUBDIRS = [
  'strategist',
  'craftsman',
  'producer',
  'cover-letter',
  'executive-bio',
  'thank-you-note',
  'case-study',
  'linkedin-optimizer',
  'linkedin-editor',
  'linkedin-content',
  'job-finder',
  'job-tracker',
  'networking-outreach',
  'interview-prep',
  'salary-negotiation',
  'ninety-day-plan',
  'content-calendar',
  'onboarding',
  'retirement-bridge',
  'runtime',
  'knowledge',
  'resume',
];

interface ActivePipelineTracker {
  hasActivePipeline(domain: string): boolean;
}

interface DeferredNotice {
  domain: string;
  filePath: string;
  event: string;
  detectedAt: number;
}

let watchers: fs.FSWatcher[] = [];
let deferredNotices: DeferredNotice[] = [];
let isRunning = false;
let pipelineTracker: ActivePipelineTracker | null = null;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Register a pipeline tracker so hot-reload can guard against reloading
 * while an agent's pipeline is mid-execution.
 */
export function registerPipelineTracker(tracker: ActivePipelineTracker): void {
  pipelineTracker = tracker;
}

function deriveAgentDomain(filePath: string, watchedDir: string): string {
  // Extract the subdirectory name that maps to the agent domain
  const relative = path.relative(watchedDir, filePath);
  const parts = relative.split(path.sep);
  return parts[0] ?? path.basename(watchedDir);
}

function emitReloadNotice(domain: string, filePath: string, event: string): void {
  if (pipelineTracker?.hasActivePipeline(domain)) {
    // Defer: active pipeline — do not disrupt mid-execution
    if (deferredNotices.length < MAX_DEFERRED_NOTICES) {
      deferredNotices.push({ domain, filePath, event, detectedAt: Date.now() });
      logger.debug(
        { domain, filePath, event },
        '[hot-reload] Change detected but pipeline is active — deferring notice',
      );
    }
    return;
  }

  logger.info(
    { domain, filePath, event },
    '[hot-reload] Agent file changed — restart server to apply: `npm run dev`',
  );
}

function flushDeferredNotices(): void {
  if (deferredNotices.length === 0) return;

  const now = deferredNotices;
  deferredNotices = [];

  for (const notice of now) {
    emitReloadNotice(notice.domain, notice.filePath, notice.event);
  }
}

function watchDirectory(dirPath: string, agentsRoot: string): void {
  if (!fs.existsSync(dirPath)) return;

  try {
    const watcher = fs.watch(dirPath, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.ts') && !filename.endsWith('.js')) return;

      const fullPath = path.join(dirPath, filename);
      const domain = deriveAgentDomain(fullPath, agentsRoot);
      const debounceKey = `${domain}:${filename}`;

      // Debounce: editors emit multiple events on save
      const existing = debounceTimers.get(debounceKey);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        debounceTimers.delete(debounceKey);
        emitReloadNotice(domain, fullPath, event);
        // Also flush any deferred notices from prior changes
        flushDeferredNotices();
      }, DEBOUNCE_MS);

      debounceTimers.set(debounceKey, timer);
    });

    watcher.on('error', (err) => {
      logger.warn({ err, dirPath }, '[hot-reload] Watcher error');
    });

    watchers.push(watcher);
  } catch (err) {
    logger.warn({ err, dirPath }, '[hot-reload] Could not watch directory');
  }
}

/**
 * Start watching agent directories for changes.
 *
 * Only activates when:
 *  - NODE_ENV === 'development'
 *  - HOT_RELOAD === 'true'
 *
 * Safe to call multiple times — only starts once.
 */
export function startHotReload(): void {
  if (isRunning) return;

  const isDev = process.env.NODE_ENV === 'development';
  const isEnabled = process.env.HOT_RELOAD === 'true';

  if (!isDev || !isEnabled) return;

  const thisFile = fileURLToPath(import.meta.url);
  const agentsRoot = path.resolve(path.dirname(thisFile), '..');

  logger.info({ agentsRoot }, '[hot-reload] Starting agent file watcher (development only)');

  for (const subdir of AGENT_SUBDIRS) {
    const dirPath = path.join(agentsRoot, subdir);
    watchDirectory(dirPath, agentsRoot);
  }

  isRunning = true;

  logger.info(
    { watchedDirs: AGENT_SUBDIRS.length, debounceMs: DEBOUNCE_MS },
    '[hot-reload] Watching agent directories — file changes will log reload notices',
  );
}

/**
 * Stop all watchers and clean up timers.
 * Called during server shutdown.
 */
export function stopHotReload(): void {
  if (!isRunning) return;

  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
      // ignore close errors during shutdown
    }
  }
  watchers = [];
  deferredNotices = [];
  isRunning = false;

  logger.info('[hot-reload] Stopped');
}

/** Check whether hot-reload is currently active. */
export function isHotReloadActive(): boolean {
  return isRunning;
}
