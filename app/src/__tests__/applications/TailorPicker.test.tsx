// @vitest-environment jsdom
/**
 * TailorForApplicationPicker — Phase 2 tests.
 *
 * Mounts TailorPickerProvider with a stub useJobApplications.
 * Covers: existing-app pick, new-app from URL fetch (success + failure),
 * new-app from raw text, cancel. Asserts trackProductEvent fires with
 * the correct resolution string for each path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { TailorPickerProvider, useTailorPicker } from '@/components/applications/TailorPickerProvider';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token' },
    user: { id: 'u-1' },
    loading: false,
  }),
}));

const mockTrack = vi.fn();
vi.mock('@/lib/product-telemetry', () => ({
  trackProductEvent: (...args: unknown[]) => mockTrack(...args),
}));

const mockApplications = [
  {
    id: 'app-existing',
    user_id: 'u-1',
    role_title: 'VP Engineering',
    company_name: 'Acme',
    stage: 'screening' as const,
    archived_at: null,
    next_action: null,
    next_action_due: null,
    created_at: '2026-04-22T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
  },
  {
    id: 'app-terminal',
    user_id: 'u-1',
    role_title: 'Director',
    company_name: 'Beta',
    stage: 'closed_lost' as const,
    archived_at: null,
    next_action: null,
    next_action_due: null,
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
  },
];

const mockCreateApplication = vi.fn();
const mockFetchApplications = vi.fn();
vi.mock('@/hooks/useJobApplications', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useJobApplications')>('@/hooks/useJobApplications');
  return {
    ...actual,
    useJobApplications: () => ({
      applications: mockApplications,
      loading: false,
      error: null,
      fetchApplications: mockFetchApplications,
      createApplication: mockCreateApplication,
      updateApplication: vi.fn(),
      moveToStage: vi.fn(),
      deleteApplication: vi.fn(),
      archiveApplication: vi.fn(),
      restoreApplication: vi.fn(),
      groupedByStage: {},
    }),
  };
});

// ── Test harness ─────────────────────────────────────────────────────────

function Trigger({ context }: { context: { source: string; jobUrl?: string; companyName?: string; roleTitle?: string } }) {
  const { openPicker } = useTailorPicker();
  return (
    <button type="button" onClick={() => openPicker(context)}>
      OPEN_PICKER
    </button>
  );
}

function NavCapture({ pathHolder }: { pathHolder: { current: string | null } }) {
  const navigate = useNavigate();
  // Track navigate calls in a ref the test can inspect.
  return null;
}

function renderHarness(context: { source: string; jobUrl?: string; companyName?: string; roleTitle?: string }) {
  const navHolder: { current: string | null } = { current: null };
  const result = render(
    <MemoryRouter initialEntries={['/']}>
      <TailorPickerProvider>
        <Trigger context={context} />
        <Routes>
          <Route
            path="*"
            element={
              <PathProbe onPath={(p) => { navHolder.current = p; }} />
            }
          />
        </Routes>
      </TailorPickerProvider>
    </MemoryRouter>,
  );
  return { ...result, navHolder };
}

function PathProbe({ onPath }: { onPath: (path: string) => void }) {
  // Re-renders on every route change; the parent reads the path via the holder.
  // This component itself does not need to render anything visible.
  return null;
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TailorForApplicationPicker', () => {
  it('renders existing-app list filtered to non-terminal stages', () => {
    const { getByText } = renderHarness({ source: 'test' });
    fireEvent.click(getByText('OPEN_PICKER'));
    expect(screen.getByText('Tailor for an application')).toBeInTheDocument();
    // Acme is non-terminal (screening) — visible.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    // Beta is closed_lost — hidden from the picker.
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('cancel fires resolution=cancelled', () => {
    const { getByText } = renderHarness({ source: 'test_source' });
    fireEvent.click(getByText('OPEN_PICKER'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockTrack).toHaveBeenCalledWith('resume_builder_session_started', {
      source: 'test_source',
      resolution: 'cancelled',
    });
  });

  it('picking an existing app fires resolution=existing_app', () => {
    const { getByText } = renderHarness({ source: 'test_source' });
    fireEvent.click(getByText('OPEN_PICKER'));
    // Click the row for "Acme".
    fireEvent.click(screen.getByText('Acme').closest('button')!);
    expect(mockTrack).toHaveBeenCalledWith('resume_builder_session_started', {
      source: 'test_source',
      resolution: 'existing_app',
    });
  });

  it('JD URL fetch failure surfaces error and does NOT create a row', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Upstream down' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { getByText } = renderHarness({ source: 'test' });
    fireEvent.click(getByText('OPEN_PICKER'));
    // Switch to URL tab (first tab is URL when no jobUrl context, but we want to be explicit).
    fireEvent.click(screen.getByRole('button', { name: 'Paste JD URL' }));
    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://example.com/job/1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => expect(screen.getByText(/Upstream down/i)).toBeInTheDocument());
    // No application created.
    expect(mockCreateApplication).not.toHaveBeenCalled();
    // No tracking event yet (cancelled-style events only fire on close).
    const startedCalls = mockTrack.mock.calls.filter((c) => c[0] === 'resume_builder_session_started');
    expect(startedCalls).toHaveLength(0);
  });

  it('JD URL fetch success then submit fires resolution=new_app_jd_url', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        text: 'A long job description'.repeat(20),
        title: 'Senior PM',
        company: 'Charlie',
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    mockCreateApplication.mockResolvedValueOnce({
      id: 'app-new',
      user_id: 'u-1',
      role_title: 'Senior PM',
      company_name: 'Charlie',
      stage: 'researching',
      archived_at: null,
      next_action: null,
      next_action_due: null,
      created_at: '2026-04-24T00:00:00Z',
      updated_at: '2026-04-24T00:00:00Z',
    });

    const { getByText } = renderHarness({ source: 'jcc_job_board', jobUrl: 'https://example.com/job/2' });
    fireEvent.click(getByText('OPEN_PICKER'));
    // jobUrl context → URL tab is the default open one and fetches automatically.

    await waitFor(() => expect(screen.getByDisplayValue('Senior PM')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Charlie')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/discovery/fetch-jd'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/job/2' }),
      }),
    );

    // Now submit.
    fireEvent.click(screen.getByRole('button', { name: /Create.*tailor/i }));

    await waitFor(() => expect(mockCreateApplication).toHaveBeenCalledTimes(1));
    expect(mockCreateApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        role_title: 'Senior PM',
        company_name: 'Charlie',
        stage: 'researching',
        url: 'https://example.com/job/2',
      }),
    );
    expect(mockTrack).toHaveBeenCalledWith('resume_builder_session_started', {
      source: 'jcc_job_board',
      resolution: 'new_app_jd_url',
    });
  });

  it('JD text submit creates row and fires resolution=new_app_jd_text', async () => {
    mockCreateApplication.mockResolvedValueOnce({
      id: 'app-text',
      user_id: 'u-1',
      role_title: 'Director Ops',
      company_name: 'Delta',
      stage: 'researching',
      archived_at: null,
      next_action: null,
      next_action_due: null,
      created_at: '2026-04-24T00:00:00Z',
      updated_at: '2026-04-24T00:00:00Z',
    });

    const { getByText } = renderHarness({ source: 'workshop_landing' });
    fireEvent.click(getByText('OPEN_PICKER'));
    fireEvent.click(screen.getByRole('button', { name: 'Paste JD text' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. Medtronic'), { target: { value: 'Delta' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. VP of Supply Chain'), { target: { value: 'Director Ops' } });
    fireEvent.change(
      screen.getByPlaceholderText(/Paste the full job description/i),
      { target: { value: 'A real job description with at least fifty characters present here.' } },
    );

    fireEvent.click(screen.getByRole('button', { name: /Create.*tailor/i }));

    await waitFor(() => expect(mockCreateApplication).toHaveBeenCalledTimes(1));
    expect(mockTrack).toHaveBeenCalledWith('resume_builder_session_started', {
      source: 'workshop_landing',
      resolution: 'new_app_jd_text',
    });
  });

  it('Create-and-tailor button is disabled until form is valid', () => {
    const { getByText } = renderHarness({ source: 'test' });
    fireEvent.click(getByText('OPEN_PICKER'));
    fireEvent.click(screen.getByRole('button', { name: 'Paste JD text' }));

    const submit = screen.getByRole('button', { name: /Create.*tailor/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // Fill only company; still disabled.
    fireEvent.change(screen.getByPlaceholderText('e.g. Medtronic'), { target: { value: 'X' } });
    expect(submit.disabled).toBe(true);
  });
});

describe('TailorPickerProvider source flow', () => {
  it('passes source string from entry point to tracking event', () => {
    const { getByText } = renderHarness({ source: 'smart_referrals' });
    fireEvent.click(getByText('OPEN_PICKER'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockTrack).toHaveBeenCalledWith('resume_builder_session_started', {
      source: 'smart_referrals',
      resolution: 'cancelled',
    });
  });
});
