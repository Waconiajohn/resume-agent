import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Search,
  MapPin,
  Building2,
  DollarSign,
  Star,
  FileText,
  Loader2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  XCircle,
  Briefcase,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RESUME_BUILDER_SESSION_ROUTE } from '@/lib/app-routing';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useJobFinder, type RankedMatch } from '@/hooks/useJobFinder';
import { useApplicationPipeline, type PipelineStage } from '@/hooks/useApplicationPipeline';
import { useRadarSearch } from '@/hooks/useRadarSearch';
import { useDailyOps } from '@/hooks/useDailyOps';
import { useWatchlist } from '@/hooks/useWatchlist';
import { PipelineBoard } from '@/components/job-command-center/PipelineBoard';
import { AddOpportunityDialog } from '@/components/job-command-center/AddOpportunityDialog';
import { PipelineFilters } from '@/components/job-command-center/PipelineFilters';
import { RadarSection } from '@/components/job-command-center/RadarSection';
import { WatchlistBar } from '@/components/job-command-center/WatchlistBar';
import { WatchlistManager } from '@/components/job-command-center/WatchlistManager';
import { DailyOpsSection } from '@/components/job-command-center/DailyOpsSection';

import { PipelineSummary } from './PipelineSummary';
import type { CareerIQRoom } from './Sidebar';

interface JobCommandCenterRoomProps {
  onNavigate: (route: string) => void;
  onNavigateRoom?: (room: CareerIQRoom) => void;
}

// --- SmartMatches ---

function SmartMatches({
  matches,
  status,
  activityMessages,
  gateData,
  error,
  onNavigate,
  onRunFinder,
  onRespondGate,
  onReset,
}: {
  matches: RankedMatch[];
  status: string;
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  gateData: { topics?: unknown; results?: unknown } | null;
  error: string | null;
  onNavigate: (route: string) => void;
  onRunFinder: () => void;
  onRespondGate: (response: unknown) => void;
  onReset: () => void;
}) {
  if (status === 'error') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={18} className="text-red-400/70" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Job Finder Error</h3>
        </div>
        <p className="text-[12px] text-red-400/60 mb-4">{error}</p>
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
          <Loader2 size={18} className="text-[#98b3ff] animate-spin" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">
            {status === 'connecting' ? 'Connecting...' : 'Finding Matches'}
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
          <Star size={18} className="text-[#f0d99f]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Review Matches</h3>
          <span className="ml-auto text-[13px] text-[var(--text-soft)]">Action required</span>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] mb-4">
          The Job Finder has finished. Save these matches if they are worth working from Today and Pipeline.
        </p>
        <div className="flex gap-2">
          <GlassButton
            onClick={() => onRespondGate({ approved: true })}
            className="flex-1"
          >
            <CheckCircle2 size={14} className="text-[#b5dec2]" /> Save Matches
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
          <Star size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Smart Matches</h3>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] mb-4">
          AI-curated roles matched to your Career Profile. Run the Job Finder to discover your best
          opportunities.
        </p>
        <GlassButton onClick={onRunFinder} className="w-full">
          <Sparkles size={14} /> Run Job Finder
        </GlassButton>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Smart Matches</h3>
        <span className="ml-auto text-[13px] text-[var(--text-soft)]">{matches.length} roles found</span>
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
                    ? 'bg-[#b5dec2]/10 border border-[#b5dec2]/20'
                    : job.fit_score >= 80
                      ? 'bg-[#98b3ff]/10 border border-[#98b3ff]/20'
                      : 'bg-[var(--accent-muted)] border border-[var(--line-soft)]',
                )}
              >
                <div
                  className={cn(
                    'text-[16px] font-bold tabular-nums',
                    job.fit_score >= 90
                      ? 'text-[#b5dec2]'
                      : job.fit_score >= 80
                        ? 'text-[#98b3ff]'
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
                    {job.posted_date && <span>{job.posted_date}</span>}
                    {job.posted_date && job.work_type && <span>·</span>}
                    {job.work_type && <span className="capitalize">{job.work_type}</span>}
                  </div>
                )}
                <div className="mt-2 text-[12px] text-[#98b3ff]/50 italic leading-relaxed">
                  <Sparkles size={10} className="inline mr-1 -mt-0.5" />
                  {job.why_match}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate(RESUME_BUILDER_SESSION_ROUTE)}
                  className="flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-muted)] transition-colors"
                >
                  <FileText size={11} />
                  Resume + Letter
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

