import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Users,
  UserCircle,
  MessageSquare,
  Send,
  Copy,
  Check,
  TrendingUp,
  Briefcase,
  Clock,
  ChevronDown,
  ChevronUp,
  Link2,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useNetworkingOutreach } from '@/hooks/useNetworkingOutreach';

// --- Mock data ---

type ContactRole = 'hiring_manager' | 'team_leader' | 'peer' | 'hr_recruiter';
type OutreachStatus = 'not_started' | 'messaged' | 'responded' | 'connected';

interface NetworkContact {
  id: string;
  name: string;
  title: string;
  company: string;
  role: ContactRole;
  connectionLevel: 1 | 2 | 3;
  outreachStatus: OutreachStatus;
  lastActivity?: string;
}

interface RuleOfFourGroup {
  applicationId: string;
  company: string;
  jobTitle: string;
  contacts: NetworkContact[];
}

interface Recruiter {
  id: string;
  name: string;
  firm: string;
  specialty: string;
  lastContact: string;
  status: 'active' | 'cold' | 'new';
}

const MOCK_RULE_OF_FOUR: RuleOfFourGroup[] = [
  {
    applicationId: '1',
    company: 'Medtronic',
    jobTitle: 'VP of Supply Chain Operations',
    contacts: [
      { id: 'c1', name: 'Sarah Chen', title: 'VP Engineering', company: 'Medtronic', role: 'hiring_manager', connectionLevel: 2, outreachStatus: 'messaged', lastActivity: 'Mar 4' },
      { id: 'c2', name: 'Marcus Rivera', title: 'Director, Supply Chain', company: 'Medtronic', role: 'team_leader', connectionLevel: 2, outreachStatus: 'responded', lastActivity: 'Mar 5' },
      { id: 'c3', name: 'Jennifer Walsh', title: 'Senior Manager, Operations', company: 'Medtronic', role: 'peer', connectionLevel: 3, outreachStatus: 'not_started' },
      { id: 'c4', name: 'David Park', title: 'Talent Acquisition Lead', company: 'Medtronic', role: 'hr_recruiter', connectionLevel: 2, outreachStatus: 'connected', lastActivity: 'Mar 3' },
    ],
  },
  {
    applicationId: '2',
    company: 'Abbott Labs',
    jobTitle: 'Senior Director, Operations',
    contacts: [
      { id: 'c5', name: 'Lisa Thompson', title: 'VP Operations', company: 'Abbott Labs', role: 'hiring_manager', connectionLevel: 3, outreachStatus: 'messaged', lastActivity: 'Mar 5' },
      { id: 'c6', name: 'Robert Kim', title: 'Director, Manufacturing', company: 'Abbott Labs', role: 'team_leader', connectionLevel: 2, outreachStatus: 'not_started' },
      { id: 'c7', name: 'Anna Petrov', title: 'Senior Director, Quality', company: 'Abbott Labs', role: 'peer', connectionLevel: 2, outreachStatus: 'not_started' },
      { id: 'c8', name: 'Michelle Garcia', title: 'HR Business Partner', company: 'Abbott Labs', role: 'hr_recruiter', connectionLevel: 3, outreachStatus: 'not_started' },
    ],
  },
];

