import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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

const PRIMARY_TOP_NAV_IDS: readonly NavItem['id'][] = [
  'dashboard',
  'career-profile',
  'jobs',
  'resume',
  'applications',
  'linkedin',
];

const primaryTopNav = PRIMARY_TOP_NAV_IDS.flatMap((id) => {
  const item = SIDEBAR_NAV.find((entry) => entry.id === id);
  return item ? [item] : [];
});

const secondaryTopNav = SIDEBAR_NAV.filter(
  (item) => !PRIMARY_TOP_NAV_IDS.includes(item.id),
);

export function WorkspaceTopNav({
  activeRoom,
  onNavigate,
  onNavigateRoute,
  pathname,
}: WorkspaceTopNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const applicationsActive = isApplicationsPath(pathname);
  const allowsRoomActiveState =
    pathname === '/workspace'
    || pathname === '/profile-setup'
    || pathname.startsWith('/resume-builder');

  const isItemActive = (item: NavItem) => item.route
    ? applicationsActive
    : allowsRoomActiveState && item.room !== undefined && activeRoom === item.room && !applicationsActive;

  const handleItemClick = (item: NavItem) => {
    if (item.route) {
      onNavigateRoute?.(item.route);
    } else if (item.room) {
      onNavigate(item.room);
    }
  };

  useEffect(() => {
    if (!moreOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const moreActive = secondaryTopNav.some(isItemActive);

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
          {primaryTopNav.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
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
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-current={moreActive ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-[8px] border px-2.5 py-2 text-[13px] font-extrabold transition-colors',
                moreActive
                  ? 'border-[#05668d] bg-[#05668d] text-white'
                  : 'border-white/20 bg-white/[0.04] text-white/80 hover:border-white/30 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">More</span>
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-[10px] border border-white/15 bg-[#121a26] py-1 shadow-[var(--shadow-mid)]"
              >
                {secondaryTopNav.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        handleItemClick(item);
                      }}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                        isActive
                          ? 'bg-[#05668d] text-white'
                          : 'text-white/82 hover:bg-white/[0.08] hover:text-white',
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-extrabold">{item.label}</span>
                        <span className={cn('mt-0.5 block text-[11px] leading-snug', isActive ? 'text-white/80' : 'text-white/55')}>
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
