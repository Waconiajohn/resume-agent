import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { SessionResumeModal } from '@/components/dashboard/SessionResumeModal';
import { SessionCoverLetterModal } from '@/components/dashboard/SessionCoverLetterModal';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

type StatusFilter = 'all' | 'complete' | 'running' | 'error';
type ProductFilter = 'all' | string;

const FILTER_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'complete', label: 'Completed' },
  { id: 'running', label: 'In Progress' },
  { id: 'error', label: 'Needs Review' },
];

interface SessionHistoryTabProps {
  sessions: CoachSession[];
  loading: boolean;
  onLoadSessions: (filters?: { limit?: number; status?: string }) => void;
  onResumeSession: (id: string) => void;
  onNavigate?: (route: string) => void;
  onDeleteSession: (id: string) => Promise<boolean>;
  onGetSessionResume: (id: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter: (id: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
}

interface SessionJobRecord {
  key: string;
  company: string;
  role: string;
  createdAt: string;
  jobStage: string | null;
  latestSession: CoachSession;
  status: ReturnType<typeof formatStatus>;
  assets: CoachSession[];
}

function formatJobStage(stage?: string | null): { label: string; classes: string } {
  switch (stage) {
    case 'researching':
      return { label: 'Researching', classes: 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]' };
    case 'applied':
      return { label: 'Applied', classes: 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]' };
    case 'screening':
      return { label: 'Screening', classes: 'border-[#f0d99f]/25 bg-[#f0d99f]/10 text-[#f3e4b5]' };
    case 'interviewing':
      return { label: 'Interviewing', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'offer':
      return { label: 'Offer', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'closed_won':
      return { label: 'Accepted', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'closed_lost':
      return { label: 'Closed', classes: 'border-white/[0.10] bg-white/[0.04] text-white/60' };
    case 'saved':
    default:
      return { label: 'Saved', classes: 'border-white/[0.10] bg-white/[0.04] text-white/60' };
  }
}

function stageAwareActions(stage?: string | null): {
  unlocked: string[];
  nextActionLabel: string;
  nextActionRoute?: string;
} {
  switch (stage) {
    case 'interviewing':
      return {
        unlocked: ['Interview Lab', 'Thank You Note', '30-60-90 Day Plan'],
        nextActionLabel: 'Open Interview Lab',
        nextActionRoute: '/workspace?room=interview',
      };
    case 'offer':
      return {
        unlocked: ['Salary Negotiation', 'Interview Lab'],
        nextActionLabel: 'Open Salary Negotiation',
        nextActionRoute: '/workspace?room=salary-negotiation',
      };
    case 'closed_won':
      return {
        unlocked: ['Archive-worthy assets'],
        nextActionLabel: 'Reopen Job Workspace',
      };
    case 'closed_lost':
      return {
        unlocked: ['Reference-only assets'],
        nextActionLabel: 'Reopen Job Workspace',
      };
    case 'screening':
      return {
        unlocked: ['Resume', 'Cover Letter'],
        nextActionLabel: 'Keep this workspace lean until an interview is scheduled',
      };
    case 'researching':
    case 'applied':
    case 'saved':
    default:
      return {
        unlocked: ['Resume', 'Cover Letter'],
        nextActionLabel: 'Interview assets unlock when the job reaches interviewing',
      };
  }
}

function humanizeProductType(type: string): string {
  switch (type) {
    case 'resume_v2':
    case 'resume':
      return 'Tailored Resume';
    case 'cover_letter':
      return 'Cover Letter';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function productTypeForSession(session: CoachSession): string {
  return session.product_type ?? 'resume';
}

function getUniqueProductTypes(sessions: CoachSession[]): string[] {
  const types = new Set<string>();
  for (const session of sessions) {
    const type = productTypeForSession(session);
    if (type === 'resume' || type === 'resume_v2' || type === 'cover_letter') {
      types.add(type);
    }
  }
  return Array.from(types).sort();
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatStatus(status?: string | null): { label: string; classes: string } {
  switch (status) {
    case 'complete':
    case 'completed':
      return { label: 'Completed', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'error':
      return { label: 'Needs Review', classes: 'border-[#f0b8b8]/25 bg-[#f0b8b8]/10 text-[#f6d0d0]' };
    default:
      return { label: 'In Progress', classes: 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]' };
  }
}

function buildJobRecordKey(session: CoachSession): string {
  const company = session.company_name?.trim().toLowerCase() || 'untitled-company';
  const role = session.job_title?.trim().toLowerCase() || 'untitled-role';
  const date = session.created_at.slice(0, 10);
  return `${company}::${role}::${date}`;
}

function buildJobRecords(sessions: CoachSession[]): SessionJobRecord[] {
  const grouped = new Map<string, SessionJobRecord>();

  for (const session of sessions) {
    const key = buildJobRecordKey(session);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        key,
        company: session.company_name?.trim() || 'Untitled company',
        role: session.job_title?.trim() || 'Untitled role',
        createdAt: session.created_at,
        jobStage: session.job_stage ?? null,
        latestSession: session,
        status: formatStatus(session.pipeline_status ?? session.pipeline_stage),
        assets: [session],
      });
      continue;
    }

    existing.assets.push(session);
    if (new Date(session.updated_at).getTime() > new Date(existing.latestSession.updated_at).getTime()) {
      existing.latestSession = session;
      existing.status = formatStatus(session.pipeline_status ?? session.pipeline_stage);
      existing.createdAt = session.created_at;
    }
    if (session.job_stage && !existing.jobStage) {
      existing.jobStage = session.job_stage;
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) => new Date(right.latestSession.updated_at).getTime() - new Date(left.latestSession.updated_at).getTime(),
  );
}

function assetBadgeLabel(type: string): string {
  switch (type) {
    case 'cover_letter':
      return 'Cover Letter';
    case 'resume':
    case 'resume_v2':
      return 'Resume';
    default:
      return humanizeProductType(type);
  }
}

function matchesStatusFilter(session: CoachSession, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const rawStatus = session.pipeline_status ?? session.pipeline_stage ?? '';

  if (filter === 'complete') {
    return rawStatus === 'complete' || rawStatus === 'completed';
  }

  if (filter === 'error') {
    return rawStatus === 'error';
  }

  return rawStatus !== 'complete' && rawStatus !== 'completed' && rawStatus !== 'error';
}

export function SessionHistoryTab({
  sessions,
  loading,
  onLoadSessions,
  onResumeSession,
  onNavigate,
  onDeleteSession,
  onGetSessionResume,
  onGetSessionCoverLetter,
}: SessionHistoryTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [viewingResumeSessionId, setViewingResumeSessionId] = useState<string | null>(null);
  const [viewingCoverLetterSessionId, setViewingCoverLetterSessionId] = useState<string | null>(null);
  const [extraSessions, setExtraSessions] = useState<CoachSession[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const filters = statusFilter !== 'all' ? { status: statusFilter } : undefined;
    onLoadSessions(filters);
  }, [statusFilter, onLoadSessions]);

  useEffect(() => {
    setExtraSessions([]);
    setHasMore(false);
  }, [statusFilter, productFilter]);

  useEffect(() => {
    setHasMore(sessions.length >= 50);
  }, [sessions]);

  const allSessions = useMemo(() => {
    if (extraSessions.length === 0) return sessions;
    const seen = new Set(sessions.map((session) => session.id));
    return [...sessions, ...extraSessions.filter((session) => !seen.has(session.id))];
  }, [extraSessions, sessions]);

  const productTypes = getUniqueProductTypes(allSessions);

  const filteredSessions = allSessions.filter((session) => {
    const type = productTypeForSession(session);
    const matchesProduct = productFilter === 'all' || type === productFilter;
    const matchesSupportedType = type === 'resume' || type === 'resume_v2' || type === 'cover_letter';
    return matchesProduct && matchesSupportedType && matchesStatusFilter(session, statusFilter);
  });
  const jobRecords = useMemo(() => buildJobRecords(filteredSessions), [filteredSessions]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) return;

      const nextOffset = sessions.length + extraSessions.length;
      const params = new URLSearchParams({ offset: String(nextOffset), limit: '50' });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const response = await fetch(`${API_BASE}/sessions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;

      const responseData = await response.json() as { sessions: CoachSession[]; has_more: boolean };
      setExtraSessions((current) => [...current, ...responseData.sessions]);
      setHasMore(responseData.has_more);
    } finally {
      setLoadingMore(false);
    }
  }, [extraSessions.length, sessions.length, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/85">Job Workspaces</h3>
          <p className="mt-1 text-xs text-white/45">
            Each record stays lightweight until the job advances. Interview and offer-stage assets only show up when the stage justifies them.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatusFilter(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === option.id
                    ? 'bg-white/[0.1] text-white'
                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {productTypes.length > 1 && (
            <select
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/80 outline-none transition-colors hover:bg-white/[0.08]"
              aria-label="Filter by asset type"
            >
              <option value="all">All Assets</option>
              {productTypes.map((type) => (
                <option key={type} value={type}>
                  {humanizeProductType(type)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <div className="hidden grid-cols-[minmax(0,2fr)_130px_130px_minmax(0,1.15fr)_280px] gap-4 border-b border-white/[0.06] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-white/35 lg:grid">
          <div>Company and role</div>
          <div>Date</div>
          <div>Stage</div>
          <div>Assets and unlocks</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="border-b border-white/[0.04] px-5 py-4 last:border-b-0">
                <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-white/[0.05]" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.03]" />
              </div>
            ))}
          </div>
        ) : jobRecords.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-white/45">No saved tailored work found for this filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {jobRecords.map((record) => {
              const resumeAsset = record.assets.find((session) => productTypeForSession(session) !== 'cover_letter');
              const coverLetterAsset = record.assets.find((session) => productTypeForSession(session) === 'cover_letter');
              const assetCounts = record.assets.reduce<Record<string, number>>((accumulator, session) => {
                const type = productTypeForSession(session);
                accumulator[type] = (accumulator[type] ?? 0) + 1;
                return accumulator;
              }, {});
              const jobStage = formatJobStage(record.jobStage);
              const stageActions = stageAwareActions(record.jobStage);

              return (
                <div key={record.key} className="px-5 py-4">
                  <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_130px_130px_minmax(0,1.15fr)_280px] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-white/85">{record.company}</div>
                        <span className="rounded-full border border-[#98b3ff]/16 bg-[#98b3ff]/[0.05] px-2 py-0.5 text-[10px] text-[#c9d7ff]">
                          Job workspace
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-white/45">{record.role}</div>
                    </div>

                    <div className="text-xs text-white/55">{formatDate(record.createdAt)}</div>

                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${jobStage.classes}`}>
                        {jobStage.label}
                      </span>
                      <div className="mt-2 text-[11px] text-white/40">
                        Pipeline state: {record.status.label}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(assetCounts).map(([type, count]) => (
                          <span
                            key={type}
                            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50"
                          >
                            {assetBadgeLabel(type)}{count > 1 ? ` (${count})` : ''}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-white/42">
                        Available now: {stageActions.unlocked.join(' • ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onResumeSession(record.latestSession.id)}>
                        <ExternalLink size={12} className="mr-1.5" />
                        Open
                      </GlassButton>
                      {resumeAsset && (
                        <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setViewingResumeSessionId(resumeAsset.id)}>
                          <FileText size={12} className="mr-1.5" />
                          View Resume
                        </GlassButton>
                      )}
                      {coverLetterAsset && (
                        <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setViewingCoverLetterSessionId(coverLetterAsset.id)}>
                          <FileText size={12} className="mr-1.5" />
                          View Letter
                        </GlassButton>
                      )}
                      {!coverLetterAsset && record.assets.length === 1 && (
                        <button
                          type="button"
                          onClick={() => void onDeleteSession(record.latestSession.id)}
                          className="inline-flex h-8 items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                          aria-label={`Delete ${record.company} ${record.role} session`}
                        >
                          <Trash2 size={12} className="mr-1.5" />
                          Delete
                        </button>
                      )}
                      {stageActions.nextActionRoute && (
                        <GlassButton
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 text-xs"
                          onClick={() => onNavigate?.(stageActions.nextActionRoute!)}
                        >
                          <FileText size={12} className="mr-1.5" />
                          {stageActions.nextActionLabel}
                        </GlassButton>
                      )}
                    </div>
                  </div>
                  {!stageActions.nextActionRoute && (
                    <div className="mt-3 text-[11px] text-white/38">
                      {stageActions.nextActionLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {hasMore && (
        <div className="flex justify-center">
          <GlassButton variant="ghost" className="h-9 px-4 text-xs" onClick={() => void handleLoadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load more'}
          </GlassButton>
        </div>
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
    </div>
  );
}
