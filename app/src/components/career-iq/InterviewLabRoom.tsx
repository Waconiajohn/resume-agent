import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Mic,
  Building2,
  Calendar,
  Clock,
  ArrowLeft,
  Brain,
  Users,
  Newspaper,
  MessageCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  AlertCircle,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useInterviewPrep } from '@/hooks/useInterviewPrep';
import { supabase } from '@/lib/supabase';
import { useInterviewDebriefs } from '@/hooks/useInterviewDebriefs';
import type { InterviewerNote } from '@/hooks/useInterviewDebriefs';
import { DebriefForm } from '@/components/career-iq/DebriefForm';
import { MockInterviewView } from '@/components/career-iq/MockInterviewView';

// --- Mock data ---

interface UpcomingInterview {
  id: string;
  company: string;
  role: string;
  date: string;
  time: string;
  type: 'phone' | 'video' | 'onsite';
  round: string;
  jobApplicationId?: string;
}

interface PracticeQuestion {
  question: string;
  tip: string;
  category: 'behavioral' | 'technical' | 'situational' | 'strategic';
}

interface PastInterview {
  id: string;
  company: string;
  role: string;
  date: string;
  outcome: 'advanced' | 'rejected' | 'pending';
  notes: string;
}

export interface PipelineInterviewCard {
  id: string;
  company: string;
  role: string;
}

const MOCK_UPCOMING: UpcomingInterview[] = [
  { id: '1', company: 'Medtronic', role: 'VP of Supply Chain Operations', date: 'Mar 10', time: '10:00 AM CT', type: 'video', round: 'Round 2 — VP Engineering' },
  { id: '2', company: 'Abbott Labs', role: 'Senior Director, Operations', date: 'Mar 13', time: '2:00 PM CT', type: 'onsite', round: 'Round 1 — Hiring Manager' },
];

const MOCK_COMPANY_INTEL = {
  overview: 'Medtronic is a global medical technology leader with $31.2B revenue. Recently announced a major supply chain restructuring initiative targeting $500M in cost savings over 3 years.',
  recentNews: [
    'Q3 earnings beat estimates — 6% revenue growth driven by surgical innovations',
    'New CEO announced 3-year operational efficiency mandate',
    'Supply chain reorganization announced — consolidating from 8 regions to 4',
  ],
  culture: 'Mission-driven ("alleviating pain, restoring health"). Values engineering rigor. Collaborative but metric-heavy. Expect data-backed answers.',
  keyPeople: [
    { name: 'Karen Parkhill', title: 'CFO', note: 'Key decision-maker on cost savings initiatives' },
    { name: 'Bob White', title: 'EVP Global Operations', note: 'Your interviewer\'s boss — champion of the restructuring' },
  ],
};

const MOCK_QUESTIONS: PracticeQuestion[] = [
  { question: 'Tell me about a time you led a major supply chain transformation. What was the situation, and what results did you achieve?', tip: 'Lead with the turnaround story from your Why-Me. Quantify: timeline, cost savings, team size. They want to see you\'ve done this at scale.', category: 'behavioral' },
  { question: 'How would you approach consolidating our supply chain from 8 regions to 4?', tip: 'Don\'t jump to the answer — ask clarifying questions first. Show your methodology, not just the outcome. Reference their $500M target.', category: 'strategic' },
  { question: 'How do you handle resistance from plant managers during a restructuring?', tip: 'This is really about your leadership style. They want to know you won\'t just mandate from HQ. Show empathy + results.', category: 'situational' },
  { question: 'What metrics do you use to measure supply chain health?', tip: 'Name 3-4 specific KPIs you\'ve used. Tie each to business impact, not just operational efficiency. They\'re looking for strategic thinking.', category: 'technical' },
  { question: 'Why are you interested in Medtronic specifically?', tip: 'Connect your Why-Me story to their mission. Don\'t say "medical devices" — reference their restructuring mandate and how your experience maps.', category: 'behavioral' },
];

const SEED_HISTORY: PastInterview[] = [
  { id: 'h1', company: 'Honeywell', role: 'VP Manufacturing', date: 'Feb 28', outcome: 'advanced', notes: 'Strong rapport with hiring manager. Asked to return for final round with division president.' },
  { id: 'h2', company: 'Parker Hannifin', role: 'Director of Operations', date: 'Feb 20', outcome: 'rejected', notes: 'Wanted someone with aerospace-specific experience. Good conversation but wrong industry fit.' },
  { id: 'h3', company: 'Johnson Controls', role: 'VP Operational Excellence', date: 'Feb 14', outcome: 'pending', notes: 'Waiting on feedback. Interviewer mentioned budget freeze may delay decision.' },
];

