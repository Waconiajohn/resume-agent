import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Search,
  Star,
  MapPin,
  Building2,
  DollarSign,
  Loader2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  XCircle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RESUME_BUILDER_SESSION_ROUTE } from '@/lib/app-routing';
import { trackProductEvent } from '@/lib/product-telemetry';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useJobFinder, type RankedMatch, type JobEvaluation } from '@/hooks/useJobFinder';
import { useApplicationPipeline, type PipelineStage } from '@/hooks/useJobApplications';
import { useRadarSearch } from '@/hooks/useRadarSearch';
import type { RadarJob } from '@/hooks/useRadarSearch';
import { useDailyOps } from '@/hooks/useDailyOps';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useAuth } from '@/hooks/useAuth';
import { useJobFilters } from '@/hooks/useJobFilters';
import { JobFilterPanel } from '@/components/shared/JobFilterPanel';
import { PipelineBoard } from '@/components/job-command-center/PipelineBoard';
import { AddOpportunityDialog } from '@/components/job-command-center/AddOpportunityDialog';
import { PipelineFilters } from '@/components/job-command-center/PipelineFilters';
import { RadarSection } from '@/components/job-command-center/RadarSection';
import { WatchlistBar } from '@/components/job-command-center/WatchlistBar';
import { WatchlistManager } from '@/components/job-command-center/WatchlistManager';
import { DailyOpsSection } from '@/components/job-command-center/DailyOpsSection';
import { BooleanSearchPanel } from '@/components/job-command-center/BooleanSearchPanel';
import { formatJobAgeLabel } from '@/components/job-command-center/job-age';
import { useLatestMasterResumeText } from './useLatestMasterResumeText';

import type { CareerIQRoom } from './Sidebar';

interface JobCommandCenterRoomProps {
  onNavigate: (route: string) => void;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  initialFocus?: string | null;
}

// --- JobEvaluationCard ---

const VERDICT_STYLES: Record<
  JobEvaluation['verdict']['decision'],
  { label: string; className: string; dotClass: string }
> = {
  APPLY_NOW: {
    label: 'Apply Now',
    className: 'bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20 text-[var(--badge-green-text)]',
    dotClass: 'bg-[var(--badge-green-text)]',
  },
  WORTH_A_CONVERSATION: {
    label: 'Worth a Conversation',
    className: 'bg-[var(--link)]/10 border-[var(--link)]/20 text-[var(--link)]',
    dotClass: 'bg-[var(--link)]',
  },
  DEPRIORITIZE: {
    label: 'Deprioritize',
    className: 'bg-[var(--text-soft)]/10 border-[var(--line-soft)] text-[var(--text-soft)]',
    dotClass: 'bg-[var(--text-soft)]',
  },
};

const FIT_CHECK_STYLES: Record<
  JobEvaluation['fit_check']['rating'],
  string
> = {
  STRONG_FIT: 'text-[var(--badge-green-text)]',
  STRETCH: 'text-[var(--badge-amber-text)]',
  MISMATCH: 'text-[var(--text-soft)]',
};

