import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { InterviewDebrief, InterviewerNote } from '@/hooks/useInterviewDebriefs';
import {
  Plus,
  X,
  ThumbsUp,
  Minus,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  Send,
  CheckSquare,
  AlertTriangle,
  TrendingUp,
  Users,
  MessageSquare,
  Zap,
  Flag,
} from 'lucide-react';

export interface DebriefFormProps {
  onSave: (data: Omit<InterviewDebrief, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
  onCancel: () => void;
  onNavigateToThankYou?: (interviewerNotes: InterviewerNote[]) => void;
  initialCompany?: string;
  initialRole?: string;
  initialJobApplicationId?: string;
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const INPUT_CLASS =
  'rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30';

const LABEL_CLASS = 'text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-1.5 block';

// --- Performance dimension score (mini bar gauge) ---

type ScoreLevel = 1 | 2 | 3 | 4 | 5;

const SCORE_LABELS: Record<ScoreLevel, string> = {
  1: 'Poor',
  2: 'Weak',
  3: 'Average',
  4: 'Strong',
  5: 'Excellent',
};

const SCORE_COLORS: Record<ScoreLevel, string> = {
  1: 'var(--badge-red-text)',
  2: 'var(--badge-red-text)',
  3: 'var(--badge-amber-text)',
  4: 'var(--badge-green-text)',
  5: 'var(--badge-green-text)',
};

function PerformanceScoreSelector({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: ScoreLevel;
  onChange: (v: ScoreLevel) => void;
}) {
  const color = SCORE_COLORS[value];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--text-soft)]">{icon}</span>
          <span className="text-[12px] font-medium text-[var(--text-soft)]">{label}</span>
        </div>
        <span className="text-[13px] font-medium" style={{ color }}>{SCORE_LABELS[value]}</span>
      </div>
      <div className="flex items-center gap-1">
        {([1, 2, 3, 4, 5] as ScoreLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={cn(
              'flex-1 h-2 rounded-full transition-all',
              level <= value ? 'opacity-100' : 'opacity-15',
            )}
            style={{ backgroundColor: level <= value ? color : 'rgba(255,255,255,0.2)' }}
            title={SCORE_LABELS[level]}
          />
        ))}
      </div>
    </div>
  );
}

// --- Follow-up action item with priority ---

type FollowUpPriority = 'urgent' | 'important' | 'normal';

interface FollowUpItem {
  text: string;
  priority: FollowUpPriority;
  done: boolean;
}

const PRIORITY_CONFIG: Record<FollowUpPriority, { label: string; bg: string; border: string; text: string }> = {
  urgent: { label: 'Urgent', bg: 'bg-[var(--badge-red-text)]/10', border: 'border-[var(--badge-red-text)]/20', text: 'text-[var(--badge-red-text)]' },
  important: { label: 'Important', bg: 'bg-[var(--badge-amber-text)]/10', border: 'border-[var(--badge-amber-text)]/20', text: 'text-[var(--badge-amber-text)]' },
  normal: { label: 'Normal', bg: 'bg-[var(--accent-muted)]', border: 'border-[var(--line-soft)]', text: 'text-[var(--text-soft)]' },
};

