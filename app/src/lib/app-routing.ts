import { getLegacyWorkspaceAliasConfig } from './workspace-legacy-aliases';

export type AppView =
  | 'sales'
  | 'workspace'
  | 'coach'
  | 'resume-v2'
  | 'pricing'
  | 'billing'
  | 'affiliate'
  | 'cover-letter'
  | 'admin';

export const RESUME_BUILDER_SESSION_ROUTE = '/resume-builder/session';

export function buildResumeBuilderSessionRoute(
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${RESUME_BUILDER_SESSION_ROUTE}?${query}` : RESUME_BUILDER_SESSION_ROUTE;
}

export function getResumeBuilderSessionIdFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get('sessionId')?.trim();
  return value || undefined;
}

export function buildWorkspaceRoute(
  room?: string | null,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();

  if (room && room !== 'dashboard') {
    search.set('room', room);
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `/workspace?${query}` : '/workspace';
}

export function buildResumeWorkspaceRoute(
  focus?: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildWorkspaceRoute('resume', {
    ...(focus ? { focus } : {}),
    ...(params ?? {}),
  });
}

export function getAppView(pathname: string): AppView {
  if (pathname === '/' || pathname === '/sales') return 'sales';
  if (pathname === '/coach') return 'coach';
  if (pathname === RESUME_BUILDER_SESSION_ROUTE) return 'resume-v2';
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/billing') return 'billing';
  if (pathname === '/affiliate') return 'affiliate';
  if (pathname === '/cover-letter') return 'cover-letter';
  if (pathname === '/admin') return 'admin';
  return 'workspace';
}

export function getWorkspaceRoomFromSearch(search: string): string | undefined {
  const params = new URLSearchParams(search);
  return params.get('room') ?? undefined;
}

export function getWorkspaceEntryRedirect(search: string): string {
  const normalized = getNormalizedWorkspaceRedirect(search);
  if (normalized) return normalized;
  const room = getWorkspaceRoomFromSearch(search);
  return buildWorkspaceRoute(room);
}

export function getNormalizedWorkspaceRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const room = params.get('room');

  if (!room) return null;
  const alias = getLegacyWorkspaceAliasConfig(room);
  if (!alias) return null;
  params.set('room', alias.room);
  if ('focus' in alias && alias.focus && !params.get('focus')) {
    params.set('focus', alias.focus);
  }
  return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
}

export function resolveNavigationTarget(viewName: string): string {
  if (viewName.startsWith('/tools/')) return buildWorkspaceRoute();
  if (viewName === '/tools' || viewName === 'tools') return '/workspace';
  if (viewName.startsWith('/workspace')) return viewName;
  if (viewName === '/dashboard' || viewName === 'dashboard') return '/workspace';
  if (viewName === 'cover-letter' || viewName === '/cover-letter') return buildResumeWorkspaceRoute('cover-letter');
  if (viewName === 'workspace' || viewName === '/workspace') return buildWorkspaceRoute();
  if (viewName.startsWith('/')) return viewName;

  const pathByView: Record<string, string> = {
    workspace: buildWorkspaceRoute(),
    coach: '/coach',
    'resume-v2': RESUME_BUILDER_SESSION_ROUTE,
    pricing: '/pricing',
    billing: '/billing',
    affiliate: '/affiliate',
    admin: '/admin',
  };

  return pathByView[viewName] ?? buildWorkspaceRoute();
}
