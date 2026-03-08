import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Search,
  MapPin,
  Building2,
  DollarSign,
  Star,
  Copy,
  Check,
  FileText,
  Settings2,
  Briefcase,
  Loader2,
  AlertCircle,
  RotateCcw,
  Plus,
  Trash2,
  BarChart3,
  Sparkles,
  ArrowRight,
  Clock,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useJobTracker, type ApplicationInputItem } from '@/hooks/useJobTracker';
import { useJobFinder, type RankedMatch, type BooleanSearch } from '@/hooks/useJobFinder';
import { useApplicationPipeline, type PipelineStage, type Application, type DueAction } from '@/hooks/useApplicationPipeline';

import { PipelineSummary } from './PipelineSummary';
import type { CareerIQRoom } from './Sidebar';

interface JobCommandCenterRoomProps {
  onNavigate: (route: string) => void;
  onNavigateRoom?: (room: CareerIQRoom) => void;
}

// --- Stage config ---

const KANBAN_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'saved', label: 'Saved', color: 'text-white/50' },
  { key: 'researching', label: 'Researching', color: 'text-[#98b3ff]' },
  { key: 'applied', label: 'Applied', color: 'text-[#dfc797]' },
  { key: 'screening', label: 'Screening', color: 'text-[#dfc797]' },
  { key: 'interviewing', label: 'Interviewing', color: 'text-[#b5dec2]' },
  { key: 'offer', label: 'Offer', color: 'text-[#b5dec2]' },
];