function JobEvaluationCard({ evaluation }: { evaluation: JobEvaluation }) {
  const [expanded, setExpanded] = useState(false);
  const verdict = VERDICT_STYLES[evaluation.verdict.decision];
  const fitStyle = FIT_CHECK_STYLES[evaluation.fit_check.rating];

  return (
    <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)]/40 overflow-hidden">
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent-muted)] transition-colors"
      >
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
            verdict.className,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', verdict.dotClass)} />
          {verdict.label}
        </span>
        <span className="text-[12px] text-[var(--text-soft)] flex-1 text-left truncate">
          {evaluation.verdict.reasoning}
        </span>
        {expanded ? (
          <ChevronUp size={12} className="text-[var(--text-soft)] flex-shrink-0" />
        ) : (
          <ChevronDown size={12} className="text-[var(--text-soft)] flex-shrink-0" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--line-soft)]">
          {/* Fit check */}
          <div className="pt-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Fit Check
              </span>
              <span className={cn('text-[11px] font-semibold uppercase', fitStyle)}>
                {evaluation.fit_check.rating.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">
              {evaluation.fit_check.reasoning}
            </p>
          </div>

          {/* Gap assessment */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Gap Assessment
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase',
                  evaluation.gap_assessment.bridgeable
                    ? 'text-[var(--badge-green-text)]'
                    : 'text-[var(--badge-amber-text)]',
                )}
              >
                {evaluation.gap_assessment.bridgeable ? 'Bridgeable' : 'Hard gap'}
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">
              {evaluation.gap_assessment.summary}
            </p>
          </div>

          {/* Red flags */}
          {evaluation.red_flags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle size={11} className="text-[var(--badge-amber-text)]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--badge-amber-text)]">
                  Red Flags
                </span>
              </div>
              <ul className="space-y-1">
                {evaluation.red_flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-[var(--text-soft)]">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-[var(--badge-amber-text)]/60 flex-shrink-0" />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- SmartMatches ---

function SmartMatches({
  matches,
  status,
  activityMessages,
  gateData,
  error,
  onNavigate,
  onRequestSuggestions,
  onBuildResume,
  onRespondGate,
  onReset,
}: {
  matches: RankedMatch[];
  status: string;
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  gateData: { topics?: unknown; results?: unknown } | null;
  error: string | null;
  onNavigate: (route: string) => void;
  onRequestSuggestions: () => void;
  onBuildResume: (job: RankedMatch) => void;
  onRespondGate: (response: unknown) => void;
  onReset: () => void;
}) {
  if (status === 'error') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={18} className="text-[var(--badge-red-text)]/70" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Suggestion Search Error</h3>
        </div>
        <p className="text-[12px] text-[var(--badge-red-text)]/60 mb-4">{error}</p>
        <GlassButton onClick={onReset} className="w-full">
          <RotateCcw size={14} /> Try Again
        </GlassButton>
      </GlassCard>
    );
  }

  if (status === 'connecting' || status === 'running') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={18} className="text-[var(--link)] animate-spin" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">
            {status === 'connecting' ? 'Connecting...' : 'Finding Suggestions'}
          </h3>
        </div>
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {activityMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-[12px]">
              <span className="text-[var(--text-soft)] tabular-nums flex-shrink-0">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="text-[var(--text-soft)]">{msg.message}</span>
            </div>
          ))}
          {activityMessages.length === 0 && (
            <p className="text-[12px] text-[var(--text-soft)]">Initializing search...</p>
          )}
        </div>
      </GlassCard>
    );
  }

  if (status === 'gate' && gateData) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star size={18} className="text-[var(--badge-amber-text)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Review More Suggestions</h3>
          <span className="ml-auto text-[13px] text-[var(--text-soft)]">Action required</span>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] mb-4">
          The suggestion pass is finished. Save the strong ones to your shortlist if they are worth working next.
        </p>
        <div className="flex gap-2">
          <GlassButton
            onClick={() => onRespondGate({ approved: true })}
            className="flex-1"
          >
            <CheckCircle2 size={14} className="text-[var(--badge-green-text)]" /> Save Suggestions
          </GlassButton>
          <GlassButton
            onClick={() => onRespondGate({ approved: false })}
          >
            <XCircle size={14} /> Dismiss
          </GlassButton>
        </div>
      </GlassCard>
    );
  }

  if (matches.length === 0) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star size={18} className="text-[var(--link)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">More Role Ideas</h3>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] mb-4">
          Optional: surface a few extra roles that look strong against your profile, then decide whether they belong in your shortlist.
        </p>
        <GlassButton onClick={onRequestSuggestions} className="w-full">
          <Sparkles size={14} /> Get More Suggestions
        </GlassButton>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-[var(--link)]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">More Role Ideas</h3>
        <span className="ml-auto text-[13px] text-[var(--text-soft)]">{matches.length} suggestions</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors ml-2"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="space-y-3">
        {matches.map((job) => (
          <div
            key={job.id}
            className="group rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 hover:bg-[var(--accent-muted)] hover:border-[var(--line-soft)] transition-all"
          >
            <div className="flex items-start gap-3">
              {/* Match score */}
              <div
                className={cn(
                  'rounded-lg px-2 py-1.5 text-center flex-shrink-0',
                  job.fit_score >= 90
                    ? 'bg-[var(--badge-green-text)]/10 border border-[var(--badge-green-text)]/20'
                    : job.fit_score >= 80
                      ? 'bg-[var(--link)]/10 border border-[var(--link)]/20'
                      : 'bg-[var(--accent-muted)] border border-[var(--line-soft)]',
                )}
              >
                <div
                  className={cn(
                    'text-[16px] font-bold tabular-nums',
                    job.fit_score >= 90
                      ? 'text-[var(--badge-green-text)]'
                      : job.fit_score >= 80
                        ? 'text-[var(--link)]'
                        : 'text-[var(--text-soft)]',
                  )}
                >
                  {job.fit_score}
                </div>
                <div className="text-[12px] text-[var(--text-soft)] uppercase">match</div>
              </div>

              {/* Job details */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[var(--text-strong)] group-hover:text-[var(--text-strong)] transition-colors">
                  {job.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--text-soft)] flex-wrap">
                  <span className="flex items-center gap-1">
                    <Building2 size={11} />
                    {job.company}
                  </span>
                  {job.location && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {job.location}
                      </span>
                    </>
                  )}
                  {job.salary_range && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <DollarSign size={11} />
                        {job.salary_range}
                      </span>
                    </>
                  )}
                </div>
                {(job.posted_date || job.work_type) && (
                  <div className="flex items-center gap-2 mt-1 text-[13px] text-[var(--text-soft)]">
                    {job.posted_date && <span>{formatJobAgeLabel(job.posted_date) ?? job.posted_date}</span>}
                    {job.posted_date && job.work_type && <span>·</span>}
                    {job.work_type && <span className="capitalize">{job.work_type}</span>}
                  </div>
                )}
                <div className="mt-2 text-[12px] text-[var(--link)]/50 italic leading-relaxed">
                  <Sparkles size={10} className="inline mr-1 -mt-0.5" />
                  {job.why_match}
                </div>
                {job.evaluation && (
                  <JobEvaluationCard evaluation={job.evaluation} />
                )}
                {!job.evaluation && (
                  <div className="mt-2 text-[12px] text-[var(--text-soft)]">
                    Save the worthwhile ones to your shortlist, then come back to build resumes for them.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onBuildResume(job);
                    onNavigate(RESUME_BUILDER_SESSION_ROUTE);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-muted)] transition-colors"
                >
                  Build Resume
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// DailyOps is now rendered via DailyOpsSection (imported above)

// --- Tab types ---

type JCCTab = 'board' | 'pipeline';

const JCC_TABS: Array<{
  id: JCCTab;
  label: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
}> = [
  { id: 'board', label: 'Job Board', icon: Search },
  { id: 'pipeline', label: 'Board', icon: Briefcase },
];

// --- Main component ---

export function JobCommandCenterRoom({
  onNavigate,
  onNavigateRoom,
  initialFocus = null,
}: JobCommandCenterRoomProps) {
  const { session, loading: authLoading } = useAuth();
  const { resumeText: masterResumeText, loading: loadingMasterResume } = useLatestMasterResumeText();
  const jobFinder = useJobFinder();
  const pipeline = useApplicationPipeline();
  const radar = useRadarSearch();
  const watchlist = useWatchlist();
  const dailyOps = useDailyOps(pipeline.applications, pipeline.dueActions, pipeline.loading);
  const {
    filters: jobFilters,
    setLocation: setJobFilterLocation,
    setRadiusMiles: setJobFilterRadius,
    setWorkModes: setJobFilterWorkModes,
    setPostedWithin: setJobFilterPostedWithin,
  } = useJobFilters('main-job-filters');

  const [activeTab, setActiveTab] = useState<JCCTab>('board');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showWatchlistManager, setShowWatchlistManager] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | 'all'>('all');

  useEffect(() => {
    if (initialFocus === 'pipeline' || initialFocus === 'needs-attention') {
      setActiveTab('pipeline');
      return;
    }
    if (initialFocus === 'shortlist') {
      setActiveTab('pipeline');
      setStageFilter('saved');
      return;
    }
    if (initialFocus === 'board' || initialFocus === 'job-board') {
      setActiveTab('board');
      setStageFilter('all');
    }
  }, [initialFocus]);

  useEffect(() => {
    if (authLoading) return;

    if (!session?.access_token) {
      pipeline.clear();
      watchlist.clear();
      radar.reset();
      jobFinder.reset();
      setShowAiSuggestions(false);
      return;
    }

    void pipeline.refresh();
    void watchlist.refresh();
  }, [
    authLoading,
    jobFinder.reset,
    pipeline.clear,
    pipeline.refresh,
    radar.reset,
    session?.access_token,
    watchlist.clear,
    watchlist.refresh,
  ]);

  useEffect(() => {
    if (
      jobFinder.status !== 'idle' ||
      jobFinder.matches.length > 0 ||
      jobFinder.error
    ) {
      setShowAiSuggestions(true);
    }
  }, [jobFinder.error, jobFinder.matches.length, jobFinder.status]);

  const handleAddApplication = useCallback(() => {
    setShowAddDialog(true);
  }, []);

  const handleAddSubmit = useCallback(
    async (data: {
      role_title: string;
      company_name: string;
      source?: string;
      url?: string;
      notes?: string;
    }) => {
      await pipeline.createApplication({
        role_title: data.role_title,
        company_name: data.company_name,
        stage: 'saved',
        source: data.source ?? 'manual',
        url: data.url,
        notes: data.notes,
      });
    },
    [pipeline],
  );

  const handleSearchCompany = useCallback(
    (companyName: string) => {
      const remoteType =
        jobFilters.workModes.remote && !jobFilters.workModes.hybrid && !jobFilters.workModes.onsite
          ? 'remote'
          : jobFilters.workModes.hybrid && !jobFilters.workModes.remote && !jobFilters.workModes.onsite
            ? 'hybrid'
            : jobFilters.workModes.onsite && !jobFilters.workModes.remote && !jobFilters.workModes.hybrid
              ? 'onsite'
              : 'any';
      trackProductEvent('job_board_search_run', {
        query: companyName,
        location: jobFilters.location || null,
        date_posted: jobFilters.postedWithin,
        remote_type: remoteType,
        source: 'watchlist',
      });
      radar.search(companyName, jobFilters.location, {
        datePosted: jobFilters.postedWithin,
        remoteType,
      });
    },
    [jobFilters, radar],
  );

  const handlePromoteRadarJob = useCallback(
    async (job: RadarJob) => {
      trackProductEvent('job_saved_to_shortlist', {
        source: 'job_board',
        company_name: job.company,
        role_title: job.title,
        has_apply_url: Boolean(job.apply_url),
        job_source: job.source ?? null,
      });
      await pipeline.createApplication({
        role_title: job.title,
        company_name: job.company,
        stage: 'saved',
        source: job.source ?? 'radar',
        url: job.apply_url ?? undefined,
        location: job.location ?? undefined,
      });
      radar.dismissJob(job.external_id);
    },
    [pipeline, radar],
  );

  const handleRequestMoreSuggestions = useCallback(() => {
    trackProductEvent('more_role_suggestions_requested', { source: 'suggestions_card' });
    void jobFinder.startSearch();
  }, [jobFinder]);

  const handleBuildResumeRequest = useCallback(
    (
      source: 'job_board' | 'pipeline' | 'suggestions',
      roleTitle: string | null = null,
      companyName: string | null = null,
    ) => {
      trackProductEvent('job_resume_build_requested', {
        source,
        company_name: companyName,
        role_title: roleTitle,
      });
      onNavigate(RESUME_BUILDER_SESSION_ROUTE);
    },
    [onNavigate],
  );

  const filteredApplications = useMemo(() => {
    let apps = pipeline.applications;
    if (stageFilter !== 'all') {
      apps = apps.filter((a) => a.stage === stageFilter);
    }
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      apps = apps.filter(
        (a) =>
          a.role_title.toLowerCase().includes(lower) ||
          a.company_name.toLowerCase().includes(lower),
      );
    }
    return apps;
  }, [pipeline.applications, stageFilter, searchText]);

  return (
    <div className="room-shell">
      <div className="room-header">
        <div className="room-header-copy">
          <div className="eyebrow-label">Job Search</div>
          <h1 className="room-title">One job board, one shortlist, one board for your applications</h1>
          <p className="room-subtitle">
            Search public jobs here, save the best few to your shortlist, and work the real opportunities on the Board. The first-degree-connection company scans stay separate in Insider Jobs.
          </p>
        </div>
      </div>

      <div className="rail-tabs">
        {JCC_TABS.map(({ id, label, icon: Icon }) => {
          return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className="rail-tab"
            data-active={activeTab === id}
          >
            <Icon size={14} />
            {label}
          </button>
          );
        })}
      </div>

      {/* Pipeline tab — display:none preserves state */}
      <div style={{ display: activeTab === 'pipeline' ? undefined : 'none' }}>
        <div className="flex flex-col gap-6">
          <DailyOpsSection
            data={dailyOps}
            title="Needs Attention"
            subtitle="Work follow-ups, stale opportunities, and anything else that already belongs inside your live pipeline."
          />

          <PipelineFilters
            searchText={searchText}
            onSearchChange={setSearchText}
            activeStageFilter={stageFilter}
            onStageFilterChange={setStageFilter}
          />

          <PipelineBoard
            applications={filteredApplications}
            loading={pipeline.loading}
            onMoveStage={pipeline.moveToStage}
            onAddApplication={handleAddApplication}
            onBuildResume={() => handleBuildResumeRequest('pipeline')}
            onPrepInterview={onNavigateRoom ? () => onNavigateRoom('interview') : undefined}
            onNegotiateSalary={(application) => {
              const params = new URLSearchParams({
                room: 'interview',
                focus: 'negotiation',
                job: application.id,
                company: application.company_name,
                role: application.role_title,
              });
              onNavigate(`/workspace?${params.toString()}`);
            }}
          />
        </div>
      </div>

      {/* Job Board tab — display:none preserves state */}
      <div style={{ display: activeTab === 'board' ? undefined : 'none' }}>
        <div className="flex flex-col gap-6">
          <WatchlistBar
            companies={watchlist.companies}
            onSearchCompany={handleSearchCompany}
            onManage={() => setShowWatchlistManager(true)}
            description="Click a company to search public jobs from the board."
          />

          <JobFilterPanel
            location={jobFilters.location}
            onLocationChange={setJobFilterLocation}
            radiusMiles={jobFilters.radiusMiles}
            onRadiusMilesChange={setJobFilterRadius}
            workModes={jobFilters.workModes}
            onWorkModesChange={setJobFilterWorkModes}
            postedWithin={jobFilters.postedWithin}
            onPostedWithinChange={setJobFilterPostedWithin}
          />

          <RadarSection
            jobs={radar.jobs}
            loading={radar.loading}
            error={radar.error}
            onSearch={radar.search}
            onDismiss={radar.dismissJob}
            onPromote={handlePromoteRadarJob}
            onBuildResume={(job) => handleBuildResumeRequest('job_board', job.title, job.company)}
            initialLocation={jobFilters.location}
            initialRemoteType={
              jobFilters.workModes.remote && !jobFilters.workModes.hybrid && !jobFilters.workModes.onsite
                ? 'remote'
                : jobFilters.workModes.hybrid && !jobFilters.workModes.remote && !jobFilters.workModes.onsite
                  ? 'hybrid'
                  : jobFilters.workModes.onsite && !jobFilters.workModes.remote && !jobFilters.workModes.hybrid
                    ? 'onsite'
                    : 'any'
            }
          />

          {(showAiSuggestions || jobFinder.status !== 'idle' || jobFinder.matches.length > 0 || jobFinder.error) && (
            <div className="flex flex-col gap-3">
              {jobFinder.status === 'idle' && jobFinder.matches.length === 0 && !jobFinder.error && (
                <div className="flex justify-end">
                  <GlassButton variant="ghost" size="sm" onClick={() => setShowAiSuggestions(false)}>
                    Hide Suggestions
                  </GlassButton>
                </div>
              )}
              <SmartMatches
                matches={jobFinder.matches}
                status={jobFinder.status}
                activityMessages={jobFinder.activityMessages}
                gateData={jobFinder.gateData}
                error={jobFinder.error}
                onNavigate={onNavigate}
                onRequestSuggestions={handleRequestMoreSuggestions}
                onBuildResume={(job) => handleBuildResumeRequest('suggestions', job.title, job.company)}
                onRespondGate={jobFinder.respondToGate}
                onReset={jobFinder.reset}
              />
            </div>
          )}

          {/* Boolean Search — power user tool for external boards, collapsed by default */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors list-none flex items-center gap-1.5">
              <span className="text-xs transition-transform group-open:rotate-90" aria-hidden="true">▶</span>
              Generate search strings for external job boards (LinkedIn, Indeed, Google)
            </summary>
            <div className="mt-3">
              <BooleanSearchPanel
                accessToken={session?.access_token ?? null}
                resumeText={masterResumeText}
                loadingResume={loadingMasterResume}
                onShowAiSuggestions={() => setShowAiSuggestions(true)}
              />
            </div>
          </details>
        </div>
      </div>

      <AddOpportunityDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={handleAddSubmit}
      />

      <WatchlistManager
        open={showWatchlistManager}
        companies={watchlist.companies}
        onClose={() => setShowWatchlistManager(false)}
        onAdd={watchlist.addCompany}
        onUpdate={watchlist.updateCompany}
        onRemove={watchlist.removeCompany}
      />
    </div>
  );
}
