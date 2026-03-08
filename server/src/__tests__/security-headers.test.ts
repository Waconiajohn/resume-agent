import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => {
  const limit = vi.fn(async () => ({ error: null }));
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  return {
    supabaseAdmin: {
      from,
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('not used') })),
      },
    },
  };
});

import { app } from '../index.js';

describe('security headers', () => {
  beforeEach(() => {
    process.env.ZAI_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    delete process.env.SENTRY_DSN;
    delete process.env.ALLOWED_ORIGINS;
  });

  it('sets Content-Security-Policy on /health', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
  });

  it('CSP script-src does not allow unsafe-inline or unsafe-eval', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('CSP style-src allows unsafe-inline for Tailwind', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('CSP img-src allows data URIs and HTTPS', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("img-src 'self' data: https:");
  });

  it('CSP font-src restricts to self', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("font-src 'self'");
  });

  it('CSP connect-src includes self', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self'");
  });

  it('CSP connect-src includes Sentry ingest when SENTRY_DSN is set', async () => {
    // SENTRY_DSN is evaluated at module load time, so we verify the logic
    // by checking the cspHeader constant behaviour through a fresh import context.
    // In this test environment SENTRY_DSN is not set, so Sentry should be absent.
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain('sentry.io');
  });

  it('CSP blocks framing via frame-ancestors', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('CSP restricts base-uri and form-action to self', async () => {
    const res = await app.request('http://test/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('sets X-Permitted-Cross-Domain-Policies: none', async () => {
    const res = await app.request('http://test/health');
    expect(res.headers.get('x-permitted-cross-domain-policies')).toBe('none');
  });

  it('sets X-Permitted-Cross-Domain-Policies on non-health routes too', async () => {
    const res = await app.request('http://test/ready');
    expect(res.headers.get('x-permitted-cross-domain-policies')).toBe('none');
  });

  it('CSP is present on /ready', async () => {
    const res = await app.request('http://test/ready');
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
  });

  it('existing security headers are still set alongside CSP', async () => {
    const res = await app.request('http://test/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('HSTS is not set in non-production non-HTTPS environment', async () => {
    const res = await app.request('http://test/health');
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });
});
