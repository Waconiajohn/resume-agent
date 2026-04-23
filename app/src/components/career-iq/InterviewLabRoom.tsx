import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { API_BASE } from '@/lib/api';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { StarStoriesReviewPanel } from '@/components/panels/StarStoriesReviewPanel';
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
  Send,
} from 'lucide-react';
import { markdownToHtml } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import {
  buildAuthScopedStorageKey,
  readJsonFromLocalStorage,
  removeLocalStorageKey,
  writeJsonToLocalStorage,
} from '@/lib/auth-scoped-storage';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useInterviewPrep } from '@/hooks/useInterviewPrep';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { useInterviewDebriefs } from '@/hooks/useInterviewDebriefs';
import { DebriefForm } from '@/components/career-iq/DebriefForm';
import { MockInterviewView } from '@/components/career-iq/MockInterviewView';
import { ThankYouNoteRoom } from '@/components/career-iq/ThankYouNoteRoom';
import { SalaryNegotiationRoom } from '@/components/career-iq/SalaryNegotiationRoom';
import { NinetyDayPlanRoom } from '@/components/career-iq/NinetyDayPlanRoom';
import {
  resolveInterviewLabRouteState,
  resolveInterviewLabSessionTargets,
  type InterviewLabFollowUpView,
  type InterviewLabSection,
  type InterviewLabViewMode,
} from '@/components/career-iq/interview-lab/interviewLabRouting';

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

const HISTORY_STORAGE_NAMESPACE = 'careeriq_interview_history';
const LEGACY_HISTORY_STORAGE_KEY = HISTORY_STORAGE_NAMESPACE;

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

function historyStorageKey(userId: string | null) {
  return buildAuthScopedStorageKey(HISTORY_STORAGE_NAMESPACE, userId);
}

function normalizeHistory(value: unknown): PastInterview[] {
  return Array.isArray(value) ? value.filter(isPastInterview) : [];
}

function loadHistory(userId: string | null): PastInterview[] {
  const scoped = readJsonFromLocalStorage<unknown>(historyStorageKey(userId));
  if (scoped) {
    return normalizeHistory(scoped);
  }

  if (!userId) {
    const legacy = readJsonFromLocalStorage<unknown>(LEGACY_HISTORY_STORAGE_KEY);
    if (legacy) {
      const normalized = normalizeHistory(legacy);
      writeJsonToLocalStorage(historyStorageKey(null), normalized);
      removeLocalStorageKey(LEGACY_HISTORY_STORAGE_KEY);
      return normalized;
    }
  }

  return [];
}

function saveHistory(userId: string | null, history: PastInterview[]) {
  writeJsonToLocalStorage(historyStorageKey(userId), history);
  removeLocalStorageKey(LEGACY_HISTORY_STORAGE_KEY);
}

// --- Readiness Gauge (SVG ring) ---

function ReadinessGauge({ score, size = 72 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (score / 100);
  const cx = size / 2;
  const cy = size / 2;

  const color = score >= 80 ? 'var(--badge-green-text)' : score >= 50 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="var(--line-soft)"
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
        <span className="text-[12px] text-[var(--text-soft)] mt-0.5">%</span>
      </div>
    </div>
  );
}

// --- Category badge ---

const CATEGORY_CONFIG = {
  behavioral: { label: 'Behavioral', bg: 'bg-[var(--link)]/10', border: 'border-[var(--link)]/20', text: 'text-[var(--link)]' },
  technical: { label: 'Technical', bg: 'bg-[var(--badge-green-text)]/10', border: 'border-[var(--badge-green-text)]/20', text: 'text-[var(--badge-green-text)]' },
  situational: { label: 'Situational', bg: 'bg-[var(--badge-amber-text)]/10', border: 'border-[var(--badge-amber-text)]/20', text: 'text-[var(--badge-amber-text)]' },
  strategic: { label: 'Strategic', bg: 'bg-[var(--badge-red-text)]/10', border: 'border-[var(--badge-red-text)]/20', text: 'text-[var(--badge-red-text)]' },
  'culture-fit': { label: 'Culture Fit', bg: 'bg-[var(--accent-muted)]', border: 'border-[var(--line-soft)]', text: 'text-[var(--text-soft)]' },
  trap: { label: 'Trap', bg: 'bg-[var(--badge-red-text)]/10', border: 'border-[var(--badge-red-text)]/25', text: 'text-[var(--badge-red-text)]' },
} as const;

type QuestionCategory = keyof typeof CATEGORY_CONFIG;

