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

export function getLegacyWorkspaceRedirect(search: string): string {
  const normalized = getNormalizedWorkspaceRedirect(search);
  if (normalized) return normalized;
  const room = getWorkspaceRoomFromSearch(search);
  return buildWorkspaceRoute(room);
}

export function getNormalizedWorkspaceRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const room = params.get('room');

  if (!room) return null;

  switch (room) {
    case 'salary-negotiation':
      params.set('room', 'interview');
      if (!params.get('focus')) params.set('focus', 'negotiation');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    case 'personal-brand':
      params.set('room', 'career-profile');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    case 'thank-you-note':
      params.set('room', 'interview');
      if (!params.get('focus')) params.set('focus', 'thank-you');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    case 'ninety-day-plan':
      params.set('room', 'interview');
      if (!params.get('focus')) params.set('focus', 'plan');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    case 'content-calendar':
      params.set('room', 'linkedin');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    case 'case-study':
      params.set('room', 'executive-bio');
      if (!params.get('focus')) params.set('focus', 'case-study');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    case 'network-intelligence':
      params.set('room', 'networking');
      return buildWorkspaceRoute(undefined, Object.fromEntries(params.entries()));
    default:
      return null;
  }
}

export function getLegacyToolRedirect(slug?: string): string {
  switch (slug) {
    case 'onboarding':
      return buildWorkspaceRoute('career-profile');
    case 'resume':
      return buildResumeWorkspaceRoute();
    case 'cover-letter':
      return buildResumeWorkspaceRoute('cover-letter');
    case 'linkedin':
      return buildWorkspaceRoute('linkedin');
    case 'jobs':
      return buildWorkspaceRoute('jobs');
    case 'interview':
      return buildWorkspaceRoute('interview');
    case 'salary-negotiation':
      return buildWorkspaceRoute('interview', { focus: 'negotiation' });
    default:
      return buildWorkspaceRoute();
  }
}

export function resolveNavigationTarget(viewName: string): string {
  if (viewName.startsWith('/tools/')) return getLegacyToolRedirect(viewName.split('/tools/')[1] || undefined);
  if (viewName === '/tools' || viewName === 'tools') return '/workspace';
  if (viewName.startsWith('/workspace')) return viewName;
  if (viewName === '/dashboard' || viewName === 'dashboard') return '/workspace';
  if (viewName === 'cover-letter' || viewName === '/cover-letter') return buildResumeWorkspaceRoute('cover-letter');
  if (viewName === 'workspace' || viewName === 'career-iq' || viewName === '/career-iq' || viewName === '/workspace') return buildWorkspaceRoute();
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
