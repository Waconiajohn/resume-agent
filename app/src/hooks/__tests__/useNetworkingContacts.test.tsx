// @vitest-environment jsdom
/**
 * useNetworkingContacts hook — unit tests.
 *
 * Sprint 61 — Networking Hub.
 * Tests: fetchContacts (with/without filters), createContact, updateContact,
 * deleteContact, logTouchpoint, fetchFollowUps, fetchTouchpoints.
 *
 * NOTE: The hook does NOT auto-fetch on mount. Callers must invoke
 * fetchContacts() explicitly. Tests reflect this pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

// ─── Hoisted helpers ──────────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  }),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { useNetworkingContacts, type NetworkingContact, type Touchpoint } from '../useNetworkingContacts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<NetworkingContact> = {}): NetworkingContact {
  return {
    id: 'contact-1',
    name: 'Jane Smith',
    title: 'Engineering Director',
    company: 'Acme Corp',
    email: 'jane@acme.com',
    linkedin_url: 'https://linkedin.com/in/janesmith',
    phone: null,
    relationship_type: 'hiring_manager',
    relationship_strength: 2,
    tags: ['target', 'hot'],
    notes: 'Met at DevConf 2025',
    next_followup_at: null,
    last_contact_date: null,
    application_id: null,
    contact_role: 'hiring_manager',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTouchpoint(overrides: Partial<Touchpoint> = {}): Touchpoint {
  return {
    id: 'tp-1',
    contact_id: 'contact-1',
    type: 'email',
    notes: 'Sent introduction email',
    created_at: '2025-01-02T10:00:00Z',
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('useNetworkingContacts — initial state', () => {
  it('starts with empty contacts array and no loading', () => {
    const { result } = renderHook(() => useNetworkingContacts());

    expect(result.current.contacts).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does NOT auto-fetch contacts on mount (no fetch call on render)', () => {
    renderHook(() => useNetworkingContacts());

    // No fetch should have been called — callers must invoke fetchContacts()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── fetchContacts ────────────────────────────────────────────────────────────

describe('useNetworkingContacts — fetchContacts', () => {
  it('fetches without filters by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [], count: 0 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:3001/api/networking/contacts');
  });

  it('appends relationship_type filter to URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [], count: 0 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts({ relationship_type: 'hiring_manager' });
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('relationship_type=hiring_manager');
  });

  it('appends search filter to URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [], count: 0 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts({ search: 'Jane' });
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('search=Jane');
  });

  it('appends sort_by and sort_order filters', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [], count: 0 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts({ sort_by: 'name', sort_order: 'desc' });
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('sort_by=name');
    expect(url).toContain('sort_order=desc');
  });

  it('sets error on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Server Error', { status: 500 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.error).toContain('500');
  });

  it('sets error when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.error).toBe('Not authenticated');
    expect(result.current.contacts).toEqual([]);
  });

  it('sends Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [], count: 0 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('populates contacts state on success', async () => {
    const contacts = [makeContact()];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts, count: 1 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe('Jane Smith');
  });

  it('clears stale contacts when auth is lost on refetch', async () => {
    const contacts = [makeContact()];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts, count: 1 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.contacts).toHaveLength(1);

    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.error).toBe('Not authenticated');
    expect(result.current.contacts).toEqual([]);
  });

  it('clears stale contacts when networking contacts are feature-disabled', async () => {
    const contacts = [makeContact()];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ contacts, count: 1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ feature_disabled: true }), { status: 200 }),
      );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.contacts).toHaveLength(1);

    await act(async () => {
      await result.current.fetchContacts();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.contacts).toEqual([]);
  });
});

// ─── createContact ────────────────────────────────────────────────────────────

describe('useNetworkingContacts — createContact', () => {
  it('returns the created contact on success and prepends to local state', async () => {
    const newContact = makeContact({ id: 'contact-new', name: 'Bob Jones' });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contact: newContact }), { status: 201 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let createdContact: NetworkingContact | null = null;
    await act(async () => {
      createdContact = await result.current.createContact({ name: 'Bob Jones' });
    });

    expect(createdContact).not.toBeNull();
    expect(createdContact!.name).toBe('Bob Jones');
    expect(result.current.contacts[0].id).toBe('contact-new');
  });

  it('returns null when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const { result } = renderHook(() => useNetworkingContacts());

    let contact: NetworkingContact | null = makeContact();
    await act(async () => {
      contact = await result.current.createContact({ name: 'Test' });
    });

    expect(contact).toBeNull();
  });

  it('returns null on non-OK POST response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Validation error', { status: 400 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let contact: NetworkingContact | null = makeContact();
    await act(async () => {
      contact = await result.current.createContact({ name: 'Test' });
    });

    expect(contact).toBeNull();
  });

  it('sends POST with JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contact: makeContact() }), { status: 201 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.createContact({ name: 'Jane', company: 'Acme' });
    });

    const postCall = vi.mocked(fetch).mock.calls[0];
    const init = postCall[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Jane', company: 'Acme' });
  });
});

// ─── updateContact ────────────────────────────────────────────────────────────

describe('useNetworkingContacts — updateContact', () => {
  it('returns updated contact and updates local state', async () => {
    const original = makeContact({ id: 'contact-1', notes: 'Old notes' });
    const updated = { ...original, notes: 'New notes' };

    // First: fetch contacts to populate state
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [original], count: 1 }), { status: 200 }),
    );
    // Second: PATCH
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contact: updated }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    // Populate contacts first
    await act(async () => {
      await result.current.fetchContacts();
    });
    await waitFor(() => expect(result.current.contacts).toHaveLength(1));

    let updatedContact: NetworkingContact | null = null;
    await act(async () => {
      updatedContact = await result.current.updateContact('contact-1', { notes: 'New notes' });
    });

    const resolved = updatedContact as NetworkingContact | null;
    expect(resolved?.notes).toBe('New notes');
    expect(result.current.contacts[0].notes).toBe('New notes');
  });

  it('returns null on non-OK PATCH response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let updatedContact: NetworkingContact | null = makeContact();
    await act(async () => {
      updatedContact = await result.current.updateContact('contact-1', { notes: 'X' });
    });

    expect(updatedContact).toBeNull();
  });
});

// ─── deleteContact ────────────────────────────────────────────────────────────

describe('useNetworkingContacts — deleteContact', () => {
  it('returns true and removes contact from local state', async () => {
    const contacts = [makeContact({ id: 'c-1' }), makeContact({ id: 'c-2' })];

    // First: fetch contacts
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts, count: 2 }), { status: 200 }),
    );
    // Second: DELETE
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });
    await waitFor(() => expect(result.current.contacts).toHaveLength(2));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deleteContact('c-1');
    });

    expect(success).toBe(true);
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].id).toBe('c-2');
  });

  it('returns false on non-OK DELETE response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deleteContact('c-1');
    });

    expect(success).toBe(false);
  });

  it('returns false when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const { result } = renderHook(() => useNetworkingContacts());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deleteContact('c-1');
    });

    expect(success).toBe(false);
  });
});

// ─── logTouchpoint ────────────────────────────────────────────────────────────

describe('useNetworkingContacts — logTouchpoint', () => {
  it('returns touchpoint on success and updates last_contact_date', async () => {
    const contact = makeContact({ id: 'c-1', last_contact_date: null });

    // First: fetch contacts
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [contact], count: 1 }), { status: 200 }),
    );
    // Second: log touchpoint
    const tp = makeTouchpoint({ contact_id: 'c-1' });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ touchpoint: tp }), { status: 201 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchContacts();
    });
    await waitFor(() => expect(result.current.contacts).toHaveLength(1));

    let returnedTp: Touchpoint | null = null;
    await act(async () => {
      returnedTp = await result.current.logTouchpoint('c-1', 'email', 'Sent intro email');
    });

    expect(returnedTp).not.toBeNull();
    expect(returnedTp!.type).toBe('email');
    // last_contact_date should be updated locally
    expect(result.current.contacts[0].last_contact_date).not.toBeNull();
  });

  it('returns null when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const { result } = renderHook(() => useNetworkingContacts());

    let tp: Touchpoint | null = makeTouchpoint();
    await act(async () => {
      tp = await result.current.logTouchpoint('c-1', 'email');
    });

    expect(tp).toBeNull();
  });

  it('sends POST to correct touchpoint endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ touchpoint: makeTouchpoint() }), { status: 201 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.logTouchpoint('c-1', 'call', 'Had a great call');
    });

    const postCall = vi.mocked(fetch).mock.calls[0];
    const url = postCall[0] as string;
    const init = postCall[1] as RequestInit;
    expect(url).toContain('/networking/contacts/c-1/touchpoints');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ type: 'call', notes: 'Had a great call' });
  });
});

// ─── fetchFollowUps ───────────────────────────────────────────────────────────

describe('useNetworkingContacts — fetchFollowUps', () => {
  it('returns contacts with upcoming follow-ups', async () => {
    const followUpContact = makeContact({ next_followup_at: new Date().toISOString() });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [followUpContact], days_ahead: 7 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let followUps: NetworkingContact[] = [];
    await act(async () => {
      followUps = await result.current.fetchFollowUps(7);
    });

    expect(followUps).toHaveLength(1);
    expect(followUps[0].next_followup_at).not.toBeNull();
  });

  it('returns empty array when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const { result } = renderHook(() => useNetworkingContacts());

    let followUps: NetworkingContact[] = [makeContact()];
    await act(async () => {
      followUps = await result.current.fetchFollowUps();
    });

    expect(followUps).toEqual([]);
  });

  it('includes days param in URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [], days_ahead: 14 }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchFollowUps(14);
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('days=14');
  });
});

// ─── fetchTouchpoints ─────────────────────────────────────────────────────────

describe('useNetworkingContacts — fetchTouchpoints', () => {
  it('returns touchpoints for a contact', async () => {
    const touchpoints = [makeTouchpoint(), makeTouchpoint({ id: 'tp-2', type: 'call' })];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ touchpoints }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let tps: Touchpoint[] = [];
    await act(async () => {
      tps = await result.current.fetchTouchpoints('c-1');
    });

    expect(tps).toHaveLength(2);
    expect(tps[0].type).toBe('email');
    expect(tps[1].type).toBe('call');
  });

  it('returns empty array on error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Server error', { status: 500 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    let tps: Touchpoint[] = [makeTouchpoint()];
    await act(async () => {
      tps = await result.current.fetchTouchpoints('c-1');
    });

    expect(tps).toEqual([]);
  });

  it('fetches from the correct URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ touchpoints: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useNetworkingContacts());

    await act(async () => {
      await result.current.fetchTouchpoints('contact-abc');
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('/networking/contacts/contact-abc/touchpoints');
  });
});
