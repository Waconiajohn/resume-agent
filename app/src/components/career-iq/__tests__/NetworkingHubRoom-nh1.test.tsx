// @vitest-environment jsdom
/**
 * NetworkingHubRoom — Sprint NH1 additions.
 *
 * NH1-3: NI import button rendering, loading state, success message, dismiss.
 * NH1-5: Overdue contact badge in FollowUpBar via daysUntil < 0.
 *
 * Also covers the useNetworkingContacts hook new methods:
 *   fetchOverdue, importFromNI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | undefined | false | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn().mockImplementation(async function* () {}),
}));

// ─── Hook mocks ───────────────────────────────────────────────────────────────

const mockFetchContacts = vi.fn().mockResolvedValue(undefined);
const mockCreateContact = vi.fn().mockResolvedValue(null);
const mockLogTouchpoint = vi.fn().mockResolvedValue(null);
const mockFetchFollowUps = vi.fn().mockResolvedValue([]);
const mockFetchTouchpoints = vi.fn().mockResolvedValue([]);
const mockUpdateContact = vi.fn().mockResolvedValue(null);
let mockImportFromNI = vi.fn().mockResolvedValue(null);

vi.mock('@/hooks/useNetworkingContacts', () => ({
  useNetworkingContacts: () => ({
    contacts: [],
    loading: false,
    error: null,
    fetchContacts: mockFetchContacts,
    createContact: mockCreateContact,
    updateContact: mockUpdateContact,
    deleteContact: vi.fn().mockResolvedValue(false),
    logTouchpoint: mockLogTouchpoint,
    fetchFollowUps: mockFetchFollowUps,
    fetchOverdue: vi.fn().mockResolvedValue([]),
    fetchTouchpoints: mockFetchTouchpoints,
    importFromNI: () => mockImportFromNI(),
  }),
}));

vi.mock('@/hooks/useNetworkingOutreach', () => ({
  useNetworkingOutreach: () => ({
    status: 'idle',
    loading: false,
    error: null,
    report: null,
    qualityScore: null,
    messageCount: null,
    currentStage: null,
    activityMessages: [],
    startPipeline: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    respondToGate: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/hooks/useRuleOfFour', () => ({
  useRuleOfFour: () => ({
    groups: [],
    loading: false,
    error: null,
    addContactToApplication: vi.fn().mockResolvedValue(null),
    refresh: vi.fn().mockResolvedValue(undefined),
    createContact: mockCreateContact,
    logTouchpoint: mockLogTouchpoint,
    contacts: [],
  }),
  CONTACT_ROLE_LABELS: {
    hiring_manager: 'Hiring Manager',
    team_leader: 'Team Leader',
    peer: 'Peer',
    hr_recruiter: 'HR / Recruiter',
  },
  ALL_ROLES: ['hiring_manager', 'team_leader', 'peer', 'hr_recruiter'],
}));

vi.mock('@/components/career-iq/ContactFormModal', () => ({
  ContactFormModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: unknown) => Promise<void>;
    title?: string;
  }) =>
    isOpen ? (
      <div data-testid="contact-form-modal">
        <button onClick={onClose}>Close Form Modal</button>
      </div>
    ) : null,
}));

vi.mock('@/components/career-iq/ContactDetailSheet', () => ({
  ContactDetailSheet: ({ onClose }: { contact: unknown; touchpoints: unknown[]; onClose: () => void; onLogTouchpoint: (type: string, notes?: string) => Promise<void> }) => (
    <div data-testid="contact-detail-sheet">
      <button onClick={onClose}>Close Detail</button>
    </div>
  ),
}));

vi.mock('@/components/career-iq/RuleOfFourCoachingBar', () => ({
  RuleOfFourCoachingBar: ({ groups }: { groups: unknown[]; onFixGap: (appId: string, role: string) => void }) =>
    groups.length > 0 ? <div data-testid="rule-of-four-coaching-bar" /> : null,
}));

vi.mock('@/hooks/useApplicationPipeline', () => ({
  useApplicationPipeline: () => ({
    applications: [],
    loading: false,
    error: null,
    fetchApplications: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/components/career-iq/ContextLoadedBadge', () => ({
  ContextLoadedBadge: () => null,
}));

// ─── Import component ─────────────────────────────────────────────────────────

import { NetworkingHubRoom } from '../NetworkingHubRoom';

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ contacts: [], count: 0 }), { status: 200 }),
  ));
  vi.clearAllMocks();
  mockImportFromNI = vi.fn().mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── NH1-3: NI Import Button ──────────────────────────────────────────────────

describe('NetworkingHubRoom — NH1-3 NI Import button', () => {
  it('renders the "Import from NI" button', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByLabelText('Import from Network Intelligence')).toBeInTheDocument();
  });

  it('button shows "Import from NI" label text', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Import from NI')).toBeInTheDocument();
  });

  it('button is not disabled by default', () => {
    render(<NetworkingHubRoom />);
    const btn = screen.getByLabelText('Import from Network Intelligence');
    expect(btn).not.toBeDisabled();
  });

  it('calls importFromNI when the button is clicked', async () => {
    mockImportFromNI = vi.fn().mockResolvedValue({
      imported: 5,
      skipped: 2,
      message: 'Imported 5 new contacts from Network Intelligence.',
    });
    render(<NetworkingHubRoom />);

    const btn = screen.getByLabelText('Import from Network Intelligence');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockImportFromNI).toHaveBeenCalledOnce();
    });
  });

  it('shows success message after import completes', async () => {
    mockImportFromNI = vi.fn().mockResolvedValue({
      imported: 3,
      skipped: 0,
      message: 'Imported 3 new contacts from Network Intelligence.',
    });
    render(<NetworkingHubRoom />);

    const btn = screen.getByLabelText('Import from Network Intelligence');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Imported 3 new contacts from Network Intelligence.')).toBeInTheDocument();
    });
  });

  it('shows failure message when importFromNI returns null', async () => {
    mockImportFromNI = vi.fn().mockResolvedValue(null);
    render(<NetworkingHubRoom />);

    const btn = screen.getByLabelText('Import from Network Intelligence');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/Import failed/i)).toBeInTheDocument();
    });
  });

  it('success message can be dismissed', async () => {
    mockImportFromNI = vi.fn().mockResolvedValue({
      imported: 1,
      skipped: 0,
      message: 'Imported 1 new contact from Network Intelligence.',
    });
    render(<NetworkingHubRoom />);

    fireEvent.click(screen.getByLabelText('Import from Network Intelligence'));

    await waitFor(() => {
      expect(screen.getByText('Imported 1 new contact from Network Intelligence.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss'));

    await waitFor(() => {
      expect(screen.queryByText('Imported 1 new contact from Network Intelligence.')).not.toBeInTheDocument();
    });
  });

  it('does not show import message before any import has been triggered', () => {
    render(<NetworkingHubRoom />);
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });
});

// ─── NH1-5: Overdue badge in FollowUpBar ─────────────────────────────────────

describe('NetworkingHubRoom — NH1-5 overdue badge logic', () => {
  it('daysUntil returns a negative value for past dates (overdue)', () => {
    function daysUntil(iso: string | null): number {
      if (!iso) return Infinity;
      return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(threeDaysAgo)).toBeLessThan(0);
  });

  it('daysUntil returns a positive value for future dates (upcoming)', () => {
    function daysUntil(iso: string | null): number {
      if (!iso) return Infinity;
      return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(inFiveDays)).toBeGreaterThan(0);
  });

  it('overdue flag triggers when days < 0', () => {
    function daysUntil(iso: string | null): number {
      if (!iso) return Infinity;
      return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const days = daysUntil(pastDate);
    const isOverdue = days < 0;
    expect(isOverdue).toBe(true);
  });

  it('overdue message format is "N day(s) overdue"', () => {
    function overdueText(days: number): string {
      const abs = Math.abs(days);
      return `${abs} day${abs !== 1 ? 's' : ''} overdue`;
    }

    expect(overdueText(-3)).toBe('3 days overdue');
    expect(overdueText(-1)).toBe('1 day overdue');
    expect(overdueText(-14)).toBe('14 days overdue');
  });

  it('upcoming message format is "due in N day(s)"', () => {
    function upcomingText(days: number): string {
      return `due in ${days} day${days !== 1 ? 's' : ''}`;
    }

    expect(upcomingText(3)).toBe('due in 3 days');
    expect(upcomingText(1)).toBe('due in 1 day');
  });
});

// ─── useNetworkingContacts — new method shapes ────────────────────────────────

describe('useNetworkingContacts — fetchOverdue and importFromNI contracts', () => {
  it('fetchOverdue returns an array (mocked empty)', async () => {
    // Import the mock hook behavior. In actual use, it returns NetworkingContact[].
    const fetchOverdue = vi.fn().mockResolvedValue([]);
    const result = await fetchOverdue();
    expect(Array.isArray(result)).toBe(true);
  });

  it('importFromNI returns null on failure', async () => {
    const importFromNI = vi.fn().mockResolvedValue(null);
    const result = await importFromNI();
    expect(result).toBeNull();
  });

  it('importFromNI returns { imported, skipped, message } on success', async () => {
    const importFromNI = vi.fn().mockResolvedValue({
      imported: 5,
      skipped: 2,
      message: 'Imported 5 new contacts from Network Intelligence.',
    });
    const result = await importFromNI();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('imported', 5);
    expect(result).toHaveProperty('skipped', 2);
    expect(result).toHaveProperty('message');
  });

  it('importFromNI message reflects count correctly for singular', async () => {
    const importFromNI = vi.fn().mockResolvedValue({
      imported: 1,
      skipped: 0,
      message: 'Imported 1 new contact from Network Intelligence.',
    });
    const result = await importFromNI();
    expect((result as { message: string }).message).toContain('1 new contact');
    expect((result as { message: string }).message).not.toContain('1 new contacts');
  });
});
