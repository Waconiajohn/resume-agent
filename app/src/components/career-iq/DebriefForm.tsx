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
  'rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/30';

const LABEL_CLASS = 'text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block';

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
          : 'border-white/[0.08] bg-white/[0.02] text-white/30 hover:border-white/[0.14] hover:text-white/50',
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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span className="text-[12px] font-medium text-white/60">
            {note.name.trim() || `Interviewer ${index + 1}`}
          </span>
          {note.title && (
            <span className="text-[11px] text-white/30">— {note.title}</span>
          )}
          {expanded ? (
            <ChevronUp size={13} className="ml-auto text-white/25" />
          ) : (
            <ChevronDown size={13} className="ml-auto text-white/25" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-white/20 hover:text-[#e8a0a0]/60 transition-colors"
          aria-label="Remove interviewer"
        >
          <X size={13} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-3 space-y-2.5">
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Questions list handlers
  const addQuestion = () => setQuestionsAsked((prev) => [...prev, '']);
  const removeQuestion = (i: number) =>
    setQuestionsAsked((prev) => prev.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, value: string) =>
    setQuestionsAsked((prev) => prev.map((q, idx) => (idx === i ? value : q)));

  // Interviewer notes handlers
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

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const result = await onSave({
        job_application_id: initialJobApplicationId,
        company_name: companyName.trim(),
        role_title: roleTitle.trim(),
        interview_date: interviewDate,
        interview_type: interviewType,
        overall_impression: overallImpression,
        what_went_well: whatWentWell,
        what_went_poorly: whatWentPoorly,
        questions_asked: questionsAsked.map((q) => q.trim()).filter(Boolean),
        interviewer_notes: interviewerNotes.filter((n) => n.name.trim().length > 0),
        company_signals: companySignals,
        follow_up_actions: followUpActions,
      });
      // Only show saved state if onSave returned a truthy value (not null/undefined)
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

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[900px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-white/90">Post-Interview Debrief</h1>
        <p className="text-[13px] text-white/40">
          Capture what happened while it's fresh. This feeds your thank you notes and helps refine future prep.
        </p>
      </div>

      {/* Company + Role */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-white/70">Interview Details</h3>
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
        <h3 className="text-[13px] font-semibold text-white/70">Overall Impression</h3>
        <div className="flex gap-3">
          <ImpressionButton
            value="positive"
            current={overallImpression}
            icon={<ThumbsUp size={16} />}
            label="Positive"
            color="text-[#b5dec2]"
            activeClass="border-[#b5dec2]/30 bg-[#b5dec2]/[0.06] text-[#b5dec2]"
            onClick={setOverallImpression}
          />
          <ImpressionButton
            value="neutral"
            current={overallImpression}
            icon={<Minus size={16} />}
            label="Neutral"
            color="text-[#dfc797]"
            activeClass="border-[#dfc797]/30 bg-[#dfc797]/[0.06] text-[#dfc797]"
            onClick={setOverallImpression}
          />
          <ImpressionButton
            value="negative"
            current={overallImpression}
            icon={<ThumbsDown size={16} />}
            label="Negative"
            color="text-[#e8a0a0]"
            activeClass="border-[#e8a0a0]/30 bg-[#e8a0a0]/[0.06] text-[#e8a0a0]"
            onClick={setOverallImpression}
          />
        </div>
      </GlassCard>

      {/* What went well / poorly */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-white/70">Performance Reflection</h3>
        <div>
          <label className={LABEL_CLASS}>What went well</label>
          <textarea
            placeholder="Moments of strong rapport, questions you nailed, stories that landed..."
            value={whatWentWell}
            onChange={(e) => setWhatWentWell(e.target.value)}
            rows={3}
            className={cn(INPUT_CLASS, 'w-full resize-none')}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>What could have gone better</label>
          <textarea
            placeholder="Stumbling points, questions you were unprepared for, missed opportunities..."
            value={whatWentPoorly}
            onChange={(e) => setWhatWentPoorly(e.target.value)}
            rows={3}
            className={cn(INPUT_CLASS, 'w-full resize-none')}
          />
        </div>
      </GlassCard>

      {/* Questions asked */}
      <GlassCard className="p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-white/70">Questions They Asked</h3>
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
                  className="text-white/20 hover:text-[#e8a0a0]/60 transition-colors flex-shrink-0"
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
          className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
        >
          <Plus size={12} />
          Add Question
        </button>
      </GlassCard>

      {/* Interviewer notes */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-white/70">Interviewer Notes</h3>
          <button
            type="button"
            onClick={addInterviewer}
            className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
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

      {/* Company signals + follow-up */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-white/70">Intelligence & Next Steps</h3>
        <div>
          <label className={LABEL_CLASS}>Company Signals</label>
          <textarea
            placeholder="Any signals about timeline, headcount freeze, culture dynamics, decision process?"
            value={companySignals}
            onChange={(e) => setCompanySignals(e.target.value)}
            rows={3}
            className={cn(INPUT_CLASS, 'w-full resize-none')}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Follow-up Actions</label>
          <textarea
            placeholder="Send thank you notes, research a topic they raised, follow up in X days..."
            value={followUpActions}
            onChange={(e) => setFollowUpActions(e.target.value)}
            rows={2}
            className={cn(INPUT_CLASS, 'w-full resize-none')}
          />
        </div>
      </GlassCard>

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
            <div className="text-[12px] text-[#b5dec2] font-medium px-1">
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
              Back to Interview Lab
            </GlassButton>
          </>
        )}
      </div>
    </div>
  );
}
