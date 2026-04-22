// @vitest-environment jsdom
/**
 * useRuleOfFour hook — unit tests.
 *
 * Sprint 61 — Networking Hub.
 * Tests: group computation, missingRoles detection, progress 0-4,
 * addContactToApplication, refresh, filtering of closed applications.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFetchApplications = vi.fn().mockResolvedValue(undefined);
const mockFetchContacts = vi.fn().mockResolvedValue(undefined);
const mockCreateContact = vi.fn();

let mockApplications: unknown[] = [];
let mockContacts: unknown[] = [];
let mockPipelineLoading = false;
let mockContactsLoading = false;
let mockPipelineError: string | null = null;
let mockContactsError: string | null = null;

// Phase 3 — useApplicationPipeline is now re-exported from useJobApplications.
// Mock path updated; both exported names wired to the same stub.
vi.mock('@/hooks/useJobApplications', () => {
  const stub = () => ({
    applications: mockApplications,
    loading: mockPipelineLoading,
    error: mockPipelineError,
    fetchApplications: mockFetchApplications,
  });
  return {
    useApplicationPipeline: stub,
    useJobApplications: stub,
  };
});

vi.mock('@/hooks/useNetworkingContacts', () => ({
  useNetworkingContacts: () => ({
    contacts: mockContacts,
    loading: mockContactsLoading,
    error: mockContactsError,
    fetchContacts: mockFetchContacts,
    createContact: mockCreateContact,
    logTouchpoint: vi.fn(),
  }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { useRuleOfFour, ALL_ROLES, CONTACT_ROLE_LABELS } from '../useRuleOfFour';
import type { ContactRole } from '../useRuleOfFour';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    company_name: 'Acme Corp',
    job_title: 'Engineering Director',
    stage: 'applied',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    name: 'Bob Jones',
    title: 'VP Engineering',
    company: 'Acme Corp',
    email: null,
    linkedin_url: null,
    phone: null,
    relationship_type: 'hiring_manager',
    relationship_strength: 1,
    tags: [],
    notes: null,
    next_followup_at: null,
    last_contact_date: null,
    application_id: 'app-1',
    contact_role: 'hiring_manager',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockApplications = [];
  mockContacts = [];
  mockPipelineLoading = false;
  mockContactsLoading = false;
  mockPipelineError = null;
  mockContactsError = null;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─── CONTACT_ROLE_LABELS constant ────────────────────────────────────────────

describe('CONTACT_ROLE_LABELS', () => {
  it('has a label for every role in ALL_ROLES', () => {
    for (const role of ALL_ROLES) {
      expect(CONTACT_ROLE_LABELS[role]).toBeTruthy();
      expect(typeof CONTACT_ROLE_LABELS[role]).toBe('string');
    }
  });

  it('has exactly 4 roles', () => {
    expect(ALL_ROLES).toHaveLength(4);
  });

  it('includes the four expected roles', () => {
    expect(ALL_ROLES).toContain('hiring_manager');
    expect(ALL_ROLES).toContain('team_leader');
    expect(ALL_ROLES).toContain('peer');
    expect(ALL_ROLES).toContain('hr_recruiter');
  });

  it('Hiring Manager label is human-readable', () => {
    expect(CONTACT_ROLE_LABELS['hiring_manager']).toBe('Hiring Manager');
  });

  it('HR / Recruiter label includes slash', () => {
    expect(CONTACT_ROLE_LABELS['hr_recruiter']).toContain('Recruiter');
  });
});

// ─── Group computation ────────────────────────────────────────────────────────

describe('useRuleOfFour — groups computation', () => {
  it('returns empty groups when no applications', () => {
    mockApplications = [];
    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups).toHaveLength(0);
  });

  it('creates one group per active application', () => {
    mockApplications = [
      makeApplication({ id: 'app-1' }),
      makeApplication({ id: 'app-2', company_name: 'Beta Co' }),
    ];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups).toHaveLength(2);
  });

  it('excludes closed_won applications', () => {
    mockApplications = [
      makeApplication({ id: 'app-1', stage: 'applied' }),
      makeApplication({ id: 'app-2', stage: 'closed_won' }),
    ];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].application.id).toBe('app-1');
  });

  it('excludes closed_lost applications', () => {
    mockApplications = [
      makeApplication({ id: 'app-1', stage: 'applied' }),
      makeApplication({ id: 'app-2', stage: 'closed_lost' }),
    ];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups).toHaveLength(1);
  });

  it('includes all non-closed stages', () => {
    const activeStages = ['applied', 'screening', 'interview', 'offer'];
    mockApplications = activeStages.map((stage, i) =>
      makeApplication({ id: `app-${i}`, stage }),
    );

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups).toHaveLength(4);
  });
});

// ─── Progress calculation ─────────────────────────────────────────────────────

describe('useRuleOfFour — progress calculation', () => {
  it('progress = 0 when no contacts linked', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].progress).toBe(0);
  });

  it('progress = 1 when one role filled', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [makeContact({ application_id: 'app-1', contact_role: 'hiring_manager' })];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].progress).toBe(1);
  });

  it('progress = 4 when all 4 roles filled', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = ALL_ROLES.map((role, i) =>
      makeContact({ id: `c-${i}`, application_id: 'app-1', contact_role: role }),
    );

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].progress).toBe(4);
  });

  it('progress capped at 4 even with more than 4 contacts', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    // Add 5 contacts but with valid roles (some duplicated)
    mockContacts = [
      makeContact({ id: 'c-1', application_id: 'app-1', contact_role: 'hiring_manager' }),
      makeContact({ id: 'c-2', application_id: 'app-1', contact_role: 'team_leader' }),
      makeContact({ id: 'c-3', application_id: 'app-1', contact_role: 'peer' }),
      makeContact({ id: 'c-4', application_id: 'app-1', contact_role: 'hr_recruiter' }),
      makeContact({ id: 'c-5', application_id: 'app-1', contact_role: 'hiring_manager' }),
    ];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].progress).toBe(4);
  });

  it('contacts without application_id are not linked to any application', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [makeContact({ application_id: null, contact_role: 'hiring_manager' })];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].progress).toBe(0);
  });

  it('contacts linked to different application are not counted', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [makeContact({ application_id: 'app-2', contact_role: 'hiring_manager' })];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].progress).toBe(0);
  });
});

// ─── Missing roles ────────────────────────────────────────────────────────────

describe('useRuleOfFour — missingRoles', () => {
  it('all 4 roles missing when no contacts', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [];

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].missingRoles).toHaveLength(4);
    expect(result.current.groups[0].missingRoles).toEqual(
      expect.arrayContaining(['hiring_manager', 'team_leader', 'peer', 'hr_recruiter']),
    );
  });

  it('correctly identifies which roles are missing', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [
      makeContact({ id: 'c-1', application_id: 'app-1', contact_role: 'hiring_manager' }),
      makeContact({ id: 'c-2', application_id: 'app-1', contact_role: 'peer' }),
    ];

    const { result } = renderHook(() => useRuleOfFour());
    const { missingRoles } = result.current.groups[0];
    expect(missingRoles).toHaveLength(2);
    expect(missingRoles).toContain('team_leader');
    expect(missingRoles).toContain('hr_recruiter');
    expect(missingRoles).not.toContain('hiring_manager');
    expect(missingRoles).not.toContain('peer');
  });

  it('no missing roles when all 4 filled', () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = ALL_ROLES.map((role, i) =>
      makeContact({ id: `c-${i}`, application_id: 'app-1', contact_role: role }),
    );

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.groups[0].missingRoles).toHaveLength(0);
  });
});

// ─── addContactToApplication ──────────────────────────────────────────────────

describe('useRuleOfFour — addContactToApplication', () => {
  it('calls createContact with application_id and contact_role', async () => {
    mockApplications = [makeApplication({ id: 'app-1' })];
    mockContacts = [];
    const newContact = makeContact({ id: 'c-new', application_id: 'app-1', contact_role: 'team_leader' });
    mockCreateContact.mockResolvedValueOnce(newContact);

    const { result } = renderHook(() => useRuleOfFour());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.addContactToApplication('app-1', 'team_leader', {
        name: 'Alice Manager',
        company: 'Acme Corp',
      });
    });

    expect(mockCreateContact).toHaveBeenCalledWith({
      name: 'Alice Manager',
      company: 'Acme Corp',
      application_id: 'app-1',
      contact_role: 'team_leader',
    });
    expect(returned).toEqual(newContact);
  });

  it('returns null when createContact fails', async () => {
    mockCreateContact.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useRuleOfFour());

    let returned: unknown = 'not-null';
    await act(async () => {
      returned = await result.current.addContactToApplication('app-1', 'peer', { name: 'Test' });
    });

    expect(returned).toBeNull();
  });
});

// ─── Loading and error states ─────────────────────────────────────────────────

describe('useRuleOfFour — loading and error propagation', () => {
  it('loading is true when either pipeline or contacts is loading', () => {
    mockPipelineLoading = true;
    mockContactsLoading = false;

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.loading).toBe(true);
  });

  it('loading is true when contacts is loading', () => {
    mockPipelineLoading = false;
    mockContactsLoading = true;

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.loading).toBe(true);
  });

  it('loading is false when both are not loading', () => {
    mockPipelineLoading = false;
    mockContactsLoading = false;

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.loading).toBe(false);
  });

  it('error is pipeline error when present', () => {
    mockPipelineError = 'Pipeline failure';
    mockContactsError = null;

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.error).toBe('Pipeline failure');
  });

  it('error is contacts error when pipeline error is null', () => {
    mockPipelineError = null;
    mockContactsError = 'Contacts failure';

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.error).toBe('Contacts failure');
  });

  it('error is null when both succeed', () => {
    mockPipelineError = null;
    mockContactsError = null;

    const { result } = renderHook(() => useRuleOfFour());
    expect(result.current.error).toBeNull();
  });
});

// ─── refresh ──────────────────────────────────────────────────────────────────

describe('useRuleOfFour — refresh', () => {
  it('calls both fetchApplications and fetchContacts', async () => {
    const { result } = renderHook(() => useRuleOfFour());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFetchApplications).toHaveBeenCalled();
    expect(mockFetchContacts).toHaveBeenCalled();
  });
});
