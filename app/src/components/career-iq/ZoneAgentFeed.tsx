import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import {
  FileText,
  Search,
  Mic,
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


const EVENT_CONFIG: Record<RealFeedEvent['type'], { agent: string; icon: typeof FileText; room: CareerIQRoom }> = {
  session_created: { agent: 'Resume Agent', icon: FileText, room: 'resume' },
  session_completed: { agent: 'Resume Agent', icon: FileText, room: 'resume' },
  pipeline_moved: { agent: 'Job Search Agent', icon: Search, room: 'jobs' },
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
        'hover:bg-[var(--surface-1)]',
        isOld && 'opacity-40',
      )}
    >
      <div className="rounded-lg bg-[var(--accent-muted)] p-1.5 mt-0.5 flex-shrink-0">
        <Icon size={14} className="text-[var(--link)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-muted)] truncate">
            {item.agent}
          </span>
          <ArrowUpRight
            size={10}
            className="text-transparent group-hover:text-[var(--text-soft)] transition-colors flex-shrink-0"
          />
        </div>
        <div className="text-[12px] text-[var(--text-soft)] leading-snug mt-0.5">
          {item.message}
        </div>
      </div>
      <span className="text-[12px] text-[var(--text-soft)] flex-shrink-0 mt-0.5 tabular-nums">
        {timeAgo(item.timestamp)}
      </span>
    </button>
  );
}

export function ZoneAgentFeed({ onNavigateRoom, realEvents }: ZoneAgentFeedProps) {
  const [showHistory, setShowHistory] = useState(false);

  const feedItems = useMemo(() => {
    if (realEvents && realEvents.length > 0) {
      return realEvents.map(realEventToFeedItem).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    return [];
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
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Agent Activity</h3>
        <span className="text-[12px] text-[var(--text-soft)] tabular-nums">
          {recentItems.length} recent
        </span>
      </div>

      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
        {recentItems.length === 0 && historyItems.length === 0 ? (
          <p className="px-3 py-6 text-[12px] text-[var(--text-soft)] text-center leading-relaxed">
            Your agents will report activity here as you use the platform.
          </p>
        ) : (
          recentItems.map((item) => (
            <FeedItem key={item.id} item={item} onNavigate={onNavigateRoom} />
          ))
        )}
      </div>

      {historyItems.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--line-soft)]">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors w-full"
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
