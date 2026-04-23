// @vitest-environment jsdom
/**
 * Phase 2.3b — ApplicationWorkspaceRoute Interview Prep toggle tests.
 *
 * Four scoped assertions:
 *   1. Muted pill renders when stage='applied' and interview_prep_enabled=null
 *      (stage-derived default off).
 *   2. Active pill renders when interview_prep_enabled=true regardless of stage.
 *   3. Clicking muted pill navigates to the Interview Prep URL and the body
 *      renders the activation screen (not InterviewLabRoom).
 *   4. Clicking Activate fires PATCH and re-renders body as InterviewLabRoom.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationWorkspaceRoute } from '@/components/career-iq/ApplicationWorkspaceRoute';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Heavy tool screens → stubs so we can detect which one rendered.
vi.mock('@/components/career-iq/InterviewLabRoom', () => ({
  InterviewLabRoom: () => <div data-testid="interview-lab-room">INTERVIEW LAB</div>,
}));
vi.mock('@/components/cover-letter/CoverLetterScreen', () => ({
  CoverLetterScreen: () => <div data-testid="cover-letter-screen">COVER LETTER</div>,
}));
vi.mock('@/components/resume-v3/V3PipelineScreen', () => ({
  V3PipelineScreen: () => <div data-testid="v3-pipeline-screen">V3 PIPELINE</div>,
}));
vi.mock('@/components/career-iq/ThankYouNoteRoom', () => ({
  ThankYouNoteRoom: () => <div data-testid="thank-you-note-room">THANK YOU</div>,
}));
vi.mock('@/components/career-iq/NetworkingHubRoom', () => ({
  NetworkingHubRoom: () => <div data-testid="networking-hub-room">NETWORKING</div>,
}));
vi.mock('@/components/career-iq/SalaryNegotiationRoom', () => ({
  SalaryNegotiationRoom: () => <div data-testid="salary-negotiation-room">NEGOTIATION</div>,
}));

// ApplicationSwitcher calls useJobApplications. Give it an empty list.
vi.mock('@/hooks/useJobApplications', () => ({
  useJobApplications: () => ({ applications: [] }),
}));

// ─── Fetch stub ──────────────────────────────────────────────────────────────

interface FakeApplication {
  id: string;
  user_id: string;
  role_title: string;
  company_name: string;
  stage: string;
  interview_prep_enabled: boolean | null;
  offer_enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

const baseApp: FakeApplication = {
  id: 'app-1',
  user_id: 'user-1',
  role_title: 'VP Engineering',
  company_name: 'Acme',
  stage: 'applied',
  interview_prep_enabled: null,
  offer_enabled: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let currentApp: FakeApplication;
const patchCalls: Array<{ url: string; body: unknown }> = [];

function installFetchStub() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/job-applications/app-1')) {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify(currentApp), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (init.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patchCalls.push({ url, body });
        currentApp = { ...currentApp, ...(body as Partial<FakeApplication>) };
        return new Response(JSON.stringify(currentApp), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response('{}', { status: 404 });
  }) as typeof global.fetch;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/workspace/application/:applicationId/:tool"
          element={
            <ApplicationWorkspaceRoute
              accessToken="test-token"
              onNavigate={(route) => window.history.pushState({}, '', route)}
            />
          }
        />
        <Route
          path="/workspace/application/:applicationId"
          element={
            <ApplicationWorkspaceRoute
              accessToken="test-token"
              onNavigate={(route) => window.history.pushState({}, '', route)}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ApplicationWorkspaceRoute — Interview Prep toggle', () => {
  beforeEach(() => {
    currentApp = { ...baseApp };
    patchCalls.length = 0;
    installFetchStub();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a muted Interview Prep pill when stage is applied and toggle is null', async () => {
    renderAt('/workspace/application/app-1/resume');

    const pill = await screen.findByRole('button', { name: /interview prep/i });
    expect(pill.getAttribute('data-state')).toBe('muted');
    expect(pill.className).toContain('border-dashed');
  });

  it('renders an active Interview Prep pill when interview_prep_enabled is true regardless of stage', async () => {
    currentApp = { ...baseApp, stage: 'applied', interview_prep_enabled: true };
    renderAt('/workspace/application/app-1/resume');

    const pill = await screen.findByRole('button', { name: /interview prep/i });
    expect(pill.getAttribute('data-state')).toBe('available');
    expect(pill.className).toContain('border-[var(--line-soft)]');
    expect(pill.className).not.toContain('border-dashed');
  });

  it('renders the activation screen when the user lands on /interview-prep and the tool is inactive', async () => {
    currentApp = { ...baseApp, stage: 'applied', interview_prep_enabled: null };
    renderAt('/workspace/application/app-1/interview-prep');

    await screen.findByText('Interview Prep is ready when you are');
    expect(screen.queryByTestId('interview-lab-room')).toBeNull();
    expect(screen.getByRole('button', { name: /Activate Interview Prep/i })).toBeInTheDocument();
  });

  it('clicking Activate fires PATCH and re-renders the lab', async () => {
    currentApp = { ...baseApp, stage: 'applied', interview_prep_enabled: null };
    renderAt('/workspace/application/app-1/interview-prep');

    const activate = await screen.findByRole('button', { name: /Activate Interview Prep/i });
    fireEvent.click(activate);

    await waitFor(() => {
      expect(patchCalls.some((c) => c.url.includes('/job-applications/app-1'))).toBe(true);
    });
    expect(patchCalls[0]?.body).toMatchObject({ interview_prep_enabled: true });

    await screen.findByTestId('interview-lab-room');
  });
});

describe('ApplicationWorkspaceRoute — Offer / Negotiation toggle', () => {
  beforeEach(() => {
    currentApp = { ...baseApp };
    patchCalls.length = 0;
    installFetchStub();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a muted Offer pill when stage is applied and toggle is null', async () => {
    renderAt('/workspace/application/app-1/resume');

    const pill = await screen.findByRole('button', { name: /offer negotiation/i });
    expect(pill.getAttribute('data-state')).toBe('muted');
    expect(pill.className).toContain('border-dashed');
  });

  it('renders an active Offer pill when offer_enabled is true regardless of stage', async () => {
    currentApp = { ...baseApp, stage: 'applied', offer_enabled: true };
    renderAt('/workspace/application/app-1/resume');

    const pill = await screen.findByRole('button', { name: /offer negotiation/i });
    expect(pill.getAttribute('data-state')).toBe('available');
    expect(pill.className).not.toContain('border-dashed');
  });

  it('renders the activation screen when the user lands on /offer-negotiation and the tool is inactive', async () => {
    currentApp = { ...baseApp, stage: 'applied', offer_enabled: null };
    renderAt('/workspace/application/app-1/offer-negotiation');

    await screen.findByText('Offer & Negotiation is ready when you are');
    expect(screen.queryByTestId('salary-negotiation-room')).toBeNull();
    expect(screen.getByRole('button', { name: /Activate Offer & Negotiation/i })).toBeInTheDocument();
  });

  it('clicking Activate fires PATCH and re-renders SalaryNegotiationRoom', async () => {
    currentApp = { ...baseApp, stage: 'applied', offer_enabled: null };
    renderAt('/workspace/application/app-1/offer-negotiation');

    const activate = await screen.findByRole('button', { name: /Activate Offer & Negotiation/i });
    fireEvent.click(activate);

    await waitFor(() => {
      expect(patchCalls.some((c) => c.url.includes('/job-applications/app-1'))).toBe(true);
    });
    expect(patchCalls[0]?.body).toMatchObject({ offer_enabled: true });

    await screen.findByTestId('salary-negotiation-room');
  });
});
