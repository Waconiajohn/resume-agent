// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionResumeModal } from '../components/dashboard/SessionResumeModal';
import type { FinalResume } from '@/types/resume';

vi.mock('../lib/export', () => ({
  resumeToText: vi.fn((resume: FinalResume) => resume.summary ?? ''),
  downloadAsText: vi.fn(),
}));

const SESSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

type GetResumeFn = (id: string) => Promise<FinalResume | null>;

function mockFn(impl: GetResumeFn): GetResumeFn {
  return vi.fn(impl) as unknown as GetResumeFn;
}

function makeResume(): FinalResume {
  return {
    summary: 'Experienced VP Engineering leader',
    experience: [],
    skills: {},
    education: [],
    certifications: [],
    ats_score: 86,
  };
}

function makeProps(overrides: Partial<Parameters<typeof SessionResumeModal>[0]> = {}) {
  return {
    sessionId: SESSION_ID,
    onClose: vi.fn(),
    onGetSessionResume: mockFn(() => Promise.resolve(makeResume())),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionResumeModal', () => {
  it('shows loading spinner on mount before data resolves', () => {
    render(
      <SessionResumeModal
        {...makeProps({
          onGetSessionResume: mockFn(() => new Promise(() => {})),
        })}
      />,
    );

    const spinner = document.querySelector('.motion-safe\\:animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('displays the saved resume text after successful fetch', async () => {
    const getResume = mockFn(() => Promise.resolve(makeResume()));
    render(<SessionResumeModal {...makeProps({ onGetSessionResume: getResume })} />);

    await waitFor(() => {
      expect(screen.getByText(/Experienced VP Engineering leader/i)).toBeTruthy();
    });

    expect(getResume).toHaveBeenCalledWith(SESSION_ID);
  });

  it('shows empty state when fetch returns null', async () => {
    render(<SessionResumeModal {...makeProps({ onGetSessionResume: mockFn(() => Promise.resolve(null)) })} />);

    await waitFor(() => {
      expect(screen.getByText(/no saved resume was found for this session/i)).toBeTruthy();
    });
  });

  it('shows error state when fetch throws', async () => {
    render(
      <SessionResumeModal
        {...makeProps({
          onGetSessionResume: mockFn(() => Promise.reject(new Error('Network failure'))),
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load resume/i)).toBeTruthy();
      expect(screen.getByText(/network failure/i)).toBeTruthy();
    });
  });

  it('renders copy and download buttons after successful fetch', async () => {
    render(<SessionResumeModal {...makeProps()} />);

    await waitFor(() => {
      expect(screen.getByText(/Experienced VP Engineering leader/i)).toBeTruthy();
    });

    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Download TXT')).toBeTruthy();
  });

  it('renders the updated modal title', async () => {
    render(<SessionResumeModal {...makeProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Saved Resume')).toBeTruthy();
    });
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<SessionResumeModal {...makeProps({ onClose })} />);

    await waitFor(() => {
      expect(screen.getByText(/Experienced VP Engineering leader/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
