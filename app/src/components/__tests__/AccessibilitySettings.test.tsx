// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessibilitySettings } from '../AccessibilitySettings';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// matchMedia stub is provided by test-setup.ts but override here for safety
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderOpen(onClose = vi.fn()) {
  return render(<AccessibilitySettings isOpen={true} onClose={onClose} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccessibilitySettings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Remove any data attributes set by previous tests
    document.documentElement.removeAttribute('data-font-size');
    document.documentElement.removeAttribute('data-contrast');
    document.documentElement.removeAttribute('data-reduced-motion');
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders font size radio group with 3 options (Standard, Large, Extra Large)', () => {
    renderOpen();
    // Use value-based queries because role name for sr-only radios is the label text,
    // and "large" is a substring of "extra large" — so query by value to avoid ambiguity.
    const allRadios = screen.getAllByRole('radio');
    const fontSizeRadios = allRadios.filter(
      (r) => (r as HTMLInputElement).name === 'font-size',
    ) as HTMLInputElement[];
    expect(fontSizeRadios).toHaveLength(3);
    const values = fontSizeRadios.map((r) => r.value);
    expect(values).toContain('standard');
    expect(values).toContain('large');
    expect(values).toContain('xl');
  });

  it('renders high contrast toggle switch', () => {
    renderOpen();
    const toggle = screen.getByRole('switch', { name: /high contrast/i });
    expect(toggle).toBeInTheDocument();
  });

  it('renders reduced motion toggle switch', () => {
    renderOpen();
    const toggle = screen.getByRole('switch', { name: /reduce motion/i });
    expect(toggle).toBeInTheDocument();
  });

  it('renders theme radio group with Dark and Light options', () => {
    renderOpen();
    const themeRadios = screen.getAllByRole('radio', { name: /dark|light/i });
    // There are 2 theme options
    const themeValues = themeRadios.map((r) => (r as HTMLInputElement).value);
    expect(themeValues).toContain('dark');
    expect(themeValues).toContain('light');
  });

  it('does not render when isOpen is false', () => {
    render(<AccessibilitySettings isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Font size interaction
  // -------------------------------------------------------------------------

  it('changing font size to Large updates localStorage and data-font-size attribute', async () => {
    const user = userEvent.setup();
    renderOpen();

    // Select by value to avoid the ambiguity between "Large" and "Extra Large" labels
    const allRadios = screen.getAllByRole('radio') as HTMLInputElement[];
    const largeRadio = allRadios.find((r) => r.value === 'large' && r.name === 'font-size')!;
    await user.click(largeRadio);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'careeriq_accessibility',
      expect.stringContaining('"fontSize":"large"'),
    );
    expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
  });

  it('changing font size to Extra Large updates localStorage and data-font-size attribute', async () => {
    const user = userEvent.setup();
    renderOpen();

    const xlRadio = screen.getByRole('radio', { name: /extra large/i });
    await user.click(xlRadio);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'careeriq_accessibility',
      expect.stringContaining('"fontSize":"xl"'),
    );
    expect(document.documentElement.getAttribute('data-font-size')).toBe('xl');
  });

  it('selecting Standard font size removes data-font-size attribute', async () => {
    // Pre-set a non-standard font size so we can verify removal
    document.documentElement.setAttribute('data-font-size', 'large');
    localStorageMock.setItem(
      'careeriq_accessibility',
      JSON.stringify({ fontSize: 'large', highContrast: false, reducedMotion: false }),
    );

    const user = userEvent.setup();
    renderOpen();

    const standardRadio = screen.getByRole('radio', { name: /standard/i });
    await user.click(standardRadio);

    expect(document.documentElement.getAttribute('data-font-size')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // High contrast toggle
  // -------------------------------------------------------------------------

  it('toggling high contrast on updates localStorage and sets data-contrast="high"', async () => {
    const user = userEvent.setup();
    renderOpen();

    const toggle = screen.getByRole('switch', { name: /high contrast/i });
    await user.click(toggle);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'careeriq_accessibility',
      expect.stringContaining('"highContrast":true'),
    );
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
  });

  it('high contrast toggle starts unchecked by default', () => {
    renderOpen();
    const toggle = screen.getByRole('switch', { name: /high contrast/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('high contrast toggle shows checked state after click', async () => {
    const user = userEvent.setup();
    renderOpen();

    const toggle = screen.getByRole('switch', { name: /high contrast/i });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  // -------------------------------------------------------------------------
  // Reduced motion toggle
  // -------------------------------------------------------------------------

  it('toggling reduced motion on updates localStorage and sets data-reduced-motion="true"', async () => {
    const user = userEvent.setup();
    renderOpen();

    const toggle = screen.getByRole('switch', { name: /reduce motion/i });
    await user.click(toggle);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'careeriq_accessibility',
      expect.stringContaining('"reducedMotion":true'),
    );
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
  });

  it('reduced motion toggle starts unchecked by default', () => {
    renderOpen();
    const toggle = screen.getByRole('switch', { name: /reduce motion/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  // -------------------------------------------------------------------------
  // Close button
  // -------------------------------------------------------------------------

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderOpen(onClose);

    const closeBtn = screen.getByRole('button', { name: /close accessibility settings/i });
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Escape key
  // -------------------------------------------------------------------------

  it('pressing Escape key closes the panel', () => {
    const onClose = vi.fn();
    renderOpen(onClose);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing a non-Escape key does not close the panel', () => {
    const onClose = vi.fn();
    renderOpen(onClose);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Restore saved settings from localStorage on mount
  // -------------------------------------------------------------------------

  it('restores saved font size from localStorage on mount', () => {
    localStorageMock.setItem(
      'careeriq_accessibility',
      JSON.stringify({ fontSize: 'xl', highContrast: false, reducedMotion: false }),
    );

    renderOpen();

    const xlRadio = screen.getByRole('radio', { name: /extra large/i }) as HTMLInputElement;
    expect(xlRadio.checked).toBe(true);
  });

  it('restores saved high contrast from localStorage on mount', () => {
    localStorageMock.setItem(
      'careeriq_accessibility',
      JSON.stringify({ fontSize: 'standard', highContrast: true, reducedMotion: false }),
    );

    renderOpen();

    const toggle = screen.getByRole('switch', { name: /high contrast/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('restores saved reduced motion from localStorage on mount', () => {
    localStorageMock.setItem(
      'careeriq_accessibility',
      JSON.stringify({ fontSize: 'standard', highContrast: false, reducedMotion: true }),
    );

    renderOpen();

    const toggle = screen.getByRole('switch', { name: /reduce motion/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('uses defaults when localStorage has no saved settings', () => {
    renderOpen();

    const standardRadio = screen.getByRole('radio', { name: /standard/i }) as HTMLInputElement;
    expect(standardRadio.checked).toBe(true);

    const highContrastToggle = screen.getByRole('switch', { name: /high contrast/i });
    expect(highContrastToggle).toHaveAttribute('aria-checked', 'false');

    const reducedMotionToggle = screen.getByRole('switch', { name: /reduce motion/i });
    expect(reducedMotionToggle).toHaveAttribute('aria-checked', 'false');
  });
});
