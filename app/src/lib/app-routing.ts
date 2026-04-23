import { getLegacyWorkspaceAliasConfig } from './workspace-legacy-aliases';

export type AppView =
  | 'sales'
  | 'workspace'
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

/**
 * Approach C Phase 1.2 — application-scoped workspace URLs.
 *
 * Canonical future route shape:
 *   /workspace/application/:applicationId/:tool
 *
 * where :tool is one of: 'resume', 'cover-letter', 'thank-you-note',
 * 'networking', 'interview-prep'.
 *
 * Using the applicationId as a URL path segment (rather than a query
 * param) means React Router remounts child components when the user
 * switches to a different application, which clears singleton hook
 * state as a side effect. That solves the state-reset bug
 * (state-reset-and-export-plan.md) at the routing layer.
 */
// Phase 2.3c — ordered by real-world workflow: apply → network → interview →
// thank-you (post-interview courtesy) → offer (outcome). `offer-negotiation`
// sits last because it's toggle-gated and most applications never reach it.
export const APPLICATION_WORKSPACE_TOOLS = [
  'resume',
  'cover-letter',
  'networking',
  'interview-prep',
  'thank-you-note',
  'offer-negotiation',
] as const;

export type ApplicationWorkspaceTool = (typeof APPLICATION_WORKSPACE_TOOLS)[number];

export function buildApplicationWorkspaceRoute(
  applicationId: string,
  tool: ApplicationWorkspaceTool = 'resume',
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  const base = `/workspace/application/${encodeURIComponent(applicationId)}/${tool}`;
  return query ? `${base}?${query}` : base;
}

/**
 * Extract the applicationId from a workspace-application pathname.
 * Returns undefined if the URL doesn't match the application-scoped shape.
 */
export function getApplicationIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/workspace\/application\/([^/]+)(?:\/|$)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Extract the tool segment from a workspace-application pathname.
 * Returns undefined if the URL doesn't include one or doesn't match.
 */
export function getApplicationToolFromPathname(
  pathname: string,
): ApplicationWorkspaceTool | undefined {
  const match = pathname.match(/^\/workspace\/application\/[^/]+\/([^/?]+)/);
  if (!match) return undefined;
  const raw = match[1];
  return (APPLICATION_WORKSPACE_TOOLS as readonly string[]).includes(raw)
    ? (raw as ApplicationWorkspaceTool)
    : undefined;
}

export function getAppView(pathname: string): AppView {
  if (pathname === '/' || pathname === '/sales') return 'sales';
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
    params.set('focus', alias.focus as string);
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
    'resume-v2': RESUME_BUILDER_SESSION_ROUTE,
    pricing: '/pricing',
    billing: '/billing',
    affiliate: '/affiliate',
    admin: '/admin',
    dashboard: buildWorkspaceRoute(),
    'career-profile': buildWorkspaceRoute('career-profile'),
    resume: buildWorkspaceRoute('resume'),
    linkedin: buildWorkspaceRoute('linkedin'),
    jobs: buildWorkspaceRoute('jobs'),
    interview: buildWorkspaceRoute('interview'),
  };

  return pathByView[viewName] ?? buildWorkspaceRoute();
}
