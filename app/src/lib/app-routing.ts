export type AppView =
  | 'sales'
  | 'workspace'
  | 'coach'
  | 'resume-v2'
  | 'pricing'
  | 'billing'
  | 'affiliate'
  | 'tools'
  | 'cover-letter'
  | 'admin';

export function getAppView(pathname: string): AppView {
  if (pathname === '/' || pathname === '/sales') return 'sales';
  if (pathname === '/coach') return 'coach';
  if (pathname === '/resume-builder/session') return 'resume-v2';
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/billing') return 'billing';
  if (pathname === '/affiliate') return 'affiliate';
  if (pathname === '/cover-letter') return 'cover-letter';
  if (pathname === '/admin') return 'admin';
  if (pathname === '/tools' || pathname.startsWith('/tools/')) return 'tools';
  return 'workspace';
}

export function getToolSlugFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith('/tools/')) return undefined;
  return pathname.split('/tools/')[1] || undefined;
}

export function getWorkspaceRoomFromSearch(search: string): string | undefined {
  const params = new URLSearchParams(search);
  return params.get('room') ?? undefined;
}

export function getLegacyWorkspaceRedirect(search: string): string {
  const room = getWorkspaceRoomFromSearch(search);
  return room ? `/workspace?room=${room}` : '/workspace';
}

export function resolveNavigationTarget(viewName: string): string {
  if (viewName.startsWith('/tools/')) return viewName;
  if (viewName === '/tools' || viewName === 'tools') return '/tools';
  if (viewName.startsWith('/workspace')) return viewName;
  if (viewName === '/dashboard' || viewName === 'dashboard') return '/workspace?room=resume';
  if (viewName === 'cover-letter' || viewName === '/cover-letter') return '/cover-letter';
  if (viewName === 'workspace' || viewName === 'career-iq' || viewName === '/career-iq' || viewName === '/workspace') return '/workspace';

  const pathByView: Record<string, string> = {
    workspace: '/workspace',
    coach: '/coach',
    'resume-v2': '/resume-builder/session',
    pricing: '/pricing',
    billing: '/billing',
    affiliate: '/affiliate',
    admin: '/admin',
  };

  return pathByView[viewName] ?? '/workspace';
}
