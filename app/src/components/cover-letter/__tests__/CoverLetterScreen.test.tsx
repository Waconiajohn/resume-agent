// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { CoverLetterScreen } from '../CoverLetterScreen';
import type { MasterResume } from '@/types/resume';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Capture props passed to the intake form so we can assert on them
const mockIntakeFormProps: Record<string, unknown>[] = [];

vi.mock('../CoverLetterIntakeForm', () => ({
  CoverLetterIntakeForm: (props: Record<string, unknown>) => {
    mockIntakeFormProps.push(props);
    return (
      <div data-testid="intake-form">
        <span data-testid="default-resume-text">{String(props.defaultResumeText ?? '')}</span>
        {Boolean(props.resumeLoading) && (
          <span data-testid="resume-loading-indicator">Loading resume...</span>
        )}
      </div>
    );
  },
}));

vi.mock('@/hooks/useCoverLetter', () => ({
  useCoverLetter: () => ({
    status: 'idle',
    letterDraft: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    startPipeline: vi.fn().mockResolvedValue(true),
    reset: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMasterResume(raw_text: string): MasterResume {
  return {
    id: 'resume-1',
    user_id: 'user-1',
    raw_text,
    experience: [],
    education: [],
    certifications: [],
    skills: {},
    evidence_items: [],
    summary: '',
    version: 1,
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const LONG_RESUME = 'A'.repeat(60);

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: 'test-token',
    onNavigate: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockIntakeFormProps.length = 0;
  vi.clearAllMocks();
});

describe('CoverLetterScreen — master resume pre-fill', () => {
  it('renders intake form without defaultResumeText when no onGetDefaultResume is provided', () => {
    render(<CoverLetterScreen {...makeProps()} />);
    expect(screen.getByTestId('intake-form')).toBeInTheDocument();
    expect(screen.getByTestId('default-resume-text').textContent).toBe('');
  });

  it('passes defaultResumeText to intake form after successful fetch', async () => {
    const onGetDefaultResume = vi.fn().mockResolvedValue(makeMasterResume(LONG_RESUME));

    render(<CoverLetterScreen {...makeProps({ onGetDefaultResume })} />);

    await waitFor(() => {
      expect(screen.getByTestId('default-resume-text').textContent).toBe(LONG_RESUME);
    });

    expect(onGetDefaultResume).toHaveBeenCalledOnce();
  });

  it('shows loading indicator while fetch is in progress', async () => {
    // Never resolves during this test — keeps resumeLoading=true
    let resolve: (v: MasterResume | null) => void;
    const pendingPromise = new Promise<MasterResume | null>((res) => { resolve = res; });
    const onGetDefaultResume = vi.fn().mockReturnValue(pendingPromise);

    render(<CoverLetterScreen {...makeProps({ onGetDefaultResume })} />);

    // Loading indicator should be visible while the promise is unresolved
    expect(screen.getByTestId('resume-loading-indicator')).toBeInTheDocument();

    // Resolve and verify indicator disappears
    resolve!(makeMasterResume(LONG_RESUME));
    await waitFor(() => {
      expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
    });
  });

  it('does not show loading indicator when onGetDefaultResume is not provided', () => {
    render(<CoverLetterScreen {...makeProps()} />);
    expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
  });

  it('leaves defaultResumeText empty when fetch returns null', async () => {
    const onGetDefaultResume = vi.fn().mockResolvedValue(null);

    render(<CoverLetterScreen {...makeProps({ onGetDefaultResume })} />);

    await waitFor(() => {
      // resumeLoading should be false once the promise settles
      expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('default-resume-text').textContent).toBe('');
  });

  it('leaves defaultResumeText empty when fetch returns a resume with blank raw_text', async () => {
    const onGetDefaultResume = vi.fn().mockResolvedValue(makeMasterResume('   '));

    render(<CoverLetterScreen {...makeProps({ onGetDefaultResume })} />);

    await waitFor(() => {
      expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('default-resume-text').textContent).toBe('');
  });

  it('handles fetch errors gracefully without crashing', async () => {
    const onGetDefaultResume = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<CoverLetterScreen {...makeProps({ onGetDefaultResume })} />);

    await waitFor(() => {
      // Loading should clear even on error
      expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
    });

    // Form still renders; default text is empty
    expect(screen.getByTestId('intake-form')).toBeInTheDocument();
    expect(screen.getByTestId('default-resume-text').textContent).toBe('');
  });
});
