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
  Loader2,
  AlertCircle,
  RotateCcw,
  Plus,
  Trash2,
  BarChart3,
  Sparkles,
  CheckCircle2,
  XCircle,
  Briefcase,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useJobTracker, type ApplicationInputItem } from '@/hooks/useJobTracker';
import { useJobFinder, type RankedMatch, type BooleanSearch } from '@/hooks/useJobFinder';
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
                  onClick={() => onNavigate('/resume-builder/session')}
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
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Search Strings</h3>
      </div>
      <p className="text-[12px] text-[var(--text-soft)] mb-4">
        AI-generated search strings for the sites you use when the main discovery view is not enough.
      </p>

      {searches.length === 0 ? (
        <GlassButton onClick={onGenerate} className="w-full">
          <Search size={14} /> Generate Searches
        </GlassButton>
      ) : (
        <div className="space-y-3">
          {searches.map((search, i) => (
            <div key={i} className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-[var(--text-soft)]">{search.platform}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(search.query, i)}
                  className="flex items-center gap-1 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
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
              <code className="text-[13px] text-[var(--text-soft)] leading-relaxed block break-all font-mono">
                {search.query}
              </code>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// DailyOps is now rendered via DailyOpsSection (imported above)

// --- SearchPreferences (unchanged, local state only) ---

interface SearchPrefs {
  titles: string;
  locations: string;
  salaryMin: string;
  remote: 'any' | 'remote' | 'hybrid' | 'onsite';
}

const DEFAULT_SEARCH_PREFS: SearchPrefs = {
  titles: 'VP Operations, Director Supply Chain, COO',
  locations: 'Remote, Chicago, Minneapolis',
  salaryMin: '170000',
  remote: 'any',
};

function isSearchPrefs(value: unknown): value is SearchPrefs {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.titles === 'string' &&
    typeof candidate.locations === 'string' &&
    typeof candidate.salaryMin === 'string' &&
    (candidate.remote === 'any' ||
      candidate.remote === 'remote' ||
      candidate.remote === 'hybrid' ||
      candidate.remote === 'onsite')
  );
}

function SearchPreferences() {
  const [prefs, setPrefs] = useState<SearchPrefs>(() => {
    try {
      const saved = localStorage.getItem('careeriq_search_prefs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isSearchPrefs(parsed)) {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_SEARCH_PREFS;
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
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Search Preferences</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider mb-1 block">
            Target Titles
          </label>
          <input
            type="text"
            value={prefs.titles}
            onChange={(e) => handleChange('titles', e.target.value)}
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />
        </div>
        <div>
          <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider mb-1 block">
            Locations
          </label>
          <input
            type="text"
            value={prefs.locations}
            onChange={(e) => handleChange('locations', e.target.value)}
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider mb-1 block">
              Min Salary
            </label>
            <input
              type="text"
              value={prefs.salaryMin}
              onChange={(e) => handleChange('salaryMin', e.target.value)}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
            />
          </div>
          <div className="flex-1">
            <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider mb-1 block">
              Work Type
            </label>
            <select
              value={prefs.remote}
              onChange={(e) => handleChange('remote', e.target.value)}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
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
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Application Tracker</h3>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] mb-4">
          Analyze your job applications, score fit, and generate personalized follow-up messages.
        </p>

        <div className="mb-4">
          <label
            htmlFor="tracker-resume"
            className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider mb-1 block"
          >
            Resume Text
          </label>
          <textarea
            id="tracker-resume"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30 min-h-[80px] resize-y"
            rows={3}
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider">
              Applications
            </label>
            <button
              type="button"
              onClick={addApp}
              className="flex items-center gap-1 text-[13px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
            >
              <Plus size={12} /> Add Application
            </button>
          </div>

          <div className="space-y-3">
            {applications.map((app, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-soft)]">Application {i + 1}</span>
                  {applications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeApp(i)}
                      className="text-[var(--text-soft)] hover:text-red-400/60 transition-colors"
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
                    className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
                  />
                  <input
                    id={`app-role-${i}`}
                    aria-label={`Application ${i + 1} role`}
                    value={app.role}
                    onChange={(e) => updateApp(i, 'role', e.target.value)}
                    placeholder="Role Title"
                    className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id={`app-date-${i}`}
                    aria-label={`Application ${i + 1} date applied`}
                    type="date"
                    value={app.date_applied}
                    onChange={(e) => updateApp(i, 'date_applied', e.target.value)}
                    className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
                  />
                  <select
                    id={`app-status-${i}`}
                    aria-label={`Application ${i + 1} status`}
                    value={app.status}
                    onChange={(e) => updateApp(i, 'status', e.target.value)}
                    className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
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
                  className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
                />
                <textarea
                  id={`app-jd-${i}`}
                  aria-label={`Application ${i + 1} job description`}
                  value={app.jd_text}
                  onChange={(e) => updateApp(i, 'jd_text', e.target.value)}
                  placeholder="Paste job description here..."
                  className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30 min-h-[60px] resize-y"
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
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">
            {tracker.status === 'connecting'
              ? 'Connecting...'
              : `Analyzing — ${tracker.currentStage ?? 'processing'}`}
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {tracker.activityMessages.map((msg) => (
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
        </div>
      </GlassCard>
    );
  }

  if (tracker.status === 'error') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={18} className="text-red-400/70" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Error</h3>
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
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Tracker Report</h3>
        </div>
        <div className="flex items-center gap-2">
          {tracker.qualityScore != null && (
            <span
              className={cn(
                'text-[13px] font-medium px-2 py-0.5 rounded-full',
                tracker.qualityScore >= 80
                  ? 'bg-[#b5dec2]/10 text-[#b5dec2]'
                  : tracker.qualityScore >= 60
                    ? 'bg-[#98b3ff]/10 text-[#98b3ff]'
                    : 'bg-[var(--accent-muted)] text-[var(--text-soft)]',
              )}
            >
              Tracker Score: {tracker.qualityScore}/100
            </span>
          )}
          <span className="text-[13px] text-[var(--text-soft)]">
            {tracker.applicationCount ?? 0} apps · {tracker.followUpCount ?? 0} follow-ups
          </span>
        </div>
      </div>

      {tracker.report && (
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 mb-4 max-h-[500px] overflow-y-auto">
          <pre className="text-[12px] text-[var(--text-soft)] whitespace-pre-wrap font-sans leading-relaxed">
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
          <RotateCcw size={14} /> Start Another Analysis
        </GlassButton>
      </div>
    </GlassCard>
  );
}

// --- Tab types ---

type JCCTab = 'pipeline' | 'radar' | 'daily-ops';

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
  const [showSearchPreferences, setShowSearchPreferences] = useState(false);
  const [showSearchTools, setShowSearchTools] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | 'all'>('all');

  // Load initial data on mount
  useEffect(() => {
    pipeline.fetchApplications();
    pipeline.fetchDueActions();
    watchlist.fetchCompanies();
    radar.loadLatestScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (jobFinder.booleanSearches.length > 0) {
      setShowSearchTools(true);
    }
  }, [jobFinder.booleanSearches.length]);

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

      <div className="room-meta-strip">
        <div className="room-meta-item">
          Default View
          <strong>Today</strong>
        </div>
        <div className="room-meta-item">
          Watchlist
          <strong>{watchlist.companies.length}</strong>
        </div>
        <div className="room-meta-item">
          Pipeline
          <strong>{pipeline.applications.length}</strong>
        </div>
      </div>

      <div className="room-frame">
        <div className="support-callout">
          <div className="text-sm font-semibold text-[var(--text-strong)]">Today is where daily work happens</div>
          <div className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          Start in Today for active work. Use Discover when you want new options, and Pipeline when you want the full list.
          </div>
          {activeTab !== 'daily-ops' && (
            <div className="mt-4">
              <GlassButton variant="ghost" onClick={() => setActiveTab('daily-ops')}>
                Back to Today
              </GlassButton>
            </div>
          )}
        </div>
      </div>

      <div className="rail-tabs">
        {(
          [
            { id: 'daily-ops', label: 'Today', Icon: Clock },
            { id: 'pipeline', label: 'Pipeline', Icon: Briefcase },
            { id: 'radar', label: 'Discover', Icon: Search },
          ] as const
        ).map(({ id, label, Icon }) => (
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
        ))}
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

          {showSearchTools ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-strong)]">Advanced search</div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                    Open these when you want more control over search strings and filters.
                  </div>
                </div>
                <GlassButton variant="ghost" onClick={() => setShowSearchTools(false)}>
                  Hide advanced search
                </GlassButton>
              </div>

              <BooleanSearchBuilder
                searches={jobFinder.booleanSearches}
                onGenerate={jobFinder.startSearch}
              />

              {showSearchPreferences ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-strong)]">Search filters</div>
                      <div className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                        Tune titles, locations, and work style here.
                      </div>
                    </div>
                    <GlassButton variant="ghost" onClick={() => setShowSearchPreferences(false)}>
                      Hide filters
                    </GlassButton>
                  </div>
                  <SearchPreferences />
                </div>
              ) : (
                <GlassCard className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-strong)]">Search filters</div>
                      <div className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                        Open this when you want to tune titles, locations, or work style.
                      </div>
                    </div>
                    <GlassButton variant="ghost" onClick={() => setShowSearchPreferences(true)}>
                      Open filters
                    </GlassButton>
                  </div>
                </GlassCard>
              )}
            </div>
          ) : (
            <GlassCard className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-strong)]">Advanced search</div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                    Open this when you want boolean strings or deeper search controls.
                  </div>
                </div>
                <GlassButton variant="ghost" onClick={() => setShowSearchTools(true)}>
                  Open advanced search
                </GlassButton>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Daily Ops tab — display:none preserves state */}
      <div style={{ display: activeTab === 'daily-ops' ? undefined : 'none' }}>
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-6 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-5 py-3 text-[13px]">
            <span className="text-[var(--text-soft)]">
              Active:{' '}
              <span className="font-semibold text-[var(--text-muted)]">{dailyOps.activeCount}</span>
            </span>
            <span className="text-[var(--text-soft)]">|</span>
            <span className="text-[var(--text-soft)]">
              Interviewing:{' '}
              <span className="font-semibold text-[#98b3ff]">{dailyOps.interviewCount}</span>
            </span>
            <span className="text-[var(--text-soft)]">|</span>
            <span className="text-[var(--text-soft)]">
              Offers:{' '}
              <span className="font-semibold text-[#b5dec2]">{dailyOps.offerCount}</span>
            </span>
            <span className="text-[var(--text-soft)]">|</span>
            <span className="text-[var(--text-soft)]">
              Due:{' '}
              <span
                className={cn(
                  'font-semibold',
                  dailyOps.dueActions.length > 0 ? 'text-[#f0d99f]' : 'text-[var(--text-muted)]',
                )}
              >
                {dailyOps.dueActions.length}
              </span>
            </span>
          </div>

          <DailyOpsSection
            data={dailyOps}
            onPromoteJob={handlePromoteRadarJob}
            onDismissJob={radar.dismissJob}
          />

          <TrackerGenerator />
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
