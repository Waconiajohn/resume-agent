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
  const normalized = getNormalizedWorkspaceRedirect(search);
  if (normalized) return normalized;
  const room = getWorkspaceRoomFromSearch(search);
  return room ? `/workspace?room=${room}` : '/workspace';
}

export function getNormalizedWorkspaceRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const room = params.get('room');

  if (!room) return null;

  switch (room) {
    case 'salary-negotiation':
      params.set('room', 'interview');
      if (!params.get('focus')) params.set('focus', 'negotiation');
      return `/workspace?${params.toString()}`;
    case 'personal-brand':
      params.set('room', 'career-profile');
      return `/workspace?${params.toString()}`;
    case 'thank-you-note':
      params.set('room', 'interview');
      if (!params.get('focus')) params.set('focus', 'thank-you');
      return `/workspace?${params.toString()}`;
    case 'ninety-day-plan':
      params.set('room', 'interview');
      if (!params.get('focus')) params.set('focus', 'plan');
      return `/workspace?${params.toString()}`;
    case 'content-calendar':
      params.set('room', 'linkedin');
      return `/workspace?${params.toString()}`;
    case 'case-study':
      params.set('room', 'executive-bio');
      if (!params.get('focus')) params.set('focus', 'case-study');
      return `/workspace?${params.toString()}`;
    case 'network-intelligence':
      params.set('room', 'networking');
      return `/workspace?${params.toString()}`;
    default:
      return null;
  }
}

export function getLegacyToolRedirect(slug?: string): string {
  switch (slug) {
    case 'onboarding':
      return '/workspace?room=career-profile';
    case 'resume':
      return '/workspace?room=resume';
    case 'cover-letter':
      return '/workspace?room=resume&focus=cover-letter';
    case 'linkedin':
      return '/workspace?room=linkedin';
    case 'jobs':
      return '/workspace?room=jobs';
    case 'interview':
      return '/workspace?room=interview';
    case 'salary-negotiation':
      return '/workspace?room=interview&focus=negotiation';
    default:
      return '/workspace';
  }
}

export function resolveNavigationTarget(viewName: string): string {
  if (viewName.startsWith('/tools/')) return getLegacyToolRedirect(viewName.split('/tools/')[1] || undefined);
  if (viewName === '/tools' || viewName === 'tools') return '/workspace';
  if (viewName.startsWith('/workspace')) return viewName;
  if (viewName === '/dashboard' || viewName === 'dashboard') return '/workspace';
  if (viewName === 'cover-letter' || viewName === '/cover-letter') return '/workspace?room=resume&focus=cover-letter';
  if (viewName === 'workspace' || viewName === 'career-iq' || viewName === '/career-iq' || viewName === '/workspace') return '/workspace';
  if (viewName.startsWith('/')) return viewName;

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
