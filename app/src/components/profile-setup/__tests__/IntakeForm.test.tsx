// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntakeForm } from '../IntakeForm';

vi.mock('@/lib/resume-upload', () => ({
  extractResumeTextFromUpload: vi.fn(),
}));

describe('Profile Setup IntakeForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps submit disabled until resume and target roles meet the server minimums', () => {
    const onSubmit = vi.fn();
    render(<IntakeForm onSubmit={onSubmit} loading={false} />);

    const submit = screen.getByRole('button', { name: /build my benchmark profile/i });
    const resume = screen.getByLabelText(/resume text/i);
    const targetRoles = screen.getByLabelText(/target roles/i);

    expect(submit).toBeDisabled();

    fireEvent.change(resume, { target: { value: 'Too short for the server guard.' } });
    fireEvent.change(targetRoles, { target: { value: 'VP' } });

    expect(screen.getAllByText(/add at least/i)).toHaveLength(2);
    expect(submit).toBeDisabled();

    fireEvent.change(resume, { target: { value: 'A'.repeat(100) } });
    fireEvent.change(targetRoles, { target: { value: 'VP Engineering' } });

    expect(submit).not.toBeDisabled();
  });

  it('submits without LinkedIn context because that field is optional', () => {
    const onSubmit = vi.fn();
    render(<IntakeForm onSubmit={onSubmit} loading={false} />);

    fireEvent.change(screen.getByLabelText(/resume text/i), { target: { value: 'A'.repeat(120) } });
    fireEvent.change(screen.getByLabelText(/target roles/i), { target: { value: 'VP Engineering' } });

    fireEvent.click(screen.getByRole('button', { name: /build my benchmark profile/i }));

    expect(onSubmit).toHaveBeenCalledWith('A'.repeat(120), '', 'VP Engineering', '');
    expect(screen.queryByRole('button', { name: /add it now/i })).not.toBeInTheDocument();
  });
});
