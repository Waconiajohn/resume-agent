import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { DashboardSessionCard } from '@/components/dashboard/DashboardSessionCard';
import { SessionResumeModal } from '@/components/dashboard/SessionResumeModal';
import { SessionCoverLetterModal } from '@/components/dashboard/SessionCoverLetterModal';
import { ResumeComparisonModal } from '@/components/dashboard/ResumeComparisonModal';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

type StatusFilter = 'all' | 'complete' | 'running' | 'error';

const FILTER_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'complete', label: 'Completed' },
  { id: 'running', label: 'In Progress' },
  { id: 'error', label: 'Incomplete' },
];

type ProductFilter = 'all' | string;

function getUniqueProductTypes(sessions: CoachSession[]): string[] {
  const types = new Set<string>();
  for (const s of sessions) {
    types.add(s.product_type ?? 'resume');
  }
  return Array.from(types).sort();
}

function humanizeProductType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SessionHistoryTabProps {
  sessions: CoachSession[];
  loading: boolean;
  onLoadSessions: (filters?: { limit?: number; status?: string }) => void;
  onResumeSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<boolean>;
  onGetSessionResume: (id: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter: (id: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
}

export function SessionHistoryTab({
  sessions,
  loading,
  onLoadSessions,
  onResumeSession,
  onDeleteSession,
  onGetSessionResume,
  onGetSessionCoverLetter,
}: SessionHistoryTabProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [viewingResumeSessionId, setViewingResumeSessionId] = useState<string | null>(null);
  const [viewingCoverLetterSessionId, setViewingCoverLetterSessionId] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [extraSessions, setExtraSessions] = useState<CoachSession[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const filters = filter !== 'all' ? { status: filter } : undefined;
    onLoadSessions(filters);
  }, [filter, onLoadSessions]);

  // Reset accumulated pages when filters change
  useEffect(() => {
    setExtraSessions([]);
    setHasMore(false);
  }, [filter, productFilter]);

  // Derive hasMore from whether the parent loaded a full page
  useEffect(() => {
    setHasMore(sessions.length >= 50);
  }, [sessions]);

  const allSessions = useMemo(() => {
    if (extraSessions.length === 0) return sessions;
    const seen = new Set(sessions.map((s) => s.id));
    const extras = extraSessions.filter((s) => !seen.has(s.id));
    return [...sessions, ...extras];
  }, [sessions, extraSessions]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) return;

      const nextOffset = sessions.length + extraSessions.length;
      const params = new URLSearchParams({ offset: String(nextOffset), limit: '50' });
      if (filter !== 'all') params.set('status', filter);

      const res = await fetch(`${API_BASE}/sessions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const responseData = await res.json() as { sessions: CoachSession[]; has_more: boolean };
      setExtraSessions((prev) => [...prev, ...responseData.sessions]);
      setHasMore(responseData.has_more);
    } finally {
      setLoadingMore(false);
    }
  }, [sessions.length, extraSessions.length, filter]);

  const productTypes = getUniqueProductTypes(allSessions);

  const filteredSessions = allSessions.filter((s) => {
    const matchesStatus = filter === 'all' || s.pipeline_status === filter;
    const matchesProduct = productFilter === 'all' || (s.product_type ?? 'resume') === productFilter;
    return matchesStatus && matchesProduct;
  });

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
        <div className="flex flex-wrap items-center gap-3">
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
          {productTypes.length > 1 && (
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/80 outline-none transition-colors hover:bg-white/[0.08]"
              aria-label="Filter by product"
            >
              <option value="all">All Products</option>
              {productTypes.map((type) => (
                <option key={type} value={type}>
                  {humanizeProductType(type)}
                </option>
              ))}
            </select>
          )}
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
              <div className="mb-2 h-4 w-3/4 motion-safe:animate-pulse rounded-lg bg-white/[0.05]" />
              <div className="mb-1 h-3 w-1/2 motion-safe:animate-pulse rounded-lg bg-white/[0.03]" />
              <div className="h-3 w-1/3 motion-safe:animate-pulse rounded-lg bg-white/[0.03]" />
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
              onViewCoverLetter={setViewingCoverLetterSessionId}
              isSelected={selectedForCompare.has(session.id)}
              onToggleSelect={handleToggleSelect}
              showSelectCheckbox={session.pipeline_status === 'complete'}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <GlassButton
            variant="ghost"
            className="h-9 px-4 text-xs"
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </GlassButton>
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

      {viewingCoverLetterSessionId && (
        <SessionCoverLetterModal
          sessionId={viewingCoverLetterSessionId}
          onClose={() => setViewingCoverLetterSessionId(null)}
          onGetSessionCoverLetter={onGetSessionCoverLetter}
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
          sessions={allSessions}
        />
      )}
    </div>
  );
}
