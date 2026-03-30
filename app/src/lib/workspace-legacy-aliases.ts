export const LEGACY_WORKSPACE_ALIASES = {
  'content-calendar': { room: 'linkedin' },
  'thank-you-note': { room: 'interview', focus: 'thank-you' },
  'case-study': { room: 'career-profile', focus: 'case-study' },
  'executive-bio': { room: 'career-profile', focus: 'bio' },
  'network-intelligence': { room: 'networking' },
  'personal-brand': { room: 'career-profile' },
  'ninety-day-plan': { room: 'interview', focus: 'plan' },
  'salary-negotiation': { room: 'interview', focus: 'negotiation' },
  'financial-wellness': { room: 'financial' },
  'retirement-bridge': { room: 'financial' },
} as const;

export type LegacyWorkspaceAlias = keyof typeof LEGACY_WORKSPACE_ALIASES;

export function getLegacyWorkspaceAliasConfig(value: string | null | undefined) {
  if (!value) return undefined;
  return LEGACY_WORKSPACE_ALIASES[value as LegacyWorkspaceAlias];
}
