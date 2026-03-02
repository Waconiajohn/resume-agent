/**
 * Resume Route Hooks — Unit Tests
 *
 * Sprint 13, Story 5.
 *
 * Covers:
 * - SSRF protection: isPrivateIPv4, isPrivateIPv6, isPrivateHost
 * - JD URL resolution: URL vs plain text detection, HTML extraction
 * - hasRunningPipelineCapacity (via getPipelineRouteStats shape)
 * - getPipelineRouteStats: expected shape
 * - resumeOnRespond: calls persistQuestionResponseBestEffort
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock external dependencies ───────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
          single: vi.fn(async () => ({ data: null, error: null })),
          upsert: vi.fn(async () => ({ error: null })),
        })),
        upsert: vi.fn(async () => ({ error: null })),
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
      upsert: vi.fn(async () => ({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({ data: 1, error: null })),
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

vi.mock('../lib/http-body-guard.js', () => ({
  parsePositiveInt: vi.fn((_raw: unknown, fallback: number) => fallback),
}));

vi.mock('../lib/workflow-nodes.js', () => ({
  WORKFLOW_NODE_KEYS: ['overview', 'benchmark', 'gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'],
  workflowNodeFromStage: vi.fn((stage: string) => stage),
  isWorkflowNodeKey: vi.fn(() => true),
}));

vi.mock('../routes/sessions.js', () => ({
  sseConnections: new Map(),
}));

vi.mock('../routes/product-route-factory.js', () => ({
  STALE_PIPELINE_MS: 15 * 60 * 1000,
}));

// Import after mocks are set up
import {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateHost,
  resolveJobDescriptionInput,
  extractVisibleTextFromHtml,
  getPipelineRouteStats,
  resumeOnRespond,
  persistQuestionResponseBestEffort,
} from '../agents/resume/route-hooks.js';

// ─── SSRF protection ──────────────────────────────────────────────────

describe('isPrivateIPv4', () => {
  it('returns true for loopback', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true);
  });

  it('returns true for 10.x.x.x', () => {
    expect(isPrivateIPv4('10.0.0.1')).toBe(true);
    expect(isPrivateIPv4('10.255.255.255')).toBe(true);
  });

  it('returns true for 172.16-31 range', () => {
    expect(isPrivateIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateIPv4('172.31.255.255')).toBe(true);
    expect(isPrivateIPv4('172.15.0.1')).toBe(false);
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
  });

  it('returns true for 192.168.x.x', () => {
    expect(isPrivateIPv4('192.168.1.1')).toBe(true);
    expect(isPrivateIPv4('192.168.0.0')).toBe(true);
  });

  it('returns true for 0.0.0.0/8', () => {
    expect(isPrivateIPv4('0.0.0.1')).toBe(true);
  });

  it('returns true for link-local 169.254.x.x', () => {
    expect(isPrivateIPv4('169.254.0.1')).toBe(true);
    expect(isPrivateIPv4('169.254.169.254')).toBe(true); // AWS metadata
  });

  it('returns false for public IPs', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('1.1.1.1')).toBe(false);
    expect(isPrivateIPv4('104.21.3.5')).toBe(false);
  });

  it('returns true for malformed IP strings', () => {
    expect(isPrivateIPv4('not-an-ip')).toBe(true);
    expect(isPrivateIPv4('256.0.0.1')).toBe(true);
    expect(isPrivateIPv4('')).toBe(true);
  });
});

describe('isPrivateIPv6', () => {
  it('returns true for loopback ::1', () => {
    expect(isPrivateIPv6('::1')).toBe(true);
  });

  it('returns true for unspecified ::', () => {
    expect(isPrivateIPv6('::')).toBe(true);
  });

  it('returns true for IPv4-mapped loopback ::ffff:127.0.0.1', () => {
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
  });

  it('returns true for unique local fc00::/7', () => {
    expect(isPrivateIPv6('fc00::1')).toBe(true);
    expect(isPrivateIPv6('fd00::1')).toBe(true);
  });

  it('returns true for link-local fe80::/10', () => {
    expect(isPrivateIPv6('fe80::1')).toBe(true);
    expect(isPrivateIPv6('fe80::dead:beef')).toBe(true);
  });

  it('returns false for public IPv6', () => {
    expect(isPrivateIPv6('2001:db8::1')).toBe(false);
    expect(isPrivateIPv6('2600:1f18::1')).toBe(false);
  });

  it('returns true for empty string', () => {
    expect(isPrivateIPv6('')).toBe(true);
  });
});

describe('isPrivateHost', () => {
  it('returns true for localhost', () => {
    expect(isPrivateHost('localhost')).toBe(true);
  });

  it('returns true for .localhost subdomains', () => {
    expect(isPrivateHost('anything.localhost')).toBe(true);
  });

  it('returns true for .local domains', () => {
    expect(isPrivateHost('myservice.local')).toBe(true);
  });

  it('returns true for private IPv4 host string', () => {
    expect(isPrivateHost('192.168.1.1')).toBe(true);
    expect(isPrivateHost('10.0.0.1')).toBe(true);
  });

  it('returns true for loopback IPv6 host string', () => {
    expect(isPrivateHost('::1')).toBe(true);
  });

  it('returns false for public hostnames', () => {
    expect(isPrivateHost('example.com')).toBe(false);
    expect(isPrivateHost('jobs.google.com')).toBe(false);
  });

  it('returns false for public IP addresses', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });

  it('returns true for empty string', () => {
    expect(isPrivateHost('')).toBe(true);
  });
});

// ─── JD URL resolution ────────────────────────────────────────────────

describe('resolveJobDescriptionInput', () => {
  it('returns plain text unchanged when input is not a URL', async () => {
    const text = 'Senior Software Engineer with 5+ years experience in TypeScript.';
    const result = await resolveJobDescriptionInput(text);
    expect(result).toBe(text);
  });

  it('returns plain text unchanged when URL pattern is not matched', async () => {
    const text = 'ftp://not-http.com/jobs/123';
    // This does not match JOB_URL_PATTERN (requires http/https)
    // Actually ftp:// does start with non-http prefix so it won't match
    // The regex requires ^https?:// so ftp would be plain text
    const result = await resolveJobDescriptionInput(text);
    expect(result).toBe(text);
  });

  it('returns trimmed plain text as-is', async () => {
    const text = '  A detailed job description with many requirements.  ';
    const result = await resolveJobDescriptionInput(text);
    expect(result).toBe(text.trim());
  });

  it('throws for private IP URLs (SSRF protection)', async () => {
    await expect(resolveJobDescriptionInput('https://192.168.1.1/job')).rejects.toThrow(
      /not allowed|please paste/i,
    );
  });

  it('throws for localhost URLs (SSRF protection)', async () => {
    await expect(resolveJobDescriptionInput('https://localhost/jobs/123')).rejects.toThrow(
      /not allowed|please paste/i,
    );
  });

  it('returns non-matching URL-like text as-is (ftp:// falls through to plain text)', async () => {
    // 'https://' doesn't match JOB_URL_PATTERN (/^https?:\/\/\S+$/i) because it
    // has no non-whitespace characters after the scheme — treated as plain text.
    const text = 'https://';
    const result = await resolveJobDescriptionInput(text);
    expect(result).toBe(text);
  });
});

// ─── HTML text extraction ─────────────────────────────────────────────

describe('extractVisibleTextFromHtml', () => {
  it('strips script tags', () => {
    const html = '<html><script>alert("xss")</script><p>Job description</p></html>';
    const result = extractVisibleTextFromHtml(html);
    expect(result).not.toContain('alert');
    expect(result).toContain('Job description');
  });

  it('strips style tags', () => {
    const html = '<style>body { color: red; }</style><p>Content</p>';
    const result = extractVisibleTextFromHtml(html);
    expect(result).not.toContain('color: red');
    expect(result).toContain('Content');
  });

  it('converts block-level close tags to newlines', () => {
    const html = '<p>Line one</p><p>Line two</p>';
    const result = extractVisibleTextFromHtml(html);
    expect(result).toContain('Line one');
    expect(result).toContain('Line two');
  });

  it('decodes HTML entities', () => {
    const html = '<p>Senior &amp; Lead Engineer &mdash; React &amp; TypeScript</p>';
    const result = extractVisibleTextFromHtml(html);
    expect(result).toContain('Senior & Lead Engineer');
  });

  it('collapses multiple blank lines', () => {
    const html = '<p>A</p>\n\n\n\n\n<p>B</p>';
    const result = extractVisibleTextFromHtml(html);
    // Should not have more than 2 consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });
});

// ─── getPipelineRouteStats ────────────────────────────────────────────

describe('getPipelineRouteStats', () => {
  it('returns an object with the expected keys', () => {
    const stats = getPipelineRouteStats();
    expect(stats).toMatchObject({
      running_pipelines_local: expect.any(Number),
      max_running_pipelines_local: expect.any(Number),
      max_running_pipelines_per_user: expect.any(Number),
      max_running_pipelines_global: expect.any(Number),
      stale_recovery_runs: expect.any(Number),
      stale_recovery_cooldown_ms: expect.any(Number),
      stale_recovery_batch_size: expect.any(Number),
      stale_recovery_last_count: expect.any(Number),
      stale_recovery_last_had_more: expect.any(Boolean),
      max_global_pipelines: expect.any(Number),
      stale_pipeline_ms: expect.any(Number),
      in_process_pipeline_ttl_ms: expect.any(Number),
    });
  });

  it('running_pipelines_local is non-negative', () => {
    const stats = getPipelineRouteStats();
    expect(stats.running_pipelines_local as number).toBeGreaterThanOrEqual(0);
  });

  it('stale_recovery_last_at is null when no recovery has run', () => {
    const stats = getPipelineRouteStats();
    // May be null or a string depending on test execution order
    const lastAt = stats.stale_recovery_last_at;
    expect(lastAt === null || typeof lastAt === 'string').toBe(true);
  });
});

// ─── resumeOnRespond ──────────────────────────────────────────────────

describe('resumeOnRespond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls supabase upsert with question response data', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const mockUpsert = vi.fn(async () => ({ error: null }));
    const mockFrom = vi.fn(() => ({
      upsert: mockUpsert,
    }));
    (supabaseAdmin as unknown as Record<string, unknown>).from = mockFrom;

    const dbState = {
      pipeline_status: 'running',
      pipeline_stage: 'positioning',
      pending_gate: 'positioning_interview',
      pending_gate_data: null,
      updated_at: new Date().toISOString(),
    };

    await resumeOnRespond('session-abc', 'positioning_interview', { answer: 'test' }, dbState);

    // supabase.from should have been called for session_question_responses
    expect(mockFrom).toHaveBeenCalledWith('session_question_responses');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-abc',
        question_id: 'positioning_interview',
        stage: 'positioning',
      }),
      expect.objectContaining({ onConflict: 'session_id,question_id' }),
    );
  });

  it('falls back to "unknown" stage when pipeline_stage is null', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const capturedCalls: unknown[] = [];
    const mockUpsert = vi.fn(async (payload: unknown) => {
      capturedCalls.push(payload);
      return { error: null };
    });
    (supabaseAdmin as unknown as Record<string, unknown>).from = vi.fn(() => ({
      upsert: mockUpsert,
    }));

    const dbState = {
      pipeline_status: 'running',
      pipeline_stage: null,
      pending_gate: 'intake_quiz',
      pending_gate_data: null,
      updated_at: new Date().toISOString(),
    };

    await resumeOnRespond('session-xyz', 'intake_quiz', true, dbState);

    expect(capturedCalls.length).toBeGreaterThan(0);
    const firstCall = capturedCalls[0] as Record<string, unknown>;
    expect(firstCall.stage).toBe('unknown');
  });

  it('does not throw when supabase returns an error', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin as unknown as Record<string, unknown>).from = vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: { message: 'db error' } })),
    }));

    const dbState = {
      pipeline_status: 'running',
      pipeline_stage: 'section_review',
      pending_gate: 'section_review',
      pending_gate_data: null,
      updated_at: new Date().toISOString(),
    };

    // Should not throw — persistQuestionResponseBestEffort is best-effort
    await expect(
      resumeOnRespond('session-err', 'section_review', { approved: true }, dbState),
    ).resolves.toBeUndefined();
  });
});

// ─── persistQuestionResponseBestEffort ───────────────────────────────

describe('persistQuestionResponseBestEffort', () => {
  it('upserts a question response row', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const mockUpsert = vi.fn(async () => ({ error: null }));
    (supabaseAdmin as unknown as Record<string, unknown>).from = vi.fn(() => ({
      upsert: mockUpsert,
    }));

    await persistQuestionResponseBestEffort('session-1', 'intake_quiz', 'intake', { answer: 'yes' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        question_id: 'intake_quiz',
        stage: 'intake',
        status: 'answered',
      }),
      { onConflict: 'session_id,question_id' },
    );
  });

  it('marks skipped responses correctly', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const capturedRows: unknown[] = [];
    (supabaseAdmin as unknown as Record<string, unknown>).from = vi.fn(() => ({
      upsert: vi.fn(async (row: unknown) => {
        capturedRows.push(row);
        return { error: null };
      }),
    }));

    await persistQuestionResponseBestEffort('session-2', 'q1', 'research', { skipped: true });

    const row = capturedRows[0] as Record<string, unknown>;
    expect(row.status).toBe('skipped');
  });

  it('marks deferred responses correctly', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const capturedRows: unknown[] = [];
    (supabaseAdmin as unknown as Record<string, unknown>).from = vi.fn(() => ({
      upsert: vi.fn(async (row: unknown) => {
        capturedRows.push(row);
        return { error: null };
      }),
    }));

    await persistQuestionResponseBestEffort('session-3', 'q2', 'positioning', { status: 'deferred' });

    const row = capturedRows[0] as Record<string, unknown>;
    expect(row.status).toBe('deferred');
  });

  it('does not throw on database error', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin as unknown as Record<string, unknown>).from = vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: { message: 'connection refused' } })),
    }));

    await expect(
      persistQuestionResponseBestEffort('session-4', 'q3', 'intake', 'raw response'),
    ).resolves.toBeUndefined();
  });
});
