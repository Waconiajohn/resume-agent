/**
 * Color system for the Gap Analysis Report Panel.
 *
 * Tier-specific accents: green (strong), blue (partial), red (gap).
 * Matches the streaming view palette.
 *
 * Tier is a UI-only display type. The canonical data classification is
 * GapClassification ('strong' | 'partial' | 'missing') in resume-v2.ts.
 * Use classificationToTier() to convert at the render boundary.
 */

import type { GapClassification } from '@/types/resume-v2';

export const REPORT_COLORS = {
  // Tier accents — green/blue/red matching streaming view
  strong: 'var(--badge-green-text)',
  partial: 'var(--link)',
  gap: 'var(--badge-red-text)',

  // Text roles
  heading: 'var(--text-strong)',
  body: 'var(--text-muted)',
  secondary: 'var(--text-soft)',
  tertiary: 'rgba(255,255,255,0.38)',
} as const;

/** UI display tier. Maps 1:1 from GapClassification via classificationToTier(). */
export type Tier = 'strong' | 'partial' | 'gap';

/**
 * Convert canonical GapClassification → UI Tier at the render boundary.
 * 'missing' → 'gap' because "Not Addressed" reads better than "Missing" in the UI.
 */
export function classificationToTier(c: GapClassification): Tier {
  return c === 'missing' ? 'gap' : c;
}

export function tierColor(tier: Tier): string {
  return REPORT_COLORS[tier];
}

export function tierBg(tier: Tier): string {
  switch (tier) {
    case 'strong': return 'var(--badge-green-bg)';
    case 'partial': return 'var(--badge-blue-bg)';
    case 'gap': return 'var(--badge-red-bg)';
  }
}

export function tierBorder(tier: Tier): string {
  switch (tier) {
    case 'strong': return 'color-mix(in srgb, var(--badge-green-text) 30%, transparent)';
    case 'partial': return 'color-mix(in srgb, var(--link) 30%, transparent)';
    case 'gap': return 'color-mix(in srgb, var(--badge-red-text) 30%, transparent)';
  }
}