type JCCTab = 'pipeline' | 'radar' | 'daily-ops';

type JCCStageConfig = {
  label: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
  workflowLabel: string;
  focusTitle: string;
  focusSummary: string;
  next: {
    tab: JCCTab;
    label: string;
    description: string;
  };
};

const JCC_STAGE_CONFIG: Record<JCCTab, JCCStageConfig> = {
  'daily-ops': {
    label: 'Today',
    icon: Clock,
    workflowLabel: 'Today',
    focusTitle: 'Work the active list first',
    focusSummary: 'Use Today for follow-ups, urgent actions, and the small set of roles that actually need your attention right now.',
    next: {
      tab: 'radar',
      label: 'Discover',
      description: 'Open Discover when you want fresh roles or search support instead of more follow-up work.',
    },
  },
  radar: {
    label: 'Discover',
    icon: Search,
    workflowLabel: 'Discover',
    focusTitle: 'Find new roles worth working',
    focusSummary: 'Use Radar and Smart Matches when you need net-new options worth promoting into the pipeline.',
    next: {
      tab: 'pipeline',
      label: 'Pipeline',
      description: 'Move the strong roles into Pipeline once they are worth tracking and advancing.',
    },
  },
  pipeline: {
    label: 'Pipeline',
    icon: Briefcase,
    workflowLabel: 'Pipeline',
    focusTitle: 'Review the full application portfolio',
    focusSummary: 'Use Pipeline when you want the complete board, stage movement, and a broader read on what is moving or getting stuck.',
    next: {
      tab: 'daily-ops',
      label: 'Back to Today',
      description: 'Return to Today when you are ready to work the next concrete actions on the active list.',
    },
  },
};

const JCC_WORKFLOW_ORDER: JCCTab[] = ['daily-ops', 'radar', 'pipeline'];

// --- Main component ---

