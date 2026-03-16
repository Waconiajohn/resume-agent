/**
 * Color system for the Gap Analysis Report Panel.
 *
 * Simplified: only gaps get a color accent. Strong and partial are neutral —
 * the mapping and coaching speak for themselves.
 *
 * Status accents are used for left borders and status icons only.
 * Body text uses white at varying opacity for readability.
 */

export const REPORT_COLORS = {
  // Status accents — neutral for strong/partial, crimson for gaps
  strong: 'rgba(255,255,255,0.50)',
  partial: 'rgba(255,255,255,0.50)',
  gap: 'rgba(199,91,91,0.70)',

  // Text roles
  heading: 'rgba(255,255,255,0.92)',
  body: 'rgba(255,255,255,0.78)',
  secondary: 'rgba(255,255,255,0.55)',
  tertiary: 'rgba(255,255,255,0.38)',
} as const;

export type Tier = 'strong' | 'partial' | 'gap';

export function tierColor(tier: Tier): string {
  return REPORT_COLORS[tier];
}

export function tierBg(tier: Tier): string {
  if (tier === 'gap') return 'rgba(199,91,91,0.04)';
  return 'transparent';
}

export function tierBorder(tier: Tier): string {
  if (tier === 'gap') return 'rgba(199,91,91,0.30)';
  return 'rgba(255,255,255,0.15)';
}
