import * as Sentry from '@sentry/node';
import logger from './logger.js';

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

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Strip sensitive environment variables from event data
      if (event.extra) {
        for (const key of SENSITIVE_ENV_KEYS) {
          if (key in event.extra) {
            event.extra[key] = '[REDACTED]';
          }
        }
      }

      // Scrub breadcrumb data that might contain API keys
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data) {
            for (const key of Object.keys(crumb.data)) {
              const lowerKey = key.toLowerCase();
              if (
                lowerKey.includes('key') ||
                lowerKey.includes('token') ||
                lowerKey.includes('secret') ||
                lowerKey.includes('authorization')
              ) {
                crumb.data[key] = '[REDACTED]';
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

  Sentry.withScope((scope) => {
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
  Sentry.setUser({ id: userId });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Best-effort flush during shutdown
  }
}
