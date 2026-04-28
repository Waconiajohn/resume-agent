import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, ExternalLink, Link2, Trash2, X } from 'lucide-react';
import { useTailorPicker } from '@/components/applications/TailorPickerProvider';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { SessionResumeModal } from '@/components/dashboard/SessionResumeModal';
import { SessionCoverLetterModal } from '@/components/dashboard/SessionCoverLetterModal';
import { JobWorkspaceView } from '@/components/dashboard/JobWorkspaceView';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { Application, PipelineStage } from '@/hooks/useJobApplications';
import {
  buildJobRecords,
  buildWorkspaceRoomRoute,
  formatDate,
  formatStatus,
  getUniqueProductTypes,
  humanizeProductType,
  isResumeProductType,
  isWorkspaceProductType,
  productTypeForSession,
  type SessionJobRecord,
} from '@/lib/job-workspace';

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
  jobApplications?: Application[];
  loading: boolean;
  onLoadSessions: (filters?: { limit?: number; status?: string }) => void;
  onResumeSession: (id: string) => void;
  onNavigate?: (route: string) => void;
  onMoveJobStage?: (id: string, stage: PipelineStage) => Promise<boolean>;
  onDeleteSession: (id: string) => Promise<boolean>;
  onGetSessionResume: (id: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter: (id: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
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

// Phase 2 (pursuit timeline) — small inline prompt for orphan resume_v3
// sessions (no job_application_id). Per-row dismissible via localStorage;
// no global banner, no "you have N items" interruption.
const ORPHAN_DISMISS_PREFIX = 'resume-agent:orphan-row-dismissed:';

function isOrphanDismissed(sessionKey: string): boolean {
  try {
    return window.localStorage.getItem(`${ORPHAN_DISMISS_PREFIX}${sessionKey}`) === '1';
  } catch {
    return false;
  }
}

function dismissOrphan(sessionKey: string): void {
  try {
    window.localStorage.setItem(`${ORPHAN_DISMISS_PREFIX}${sessionKey}`, '1');
  } catch {
    /* ignore */
  }
}

function OrphanLinkPrompt({ sessionKey }: { sessionKey: string }) {
  const { openPicker } = useTailorPicker();
  const [hidden, setHidden] = useState(() => isOrphanDismissed(sessionKey));

  if (hidden) return null;

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--link)]/15 bg-[var(--link)]/[0.04] px-3 py-2 text-[12px]">
      <Link2 size={11} className="text-[var(--link)] flex-shrink-0" />
      <span className="text-[var(--text-soft)]">
        Not linked to an application yet.
      </span>
      <button
        type="button"
        onClick={() => openPicker({ source: 'session_history_orphan' })}
        className="ml-1 text-[var(--link)] hover:underline"
      >
        Link →
      </button>
      <button
        type="button"
        onClick={() => {
          dismissOrphan(sessionKey);
          setHidden(true);
        }}
        aria-label="Dismiss"
        className="ml-auto p-0.5 rounded text-[var(--text-soft)] hover:text-[var(--text-strong)]"
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function SessionHistoryTab({
  sessions,
  jobApplications = [],
  loading,
  onLoadSessions,
  onResumeSession,
  onNavigate,
  onMoveJobStage,
  onDeleteSession,
  onGetSessionResume,
  onGetSessionCoverLetter,
}: SessionHistoryTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [viewingResumeSessionId, setViewingResumeSessionId] = useState<string | null>(null);
  const [viewingCoverLetterSessionId, setViewingCoverLetterSessionId] = useState<string | null>(null);
  const [selectedWorkspaceKey, setSelectedWorkspaceKey] = useState<string | null>(null);
  const [savingStage, setSavingStage] = useState<PipelineStage | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
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
    const matchesSupportedType = isWorkspaceProductType(type);
    return matchesProduct && matchesSupportedType && matchesStatusFilter(session, statusFilter);
  });
  const jobRecords = useMemo(() => buildJobRecords(filteredSessions), [filteredSessions]);
  const applicationsById = useMemo(
    () => new Map(jobApplications.map((application) => [application.id, application])),
    [jobApplications],
  );
  const selectedWorkspace = useMemo(
    () => jobRecords.find((record) => record.key === selectedWorkspaceKey) ?? null,
    [jobRecords, selectedWorkspaceKey],
  );

  useEffect(() => {
    if (selectedWorkspaceKey && !jobRecords.some((record) => record.key === selectedWorkspaceKey)) {
      setSelectedWorkspaceKey(null);
    }
  }, [jobRecords, selectedWorkspaceKey]);

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

  const handleMoveWorkspaceStage = useCallback(async (record: SessionJobRecord, stage: PipelineStage) => {
    if (!record.jobApplicationId || !onMoveJobStage) return false;
    setSavingStage(stage);
    try {
      return await onMoveJobStage(record.jobApplicationId, stage);
    } finally {
      setSavingStage(null);
    }
  }, [onMoveJobStage]);

  const handleDeleteRecord = useCallback(async (record: SessionJobRecord) => {
    setDeletingKey(record.key);
    try {
      // Delete all sessions in this record
      const results = await Promise.all(record.assets.map((session) => onDeleteSession(session.id)));
      const allSucceeded = results.every(Boolean);
      if (allSucceeded) {
        setConfirmDeleteKey(null);
        if (selectedWorkspaceKey === record.key) setSelectedWorkspaceKey(null);
      }
    } finally {
      setDeletingKey(null);
    }
  }, [onDeleteSession, selectedWorkspaceKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">Saved Tailored Resumes</h3>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
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
                    ? 'bg-[var(--surface-1)] text-[var(--text-strong)]'
                    : 'text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-muted)]'
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
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--surface-1)]"
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
        <div className="hidden grid-cols-[minmax(0,2fr)_120px_140px_180px] gap-4 border-b border-[var(--line-soft)] px-5 py-3 text-[13px] font-medium uppercase tracking-wider text-[var(--text-soft)] lg:grid">
          <div>Company and role</div>
          <div>Date</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="border-b border-[var(--line-soft)] px-5 py-4 last:border-b-0">
                <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-[var(--surface-1)]" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--accent-muted)]" />
              </div>
            ))}
          </div>
        ) : jobRecords.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-[var(--text-soft)]">No saved role-specific work found for this filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {jobRecords.map((record) => {
              const resumeAsset = record.assets.find((session) => isResumeProductType(productTypeForSession(session))) ?? null;
              const coverLetterAsset = record.assets.find((session) => productTypeForSession(session) === 'cover_letter') ?? null;
              const reopenSessionId = resumeAsset?.id ?? record.latestSession.id;
              const pipelineStatus = formatStatus(record.latestSession.pipeline_status ?? record.latestSession.pipeline_stage);
              const nextActionRoute = record.jobStage === 'interviewing'
                ? buildWorkspaceRoomRoute('interview', record, { focus: 'prep' })
                : record.jobStage === 'offer'
                ? buildWorkspaceRoomRoute('interview', record, { focus: 'negotiation' })
                : null;
              const isConfirmingDelete = confirmDeleteKey === record.key;
              const isDeleting = deletingKey === record.key;

              const showOrphanPrompt = !record.jobApplicationId && resumeAsset !== null;

              return (
                <div key={record.key} className="px-5 py-4">
                  <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_120px_140px_180px] lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{record.company}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs text-[var(--text-soft)]">{record.role}</span>
                        {(resumeAsset || coverLetterAsset) && (
                          <span className="shrink-0 text-[11px] text-[var(--text-soft)]/60">
                            {[resumeAsset && 'Resume', coverLetterAsset && 'Cover Letter']
                              .filter(Boolean)
                              .map((label) => `${label as string} \u2713`)
                              .join(' \u00b7 ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-[var(--text-soft)]">{formatDate(record.createdAt)}</div>

                    <div>
                      <span className={`inline-flex rounded-md border px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.12em] ${pipelineStatus.classes}`}>
                        {pipelineStatus.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <GlassButton
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-xs"
                        onClick={() => onResumeSession(reopenSessionId)}
                      >
                        <ExternalLink size={12} className="mr-1.5" />
                        Open
                      </GlassButton>
                      <GlassButton
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-xs"
                        onClick={() => setSelectedWorkspaceKey(record.key)}
                      >
                        <BriefcaseBusiness size={12} className="mr-1.5" />
                        {selectedWorkspaceKey === record.key ? 'Viewing' : 'Details'}
                      </GlassButton>
                      {nextActionRoute && (
                        <GlassButton
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 text-xs"
                          onClick={() => onNavigate?.(nextActionRoute)}
                        >
                          Interview Prep
                        </GlassButton>
                      )}
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => void handleDeleteRecord(record)}
                            className="inline-flex h-8 items-center rounded-lg border border-[var(--badge-red-text)]/30 bg-[var(--badge-red-bg)] px-3 text-xs text-[var(--badge-red-text)] transition-colors hover:brightness-95 disabled:opacity-50"
                          >
                            {isDeleting ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="inline-flex h-8 items-center rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 text-xs text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-1)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(record.key)}
                          className="inline-flex h-8 items-center rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 text-xs text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]"
                          aria-label={`Delete ${record.company} session`}
                        >
                          <Trash2 size={12} className="mr-1.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {showOrphanPrompt && (
                    <OrphanLinkPrompt sessionKey={record.key} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {selectedWorkspace && (
        <JobWorkspaceView
          record={selectedWorkspace}
          application={selectedWorkspace.jobApplicationId ? applicationsById.get(selectedWorkspace.jobApplicationId) : undefined}
          onClose={() => setSelectedWorkspaceKey(null)}
          onMoveJobStage={onMoveJobStage ? handleMoveWorkspaceStage : undefined}
          savingStage={savingStage}
          onResumeSession={onResumeSession}
          onNavigate={onNavigate}
          onViewResume={(sessionId) => setViewingResumeSessionId(sessionId)}
          onViewCoverLetter={(sessionId) => setViewingCoverLetterSessionId(sessionId)}
        />
      )}

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
