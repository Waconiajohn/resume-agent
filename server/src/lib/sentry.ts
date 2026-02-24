import { createRequire } from 'node:module';
import logger from './logger.js';

type SentryLike = {
  init: (options: {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
    beforeSend?: (event: Record<string, unknown>) => Record<string, unknown> | null;
  }) => void;
  withScope: (callback: (scope: { setExtra: (key: string, value: unknown) => void }) => void) => void;
  captureException: (err: unknown) => void;
  setUser: (user: { id: string } | null) => void;
  flush: (timeoutMs?: number) => Promise<unknown>;
};

const require = createRequire(import.meta.url);
let sentryModule: SentryLike | null | undefined;

function getSentry(): SentryLike | null {
  if (sentryModule !== undefined) return sentryModule;
  try {
    const loaded = require('@sentry/node') as Partial<SentryLike>;
    if (
      typeof loaded.init === 'function'
      && typeof loaded.withScope === 'function'
      && typeof loaded.captureException === 'function'
      && typeof loaded.setUser === 'function'
      && typeof loaded.flush === 'function'
    ) {
      sentryModule = loaded as SentryLike;
    } else {
      sentryModule = null;
    }
  } catch {
    sentryModule = null;
  }
  return sentryModule;
}

const SENSITIVE_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'ZAI_API_KEY',
  'PERPLEXITY_API_KEY',
  'ANTHROPIC_API_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SENTRY_DSN',
];

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('SENTRY_DSN not set — Sentry disabled');
    return;
  }
  const Sentry = getSentry();
  if (!Sentry) {
    logger.warn('Sentry requested but @sentry/node is not installed — continuing without Sentry');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend(event: Record<string, unknown>) {
      // Strip sensitive environment variables from event data
      const extra = (event.extra && typeof event.extra === 'object' && !Array.isArray(event.extra))
        ? (event.extra as Record<string, unknown>)
        : null;
      if (extra) {
        for (const key of SENSITIVE_ENV_KEYS) {
          if (key in extra) {
            extra[key] = '[REDACTED]';
          }
        }
      }

      // Scrub breadcrumb data that might contain API keys
      const breadcrumbs = Array.isArray(event.breadcrumbs)
        ? (event.breadcrumbs as Array<Record<string, unknown>>)
        : null;
      if (breadcrumbs) {
        for (const crumb of breadcrumbs) {
          const crumbData = crumb.data && typeof crumb.data === 'object' && !Array.isArray(crumb.data)
            ? (crumb.data as Record<string, unknown>)
            : null;
          if (crumbData) {
            for (const key of Object.keys(crumbData)) {
              const lowerKey = key.toLowerCase();
              if (
                lowerKey.includes('key') ||
                lowerKey.includes('token') ||
                lowerKey.includes('secret') ||
                lowerKey.includes('authorization')
              ) {
                crumbData[key] = '[REDACTED]';
              }
            }
          }
        }
      }

      return event;
    },
  });

  logger.info('Sentry initialized');
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = getSentry();
  if (!Sentry) return;

  Sentry.withScope((scope: { setExtra: (key: string, value: unknown) => void }) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(err);
  });
}

export function setSentryUser(userId: string): void {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry.setUser({ id: userId });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = getSentry();
  if (!Sentry) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Best-effort flush during shutdown
  }
}