function CategoryBadge({ category }: { category: QuestionCategory }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.behavioral;
  return (
    <span className={cn(
      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-medium border',
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
    easy: { label: 'Easy', color: 'text-[var(--badge-green-text)]/70' },
    medium: { label: 'Medium', color: 'text-[var(--badge-amber-text)]/70' },
    hard: { label: 'Hard', color: 'text-[var(--badge-red-text)]/70' },
  }[level];

  const dots = level === 'easy' ? 1 : level === 'medium' ? 2 : 3;

  return (
    <span className={cn('flex items-center gap-0.5 text-[12px] font-medium', cfg.color)}>
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
        className="flex items-center gap-1.5 text-[13px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors"
      >
        <Brain size={11} />
        Coaching Notes
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--link)]/10 bg-[var(--link)]/[0.03] p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb size={11} className="text-[var(--badge-amber-text)]/60" />
            <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">STAR Framework Guide</span>
          </div>

          {notes ? (
            <div className="space-y-2">
              {(['situation', 'task', 'action', 'result'] as const).map((key) => (
                <div key={key}>
                  <span className="text-[12px] font-semibold text-[var(--link)]/60 uppercase tracking-wider">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </span>
                  <p className="text-[13px] text-[var(--text-soft)] leading-relaxed mt-0.5">{notes[key]}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
                <span className="text-[var(--link)] font-medium">S</span>ituation: Set the scene — when, where, and why it mattered. 2–3 sentences.
              </p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
                <span className="text-[var(--link)] font-medium">T</span>ask: Your specific responsibility. Make your personal accountability explicit. 1–2 sentences.
              </p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
                <span className="text-[var(--link)] font-medium">A</span>ction: <span className="text-[var(--badge-amber-text)]/70 font-medium">This is the longest section (40–60%)</span>. The decisions you made, obstacles you navigated, and skills you applied. Use "I" not "we."
              </p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
                <span className="text-[var(--link)] font-medium">R</span>esult: Quantified outcomes — percentages, dollars, timelines, team sizes. Connect back to business value.
              </p>
              {questionText && (
                <div className="mt-2 pt-2 border-t border-[var(--line-soft)]">
                  <p className="text-[12px] text-[var(--text-soft)] italic">Tip: Reference a specific project from your resume to anchor this answer.</p>
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
            <Building2 size={13} className="text-[var(--link)]" />
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Company Overview</span>
          </div>
          <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">{data.overview}</p>
        </GlassCard>
      )}

      {data.recentNews && data.recentNews.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={12} className="text-[var(--badge-amber-text)]" />
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Recent Signals</span>
          </div>
          <ul className="space-y-1.5">
            {data.recentNews.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-[var(--text-soft)]">
                <span className="h-1 w-1 rounded-full bg-[var(--badge-amber-text)]/40 mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {data.cultureSignals && data.cultureSignals.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={12} className="text-[var(--badge-green-text)]" />
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Culture Signals</span>
          </div>
          <ul className="space-y-1.5">
            {data.cultureSignals.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-[var(--text-soft)]">
                <span className="h-1 w-1 rounded-full bg-[var(--badge-green-text)]/40 mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {data.risks && data.risks.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={12} className="text-[var(--badge-red-text)]" />
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Risk Factors</span>
          </div>
          <ul className="space-y-1.5">
            {data.risks.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-[var(--text-soft)]">
                <span className="h-1 w-1 rounded-full bg-[var(--badge-red-text)]/40 mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {data.competitors && data.competitors.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={12} className="text-[var(--text-soft)]" />
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Competitors</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.competitors.map((c, i) => (
              <span key={i} className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1 text-[13px] text-[var(--text-soft)]">
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
          <div className="text-[13px] font-semibold text-[var(--text-strong)]">Readiness Score</div>
          <div className="text-[12px] text-[var(--text-soft)] mt-0.5">
            {practicedIds.size} of {questions.length} questions practiced
          </div>
          <div className="text-[13px] text-[var(--text-soft)] mt-1">
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
            'rounded-md px-2.5 py-1 text-[13px] font-medium border transition-colors',
            activeCategory === 'all'
              ? 'border-[var(--line-strong)] bg-[var(--surface-1)] text-[var(--text-strong)]'
              : 'border-[var(--line-soft)] bg-transparent text-[var(--text-soft)] hover:text-[var(--text-soft)]',
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
                'rounded-md px-2.5 py-1 text-[13px] font-medium border transition-colors',
                activeCategory === cat
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'border-[var(--line-soft)] bg-transparent text-[var(--text-soft)] hover:text-[var(--text-soft)]',
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
                'rounded-xl border bg-[var(--accent-muted)] p-4 transition-all',
                practiced ? 'border-[var(--badge-green-text)]/15 bg-[var(--badge-green-text)]/[0.02]' : 'border-[var(--line-soft)]',
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => togglePracticed(globalIdx)}
                  className={cn(
                    'flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border transition-colors',
                    practiced
                      ? 'border-[var(--badge-green-text)]/50 bg-[var(--badge-green-text)]/15'
                      : 'border-[var(--line-strong)] bg-transparent hover:border-[var(--badge-green-text)]/30',
                  )}
                  title={practiced ? 'Mark as not practiced' : 'Mark as practiced'}
                >
                  {practiced && (
                    <CheckCircle2 size={14} className="text-[var(--badge-green-text)] -mt-0.5 -ml-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <CategoryBadge category={item.category} />
                    <DifficultyBadge level={item.difficulty} />
                  </div>
                  <p className={cn(
                    'text-[13px] leading-relaxed',
                    practiced ? 'text-[var(--text-soft)] line-through' : 'text-[var(--text-muted)]',
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
        <Calendar size={18} className="text-[var(--link)]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Upcoming Interviews</h3>
      </div>

      {interviews.length === 0 ? (
        <div className="text-center py-6">
          <Mic size={24} className="text-[var(--text-soft)] mx-auto mb-2" />
          <p className="text-[13px] text-[var(--text-soft)]">No interviews scheduled</p>
          <p className="text-[13px] text-[var(--text-soft)] mt-1">
            Open an application from My Applications, or move an application into the Interviewing stage.
          </p>
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
                    ? 'bg-[var(--accent-muted)] border border-[var(--line-soft)]'
                    : 'border border-transparent hover:bg-[var(--accent-muted)]',
                )}
              >
                <div className="rounded-lg bg-[var(--link)]/10 p-2 flex-shrink-0">
                  <Building2 size={16} className="text-[var(--link)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text-muted)]">{interview.company}</div>
                  <div className="text-[12px] text-[var(--text-soft)]">{interview.role}</div>
                  <div className="text-[13px] text-[var(--text-soft)] mt-0.5">{interview.round}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  {interview.date !== 'TBD' && (
                    <div className="text-[12px] font-medium text-[var(--text-soft)]">{interview.date}</div>
                  )}
                  {interview.time !== 'TBD' && (
                    <div className="text-[13px] text-[var(--text-soft)]">{interview.time}</div>
                  )}
                  <div className="text-[12px] text-[var(--text-soft)] capitalize mt-0.5">{interview.type}</div>
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
    advanced: { icon: CheckCircle2, color: 'text-[var(--badge-green-text)]', label: 'Advanced' },
    rejected: { icon: XCircle, color: 'text-[var(--badge-red-text)]', label: 'Not Selected' },
    pending: { icon: Clock, color: 'text-[var(--badge-amber-text)]', label: 'Pending' },
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
        <Clock size={18} className="text-[var(--link)]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Interview History</h3>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onAddDebrief}
            className="flex items-center gap-1 text-[13px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors"
          >
            <ClipboardList size={12} />
            Add Debrief
            {debriefCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[var(--link)]/15 px-1.5 py-0.5 text-[12px] text-[var(--link)]">
                {debriefCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
          >
            <Plus size={12} />
            Add Interview
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-[var(--link)]/15 bg-[var(--link)]/[0.04] p-4 mb-4 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Company"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
            />
            <input
              type="text"
              placeholder="Role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
            />
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
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
          return (
            <div key={interview.id} className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-[var(--text-soft)]">{interview.company}</span>
                <div className="flex items-center gap-1">
                  {outcomes.map((o) => {
                    const cfg = outcomeConfig[o];
                    const isActive = interview.outcome === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onUpdateOutcome(interview.id, o)}
                        className={cn(
                          'text-[12px] px-1.5 py-0.5 rounded-full transition-colors',
                          isActive ? `${cfg.color} font-medium` : 'text-[var(--text-soft)] hover:text-[var(--text-soft)]',
                        )}
                        title={cfg.label}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-[12px] text-[var(--text-soft)]">{interview.role} · {interview.date}</div>
              {interview.notes && (
                <p className="mt-1.5 text-[13px] text-[var(--text-soft)] leading-relaxed">{interview.notes}</p>
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
        <div className="rounded-lg bg-[var(--link)]/10 p-2">
          <Loader2 size={18} className="text-[var(--link)] animate-spin" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">
            Preparing for {company}
          </h3>
          <p className="text-[12px] text-[var(--text-soft)]">
            {currentStage ? stageLabels[currentStage] ?? currentStage : 'Starting...'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {activityMessages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--link)]/40 mt-1.5 flex-shrink-0" />
            <span className="text-[12px] text-[var(--text-soft)] leading-relaxed">{msg.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {activityMessages.length === 0 && (
        <div className="text-center py-8">
          <Loader2 size={20} className="text-[var(--text-soft)] mx-auto mb-2 animate-spin" />
          <p className="text-[12px] text-[var(--text-soft)]">Connecting to pipeline...</p>
        </div>
      )}
    </GlassCard>
  );
}

// --- Prep Report View ---


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
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Interview Prep
        </button>
      </div>

      {/* Header card */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--link)]/10 p-2.5 border border-[var(--link)]/15">
              <FileText size={18} className="text-[var(--link)]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">
                Interview Brief — {company}
              </h3>
              <p className="text-[12px] text-[var(--text-soft)]">{role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {qualityScore !== null && (
              <ReadinessGauge score={qualityScore} size={52} />
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mt-4 p-1 rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] w-fit">
          {([['report', 'Interview Brief'], ['questions', 'Practice Questions']] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-medium transition-all',
                activeTab === tab
                  ? 'bg-[var(--surface-1)] text-[var(--text-strong)] shadow-sm'
                  : 'text-[var(--text-soft)] hover:text-[var(--text-soft)]',
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
              prose-headings:text-[var(--text-strong)] prose-headings:font-semibold
              prose-h1:text-lg prose-h1:border-b prose-h1:border-[var(--line-soft)] prose-h1:pb-2 prose-h1:mb-4
              prose-h2:text-[15px] prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-[var(--link)]/90
              prose-h3:text-[14px] prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-[var(--text-soft)] prose-p:text-[13px] prose-p:leading-relaxed
              prose-li:text-[var(--text-soft)] prose-li:text-[13px]
              prose-strong:text-[var(--text-strong)]
              prose-em:text-[var(--text-soft)]
              prose-blockquote:border-[var(--link)]/30 prose-blockquote:text-[var(--text-soft)] prose-blockquote:bg-[var(--link)]/[0.03] prose-blockquote:rounded-r-lg
              prose-hr:border-[var(--line-soft)]"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
          />
        </GlassCard>
      ) : (
        <GlassCard className="p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ClipboardList size={24} className="text-[var(--text-soft)] mb-3" />
            <p className="text-[13px] text-[var(--text-soft)] max-w-sm leading-relaxed">
              Practice questions will be generated from your interview prep report. Run a prep session to get role-specific questions.
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// --- Post-Interview Follow-Up Email Form ---

type FollowUpSituation = 'post_interview' | 'no_response' | 'rejection_graceful' | 'keep_warm' | 'negotiation_counter';

const FOLLOW_UP_SITUATION_LABELS: Record<FollowUpSituation, { label: string; description: string }> = {
  post_interview: { label: 'Status check-in', description: '5-7 days after interview, no word yet' },
  no_response: { label: 'No response (2+ weeks)', description: 'Polite persistence after silence' },
  rejection_graceful: { label: 'Graceful rejection response', description: 'Keep the door open, build the relationship' },
  keep_warm: { label: 'Keep warm', description: 'A contact worth maintaining for future opportunities' },
  negotiation_counter: { label: 'Negotiation counter', description: 'Acknowledge offer + frame your counter' },
};

interface PostInterviewFollowUpEmailFormProps {
  company: string;
  role: string;
  onBack: () => void;
}

function PostInterviewFollowUpEmailForm({ company, role, onBack }: PostInterviewFollowUpEmailFormProps) {
  const [situation, setSituation] = useState<FollowUpSituation>('post_interview');
  const [recipientName, setRecipientName] = useState('');
  const [recipientTitle, setRecipientTitle] = useState('');
  const [specificContext, setSpecificContext] = useState('');
  const [result, setResult] = useState<null | { subject: string; body: string; tone_notes: string; timing_guidance: string }>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/interview-prep/follow-up-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          role,
          situation,
          recipient_name: recipientName || undefined,
          recipient_title: recipientTitle || undefined,
          specific_context: specificContext || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Failed to generate email. Please try again.');
        return;
      }

      const data = await res.json() as { subject: string; body: string; tone_notes: string; timing_guidance: string };
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [company, role, situation, recipientName, recipientTitle, specificContext]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    const text = `Subject: ${result.subject}\n\n${result.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [result]);

  const inputClass = 'w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30';
  const labelClass = 'block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5';

  return (
    <GlassCard className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-[var(--link)]/10 p-2">
          <Send size={15} className="text-[var(--link)]" />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Follow-Up Email</h3>
          <p className="text-[13px] text-[var(--text-soft)]">{company} — {role}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="ml-auto text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className={labelClass}>Situation</label>
        <div className="space-y-1.5">
          {(Object.entries(FOLLOW_UP_SITUATION_LABELS) as Array<[FollowUpSituation, { label: string; description: string }]>).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSituation(key)}
              className={cn(
                'w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                situation === key
                  ? 'border-[var(--link)]/25 bg-[var(--link)]/[0.06]'
                  : 'border-[var(--line-soft)] hover:border-[var(--line-soft)] hover:bg-[var(--accent-muted)]',
              )}
            >
              <div className={cn(
                'mt-0.5 h-3 w-3 rounded-full border-2 flex-shrink-0',
                situation === key ? 'border-[var(--link)] bg-[var(--link)]/30' : 'border-[var(--line-strong)]',
              )} />
              <div>
                <div className={cn('text-[12px] font-medium', situation === key ? 'text-[var(--text-strong)]' : 'text-[var(--text-soft)]')}>
                  {cfg.label}
                </div>
                <div className="text-[13px] text-[var(--text-soft)] mt-0.5">{cfg.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Recipient name</label>
          <input
            type="text"
            placeholder="e.g. Sarah Chen"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Recipient title</label>
          <input
            type="text"
            placeholder="e.g. VP of Engineering"
            value={recipientTitle}
            onChange={(e) => setRecipientTitle(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          {situation === 'negotiation_counter'
            ? 'Offer details and what you want to counter'
            : situation === 'rejection_graceful'
            ? 'Any specific connection or moment worth referencing'
            : 'Any additional context'}
        </label>
        <textarea
          rows={3}
          placeholder={
            situation === 'negotiation_counter'
              ? 'e.g. Offer was $180k base. I was expecting $200k based on market and my experience...'
              : situation === 'rejection_graceful'
              ? 'e.g. We discussed the supply chain restructuring project — that was a great conversation...'
              : 'Anything specific you want woven in...'
          }
          value={specificContext}
          onChange={(e) => setSpecificContext(e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-3 py-2">
          <AlertCircle size={13} className="text-[var(--badge-red-text)] flex-shrink-0" />
          <span className="text-[12px] text-[var(--badge-red-text)]/80">{error}</span>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Generated email</span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="ml-auto text-[13px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors flex items-center gap-1"
            >
              {copied ? <CheckCircle2 size={11} /> : <FileText size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div>
            <div className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Subject</div>
            <p className="text-[12px] text-[var(--text-muted)] font-medium">{result.subject}</p>
          </div>
          <div>
            <div className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Body</div>
            <p className="text-[12px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap">{result.body}</p>
          </div>
          {result.timing_guidance && (
            <div className="rounded-lg border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-text)]/[0.04] px-3 py-2">
              <p className="text-[13px] text-[var(--badge-amber-text)]/70">{result.timing_guidance}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <GlassButton
          variant="primary"
          onClick={() => void handleGenerate()}
          disabled={loading}
          className="text-[13px]"
        >
          {loading ? (
            <Loader2 size={13} className="mr-1.5 animate-spin" />
          ) : (
            <Send size={13} className="mr-1.5" />
          )}
          {loading ? 'Writing...' : result ? 'Regenerate' : 'Generate Email'}
        </GlassButton>
        <GlassButton variant="ghost" onClick={onBack} className="text-[13px]">
          Done
        </GlassButton>
      </div>
    </GlassCard>
  );
}

// --- Main component ---

const LAB_SECTION_COPY: Record<InterviewLabSection, { label: string; description: string }> = {
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
    label: 'Follow-up & Negotiate',
    description: 'Debrief, thank-you notes, follow-up emails, and salary negotiation prep — everything you need after the interview.',
  },
};

const LAB_SECTION_ORDER: InterviewLabSection[] = ['prep', 'practice', 'documents', 'follow_up'];

const LAB_SEQUENCE_COPY: Record<InterviewLabSection, string> = {
  prep: 'Research the role and build the interview brief.',
  practice: 'Pressure-test your positioning out loud before the conversation.',
  documents: 'Create leave-behinds that reinforce the same story.',
  follow_up: 'Debrief, send the right follow-up, and prep for the salary conversation.',
};

const FOLLOW_UP_TOOL_COPY: Array<{
  view: InterviewLabFollowUpView;
  label: string;
  description: string;
  buttonLabel: string;
  openLabel: string;
  icon: typeof ClipboardList;
}> = [
  {
    view: 'debrief',
    label: 'Interview Debrief',
    description: 'Capture what happened while it is still fresh — strengths, weak spots, follow-up actions, and company signals.',
    buttonLabel: 'Debrief',
    openLabel: 'Open Debrief',
    icon: ClipboardList,
  },
  {
    view: 'thank_you',
    label: 'Thank You Note',
    description: 'Turn the debrief into a focused follow-up note while the conversation is still fresh.',
    buttonLabel: 'Thank You Note',
    openLabel: 'Open Thank You Note',
    icon: Mail,
  },
  {
    view: 'follow_up_email',
    label: 'Follow-Up Email',
    description: 'Status check-in, no-response nudge, graceful rejection response, or negotiation counter — drafted and ready to review.',
    buttonLabel: 'Follow-Up Email',
    openLabel: 'Open Follow-Up Email',
    icon: Send,
  },
  {
    view: 'negotiation',
    label: 'Negotiation Prep',
    description: 'Get ready for the offer conversation without leaving this workflow.',
    buttonLabel: 'Negotiation Prep',
    openLabel: 'Open Negotiation Prep',
    icon: Star,
  },
];

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
  const initialRouteState = resolveInterviewLabRouteState(initialFocus);
  const sessionTargets = resolveInterviewLabSessionTargets(initialFocus, initialAssetSessionId);
  const [history, setHistory] = useState<PastInterview[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null | undefined>(undefined);
  const [viewMode, setViewMode] = useState<InterviewLabViewMode>('lab');
  const [activeSection, setActiveSection] = useState<InterviewLabSection>(initialRouteState.activeSection);
  const [followUpView, setFollowUpView] = useState<InterviewLabFollowUpView>(initialRouteState.followUpView);
  const [activeCompany, setActiveCompany] = useState(initialCompany ?? '');
  const [activeRole, setActiveRole] = useState(initialRole ?? '');
  const [activeJobApplicationId, setActiveJobApplicationId] = useState<string | undefined>(initialJobApplicationId);
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [jdWarning, setJdWarning] = useState(false);
  const [mockInterviewConfig, setMockInterviewConfig] = useState<MockInterviewConfig | null>(null);
  const [mockInterviewLoading, setMockInterviewLoading] = useState(false);
  const [mockInterviewError, setMockInterviewError] = useState<string | null>(null);
  const [practiceQuestionType, setPracticeQuestionType] = useState<'behavioral' | 'technical' | 'situational'>('behavioral');

  const { debriefs, createDebrief } = useInterviewDebriefs();

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    starStoriesReviewData,
    startPipeline,
    respondToGate,
    reset,
  } = useInterviewPrep();
  const { priorResult: savedPrepResult, loading: savedPrepLoading } = usePriorResult<{
    report_markdown?: string;
    quality_score?: number;
  }>({
    productSlug: 'interview-prep',
    skip: status !== 'idle' || !sessionTargets.prepSessionId,
    sessionId: sessionTargets.prepSessionId,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadHistoryForUser(userIdOverride?: string | null) {
      const resolvedUserId = userIdOverride === undefined
        ? (await supabase.auth.getUser()).data.user?.id ?? null
        : userIdOverride;
      if (cancelled) return;
      setActiveUserId(resolvedUserId);
      setHistory(loadHistory(resolvedUserId));
    }

    void loadHistoryForUser(undefined);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadHistoryForUser(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === 'complete' && report) {
      setViewMode('report');
    }
  }, [status, report]);

  useEffect(() => {
    if (sessionTargets.prepSessionId && savedPrepResult?.report_markdown) {
      setViewMode('report');
    }
  }, [savedPrepResult?.report_markdown, sessionTargets.prepSessionId]);

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
    const nextRouteState = resolveInterviewLabRouteState(initialFocus);
    setActiveSection(nextRouteState.activeSection);
    setFollowUpView(nextRouteState.followUpView);
  }, [initialFocus]);

  useEffect(() => {
    if (activeSection !== 'follow_up' && followUpView !== 'overview') {
      setFollowUpView('overview');
    }
  }, [activeSection, followUpView]);

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
      saveHistory(activeUserId ?? null, updated);
      return updated;
    });
  }, [activeUserId]);

  const handleAddInterview = useCallback((entry: Omit<PastInterview, 'id'>) => {
    setHistory((prev) => {
      const newEntry: PastInterview = { ...entry, id: `h${Date.now()}` };
      const updated = [newEntry, ...prev];
      saveHistory(activeUserId ?? null, updated);
      return updated;
    });
  }, [activeUserId]);

  const handleAddDebriefClick = useCallback(() => {
    setActiveSection('follow_up');
    setFollowUpView('debrief');
  }, []);

  const handleDebriefSave = useCallback(
    async (data: Parameters<typeof createDebrief>[0]) => {
      return await createDebrief(data);
    },
    [createDebrief],
  );

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
      setMockInterviewError('Something went wrong. Please try again.');
    } finally {
      setMockInterviewLoading(false);
    }
  }, [fetchResumeText]);

  const handleStartPracticeQuestion = useCallback(async () => {
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
      setMockInterviewConfig({ resumeText, mode: 'practice', questionType: practiceQuestionType });
      setViewMode('mock_interview');
    } catch (err) {
      console.error('[InterviewLab] Failed to load resume for practice session:', err);
      setMockInterviewError('Something went wrong. Please try again.');
    } finally {
      setMockInterviewLoading(false);
    }
  }, [fetchResumeText, practiceQuestionType]);

  const handleMockInterviewBack = useCallback(() => {
    setViewMode('lab');
    setMockInterviewConfig(null);
  }, []);

  const toggleFollowUpTool = useCallback((view: InterviewLabFollowUpView) => {
    setActiveSection('follow_up');
    setFollowUpView((current) => (current === view ? 'overview' : view));
  }, []);

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
      <div className="room-shell">
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
      <div className="room-shell">
        <div className="room-header">
          <div className="room-header-copy">
            <div className="eyebrow-label">Interview Prep</div>
            <h1 className="room-title">Building your interview brief</h1>
            <p className="room-subtitle">We’re pulling together the strongest prep signal for this role now.</p>
          </div>
        </div>

        {inputError ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[var(--badge-red-text)]" />
              <span className="text-[13px] text-[var(--badge-red-text)]">{inputError}</span>
            </div>
            <GlassButton variant="ghost" onClick={handleBack} size="sm">
              <ArrowLeft size={14} className="mr-1.5" />
              Back to Interview Prep
            </GlassButton>
          </GlassCard>
        ) : loadingInputs ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="text-[var(--link)] animate-spin" />
              <span className="text-[13px] text-[var(--text-soft)]">Loading resume and job details...</span>
            </div>
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[var(--badge-red-text)]" />
              <span className="text-[13px] text-[var(--badge-red-text)]">{error}</span>
            </div>
            <GlassButton variant="ghost" onClick={handleBack} size="sm">
              <ArrowLeft size={14} className="mr-1.5" />
              Back to Interview Prep
            </GlassButton>
          </GlassCard>
        ) : status === 'star_stories_review' && starStoriesReviewData ? (
          <StarStoriesReviewPanel
            data={starStoriesReviewData}
            onPipelineRespond={(gate, response) => void respondToGate(gate, response)}
          />
        ) : (
          <>
            {jdWarning && (
              <GlassCard className="p-4 mb-0 border-[var(--badge-amber-text)]/20">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-[var(--badge-amber-text)] flex-shrink-0" />
                  <span className="text-[12px] text-[var(--badge-amber-text)]/80">
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
            className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
          >
            Cancel and return
          </button>
        </div>
      </div>
    );
  }

  // Default lab view
  return (
    <div className="room-shell">
      <div className="room-header">
        <div className="room-header-copy">
          <div className="eyebrow-label">Interview Prep</div>
          <h1 className="room-title">Prep, practice, and follow-up in one place</h1>
          <p className="room-subtitle">
            Select an upcoming interview or add one manually to get started.
          </p>
        </div>
      </div>

      {mockInterviewError && (
        <div className="rounded-xl border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-[var(--badge-red-text)] flex-shrink-0" />
          <span className="text-[13px] text-[var(--badge-red-text)]/80">{mockInterviewError}</span>
        </div>
      )}

      {savedPrepLoading && sessionTargets.prepSessionId && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading saved interview prep...
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <div className="eyebrow-label">Interview workflow</div>
        <div className="mt-3 grid gap-3 lg:grid-cols-4">
          {LAB_SECTION_ORDER.map((sectionId, index) => {
            const isActive = activeSection === sectionId;
            return (
              <button
                key={sectionId}
                type="button"
                onClick={() => setActiveSection(sectionId)}
                className={cn(
                  'rounded-2xl border p-3.5 text-left transition-colors',
                  isActive
                    ? 'border-[var(--link)]/30 bg-[var(--link)]/[0.06]'
                    : 'border-[var(--line-soft)] bg-[var(--accent-muted)] hover:border-[var(--line-strong)]',
                )}
              >
                <div className="text-[12px] font-medium uppercase tracking-widest text-[var(--link)]">
                  Step {index + 1}
                </div>
                <div className="mt-2 text-base font-semibold text-[var(--text-strong)]">
                  {LAB_SECTION_COPY[sectionId].label}
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[var(--text-soft)]">
                  {LAB_SEQUENCE_COPY[sectionId]}
                </p>
                <div className="mt-3 text-[12px] font-medium text-[var(--text-soft)]">
                  {isActive ? 'Current' : 'Open'}
                </div>
              </button>
            );
          })}
        </div>
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
                    round: 'From application',
                    jobApplicationId: card.id,
                  }))
                : activeCompany && activeRole
                  ? [
                      // Sprint C4/C5 — synthesize an entry from the parent
                      // application so users can generate prep inside an
                      // application workspace without first having to schedule
                      // an interview on the pipeline. Closes the "add manually"
                      // gap by making prep available the moment an application
                      // exists.
                      {
                        id: activeJobApplicationId ?? `draft-${activeCompany}-${activeRole}`,
                        company: activeCompany,
                        role: activeRole,
                        date: 'TBD',
                        time: 'TBD',
                        type: 'video' as const,
                        round: 'Application draft',
                        jobApplicationId: activeJobApplicationId,
                      },
                    ]
                  : []
            }
            onGeneratePrep={handleGeneratePrep}
          />
        </>
      )}

      {activeSection === 'practice' && (
        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl text-sm leading-relaxed text-[var(--text-soft)]">
                Run the full mock interview when you want to hear your positioning out loud, tighten weak answers, and expose where your proof still feels thin.
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

          <GlassCard className="p-5">
            <div className="mb-3">
              <div className="text-[12px] font-medium uppercase tracking-widest text-[var(--link)] mb-1">Practice Mode</div>
              <p className="text-[13px] leading-5 text-[var(--text-soft)]">
                Practice one targeted question — choose a type and get immediate STAR-framework feedback.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <div className="flex rounded-lg overflow-hidden border border-[var(--line-soft)]">
                {(['behavioral', 'technical', 'situational'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPracticeQuestionType(type)}
                    className={cn(
                      'px-3 py-1.5 text-[12px] font-medium capitalize transition-colors',
                      practiceQuestionType === type
                        ? 'bg-[var(--link)]/20 text-[var(--link)]'
                        : 'bg-transparent text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-muted)]',
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <GlassButton
                variant="ghost"
                onClick={() => void handleStartPracticeQuestion()}
                disabled={mockInterviewLoading}
                className="text-[13px]"
              >
                {mockInterviewLoading ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <Brain size={13} className="mr-1.5" />
                )}
                Practice One Question
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {activeSection === 'documents' && (
        <NinetyDayPlanRoom
          initialTargetRole={activeRole}
          initialTargetCompany={activeCompany}
          initialJobApplicationId={activeJobApplicationId}
          initialSessionId={sessionTargets.planSessionId}
        />
      )}

      {activeSection === 'follow_up' && (
        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl text-sm leading-relaxed text-[var(--text-soft)]">
                Debrief, thank-you notes, follow-up emails, and negotiation prep — all tied to the same story you built in prep.
              </div>
              <div className="flex flex-wrap gap-2">
                {FOLLOW_UP_TOOL_COPY.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <GlassButton
                      key={tool.view}
                      variant="ghost"
                      onClick={() => toggleFollowUpTool(tool.view)}
                      className="text-[13px]"
                    >
                      <Icon size={14} className="mr-1.5" />
                      {followUpView === tool.view ? `Hide ${tool.buttonLabel}` : tool.buttonLabel}
                    </GlassButton>
                  );
                })}
              </div>
            </div>
          </GlassCard>

          {followUpView === 'debrief' && (
            <DebriefForm
              onSave={handleDebriefSave}
              onCancel={() => setFollowUpView('overview')}
              onNavigateToThankYou={() => setFollowUpView('thank_you')}
              initialCompany={activeCompany}
              initialRole={activeRole}
              initialJobApplicationId={activeJobApplicationId}
            />
          )}

          {followUpView === 'thank_you' && (
            <ThankYouNoteRoom
              initialCompany={activeCompany}
              initialRole={activeRole}
              initialJobApplicationId={activeJobApplicationId}
              initialSessionId={sessionTargets.thankYouSessionId}
            />
          )}

          {followUpView === 'follow_up_email' && (
            <PostInterviewFollowUpEmailForm
              company={activeCompany || 'Unknown company'}
              role={activeRole || 'Unknown role'}
              onBack={() => setFollowUpView('overview')}
            />
          )}

          {followUpView === 'negotiation' && (
            <SalaryNegotiationRoom
              prefillCompany={activeCompany}
              prefillRole={activeRole}
              prefillJobApplicationId={activeJobApplicationId}
              initialSessionId={sessionTargets.negotiationSessionId}
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
