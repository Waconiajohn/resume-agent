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
} from 'lucide-react';
import { useState } from 'react';
import type { DashboardState } from './useWhyMeStory';

export type CareerIQRoom =
  | 'dashboard'
  | 'career-profile'
  | 'resume'
  | 'linkedin'
  | 'jobs'
  | 'networking'
  | 'interview'
  | 'salary-negotiation'
  | 'executive-bio'
  | 'financial'
  | 'learning'
  // Legacy IDs — redirect to merged rooms in CareerIQScreen
  | 'personal-brand'
  | 'ninety-day-plan'
  | 'content-calendar'
  | 'case-study'
  | 'thank-you-note'
  | 'network-intelligence';

interface SidebarProps {
  activeRoom: CareerIQRoom;
  onNavigate: (room: CareerIQRoom) => void;
  dashboardState: DashboardState;
  onOpenCoach?: () => void;
  coachData?: { firstName: string; phase: string; recommendation?: string };
}

interface RoomGroup {
  label: string;
  rooms: { id: CareerIQRoom; label: string; icon: typeof LayoutDashboard; description: string; gated: boolean }[];
}

const ROOM_GROUPS: RoomGroup[] = [
  {
    label: 'Start Here',
    rooms: [
      { id: 'dashboard', label: 'Home', icon: LayoutDashboard, description: 'Your daily workspace view', gated: false },
      { id: 'career-profile', label: 'Your Profile', icon: User, description: 'Your resume, story, and evidence in one place', gated: false },
      { id: 'resume', label: 'Resume Builder', icon: FileText, description: 'Build, review, and save tailored resumes', gated: true },
    ],
  },
  {
    label: 'Active Search',
    rooms: [
      { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, description: 'Profile and content updates', gated: true },
      { id: 'jobs', label: 'Job Search', icon: Search, description: 'Search, pipeline, and next moves', gated: true },
      { id: 'interview', label: 'Interview Prep', icon: Mic, description: 'Prep, debrief, and follow-up', gated: true },
      { id: 'networking', label: 'Network Job Search', icon: Users, description: 'Leverage your connections to find jobs', gated: true },
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

export function Sidebar({ activeRoom, onNavigate, dashboardState, onOpenCoach, coachData }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isLocked = dashboardState === 'new-user';

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
      {/* Coach Banner */}
      <CoachBanner
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onOpenCoach={onOpenCoach}
        firstName={coachData?.firstName}
        phase={coachData?.phase}
        recommendation={coachData?.recommendation}
      />

      <nav className="flex-1 overflow-y-auto px-3">
        {ROOM_GROUPS.map((group) => (
          <div key={group.label} className={collapsed ? 'mb-1' : 'mb-4'}>
            {!collapsed && (
              <div className="px-3 pb-2 pt-3">
                <span className="eyebrow-label">
                  {group.label}
                </span>
              </div>
            )}
            <div className="space-y-1">
              {group.rooms.map(renderRoomButton)}
            </div>
          </div>
        ))}

      </nav>

      <div className="border-t border-[var(--line-soft)] px-4 pb-5 pt-3">
        {!collapsed && (
          <div className="text-center text-[13px] uppercase tracking-[0.12em] text-[var(--text-soft)]">
            Workspace
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Coach Banner ──────────────────────────────────────────────────

interface CoachBannerProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenCoach?: () => void;
  firstName?: string;
  phase?: string;
  recommendation?: string;
}

function CoachBanner({ collapsed, onToggleCollapse, onOpenCoach, firstName, phase, recommendation }: CoachBannerProps) {
  const displayName = firstName ? `AI ${firstName}` : 'AI Coach';
  const displayPhase = phase || 'Career Profile';

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 px-2 pb-4 pt-4">
        <button
          type="button"
          onClick={onOpenCoach}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--line-strong)] bg-[image:var(--sidebar-coach-bg)] text-[var(--text-strong)] transition-colors hover:border-[var(--sidebar-coach-hover-border)] hover:bg-[var(--sidebar-coach-hover-bg)]"
          aria-label={`Open ${displayName}`}
          title={displayName}
        >
          <span className="text-[13px] font-semibold uppercase tracking-[0.14em]">AI</span>
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-[10px] p-1.5 text-[var(--text-soft)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
          aria-label="Expand sidebar"
          aria-expanded={!collapsed}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--line-soft)] px-4 pb-4 pt-4">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onOpenCoach}
          className="flex min-w-0 items-center gap-3 text-left transition-opacity hover:opacity-80"
          aria-label={`Open ${displayName}`}
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px] border border-[var(--line-strong)] bg-[image:var(--sidebar-coach-bg)]">
            <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--text-strong)]">AI</span>
          </div>
          <div className="min-w-0">
            <div className="eyebrow-label">Coach</div>
            <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{displayName}</div>
            <div className="truncate text-[13px] text-[var(--text-soft)]">{displayPhase}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex-shrink-0 rounded-[10px] p-1.5 text-[var(--text-soft)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
          aria-label="Collapse sidebar"
          aria-expanded={!collapsed}
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      {recommendation && (
        <button
          type="button"
          onClick={onOpenCoach}
          className="w-full border-l border-[var(--line-soft)] pl-[58px] text-left text-[13px] leading-relaxed text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
        >
          {recommendation}
        </button>
      )}
    </div>
  );
}
