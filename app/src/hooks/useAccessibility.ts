import { useEffect, useState } from 'react';

export type FontSize = 'standard' | 'large' | 'xl';

interface AccessibilitySettings {
  fontSize: FontSize;
  highContrast: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = 'careeriq_accessibility';

const DEFAULTS: AccessibilitySettings = {
  fontSize: 'standard',
  highContrast: false,
  reducedMotion: false,
};

function load(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
    return {
      fontSize: parsed.fontSize === 'large' || parsed.fontSize === 'xl' ? parsed.fontSize : 'standard',
      highContrast: Boolean(parsed.highContrast),
      reducedMotion: Boolean(parsed.reducedMotion),
    };
  } catch {
    return DEFAULTS;
  }
}

function save(settings: AccessibilitySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable; continue silently.
  }
}

function applyToDOM(settings: AccessibilitySettings): void {
  const root = document.documentElement;

  if (settings.fontSize === 'standard') {
    root.removeAttribute('data-font-size');
  } else {
    root.setAttribute('data-font-size', settings.fontSize);
  }

  if (settings.highContrast) {
    root.setAttribute('data-contrast', 'high');
  } else {
    root.removeAttribute('data-contrast');
  }

  if (settings.reducedMotion) {
    root.setAttribute('data-reduced-motion', 'true');
  } else {
    root.removeAttribute('data-reduced-motion');
  }
}

export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => load());

  // Apply settings to the DOM whenever they change, and on mount.
  useEffect(() => {
    applyToDOM(settings);
    save(settings);
  }, [settings]);

  const setFontSize = (fontSize: FontSize) => {
    setSettings((prev) => ({ ...prev, fontSize }));
  };

  const toggleHighContrast = () => {
    setSettings((prev) => ({ ...prev, highContrast: !prev.highContrast }));
  };

  const toggleReducedMotion = () => {
    setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }));
  };

  return {
    fontSize: settings.fontSize,
    highContrast: settings.highContrast,
    reducedMotion: settings.reducedMotion,
    setFontSize,
    toggleHighContrast,
    toggleReducedMotion,
  };
}