const MOCK_TEMPLATES = [
  {
    name: 'Warm Introduction',
    description: 'For 2nd-degree connections where you share a mutual contact',
    template: `Hi [Name], I came across your profile while researching [Company]'s operations team. I noticed we're both connected to [Mutual Connection] — [he/she] speaks very highly of the team you've built. I'm exploring senior operations roles and would love to learn more about the culture and priorities at [Company]. Would you be open to a brief conversation?`,
  },
  {
    name: 'Direct Outreach',
    description: 'For hiring managers or team leads with no mutual connection',
    template: `Hi [Name], I'm reaching out because I'm genuinely impressed by [Company]'s [recent initiative/news]. As someone who has led [relevant experience — e.g., "three plant turnarounds totaling $40M+ in recovered margin"], I'm very interested in the [Job Title] role. I'd value the chance to learn more about your team's priorities. Would you have 15 minutes for a quick call?`,
  },
  {
    name: 'Follow-Up',
    description: 'For contacts who haven\'t responded after 5-7 days',
    template: `Hi [Name], I wanted to follow up on my message from last week. I understand you're busy — I'll keep this brief. I'm particularly interested in [Company] because of [specific reason]. If now isn't the right time to connect, I completely understand. Either way, I wish you and the team continued success.`,
  },
  {
    name: 'Recruiter Introduction',
    description: 'For executive recruiters and staffing firm contacts',
    template: `Hi [Name], I'm a senior operations executive with 20+ years leading supply chain transformations in [industry]. I'm currently exploring VP/Director-level opportunities and wanted to introduce myself in case you're working on any relevant searches. I've attached a brief summary of my background. Happy to send my full resume if there's a fit. What's the best way to stay on your radar?`,
  },
];

const MOCK_RECRUITERS: Recruiter[] = [
  { id: 'r1', name: 'James Morrison', firm: 'Spencer Stuart', specialty: 'C-Suite & VP Operations', lastContact: 'Mar 2', status: 'active' },
  { id: 'r2', name: 'Patricia Lane', firm: 'Korn Ferry', specialty: 'Supply Chain & Manufacturing', lastContact: 'Feb 25', status: 'active' },
  { id: 'r3', name: 'Thomas Wright', firm: 'Heidrick & Struggles', specialty: 'Industrial Operations', lastContact: 'Feb 10', status: 'cold' },
  { id: 'r4', name: 'Karen Mitchell', firm: 'Lucas Group', specialty: 'Operations & Engineering', lastContact: 'New', status: 'new' },
];

const MOCK_METRICS = [
  { label: 'Messages Sent', value: '12', change: '+4', period: 'this week' },
  { label: 'Responses', value: '5', change: '+2', period: 'this week' },
  { label: 'Connections Made', value: '3', change: '+1', period: 'this week' },
];

// --- Components ---

const ROLE_LABELS: Record<ContactRole, string> = {
  hiring_manager: 'Hiring Manager',
  team_leader: 'Team Leader',
  peer: 'Peer',
  hr_recruiter: 'HR / Recruiter',
};

const STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'text-white/30 bg-white/[0.04]' },
  messaged: { label: 'Messaged', color: 'text-[#98b3ff] bg-[#98b3ff]/10' },
  responded: { label: 'Responded', color: 'text-[#dfc797] bg-[#dfc797]/10' },
  connected: { label: 'Connected', color: 'text-[#b5dec2] bg-[#b5dec2]/10' },
};

