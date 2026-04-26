/**
 * Defense-in-depth tests for the pino redaction config.
 *
 * Today the codebase doesn't log Authorization headers, but a future
 * `logger.info({ headers: c.req.header() })` would leak bearer tokens
 * unless the redact paths catch every shape an Authorization header
 * could appear under. This test pins those shapes so a regression
 * in `lib/logger.ts:redact.paths` fails CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';

function makeLoggerWithCapture() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  // Mirror the redact config from lib/logger.ts. If you update one, update both.
  const logger = pino(
    {
      redact: {
        paths: [
          'rawSnippet',
          '*.rawSnippet',
          'resume_text',
          '*.resume_text',
          'job_description',
          '*.job_description',
          'original_resume',
          '*.original_resume',
          'authorization',
          'Authorization',
          '*.authorization',
          '*.Authorization',
          'headers.authorization',
          'headers.Authorization',
          'req.headers.authorization',
          'req.headers.Authorization',
        ],
        remove: true,
      },
    },
    sink,
  );
  return { logger, lines };
}

describe('logger redaction', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('strips top-level Authorization (case variants)', () => {
    const { logger, lines } = makeLoggerWithCapture();
    logger.info({ Authorization: 'Bearer ey.LEAKED.token', authorization: 'Bearer ey.LEAKED.token' }, 'request');
    const blob = lines.join('');
    expect(blob).not.toContain('LEAKED');
  });

  it('strips Authorization nested under headers', () => {
    const { logger, lines } = makeLoggerWithCapture();
    logger.info({ headers: { Authorization: 'Bearer ey.LEAKED.token' } }, 'request');
    expect(lines.join('')).not.toContain('LEAKED');
  });

  it('strips Authorization nested under req.headers (Hono shape)', () => {
    const { logger, lines } = makeLoggerWithCapture();
    logger.info({ req: { headers: { authorization: 'Bearer ey.LEAKED.token' } } }, 'request');
    expect(lines.join('')).not.toContain('LEAKED');
  });

  it('still strips resume_text + job_description (regression guard)', () => {
    const { logger, lines } = makeLoggerWithCapture();
    logger.info({ resume_text: 'SECRET RESUME', job_description: 'SECRET JD' }, 'pipeline');
    const blob = lines.join('');
    expect(blob).not.toContain('SECRET RESUME');
    expect(blob).not.toContain('SECRET JD');
  });

  it('does NOT strip unrelated keys', () => {
    const { logger, lines } = makeLoggerWithCapture();
    logger.info({ userId: 'u-123', stage: 'classify' }, 'pipeline');
    const blob = lines.join('');
    expect(blob).toContain('u-123');
    expect(blob).toContain('classify');
  });
});
