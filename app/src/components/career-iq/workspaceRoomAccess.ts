import { getLegacyWorkspaceAliasConfig } from '@/lib/workspace-legacy-aliases';

export type ExposedWorkspaceRoom =
  | 'dashboard'
  | 'career-profile'
  | 'resume'
  | 'linkedin'
  | 'jobs'
  | 'networking'
  | 'interview'
  | 'learning'
  | 'live-webinars'
  | 'executive-bio';

export type HiddenWorkspaceRoom =
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
  'learning',
  'live-webinars',
  'executive-bio',
];

const ROUTABLE_WORKSPACE_ROOMS: readonly WorkspaceRoom[] = [
  ...EXPOSED_WORKSPACE_ROOMS,
  'financial',
];

export function resolveWorkspaceRoom(value: string | null | undefined): WorkspaceRoom {
  if (!value) return 'dashboard';
  const alias = getLegacyWorkspaceAliasConfig(value);
  if (alias) return alias.room as WorkspaceRoom;
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
