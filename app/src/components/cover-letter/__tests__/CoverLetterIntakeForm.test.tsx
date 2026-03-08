// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { CoverLetterIntakeForm } from '../CoverLetterIntakeForm';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    type,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    type?: string;
    disabled?: boolean;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button type={(type as 'button' | 'submit' | 'reset') ?? 'button'} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/GlassInput', () => ({
  GlassTextarea: ({
    id,
    value,
    onChange,
    placeholder,
    rows,
    disabled,
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
    />
  ),
  GlassInput: ({
    id,
    value,
    onChange,
    placeholder,
    disabled,
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LONG_RESUME = 'A'.repeat(60); // 60 chars — passes the 50-char minimum

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    loading: false,
    error: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CoverLetterIntakeForm — pre-fill', () => {
  it('renders with an empty resume textarea when no defaultResumeText is given', () => {
    render(<CoverLetterIntakeForm {...makeProps()} />);
    const textarea = screen.getByPlaceholderText(/paste your resume text here/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('pre-fills the resume textarea with defaultResumeText when provided at mount', () => {
    render(<CoverLetterIntakeForm {...makeProps({ defaultResumeText: LONG_RESUME })} />);
    const textarea = screen.getByPlaceholderText(/paste your resume text here/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe(LONG_RESUME);
  });

  it('updates the resume textarea when defaultResumeText arrives asynchronously (field still empty)', async () => {
    const { rerender } = render(<CoverLetterIntakeForm {...makeProps()} />);
    const textarea = screen.getByPlaceholderText(/paste your resume text here/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    await act(async () => {
      rerender(<CoverLetterIntakeForm {...makeProps({ defaultResumeText: LONG_RESUME })} />);
    });

    await waitFor(() => {
      expect(textarea.value).toBe(LONG_RESUME);
    });
  });

  it('does not overwrite user-edited content when defaultResumeText later changes', async () => {
    const { rerender } = render(<CoverLetterIntakeForm {...makeProps()} />);
    const textarea = screen.getByPlaceholderText(/paste your resume text here/i) as HTMLTextAreaElement;

    // User types something
    fireEvent.change(textarea, { target: { value: 'My custom resume text that is long enough for validation' } });
    expect(textarea.value).toBe('My custom resume text that is long enough for validation');

    // defaultResumeText arrives — should NOT overwrite user content because field is no longer empty
    await act(async () => {
      rerender(<CoverLetterIntakeForm {...makeProps({ defaultResumeText: LONG_RESUME })} />);
    });

    expect(textarea.value).toBe('My custom resume text that is long enough for validation');
  });

  it('allows user to clear and override pre-filled text', () => {
    render(<CoverLetterIntakeForm {...makeProps({ defaultResumeText: LONG_RESUME })} />);
    const textarea = screen.getByPlaceholderText(/paste your resume text here/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe(LONG_RESUME);

    fireEvent.change(textarea, { target: { value: '' } });
    expect(textarea.value).toBe('');

    fireEvent.change(textarea, { target: { value: 'Override content from user' } });
    expect(textarea.value).toBe('Override content from user');
  });
});

describe('CoverLetterIntakeForm — loading indicator', () => {
  it('does not show loading indicator when resumeLoading is false', () => {
    render(<CoverLetterIntakeForm {...makeProps({ resumeLoading: false })} />);
    expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
  });

  it('shows loading indicator when resumeLoading is true', () => {
    render(<CoverLetterIntakeForm {...makeProps({ resumeLoading: true })} />);
    expect(screen.getByTestId('resume-loading-indicator')).toBeInTheDocument();
    expect(screen.getByText(/loading resume/i)).toBeInTheDocument();
  });

  it('hides loading indicator once resumeLoading transitions to false', async () => {
    const { rerender } = render(<CoverLetterIntakeForm {...makeProps({ resumeLoading: true })} />);
    expect(screen.getByTestId('resume-loading-indicator')).toBeInTheDocument();

    rerender(<CoverLetterIntakeForm {...makeProps({ resumeLoading: false })} />);
    await waitFor(() => {
      expect(screen.queryByTestId('resume-loading-indicator')).not.toBeInTheDocument();
    });
  });
});

describe('CoverLetterIntakeForm — validation with pre-filled text', () => {
  it('pre-filled text that meets 50-char minimum enables the submit button', () => {
    render(
      <CoverLetterIntakeForm
        {...makeProps({ defaultResumeText: LONG_RESUME })}
      />,
    );
    // Fill job description and company so the only blocker could be resume text length
    fireEvent.change(screen.getByPlaceholderText(/paste the job description/i), {
      target: { value: 'Software Engineer' },
    });
    fireEvent.change(screen.getByPlaceholderText(/acme corp/i), {
      target: { value: 'Acme Corp' },
    });

    const submitBtn = screen.getByRole('button', { name: /generate cover letter/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('pre-filled text shorter than 50 chars keeps the submit button disabled', () => {
    render(
      <CoverLetterIntakeForm
        {...makeProps({ defaultResumeText: 'Too short' })}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/paste the job description/i), {
      target: { value: 'Software Engineer' },
    });
    fireEvent.change(screen.getByPlaceholderText(/acme corp/i), {
      target: { value: 'Acme Corp' },
    });

    const submitBtn = screen.getByRole('button', { name: /generate cover letter/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button is disabled when there is no default resume and field is empty', () => {
    render(<CoverLetterIntakeForm {...makeProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/paste the job description/i), {
      target: { value: 'Software Engineer' },
    });
    fireEvent.change(screen.getByPlaceholderText(/acme corp/i), {
      target: { value: 'Acme Corp' },
    });

    const submitBtn = screen.getByRole('button', { name: /generate cover letter/i });
    expect(submitBtn).toBeDisabled();
  });
});
