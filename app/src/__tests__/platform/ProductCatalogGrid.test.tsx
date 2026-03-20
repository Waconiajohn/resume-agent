// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ProductCatalogGrid, CONTINUE_WITH_IDS } from '../../components/platform/ProductCatalogGrid';
import { PRODUCT_CATALOG } from '../../types/platform';

afterEach(() => cleanup());

describe('ProductCatalogGrid', () => {
  it('renders the simplified guided sections', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);

    expect(screen.getByText('Start Here')).toBeInTheDocument();
    expect(screen.getByText('Continue Your Search')).toBeInTheDocument();
    expect(screen.getByText(/Later-stage and secondary tools are still available/i)).toBeInTheDocument();
  });

  it('renders the three primary start-here tools', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);

    expect(screen.getByText('Career Profile')).toBeInTheDocument();
    expect(screen.getByText('Resume Builder')).toBeInTheDocument();
    expect(screen.getByText('Job Command Center')).toBeInTheDocument();
  });

  it('renders the narrowed continue-with tools', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);

    for (const id of CONTINUE_WITH_IDS) {
      const product = PRODUCT_CATALOG.find((item) => item.id === id);
      expect(product).toBeDefined();
      expect(screen.getByText(product!.name)).toBeInTheDocument();
    }
  });

  it('does not expose secondary tools as primary clickable entry points', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Open Cover Letter Writer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Salary & Negotiation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Smart Referrals' })).not.toBeInTheDocument();
  });

  it('shows secondary tools as workflow hints instead', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);

    expect(screen.getByText('Cover Letter Writer')).toBeInTheDocument();
    expect(screen.getByText('Open this from Resume Builder.')).toBeInTheDocument();
    expect(screen.getByText('Salary & Negotiation')).toBeInTheDocument();
    expect(screen.getByText(/Job Workspace when you reach offer stage/i)).toBeInTheDocument();
  });

  it('calls onNavigate when a start-here card is clicked', () => {
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Career Profile' }));
    expect(onNavigate).toHaveBeenCalledWith('/workspace?room=career-profile');
  });

  it('calls onNavigate when a continue-with card is clicked', () => {
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open LinkedIn Studio' }));
    expect(onNavigate).toHaveBeenCalledWith('/workspace?room=linkedin');
  });

  it('renders coach CTA with default label when no userName', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} onOpenCoach={vi.fn()} />);
    expect(screen.getByText(/Chat with AI Coach/)).toBeInTheDocument();
  });

  it('renders coach CTA with personalized name', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} onOpenCoach={vi.fn()} userName="John Schrup" />);
    expect(screen.getByText(/Chat with AI John/)).toBeInTheDocument();
  });

  it('falls back to AI Coach when userName is not a real name', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} onOpenCoach={vi.fn()} userName="jjschrup@yahoo.com" />);
    expect(screen.getByText(/Chat with AI Coach/)).toBeInTheDocument();
  });

  it('calls onOpenCoach when CTA button is clicked', () => {
    const onOpenCoach = vi.fn();
    render(<ProductCatalogGrid onNavigate={vi.fn()} onOpenCoach={onOpenCoach} userName="John" />);

    fireEvent.click(screen.getByRole('button', { name: /Chat with AI John/i }));
    expect(onOpenCoach).toHaveBeenCalledTimes(1);
  });

  it('has a page heading for accessibility', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI Career Tools');
  });
});
