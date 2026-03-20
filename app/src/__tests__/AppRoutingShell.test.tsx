// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';

const mockGetDefaultResume = vi.fn(async () => ({
  id: 'resume-1',
  raw_text: 'Default resume text',
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'user@example.com' },
    session: { access_token: 'token' },
    loading: false,
    displayName: 'Test User',
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    updateProfile: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    sessions: [],
    resumes: [],
    currentSession: null,
    loading: false,
    resumesLoading: false,
    error: null,
    listSessions: vi.fn(),
    listResumes: vi.fn(),
    getDefaultResume: mockGetDefaultResume,
    getResumeById: vi.fn(),
    loadSession: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => true),
    setDefaultResume: vi.fn(async () => true),
    deleteResume: vi.fn(async () => true),
    saveResumeAsBase: vi.fn(async () => ({ success: true })),
    sendMessage: vi.fn(async () => true),
    setCurrentSession: vi.fn(),
    respondToGate: vi.fn(async () => true),
    getSessionResume: vi.fn(async () => null),
    getSessionCoverLetter: vi.fn(async () => null),
    updateMasterResume: vi.fn(async () => null),
    getResumeHistory: vi.fn(async () => []),
  }),
}));

vi.mock('@/hooks/useAgent', () => ({
  useAgent: () => ({
    messages: [],
    streamingText: '',
    tools: [],
    askPrompt: vi.fn(),
    phaseGate: null,
    currentPhase: 'onboarding',
    isProcessing: false,
    setIsProcessing: vi.fn(),
    resume: null,
    connected: false,
    lastBackendActivityAt: null,
    stalledSuspected: false,
    sessionComplete: false,
    error: null,
    panelType: null,
    panelData: null,
    addUserMessage: vi.fn(),
    pipelineStage: 'intake',
    positioningProfileFound: false,
    draftReadiness: null,
    workflowReplan: null,
    pipelineActivity: [],
    isPipelineGateActive: false,
    setIsPipelineGateActive: vi.fn(),
    dismissSuggestion: vi.fn(),
    approvedSections: [],
    sectionDrafts: {},
    sectionBuildOrder: [],
    reconnectStreamNow: vi.fn(),
    updateSectionLocally: vi.fn(),
  }),
}));

vi.mock('@/components/Header', () => ({
  Header: () => <div data-testid="app-header">Header</div>,
}));

vi.mock('@/components/Toast', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/career-iq/CareerProfileContext', () => ({
  CareerProfileProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/career-iq/CareerIQScreen', () => ({
  CareerIQScreen: ({
    initialRoom,
    onNewSession,
  }: {
    initialRoom?: string;
    onNewSession?: () => void;
  }) => (
    <div>
      <div>Workspace room: {initialRoom ?? 'dashboard'}</div>
      <button type="button" onClick={onNewSession}>New Tailored Resume</button>
    </div>
  ),
}));

vi.mock('@/components/resume-v2/V2ResumeScreen', () => ({
  V2ResumeScreen: () => <div>Resume V2 Screen</div>,
}));

vi.mock('@/components/platform/ToolsScreen', () => ({
  ToolsScreen: ({ slug }: { slug?: string }) => <div>Tools slug: {slug ?? 'catalog'}</div>,
}));

vi.mock('@/components/PricingPage', () => ({
  PricingPage: () => <div>Pricing</div>,
}));

vi.mock('@/components/BillingDashboard', () => ({
  BillingDashboard: () => <div>Billing</div>,
}));

vi.mock('@/components/AffiliateDashboard', () => ({
  AffiliateDashboard: () => <div>Affiliate</div>,
}));

vi.mock('@/components/cover-letter/CoverLetterScreen', () => ({
  CoverLetterScreen: () => <div>Cover Letter</div>,
}));

vi.mock('@/components/admin/AdminDashboard', () => ({
  AdminDashboard: () => <div>Admin</div>,
}));

vi.mock('@/components/CoachScreen', () => ({
  CoachScreen: () => <div>Coach</div>,
}));

describe('App routing shell', () => {
  beforeEach(() => {
    mockGetDefaultResume.mockClear();
  });

  it('redirects legacy dashboard path into Workspace resume management', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Workspace room: resume')).toBeInTheDocument();
  });

  it('opens a new tailored resume session from Workspace', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/workspace?room=resume']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getAllByRole('button', { name: 'New Tailored Resume' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Resume V2 Screen')).toBeInTheDocument();
    });
    expect(mockGetDefaultResume).toHaveBeenCalled();
  });

  it('routes tool detail pages through the router tree', async () => {
    render(
      <MemoryRouter initialEntries={['/tools/linkedin']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Tools slug: linkedin')).toBeInTheDocument();
  });

  it('redirects the old cover letter route into Resume Builder', async () => {
    render(
      <MemoryRouter initialEntries={['/cover-letter']}>
        <App />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('Workspace room: resume')).length).toBeGreaterThan(0);
  });
});
