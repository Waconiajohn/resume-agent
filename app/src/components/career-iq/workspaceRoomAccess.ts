import type { CareerIQRoom } from './Sidebar';

const EXPOSED_WORKSPACE_ROOMS: readonly CareerIQRoom[] = [
  'dashboard',
  'career-profile',
  'resume',
  'linkedin',
  'jobs',
  'interview',
  'salary-negotiation',
];

const LEGACY_REDIRECTS: Partial<Record<CareerIQRoom | string, CareerIQRoom>> = {
  'content-calendar': 'linkedin',
  'thank-you-note': 'interview',
  'case-study': 'linkedin',
  'network-intelligence': 'jobs',
  'personal-brand': 'career-profile',
  'ninety-day-plan': 'interview',
};

export function toExposedWorkspaceRoom(value: string | null | undefined): CareerIQRoom {
  if (!value) return 'dashboard';
  const redirected = LEGACY_REDIRECTS[value];
  if (redirected) return redirected;
  return (EXPOSED_WORKSPACE_ROOMS as readonly string[]).includes(value)
    ? (value as CareerIQRoom)
    : 'dashboard';
}

export function isExposedWorkspaceRoom(value: string | null | undefined): value is CareerIQRoom {
  if (!value) return false;
  return (EXPOSED_WORKSPACE_ROOMS as readonly string[]).includes(value);
}
