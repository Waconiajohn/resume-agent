/**
 * Strategy thread navigation utilities.
 * Scrolls to and highlights related elements when a user clicks a strategy
 * in the audit card, or clicks the lightbulb on a resume bullet.
 * CSS transitions only — no external animation libraries.
 */

const HIGHLIGHT_CLASS = 'strategy-thread-highlight';
const PERSISTENT_HIGHLIGHT_CLASS = 'strategy-thread-highlight-persistent';
const HIGHLIGHT_DURATION_MS = 1500;
const PERSISTENT_HIGHLIGHT_DURATION_MS = 6000;
let lastPersistentlyHighlighted: HTMLElement | null = null;
let clearPersistentHighlightTimer: number | null = null;

/**
 * Scrolls to an element matching the selector and applies a brief glow animation.
 */
export function scrollToAndHighlight(selector: string): void {
  const el = document.querySelector(selector);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  el.classList.add(HIGHLIGHT_CLASS);
  setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
  }, HIGHLIGHT_DURATION_MS);
}

/**
 * Scrolls to an element, applies the normal glow, and keeps a softer
 * focus treatment on the target for a few seconds so the user can orient
 * themselves after jumping from a review card back into the resume.
 */
export function scrollToAndFocusTarget(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;

  if (lastPersistentlyHighlighted && lastPersistentlyHighlighted !== el) {
    lastPersistentlyHighlighted.classList.remove(PERSISTENT_HIGHLIGHT_CLASS);
  }
  if (clearPersistentHighlightTimer !== null) {
    window.clearTimeout(clearPersistentHighlightTimer);
  }

  scrollToAndHighlight(selector);
  el.classList.add(PERSISTENT_HIGHLIGHT_CLASS);
  lastPersistentlyHighlighted = el;

  clearPersistentHighlightTimer = window.setTimeout(() => {
    el.classList.remove(PERSISTENT_HIGHLIGHT_CLASS);
    if (lastPersistentlyHighlighted === el) {
      lastPersistentlyHighlighted = null;
    }
    clearPersistentHighlightTimer = null;
  }, PERSISTENT_HIGHLIGHT_DURATION_MS);
}

/**
 * Scroll to the first resume bullet whose `data-addresses` array contains
 * the given requirement (case-insensitive match).
 */
export function scrollToBullet(requirement: string): void {
  const bullets = document.querySelectorAll<HTMLElement>('[data-addresses]');
  for (const bullet of bullets) {
    try {
      const reqs: string[] = JSON.parse(bullet.dataset.addresses ?? '[]');
      if (reqs.some((r) => r.toLowerCase() === requirement.toLowerCase())) {
        bullet.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bullet.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => bullet.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
        return;
      }
    } catch {
      // skip malformed data-addresses
    }
  }
}

/**
 * Scroll to the gap coaching card for a specific requirement.
 */
export function scrollToCoachingCard(requirement: string): void {
  scrollToAndHighlight(`[data-coaching-requirement="${CSS.escape(requirement)}"]`);
}

/**
 * Scroll to the audit row for a specific requirement.
 */
export function scrollToAuditRow(requirement: string): void {
  scrollToAndHighlight(`[data-audit-requirement="${CSS.escape(requirement)}"]`);
}
