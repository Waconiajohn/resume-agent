export const LEGACY_WORKSPACE_ALIASES = {
  'content-calendar': { room: 'linkedin' },
  'thank-you-note': { room: 'interview', focus: 'thank-you' },
  'case-study': { room: 'career-profile', focus: 'case-study' },
  // Sprint D1 — executive-bio is now a first-class room; alias removed so
  // `?room=executive-bio` resolves to itself.
  'network-intelligence': { room: 'networking' },
  'personal-brand': { room: 'career-profile' },
  'ninety-day-plan': { room: 'interview', focus: 'plan' },
  'salary-negotiation': { room: 'interview', focus: 'negotiation' },
  'financial-wellness': { room: 'financial' },
  'retirement-bridge': { room: 'financial' },
  // LMS linked agent aliases
  'resume-v2': { room: 'resume' },
  'onboarding': { room: 'career-profile' },
  'linkedin-optimizer': { room: 'linkedin' },
  'linkedin-content': { room: 'linkedin', focus: 'content' },
  'networking-outreach': { room: 'networking' },
  'job-finder': { room: 'jobs' },
  'job-tracker': { room: 'jobs', focus: 'tracker' },
  'interview-prep': { room: 'interview' },
} as const;

export type LegacyWorkspaceAlias = keyof typeof LEGACY_WORKSPACE_ALIASES;

export function getLegacyWorkspaceAliasConfig(value: string | null | undefined) {
  if (!value) return undefined;
  return LEGACY_WORKSPACE_ALIASES[value as LegacyWorkspaceAlias];
}
