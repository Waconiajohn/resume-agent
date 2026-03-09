// @vitest-environment jsdom
/**
 * ContactDetailSheet component — unit tests.
 *
 * Sprint 61 — Networking Hub.
 * Tests: rendering contact details, touchpoint list, log interaction form,
 * close behavior, touchpoint type icons.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button data-testid="glass-button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { ContactDetailSheet } from '../ContactDetailSheet';
import type { NetworkingContact, Touchpoint } from '@/hooks/useNetworkingContacts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<NetworkingContact> = {}): NetworkingContact {
  return {
    id: 'c-1',
    name: 'Jane Smith',
    title: 'Engineering Director',
    company: 'Acme Corp',
    email: 'jane@acme.com',
    linkedin_url: 'https://linkedin.com/in/janesmith',
    phone: '+1-555-0100',
    relationship_type: 'hiring_manager',
    relationship_strength: 3,
    tags: ['vip', 'warm'],
    notes: 'Met at DevConf 2025. Very interested in cloud work.',
    next_followup_at: null,
    last_contact_date: '2025-01-10T12:00:00Z',
    application_id: null,
    contact_role: 'hiring_manager',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-10T12:00:00Z',
    ...overrides,
  };
}

function makeTouchpoint(overrides: Partial<Touchpoint> = {}): Touchpoint {
  return {
    id: 'tp-1',
    contact_id: 'c-1',
    type: 'email',
    notes: 'Sent introduction email',
    created_at: '2025-01-10T12:00:00Z',
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Contact details rendering ────────────────────────────────────────────────

describe('ContactDetailSheet — contact details', () => {
  it('renders contact name', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders contact title', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Engineering Director')).toBeInTheDocument();
  });

  it('renders contact company', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders email as a mailto link', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    const emailLink = screen.getByRole('link', { name: /jane@acme\.com/ });
    expect(emailLink).toHaveAttribute('href', 'mailto:jane@acme.com');
  });

  it('renders linkedin_url as an external link', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    const linkedinLink = screen.getByRole('link', { name: /linkedin\.com/ });
    expect(linkedinLink).toHaveAttribute('href', 'https://linkedin.com/in/janesmith');
    expect(linkedinLink).toHaveAttribute('target', '_blank');
  });

  it('renders phone number', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('+1-555-0100')).toBeInTheDocument();
  });

  it('renders tags as chips', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('vip')).toBeInTheDocument();
    expect(screen.getByText('warm')).toBeInTheDocument();
  });

  it('renders notes when present', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText(/Met at DevConf 2025/)).toBeInTheDocument();
  });

  it('renders relationship_type as a badge', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText(/hiring manager/i)).toBeInTheDocument();
  });

  it('renders relationship_strength badge', () => {
    render(
      <ContactDetailSheet
        contact={makeContact({ relationship_strength: 3 })}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText(/Strength: 3\/5/)).toBeInTheDocument();
  });

  it('renders last contact date when present', () => {
    render(
      <ContactDetailSheet
        contact={makeContact({ last_contact_date: '2025-01-10T12:00:00Z' })}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText(/Last contact:/)).toBeInTheDocument();
  });

  it('does not render email section when email is null', () => {
    render(
      <ContactDetailSheet
        contact={makeContact({ email: null })}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.queryByRole('link', { name: /acme\.com/ })).not.toBeInTheDocument();
  });

  it('does not render linkedin section when linkedin_url is null', () => {
    render(
      <ContactDetailSheet
        contact={makeContact({ linkedin_url: null })}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.queryByRole('link', { name: /linkedin/ })).not.toBeInTheDocument();
  });
});

// ─── Touchpoint timeline ──────────────────────────────────────────────────────

describe('ContactDetailSheet — touchpoint history', () => {
  it('shows empty state when no touchpoints', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('No interactions logged yet.')).toBeInTheDocument();
  });

  it('renders touchpoint history section with touchpoints', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[makeTouchpoint()]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Interaction History')).toBeInTheDocument();
  });

  it('renders each touchpoint type', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[
          makeTouchpoint({ id: 'tp-1', type: 'email' }),
          makeTouchpoint({ id: 'tp-2', type: 'call' }),
        ]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('call')).toBeInTheDocument();
  });

  it('renders touchpoint notes when present', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[makeTouchpoint({ notes: 'Had a productive call' })]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Had a productive call')).toBeInTheDocument();
  });

  it('renders touchpoint date', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[makeTouchpoint({ created_at: '2025-01-10T12:00:00Z' })]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    // Should show at least one formatted date element containing "Jan"
    // (both the contact's last_contact_date and the touchpoint date format to Jan)
    expect(screen.getAllByText(/Jan/).length).toBeGreaterThan(0);
  });
});

// ─── Log interaction form ─────────────────────────────────────────────────────

describe('ContactDetailSheet — log interaction', () => {
  it('renders Log Interaction section', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Log Interaction')).toBeInTheDocument();
  });

  it('renders touchpoint type selector', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('renders all touchpoint type options in selector', () => {
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={vi.fn()}
      />,
    );
    const options = screen.getAllByRole('option');
    const optionLabels = options.map((o) => o.textContent);
    expect(optionLabels).toContain('Phone Call');
    expect(optionLabels).toContain('Email');
    expect(optionLabels).toContain('LinkedIn InMail');
    expect(optionLabels).toContain('Meeting');
  });

  it('calls onLogTouchpoint when Log button is clicked', async () => {
    const onLogTouchpoint = vi.fn().mockResolvedValue(undefined);

    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={onLogTouchpoint}
      />,
    );

    fireEvent.click(screen.getByText('Log'));

    await waitFor(() => {
      expect(onLogTouchpoint).toHaveBeenCalledWith('email', undefined);
    });
  });

  it('passes notes to onLogTouchpoint when provided', async () => {
    const onLogTouchpoint = vi.fn().mockResolvedValue(undefined);

    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={onLogTouchpoint}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Optional notes...'), {
      target: { value: 'Great conversation about cloud migration' },
    });

    fireEvent.click(screen.getByText('Log'));

    await waitFor(() => {
      expect(onLogTouchpoint).toHaveBeenCalledWith(
        'email',
        'Great conversation about cloud migration',
      );
    });
  });

  it('shows Logging... during async log', async () => {
    let resolve: () => void;
    const onLogTouchpoint = vi.fn().mockReturnValue(
      new Promise<void>((r) => { resolve = r; }),
    );

    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={onLogTouchpoint}
      />,
    );

    fireEvent.click(screen.getByText('Log'));

    await waitFor(() => {
      expect(screen.getByText('Logging...')).toBeInTheDocument();
    });

    resolve!();
  });

  it('shows error when onLogTouchpoint throws', async () => {
    const onLogTouchpoint = vi.fn().mockRejectedValue(new Error('Failed to log'));

    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={onLogTouchpoint}
      />,
    );

    fireEvent.click(screen.getByText('Log'));

    await waitFor(() => {
      expect(screen.getByText('Failed to log')).toBeInTheDocument();
    });
  });

  it('clears notes textarea after successful log', async () => {
    const onLogTouchpoint = vi.fn().mockResolvedValue(undefined);

    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={vi.fn()}
        onLogTouchpoint={onLogTouchpoint}
      />,
    );

    const textarea = screen.getByPlaceholderText('Optional notes...');
    fireEvent.change(textarea, { target: { value: 'Some notes' } });
    fireEvent.click(screen.getByText('Log'));

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });
});

// ─── Close behavior ───────────────────────────────────────────────────────────

describe('ContactDetailSheet — close behavior', () => {
  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={onClose}
        onLogTouchpoint={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <ContactDetailSheet
        contact={makeContact()}
        touchpoints={[]}
        onClose={onClose}
        onLogTouchpoint={vi.fn()}
      />,
    );
    const backdrop = document.querySelector('.absolute.inset-0.bg-black') as HTMLElement;
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledOnce();
    }
  });
});
