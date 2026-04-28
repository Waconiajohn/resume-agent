// @vitest-environment jsdom
/**
 * NetworkingRoom — Phase 2.3f component tests.
 *
 * Render + form validation. Hook is mocked to control state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
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

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

const mockStartPipeline = vi.fn().mockResolvedValue(true);
const mockRespondToGate = vi.fn().mockResolvedValue(true);
const mockReset = vi.fn();

const idleState = {
  status: 'idle' as const,
  draft: null,
  activityMessages: [],
  error: null,
  currentStage: null,
  pendingGate: null,
  startPipeline: mockStartPipeline,
  respondToGate: mockRespondToGate,
  reset: mockReset,
};

const reviewState = {
  ...idleState,
  status: 'message_review' as const,
  pendingGate: 'message_review' as const,
  draft: {
    recipient_name: 'Alice Chen',
    recipient_type: 'former_colleague' as const,
    messaging_method: 'connection_request' as const,
    goal: 'Reconnect and learn about her work.',
    message_markdown: 'Hi Alice — good to see your update on the platform team.',
    char_count: 58,
  },
};

vi.mock('@/hooks/useNetworking', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useNetworking')>('@/hooks/useNetworking');
  return {
    ...actual,
    useNetworking: vi.fn(),
  };
});

vi.mock('@/components/career-iq/useLatestMasterResumeText', () => ({
  useLatestMasterResumeText: () => ({
    resumeText:
      'Jane Smith, VP of Operations with 15 years of supply-chain and transformation leadership across North America.',
    loading: false,
  }),
}));

import { useNetworking } from '@/hooks/useNetworking';
import { NetworkingRoom } from '@/components/career-iq/NetworkingRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NetworkingRoom', () => {
  beforeEach(() => {
    vi.mocked(useNetworking).mockReturnValue(idleState);
  });

  it('renders the form with all five recipient-type options', () => {
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    expect(screen.getByText('Networking Message')).toBeInTheDocument();
    expect(screen.getByText('Former colleague')).toBeInTheDocument();
    expect(screen.getByText('Second-degree connection')).toBeInTheDocument();
    expect(screen.getByText('Cold outreach')).toBeInTheDocument();
    expect(screen.getByText('Referrer / referral target')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('refuses to start when recipient name is empty', () => {
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    fireEvent.click(screen.getByText('Draft message'));
    expect(mockStartPipeline).not.toHaveBeenCalled();
    expect(screen.getByText('Recipient name is required.')).toBeInTheDocument();
  });

  it('refuses to start when goal is empty', () => {
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Sarah Chen'), { target: { value: 'Alice Chen' } });
    fireEvent.click(screen.getByText('Draft message'));
    expect(mockStartPipeline).not.toHaveBeenCalled();
    expect(screen.getByText('Describe your goal for this message.')).toBeInTheDocument();
  });

  it('calls startPipeline with the collected inputs', () => {
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Sarah Chen'), { target: { value: 'Alice Chen' } });
    fireEvent.change(
      screen.getByPlaceholderText(/What do you want from this message/),
      { target: { value: 'Ask for 20-minute call' } },
    );
    fireEvent.click(screen.getByText('Draft message'));

    expect(mockStartPipeline).toHaveBeenCalledTimes(1);
    const call = mockStartPipeline.mock.calls[0][0];
    expect(call.applicationId).toBe('app-1');
    expect(call.recipientName).toBe('Alice Chen');
    expect(call.goal).toBe('Ask for 20-minute call');
    expect(call.recipientType).toBe('former_colleague');
    expect(call.messagingMethod).toBe('connection_request');
  });

  it('preserves the selected recipient type when drafting starts', () => {
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    fireEvent.click(screen.getByRole('button', { name: /Second-degree connection/i }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Sarah Chen'), { target: { value: 'Marcus Reed' } });
    fireEvent.change(
      screen.getByPlaceholderText(/What do you want from this message/),
      { target: { value: 'Ask for a brief conversation' } },
    );
    fireEvent.click(screen.getByText('Draft message'));

    expect(mockStartPipeline).toHaveBeenCalledTimes(1);
    expect(mockStartPipeline.mock.calls[0][0].recipientType).toBe('second_degree');
  });

  it('renders draft + review controls when status is message_review', () => {
    vi.mocked(useNetworking).mockReturnValue(reviewState);
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    // The draft body is surfaced in the draft preview card.
    expect(screen.getByText(/good to see your update on the platform team/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit directly/i })).toBeInTheDocument();
    expect(screen.getByText(/58 \/ 300 chars/)).toBeInTheDocument();
  });

  it('Approve in review calls respondToGate with true', () => {
    vi.mocked(useNetworking).mockReturnValue(reviewState);
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockRespondToGate).toHaveBeenCalledWith('message_review', true);
  });

  it('Revise with feedback calls respondToGate with {feedback}', () => {
    vi.mocked(useNetworking).mockReturnValue(reviewState);
    render(<NetworkingRoom applicationId="app-1" initialCompany="Acme" initialRole="VP Ops" />);
    fireEvent.change(
      screen.getByPlaceholderText(/shorter/),
      { target: { value: 'Shorter please' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(mockRespondToGate).toHaveBeenCalledWith('message_review', { feedback: 'Shorter please' });
  });
});
