import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { DashboardState } from './useWhyMeStory';
import type { ExposedWorkspaceRoom, WorkspaceRoom } from './workspaceRoomAccess';
import { SIDEBAR_NAV, isApplicationsPath, type NavItem } from './nav-items';

export type CareerIQRoom = ExposedWorkspaceRoom;

interface SidebarProps {
  activeRoom: WorkspaceRoom;
  onNavigate: (room: CareerIQRoom) => void;
  onNavigateRoute?: (route: string) => void;
  dashboardState: DashboardState;
  defaultCollapsed?: boolean;
}

// Maps a nav item id to its tour target attribute value.
const ROOM_TOUR_TARGETS: Partial<Record<NavItem['id'], string>> = {
  'career-profile': 'nav-career-profile',
  jobs: 'nav-jobs',
};

export function Sidebar({ activeRoom, onNavigate, onNavigateRoute, defaultCollapsed }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const location = useLocation();
  const applicationsActive = isApplicationsPath(location.pathname);

  useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed]);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = item.route
      ? applicationsActive
      : item.room !== undefined && activeRoom === item.room;
    const tourTarget = ROOM_TOUR_TARGETS[item.id];

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
        data-tour={tourTarget}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex w-full items-start gap-3 border-l px-3 py-3 text-left transition-all duration-150',
          isActive
            ? 'border-[var(--rail-tab-active-border)] bg-[var(--rail-tab-active-bg)] text-[var(--text-strong)]'
            : 'border-transparent text-[var(--text-muted)] hover:border-[var(--line-soft)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]',
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon
          size={20}
          className={cn(
            'mt-0.5 flex-shrink-0 transition-colors',
            isActive
              ? 'text-[var(--accent)]'
              : 'text-[var(--text-soft)] group-hover:text-[var(--text-muted)]',
          )}
        />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold uppercase tracking-[0.07em] leading-tight">
              {item.label}
            </span>
            <div className={cn('mt-1 text-[13px] leading-relaxed', isActive ? 'text-[var(--text-muted)]' : 'text-[var(--text-soft)]')}>
              {item.description}
            </div>
          </div>
        )}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-[var(--line-soft)] bg-[image:var(--sidebar-bg)] transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      )}
    >
      <div className={cn('flex items-center border-b border-[var(--line-soft)] px-3 py-3', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-[10px] p-1.5 text-[var(--text-soft)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-3">
        <div className="space-y-1">
          {SIDEBAR_NAV.map(renderItem)}
        </div>
      </nav>
    </aside>
  );
}
