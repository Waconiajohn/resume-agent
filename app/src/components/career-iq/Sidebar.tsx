import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Linkedin,
  Search,
  Mic,
  ChevronLeft,
  ChevronRight,
  Lock,
  User,
  Users,
  GraduationCap,
  BriefcaseBusiness,
  BookOpen,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { DashboardState } from './useWhyMeStory';
import type { ExposedWorkspaceRoom, WorkspaceRoom } from './workspaceRoomAccess';

export type CareerIQRoom = ExposedWorkspaceRoom;

interface SidebarProps {
  activeRoom: WorkspaceRoom;
  onNavigate: (room: CareerIQRoom) => void;
  onNavigateRoute?: (route: string) => void;
  dashboardState: DashboardState;
  defaultCollapsed?: boolean;
}

interface RoomGroup {
  label: string;
  rooms: { id: CareerIQRoom; label: string; icon: typeof LayoutDashboard; description: string; gated: boolean }[];
}

const ROOM_GROUPS: RoomGroup[] = [
  {
    label: 'Core Tools',
    rooms: [
      { id: 'dashboard', label: 'Home', icon: LayoutDashboard, description: 'Your daily workspace view', gated: false },
      { id: 'career-profile', label: 'Career Vault', icon: User, description: 'Your positioning, career record, and LinkedIn brand in one place', gated: false },
      { id: 'jobs', label: 'Job Search', icon: Search, description: 'Search, pipeline, and next moves', gated: false },
      { id: 'resume', label: 'Resume Builder', icon: FileText, description: 'Build, review, and save role-specific resumes', gated: false },
    ],
  },
  {
    label: 'Active Search',
    rooms: [
      { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, description: 'Profile and content updates', gated: false },
      { id: 'interview', label: 'Interview Prep', icon: Mic, description: 'Prep, debrief, and follow-up', gated: false },
      { id: 'networking', label: 'Networking', icon: Users, description: 'Referrals and outreach', gated: false },
    ],
  },
  {
    label: 'Resources',
    rooms: [
      { id: 'learning', label: 'Masterclass', icon: GraduationCap, description: 'Career-building courses personalized with your data', gated: false },
      { id: 'executive-bio', label: 'Executive Bio', icon: BookOpen, description: 'Long-form bio for speaking bios, about pages, and board intros', gated: false },
    ],
  },
];

// Maps a room id to its tour target attribute value
const ROOM_TOUR_TARGETS: Partial<Record<CareerIQRoom, string>> = {
  'career-profile': 'nav-career-profile',
  resume: 'nav-resume',
  linkedin: 'nav-linkedin',
  jobs: 'nav-jobs',
  interview: 'nav-interview',
};

export function Sidebar({ activeRoom, onNavigate, onNavigateRoute, dashboardState, defaultCollapsed }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const isLocked = dashboardState === 'new-user';
  const location = useLocation();
  const isApplicationsActive =
    location.pathname === '/workspace/applications'
    || location.pathname.startsWith('/workspace/application/');

  useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed]);

  const renderRoomButton = (room: RoomGroup['rooms'][number]) => {
    const Icon = room.icon;
    const isActive = activeRoom === room.id;
    const isGated = isLocked && room.gated;
    const tourTarget = ROOM_TOUR_TARGETS[room.id];
    return (
      <button
        key={room.id}
        type="button"
        onClick={() => !isGated && onNavigate(room.id)}
        disabled={isGated}
        data-tour={tourTarget}
        className={cn(
          'group relative flex w-full items-start gap-3 border-l px-3 py-3 text-left transition-all duration-150',
          isGated
            ? 'cursor-not-allowed border-transparent text-[var(--text-soft)]'
            : isActive
              ? 'border-[var(--rail-tab-active-border)] bg-[var(--rail-tab-active-bg)] text-[var(--text-strong)]'
              : 'border-transparent text-[var(--text-muted)] hover:border-[var(--line-soft)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]',
        )}
        title={
          isGated
            ? `Complete your Career Profile to unlock ${room.label}`
            : collapsed
              ? room.label
              : undefined
        }
      >
        <Icon
          size={20}
          className={cn(
            'mt-0.5 flex-shrink-0 transition-colors',
            isGated
              ? 'text-[var(--text-soft)]'
              : isActive
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-soft)] group-hover:text-[var(--text-muted)]',
          )}
        />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold uppercase tracking-[0.07em] leading-tight">
                {room.label}
              </span>
              {isGated && <Lock size={12} className="text-[var(--text-soft)] flex-shrink-0" />}
            </div>
            <div className={cn('mt-1 text-[13px] leading-relaxed', isActive && !isGated ? 'text-[var(--text-muted)]' : 'text-[var(--text-soft)]')}>
              {room.description}
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
      {/* Collapse / Expand toggle */}
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
          {ROOM_GROUPS.flatMap((group) => group.rooms).map(renderRoomButton)}

          {/* My Applications — route-based (Approach C) rather than a room id,
              but styled identically to sibling room buttons. */}
          <button
            type="button"
            onClick={() => onNavigateRoute?.('/workspace/applications')}
            className={cn(
              'group relative flex w-full items-start gap-3 border-l px-3 py-3 text-left transition-all duration-150',
              isApplicationsActive
                ? 'border-[var(--rail-tab-active-border)] bg-[var(--rail-tab-active-bg)] text-[var(--text-strong)]'
                : 'border-transparent text-[var(--text-muted)] hover:border-[var(--line-soft)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]',
            )}
            title={collapsed ? 'My Applications' : undefined}
            aria-current={isApplicationsActive ? 'page' : undefined}
          >
            <BriefcaseBusiness
              size={20}
              className={cn(
                'mt-0.5 flex-shrink-0 transition-colors',
                isApplicationsActive
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-soft)] group-hover:text-[var(--text-muted)]',
              )}
            />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold uppercase tracking-[0.07em] leading-tight">
                    My Applications
                  </span>
                </div>
                <div className={cn('mt-1 text-[13px] leading-relaxed', isApplicationsActive ? 'text-[var(--text-muted)]' : 'text-[var(--text-soft)]')}>
                  Saved jobs and per-role work
                </div>
              </div>
            )}
          </button>
        </div>
      </nav>

    </aside>
  );
}

