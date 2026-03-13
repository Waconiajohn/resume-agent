/**
 * Strategy thread navigation utilities.
 * Scrolls to and highlights related elements when a user clicks a strategy
 * in the audit card, or clicks the lightbulb on a resume bullet.
 * CSS transitions only — no external animation libraries.
 */

const HIGHLIGHT_CLASS = 'strategy-thread-highlight';
const HIGHLIGHT_DURATION_MS = 1500;

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