const HISTORY_STORAGE_KEY = 'careeriq_interview_history';

function loadHistory(): PastInterview[] {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return SEED_HISTORY;
}

function saveHistory(history: PastInterview[]) {
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history)); } catch { /* ignore */ }
}

// --- Components ---

function UpcomingInterviews({ interviews, onGeneratePrep }: {
  interviews: UpcomingInterview[];
  onGeneratePrep: (interview: UpcomingInterview) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(interviews[0]?.id ?? '');

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Upcoming Interviews</h3>
      </div>

      {interviews.length === 0 ? (
        <div className="text-center py-6">
          <Mic size={24} className="text-white/20 mx-auto mb-2" />
          <p className="text-[13px] text-white/40">No interviews scheduled</p>
          <p className="text-[11px] text-white/25 mt-1">Move a pipeline card to "Interviewing" or add one manually</p>
        </div>
      ) : (
        <div className="space-y-2">
          {interviews.map((interview) => (
            <div key={interview.id}>
              <button
                type="button"
                onClick={() => setSelectedId(interview.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all',
                  selectedId === interview.id
                    ? 'bg-white/[0.06] border border-white/[0.1]'
                    : 'border border-transparent hover:bg-white/[0.03]',
                )}
              >
                <div className="rounded-lg bg-[#98b3ff]/10 p-2 flex-shrink-0">
                  <Building2 size={16} className="text-[#98b3ff]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white/75">{interview.company}</div>
                  <div className="text-[12px] text-white/40">{interview.role}</div>
                  <div className="text-[11px] text-white/25 mt-0.5">{interview.round}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[12px] font-medium text-white/60">{interview.date}</div>
                  <div className="text-[11px] text-white/30">{interview.time}</div>
                  <div className="text-[10px] text-white/20 capitalize mt-0.5">{interview.type}</div>
                </div>
              </button>
              {selectedId === interview.id && (
                <div className="px-4 pb-2 pt-1">
                  <GlassButton
                    variant="primary"
                    onClick={() => onGeneratePrep(interview)}
                    className="w-full text-[12px] py-2"
                  >
                    <FileText size={14} className="mr-1.5" />
                    Generate Interview Prep
                  </GlassButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function CompanyResearch() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Company Intel — Medtronic</h3>
      </div>

      <div className="space-y-4">
        {/* Overview */}
        <div>
          <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">Overview</div>
          <p className="text-[13px] text-white/55 leading-relaxed">{MOCK_COMPANY_INTEL.overview}</p>
        </div>

        {/* Recent news */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Newspaper size={12} className="text-white/30" />
            <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Recent News</span>
          </div>
          <ul className="space-y-1.5">
            {MOCK_COMPANY_INTEL.recentNews.map((item, i) => (
              <li key={i} className="text-[12px] text-white/45 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-[7px] before:h-1 before:w-1 before:rounded-full before:bg-white/20">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Culture */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <MessageCircle size={12} className="text-white/30" />
            <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Culture Signal</span>
          </div>
          <p className="text-[12px] text-white/45 leading-relaxed italic">{MOCK_COMPANY_INTEL.culture}</p>
        </div>

        {/* Key people */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users size={12} className="text-white/30" />
            <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Key People</span>
          </div>
          <div className="space-y-2">
            {MOCK_COMPANY_INTEL.keyPeople.map((person) => (
              <div key={person.name} className="flex items-start gap-2">
                <div className="h-6 w-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white/40">{person.name.split(' ').map(n => n[0]).join('')}</span>
                </div>
                <div>
                  <div className="text-[12px] text-white/60">{person.name} — {person.title}</div>
                  <div className="text-[11px] text-white/30">{person.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function PracticeQuestions({ onStartPractice }: { onStartPractice: () => void }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const categoryColors: Record<string, string> = {
    behavioral: 'text-[#98b3ff] bg-[#98b3ff]/10',
    technical: 'text-[#b5dec2] bg-[#b5dec2]/10',
    situational: 'text-[#dfc797] bg-[#dfc797]/10',
    strategic: 'text-[#e8a0a0] bg-[#e8a0a0]/10',
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Predicted Questions</h3>
        <span className="ml-auto text-[11px] text-white/30">Based on role + Why-Me</span>
      </div>

      <div className="space-y-2">
        {MOCK_QUESTIONS.map((q, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0 mt-0.5', categoryColors[q.category])}>
                {q.category}
              </span>
              <span className="text-[13px] text-white/65 leading-relaxed flex-1">{q.question}</span>
              {expandedIndex === i ? <ChevronUp size={14} className="text-white/25 flex-shrink-0 mt-1" /> : <ChevronDown size={14} className="text-white/25 flex-shrink-0 mt-1" />}
            </button>
            {expandedIndex === i && (
              <div className="border-t border-white/[0.06] px-4 py-3 bg-[#98b3ff]/[0.02]">
                <div className="flex items-start gap-2">
                  <Brain size={12} className="text-[#98b3ff] mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] text-[#98b3ff]/60 leading-relaxed">{q.tip}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <GlassButton variant="ghost" onClick={onStartPractice} className="w-full text-[13px]">
          <Mic size={14} className="mr-1.5" />
          Start a Practice Session
        </GlassButton>
      </div>
    </GlassCard>
  );
}

function InterviewHistory({ history, onUpdateOutcome, onAdd, onAddDebrief, debriefCount }: {
  history: PastInterview[];
  onUpdateOutcome: (id: string, outcome: PastInterview['outcome']) => void;
  onAdd: (entry: Omit<PastInterview, 'id'>) => void;
  onAddDebrief: () => void;
  debriefCount: number;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const outcomeConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    advanced: { icon: CheckCircle2, color: 'text-[#b5dec2]', label: 'Advanced' },
    rejected: { icon: XCircle, color: 'text-[#e8a0a0]', label: 'Not Selected' },
    pending: { icon: Clock, color: 'text-[#dfc797]', label: 'Pending' },
  };

  const outcomes: PastInterview['outcome'][] = ['pending', 'advanced', 'rejected'];

  const handleSubmit = () => {
    if (!newCompany.trim() || !newRole.trim()) return;
    const today = new Date();
    const date = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    onAdd({ company: newCompany.trim(), role: newRole.trim(), date, outcome: 'pending', notes: newNotes.trim() });
    setNewCompany('');
    setNewRole('');
    setNewNotes('');
    setShowAddForm(false);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Interview History</h3>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onAddDebrief}
            className="flex items-center gap-1 text-[11px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
          >
            <ClipboardList size={12} />
            Add Debrief
            {debriefCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[#98b3ff]/15 px-1.5 py-0.5 text-[10px] text-[#98b3ff]/70">
                {debriefCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/60 transition-colors"
          >
            <Plus size={12} />
            Add Interview
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] p-4 mb-4 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Company"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
            />
            <input
              type="text"
              placeholder="Role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
            />
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30"
          />
          <div className="flex gap-2">
            <GlassButton variant="primary" onClick={handleSubmit} className="text-[12px] px-3 py-1.5">
              Save
            </GlassButton>
            <GlassButton variant="ghost" onClick={() => setShowAddForm(false)} className="text-[12px] px-3 py-1.5">
              Cancel
            </GlassButton>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {history.map((interview) => {
          const outcome = outcomeConfig[interview.outcome];
          return (
            <div key={interview.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-white/65">{interview.company}</span>
                <div className="flex items-center gap-1">
                  {outcomes.map((o) => {
                    const cfg = outcomeConfig[o];
                    const isActive = interview.outcome === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => onUpdateOutcome(interview.id, o)}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full transition-colors',
                          isActive ? `${cfg.color} font-medium` : 'text-white/20 hover:text-white/40',
                        )}
                        title={cfg.label}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-[12px] text-white/35">{interview.role} · {interview.date}</div>
              {interview.notes && (
                <p className="mt-1.5 text-[11px] text-white/30 leading-relaxed">{interview.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- Prep Progress View ---

function PrepProgress({ company, activityMessages, currentStage }: {
  company: string;
  activityMessages: { id: string; text: string; stage: string; timestamp: number }[];
  currentStage: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  const stageLabels: Record<string, string> = {
    research: 'Researching',
    writing: 'Writing Report',
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg bg-[#98b3ff]/10 p-2">
          <Loader2 size={18} className="text-[#98b3ff] animate-spin" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white/85">
            Preparing for {company}
          </h3>
          <p className="text-[12px] text-white/40">
            {currentStage ? stageLabels[currentStage] ?? currentStage : 'Starting...'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {activityMessages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[#98b3ff]/40 mt-1.5 flex-shrink-0" />
            <span className="text-[12px] text-white/50 leading-relaxed">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {activityMessages.length === 0 && (
        <div className="text-center py-8">
          <Loader2 size={20} className="text-white/20 mx-auto mb-2 animate-spin" />
          <p className="text-[12px] text-white/30">Connecting to pipeline...</p>
        </div>
      )}
    </GlassCard>
  );
}

// --- Report View ---

function PrepReport({ company, role, report, qualityScore, onBack }: {
  company: string;
  role: string;
  report: string;
  qualityScore: number | null;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Interview Lab
        </button>
      </div>

      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#98b3ff]/10 p-2">
              <FileText size={18} className="text-[#98b3ff]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-white/85">
                Interview Prep — {company}
              </h3>
              <p className="text-[12px] text-white/40">{role}</p>
            </div>
          </div>
          {qualityScore !== null && (
            <div className={cn(
              'text-[12px] font-medium px-3 py-1 rounded-full',
              qualityScore >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10'
                : qualityScore >= 60 ? 'text-[#dfc797] bg-[#dfc797]/10'
                : 'text-[#e8a0a0] bg-[#e8a0a0]/10',
            )}>
              Quality: {qualityScore}%
            </div>
          )}
        </div>

        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/85 prose-headings:font-semibold
            prose-h1:text-lg prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-2 prose-h1:mb-4
            prose-h2:text-[15px] prose-h2:mt-6 prose-h2:mb-3
            prose-h3:text-[14px] prose-h3:mt-4 prose-h3:mb-2
            prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed
            prose-li:text-white/55 prose-li:text-[13px]
            prose-strong:text-white/75
            prose-em:text-white/50
            prose-blockquote:border-[#98b3ff]/30 prose-blockquote:text-white/45
            prose-hr:border-white/[0.08]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

/** Minimal markdown → HTML for the report. Handles headers, bold, italic, lists, blockquotes, hr. */
function markdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split('\n')
    .map((line) => {
      // Headers
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      // HR
      if (/^---+$/.test(line.trim())) return '<hr />';
      // Blockquote
      if (line.startsWith('&gt; ')) return `<blockquote><p>${line.slice(5)}</p></blockquote>`;
      // Unordered list
      if (/^[\-\*] /.test(line.trim())) {
        const content = line.replace(/^[\s]*[\-\*] /, '');
        return `<li>${inlineFormat(content)}</li>`;
      }
      // Ordered list
      if (/^\d+\. /.test(line.trim())) {
        const content = line.replace(/^[\s]*\d+\. /, '');
        return `<li>${inlineFormat(content)}</li>`;
      }
      // Empty line
      if (line.trim() === '') return '<br />';
      // Paragraph
      return `<p>${inlineFormat(line)}</p>`;
    })
    .join('\n');
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

// --- Main component ---

interface InterviewLabRoomProps {
  pipelineInterviews?: PipelineInterviewCard[];
}

type ViewMode = 'lab' | 'generating' | 'report' | 'debrief' | 'mock_interview';

interface MockInterviewConfig {
  resumeText: string;
  jobDescription?: string;
  companyName?: string;
  mode: 'full' | 'practice';
  questionType?: 'behavioral' | 'technical' | 'situational';
}

export function InterviewLabRoom({ pipelineInterviews }: InterviewLabRoomProps) {
  const [history, setHistory] = useState<PastInterview[]>(loadHistory);
  const [viewMode, setViewMode] = useState<ViewMode>('lab');
  const [activeCompany, setActiveCompany] = useState('');
  const [activeRole, setActiveRole] = useState('');
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [jdWarning, setJdWarning] = useState(false);
  const [mockInterviewConfig, setMockInterviewConfig] = useState<MockInterviewConfig | null>(null);
  const [mockInterviewLoading, setMockInterviewLoading] = useState(false);

  const { debriefs, createDebrief } = useInterviewDebriefs();

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useInterviewPrep();

  // Transition to report view when complete
  useEffect(() => {
    if (status === 'complete' && report) {
      setViewMode('report');
    }
  }, [status, report]);

  const handleGeneratePrep = useCallback(async (interview: UpcomingInterview) => {
    setActiveCompany(interview.company);
    setActiveRole(interview.role);
    setLoadingInputs(true);
    setInputError(null);
    setJdWarning(false);
    setViewMode('generating');

    try {
      // Fetch resume text from user's master resume
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setInputError('Please sign in to generate interview prep.');
        setLoadingInputs(false);
        return;
      }

      const [resumeResult, jdResult] = await Promise.all([
        supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single(),
        interview.jobApplicationId
          ? supabase
              .from('job_applications')
              .select('jd_text')
              .eq('id', interview.jobApplicationId)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      const resumeText = resumeResult.data?.raw_text ?? '';
      const jdText = jdResult.data?.jd_text ?? '';

      if (!resumeText || resumeText.length < 50) {
        setInputError('No resume found. Please upload a resume in the Resume Strategist before generating interview prep.');
        setLoadingInputs(false);
        return;
      }

      if (!jdText) {
        setJdWarning(true);
      }

      setLoadingInputs(false);

      await startPipeline({
        resumeText,
        jobDescription: jdText || `${interview.role} at ${interview.company}`,
        companyName: interview.company,
        jobApplicationId: interview.jobApplicationId,
      });
    } catch (err) {
      console.error('[InterviewLab] Failed to start prep:', err);
      setInputError('Something went wrong loading your data. Please try again.');
      setLoadingInputs(false);
    }
  }, [startPipeline]);

  const handleBack = useCallback(() => {
    reset();
    setViewMode('lab');
    setActiveCompany('');
    setActiveRole('');
  }, [reset]);

  const handleUpdateOutcome = useCallback((id: string, outcome: PastInterview['outcome']) => {
    setHistory((prev) => {
      const updated = prev.map((item) => item.id === id ? { ...item, outcome } : item);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const handleAddInterview = useCallback((entry: Omit<PastInterview, 'id'>) => {
    setHistory((prev) => {
      const newEntry: PastInterview = { ...entry, id: `h${Date.now()}` };
      const updated = [newEntry, ...prev];
      saveHistory(updated);
      return updated;
    });
  }, []);

  const handleAddDebriefClick = useCallback(() => {
    setViewMode('debrief');
  }, []);

  const handleDebriefSave = useCallback(
    async (data: Parameters<typeof createDebrief>[0]) => {
      return await createDebrief(data);
    },
    [createDebrief],
  );

  const handleDebriefCancel = useCallback(() => {
    setViewMode('lab');
  }, []);

  const handleNavigateToThankYou = useCallback((interviewerNotes: InterviewerNote[]) => {
    // Phase 4A-8 will wire cross-room navigation. For now, log the intent.
    console.log('[InterviewLabRoom] Navigate to thank you notes with interviewers:', interviewerNotes);
  }, []);

  const fetchResumeText = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('master_resumes')
      .select('raw_text')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    return data?.raw_text ?? null;
  }, []);

  const handleStartMockInterview = useCallback(async () => {
    setMockInterviewLoading(true);
    try {
      const resumeText = await fetchResumeText();
      if (!resumeText || resumeText.length < 50) {
        console.warn('[InterviewLab] No resume found — cannot start mock interview');
        setMockInterviewLoading(false);
        return;
      }
      setMockInterviewConfig({
        resumeText,
        mode: 'full',
      });
      setViewMode('mock_interview');
    } catch (err) {
      console.error('[InterviewLab] Failed to load resume for mock interview:', err);
    } finally {
      setMockInterviewLoading(false);
    }
  }, [fetchResumeText]);

  const handleStartPracticeSession = useCallback(async () => {
    setMockInterviewLoading(true);
    try {
      const resumeText = await fetchResumeText();
      setMockInterviewConfig({
        resumeText: resumeText ?? '',
        mode: 'practice',
        questionType: 'behavioral',
      });
      setViewMode('mock_interview');
    } catch (err) {
      console.error('[InterviewLab] Failed to load resume for practice session:', err);
    } finally {
      setMockInterviewLoading(false);
    }
  }, [fetchResumeText]);

  const handleMockInterviewBack = useCallback(() => {
    setViewMode('lab');
    setMockInterviewConfig(null);
  }, []);

  // Debrief view
  if (viewMode === 'debrief') {
    return (
      <DebriefForm
        onSave={handleDebriefSave}
        onCancel={handleDebriefCancel}
        onNavigateToThankYou={handleNavigateToThankYou}
      />
    );
  }

  // Mock interview view
  if (viewMode === 'mock_interview' && mockInterviewConfig) {
    return (
      <MockInterviewView
        mode={mockInterviewConfig.mode}
        questionType={mockInterviewConfig.questionType}
        resumeText={mockInterviewConfig.resumeText}
        jobDescription={mockInterviewConfig.jobDescription}
        companyName={mockInterviewConfig.companyName}
        onBack={handleMockInterviewBack}
      />
    );
  }

  // Report view
  if (viewMode === 'report' && report) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <PrepReport
          company={activeCompany}
          role={activeRole}
          report={report}
          qualityScore={qualityScore}
          onBack={handleBack}
        />
      </div>
    );
  }

  // Generating view
  if (viewMode === 'generating') {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">Interview Lab</h1>
          <p className="text-[13px] text-white/40">Generating your interview prep report...</p>
        </div>

        {inputError ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[#e8a0a0]" />
              <span className="text-[13px] text-[#e8a0a0]">{inputError}</span>
            </div>
            <GlassButton variant="ghost" onClick={handleBack} className="text-[12px]">
              <ArrowLeft size={14} className="mr-1.5" />
              Back to Interview Lab
            </GlassButton>
          </GlassCard>
        ) : loadingInputs ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="text-[#98b3ff] animate-spin" />
              <span className="text-[13px] text-white/50">Loading resume and job details...</span>
            </div>
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[#e8a0a0]" />
              <span className="text-[13px] text-[#e8a0a0]">{error}</span>
            </div>
            <GlassButton variant="ghost" onClick={handleBack} className="text-[12px]">
              <ArrowLeft size={14} className="mr-1.5" />
              Back to Interview Lab
            </GlassButton>
          </GlassCard>
        ) : (
          <>
            {jdWarning && (
              <GlassCard className="p-4 mb-0 border-[#dfc797]/20">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-[#dfc797] flex-shrink-0" />
                  <span className="text-[12px] text-[#dfc797]/80">
                    No job description found — the report will be based on the role title and company name only. For best results, add a JD to the job application.
                  </span>
                </div>
              </GlassCard>
            )}
            <PrepProgress
              company={activeCompany}
              activityMessages={activityMessages}
              currentStage={currentStage}
            />
          </>
        )}

        <div className="flex justify-start">
          <button
            type="button"
            onClick={handleBack}
            className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel and return
          </button>
        </div>
      </div>
    );
  }

  // Default lab view
  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">Interview Lab</h1>
          <p className="text-[13px] text-white/40">
            Prepare for every interview with AI-powered company research, predicted questions, and practice sessions.
          </p>
        </div>
        <GlassButton
          variant="primary"
          onClick={() => void handleStartMockInterview()}
          disabled={mockInterviewLoading}
          className="flex-shrink-0 text-[13px]"
        >
          {mockInterviewLoading ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Mic size={14} className="mr-1.5" />
          )}
          Start Mock Interview
        </GlassButton>
      </div>

      {/* Upcoming + Company Intel side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[2] min-w-0">
          <UpcomingInterviews
            interviews={
              pipelineInterviews && pipelineInterviews.length > 0
                ? pipelineInterviews.map((card) => ({
                    id: card.id,
                    company: card.company,
                    role: card.role,
                    date: 'TBD',
                    time: 'TBD',
                    type: 'video' as const,
                    round: 'From pipeline',
                    jobApplicationId: card.id,
                  }))
                : MOCK_UPCOMING
            }
            onGeneratePrep={handleGeneratePrep}
          />
        </div>
        <div className="flex-[3]">
          <CompanyResearch />
        </div>
      </div>

      {/* Practice Questions — full width */}
      <PracticeQuestions onStartPractice={() => void handleStartPracticeSession()} />

      {/* Interview History — full width */}
      <InterviewHistory
        history={history}
        onUpdateOutcome={handleUpdateOutcome}
        onAdd={handleAddInterview}
        onAddDebrief={handleAddDebriefClick}
        debriefCount={debriefs.length}
      />
    </div>
  );
}
