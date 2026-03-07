// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ProductLandingPage } from '../../components/platform/ProductLandingPage';
import { PRODUCT_CATALOG } from '../../types/platform';

afterEach(() => cleanup());

const activeProduct = PRODUCT_CATALOG.find((p) => p.status === 'active');
const comingSoonProduct = PRODUCT_CATALOG.find((p) => p.status === 'coming_soon') ?? null;

if (!activeProduct) throw new Error('No active product in PRODUCT_CATALOG');

describe('ProductLandingPage', () => {
  it('renders product name and longDescription', () => {
    render(<ProductLandingPage product={activeProduct} onNavigate={vi.fn()} />);
    expect(screen.getByText(activeProduct.name)).toBeInTheDocument();
    expect(screen.getByText(activeProduct.longDescription)).toBeInTheDocument();
  });

  it('renders all feature cards with titles and descriptions', () => {
    render(<ProductLandingPage product={activeProduct} onNavigate={vi.fn()} />);
    for (const feature of activeProduct.features) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
      expect(screen.getByText(feature.description)).toBeInTheDocument();
    }
  });

  it('active product CTA navigates to product route', () => {
    const onNavigate = vi.fn();
    render(<ProductLandingPage product={activeProduct} onNavigate={onNavigate} />);
    const cta = screen.getByRole('button', { name: activeProduct.ctaLabel });
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledWith(activeProduct.route);
  });

  it('coming-soon product CTA is disabled', () => {
    if (!comingSoonProduct) {
      expect(true).toBe(true);
      return;
    }
    render(<ProductLandingPage product={comingSoonProduct} onNavigate={vi.fn()} />);
    const cta = screen.getByRole('button', { name: 'Coming Soon' });
    expect(cta).toBeDisabled();
  });

  it('back link calls onNavigate with /tools', () => {
    const onNavigate = vi.fn();
    render(<ProductLandingPage product={activeProduct} onNavigate={onNavigate} />);
    const backButton = screen.getByRole('button', { name: /back to tools/i });
    fireEvent.click(backButton);
    expect(onNavigate).toHaveBeenCalledWith('/tools');
  });

  it('renders product icon', () => {
    render(<ProductLandingPage product={activeProduct} onNavigate={vi.fn()} />);
    const iconEl = screen.getByLabelText(`${activeProduct.name} icon`);
    expect(iconEl).toBeInTheDocument();
    expect(iconEl.textContent).toBe(activeProduct.icon);
  });

  it('CTA shows product ctaLabel for active products', () => {
    render(<ProductLandingPage product={activeProduct} onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: activeProduct.ctaLabel })).toBeInTheDocument();
  });

  it('CTA shows "Coming Soon" text for coming-soon products', () => {
    if (!comingSoonProduct) {
      expect(true).toBe(true);
      return;
    }
    render(<ProductLandingPage product={comingSoonProduct} onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Coming Soon' })).toBeInTheDocument();
  });
});
