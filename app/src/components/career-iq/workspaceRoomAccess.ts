export type ExposedWorkspaceRoom =
  | 'dashboard'
  | 'career-profile'
  | 'resume'
  | 'linkedin'
  | 'jobs'
  | 'networking'
  | 'interview';

export type HiddenWorkspaceRoom =
  | 'executive-bio'
  | 'financial';

export type WorkspaceRoom = ExposedWorkspaceRoom | HiddenWorkspaceRoom;

const EXPOSED_WORKSPACE_ROOMS: readonly ExposedWorkspaceRoom[] = [
  'dashboard',
  'career-profile',
  'resume',
  'linkedin',
  'jobs',
  'interview',
  'networking',
];

const ROUTABLE_WORKSPACE_ROOMS: readonly WorkspaceRoom[] = [
  ...EXPOSED_WORKSPACE_ROOMS,
  'executive-bio',
  'financial',
];

const LEGACY_REDIRECTS: Partial<Record<string, WorkspaceRoom>> = {
  'content-calendar': 'linkedin',
  'thank-you-note': 'interview',
  'case-study': 'executive-bio',
  'network-intelligence': 'networking',
  'personal-brand': 'career-profile',
  'ninety-day-plan': 'interview',
  'salary-negotiation': 'interview',
};

export function resolveWorkspaceRoom(value: string | null | undefined): WorkspaceRoom {
  if (!value) return 'dashboard';
  const redirected = LEGACY_REDIRECTS[value];
  if (redirected) return redirected;
  return (ROUTABLE_WORKSPACE_ROOMS as readonly string[]).includes(value)
    ? (value as WorkspaceRoom)
    : 'dashboard';
}

export function toExposedWorkspaceRoom(value: string | null | undefined): ExposedWorkspaceRoom {
  const resolved = resolveWorkspaceRoom(value);
  return (EXPOSED_WORKSPACE_ROOMS as readonly string[]).includes(resolved)
    ? (resolved as ExposedWorkspaceRoom)
    : 'dashboard';
}

export function isExposedWorkspaceRoom(value: string | null | undefined): value is ExposedWorkspaceRoom {
  if (!value) return false;
  return (EXPOSED_WORKSPACE_ROOMS as readonly string[]).includes(value);
}
