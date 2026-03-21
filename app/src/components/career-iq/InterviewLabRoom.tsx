import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import {
  Mic,
  Building2,
  Calendar,
  Clock,
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  AlertCircle,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Brain,
  Lightbulb,
  AlertTriangle,
  Star,
  Mail,
} from 'lucide-react';
import { markdownToHtml } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useInterviewPrep } from '@/hooks/useInterviewPrep';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { useInterviewDebriefs } from '@/hooks/useInterviewDebriefs';
import { DebriefForm } from '@/components/career-iq/DebriefForm';
import { MockInterviewView } from '@/components/career-iq/MockInterviewView';
import { ThankYouNoteRoom } from '@/components/career-iq/ThankYouNoteRoom';
import { SalaryNegotiationRoom } from '@/components/career-iq/SalaryNegotiationRoom';
import {
  InterviewLabDocumentsPanel,
  type InterviewLabDocumentsView,
} from '@/components/career-iq/interview-lab/InterviewLabDocumentsPanel';

// --- Types ---

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

interface PastInterview {
  id: string;
  company: string;
  role: string;
  date: string;
  outcome: 'advanced' | 'rejected' | 'pending';
  notes: string;
}

interface InterviewLabRoomProps {
  pipelineInterviews?: PipelineInterviewCard[];
  initialCompany?: string;
  initialRole?: string;
  initialJobApplicationId?: string;
  initialFocus?: string;
  initialAssetSessionId?: string;
}

export interface PipelineInterviewCard {
  id: string;
  company: string;
  role: string;
}

const HISTORY_STORAGE_KEY = 'careeriq_interview_history';

function isPastInterview(value: unknown): value is PastInterview {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.company === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.date === 'string' &&
    (candidate.outcome === 'advanced' || candidate.outcome === 'rejected' || candidate.outcome === 'pending') &&
    typeof candidate.notes === 'string'
  );
}

function loadHistory(): PastInterview[] {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(isPastInterview);
      }
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistory(history: PastInterview[]) {
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history)); } catch { /* ignore */ }
}

// --- Readiness Gauge (SVG ring) ---

function ReadinessGauge({ score, size = 72 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (score / 100);
  const cx = size / 2;
  const cy = size / 2;

  const color = score >= 80 ? '#b5dec2' : score >= 50 ? '#f0d99f' : '#f0b8b8';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={4}
        />
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-bold leading-none" style={{ color }}>{score}</span>
        <span className="text-[8px] text-white/30 mt-0.5">%</span>
      </div>
    </div>
  );
}

// --- Category badge ---

const CATEGORY_CONFIG = {
  behavioral: { label: 'Behavioral', bg: 'bg-[#afc4ff]/10', border: 'border-[#afc4ff]/20', text: 'text-[#afc4ff]' },
  technical: { label: 'Technical', bg: 'bg-[#b5dec2]/10', border: 'border-[#b5dec2]/20', text: 'text-[#b5dec2]' },
  situational: { label: 'Situational', bg: 'bg-[#f0d99f]/10', border: 'border-[#f0d99f]/20', text: 'text-[#f0d99f]' },
  strategic: { label: 'Strategic', bg: 'bg-[#f0b8b8]/10', border: 'border-[#f0b8b8]/20', text: 'text-[#f0b8b8]' },
  'culture-fit': { label: 'Culture Fit', bg: 'bg-white/[0.06]', border: 'border-white/[0.1]', text: 'text-white/50' },
  trap: { label: 'Trap', bg: 'bg-[#f0b8b8]/10', border: 'border-[#f0b8b8]/25', text: 'text-[#f0b8b8]' },
} as const;

type QuestionCategory = keyof typeof CATEGORY_CONFIG;

function CategoryBadge({ category }: { category: QuestionCategory }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.behavioral;
  return (
    <span className={cn(
      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border',
      cfg.bg, cfg.border, cfg.text,
    )}>
      {cfg.label}
    </span>
  );
}

// --- Difficulty badge ---

type Difficulty = 'easy' | 'medium' | 'hard';

