/**
 * Color system for the Gap Analysis Report Panel.
 *
 * Tier-specific accents: green (strong), blue (partial), red (gap).
 * Matches the streaming view palette.
 */

export const REPORT_COLORS = {
  // Tier accents — green/blue/red matching streaming view
  strong: '#b5dec2',
  partial: '#afc4ff',
  gap: '#f0b8b8',

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
  switch (tier) {
    case 'strong': return 'rgba(181,222,194,0.04)';
    case 'partial': return 'rgba(175,196,255,0.04)';
    case 'gap': return 'rgba(240,184,184,0.04)';
  }
}

export function tierBorder(tier: Tier): string {
  switch (tier) {
    case 'strong': return 'rgba(181,222,194,0.30)';
    case 'partial': return 'rgba(175,196,255,0.30)';
    case 'gap': return 'rgba(240,184,184,0.30)';
  }
}
