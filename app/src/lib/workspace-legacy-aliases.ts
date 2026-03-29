export const LEGACY_WORKSPACE_ALIASES = {
  'content-calendar': { room: 'linkedin' },
  'thank-you-note': { room: 'interview', focus: 'thank-you' },
  'case-study': { room: 'executive-bio', focus: 'case-study' },
  'network-intelligence': { room: 'networking' },
  'personal-brand': { room: 'career-profile' },
  'ninety-day-plan': { room: 'interview', focus: 'plan' },
  'salary-negotiation': { room: 'interview', focus: 'negotiation' },
} as const;

export type LegacyWorkspaceAlias = keyof typeof LEGACY_WORKSPACE_ALIASES;

export function getLegacyWorkspaceAliasConfig(value: string | null | undefined) {
  if (!value) return undefined;
  return LEGACY_WORKSPACE_ALIASES[value as LegacyWorkspaceAlias];
}
