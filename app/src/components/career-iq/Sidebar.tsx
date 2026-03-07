import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Linkedin,
  Calendar,
  Search,
  Users,
  Mic,
  Heart,
  Video,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useState } from 'react';
import type { DashboardState } from './useWhyMeStory';

export type CareerIQRoom =
  | 'dashboard'
  | 'resume'
  | 'linkedin'
  | 'content-calendar'
  | 'jobs'
  | 'networking'
  | 'interview'
  | 'financial'
  | 'learning';

interface SidebarProps {
  activeRoom: CareerIQRoom;
  onNavigate: (room: CareerIQRoom) => void;
  dashboardState: DashboardState;
}

const ROOMS: { id: CareerIQRoom; label: string; icon: typeof LayoutDashboard; description: string; gated: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Your daily briefing', gated: false },
  { id: 'resume', label: 'Resume Workshop', icon: FileText, description: 'Create & optimize resumes', gated: true },
  { id: 'linkedin', label: 'LinkedIn Studio', icon: Linkedin, description: 'Profile optimization & analytics', gated: true },
  { id: 'content-calendar', label: 'Content Calendar', icon: Calendar, description: '30-day LinkedIn posting plan', gated: true },
  { id: 'jobs', label: 'Job Command Center', icon: Search, description: 'Matches, search & pipeline', gated: true },
  { id: 'networking', label: 'Networking Hub', icon: Users, description: 'Contacts & outreach', gated: true },
  { id: 'interview', label: 'Interview Lab', icon: Mic, description: 'Prep, mock & history', gated: true },
  { id: 'financial', label: 'Financial Wellness', icon: Heart, description: 'Retirement & planning', gated: true },
  { id: 'learning', label: 'Live Sessions', icon: Video, description: 'Coaching, replays & office hours', gated: false },
];

export function Sidebar({ activeRoom, onNavigate, dashboardState }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isLocked = dashboardState === 'new-user';

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r border-white/[0.08] bg-[var(--bg-1)] transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      )}
    >
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-wide text-white/80">
            CareerIQ
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {ROOMS.map((room) => {
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
                  ? `Complete your Why-Me story to unlock ${room.label}`
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
        })}
      </nav>

      <div className="px-3 pb-4 pt-2 border-t border-white/[0.06]">
        {!collapsed && (
          <div className="text-[11px] text-white/30 text-center">
            CareerIQ Platform
          </div>
        )}
      </div>
    </aside>
  );
}
