/**
 * useB2BBranding — Hook tests.
 *
 * Validates: no-session early exit, successful branding load + CSS property
 * injection, branding-null response, network error resilience, and cleanup
 * on unmount.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// ─── Import (after mocks) ─────────────────────────────────────────────────────

import { useB2BBranding } from '@/hooks/useB2BBranding';
import type { OrgBranding } from '@/hooks/useB2BBranding';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_BRANDING: OrgBranding = {
  org_id: 'org-1',
  org_name: 'Acme Corp',
  logo_url: 'https://acme.com/logo.png',
  primary_color: '#3b82f6',
  secondary_color: '#1d4ed8',
  custom_welcome_message: 'We are here to support your next chapter.',
  custom_resources: [
    { title: 'Severance FAQ', url: 'https://acme.com/severance', description: 'Details.' },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useB2BBranding', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    // Reset CSS custom properties
    document.documentElement.style.removeProperty('--b2b-primary');
    document.documentElement.style.removeProperty('--b2b-secondary');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    document.documentElement.style.removeProperty('--b2b-primary');
    document.documentElement.style.removeProperty('--b2b-secondary');
  });

  it('sets loading: false and returns null branding when no session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });

    const { result } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding).toBeNull();
    expect(result.current.isB2BUser).toBe(false);
  });

  it('loads branding and sets isB2BUser: true when org found', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123' } },
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ branding: MOCK_BRANDING }),
    } as Response);

    const { result } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding).toEqual(MOCK_BRANDING);
    expect(result.current.isB2BUser).toBe(true);
  });

  it('applies CSS custom properties when branding is loaded', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123' } },
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ branding: MOCK_BRANDING }),
    } as Response);

    const { result } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(document.documentElement.style.getPropertyValue('--b2b-primary')).toBe('#3b82f6');
    expect(document.documentElement.style.getPropertyValue('--b2b-secondary')).toBe('#1d4ed8');
  });

  it('removes CSS custom properties on unmount', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123' } },
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ branding: MOCK_BRANDING }),
    } as Response);

    const { result, unmount } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(document.documentElement.style.getPropertyValue('--b2b-primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--b2b-secondary')).toBe('');
  });

  it('returns null branding when API returns branding: null', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123' } },
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ branding: null }),
    } as Response);

    const { result } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding).toBeNull();
    expect(result.current.isB2BUser).toBe(false);
  });

  it('handles non-ok response gracefully', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123' } },
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding).toBeNull();
    expect(result.current.isB2BUser).toBe(false);
  });

  it('handles fetch errors gracefully without throwing', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123' } },
    });

    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useB2BBranding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding).toBeNull();
    expect(result.current.isB2BUser).toBe(false);
  });
});