function RuleOfFourSection() {
  const [expandedGroup, setExpandedGroup] = useState<string>(MOCK_RULE_OF_FOUR[0]?.applicationId ?? '');

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Users size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Rule of Four</h3>
      </div>
      <p className="text-[12px] text-white/35 mb-4">
        For every application, reach out to 4 people at the target company. Networking bypasses the queue.
      </p>

      <div className="space-y-3">
        {MOCK_RULE_OF_FOUR.map((group) => {
          const isExpanded = expandedGroup === group.applicationId;
          const completedCount = group.contacts.filter((c) => c.outreachStatus !== 'not_started').length;
          return (
            <div key={group.applicationId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedGroup(isExpanded ? '' : group.applicationId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white/70">{group.company}</div>
                  <div className="text-[11px] text-white/35">{group.jobTitle}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn(
                    'text-[11px] font-medium',
                    completedCount === 4 ? 'text-[#b5dec2]' : completedCount > 0 ? 'text-[#dfc797]' : 'text-white/30',
                  )}>
                    {completedCount}/4
                  </span>
                  {isExpanded ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-white/[0.06] px-4 py-3 space-y-2.5">
                  {group.contacts.map((contact) => {
                    const status = STATUS_CONFIG[contact.outreachStatus];
                    return (
                      <div key={contact.id} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <UserCircle size={16} className="text-white/30" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-white/65">{contact.name}</span>
                            <span className="text-[10px] text-white/25">·</span>
                            <span className="text-[10px] text-white/25">{contact.connectionLevel === 1 ? '1st' : contact.connectionLevel === 2 ? '2nd' : '3rd'}</span>
                          </div>
                          <div className="text-[11px] text-white/35">{contact.title}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-white/20 uppercase tracking-wider">{ROLE_LABELS[contact.role]}</span>
                          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', status.color)}>
                            {status.label}
                          </span>
                        </div>
                        {contact.lastActivity && (
                          <span className="text-[10px] text-white/20 flex-shrink-0">{contact.lastActivity}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function OutreachTemplates() {
  const [copied, setCopied] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Outreach Templates</h3>
      </div>
      <p className="text-[12px] text-white/35 mb-4">
        Personalized messaging templates based on your Why-Me story. Copy, customize, and send.
      </p>

      <div className="space-y-2">
        {MOCK_TEMPLATES.map((tmpl, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <Send size={13} className="text-[#98b3ff]/60 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-white/65">{tmpl.name}</div>
                <div className="text-[11px] text-white/30">{tmpl.description}</div>
              </div>
              {expandedIndex === i ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
            </button>

            {expandedIndex === i && (
              <div className="border-t border-white/[0.06] px-4 py-3">
                <p className="text-[12px] text-white/50 leading-relaxed whitespace-pre-wrap mb-3">{tmpl.template}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(tmpl.template, i)}
                  className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
                >
                  {copied === i ? <><Check size={11} className="text-[#b5dec2]" /> Copied</> : <><Copy size={11} /> Copy Template</>}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function WeeklyActivity() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Weekly Activity</h3>
        <span className="ml-auto text-[11px] text-white/30">This week</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {MOCK_METRICS.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
            <div className="text-[22px] font-bold text-white/85 tabular-nums">{metric.value}</div>
            <div className="text-[11px] text-white/35 mt-0.5">{metric.label}</div>
            <div className="flex items-center justify-center gap-1 mt-2">
              <TrendingUp size={11} className="text-[#b5dec2]" />
              <span className="text-[11px] text-[#b5dec2]">{metric.change}</span>
              <span className="text-[10px] text-white/20">{metric.period}</span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function RecruiterTracker() {
  const statusColors: Record<string, string> = {
    active: 'text-[#b5dec2] bg-[#b5dec2]/10',
    cold: 'text-[#dfc797] bg-[#dfc797]/10',
    new: 'text-[#98b3ff] bg-[#98b3ff]/10',
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Recruiter Tracker</h3>
      </div>
      <p className="text-[12px] text-white/35 mb-4">
        Executive recruiters working in your space. Keep them warm — they source 30%+ of VP-level placements.
      </p>

      <div className="space-y-2.5">
        {MOCK_RECRUITERS.map((recruiter) => (
          <div key={recruiter.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white/40">
                {recruiter.name.split(' ').map((n) => n[0]).join('')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white/65">{recruiter.name}</div>
              <div className="text-[11px] text-white/35">{recruiter.firm} · {recruiter.specialty}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="flex items-center gap-1 text-[10px] text-white/25">
                <Clock size={10} />
                {recruiter.lastContact}
              </span>
              <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full capitalize', statusColors[recruiter.status])}>
                {recruiter.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- Outreach Generator (AI-powered) ---

function OutreachGenerator() {
  const outreach = useNetworkingOutreach();
  const [targetName, setTargetName] = useState('');
  const [targetTitle, setTargetTitle] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const [targetLinkedIn, setTargetLinkedIn] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(true);

  const canGenerate = targetName.trim() && targetTitle.trim() && targetCompany.trim() && resumeText.trim().length >= 50;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setShowForm(false);
    await outreach.startPipeline({
      resumeText,
      targetInput: {
        target_name: targetName.trim(),
        target_title: targetTitle.trim(),
        target_company: targetCompany.trim(),
        target_linkedin_url: targetLinkedIn.trim() || undefined,
        context_notes: contextNotes.trim() || undefined,
      },
    });
  }, [canGenerate, outreach.startPipeline, resumeText, targetName, targetTitle, targetCompany, targetLinkedIn, contextNotes]);

  const handleCopyReport = useCallback(() => {
    if (!outreach.report) return;
    navigator.clipboard.writeText(outreach.report).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [outreach.report]);

  const handleReset = useCallback(() => {
    outreach.reset();
    setShowForm(true);
  }, [outreach.reset]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">AI Outreach Generator</h3>
        {outreach.status !== 'idle' && outreach.status !== 'connecting' && (
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors"
          >
            <RotateCcw size={11} /> New Sequence
          </button>
        )}
      </div>
      <p className="text-[12px] text-white/35 mb-4">
        Generate a personalized LinkedIn outreach sequence for any target contact. Powered by your resume and positioning.
      </p>

      {/* Input form */}
      {showForm && outreach.status === 'idle' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Target name *"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Target title *"
              value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Target company *"
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="url"
              placeholder="LinkedIn URL (optional)"
              value={targetLinkedIn}
              onChange={(e) => setTargetLinkedIn(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Context notes (optional — shared events, mutual connections, etc.)"
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none"
            />
          </div>
          <textarea
            placeholder="Paste your resume text here * (minimum 50 characters)"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none resize-none"
          />
          <GlassButton
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full sm:w-auto"
          >
            <Sparkles size={14} />
            Generate Outreach Sequence
          </GlassButton>
        </div>
      )}

      {/* Running state */}
      {(outreach.status === 'connecting' || outreach.status === 'running') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-white/60">
            <Loader2 size={14} className="animate-spin text-[#98b3ff]" />
            <span>{outreach.currentStage === 'writing' ? 'Writing outreach messages...' : 'Researching target contact...'}</span>
          </div>
          {outreach.activityMessages.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
              {outreach.activityMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2 text-[11px]">
                  <span className="text-[#98b3ff]/40 font-mono shrink-0">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-white/40">{msg.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {outreach.status === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span className="text-[12px] text-red-300">{outreach.error}</span>
        </div>
      )}

      {/* Complete state — show report */}
      {outreach.status === 'complete' && outreach.report && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {outreach.qualityScore != null && (
              <span className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full',
                outreach.qualityScore >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' :
                outreach.qualityScore >= 60 ? 'text-[#dfc797] bg-[#dfc797]/10' :
                'text-red-400 bg-red-400/10',
              )}>
                Quality: {outreach.qualityScore}%
              </span>
            )}
            {outreach.messageCount != null && (
              <span className="text-[11px] text-white/30">{outreach.messageCount} messages</span>
            )}
            <button
              type="button"
              onClick={handleCopyReport}
              className="ml-auto flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
            >
              {copied ? <><Check size={11} className="text-[#b5dec2]" /> Copied</> : <><Copy size={11} /> Copy All</>}
            </button>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 max-h-[500px] overflow-y-auto">
            <pre className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap font-sans">
              {outreach.report}
            </pre>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// --- Main component ---

export function NetworkingHubRoom() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-white/90">Networking Hub</h1>
        <p className="text-[13px] text-white/40">
          Networking is your sales force. For every application, the Rule of Four gets you past the queue and in front of decision-makers.
        </p>
      </div>

      {/* AI Outreach Generator — full width */}
      <OutreachGenerator />

      {/* Rule of Four — full width */}
      <RuleOfFourSection />

      {/* Outreach Templates + Weekly Activity side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <OutreachTemplates />
        </div>
        <div className="flex-[2]">
          <WeeklyActivity />
        </div>
      </div>

      {/* Recruiter Tracker — full width */}
      <RecruiterTracker />
    </div>
  );
}
