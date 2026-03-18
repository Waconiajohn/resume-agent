import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Clock3, ExternalLink, FileText, Loader2, Mail, Mic, Sparkles, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { SessionResumeModal } from '@/components/dashboard/SessionResumeModal';
import { SessionCoverLetterModal } from '@/components/dashboard/SessionCoverLetterModal';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { Application, PipelineStage } from '@/hooks/useApplicationPipeline';

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

interface SessionJobRecord {
  key: string;
  company: string;
  role: string;
  createdAt: string;
  jobApplicationId: string | null;
  jobStage: string | null;
  latestSession: CoachSession;
  status: ReturnType<typeof formatStatus>;
  assets: CoachSession[];
}

const JOB_WORKSPACE_STAGES: PipelineStage[] = [
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'closed_won',
  'closed_lost',
];

const WORKSPACE_PRODUCT_TYPES = new Set([
  'resume',
  'resume_v2',
  'cover_letter',
  'interview_prep',
  'thank_you_note',
  'ninety_day_plan',
  'salary_negotiation',
]);

function isPipelineStage(value?: string | null): value is PipelineStage {
  return JOB_WORKSPACE_STAGES.includes(value as PipelineStage);
}

function stageLabel(stage: PipelineStage): string {
  switch (stage) {
    case 'closed_won':
      return 'Accepted';
    case 'closed_lost':
      return 'Closed';
    default:
      return stage.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
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
} {
  switch (stage) {
    case 'interviewing':
      return {
        unlocked: ['Interview Lab', 'Thank You Note', '30-60-90 Day Plan'],
        nextActionLabel: 'Open Interview Lab',
      };
    case 'offer':
      return {
        unlocked: ['Salary Negotiation', 'Interview Lab'],
        nextActionLabel: 'Open Salary Negotiation',
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

function isResumeProductType(type: string): boolean {
  return type === 'resume' || type === 'resume_v2';
}

function isWorkspaceProductType(type: string): boolean {
  return WORKSPACE_PRODUCT_TYPES.has(type);
}

function getUniqueProductTypes(sessions: CoachSession[]): string[] {
  const types = new Set<string>();
  for (const session of sessions) {
    const type = productTypeForSession(session);
    if (isWorkspaceProductType(type)) {
      types.add(type);
    }
  }
  return Array.from(types).sort();
}

function buildWorkspaceRoomRoute(
  room: 'interview' | 'salary-negotiation',
  context: {
    company: string;
    role: string;
    jobApplicationId?: string | null;
  },
  focus?: 'prep' | 'plan' | 'thank-you',
): string {
  const params = new URLSearchParams({ room });
  if (context.jobApplicationId) {
    params.set('job', context.jobApplicationId);
  }
  if (context.company) {
    params.set('company', context.company);
  }
  if (context.role) {
    params.set('role', context.role);
  }
  if (focus) {
    params.set('focus', focus);
  }
  return `/workspace?${params.toString()}`;
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
  const fallbackKey = buildFallbackJobRecordKey(session);
  if (session.job_application_id?.trim()) {
    return `jobapp::${session.job_application_id}`;
  }
  return fallbackKey;
}

function buildFallbackJobRecordKey(session: CoachSession): string {
  const company = session.company_name?.trim().toLowerCase() || 'untitled-company';
  const role = session.job_title?.trim().toLowerCase() || 'untitled-role';
  const date = session.created_at.slice(0, 10);
  return `${company}::${role}::${date}`;
}

function buildJobRecords(sessions: CoachSession[]): SessionJobRecord[] {
  const grouped = new Map<string, SessionJobRecord>();
  const preferredAppIdByFallbackKey = new Map<string, string>();

  for (const session of sessions) {
    const fallbackKey = buildFallbackJobRecordKey(session);
    if (session.job_application_id?.trim()) {
      preferredAppIdByFallbackKey.set(fallbackKey, session.job_application_id);
    }
  }

  for (const session of sessions) {
    const fallbackKey = buildFallbackJobRecordKey(session);
    const resolvedJobApplicationId = session.job_application_id ?? preferredAppIdByFallbackKey.get(fallbackKey) ?? null;
    const key = resolvedJobApplicationId ? `jobapp::${resolvedJobApplicationId}` : buildJobRecordKey(session);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        key,
        company: session.company_name?.trim() || 'Untitled company',
        role: session.job_title?.trim() || 'Untitled role',
        createdAt: session.created_at,
        jobApplicationId: resolvedJobApplicationId,
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
    if (resolvedJobApplicationId && !existing.jobApplicationId) {
      existing.jobApplicationId = resolvedJobApplicationId;
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
              const resumeAsset = record.assets.find((session) => isResumeProductType(productTypeForSession(session))) ?? null;
              const coverLetterAsset = record.assets.find((session) => productTypeForSession(session) === 'cover_letter') ?? null;
              const application = record.jobApplicationId ? applicationsById.get(record.jobApplicationId) : undefined;
              const assetCounts = record.assets.reduce<Record<string, number>>((accumulator, session) => {
                const type = productTypeForSession(session);
                accumulator[type] = (accumulator[type] ?? 0) + 1;
                return accumulator;
              }, {});
              const activeStage = application?.stage ?? record.jobStage;
              const jobStage = formatJobStage(activeStage);
              const stageActions = stageAwareActions(activeStage);
              const nextActionRoute = activeStage === 'interviewing'
                ? buildWorkspaceRoomRoute('interview', record, 'prep')
                : activeStage === 'offer'
                ? buildWorkspaceRoomRoute('salary-negotiation', record)
                : null;
              const reopenSessionId = resumeAsset?.id ?? record.latestSession.id;

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
                      <GlassButton
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-xs"
                        onClick={() => setSelectedWorkspaceKey(record.key)}
                      >
                        <BriefcaseBusiness size={12} className="mr-1.5" />
                        {selectedWorkspaceKey === record.key ? 'Workspace Open' : 'View Workspace'}
                      </GlassButton>
                      <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onResumeSession(reopenSessionId)}>
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
                      {nextActionRoute && (
                        <GlassButton
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 text-xs"
                          onClick={() => onNavigate?.(nextActionRoute)}
                        >
                          <FileText size={12} className="mr-1.5" />
                          {stageActions.nextActionLabel}
                        </GlassButton>
                      )}
                    </div>
                  </div>
                  {!nextActionRoute && (
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

      {selectedWorkspace && (
        <JobWorkspacePanel
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

function JobWorkspacePanel({
  record,
  application,
  onClose,
  onMoveJobStage,
  savingStage,
  onResumeSession,
  onNavigate,
  onViewResume,
  onViewCoverLetter,
}: {
  record: SessionJobRecord;
  application?: Application;
  onClose: () => void;
  onMoveJobStage?: (record: SessionJobRecord, stage: PipelineStage) => Promise<boolean>;
  savingStage: PipelineStage | null;
  onResumeSession: (id: string) => void;
  onNavigate?: (route: string) => void;
  onViewResume: (sessionId: string) => void;
  onViewCoverLetter: (sessionId: string) => void;
}) {
  const resumeAsset = record.assets.find((session) => isResumeProductType(productTypeForSession(session))) ?? null;
  const coverLetterAsset = record.assets.find((session) => productTypeForSession(session) === 'cover_letter') ?? null;
  const interviewPrepAsset = record.assets.find((session) => productTypeForSession(session) === 'interview_prep') ?? null;
  const thankYouAsset = record.assets.find((session) => productTypeForSession(session) === 'thank_you_note') ?? null;
  const ninetyDayPlanAsset = record.assets.find((session) => productTypeForSession(session) === 'ninety_day_plan') ?? null;
  const salaryNegotiationAsset = record.assets.find((session) => productTypeForSession(session) === 'salary_negotiation') ?? null;
  const activeStage = application?.stage ?? (isPipelineStage(record.jobStage) ? record.jobStage : 'saved');
  const activeStageBadge = formatJobStage(activeStage);
  const stageActions = stageAwareActions(activeStage);
  const reopenSessionId = resumeAsset?.id ?? record.latestSession.id;
  const interviewPrepRoute = buildWorkspaceRoomRoute('interview', record, 'prep');
  const thankYouRoute = buildWorkspaceRoomRoute('interview', record, 'thank-you');
  const ninetyDayPlanRoute = buildWorkspaceRoomRoute('interview', record, 'plan');
  const salaryNegotiationRoute = buildWorkspaceRoomRoute('salary-negotiation', record);
  const stageHistory = Array.isArray(application?.stage_history) && application?.stage_history.length > 0
    ? application.stage_history
    : [{ stage: activeStage, at: record.latestSession.updated_at }];

  return (
    <GlassCard className="space-y-5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Job Workspace
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white/88">{record.company}</h3>
          <p className="mt-1 text-sm text-white/48">{record.role}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${activeStageBadge.classes}`}>
            {activeStageBadge.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/72"
            aria-label="Close workspace"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Stage control</div>
        <p className="mt-2 text-sm leading-relaxed text-white/52">
          Keep this workspace lean until the process advances. Interview and offer assets only light up when the stage earns them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {JOB_WORKSPACE_STAGES.map((stage) => {
            const active = activeStage === stage;
            return (
              <button
                key={stage}
                type="button"
                disabled={!application || !onMoveJobStage || active || savingStage === stage}
                onClick={() => void onMoveJobStage?.(record, stage)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/52 hover:bg-white/[0.06] hover:text-white/78'
                }`}
              >
                {savingStage === stage ? <Loader2 size={12} className="animate-spin" /> : null}
                {stageLabel(stage)}
              </button>
            );
          })}
        </div>
        {!application && (
          <p className="mt-3 text-[11px] text-white/38">
            This tailored work is not yet linked to a tracked job application, so the stage shown here is read-only.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Assets</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <FileText size={14} className="text-[#98b3ff]" />
                  Tailored Resume
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {resumeAsset ? 'Open the active session or preview the saved resume text.' : 'No tailored resume is saved to this workspace yet.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {resumeAsset && (
                    <>
                      <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onResumeSession(resumeAsset.id)}>
                        <ExternalLink size={12} className="mr-1.5" />
                        Open Session
                      </GlassButton>
                      <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onViewResume(resumeAsset.id)}>
                        <FileText size={12} className="mr-1.5" />
                        View
                      </GlassButton>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <Mail size={14} className="text-[#98b3ff]" />
                  Cover Letter
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {coverLetterAsset ? 'Preview the saved letter or reopen the parent session.' : 'Generate or save a cover letter only when the application actually needs one.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {coverLetterAsset && (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onViewCoverLetter(coverLetterAsset.id)}>
                      <Mail size={12} className="mr-1.5" />
                      View Letter
                    </GlassButton>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <Mic size={14} className="text-[#98b3ff]" />
                  Interview Prep
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {interviewPrepAsset
                    ? 'Saved to this job workspace. Reopen Interview Lab to review or extend the prep.'
                    : activeStage === 'interviewing' || activeStage === 'offer'
                    ? 'Ready to generate now that the job is in interviews.'
                    : 'Interview prep stays hidden until the application reaches interviewing.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(interviewPrepAsset || activeStage === 'interviewing' || activeStage === 'offer') && (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(interviewPrepRoute)}>
                      <Mic size={12} className="mr-1.5" />
                      Open Interview Lab
                    </GlassButton>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <Mail size={14} className="text-[#98b3ff]" />
                  Thank You Note
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {thankYouAsset
                    ? 'Saved follow-up for this job. Reopen the note inside Interview Lab.'
                    : activeStage === 'interviewing' || activeStage === 'offer'
                    ? 'Available when you need post-interview follow-up.'
                    : 'Follow-up unlocks only after the job reaches interview stages.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(thankYouAsset || activeStage === 'interviewing' || activeStage === 'offer') && (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(thankYouRoute)}>
                      <Mail size={12} className="mr-1.5" />
                      Open Note
                    </GlassButton>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <FileText size={14} className="text-[#98b3ff]" />
                  30-60-90 Plan
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {ninetyDayPlanAsset
                    ? 'Saved to this workspace for later interview rounds.'
                    : activeStage === 'interviewing' || activeStage === 'offer'
                    ? 'Ready when you need a leave-behind for later rounds.'
                    : 'Keep this closed until the job is deep enough to justify interview leave-behinds.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(ninetyDayPlanAsset || activeStage === 'interviewing' || activeStage === 'offer') && (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(ninetyDayPlanRoute)}>
                      <FileText size={12} className="mr-1.5" />
                      Open Plan
                    </GlassButton>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <Sparkles size={14} className="text-[#98b3ff]" />
                  Salary Negotiation
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {salaryNegotiationAsset
                    ? 'Saved offer-stage strategy for this job workspace.'
                    : activeStage === 'offer'
                    ? 'Unlocked now that the process is at offer stage.'
                    : 'Negotiation prep stays out of the way until there is a live offer.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(salaryNegotiationAsset || activeStage === 'offer') && (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(salaryNegotiationRoute)}>
                      <Sparkles size={12} className="mr-1.5" />
                      Open Strategy
                    </GlassButton>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Unlocked next</div>
            <div className="mt-3 text-sm font-medium text-white/80">{stageActions.nextActionLabel}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-white/48">
              Available now: {stageActions.unlocked.join(' • ')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onResumeSession(reopenSessionId)}>
                <BriefcaseBusiness size={12} className="mr-1.5" />
                Reopen Tailored Work
              </GlassButton>
              {activeStage === 'interviewing' && (
                <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(interviewPrepRoute)}>
                  <Mic size={12} className="mr-1.5" />
                  Open Interview Lab
                </GlassButton>
              )}
              {activeStage === 'offer' && (
                <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(salaryNegotiationRoute)}>
                  <Sparkles size={12} className="mr-1.5" />
                  Open Salary Negotiation
                </GlassButton>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/40">
            <Clock3 size={12} />
            Stage history
          </div>
          <div className="mt-4 space-y-3">
            {stageHistory.map((entry, index) => {
              const stage = isPipelineStage(entry.stage) ? entry.stage : activeStage;
              return (
                <div key={`${entry.stage}-${entry.at}-${index}`} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-[#98b3ff]/70" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white/78">{stageLabel(stage)}</div>
                    <div className="mt-1 text-[12px] text-white/42">
                      {new Date(entry.at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {application?.next_action && (
            <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/10 p-3">
              <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Next action</div>
              <p className="mt-2 text-sm text-white/74">{application.next_action}</p>
              {application.next_action_due && (
                <p className="mt-1 text-[12px] text-white/42">
                  Due {new Date(application.next_action_due).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
