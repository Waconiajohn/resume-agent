import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { DashboardSessionCard } from '@/components/dashboard/DashboardSessionCard';
import { SessionResumeModal } from '@/components/dashboard/SessionResumeModal';
import { ResumeComparisonModal } from '@/components/dashboard/ResumeComparisonModal';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

type StatusFilter = 'all' | 'complete' | 'running' | 'error';

const FILTER_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'complete', label: 'Completed' },
  { id: 'running', label: 'In Progress' },
  { id: 'error', label: 'Error' },
];

interface SessionHistoryTabProps {
  sessions: CoachSession[];
  loading: boolean;
  onLoadSessions: (filters?: { limit?: number; status?: string }) => void;
  onResumeSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<boolean>;
  onGetSessionResume: (id: string) => Promise<FinalResume | null>;
}

export function SessionHistoryTab({
  sessions,
  loading,
  onLoadSessions,
  onResumeSession,
  onDeleteSession,
  onGetSessionResume,
}: SessionHistoryTabProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [viewingResumeSessionId, setViewingResumeSessionId] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    const filters = filter !== 'all' ? { status: filter } : undefined;
    onLoadSessions(filters);
  }, [filter, onLoadSessions]);

  const filteredSessions = filter === 'all'
    ? sessions
    : sessions.filter((s) => s.pipeline_status === filter);

  const handleDeleteSession = async (id: string) => {
    await onDeleteSession(id);
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  };

  const compareIds = Array.from(selectedForCompare);
  const canCompare = compareIds.length === 2;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt.id
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {canCompare && (
          <GlassButton
            variant="ghost"
            className="h-8 px-3 text-xs"
            onClick={() => setShowComparison(true)}
          >
            Compare Selected
          </GlassButton>
        )}
      </div>

      {/* Session grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassCard key={i} className="p-4">
              <div className="mb-2 h-4 w-3/4 animate-pulse rounded-lg bg-white/[0.05]" />
              <div className="mb-1 h-3 w-1/2 animate-pulse rounded-lg bg-white/[0.03]" />
              <div className="h-3 w-1/3 animate-pulse rounded-lg bg-white/[0.03]" />
            </GlassCard>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-sm text-white/40">No sessions found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSessions.map((session) => (
            <DashboardSessionCard
              key={session.id}
              session={session}
              onResume={onResumeSession}
              onDelete={handleDeleteSession}
              onViewResume={setViewingResumeSessionId}
              isSelected={selectedForCompare.has(session.id)}
              onToggleSelect={handleToggleSelect}
              showSelectCheckbox={session.pipeline_status === 'complete'}
            />
          ))}
        </div>
      )}

      {selectedForCompare.size > 0 && selectedForCompare.size < 2 && (
        <p className="mt-3 text-center text-xs text-white/40">
          Select one more completed session to compare.
        </p>
      )}

      {viewingResumeSessionId && (
        <SessionResumeModal
          sessionId={viewingResumeSessionId}
          onClose={() => setViewingResumeSessionId(null)}
          onGetSessionResume={onGetSessionResume}
        />
      )}

      {showComparison && canCompare && (
        <ResumeComparisonModal
          sessionIds={[compareIds[0], compareIds[1]] as [string, string]}
          onClose={() => {
            setShowComparison(false);
            setSelectedForCompare(new Set());
          }}
          onGetSessionResume={onGetSessionResume}
          sessions={sessions}
        />
      )}
    </div>
  );
}
