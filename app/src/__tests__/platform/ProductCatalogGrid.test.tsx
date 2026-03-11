// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ProductCatalogGrid, TOOL_GROUPS } from '../../components/platform/ProductCatalogGrid';
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
    const comingSoonCount = PRODUCT_CATALOG.filter((p) => p.status === 'coming_soon').length;
    if (comingSoonCount === 0) {
      expect(screen.queryAllByText('Coming Soon')).toHaveLength(0);
    } else {
      expect(screen.getAllByText('Coming Soon')).toHaveLength(comingSoonCount);
    }
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
    expect(onNavigate).toHaveBeenCalledWith(activeProduct.route);
  });

  it('does not call onNavigate when a coming-soon product is clicked', () => {
    const comingSoonProduct = PRODUCT_CATALOG.find((p) => p.status === 'coming_soon');
    if (!comingSoonProduct) {
      expect(true).toBe(true);
      return;
    }
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);
    const descriptions = screen.getAllByText(comingSoonProduct.shortDescription);
    fireEvent.click(descriptions[0]);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('active product card is keyboard-activatable via Enter key', () => {
    const onNavigate = vi.fn();
    render(<ProductCatalogGrid onNavigate={onNavigate} />);
    const activeProduct = PRODUCT_CATALOG.find((p) => p.status === 'active');
    if (!activeProduct) throw new Error('No active product in catalog');
    const card = screen.getByRole('button', { name: `Open ${activeProduct.name}` });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith(activeProduct.route);
  });

  it('catalog has at least 22 entries', () => {
    expect(PRODUCT_CATALOG.length).toBeGreaterThanOrEqual(22);
  });

  it('includes financial category products', () => {
    const financial = PRODUCT_CATALOG.filter((p) => p.category === 'financial');
    expect(financial.length).toBeGreaterThanOrEqual(1);
  });

  // --- Org chart / theme group tests ---

  it('renders 6 theme group labels', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    for (const group of TOOL_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it('every product in PRODUCT_CATALOG appears in exactly one TOOL_GROUP', () => {
    const allGroupedIds = TOOL_GROUPS.flatMap(g => g.productIds);
    for (const product of PRODUCT_CATALOG) {
      const count = allGroupedIds.filter(id => id === product.id).length;
      expect(count).toBe(1);
    }
  });

  it('every ID in TOOL_GROUPS resolves to a product in PRODUCT_CATALOG', () => {
    const catalogIds = new Set(PRODUCT_CATALOG.map(p => p.id));
    for (const group of TOOL_GROUPS) {
      for (const id of group.productIds) {
        expect(catalogIds.has(id)).toBe(true);
      }
    }
  });

  it('renders coach hero card with default name when no userName', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
    expect(screen.getByText('Your Virtual Career Coach')).toBeInTheDocument();
  });

  it('renders coach hero card with personalized name', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} userName="John Schrup" />);
    expect(screen.getByText('AI John')).toBeInTheDocument();
  });

  it('falls back to "AI Coach" when userName is "there"', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} userName="there" />);
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
  });

  it('falls back to "AI Coach" when userName contains @', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} userName="jjschrup@yahoo.com" />);
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
  });

  it('calls onOpenCoach when CTA button is clicked', () => {
    const onOpenCoach = vi.fn();
    render(<ProductCatalogGrid onNavigate={vi.fn()} onOpenCoach={onOpenCoach} userName="John" />);
    const ctaButton = screen.getByRole('button', { name: /Talk to AI John/i });
    fireEvent.click(ctaButton);
    expect(onOpenCoach).toHaveBeenCalledTimes(1);
  });

  it('does not render CTA button when onOpenCoach is not provided', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} userName="John" />);
    expect(screen.queryByRole('button', { name: /Talk to AI John/i })).not.toBeInTheDocument();
  });

  it('has a visually-hidden h1 heading for accessibility', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('AI Career Tools');
  });

  it('product names use h4 elements (under h3 group headings)', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    const h4s = screen.getAllByRole('heading', { level: 4 });
    expect(h4s.length).toBe(PRODUCT_CATALOG.length);
  });

  it('group labels use h3 elements', () => {
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    const h3s = screen.getAllByRole('heading', { level: 3 });
    expect(h3s.length).toBe(TOOL_GROUPS.length);
  });

  it('sorts products within groups: active before coming_soon', () => {
    // Find a group that has both active and coming_soon products
    const mixedGroup = TOOL_GROUPS.find(g => {
      const products = g.productIds.map(id => PRODUCT_CATALOG.find(p => p.id === id));
      const statuses = products.map(p => p?.status);
      return statuses.includes('active') && statuses.includes('coming_soon');
    });
    if (!mixedGroup) {
      // No mixed group exists — test is satisfied
      expect(true).toBe(true);
      return;
    }
    render(<ProductCatalogGrid onNavigate={vi.fn()} />);
    const groupProducts = mixedGroup.productIds
      .map(id => PRODUCT_CATALOG.find(p => p.id === id)!)
      .filter(Boolean);
    // Get rendered order by finding all product name headings within the page
    const allH4s = screen.getAllByRole('heading', { level: 4 });
    const groupH4Texts = allH4s
      .map(h => h.textContent ?? '')
      .filter(text => groupProducts.some(p => p.name === text));
    // Verify active products come before coming_soon
    let seenComingSoon = false;
    for (const text of groupH4Texts) {
      const product = groupProducts.find(p => p.name === text);
      if (product?.status === 'coming_soon') seenComingSoon = true;
      if (product?.status === 'active' && seenComingSoon) {
        throw new Error(`Active product "${text}" appeared after a coming_soon product in group "${mixedGroup.label}"`);
      }
    }
  });
});
