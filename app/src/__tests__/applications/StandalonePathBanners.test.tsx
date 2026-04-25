// @vitest-environment jsdom
/**
 * StandalonePathBanners — Phase 2 tests.
 *
 * Covers: stale-FK banner renders with the supplied app id, orphan
 * prompt renders for sessions without an applicationId and is
 * dismissible per session, deprecation banner renders without context
 * and is dismissible.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  StaleApplicationBanner,
  OrphanSessionBanner,
  StandaloneDeprecationBanner,
} from '@/components/applications/StandalonePathBanners';
import { TailorPickerProvider } from '@/components/applications/TailorPickerProvider';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));
vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { access_token: 't' }, user: { id: 'u' }, loading: false }),
}));
vi.mock('@/lib/product-telemetry', () => ({ trackProductEvent: vi.fn() }));
vi.mock('@/hooks/useJobApplications', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useJobApplications')>('@/hooks/useJobApplications');
  return {
    ...actual,
    useJobApplications: () => ({
      applications: [],
      loading: false,
      error: null,
      fetchApplications: vi.fn(),
      createApplication: vi.fn(),
      updateApplication: vi.fn(),
      moveToStage: vi.fn(),
      deleteApplication: vi.fn(),
      archiveApplication: vi.fn(),
      restoreApplication: vi.fn(),
      groupedByStage: {},
    }),
  };
});

beforeEach(() => {
  // Clear localStorage between tests so dismissal state doesn't leak.
  window.localStorage.clear();
});

afterEach(() => cleanup());

function renderWithProvider(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <TailorPickerProvider>{node}</TailorPickerProvider>
    </MemoryRouter>,
  );
}

describe('StaleApplicationBanner', () => {
  it('renders with the truncated former-application id', () => {
    renderWithProvider(<StaleApplicationBanner staleApplicationId="11111111-1111-1111-1111-111111111111" />);
    expect(screen.getByText(/This session.s application was removed/i)).toBeInTheDocument();
    // Only the first 8 chars of the id should be exposed (privacy + tidy).
    expect(screen.getByText(/11111111…/)).toBeInTheDocument();
  });
});

describe('OrphanSessionBanner', () => {
  it('renders when not dismissed', () => {
    renderWithProvider(<OrphanSessionBanner sessionId="sess-1" />);
    expect(screen.getByText(/isn.t linked to an application yet/i)).toBeInTheDocument();
  });

  it('disappears after dismiss and remains dismissed across mount', () => {
    const { rerender } = renderWithProvider(<OrphanSessionBanner sessionId="sess-1" />);
    fireEvent.click(screen.getByText('Not now'));
    expect(screen.queryByText(/isn.t linked/i)).toBeNull();

    // Remount; the localStorage flag should keep it hidden.
    rerender(
      <MemoryRouter>
        <TailorPickerProvider>
          <OrphanSessionBanner sessionId="sess-1" />
        </TailorPickerProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/isn.t linked/i)).toBeNull();
  });

  it('dismissal is per-session — a different sessionId still shows', () => {
    renderWithProvider(<OrphanSessionBanner sessionId="sess-1" />);
    fireEvent.click(screen.getByText('Not now'));
    cleanup();
    renderWithProvider(<OrphanSessionBanner sessionId="sess-2" />);
    expect(screen.getByText(/isn.t linked/i)).toBeInTheDocument();
  });
});

describe('StandaloneDeprecationBanner', () => {
  it('renders when not dismissed', () => {
    renderWithProvider(<StandaloneDeprecationBanner />);
    expect(screen.getByText(/This URL is going away/i)).toBeInTheDocument();
  });

  it('hides after dismiss and stays hidden on remount', () => {
    const { rerender } = renderWithProvider(<StandaloneDeprecationBanner />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(/This URL is going away/i)).toBeNull();

    rerender(
      <MemoryRouter>
        <TailorPickerProvider>
          <StandaloneDeprecationBanner />
        </TailorPickerProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/This URL is going away/i)).toBeNull();
  });
});