const STAGE_DOT: Record<PipelineStage, string> = {
  saved: 'bg-white/30',
  researching: 'bg-[#98b3ff]/60',
  applied: 'bg-[#dfc797]/60',
  screening: 'bg-[#dfc797]/80',
  interviewing: 'bg-[#b5dec2]/60',
  offer: 'bg-[#b5dec2]/80',
  closed_won: 'bg-[#b5dec2]',
  closed_lost: 'bg-red-400/50',
};

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
  activityMessages: { id: string; text: string; stage: string; timestamp: number }[];
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
          <h3 className="text-[15px] font-semibold text-white/85">Job Finder Error</h3>
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
          <h3 className="text-[15px] font-semibold text-white/85">
            {status === 'connecting' ? 'Connecting...' : 'Finding Matches'}
          </h3>
        </div>
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {activityMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-[12px]">
              <span className="text-white/20 tabular-nums flex-shrink-0">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="text-white/50">{msg.text}</span>
            </div>
          ))}
          {activityMessages.length === 0 && (
            <p className="text-[12px] text-white/30">Initializing search...</p>
          )}
        </div>
      </GlassCard>
    );
  }

  if (status === 'gate' && gateData) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star size={18} className="text-[#dfc797]" />
          <h3 className="text-[15px] font-semibold text-white/85">Review Results</h3>
          <span className="ml-auto text-[11px] text-white/30">Action required</span>
        </div>
        <p className="text-[12px] text-white/40 mb-4">
          The Job Finder has completed its search. Approve the results to save them to your pipeline.
        </p>
        <div className="flex gap-2">
          <GlassButton
            onClick={() => onRespondGate({ approved: true })}
            className="flex-1"
          >
            <CheckCircle2 size={14} className="text-[#b5dec2]" /> Approve Results
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
          <h3 className="text-[15px] font-semibold text-white/85">Smart Matches</h3>
        </div>
        <p className="text-[12px] text-white/35 mb-4">
          AI-curated roles matched to your Why-Me story. Run the Job Finder to discover your best
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
        <h3 className="text-[15px] font-semibold text-white/85">Smart Matches</h3>
        <span className="ml-auto text-[11px] text-white/30">{matches.length} roles found</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-white/25 hover:text-white/45 transition-colors ml-2"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="space-y-3">
        {matches.map((job) => (
          <div
            key={job.id}
            className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
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
                      : 'bg-white/[0.04] border border-white/[0.08]',
                )}
              >
                <div
                  className={cn(
                    'text-[16px] font-bold tabular-nums',
                    job.fit_score >= 90
                      ? 'text-[#b5dec2]'
                      : job.fit_score >= 80
                        ? 'text-[#98b3ff]'
                        : 'text-white/50',
                  )}
                >
                  {job.fit_score}
                </div>
                <div className="text-[9px] text-white/30 uppercase">match</div>
              </div>

              {/* Job details */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-white/80 group-hover:text-white/90 transition-colors">
                  {job.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[12px] text-white/40 flex-wrap">
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
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-white/25">
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
                  onClick={() => onNavigate('cover-letter')}
                  className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                >
                  <FileText size={11} />
                  Cover Letter
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- BooleanSearchBuilder ---

function BooleanSearchBuilder({ searches, onGenerate }: { searches: BooleanSearch[]; onGenerate: () => void }) {
  const [copied, setCopied] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Search size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Boolean Search Builder</h3>
      </div>
      <p className="text-[12px] text-white/35 mb-4">
        AI-generated search strings optimized for each platform. Based on your Why-Me story and
        target roles.
      </p>

      {searches.length === 0 ? (
        <GlassButton onClick={onGenerate} className="w-full">
          <Search size={14} /> Generate Searches
        </GlassButton>
      ) : (
        <div className="space-y-3">
          {searches.map((search, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-white/60">{search.platform}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(search.query, i)}
                  className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/55 transition-colors"
                >
                  {copied === i ? (
                    <>
                      <Check size={11} className="text-[#b5dec2]" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={11} /> Copy
                    </>
                  )}
                </button>
              </div>
              <code className="text-[11px] text-white/40 leading-relaxed block break-all font-mono">
                {search.query}
              </code>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// --- KanbanBoard ---

function KanbanCard({
  application,
  onMoveStage,
  onPrepInterview,
  onNegotiateSalary,
}: {
  application: Application;
  onMoveStage: (id: string, stage: PipelineStage) => void;
  onPrepInterview?: (application: Application) => void;
  onNegotiateSalary?: (application: Application) => void;
}) {
  const [showStageMenu, setShowStageMenu] = useState(false);

  const activeStages = KANBAN_STAGES.filter((s) => s.key !== application.stage);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] hover:border-white/[0.08] transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white/75 truncate">{application.role_title}</div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-white/35">
            <Building2 size={10} />
            {application.company_name}
          </div>
          {application.next_action && (
            <div className="mt-1.5 text-[11px] text-[#98b3ff]/50 truncate">
              {application.next_action}
            </div>
          )}
          {application.stage === 'interviewing' && onPrepInterview && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPrepInterview(application); }}
              className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[#b5dec2]/70 hover:text-[#b5dec2] transition-colors"
            >
              <Mic size={10} />
              Prep for Interview
            </button>
          )}
          {application.stage === 'offer' && onNegotiateSalary && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNegotiateSalary(application); }}
              className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[#b5dec2]/70 hover:text-[#b5dec2] transition-colors"
            >
              <DollarSign size={10} />
              Negotiate Salary
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {application.score != null && (
            <span
              className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                application.score >= 80
                  ? 'bg-[#b5dec2]/10 text-[#b5dec2]'
                  : application.score >= 60
                    ? 'bg-[#98b3ff]/10 text-[#98b3ff]'
                    : 'bg-white/[0.05] text-white/35',
              )}
            >
              {application.score}
            </span>
          )}

          {/* Stage mover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStageMenu((v) => !v)}
              className="flex items-center gap-0.5 text-white/25 hover:text-white/50 transition-colors"
              aria-label="Move to stage"
            >
              <ChevronDown size={13} />
            </button>
            {showStageMenu && (
              <div className="absolute right-0 top-full mt-1 z-10 rounded-xl border border-white/[0.08] bg-[#0e0e14] shadow-xl py-1 min-w-[130px]">
                {activeStages.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      onMoveStage(application.id, s.key);
                      setShowStageMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-white/55 hover:text-white/80 hover:bg-white/[0.04] transition-colors flex items-center gap-2"
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STAGE_DOT[s.key])} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanBoard({
  applications,
  loading,
  onMoveStage,
  onAddApplication,
  onPrepInterview,
  onNegotiateSalary,
}: {
  applications: Application[];
  loading: boolean;
  onMoveStage: (id: string, stage: PipelineStage) => void;
  onAddApplication: () => void;
  onPrepInterview?: (application: Application) => void;
  onNegotiateSalary?: (application: Application) => void;
}) {
  const byStage = (stage: PipelineStage) => applications.filter((a) => a.stage === stage);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Application Pipeline</h3>
        {loading && <Loader2 size={14} className="text-[#98b3ff] animate-spin ml-1" />}
        <button
          type="button"
          onClick={onAddApplication}
          className="ml-auto flex items-center gap-1 text-[11px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
        >
          <Plus size={12} /> Add Application
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto">
        {KANBAN_STAGES.map(({ key, label, color }) => {
          const cards = byStage(key);
          return (
            <div key={key} className="min-w-[160px]">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={cn('h-2 w-2 rounded-full flex-shrink-0', STAGE_DOT[key])} />
                <span className={cn('text-[11px] font-semibold uppercase tracking-wider', color)}>
                  {label}
                </span>
                <span className="text-[10px] text-white/25 tabular-nums ml-auto">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((app) => (
                  <KanbanCard key={app.id} application={app} onMoveStage={onMoveStage} onPrepInterview={onPrepInterview} onNegotiateSalary={onNegotiateSalary} />
                ))}
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/[0.05] bg-white/[0.01] p-3 text-center">
                    <span className="text-[11px] text-white/20">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- DailyOps ---

function urgencyClass(dueDateStr: string): string {
  const due = new Date(dueDateStr);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'text-red-400/70 border-red-400/20 bg-red-400/[0.04]';
  if (diffDays < 1) return 'text-[#dfc797]/70 border-[#dfc797]/20 bg-[#dfc797]/[0.04]';
  return 'text-white/50 border-white/[0.06] bg-white/[0.02]';
}

function DailyOps({ dueActions }: { dueActions: DueAction[] }) {
  if (dueActions.length === 0) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Daily Ops</h3>
        </div>
        <p className="text-[12px] text-white/30 text-center py-4">No upcoming actions due.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Daily Ops</h3>
        <span className="ml-auto text-[11px] text-white/30">{dueActions.length} due</span>
      </div>

      <div className="space-y-2">
        {dueActions.map((action) => {
          const cls = urgencyClass(action.next_action_due);
          const dueDate = new Date(action.next_action_due);
          const isDueToday =
            dueDate.toDateString() === new Date().toDateString();
          const isPast = dueDate < new Date();
          const dueLabelClass = isPast
            ? 'text-red-400/70'
            : isDueToday
              ? 'text-[#dfc797]/70'
              : 'text-white/30';

          return (
            <div
              key={action.id}
              className={cn('rounded-xl border p-3 transition-colors', cls)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white/75">
                    {action.next_action}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-white/35">
                    <Building2 size={10} />
                    {action.company_name}
                    <span>·</span>
                    <span className="truncate">{action.role_title}</span>
                  </div>
                </div>
                <div className={cn('text-[11px] font-medium flex-shrink-0 tabular-nums', dueLabelClass)}>
                  {isPast
                    ? 'Overdue'
                    : isDueToday
                      ? 'Today'
                      : dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- SearchPreferences (unchanged, local state only) ---

interface SearchPrefs {
  titles: string;
  locations: string;
  salaryMin: string;
  remote: 'any' | 'remote' | 'hybrid' | 'onsite';
}

function SearchPreferences() {
  const [prefs, setPrefs] = useState<SearchPrefs>(() => {
    try {
      const saved = localStorage.getItem('careeriq_search_prefs');
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return {
      titles: 'VP Operations, Director Supply Chain, COO',
      locations: 'Remote, Chicago, Minneapolis',
      salaryMin: '170000',
      remote: 'any',
    };
  });

  const handleChange = (field: keyof SearchPrefs, value: string) => {
    const updated = { ...prefs, [field]: value };
    setPrefs(updated);
    try {
      localStorage.setItem('careeriq_search_prefs', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Search Preferences</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
            Target Titles
          </label>
          <input
            type="text"
            value={prefs.titles}
            onChange={(e) => handleChange('titles', e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
            Locations
          </label>
          <input
            type="text"
            value={prefs.locations}
            onChange={(e) => handleChange('locations', e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Min Salary
            </label>
            <input
              type="text"
              value={prefs.salaryMin}
              onChange={(e) => handleChange('salaryMin', e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Work Type
            </label>
            <select
              value={prefs.remote}
              onChange={(e) => handleChange('remote', e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 focus:outline-none focus:border-[#98b3ff]/30"
            >
              <option value="any">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// --- Tracker Generator (unchanged) ---

const EMPTY_APP: ApplicationInputItem = {
  company: '',
  role: '',
  date_applied: new Date().toISOString().split('T')[0],
  jd_text: '',
  status: 'applied',
};

function TrackerGenerator() {
  const tracker = useJobTracker();
  const [resumeText, setResumeText] = useState('');
  const [applications, setApplications] = useState<ApplicationInputItem[]>([{ ...EMPTY_APP }]);
  const [copied, setCopied] = useState(false);

  const updateApp = useCallback(
    (index: number, field: keyof ApplicationInputItem, value: string) => {
      setApplications((prev) =>
        prev.map((app, i) => (i === index ? { ...app, [field]: value } : app)),
      );
    },
    [],
  );

  const addApp = useCallback(() => {
    setApplications((prev) => [...prev, { ...EMPTY_APP }]);
  }, []);

  const removeApp = useCallback((index: number) => {
    setApplications((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }, []);

  const canStart =
    resumeText.trim().length >= 50 &&
    applications.every((a) => a.company.trim() && a.role.trim() && a.jd_text.trim().length >= 50);

  const handleStart = useCallback(async () => {
    if (!canStart) return;
    await tracker.startPipeline({ resumeText, applications });
  }, [canStart, tracker, resumeText, applications]);

  const handleCopyReport = useCallback(() => {
    if (tracker.report) {
      navigator.clipboard.writeText(tracker.report).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [tracker.report]);

  const handleReset = useCallback(() => {
    tracker.reset();
    setResumeText('');
    setApplications([{ ...EMPTY_APP }]);
    setCopied(false);
  }, [tracker]);

  if (tracker.status === 'idle') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Application Tracker</h3>
        </div>
        <p className="text-[12px] text-white/35 mb-4">
          Analyze your job applications, score fit, and generate personalized follow-up messages.
        </p>

        <div className="mb-4">
          <label
            htmlFor="tracker-resume"
            className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block"
          >
            Resume Text
          </label>
          <textarea
            id="tracker-resume"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30 min-h-[80px] resize-y"
            rows={3}
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] text-white/40 uppercase tracking-wider">
              Applications
            </label>
            <button
              type="button"
              onClick={addApp}
              className="flex items-center gap-1 text-[11px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
            >
              <Plus size={12} /> Add Application
            </button>
          </div>

          <div className="space-y-3">
            {applications.map((app, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/30">Application {i + 1}</span>
                  {applications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeApp(i)}
                      className="text-white/20 hover:text-red-400/60 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id={`app-company-${i}`}
                    aria-label={`Application ${i + 1} company`}
                    value={app.company}
                    onChange={(e) => updateApp(i, 'company', e.target.value)}
                    placeholder="Company"
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
                  />
                  <input
                    id={`app-role-${i}`}
                    aria-label={`Application ${i + 1} role`}
                    value={app.role}
                    onChange={(e) => updateApp(i, 'role', e.target.value)}
                    placeholder="Role Title"
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id={`app-date-${i}`}
                    aria-label={`Application ${i + 1} date applied`}
                    type="date"
                    value={app.date_applied}
                    onChange={(e) => updateApp(i, 'date_applied', e.target.value)}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 focus:outline-none focus:border-[#98b3ff]/30"
                  />
                  <select
                    id={`app-status-${i}`}
                    aria-label={`Application ${i + 1} status`}
                    value={app.status}
                    onChange={(e) => updateApp(i, 'status', e.target.value)}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 focus:outline-none focus:border-[#98b3ff]/30"
                  >
                    <option value="applied">Applied</option>
                    <option value="followed_up">Followed Up</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offered">Offered</option>
                    <option value="rejected">Rejected</option>
                    <option value="ghosted">No Response</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </div>
                <input
                  id={`app-contact-${i}`}
                  aria-label={`Application ${i + 1} contact name`}
                  value={app.contact_name ?? ''}
                  onChange={(e) => updateApp(i, 'contact_name', e.target.value)}
                  placeholder="Contact name (optional)"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
                />
                <textarea
                  id={`app-jd-${i}`}
                  aria-label={`Application ${i + 1} job description`}
                  value={app.jd_text}
                  onChange={(e) => updateApp(i, 'jd_text', e.target.value)}
                  placeholder="Paste job description here..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30 min-h-[60px] resize-y"
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>

        <GlassButton onClick={handleStart} disabled={!canStart} className="w-full">
          <BarChart3 size={14} />
          Analyze {applications.length} Application{applications.length !== 1 ? 's' : ''}
        </GlassButton>
      </GlassCard>
    );
  }

  if (tracker.status === 'connecting' || tracker.status === 'running') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={18} className="text-[#98b3ff] animate-spin" />
          <h3 className="text-[15px] font-semibold text-white/85">
            {tracker.status === 'connecting'
              ? 'Connecting...'
              : `Analyzing — ${tracker.currentStage ?? 'processing'}`}
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {tracker.activityMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-[12px]">
              <span className="text-white/20 tabular-nums flex-shrink-0">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="text-white/50">{msg.text}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  if (tracker.status === 'error') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={18} className="text-red-400/70" />
          <h3 className="text-[15px] font-semibold text-white/85">Error</h3>
        </div>
        <p className="text-[12px] text-red-400/60 mb-4">{tracker.error}</p>
        <GlassButton onClick={handleReset} className="w-full">
          <RotateCcw size={14} /> Try Again
        </GlassButton>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-[#b5dec2]" />
          <h3 className="text-[15px] font-semibold text-white/85">Tracker Report</h3>
        </div>
        <div className="flex items-center gap-2">
          {tracker.qualityScore != null && (
            <span
              className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full',
                tracker.qualityScore >= 80
                  ? 'bg-[#b5dec2]/10 text-[#b5dec2]'
                  : tracker.qualityScore >= 60
                    ? 'bg-[#98b3ff]/10 text-[#98b3ff]'
                    : 'bg-white/[0.06] text-white/40',
              )}
            >
              Quality: {tracker.qualityScore}/100
            </span>
          )}
          <span className="text-[11px] text-white/30">
            {tracker.applicationCount ?? 0} apps · {tracker.followUpCount ?? 0} follow-ups
          </span>
        </div>
      </div>

      {tracker.report && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-4 max-h-[500px] overflow-y-auto">
          <pre className="text-[12px] text-white/60 whitespace-pre-wrap font-sans leading-relaxed">
            {tracker.report}
          </pre>
        </div>
      )}

      <div className="flex gap-2">
        <GlassButton onClick={handleCopyReport} className="flex-1">
          {copied ? (
            <>
              <Check size={14} className="text-[#b5dec2]" /> Copied
            </>
          ) : (
            <>
              <Copy size={14} /> Copy Report
            </>
          )}
        </GlassButton>
        <GlassButton onClick={handleReset}>
          <RotateCcw size={14} /> New Analysis
        </GlassButton>
      </div>
    </GlassCard>
  );
}

// --- Main component ---

export function JobCommandCenterRoom({ onNavigate, onNavigateRoom }: JobCommandCenterRoomProps) {
  const jobFinder = useJobFinder();
  const pipeline = useApplicationPipeline();

  const handleAddApplication = useCallback(() => {
    // Placeholder — opens a modal or navigates to a form in a future story
    pipeline.createApplication({
      role_title: 'New Role',
      company_name: 'Company',
      stage: 'saved',
      source: 'manual',
      stage_history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }, [pipeline]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-white/90">Job Command Center</h1>
        <p className="text-[13px] text-white/40">
          AI-surfaced roles matching your Why-Me story, smart search tools, and pipeline management.
        </p>
      </div>

      {/* Job Finder — Smart Matches */}
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

      {/* Application Kanban Board — full width */}
      <KanbanBoard
        applications={pipeline.applications}
        loading={pipeline.loading}
        onMoveStage={pipeline.moveToStage}
        onAddApplication={handleAddApplication}
        onPrepInterview={onNavigateRoom ? () => onNavigateRoom('interview') : undefined}
        onNegotiateSalary={onNavigateRoom ? () => onNavigateRoom('salary-negotiation') : undefined}
      />

      {/* Pipeline Summary — full width */}
      <PipelineSummary onNavigateDashboard={onNavigateRoom} />

      {/* Daily Ops + Boolean Search side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[2] min-w-0">
          <DailyOps dueActions={pipeline.dueActions} />
        </div>
        <div className="flex-[3] min-w-0">
          <BooleanSearchBuilder
            searches={jobFinder.booleanSearches}
            onGenerate={jobFinder.startSearch}
          />
        </div>
      </div>

      {/* Search Preferences */}
      <SearchPreferences />

      {/* Application Tracker Generator */}
      <TrackerGenerator />
    </div>
  );
}
