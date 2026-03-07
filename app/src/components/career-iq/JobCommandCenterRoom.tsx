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
  ArrowRight,
  Sparkles,
  FileText,
  Settings2,
  Briefcase,
  Loader2,
  AlertCircle,
  RotateCcw,
  Plus,
  Trash2,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useJobTracker, type ApplicationInputItem } from '@/hooks/useJobTracker';

import { PipelineSummary } from './PipelineSummary';
import type { CareerIQRoom } from './Sidebar';

interface JobCommandCenterRoomProps {
  onNavigate: (route: string) => void;
  onNavigateRoom?: (room: CareerIQRoom) => void;
}

// --- Mock data ---

interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  whyMatch: string;
  salary: string;
  posted: string;
  type: 'remote' | 'hybrid' | 'onsite';
}

const MOCK_MATCHES: JobMatch[] = [
  { id: '1', title: 'VP of Supply Chain Operations', company: 'Medtronic', location: 'Minneapolis, MN', matchScore: 94, whyMatch: 'Your turnaround experience directly matches their need to restructure a $2B supply chain.', salary: '$185K-$220K', posted: '2 days ago', type: 'hybrid' },
  { id: '2', title: 'Senior Director, Operations', company: 'Abbott Labs', location: 'Chicago, IL', matchScore: 91, whyMatch: 'Your manufacturing optimization expertise aligns with their cost reduction initiative.', salary: '$170K-$210K', posted: '3 days ago', type: 'onsite' },
  { id: '3', title: 'Chief Operating Officer', company: 'Precision Castparts', location: 'Portland, OR', matchScore: 87, whyMatch: 'Your plant turnaround track record is exactly what they need for their underperforming division.', salary: '$200K-$280K', posted: '1 day ago', type: 'onsite' },
  { id: '4', title: 'VP Manufacturing & Supply Chain', company: 'Honeywell', location: 'Charlotte, NC', matchScore: 85, whyMatch: 'Your cross-functional leadership experience maps to their integrated operations role.', salary: '$175K-$225K', posted: '5 days ago', type: 'hybrid' },
  { id: '5', title: 'Director of Operational Excellence', company: 'Johnson Controls', location: 'Remote', matchScore: 82, whyMatch: 'Your lean transformation work is a strong fit for their continuous improvement mandate.', salary: '$155K-$190K', posted: '1 week ago', type: 'remote' },
  { id: '6', title: 'SVP Operations', company: 'Parker Hannifin', location: 'Cleveland, OH', matchScore: 79, whyMatch: 'Your multi-site management experience matches their 12-facility portfolio.', salary: '$190K-$250K', posted: '4 days ago', type: 'onsite' },
];

const MOCK_BOOLEAN_SEARCHES = [
  { platform: 'LinkedIn', query: '"VP Operations" OR "Vice President Operations" OR "Director Supply Chain" OR "Head of Manufacturing" OR "COO" (supply chain OR operations OR manufacturing OR lean) -intern -entry', },
  { platform: 'Indeed', query: 'title:("VP Operations" OR "Director Operations" OR "SVP Operations") AND ("supply chain" OR "manufacturing" OR "lean")' },
  { platform: 'Google', query: 'site:linkedin.com/jobs "VP Operations" OR "Director Supply Chain" "turnaround" OR "transformation" -entry -intern' },
];

interface SearchPrefs {
  titles: string;
  locations: string;
  salaryMin: string;
  remote: 'any' | 'remote' | 'hybrid' | 'onsite';
}

// --- Components ---

