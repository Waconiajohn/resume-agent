// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { SessionCoverLetterModal } from '../components/dashboard/SessionCoverLetterModal';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/export', () => ({
  downloadAsText: vi.fn(),
}));

const SESSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const LETTER_TEXT = 'Dear Hiring Manager,\n\nI am writing to express my strong interest in the VP Engineering role at Acme Corp.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CoverLetterResult = { letter: string; quality_score?: number | null } | null;
type GetCoverLetterFn = (id: string) => Promise<CoverLetterResult>;

function mockFn(impl: GetCoverLetterFn): GetCoverLetterFn {
  return vi.fn(impl) as unknown as GetCoverLetterFn;
}

function makeProps(overrides: Partial<Parameters<typeof SessionCoverLetterModal>[0]> = {}) {
  return {
    sessionId: SESSION_ID,
    onClose: vi.fn(),
    onGetSessionCoverLetter: mockFn(() => Promise.resolve({ letter: LETTER_TEXT, quality_score: 88 })),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionCoverLetterModal', () => {
  it('shows loading spinner on mount before data resolves', () => {
    const props = makeProps({
      onGetSessionCoverLetter: mockFn(() => new Promise(() => {})), // never resolves
    });
    render(<SessionCoverLetterModal {...props} />);
    // The spinner uses motion-safe:animate-spin. Match by border-t class that's unique to it.
    const spinner = document.querySelector('.border-t-\\[\\#afc4ff\\]');
    expect(spinner).toBeTruthy();
  });

  it('displays the cover letter text after successful fetch', async () => {
    const getCoverLetter = mockFn(() => Promise.resolve({ letter: LETTER_TEXT, quality_score: 88 }));
    const props = makeProps({ onGetSessionCoverLetter: getCoverLetter });
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/Dear Hiring Manager/)).toBeTruthy();
    });
    expect(getCoverLetter).toHaveBeenCalledWith(SESSION_ID);
  });

  it('shows empty state when fetch returns null', async () => {
    const props = makeProps({
      onGetSessionCoverLetter: mockFn(() => Promise.resolve(null)),
    });
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/no cover letter found/i)).toBeTruthy();
    });
  });

  it('shows error state when fetch throws', async () => {
    const props = makeProps({
      onGetSessionCoverLetter: mockFn(() => Promise.reject(new Error('Network failure'))),
    });
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load cover letter/i)).toBeTruthy();
      expect(screen.getByText(/Network failure/)).toBeTruthy();
    });
  });

  it('renders Copy and Download buttons after successful fetch', async () => {
    const props = makeProps();
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/dear hiring manager/i)).toBeTruthy();
    });
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Download TXT')).toBeTruthy();
  });

  it('does not render Copy and Download buttons in loading state', () => {
    const props = makeProps({
      onGetSessionCoverLetter: mockFn(() => new Promise(() => {})),
    });
    render(<SessionCoverLetterModal {...props} />);
    expect(screen.queryByText('Copy')).toBeNull();
    expect(screen.queryByText('Download TXT')).toBeNull();
  });

  it('calls onClose when the X button is clicked', async () => {
    const onClose = vi.fn();
    const props = makeProps({ onClose });
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/dear hiring manager/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const props = makeProps({ onClose });
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/dear hiring manager/i)).toBeTruthy();
    });
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls downloadAsText with correct filename on Download click', async () => {
    const { downloadAsText } = await import('../lib/export');
    const props = makeProps();
    render(<SessionCoverLetterModal {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/dear hiring manager/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Download TXT'));
    expect(downloadAsText).toHaveBeenCalledWith(
      LETTER_TEXT,
      expect.stringContaining('cover-letter-'),
    );
  });

  it('renders the modal title', () => {
    const props = makeProps();
    render(<SessionCoverLetterModal {...props} />);
    expect(screen.getByText('Session Cover Letter')).toBeTruthy();
  });
});
