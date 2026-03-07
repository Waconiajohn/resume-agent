import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import {
  FileText,
  Linkedin,
  Search,
  Mic,
  Users,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import type { CareerIQRoom } from './Sidebar';

interface AgentFeedItem {
  id: string;
  agent: string;
  icon: typeof FileText;
  message: string;
  timestamp: Date;
  targetRoom?: CareerIQRoom;
}

export interface RealFeedEvent {
  type: 'session_created' | 'session_completed' | 'pipeline_moved' | 'interview_added';
  timestamp: string;
  detail: string;
}

interface ZoneAgentFeedProps {
  onNavigateRoom?: (room: CareerIQRoom) => void;
  realEvents?: RealFeedEvent[];
}

const MOCK_FEED: AgentFeedItem[] = [
  {
    id: '1',
    agent: 'Cover Letter Agent',
    icon: FileText,
    message: 'Completed your draft for Acme Corp — VP Operations role',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    targetRoom: 'resume',
  },
  {
    id: '2',
    agent: 'LinkedIn Agent',
    icon: Linkedin,
    message: 'Noticed 3 new 2nd-degree connections at your target companies',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    targetRoom: 'linkedin',
  },
  {
    id: '3',
    agent: 'Interview Prep Agent',
    icon: Mic,
    message: 'New practice session ready based on your upcoming interview at Summit Health',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
    targetRoom: 'interview',
  },
  {
    id: '4',
    agent: 'Job Finder Agent',
    icon: Search,
    message: 'Surfaced 4 new roles matching your Why-Me profile this week',
    timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000),
    targetRoom: 'jobs',
  },
  {
    id: '5',
    agent: 'Networking Agent',
    icon: Users,
    message: 'Drafted follow-up messages for 2 stale connections at Nexus Partners',
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000),
    targetRoom: 'networking',
  },
  {
    id: '6',
    agent: 'Resume Agent',
    icon: FileText,
    message: 'Identified 2 new accomplishments from your last interview debrief',
    timestamp: new Date(Date.now() - 80 * 60 * 60 * 1000),
    targetRoom: 'resume',
  },
  {
    id: '7',
    agent: 'Job Finder Agent',
    icon: Search,
    message: 'Monday briefing: 6 network-matched roles at companies where you have connections',
    timestamp: new Date(Date.now() - 96 * 60 * 60 * 1000),
    targetRoom: 'jobs',
  },
];

const EVENT_CONFIG: Record<RealFeedEvent['type'], { agent: string; icon: typeof FileText; room: CareerIQRoom }> = {
  session_created: { agent: 'Resume Agent', icon: FileText, room: 'resume' },
  session_completed: { agent: 'Resume Agent', icon: FileText, room: 'resume' },
  pipeline_moved: { agent: 'Application Tracker', icon: Search, room: 'jobs' },
  interview_added: { agent: 'Interview Prep Agent', icon: Mic, room: 'interview' },
};

function realEventToFeedItem(event: RealFeedEvent, index: number): AgentFeedItem {
  const config = EVENT_CONFIG[event.type];
  return {
    id: `real_${index}`,
    agent: config.agent,
    icon: config.icon,
    message: event.detail,
    timestamp: new Date(event.timestamp),
    targetRoom: config.room,
  };
}

// "Ambient" agent items — give the feed life even between real events
const AMBIENT_ITEMS: AgentFeedItem[] = [
  { id: 'amb_1', agent: 'LinkedIn Agent', icon: Linkedin, message: 'Monitoring your target companies for new connections', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), targetRoom: 'linkedin' },
  { id: 'amb_2', agent: 'Job Finder Agent', icon: Search, message: 'Scanning job boards for roles matching your profile', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), targetRoom: 'jobs' },
];

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function FeedItem({
  item,
  onNavigate,
}: {
  item: AgentFeedItem;
  onNavigate?: (room: CareerIQRoom) => void;
}) {
  const Icon = item.icon;
  const isOld = Date.now() - item.timestamp.getTime() > 72 * 60 * 60 * 1000;

  return (
    <button
      type="button"
      onClick={() => item.targetRoom && onNavigate?.(item.targetRoom)}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
        'hover:bg-white/[0.04]',
        isOld && 'opacity-40',
      )}
    >
      <div className="rounded-lg bg-white/[0.06] p-1.5 mt-0.5 flex-shrink-0">
        <Icon size={14} className="text-[#98b3ff]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-white/70 truncate">
            {item.agent}
          </span>
          <ArrowUpRight
            size={10}
            className="text-white/0 group-hover:text-white/40 transition-colors flex-shrink-0"
          />
        </div>
        <div className="text-[12px] text-white/45 leading-snug mt-0.5">
          {item.message}
        </div>
      </div>
      <span className="text-[10px] text-white/30 flex-shrink-0 mt-0.5 tabular-nums">
        {timeAgo(item.timestamp)}
      </span>
    </button>
  );
}

export function ZoneAgentFeed({ onNavigateRoom, realEvents }: ZoneAgentFeedProps) {
  const [showHistory, setShowHistory] = useState(false);

  const feedItems = useMemo(() => {
    if (realEvents && realEvents.length > 0) {
      const realItems = realEvents.map(realEventToFeedItem);
      // Merge real items with ambient items, sort by timestamp descending
      return [...realItems, ...AMBIENT_ITEMS].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    return MOCK_FEED;
  }, [realEvents]);

  const recentItems = feedItems.filter(
    (item) => Date.now() - item.timestamp.getTime() <= 72 * 60 * 60 * 1000,
  );
  const historyItems = feedItems.filter(
    (item) => Date.now() - item.timestamp.getTime() > 72 * 60 * 60 * 1000,
  );

  return (
    <GlassCard className="p-5 w-full lg:w-[340px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-white/80">Agent Activity</h3>
        <span className="text-[10px] text-white/30 tabular-nums">
          {recentItems.length} recent
        </span>
      </div>

      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
        {recentItems.map((item) => (
          <FeedItem key={item.id} item={item} onNavigate={onNavigateRoom} />
        ))}
      </div>

      {historyItems.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/50 transition-colors w-full"
          >
            <ChevronDown
              size={12}
              className={cn('transition-transform duration-200', showHistory && 'rotate-180')}
            />
            {showHistory ? 'Hide' : 'Show'} older ({historyItems.length})
          </button>
          {showHistory && (
            <div className="mt-1 space-y-0.5">
              {historyItems.map((item) => (
                <FeedItem key={item.id} item={item} onNavigate={onNavigateRoom} />
              ))}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
