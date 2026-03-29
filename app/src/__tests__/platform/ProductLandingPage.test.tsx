// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ProductLandingPage } from '../../components/platform/ProductLandingPage';
import { PRODUCT_CATALOG } from '../../types/platform';

afterEach(() => cleanup());

const activeProduct = PRODUCT_CATALOG.find((p) => p.status === 'active');

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

  it('does not render waitlist or coming-soon messaging', () => {
    render(<ProductLandingPage product={activeProduct} onNavigate={vi.fn()} />);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/join waitlist/i)).not.toBeInTheDocument();
  });
});
