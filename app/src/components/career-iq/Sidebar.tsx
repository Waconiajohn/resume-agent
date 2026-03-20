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
      { id: 'career-profile', label: 'Career Profile', icon: User, description: 'Define the story every tool uses', gated: false },
      { id: 'resume', label: 'Resume Builder', icon: FileText, description: 'Build, review, and save tailored resumes', gated: true },
    ],
  },
  {
    label: 'Active Search',
    rooms: [
      { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, description: 'Profile and content updates', gated: true },
      { id: 'jobs', label: 'Job Search', icon: Search, description: 'Search, pipeline, and next moves', gated: true },
      { id: 'interview', label: 'Interview Prep', icon: Mic, description: 'Prep, debrief, and follow-up', gated: true },
    ],
  },
];

export function Sidebar({ activeRoom, onNavigate, dashboardState, onOpenCoach, coachData }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isLocked = dashboardState === 'new-user';

  const renderRoomButton = (room: RoomGroup['rooms'][number]) => {
    const Icon = room.icon;
    const isActive = activeRoom === room.id;
    const isGated = isLocked && room.gated;
    return (
      <button
        key={room.id}
        type="button"
        onClick={() => !isGated && onNavigate(room.id)}
        disabled={isGated}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
          isGated
            ? 'text-white/25 cursor-not-allowed'
            : isActive
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70',
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
            'flex-shrink-0 transition-colors',
            isGated
              ? 'text-white/15'
              : isActive
                ? 'text-[#98b3ff]'
                : 'text-white/40',
          )}
        />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium leading-tight truncate">
                {room.label}
              </span>
              {isGated && <Lock size={11} className="text-white/20 flex-shrink-0" />}
            </div>
            {isActive && !isGated && (
              <div className="text-[11px] text-white/40 mt-0.5 truncate">
                {room.description}
              </div>
            )}
          </div>
        )}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r border-white/[0.08] bg-[var(--bg-1)] transition-all duration-200',
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

      <nav className="flex-1 px-2 overflow-y-auto">
        {ROOM_GROUPS.map((group) => (
          <div key={group.label} className={collapsed ? 'mb-1' : 'mb-4'}>
            {!collapsed && (
              <div className="px-3 pb-1 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
                  {group.label}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {group.rooms.map(renderRoomButton)}
            </div>
          </div>
        ))}

      </nav>

      <div className="px-3 pb-4 pt-2 border-t border-white/[0.06]">
        {!collapsed && (
          <div className="text-[11px] text-white/50 text-center">
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
      <div className="flex flex-col items-center gap-2 px-2 pt-4 pb-3">
        <button
          type="button"
          onClick={onOpenCoach}
          className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-400/20 flex items-center justify-center hover:bg-indigo-600/40 transition-colors"
          aria-label={`Open ${displayName}`}
          title={displayName}
        >
          <span className="text-xs font-bold text-indigo-300">AI</span>
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          aria-label="Expand sidebar"
          aria-expanded={!collapsed}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-4 pb-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onOpenCoach}
          className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
          aria-label={`Open ${displayName}`}
        >
          <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo-300">AI</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90 truncate">{displayName}</div>
            <div className="text-[10px] text-white/40 truncate">{displayPhase}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors flex-shrink-0"
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
          className="w-full text-left text-[11px] text-indigo-300/70 hover:text-indigo-300 transition-colors truncate pl-[46px]"
        >
          {recommendation}
        </button>
      )}
    </div>
  );
}
