/**
 * Color system for the Gap Analysis Report Panel.
 *
 * Status accents are used for dots, borders, and card tints — NEVER body text.
 * Body text uses white at varying opacity for readability.
 */

export const REPORT_COLORS = {
  // Status accents (dots, 3px borders, card bg tints)
  strong: '#4CAF82',
  partial: '#D4A853',
  gap: '#C75B5B',

  // Text roles
  heading: 'rgba(255,255,255,0.92)',
  body: 'rgba(255,255,255,0.78)',
  secondary: 'rgba(255,255,255,0.55)',
  tertiary: 'rgba(255,255,255,0.38)',

  // Importance badges
  importance: {
    must_have: { text: '#C75B5B', bg: 'rgba(199,91,91,0.12)' },
    important: { text: '#D4A853', bg: 'rgba(212,168,83,0.12)' },
    nice_to_have: { text: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.06)' },
  },
} as const;

export type Tier = 'strong' | 'partial' | 'gap';

export function tierColor(tier: Tier): string {
  return REPORT_COLORS[tier];
}

export function tierBg(tier: Tier): string {
  const hex = REPORT_COLORS[tier];
  // 4% opacity background tint
  return `${hex}0A`;
}

export function tierBorder(tier: Tier): string {
  return REPORT_COLORS[tier];
}

export function importanceBadgeStyle(importance: string): { color: string; backgroundColor: string } {
  const entry = REPORT_COLORS.importance[importance as keyof typeof REPORT_COLORS.importance];
  if (entry) return { color: entry.text, backgroundColor: entry.bg };
  return { color: REPORT_COLORS.importance.nice_to_have.text, backgroundColor: REPORT_COLORS.importance.nice_to_have.bg };
}