export function JobCommandCenterRoom({
  onNavigate,
  onNavigateRoom,
}: JobCommandCenterRoomProps) {
  const jobFinder = useJobFinder();
  const pipeline = useApplicationPipeline();
  const radar = useRadarSearch();
  const watchlist = useWatchlist();
  const dailyOps = useDailyOps(pipeline.applications, pipeline.dueActions, radar.jobs, pipeline.loading);

  const [activeTab, setActiveTab] = useState<JCCTab>('daily-ops');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showWatchlistManager, setShowWatchlistManager] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | 'all'>('all');
  const activeStage = JCC_STAGE_CONFIG[activeTab];
  const ActiveStageIcon = activeStage.icon;

  // Load initial data on mount
  useEffect(() => {
    pipeline.fetchApplications();
    pipeline.fetchDueActions();
    watchlist.fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        stage_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    },
    [pipeline],
  );

  const handleSearchCompany = useCallback(
    (companyName: string) => {
      radar.search(companyName, '');
    },
    [radar],
  );

  const handlePromoteRadarJob = useCallback(
    async (job: ReturnType<typeof radar.promoteJob>) => {
      await pipeline.createApplication({
        role_title: job.title,
        company_name: job.company,
        stage: 'saved',
        source: job.source ?? 'radar',
        url: job.apply_url ?? undefined,
        notes: job.location ?? undefined,
        stage_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      radar.dismissJob(job.external_id);
    },
    [pipeline, radar],
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
          <h1 className="room-title">Run the search from one working surface</h1>
          <p className="room-subtitle">
            Start in Today for active work. Use Discover when you want new options, and Pipeline when you want the full list.
          </p>
        </div>
      </div>

      <GlassCard className="p-5">
        <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr,1fr]">
          <div>
            <div className="eyebrow-label">Job workflow</div>
            <h2 className="text-[17px] font-semibold text-[var(--text-strong)]">
              Stay on daily work, open discovery when you need new options, and use the pipeline for the full board.
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
              This room works best when Today stays the home base, Discover stays focused on new opportunities, and Pipeline stays focused on stage movement and full-list review.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {JCC_WORKFLOW_ORDER.map((tab, index) => {
                const stage = JCC_STAGE_CONFIG[tab];
                return (
                  <span
                    key={tab}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium',
                      activeTab === tab
                        ? 'border-[#98b3ff]/30 bg-[#98b3ff]/[0.08] text-[#98b3ff]'
                        : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]',
                    )}
                  >
                    <span className="tabular-nums opacity-80">{index + 1}</span>
                    {stage.workflowLabel}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Current focus
            </div>
            <div className="mt-2 flex items-center gap-2 text-[14px] font-semibold text-[var(--text-strong)]">
              <ActiveStageIcon size={15} className="text-[#98b3ff]" />
              {activeStage.focusTitle}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
              {activeStage.focusSummary}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-[12px] text-[var(--text-soft)]">
              <span>Watchlist: <strong className="text-[var(--text-muted)]">{watchlist.companies.length}</strong></span>
              <span>Pipeline: <strong className="text-[var(--text-muted)]">{pipeline.applications.length}</strong></span>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Next best move
            </div>
            <div className="mt-2 text-[14px] font-semibold text-[var(--text-strong)]">
              {activeStage.next.label}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
              {activeStage.next.description}
            </p>
            {activeTab !== activeStage.next.tab && (
              <div className="mt-4">
                <GlassButton variant="ghost" onClick={() => setActiveTab(activeStage.next.tab)}>
                  {activeStage.next.label}
                </GlassButton>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      <div className="rail-tabs">
        {JCC_WORKFLOW_ORDER.map((id) => {
          const { label, icon: Icon } = JCC_STAGE_CONFIG[id];
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
          <WatchlistBar
            companies={watchlist.companies}
            onSearchCompany={handleSearchCompany}
            onManage={() => setShowWatchlistManager(true)}
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
            onSelect={() => {}}
            onAddApplication={handleAddApplication}
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

          <PipelineSummary onNavigateDashboard={onNavigateRoom} />
        </div>
      </div>

      {/* Radar tab — display:none preserves state */}
      <div style={{ display: activeTab === 'radar' ? undefined : 'none' }}>
        <div className="flex flex-col gap-6">
          <WatchlistBar
            companies={watchlist.companies}
            onSearchCompany={handleSearchCompany}
            onManage={() => setShowWatchlistManager(true)}
          />

          <RadarSection
            jobs={radar.jobs}
            loading={radar.loading}
            scoring={radar.scoring}
            error={radar.error}
            lastScanId={radar.lastScanId}
            sources_queried={radar.sources_queried}
            executionTimeMs={radar.executionTimeMs}
            onSearch={radar.search}
            onScoreResults={radar.scoreResults}
            onDismiss={radar.dismissJob}
            onPromote={handlePromoteRadarJob}
          />

          <SmartMatches
            matches={jobFinder.matches}
            status={jobFinder.status}
            activityMessages={jobFinder.activityMessages}
            gateData={jobFinder.gateData}
            error={jobFinder.error}
            onNavigate={onNavigate}
            onRunFinder={jobFinder.startSearch}
            onRespondGate={jobFinder.respondToGate}
            onReset={jobFinder.reset}
          />
        </div>
      </div>

      {/* Daily Ops tab — display:none preserves state */}
      <div style={{ display: activeTab === 'daily-ops' ? undefined : 'none' }}>
        <div className="flex flex-col gap-6">
          <DailyOpsSection
            data={dailyOps}
            onPromoteJob={handlePromoteRadarJob}
            onDismissJob={radar.dismissJob}
          />
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