function SmartMatches({ onNavigate }: { onNavigate: (route: string) => void }) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Smart Matches</h3>
        <span className="ml-auto text-[11px] text-white/30">{MOCK_MATCHES.length} roles found</span>
      </div>

      <div className="space-y-3">
        {MOCK_MATCHES.map((job) => (
          <div
            key={job.id}
            className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
          >
            <div className="flex items-start gap-3">
              {/* Match score */}
              <div className={cn(
                'rounded-lg px-2 py-1.5 text-center flex-shrink-0',
                job.matchScore >= 90 ? 'bg-[#b5dec2]/10 border border-[#b5dec2]/20' :
                job.matchScore >= 80 ? 'bg-[#98b3ff]/10 border border-[#98b3ff]/20' :
                'bg-white/[0.04] border border-white/[0.08]',
              )}>
                <div className={cn(
                  'text-[16px] font-bold tabular-nums',
                  job.matchScore >= 90 ? 'text-[#b5dec2]' :
                  job.matchScore >= 80 ? 'text-[#98b3ff]' :
                  'text-white/50',
                )}>
                  {job.matchScore}
                </div>
                <div className="text-[9px] text-white/30 uppercase">match</div>
              </div>

              {/* Job details */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-white/80 group-hover:text-white/90 transition-colors">
                  {job.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[12px] text-white/40">
                  <span className="flex items-center gap-1"><Building2 size={11} />{job.company}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><DollarSign size={11} />{job.salary}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-white/25">
                  <span>{job.posted}</span>
                  <span>·</span>
                  <span className="capitalize">{job.type}</span>
                </div>
                <div className="mt-2 text-[12px] text-[#98b3ff]/50 italic leading-relaxed">
                  <Sparkles size={10} className="inline mr-1 -mt-0.5" />
                  {job.whyMatch}
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

function BooleanSearchBuilder() {
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
        AI-generated search strings optimized for each platform. Based on your Why-Me story and target roles.
      </p>

      <div className="space-y-3">
        {MOCK_BOOLEAN_SEARCHES.map((search, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-white/60">{search.platform}</span>
              <button
                type="button"
                onClick={() => handleCopy(search.query, i)}
                className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/55 transition-colors"
              >
                {copied === i ? <><Check size={11} className="text-[#b5dec2]" /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
            <code className="text-[11px] text-white/40 leading-relaxed block break-all font-mono">
              {search.query}
            </code>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function SearchPreferences() {
  const [prefs, setPrefs] = useState<SearchPrefs>(() => {
    try {
      const saved = localStorage.getItem('careeriq_search_prefs');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { titles: 'VP Operations, Director Supply Chain, COO', locations: 'Remote, Chicago, Minneapolis', salaryMin: '170000', remote: 'any' };
  });

  const handleChange = (field: keyof SearchPrefs, value: string) => {
    const updated = { ...prefs, [field]: value };
    setPrefs(updated);
    try { localStorage.setItem('careeriq_search_prefs', JSON.stringify(updated)); } catch { /* ignore */ }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Search Preferences</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">Target Titles</label>
          <input
            type="text"
            value={prefs.titles}
            onChange={(e) => handleChange('titles', e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">Locations</label>
          <input
            type="text"
            value={prefs.locations}
            onChange={(e) => handleChange('locations', e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">Min Salary</label>
            <input
              type="text"
              value={prefs.salaryMin}
              onChange={(e) => handleChange('salaryMin', e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">Work Type</label>
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

// --- Tracker Generator ---

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

  const updateApp = useCallback((index: number, field: keyof ApplicationInputItem, value: string) => {
    setApplications((prev) => prev.map((app, i) => i === index ? { ...app, [field]: value } : app));
  }, []);

  const addApp = useCallback(() => {
    setApplications((prev) => [...prev, { ...EMPTY_APP }]);
  }, []);

  const removeApp = useCallback((index: number) => {
    setApplications((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }, []);

  const canStart = resumeText.trim().length >= 50 &&
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

  // ─── Idle: Input form ────────────────────────────────────────
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

        {/* Resume */}
        <div className="mb-4">
          <label htmlFor="tracker-resume" className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">Resume Text</label>
          <textarea
            id="tracker-resume"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30 min-h-[80px] resize-y"
            rows={3}
          />
        </div>

        {/* Applications */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] text-white/40 uppercase tracking-wider">Applications</label>
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
              <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
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

        <GlassButton
          onClick={handleStart}
          disabled={!canStart}
          className="w-full"
        >
          <BarChart3 size={14} />
          Analyze {applications.length} Application{applications.length !== 1 ? 's' : ''}
        </GlassButton>
      </GlassCard>
    );
  }

  // ─── Running: Activity feed ──────────────────────────────────
  if (tracker.status === 'connecting' || tracker.status === 'running') {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={18} className="text-[#98b3ff] animate-spin" />
          <h3 className="text-[15px] font-semibold text-white/85">
            {tracker.status === 'connecting' ? 'Connecting...' : `Analyzing — ${tracker.currentStage ?? 'processing'}`}
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {tracker.activityMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-[12px]">
              <span className="text-white/20 tabular-nums flex-shrink-0">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-white/50">{msg.text}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  // ─── Error ───────────────────────────────────────────────────
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

  // ─── Complete: Report ────────────────────────────────────────
  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-[#b5dec2]" />
          <h3 className="text-[15px] font-semibold text-white/85">Tracker Report</h3>
        </div>
        <div className="flex items-center gap-2">
          {tracker.qualityScore != null && (
            <span className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-full',
              tracker.qualityScore >= 80 ? 'bg-[#b5dec2]/10 text-[#b5dec2]' :
              tracker.qualityScore >= 60 ? 'bg-[#98b3ff]/10 text-[#98b3ff]' :
              'bg-white/[0.06] text-white/40',
            )}>
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
          {copied ? <><Check size={14} className="text-[#b5dec2]" /> Copied</> : <><Copy size={14} /> Copy Report</>}
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
  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-white/90">Job Command Center</h1>
        <p className="text-[13px] text-white/40">
          AI-surfaced roles matching your Why-Me story, smart search tools, and pipeline management.
        </p>
      </div>

      {/* Application Tracker — full width */}
      <TrackerGenerator />

      {/* Smart Matches — full width */}
      <SmartMatches onNavigate={onNavigate} />

      {/* Pipeline Summary — full width */}
      <PipelineSummary onNavigateDashboard={onNavigateRoom} />

      {/* Boolean Search + Search Preferences side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <BooleanSearchBuilder />
        </div>
        <div className="flex-[2]">
          <SearchPreferences />
        </div>
      </div>
    </div>
  );
}
