/**
 * Sentry Alert Enrichment — Unit tests for captureErrorWithContext.
 *
 * Story: 53-1 — Sentry Alert Enrichment
 * Verifies that captureErrorWithContext correctly sets tags, levels,
 * fingerprints, and extra context on the Sentry scope, and that
 * captureError backward compatibility is preserved.
 *
 * Architecture note: sentry.ts uses createRequire() to load @sentry/node,
 * which goes through Node's native require. The module's sentryModule cache
 * is reset between tests via vi.resetModules() + dynamic import so each
 * test group gets a fresh Sentry instance with a predictable mock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Shared scope mock refs — updated per-test in setupWithScope() ─────────────

const mockSetTag = vi.fn();
const mockSetLevel = vi.fn();
const mockSetFingerprint = vi.fn();
const mockSetExtra = vi.fn();
const mockCaptureException = vi.fn();
const mockWithScope = vi.fn();
const mockInit = vi.fn();

// The scope object passed to withScope callbacks
const sentryScope = {
  setTag: mockSetTag,
  setLevel: mockSetLevel,
  setFingerprint: mockSetFingerprint,
  setExtra: mockSetExtra,
};

// The mock Sentry module that Node's require will see
const mockSentryModule = {
  init: mockInit,
  withScope: mockWithScope,
  captureException: mockCaptureException,
  setUser: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
};

// ─── Logger mock ──────────────────────────────────────────────────────────────

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Configure withScope to call its callback synchronously with the scope mock.
 */
function setupWithScope() {
  mockWithScope.mockImplementation((cb: (scope: typeof sentryScope) => void) => {
    cb(sentryScope);
  });
}

/**
 * Register the mock Sentry module in Node's require cache so createRequire
 * picks it up. Returns a cleanup function to restore.
 */
function injectSentryRequireMock(): () => void {
  // Node require cache key for @sentry/node
  const sentryKey = require.resolve('@sentry/node');
  const original = require.cache[sentryKey];
  require.cache[sentryKey] = {
    id: sentryKey,
    filename: sentryKey,
    loaded: true,
    exports: mockSentryModule,
    paths: [],
    children: [],
    parent: undefined,
    require: require,
  } as unknown as NodeJS.Module;
  return () => {
    if (original) {
      require.cache[sentryKey] = original;
    } else {
      delete require.cache[sentryKey];
    }
  };
}

// ─── captureErrorWithContext tests ────────────────────────────────────────────

describe('captureErrorWithContext', () => {
  const originalEnv = process.env;
  let restoreRequireCache: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    setupWithScope();
    process.env = { ...originalEnv, SENTRY_DSN: 'https://key@sentry.io/123' };
    restoreRequireCache = injectSentryRequireMock();
    // Reset sentry module cache so getSentry() re-runs
    vi.resetModules();
  });

  afterEach(() => {
    restoreRequireCache();
    process.env = originalEnv;
    vi.resetModules();
  });

  it('sets the severity tag from opts.severity', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), { severity: 'P1', category: 'pipeline_error' });
    expect(mockSetTag).toHaveBeenCalledWith('severity', 'P1');
  });

  it('sets the category tag from opts.category', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), { severity: 'P2', category: 'llm_timeout' });
    expect(mockSetTag).toHaveBeenCalledWith('category', 'llm_timeout');
  });

  it('sets the session_id tag when sessionId is provided', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), {
      severity: 'P1',
      category: 'db_error',
      sessionId: 'session-abc-123',
    });
    expect(mockSetTag).toHaveBeenCalledWith('session_id', 'session-abc-123');
  });

  it('does not set session_id tag when sessionId is omitted', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), { severity: 'P2', category: 'auth_failure' });
    const sessionIdCall = mockSetTag.mock.calls.find(([key]) => key === 'session_id');
    expect(sessionIdCall).toBeUndefined();
  });

  it('sets the stage tag when stage is provided', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), {
      severity: 'P0',
      category: 'pipeline_error',
      stage: 'craftsman',
    });
    expect(mockSetTag).toHaveBeenCalledWith('stage', 'craftsman');
  });

  it('sets the fingerprint when fingerprint is provided', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), {
      severity: 'P0',
      category: 'pipeline_error',
      fingerprint: ['pipeline_error', 'resume', 'craftsman'],
    });
    expect(mockSetFingerprint).toHaveBeenCalledWith(['pipeline_error', 'resume', 'craftsman']);
  });

  it('maps P0 severity to "fatal" Sentry level', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('fatal error'), { severity: 'P0', category: 'uncaught_exception' });
    expect(mockSetLevel).toHaveBeenCalledWith('fatal');
  });

  it('maps P1 severity to "error" Sentry level', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('error'), { severity: 'P1', category: 'unhandled_rejection' });
    expect(mockSetLevel).toHaveBeenCalledWith('error');
  });

  it('maps P2 severity to "warning" Sentry level', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('warning'), { severity: 'P2', category: 'llm_timeout' });
    expect(mockSetLevel).toHaveBeenCalledWith('warning');
  });

  it('passes extra context via setExtra for each key', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), {
      severity: 'P0',
      category: 'unhandled_request_error',
      extra: { path: '/api/pipeline', method: 'POST', requestId: 'req-001' },
    });
    expect(mockSetExtra).toHaveBeenCalledWith('path', '/api/pipeline');
    expect(mockSetExtra).toHaveBeenCalledWith('method', 'POST');
    expect(mockSetExtra).toHaveBeenCalledWith('requestId', 'req-001');
  });

  it('is a no-op when SENTRY_DSN is not set', async () => {
    delete process.env.SENTRY_DSN;
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    captureErrorWithContext(new Error('test'), { severity: 'P0', category: 'pipeline_error' });
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('calls captureException with the original error object', async () => {
    const { captureErrorWithContext } = await import('../lib/sentry.js');
    const err = new Error('original error');
    captureErrorWithContext(err, { severity: 'P1', category: 'pipeline_error' });
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });
});

