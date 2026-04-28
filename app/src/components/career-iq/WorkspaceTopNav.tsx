import { cn } from '@/lib/utils';
import { isApplicationsPath, SIDEBAR_NAV } from './nav-items';
import type { CareerIQRoom } from './Sidebar';
import type { NavItem } from './nav-items';
import type { WorkspaceRoom } from './workspaceRoomAccess';

interface WorkspaceTopNavProps {
  activeRoom: WorkspaceRoom;
  onNavigate: (room: CareerIQRoom) => void;
  onNavigateRoute?: (route: string) => void;
  pathname: string;
}

const ROOM_TOUR_TARGETS: Partial<Record<NavItem['id'], string>> = {
  'career-profile': 'nav-career-profile',
  linkedin: 'nav-linkedin',
  jobs: 'nav-jobs',
  resume: 'nav-resume',
  interview: 'nav-interview',
};

export function WorkspaceTopNav({
  activeRoom,
  onNavigate,
  onNavigateRoute,
  pathname,
}: WorkspaceTopNavProps) {
  const applicationsActive = isApplicationsPath(pathname);
  const allowsRoomActiveState =
    pathname === '/workspace'
    || pathname === '/profile-setup'
    || pathname.startsWith('/resume-builder');

  return (
    <div className="border-b border-[rgba(255,255,255,0.12)] bg-[#121a26] px-4 py-3 text-white shadow-[var(--shadow-low)]">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3">
        <div className="hidden shrink-0 items-center gap-2 pr-1 text-sm font-extrabold lg:flex">
          <span className="inline-grid h-9 w-9 place-items-center rounded-[8px] border border-white/30 bg-white/10 font-mono text-[12px] shadow-[4px_4px_0_rgba(255,255,255,0.14)]">
            CIQ
          </span>
          <span className="hidden xl:inline">Workspace</span>
        </div>

        <nav className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-2" aria-label="Workspace navigation">
          {SIDEBAR_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.route
              ? applicationsActive
              : allowsRoomActiveState && item.room !== undefined && activeRoom === item.room && !applicationsActive;

            const handleClick = () => {
              if (item.route) {
                onNavigateRoute?.(item.route);
              } else if (item.room) {
                onNavigate(item.room);
              }
            };

            return (
              <button
                key={item.id}
                type="button"
                onClick={handleClick}
                data-tour={ROOM_TOUR_TARGETS[item.id]}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-[8px] border px-2.5 py-2 text-[13px] font-extrabold transition-colors',
                  isActive
                    ? 'border-[#05668d] bg-[#05668d] text-white'
                    : 'border-white/20 bg-white/[0.04] text-white/80 hover:border-white/30 hover:bg-white/[0.08] hover:text-white',
                )}
                title={item.description}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
