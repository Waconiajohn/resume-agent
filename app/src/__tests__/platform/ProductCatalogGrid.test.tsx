// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ProductCatalogGrid } from '../../components/platform/ProductCatalogGrid';
import { PRODUCT_CATALOG } from '../../types/platform';

afterEach(() => cleanup());

describe('ProductCatalogGrid', () => {
  it('renders all products from the catalog', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    for (const product of PRODUCT_CATALOG) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  it('renders "Coming Soon" badges for non-active products', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    const comingSoonBadges = screen.getAllByText('Coming Soon');
    const comingSoonCount = PRODUCT_CATALOG.filter((p) => p.status === 'coming_soon').length;
    expect(comingSoonBadges).toHaveLength(comingSoonCount);
  });

  it('renders short descriptions for each product', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    for (const product of PRODUCT_CATALOG) {
      expect(screen.getByText(product.shortDescription)).toBeInTheDocument();
    }
  });

  it('calls onNavigate with the correct route when an active product card is clicked', () => {
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);
    const activeProduct = PRODUCT_CATALOG.find((p) => p.status === 'active');
    if (!activeProduct) throw new Error('No active product in catalog');
    const card = screen.getByRole('button', { name: `Open ${activeProduct.name}` });
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledWith(`/tools/${activeProduct.slug}`);
  });

  it('does not call onNavigate when a coming-soon product is clicked', () => {
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);
    const comingSoonProduct = PRODUCT_CATALOG.find((p) => p.status === 'coming_soon');
    if (!comingSoonProduct) throw new Error('No coming-soon product in catalog');
    // Coming-soon cards have no button role; clicking should be a no-op
    const descriptions = screen.getAllByText(comingSoonProduct.shortDescription);
    fireEvent.click(descriptions[0]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('renders the section heading', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    expect(screen.getByText('AI Career Tools')).toBeInTheDocument();
  });

  it('active product card is keyboard-activatable via Enter key', () => {
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);
    const activeProduct = PRODUCT_CATALOG.find((p) => p.status === 'active');
    if (!activeProduct) throw new Error('No active product in catalog');
    const card = screen.getByRole('button', { name: `Open ${activeProduct.name}` });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith(`/tools/${activeProduct.slug}`);
  });
});
