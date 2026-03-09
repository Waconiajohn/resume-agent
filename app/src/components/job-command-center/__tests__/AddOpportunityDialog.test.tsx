// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AddOpportunityDialog } from '../AddOpportunityDialog';

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AddOpportunityDialog — visibility', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <AddOpportunityDialog open={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog heading when open=true', () => {
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText('Add Application')).toBeInTheDocument();
  });

  it('renders form fields when open=true', () => {
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('e.g. VP Operations')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Acme Corp')).toBeInTheDocument();
  });
});

describe('AddOpportunityDialog — submit button state', () => {
  it('submit button is disabled when both fields are empty', () => {
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText('Add to Pipeline')).toBeDisabled();
  });

  it('submit button is disabled when only role title is filled', () => {
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. VP Operations'), {
      target: { value: 'VP Engineering' },
    });
    expect(screen.getByText('Add to Pipeline')).toBeDisabled();
  });

  it('submit button is disabled when only company is filled', () => {
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    expect(screen.getByText('Add to Pipeline')).toBeDisabled();
  });

  it('submit button is enabled when both role and company are filled', () => {
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. VP Operations'), {
      target: { value: 'VP Engineering' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    expect(screen.getByText('Add to Pipeline')).not.toBeDisabled();
  });
});

describe('AddOpportunityDialog — form submission', () => {
  it('calls onSubmit with correct role_title and company_name', () => {
    const onSubmit = vi.fn();
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. VP Operations'), {
      target: { value: 'VP Engineering' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByText('Add to Pipeline'));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        role_title: 'VP Engineering',
        company_name: 'Acme Corp',
      }),
    );
  });

  it('includes source in submitted data', () => {
    const onSubmit = vi.fn();
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. VP Operations'), {
      target: { value: 'Director of Product' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), {
      target: { value: 'TechCo' },
    });
    fireEvent.click(screen.getByText('Add to Pipeline'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual' }),
    );
  });

  it('trims whitespace from role_title and company_name before submitting', () => {
    const onSubmit = vi.fn();
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. VP Operations'), {
      target: { value: '  VP Engineering  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), {
      target: { value: '  Acme Corp  ' },
    });
    fireEvent.click(screen.getByText('Add to Pipeline'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ role_title: 'VP Engineering', company_name: 'Acme Corp' }),
    );
  });

  it('does not call onSubmit when button is disabled', () => {
    const onSubmit = vi.fn();
    render(<AddOpportunityDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Add to Pipeline'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('AddOpportunityDialog — cancel / close', () => {
  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<AddOpportunityDialog open={true} onClose={onClose} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose after successful submission', () => {
    const onClose = vi.fn();
    render(<AddOpportunityDialog open={true} onClose={onClose} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. VP Operations'), {
      target: { value: 'VP Engineering' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByText('Add to Pipeline'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