function DifficultyBadge({ level }: { level: Difficulty }) {
  const cfg = {
    easy: { label: 'Easy', color: 'text-[#b5dec2]/70' },
    medium: { label: 'Medium', color: 'text-[#f0d99f]/70' },
    hard: { label: 'Hard', color: 'text-[#f0b8b8]/70' },
  }[level];

  const dots = level === 'easy' ? 1 : level === 'medium' ? 2 : 3;

  return (
    <span className={cn('flex items-center gap-0.5 text-[10px] font-medium', cfg.color)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className={cn('h-1 w-1 rounded-full', i < dots ? 'opacity-100' : 'opacity-20')}
          style={{ background: 'currentColor' }}
        />
      ))}
      <span className="ml-0.5">{cfg.label}</span>
    </span>
  );
}

// --- Coaching Notes expandable panel ---

interface CoachingNote {
  situation: string;
  task: string;
  action: string;
  result: string;
}

function CoachingNotesPanel({ notes, questionText }: { notes?: CoachingNote; questionText?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-[#afc4ff]/60 hover:text-[#afc4ff] transition-colors"
      >
        <Brain size={11} />
        Coaching Notes
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-[#afc4ff]/10 bg-[#afc4ff]/[0.03] p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb size={11} className="text-[#f0d99f]/60" />
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">STAR Framework Guide</span>
          </div>

          {notes ? (
            <div className="space-y-2">
              {(['situation', 'task', 'action', 'result'] as const).map((key) => (
                <div key={key}>
                  <span className="text-[10px] font-semibold text-[#afc4ff]/60 uppercase tracking-wider">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </span>
                  <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">{notes[key]}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-white/40 leading-relaxed">
                <span className="text-[#afc4ff]/70 font-medium">S</span>ituation: Set the scene — when, where, and why it mattered. 2–3 sentences.
              </p>
              <p className="text-[11px] text-white/40 leading-relaxed">
                <span className="text-[#afc4ff]/70 font-medium">T</span>ask: Your specific responsibility. Make your personal accountability explicit. 1–2 sentences.
              </p>
              <p className="text-[11px] text-white/40 leading-relaxed">
                <span className="text-[#afc4ff]/70 font-medium">A</span>ction: <span className="text-[#f0d99f]/70 font-medium">This is the longest section (40–60%)</span>. The decisions you made, obstacles you navigated, and skills you applied. Use "I" not "we."
              </p>
              <p className="text-[11px] text-white/40 leading-relaxed">
                <span className="text-[#afc4ff]/70 font-medium">R</span>esult: Quantified outcomes — percentages, dollars, timelines, team sizes. Connect back to business value.
              </p>
              {questionText && (
                <div className="mt-2 pt-2 border-t border-white/[0.06]">
                  <p className="text-[10px] text-white/30 italic">Tip: Reference a specific project from your resume to anchor this answer.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Company Research Dashboard ---

interface CompanyResearchData {
  overview?: string;
  recentNews?: string[];
  cultureSignals?: string[];
  competitors?: string[];
  risks?: string[];
}

function CompanyResearchDashboard({ data }: { data: CompanyResearchData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      {data.overview && (
        <GlassCard className="p-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={13} className="text-[#afc4ff]" />
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Company Overview</span>
          </div>
          <p className="text-[12px] text-white/60 leading-relaxed">{data.overview}</p>
        </GlassCard>
      )}

      {data.recentNews && data.recentNews.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={12} className="text-[#f0d99f]" />
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Recent Signals</span>
          </div>
          <ul className="space-y-1.5">
            {data.recentNews.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/55">
                <span className="h-1 w-1 rounded-full bg-[#f0d99f]/40 mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {data.cultureSignals && data.cultureSignals.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={12} className="text-[#b5dec2]" />
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Culture Signals</span>
          </div>
          <ul className="space-y-1.5">
            {data.cultureSignals.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/55">
                <span className="h-1 w-1 rounded-full bg-[#b5dec2]/40 mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {data.risks && data.risks.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={12} className="text-[#f0b8b8]" />
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Risk Factors</span>
          </div>
          <ul className="space-y-1.5">
            {data.risks.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/55">
                <span className="h-1 w-1 rounded-full bg-[#f0b8b8]/40 mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {data.competitors && data.competitors.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={12} className="text-white/40" />
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Competitors</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.competitors.map((c, i) => (
              <span key={i} className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[11px] text-white/50">
                {c}
              </span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// --- Question Bank ---

interface QuestionBankItem {
  question: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  coachingNotes?: CoachingNote;
}

function QuestionBank({ questions }: { questions: QuestionBankItem[] }) {
  const categories = ['behavioral', 'technical', 'situational', 'strategic', 'trap'] as QuestionCategory[];
  const [activeCategory, setActiveCategory] = useState<QuestionCategory | 'all'>('all');
  const [practicedIds, setPracticedIds] = useState<Set<number>>(new Set());

  const filtered = activeCategory === 'all'
    ? questions
    : questions.filter((q) => q.category === activeCategory);

  const readinessScore = questions.length > 0
    ? Math.round((practicedIds.size / questions.length) * 100)
    : 0;

  const togglePracticed = (i: number) => {
    setPracticedIds((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Readiness score header */}
      <div className="flex items-center gap-4">
        <ReadinessGauge score={readinessScore} size={72} />
        <div>
          <div className="text-[13px] font-semibold text-white/80">Readiness Score</div>
          <div className="text-[12px] text-white/40 mt-0.5">
            {practicedIds.size} of {questions.length} questions practiced
          </div>
          <div className="text-[11px] text-white/25 mt-1">
            Click the checkmark on each question after practicing it
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors',
            activeCategory === 'all'
              ? 'border-white/[0.15] bg-white/[0.07] text-white/80'
              : 'border-white/[0.06] bg-transparent text-white/40 hover:text-white/60',
          )}
        >
          All ({questions.length})
        </button>
        {categories.map((cat) => {
          const count = questions.filter((q) => q.category === cat).length;
          if (count === 0) return null;
          const cfg = CATEGORY_CONFIG[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors',
                activeCategory === cat
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'border-white/[0.06] bg-transparent text-white/40 hover:text-white/60',
              )}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Question list */}
      <div className="space-y-2">
        {filtered.map((item, i) => {
          const globalIdx = questions.indexOf(item);
          const practiced = practicedIds.has(globalIdx);
          return (
            <div
              key={i}
              className={cn(
                'rounded-xl border bg-white/[0.02] p-4 transition-all',
                practiced ? 'border-[#b5dec2]/15 bg-[#b5dec2]/[0.02]' : 'border-white/[0.06]',
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => togglePracticed(globalIdx)}
                  className={cn(
                    'flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border transition-colors',
                    practiced
                      ? 'border-[#b5dec2]/50 bg-[#b5dec2]/15'
                      : 'border-white/[0.15] bg-transparent hover:border-[#b5dec2]/30',
                  )}
                  title={practiced ? 'Mark as not practiced' : 'Mark as practiced'}
                >
                  {practiced && (
                    <CheckCircle2 size={14} className="text-[#b5dec2] -mt-0.5 -ml-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <CategoryBadge category={item.category} />
                    <DifficultyBadge level={item.difficulty} />
                  </div>
                  <p className={cn(
                    'text-[13px] leading-relaxed',
                    practiced ? 'text-white/40 line-through' : 'text-white/75',
                  )}>
                    {item.question}
                  </p>
                  <CoachingNotesPanel notes={item.coachingNotes} questionText={item.question} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Upcoming Interviews ---

function UpcomingInterviews({ interviews, onGeneratePrep }: {
  interviews: UpcomingInterview[];
  onGeneratePrep: (interview: UpcomingInterview) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(interviews[0]?.id ?? '');

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-[#afc4ff]" />
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
                <div className="rounded-lg bg-[#afc4ff]/10 p-2 flex-shrink-0">
                  <Building2 size={16} className="text-[#afc4ff]" />
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

// --- Interview History ---

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
    rejected: { icon: XCircle, color: 'text-[#f0b8b8]', label: 'Not Selected' },
    pending: { icon: Clock, color: 'text-[#f0d99f]', label: 'Pending' },
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
        <Clock size={18} className="text-[#afc4ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Interview History</h3>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onAddDebrief}
            className="flex items-center gap-1 text-[11px] text-[#afc4ff]/60 hover:text-[#afc4ff] transition-colors"
          >
            <ClipboardList size={12} />
            Add Debrief
            {debriefCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[#afc4ff]/15 px-1.5 py-0.5 text-[10px] text-[#afc4ff]/70">
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
        <div className="rounded-xl border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] p-4 mb-4 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Company"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:border-[#afc4ff]/30"
            />
            <input
              type="text"
              placeholder="Role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:border-[#afc4ff]/30"
            />
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 focus:border-[#afc4ff]/30"
          />
          <div className="flex gap-2">
            <GlassButton variant="primary" onClick={handleSubmit} size="sm">Save</GlassButton>
            <GlassButton variant="ghost" onClick={() => setShowAddForm(false)} size="sm">Cancel</GlassButton>
          </div>
        </div>
      )}

      {history.length === 0 && (
        <EmptyStateIllustration
          variant="interview"
          message="No interview history yet. Add your past interviews to track outcomes."
        />
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
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
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
        <div className="rounded-lg bg-[#afc4ff]/10 p-2">
          <Loader2 size={18} className="text-[#afc4ff] animate-spin" />
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
            <div className="h-1.5 w-1.5 rounded-full bg-[#afc4ff]/40 mt-1.5 flex-shrink-0" />
            <span className="text-[12px] text-white/50 leading-relaxed">{msg.message}</span>
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

// --- Prep Report View ---

// Sample question bank — in production this would be extracted from the report markdown
const SAMPLE_QUESTIONS: QuestionBankItem[] = [
  { question: 'Tell me about a time you had to align a cross-functional team around a controversial decision.', category: 'behavioral', difficulty: 'hard' },
  { question: 'Walk me through how you would approach your first 30 days in this role.', category: 'situational', difficulty: 'medium' },
  { question: 'How do you prioritize competing initiatives when resources are constrained?', category: 'strategic', difficulty: 'hard' },
  { question: 'Describe a significant technical challenge you have solved at scale.', category: 'technical', difficulty: 'hard' },
  { question: 'Your resume shows strong individual contributor history. This role requires leading a team of 20+ — tell me about the largest team you have directly managed.', category: 'trap', difficulty: 'hard' },
  { question: 'How do you build alignment with stakeholders who have competing priorities?', category: 'behavioral', difficulty: 'medium' },
  { question: 'What metrics do you use to measure success in the first 90 days?', category: 'situational', difficulty: 'easy' },
  { question: 'Describe your approach to managing underperformance on your team.', category: 'behavioral', difficulty: 'medium' },
];

function PrepReport({ company, role, report, qualityScore, onBack }: {
  company: string;
  role: string;
  report: string;
  qualityScore: number | null;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'report' | 'questions'>('report');

  const researchData: CompanyResearchData = {
    overview: undefined, // Parsed from report in production
    recentNews: [],
    cultureSignals: [],
    risks: [],
    competitors: [],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Interview Prep
        </button>
      </div>

      {/* Header card */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#afc4ff]/10 p-2.5 border border-[#afc4ff]/15">
              <FileText size={18} className="text-[#afc4ff]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-white/90">
                Interview Brief — {company}
              </h3>
              <p className="text-[12px] text-white/40">{role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {qualityScore !== null && (
              <ReadinessGauge score={qualityScore} size={52} />
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mt-4 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] w-fit">
          {([['report', 'Interview Brief'], ['questions', 'Practice Questions']] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-medium transition-all',
                activeTab === tab
                  ? 'bg-white/[0.08] text-white/85 shadow-sm'
                  : 'text-white/40 hover:text-white/60',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </GlassCard>

      {activeTab === 'report' ? (
        <GlassCard className="p-6">
          {/* Company Research Dashboard — shown above the markdown report */}
          {(researchData.recentNews?.length || researchData.cultureSignals?.length || researchData.risks?.length || researchData.competitors?.length) ? (
            <CompanyResearchDashboard data={researchData} />
          ) : null}

          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-white/85 prose-headings:font-semibold
              prose-h1:text-lg prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-2 prose-h1:mb-4
              prose-h2:text-[15px] prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-[#afc4ff]/90
              prose-h3:text-[14px] prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed
              prose-li:text-white/55 prose-li:text-[13px]
              prose-strong:text-white/80
              prose-em:text-white/50
              prose-blockquote:border-[#afc4ff]/30 prose-blockquote:text-white/60 prose-blockquote:bg-[#afc4ff]/[0.03] prose-blockquote:rounded-r-lg
              prose-hr:border-white/[0.08]"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
          />
        </GlassCard>
      ) : (
        <GlassCard className="p-6">
          <QuestionBank questions={SAMPLE_QUESTIONS} />
        </GlassCard>
      )}
    </div>
  );
}

// --- Main component ---

type ViewMode = 'lab' | 'generating' | 'report' | 'debrief' | 'mock_interview';
type LabSection = 'prep' | 'practice' | 'documents' | 'follow_up';
type FollowUpView = 'overview' | 'thank_you' | 'negotiation';

const LAB_SECTION_COPY: Record<LabSection, { label: string; description: string }> = {
  prep: {
    label: 'Prep',
    description: 'Research the role, generate prep, and walk into the interview with a plan.',
  },
  practice: {
    label: 'Practice',
    description: 'Run the mock interview and pressure-test how your answers sound out loud.',
  },
  documents: {
    label: 'Leave-behinds',
    description: 'Create the 30-60-90 plan and other interview leave-behinds when they will help you stand out.',
  },
  follow_up: {
    label: 'Follow-up',
    description: 'Handle thank-you notes, offer-stage negotiation prep, and post-interview follow-through in one place.',
  },
};

interface MockInterviewConfig {
  resumeText: string;
  jobDescription?: string;
  companyName?: string;
  mode: 'full' | 'practice';
  questionType?: 'behavioral' | 'technical' | 'situational';
}

export function InterviewLabRoom({
  pipelineInterviews,
  initialCompany,
  initialRole,
  initialJobApplicationId,
  initialFocus,
  initialAssetSessionId,
}: InterviewLabRoomProps) {
  const [history, setHistory] = useState<PastInterview[]>(loadHistory);
  const [viewMode, setViewMode] = useState<ViewMode>('lab');
  const [activeSection, setActiveSection] = useState<LabSection>('prep');
  const [documentsView, setDocumentsView] = useState<InterviewLabDocumentsView>('overview');
  const [followUpView, setFollowUpView] = useState<FollowUpView>('overview');
  const [activeCompany, setActiveCompany] = useState(initialCompany ?? '');
  const [activeRole, setActiveRole] = useState(initialRole ?? '');
  const [activeJobApplicationId, setActiveJobApplicationId] = useState<string | undefined>(initialJobApplicationId);
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [jdWarning, setJdWarning] = useState(false);
  const [mockInterviewConfig, setMockInterviewConfig] = useState<MockInterviewConfig | null>(null);
  const [mockInterviewLoading, setMockInterviewLoading] = useState(false);
  const [mockInterviewError, setMockInterviewError] = useState<string | null>(null);

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
  const { priorResult: savedPrepResult, loading: savedPrepLoading } = usePriorResult<{
    report_markdown?: string;
    quality_score?: number;
  }>({
    productSlug: 'interview-prep',
    skip: status !== 'idle' || initialFocus !== 'prep' || !initialAssetSessionId,
    sessionId: initialAssetSessionId,
  });

  useEffect(() => {
    if (status === 'complete' && report) {
      setViewMode('report');
    }
  }, [status, report]);

  useEffect(() => {
    if (initialFocus === 'prep' && initialAssetSessionId && savedPrepResult?.report_markdown) {
      setViewMode('report');
    }
  }, [initialAssetSessionId, initialFocus, savedPrepResult?.report_markdown]);

  useEffect(() => {
    if (initialCompany) {
      setActiveCompany(initialCompany);
    }
    if (initialRole) {
      setActiveRole(initialRole);
    }
    if (initialJobApplicationId) {
      setActiveJobApplicationId(initialJobApplicationId);
    }
  }, [initialCompany, initialRole, initialJobApplicationId]);

  useEffect(() => {
    if (initialFocus === 'plan') {
      setActiveSection('documents');
      setDocumentsView('ninety_day_plan');
      setFollowUpView('overview');
      return;
    }
    if (initialFocus === 'thank-you') {
      setActiveSection('follow_up');
      setFollowUpView('thank_you');
      setDocumentsView('overview');
      return;
    }
    if (initialFocus === 'negotiation') {
      setActiveSection('follow_up');
      setFollowUpView('negotiation');
      setDocumentsView('overview');
      return;
    }
    if (initialFocus === 'practice') {
      setActiveSection('practice');
      setDocumentsView('overview');
      setFollowUpView('overview');
      return;
    }
    if (initialFocus === 'prep') {
      setActiveSection('prep');
      setDocumentsView('overview');
      setFollowUpView('overview');
    }
  }, [initialFocus]);

  useEffect(() => {
    if (activeSection !== 'documents' && documentsView !== 'overview') {
      setDocumentsView('overview');
    }
    if (activeSection !== 'follow_up' && followUpView !== 'overview') {
      setFollowUpView('overview');
    }
  }, [activeSection, documentsView, followUpView]);

  const handleGeneratePrep = useCallback(async (interview: UpcomingInterview) => {
    setActiveCompany(interview.company);
    setActiveRole(interview.role);
    setActiveJobApplicationId(interview.jobApplicationId);
    setLoadingInputs(true);
    setInputError(null);
    setJdWarning(false);
    setViewMode('generating');

    try {
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
    setActiveCompany(initialCompany ?? '');
    setActiveRole(initialRole ?? '');
    setActiveJobApplicationId(initialJobApplicationId);
  }, [initialCompany, initialJobApplicationId, initialRole, reset]);

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
    setActiveSection('practice');
    setMockInterviewLoading(true);
    setMockInterviewError(null);
    try {
      const resumeText = await fetchResumeText();
      if (!resumeText || resumeText.length < 50) {
        setMockInterviewError('Upload a resume first — we need it to run the mock interview.');
        setMockInterviewLoading(false);
        return;
      }
      setMockInterviewConfig({ resumeText, mode: 'full' });
      setViewMode('mock_interview');
    } catch (err) {
      console.error('[InterviewLab] Failed to load resume for mock interview:', err);
    } finally {
      setMockInterviewLoading(false);
    }
  }, [fetchResumeText]);

  const handleMockInterviewBack = useCallback(() => {
    setViewMode('lab');
    setMockInterviewConfig(null);
  }, []);

  if (viewMode === 'debrief') {
    return (
      <DebriefForm
        onSave={handleDebriefSave}
        onCancel={handleDebriefCancel}
      />
    );
  }

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

  const displayedPrepReport = report ?? savedPrepResult?.report_markdown ?? null;
  const displayedPrepQualityScore = qualityScore ?? savedPrepResult?.quality_score ?? null;

  if (viewMode === 'report' && displayedPrepReport) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <PrepReport
          company={activeCompany}
          role={activeRole}
          report={displayedPrepReport}
          qualityScore={displayedPrepQualityScore}
          onBack={handleBack}
        />
      </div>
    );
  }

  if (viewMode === 'generating') {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">Interview Prep</h1>
          <p className="text-[13px] text-white/40">Building your interview brief...</p>
        </div>

        {inputError ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[#f0b8b8]" />
              <span className="text-[13px] text-[#f0b8b8]">{inputError}</span>
            </div>
            <GlassButton variant="ghost" onClick={handleBack} size="sm">
              <ArrowLeft size={14} className="mr-1.5" />
              Back to Interview Prep
            </GlassButton>
          </GlassCard>
        ) : loadingInputs ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="text-[#afc4ff] animate-spin" />
              <span className="text-[13px] text-white/50">Loading resume and job details...</span>
            </div>
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[#f0b8b8]" />
              <span className="text-[13px] text-[#f0b8b8]">{error}</span>
            </div>
            <GlassButton variant="ghost" onClick={handleBack} size="sm">
              <ArrowLeft size={14} className="mr-1.5" />
              Back to Interview Prep
            </GlassButton>
          </GlassCard>
        ) : (
          <>
            {jdWarning && (
              <GlassCard className="p-4 mb-0 border-[#f0d99f]/20">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-[#f0d99f] flex-shrink-0" />
                  <span className="text-[12px] text-[#f0d99f]/80">
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
          <h1 className="text-lg font-semibold text-white/90">Interview Prep</h1>
          <p className="text-[13px] text-white/40">
            Keep prep, practice, leave-behinds, and follow-up in one place.
          </p>
        </div>
      </div>

      {mockInterviewError && (
        <div className="rounded-xl border border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#f0b8b8] flex-shrink-0" />
          <span className="text-[13px] text-[#f0b8b8]/80">{mockInterviewError}</span>
        </div>
      )}

      {savedPrepLoading && initialFocus === 'prep' && initialAssetSessionId && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-white/35">
            <Loader2 size={12} className="animate-spin" />
            Loading saved interview prep...
          </div>
        </GlassCard>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.entries(LAB_SECTION_COPY) as Array<[LabSection, { label: string; description: string }]>).map(([sectionId, section]) => {
          const isActive = activeSection === sectionId;
          return (
            <button
              key={sectionId}
              type="button"
              onClick={() => setActiveSection(sectionId)}
              className={cn(
                'rounded-full border px-4 py-2 text-left transition-colors',
                isActive
                  ? 'border-[#98b3ff]/22 bg-[#98b3ff]/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]',
              )}
            >
              <div className="text-sm font-semibold text-white/86">{section.label}</div>
            </button>
          );
        })}
      </div>

      <GlassCard className="p-4">
        <div className="text-sm font-semibold text-white/84">{LAB_SECTION_COPY[activeSection].label}</div>
        <div className="mt-1 text-sm leading-relaxed text-white/52">{LAB_SECTION_COPY[activeSection].description}</div>
      </GlassCard>

      {activeSection === 'prep' && (
        <>
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
                : []
            }
            onGeneratePrep={handleGeneratePrep}
          />
        </>
      )}

      {activeSection === 'practice' && (
        <GlassCard className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl text-sm leading-relaxed text-white/54">
              Run the mock interview when you want to hear your positioning out loud, tighten weak answers, and expose where your proof still feels thin.
            </div>
            <GlassButton
              variant="primary"
              onClick={() => void handleStartMockInterview()}
              disabled={mockInterviewLoading}
              className="text-[13px]"
            >
              {mockInterviewLoading ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Mic size={14} className="mr-1.5" />
              )}
              Start Mock Interview
            </GlassButton>
          </div>
        </GlassCard>
      )}

      {activeSection === 'documents' && (
        <div className="space-y-4">
          <InterviewLabDocumentsPanel
            documentsView={documentsView}
            activeCompany={activeCompany}
            activeRole={activeRole}
            activeJobApplicationId={activeJobApplicationId}
            initialFocus={initialFocus}
            initialAssetSessionId={initialAssetSessionId}
            onDocumentsViewChange={setDocumentsView}
            onOpenThankYou={() => {
              setActiveSection('follow_up');
              setFollowUpView('thank_you');
            }}
          />
        </div>
      )}

      {activeSection === 'follow_up' && (
        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl text-sm leading-relaxed text-white/54">
                Keep debriefs, thank-you notes, and negotiation prep tied to the same story you used in prep and practice.
              </div>
              <div className="flex flex-wrap gap-2">
                <GlassButton
                  variant="ghost"
                  onClick={() => setFollowUpView((current) => (current === 'thank_you' ? 'overview' : 'thank_you'))}
                  className="text-[13px]"
                >
                  <Mail size={14} className="mr-1.5" />
                  {followUpView === 'thank_you' ? 'Hide Thank You Note' : 'Thank You Note'}
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  onClick={() => setFollowUpView((current) => (current === 'negotiation' ? 'overview' : 'negotiation'))}
                  className="text-[13px]"
                >
                  <Star size={14} className="mr-1.5" />
                  {followUpView === 'negotiation' ? 'Hide Negotiation Prep' : 'Negotiation Prep'}
                </GlassButton>
              </div>
            </div>
          </GlassCard>

          {followUpView === 'overview' && (
            <GlassCard className="p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                    Thank You Note
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/52">
                    Turn the debrief into a focused follow-up note while the conversation is still fresh.
                  </p>
                  <div className="mt-4">
                    <GlassButton variant="ghost" onClick={() => setFollowUpView('thank_you')} className="text-[13px]">
                      <Mail size={14} className="mr-1.5" />
                      Open Thank You Note
                    </GlassButton>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                    Negotiation Prep
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/52">
                    Get ready for the offer conversation without leaving this workflow.
                  </p>
                  <div className="mt-4">
                    <GlassButton variant="ghost" onClick={() => setFollowUpView('negotiation')} className="text-[13px]">
                      <Star size={14} className="mr-1.5" />
                      Open Negotiation Prep
                    </GlassButton>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {followUpView === 'thank_you' && (
            <ThankYouNoteRoom
              initialCompany={activeCompany}
              initialRole={activeRole}
              initialJobApplicationId={activeJobApplicationId}
              initialSessionId={initialFocus === 'thank-you' ? initialAssetSessionId : undefined}
            />
          )}

          {followUpView === 'negotiation' && (
            <SalaryNegotiationRoom
              prefillCompany={activeCompany}
              prefillRole={activeRole}
              prefillJobApplicationId={activeJobApplicationId}
              initialSessionId={initialFocus === 'negotiation' ? initialAssetSessionId : undefined}
            />
          )}

          <InterviewHistory
            history={history}
            onUpdateOutcome={handleUpdateOutcome}
            onAdd={handleAddInterview}
            onAddDebrief={handleAddDebriefClick}
            debriefCount={debriefs.length}
          />
        </div>
      )}
    </div>
  );
}