// ─── initSentry release tests ─────────────────────────────────────────────────

describe('initSentry release tracking', () => {
  const originalEnv = process.env;
  let restoreRequireCache: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    setupWithScope();
    restoreRequireCache = injectSentryRequireMock();
    vi.resetModules();
  });

  afterEach(() => {
    restoreRequireCache();
    process.env = originalEnv;
    vi.resetModules();
  });

  it('passes RAILWAY_GIT_COMMIT_SHA as release to Sentry.init', async () => {
    process.env = {
      ...originalEnv,
      SENTRY_DSN: 'https://key@sentry.io/123',
      RAILWAY_GIT_COMMIT_SHA: 'abc123def456',
    };
    const { initSentry } = await import('../lib/sentry.js');
    initSentry();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ release: 'abc123def456' }),
    );
  });

  it('passes undefined release when RAILWAY_GIT_COMMIT_SHA is not set', async () => {
    process.env = { ...originalEnv, SENTRY_DSN: 'https://key@sentry.io/123' };
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    const { initSentry } = await import('../lib/sentry.js');
    initSentry();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ release: undefined }),
    );
  });
});

// ─── captureError backward compatibility ──────────────────────────────────────

describe('captureError (backward compatibility)', () => {
  const originalEnv = process.env;
  let restoreRequireCache: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    setupWithScope();
    process.env = { ...originalEnv, SENTRY_DSN: 'https://key@sentry.io/123' };
    restoreRequireCache = injectSentryRequireMock();
    vi.resetModules();
  });

  afterEach(() => {
    restoreRequireCache();
    process.env = originalEnv;
    vi.resetModules();
  });

  it('still captures the error via captureException', async () => {
    const { captureError } = await import('../lib/sentry.js');
    const err = new Error('legacy error');
    captureError(err, { source: 'unhandledRejection' });
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it('sets context as extra fields on the scope', async () => {
    const { captureError } = await import('../lib/sentry.js');
    const err = new Error('legacy error');
    captureError(err, { sessionId: 'sess-001', stage: 'strategist' });
    expect(mockSetExtra).toHaveBeenCalledWith('sessionId', 'sess-001');
    expect(mockSetExtra).toHaveBeenCalledWith('stage', 'strategist');
  });

  it('is a no-op when SENTRY_DSN is not set', async () => {
    delete process.env.SENTRY_DSN;
    const { captureError } = await import('../lib/sentry.js');
    captureError(new Error('test'), { source: 'test' });
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