function FollowUpChecklist({
  items,
  onChange,
}: {
  items: FollowUpItem[];
  onChange: (items: FollowUpItem[]) => void;
}) {
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<FollowUpPriority>('normal');

  const addItem = () => {
    if (!newText.trim()) return;
    onChange([...items, { text: newText.trim(), priority: newPriority, done: false }]);
    setNewText('');
    setNewPriority('normal');
  };

  const toggleDone = (i: number) => {
    onChange(items.map((item, idx) => idx === i ? { ...item, done: !item.done } : item));
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const setPriority = (i: number, priority: FollowUpPriority) => {
    onChange(items.map((item, idx) => idx === i ? { ...item, priority } : item));
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-[12px] text-[var(--text-soft)] py-1">No actions yet — add the key next steps below.</p>
      )}

      {items.map((item, i) => {
        const cfg = PRIORITY_CONFIG[item.priority];
        return (
          <div key={i} className={cn(
            'flex items-start gap-2.5 rounded-lg border p-2.5 transition-all',
            item.done ? 'border-[var(--line-soft)] bg-transparent opacity-50' : `${cfg.bg} ${cfg.border}`,
          )}>
            <button
              type="button"
              onClick={() => toggleDone(i)}
              className={cn(
                'flex-shrink-0 mt-0.5 h-4 w-4 rounded border transition-colors',
                item.done
                  ? 'border-[var(--badge-green-text)]/40 bg-[var(--badge-green-text)]/15'
                  : 'border-[var(--line-strong)] bg-transparent hover:border-[var(--badge-green-text)]/40',
              )}
            >
              {item.done && (
                <CheckSquare size={14} className="text-[var(--badge-green-text)] -mt-0.5 -ml-0.5" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <span className={cn('text-[12px]', item.done ? 'text-[var(--text-soft)] line-through' : 'text-[var(--text-muted)]')}>
                {item.text}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {(['urgent', 'important', 'normal'] as FollowUpPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(i, p)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[12px] font-medium border transition-colors',
                    item.priority === p
                      ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].border} ${PRIORITY_CONFIG[p].text}`
                      : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text-soft)]',
                  )}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="ml-1 text-[var(--text-soft)] hover:text-[var(--badge-red-text)]/60 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          placeholder="Add a follow-up action..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          className={cn(INPUT_CLASS, 'flex-1')}
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as FollowUpPriority)}
          className={cn(INPUT_CLASS, 'w-28')}
        >
          <option value="normal">Normal</option>
          <option value="important">Important</option>
          <option value="urgent">Urgent</option>
        </select>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-[13px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors px-2 py-1.5 rounded-lg border border-[var(--link)]/20 hover:border-[var(--link)]/40"
        >
          <Plus size={12} />
          Add
        </button>
      </div>
    </div>
  );
}

// --- Sentiment analysis summary ---

type SentimentSignal = 'positive' | 'neutral' | 'concerning';

interface SentimentItem {
  signal: SentimentSignal;
  observation: string;
}

const SENTIMENT_CONFIG: Record<SentimentSignal, { bg: string; border: string; text: string; dot: string }> = {
  positive: { bg: 'bg-[var(--badge-green-text)]/[0.05]', border: 'border-[var(--badge-green-text)]/15', text: 'text-[var(--badge-green-text)]/80', dot: 'bg-[var(--badge-green-text)]' },
  neutral: { bg: 'bg-[var(--accent-muted)]', border: 'border-[var(--line-soft)]', text: 'text-[var(--text-soft)]', dot: 'bg-[var(--line-strong)]' },
  concerning: { bg: 'bg-[var(--badge-red-text)]/[0.04]', border: 'border-[var(--badge-red-text)]/12', text: 'text-[var(--badge-red-text)]/70', dot: 'bg-[var(--badge-red-text)]' },
};

function SentimentSummary({
  items,
  onChange,
}: {
  items: SentimentItem[];
  onChange: (items: SentimentItem[]) => void;
}) {
  const [newObservation, setNewObservation] = useState('');
  const [newSignal, setNewSignal] = useState<SentimentSignal>('neutral');

  const addItem = () => {
    if (!newObservation.trim()) return;
    onChange([...items, { signal: newSignal, observation: newObservation.trim() }]);
    setNewObservation('');
    setNewSignal('neutral');
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
        How did the interviewer likely perceive you? Add signals you picked up — body language, energy shifts, follow-up questions.
      </p>

      {items.length === 0 && (
        <p className="text-[12px] text-[var(--text-soft)] py-1">No signals recorded yet.</p>
      )}

      {items.map((item, i) => {
        const cfg = SENTIMENT_CONFIG[item.signal];
        return (
          <div key={i} className={cn('flex items-start gap-2.5 rounded-lg border p-2.5', cfg.bg, cfg.border)}>
            <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5', cfg.dot)} />
            <span className={cn('flex-1 text-[12px] leading-relaxed', cfg.text)}>{item.observation}</span>
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="flex-shrink-0 text-[var(--text-soft)] hover:text-[var(--badge-red-text)]/60 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          placeholder="e.g. They leaned forward when I described the P&L turnaround..."
          value={newObservation}
          onChange={(e) => setNewObservation(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          className={cn(INPUT_CLASS, 'flex-1')}
        />
        <select
          value={newSignal}
          onChange={(e) => setNewSignal(e.target.value as SentimentSignal)}
          className={cn(INPUT_CLASS, 'w-28')}
        >
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="concerning">Concerning</option>
        </select>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-[13px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors px-2 py-1.5 rounded-lg border border-[var(--link)]/20 hover:border-[var(--link)]/40"
        >
          <Plus size={12} />
          Add
        </button>
      </div>
    </div>
  );
}

// --- Impression button ---

interface ImpressionButtonProps {
  value: InterviewDebrief['overall_impression'];
  current: InterviewDebrief['overall_impression'];
  icon: React.ReactNode;
  label: string;
  color: string;
  activeClass: string;
  onClick: (v: InterviewDebrief['overall_impression']) => void;
}

function ImpressionButton({
  value,
  current,
  icon,
  label,
  activeClass,
  onClick,
}: ImpressionButtonProps) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        'flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[12px] font-medium transition-all',
        isActive
          ? activeClass
          : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:text-[var(--text-soft)]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Interviewer card ---

interface InterviewerCardProps {
  note: InterviewerNote;
  index: number;
  onChange: (index: number, note: InterviewerNote) => void;
  onRemove: (index: number) => void;
}

function InterviewerCard({ note, index, onChange, onRemove }: InterviewerCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span className="text-[12px] font-medium text-[var(--text-soft)]">
            {note.name.trim() || `Interviewer ${index + 1}`}
          </span>
          {note.title && (
            <span className="text-[13px] text-[var(--text-soft)]">— {note.title}</span>
          )}
          {expanded ? (
            <ChevronUp size={13} className="ml-auto text-[var(--text-soft)]" />
          ) : (
            <ChevronDown size={13} className="ml-auto text-[var(--text-soft)]" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-[var(--text-soft)] hover:text-[var(--badge-red-text)]/60 transition-colors"
          aria-label="Remove interviewer"
        >
          <X size={13} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--line-soft)] px-4 py-3 space-y-2.5">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={LABEL_CLASS}>Name *</label>
              <input
                type="text"
                placeholder="Full name"
                value={note.name}
                onChange={(e) => onChange(index, { ...note, name: e.target.value })}
                className={cn(INPUT_CLASS, 'w-full')}
              />
            </div>
            <div className="flex-1">
              <label className={LABEL_CLASS}>Title</label>
              <input
                type="text"
                placeholder="e.g. VP Engineering"
                value={note.title ?? ''}
                onChange={(e) => onChange(index, { ...note, title: e.target.value })}
                className={cn(INPUT_CLASS, 'w-full')}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Topics Discussed (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g. leadership style, team structure, roadmap"
              value={(note.topics_discussed ?? []).join(', ')}
              onChange={(e) => {
                const topics = e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean);
                onChange(index, { ...note, topics_discussed: topics });
              }}
              className={cn(INPUT_CLASS, 'w-full')}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Rapport Notes</label>
            <textarea
              placeholder="How did the conversation feel? Any personal connections?"
              value={note.rapport_notes ?? ''}
              onChange={(e) => onChange(index, { ...note, rapport_notes: e.target.value })}
              rows={2}
              className={cn(INPUT_CLASS, 'w-full resize-none')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main form ---

export function DebriefForm({
  onSave,
  onCancel,
  onNavigateToThankYou,
  initialCompany = '',
  initialRole = '',
  initialJobApplicationId,
}: DebriefFormProps) {
  const [companyName, setCompanyName] = useState(initialCompany);
  const [roleTitle, setRoleTitle] = useState(initialRole);
  const [interviewDate, setInterviewDate] = useState(getTodayDateString());
  const [interviewType, setInterviewType] = useState<InterviewDebrief['interview_type']>('video');
  const [overallImpression, setOverallImpression] = useState<InterviewDebrief['overall_impression']>('neutral');
  const [whatWentWell, setWhatWentWell] = useState('');
  const [whatWentPoorly, setWhatWentPoorly] = useState('');
  const [questionsAsked, setQuestionsAsked] = useState<string[]>(['']);
  const [interviewerNotes, setInterviewerNotes] = useState<InterviewerNote[]>([
    { name: '', title: '', topics_discussed: [], rapport_notes: '' },
  ]);
  const [companySignals, setCompanySignals] = useState('');
  const [followUpActions, setFollowUpActions] = useState('');

  // Performance dimensions (new)
  const [commScore, setCommScore] = useState<ScoreLevel>(3);
  const [technicalScore, setTechnicalScore] = useState<ScoreLevel>(3);
  const [cultureFitScore, setCultureFitScore] = useState<ScoreLevel>(3);
  const [enthusiasmScore, setEnthusiasmScore] = useState<ScoreLevel>(3);

  // Structured follow-up checklist (new)
  const [followUpItems, setFollowUpItems] = useState<FollowUpItem[]>([]);

  // Sentiment analysis (new)
  const [sentimentItems, setSentimentItems] = useState<SentimentItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addQuestion = () => setQuestionsAsked((prev) => [...prev, '']);
  const removeQuestion = (i: number) =>
    setQuestionsAsked((prev) => prev.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, value: string) =>
    setQuestionsAsked((prev) => prev.map((q, idx) => (idx === i ? value : q)));

  const addInterviewer = () =>
    setInterviewerNotes((prev) => [
      ...prev,
      { name: '', title: '', topics_discussed: [], rapport_notes: '' },
    ]);
  const removeInterviewer = (i: number) =>
    setInterviewerNotes((prev) => prev.filter((_, idx) => idx !== i));
  const updateInterviewer = (i: number, note: InterviewerNote) =>
    setInterviewerNotes((prev) => prev.map((n, idx) => (idx === i ? note : n)));

  const isValid = companyName.trim().length > 0 && roleTitle.trim().length > 0;

  // Build a combined follow-up string from structured items for DB storage.
  // Also serializes performance dimension scores and sentiment signals here because
  // the InterviewDebrief DB type has no dedicated columns for them yet.
  // TODO: Add performance_scores (JSONB) and sentiment_items (JSONB) columns to
  // interview_debriefs table so these can be stored and queried properly.
  const buildFollowUpString = () => {
    const lines = followUpItems.map((item) => {
      const prefix = item.priority === 'urgent' ? '[URGENT]' : item.priority === 'important' ? '[IMPORTANT]' : '';
      return prefix ? `${prefix} ${item.text}` : item.text;
    });
    if (followUpActions.trim()) lines.push(followUpActions.trim());
    return lines.join('\n');
  };

  // Serialize performance scores into what_went_well/what_went_poorly enrichment.
  // These fields have no dedicated DB columns yet — scores are appended as structured
  // text so the data is preserved until schema columns are added.
  const buildPerformanceAnnotation = () => {
    const dims = [
      { label: 'Communication', score: commScore },
      { label: 'Technical Depth', score: technicalScore },
      { label: 'Cultural Fit', score: cultureFitScore },
      { label: 'Enthusiasm', score: enthusiasmScore },
    ];
    return `\n\n[Performance Scores: ${dims.map((d) => `${d.label}=${d.score}/5`).join(', ')}]`;
  };

  const buildSentimentAnnotation = () => {
    if (sentimentItems.length === 0) return '';
    const lines = sentimentItems.map((s) => `[${s.signal.toUpperCase()}] ${s.observation}`);
    return `\n\n[Interviewer Sentiment Signals:\n${lines.join('\n')}]`;
  };

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);

    // H7+H13: performance scores and sentiment items have no dedicated DB columns.
    // They are serialized into the text fields below as structured annotations until
    // a schema migration adds performance_scores (JSONB) and sentiment_items (JSONB).
    try {
      const performanceAnnotation = buildPerformanceAnnotation();
      const sentimentAnnotation = buildSentimentAnnotation();

      const result = await onSave({
        job_application_id: initialJobApplicationId,
        company_name: companyName.trim(),
        role_title: roleTitle.trim(),
        interview_date: interviewDate,
        interview_type: interviewType,
        overall_impression: overallImpression,
        what_went_well: whatWentWell
          ? `${whatWentWell}${performanceAnnotation}`
          : performanceAnnotation.trim(),
        what_went_poorly: whatWentPoorly
          ? `${whatWentPoorly}${sentimentAnnotation}`
          : sentimentAnnotation.trim() || whatWentPoorly,
        questions_asked: questionsAsked.map((q) => q.trim()).filter(Boolean),
        interviewer_notes: interviewerNotes.filter((n) => n.name.trim().length > 0),
        company_signals: companySignals,
        follow_up_actions: buildFollowUpString(),
      });
      if (result !== null && result !== undefined) {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNavigateToThankYou = () => {
    if (onNavigateToThankYou) {
      const validInterviewers = interviewerNotes.filter((n) => n.name.trim().length > 0);
      onNavigateToThankYou(validInterviewers);
    }
  };

  // Overall performance score for display
  const avgScore = Math.round((commScore + technicalScore + cultureFitScore + enthusiasmScore) / 4);
  const avgColor = avgScore >= 4 ? 'var(--badge-green-text)' : avgScore === 3 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';
  const avgLabel = avgScore >= 4 ? 'Strong' : avgScore === 3 ? 'Average' : 'Needs Work';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-[var(--text-strong)]">Post-Interview Debrief</h1>
          <p className="text-[13px] text-[var(--text-soft)]">
            Capture what happened while it's fresh. This feeds your thank you notes and helps refine future prep.
          </p>
        </div>
        {/* Overall performance badge */}
        <div className="flex-shrink-0 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-2.5 text-center">
          <div className="text-[20px] font-bold" style={{ color: avgColor }}>{avgScore}/5</div>
          <div className="text-[12px] font-medium mt-0.5" style={{ color: avgColor }}>{avgLabel}</div>
          <div className="text-[12px] text-[var(--text-soft)] mt-0.5">Overall</div>
        </div>
      </div>

      {/* Interview Details */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Interview Details</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={LABEL_CLASS}>Company *</label>
            <input
              type="text"
              placeholder="Company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={cn(INPUT_CLASS, 'w-full')}
            />
          </div>
          <div className="flex-1">
            <label className={LABEL_CLASS}>Role Title *</label>
            <input
              type="text"
              placeholder="e.g. VP of Supply Chain"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className={cn(INPUT_CLASS, 'w-full')}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={LABEL_CLASS}>Interview Date</label>
            <input
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className={cn(INPUT_CLASS, 'w-full')}
            />
          </div>
          <div className="flex-1">
            <label className={LABEL_CLASS}>Interview Type</label>
            <select
              value={interviewType}
              onChange={(e) =>
                setInterviewType(e.target.value as InterviewDebrief['interview_type'])
              }
              className={cn(INPUT_CLASS, 'w-full')}
            >
              <option value="phone">Phone</option>
              <option value="video">Video</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Overall impression */}
      <GlassCard className="p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Overall Impression</h3>
        <div className="flex gap-3">
          <ImpressionButton
            value="positive"
            current={overallImpression}
            icon={<ThumbsUp size={16} />}
            label="Positive"
            color="text-[var(--badge-green-text)]"
            activeClass="border-[var(--badge-green-text)]/30 bg-[var(--badge-green-text)]/[0.06] text-[var(--badge-green-text)]"
            onClick={setOverallImpression}
          />
          <ImpressionButton
            value="neutral"
            current={overallImpression}
            icon={<Minus size={16} />}
            label="Neutral"
            color="text-[var(--badge-amber-text)]"
            activeClass="border-[var(--badge-amber-text)]/30 bg-[var(--badge-amber-text)]/[0.06] text-[var(--badge-amber-text)]"
            onClick={setOverallImpression}
          />
          <ImpressionButton
            value="negative"
            current={overallImpression}
            icon={<ThumbsDown size={16} />}
            label="Negative"
            color="text-[var(--badge-red-text)]"
            activeClass="border-[var(--badge-red-text)]/30 bg-[var(--badge-red-text)]/[0.06] text-[var(--badge-red-text)]"
            onClick={setOverallImpression}
          />
        </div>
      </GlassCard>

      {/* Performance dimensions */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Performance by Dimension</h3>
          <span className="text-[13px] text-[var(--text-soft)]">Rate how you performed in each area</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PerformanceScoreSelector
            label="Communication"
            icon={<MessageSquare size={13} />}
            value={commScore}
            onChange={setCommScore}
          />
          <PerformanceScoreSelector
            label="Technical Depth"
            icon={<TrendingUp size={13} />}
            value={technicalScore}
            onChange={setTechnicalScore}
          />
          <PerformanceScoreSelector
            label="Cultural Fit"
            icon={<Users size={13} />}
            value={cultureFitScore}
            onChange={setCultureFitScore}
          />
          <PerformanceScoreSelector
            label="Enthusiasm"
            icon={<Zap size={13} />}
            value={enthusiasmScore}
            onChange={setEnthusiasmScore}
          />
        </div>
      </GlassCard>

      {/* What went well / poorly */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Performance Reflection</h3>

        <div className="rounded-lg border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-text)]/[0.03] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ThumbsUp size={12} className="text-[var(--badge-green-text)]/70" />
            <label className="text-[13px] font-semibold text-[var(--badge-green-text)]/70 uppercase tracking-wider">What went well</label>
          </div>
          <textarea
            placeholder="Moments of strong rapport, questions you nailed, stories that landed..."
            value={whatWentWell}
            onChange={(e) => setWhatWentWell(e.target.value)}
            rows={3}
            className={cn(INPUT_CLASS, 'w-full resize-none bg-transparent border-[var(--badge-green-text)]/10')}
          />
        </div>

        <div className="rounded-lg border border-[var(--badge-amber-text)]/12 bg-[var(--badge-amber-text)]/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Minus size={12} className="text-[var(--badge-amber-text)]/70" />
            <label className="text-[13px] font-semibold text-[var(--badge-amber-text)]/70 uppercase tracking-wider">What could have gone better</label>
          </div>
          <textarea
            placeholder="Stumbling points, questions you were unprepared for, missed opportunities..."
            value={whatWentPoorly}
            onChange={(e) => setWhatWentPoorly(e.target.value)}
            rows={3}
            className={cn(INPUT_CLASS, 'w-full resize-none bg-transparent border-[var(--badge-amber-text)]/10')}
          />
        </div>

        <div className="rounded-lg border border-[var(--badge-red-text)]/12 bg-[var(--badge-red-text)]/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} className="text-[var(--badge-red-text)]/70" />
            <label className="text-[13px] font-semibold text-[var(--badge-red-text)]/70 uppercase tracking-wider">Red flags or concerns</label>
          </div>
          <textarea
            placeholder="Anything that might have raised a concern for the interviewer — be honest..."
            value={companySignals}
            onChange={(e) => setCompanySignals(e.target.value)}
            rows={2}
            className={cn(INPUT_CLASS, 'w-full resize-none bg-transparent border-[var(--badge-red-text)]/10')}
          />
        </div>
      </GlassCard>

      {/* Sentiment analysis */}
      <GlassCard className="p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">How They Likely Perceived You</h3>
        <SentimentSummary items={sentimentItems} onChange={setSentimentItems} />
      </GlassCard>

      {/* Questions asked */}
      <GlassCard className="p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Questions They Asked</h3>
        <div className="space-y-2">
          {questionsAsked.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder={`Question ${i + 1}`}
                value={q}
                onChange={(e) => updateQuestion(i, e.target.value)}
                className={cn(INPUT_CLASS, 'flex-1')}
              />
              {questionsAsked.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(i)}
                  className="text-[var(--text-soft)] hover:text-[var(--badge-red-text)]/60 transition-colors flex-shrink-0"
                  aria-label="Remove question"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addQuestion}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
        >
          <Plus size={12} />
          Add Question
        </button>
      </GlassCard>

      {/* Interviewer notes */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Interviewer Notes</h3>
          <button
            type="button"
            onClick={addInterviewer}
            className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
          >
            <Plus size={12} />
            Add Interviewer
          </button>
        </div>
        <div className="space-y-2">
          {interviewerNotes.map((note, i) => (
            <InterviewerCard
              key={i}
              note={note}
              index={i}
              onChange={updateInterviewer}
              onRemove={removeInterviewer}
            />
          ))}
        </div>
      </GlassCard>

      {/* Follow-up actions checklist */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Flag size={14} className="text-[var(--link)]/60" />
          <h3 className="text-[13px] font-semibold text-[var(--text-muted)]">Follow-Up Actions</h3>
        </div>
        <FollowUpChecklist items={followUpItems} onChange={setFollowUpItems} />

        {/* Free-form fallback */}
        <div className="pt-1 border-t border-[var(--line-soft)]">
          <label className={cn(LABEL_CLASS, 'mt-2')}>Additional Notes</label>
          <textarea
            placeholder="Any other follow-ups or context..."
            value={followUpActions}
            onChange={(e) => setFollowUpActions(e.target.value)}
            rows={2}
            className={cn(INPUT_CLASS, 'w-full resize-none')}
          />
        </div>
      </GlassCard>

      {/* Thank you note CTA (shown when interviewer names are present) */}
      {interviewerNotes.some((n) => n.name.trim().length > 0) && !saved && (
        <div className="rounded-xl border border-[var(--link)]/15 bg-[var(--link)]/[0.03] p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-[var(--text-muted)]">Ready to write thank you notes?</p>
            <p className="text-[13px] text-[var(--text-soft)] mt-0.5">
              Save the debrief first, then generate personalized thank you notes for each interviewer.
            </p>
          </div>
          <Send size={16} className="text-[var(--link)]/40 flex-shrink-0" />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3">
        {!saved ? (
          <>
            <GlassButton
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!isValid || saving}
              className="text-[13px]"
            >
              Save Debrief
            </GlassButton>
            <GlassButton
              variant="ghost"
              onClick={onCancel}
              disabled={saving}
              className="text-[13px]"
            >
              Cancel
            </GlassButton>
          </>
        ) : (
          <>
            <div className="text-[12px] text-[var(--badge-green-text)] font-medium px-1">
              Debrief saved.
            </div>
            {onNavigateToThankYou && (
              <GlassButton
                variant="primary"
                onClick={handleNavigateToThankYou}
                className="text-[13px]"
              >
                <Send size={14} />
                Generate Thank You Notes
              </GlassButton>
            )}
            <GlassButton
              variant="ghost"
              onClick={onCancel}
              className="text-[13px]"
            >
              Back to Interview Prep
            </GlassButton>
          </>
        )}
      </div>
    </div>
  );
}
