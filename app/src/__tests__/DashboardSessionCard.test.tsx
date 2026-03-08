// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DashboardSessionCard } from '../components/dashboard/DashboardSessionCard';
import type { CoachSession } from '@/types/session';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CoachSession> = {}): CoachSession {
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    status: 'active',
    current_phase: 'onboarding',
    master_resume_id: null,
    job_application_id: null,
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    product_type: 'resume',
    company_name: 'Acme Corp',
    job_title: 'VP Engineering',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeProps(session: CoachSession, overrides: Record<string, unknown> = {}) {
  return {
    session,
    onResume: vi.fn(),
    onDelete: vi.fn(),
    onViewResume: vi.fn(),
    onViewCoverLetter: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardSessionCard — product-aware Eye button', () => {
  it('shows Eye button for completed resume session', () => {
    const session = makeSession({ pipeline_status: 'complete', product_type: 'resume' });
    render(<DashboardSessionCard {...makeProps(session)} />);
    expect(screen.getByRole('button', { name: /view resume/i })).toBeTruthy();
  });

  it('shows Eye button for completed cover letter session', () => {
    const session = makeSession({ pipeline_status: 'complete', product_type: 'cover_letter' });
    render(<DashboardSessionCard {...makeProps(session)} />);
    expect(screen.getByRole('button', { name: /view cover letter/i })).toBeTruthy();
  });

  it('does not show Eye button for non-complete sessions', () => {
    const session = makeSession({ pipeline_status: 'running' });
    render(<DashboardSessionCard {...makeProps(session)} />);
    expect(screen.queryByRole('button', { name: /view/i })).toBeNull();
  });

  it('calls onViewResume when Eye is clicked for a resume session', () => {
    const session = makeSession({ pipeline_status: 'complete', product_type: 'resume' });
    const props = makeProps(session);
    render(<DashboardSessionCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /view resume/i }));
    expect(props.onViewResume).toHaveBeenCalledWith(session.id);
    expect(props.onViewCoverLetter).not.toHaveBeenCalled();
  });

  it('calls onViewCoverLetter when Eye is clicked for a cover letter session', () => {
    const session = makeSession({ pipeline_status: 'complete', product_type: 'cover_letter' });
    const props = makeProps(session);
    render(<DashboardSessionCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /view cover letter/i }));
    expect(props.onViewCoverLetter).toHaveBeenCalledWith(session.id);
    expect(props.onViewResume).not.toHaveBeenCalled();
  });

  it('falls back to onViewResume when product_type is cover_letter but onViewCoverLetter is not provided', () => {
    const session = makeSession({ pipeline_status: 'complete', product_type: 'cover_letter' });
    const props = {
      session,
      onResume: vi.fn(),
      onDelete: vi.fn(),
      onViewResume: vi.fn(),
      // onViewCoverLetter intentionally omitted
    };
    render(<DashboardSessionCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /view cover letter/i }));
    expect(props.onViewResume).toHaveBeenCalledWith(session.id);
  });

  it('calls onViewResume when product_type is null (defaults to resume behavior)', () => {
    const session = makeSession({ pipeline_status: 'complete', product_type: null as unknown as string });
    const props = makeProps(session);
    render(<DashboardSessionCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /view resume/i }));
    expect(props.onViewResume).toHaveBeenCalledWith(session.id);
    expect(props.onViewCoverLetter).not.toHaveBeenCalled();
  });
});
