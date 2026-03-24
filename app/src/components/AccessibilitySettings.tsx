import { useEffect, useRef } from 'react';
import { X, Type, Contrast, Wind } from 'lucide-react';
import { useAccessibility, type FontSize } from '@/hooks/useAccessibility';
import { useTheme, type Theme } from '@/hooks/useTheme';

interface AccessibilitySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ToggleSwitchProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleSwitch({ id, label, description, checked, onChange }: ToggleSwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-strong)]">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-[var(--text-soft)]">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={[
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
          'focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]',
        ].join(' ')}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow',
            'transform transition duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

const FONT_SIZE_OPTIONS: { value: FontSize; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Default size' },
  { value: 'large', label: 'Large', description: '+2px base' },
  { value: 'xl', label: 'Extra Large', description: '+4px base' },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function AccessibilitySettings({ isOpen, onClose }: AccessibilitySettingsProps) {
  const { fontSize, highContrast, reducedMotion, setFontSize, toggleHighContrast, toggleReducedMotion } =
    useAccessibility();
  const { theme, toggle: toggleTheme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when the panel opens.
  useEffect(() => {
    if (isOpen) {
      closeBtnRef.current?.focus();
    }
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Accessibility settings"
        className={[
          'fixed right-0 top-0 z-50 flex h-full w-80 flex-col',
          'border-l border-[var(--line-soft)]',
          'bg-[var(--surface-3)] shadow-[var(--shadow-mid)]',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[var(--line-soft)] px-5">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">Accessibility</h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close accessibility settings"
            className={[
              'rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-2.5',
              'text-[var(--text-muted)] transition-colors',
              'hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
            ].join(' ')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* Font Size */}
          <section aria-labelledby="a11y-font-size-heading">
            <div className="flex items-center gap-2 pb-2">
              <Type className="h-4 w-4 text-[var(--text-soft)]" aria-hidden="true" />
              <h3 id="a11y-font-size-heading" className="text-xs font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                Font Size
              </h3>
            </div>
            <div
              role="radiogroup"
              aria-labelledby="a11y-font-size-heading"
              className="flex gap-2"
            >
              {FONT_SIZE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    'flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border px-3 py-2.5 transition-colors',
                    fontSize === opt.value
                      ? 'border-[var(--line-strong)] bg-[var(--surface-elevated)] text-[var(--text-strong)]'
                      : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="font-size"
                    value={opt.value}
                    checked={fontSize === opt.value}
                    onChange={() => setFontSize(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-[var(--text-soft)]">{opt.description}</span>
                </label>
              ))}
            </div>
          </section>

          <div className="my-4 border-t border-[var(--line-soft)]" />

          {/* High Contrast */}
          <section aria-labelledby="a11y-contrast-heading">
            <div className="flex items-center gap-2 pb-1">
              <Contrast className="h-4 w-4 text-[var(--text-soft)]" aria-hidden="true" />
              <h3 id="a11y-contrast-heading" className="text-xs font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                Display
              </h3>
            </div>
            <ToggleSwitch
              id="a11y-high-contrast"
              label="High Contrast"
              description="Increases text and border visibility across the interface"
              checked={highContrast}
              onChange={toggleHighContrast}
            />
            <ToggleSwitch
              id="a11y-reduced-motion"
              label="Reduce Motion"
              description="Minimises animations and transitions"
              checked={reducedMotion}
              onChange={toggleReducedMotion}
            />
          </section>

          <div className="my-4 border-t border-[var(--line-soft)]" />

          {/* Theme */}
          <section aria-labelledby="a11y-theme-heading">
            <div className="flex items-center gap-2 pb-2">
              <Wind className="h-4 w-4 text-[var(--text-soft)]" aria-hidden="true" />
              <h3 id="a11y-theme-heading" className="text-xs font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                Theme
              </h3>
            </div>
            <div
              role="radiogroup"
              aria-labelledby="a11y-theme-heading"
              className="flex gap-2"
            >
              {THEME_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    'flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 transition-colors',
                    theme === opt.value
                      ? 'border-[var(--line-strong)] bg-[var(--surface-elevated)] text-[var(--text-strong)]'
                      : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={opt.value}
                    checked={theme === opt.value}
                    onChange={() => {
                      if (theme !== opt.value) toggleTheme();
                    }}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Footer note */}
        <div className="flex-shrink-0 border-t border-[var(--line-soft)] px-5 py-4">
          <p className="text-xs leading-relaxed text-[var(--text-soft)]">
            Settings are saved locally and applied immediately.
          </p>
        </div>
      </div>
    </>
  );
}
