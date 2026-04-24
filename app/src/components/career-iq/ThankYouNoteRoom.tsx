/**
 * ThankYouNoteRoom — Phase 2.3e.
 *
 * Recipient-role primary axis, multi-recipient, independent per-recipient
 * refinement, optional soft interview-prep coupling, timing awareness.
 *
 * Flow:
 *   Idle form → running (activity feed) → note_review (per-recipient
 *   cards with approve / revise / direct-edit each) → complete (report).
 */

import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  Mail,
  Plus,
  Trash2,
  User,
  Building2,
  Video,
  Phone,
  MapPin,
  MessageSquare,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Clock,
  Hash,
  Zap,
  Link as LinkIcon,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  useThankYouNote,
  type RecipientInput,
  type RecipientRole,
  type ThankYouNote,
  type TimingWarning,
} from '@/hooks/useThankYouNote';
import { usePriorResult } from '@/hooks/usePriorResult';
import { markdownToHtml } from '@/lib/markdown';
import { useLatestMasterResumeText } from './useLatestMasterResumeText';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ─── Constants ─────────────────────────────────────────────────────

const RECIPIENT_ROLE_OPTIONS: Array<{ value: RecipientRole; label: string; helper: string }> = [
  {
    value: 'hiring_manager',
    label: 'Hiring Manager',
    helper: 'Owns the role outcome. Confirms fit + forward-looking close.',
  },
  {
    value: 'recruiter',
    label: 'Recruiter',
    helper: 'Navigates the process. Appreciative, logistics-friendly.',
  },
  {
    value: 'panel_interviewer',
    label: 'Panel Interviewer',
    helper: 'Peer interviewer. Reference a conversation unique to them.',
  },
  {
    value: 'executive_sponsor',
    label: 'Executive Sponsor',
    helper: 'Senior skip-level. Brief, strategic, acknowledges their time.',
  },
  {
    value: 'other',
    label: 'Other',
    helper: 'Peer/professional tone with user-supplied context.',
  },
];

const INTERVIEW_TYPES = [
  { value: 'phone', label: 'Phone Screen', icon: Phone },
  { value: 'video', label: 'Video Call', icon: Video },
  { value: 'onsite', label: 'Onsite', icon: MapPin },
  { value: 'panel', label: 'Panel Interview', icon: MessageSquare },
];

// ─── Delivery timing helpers (kept) ────────────────────────────────

interface DeliveryRecommendation {
  label: string;
  urgency: 'high' | 'medium' | 'low';
  color: string;
  bg: string;
  border: string;
}

function getDeliveryRecommendation(interviewType: string): DeliveryRecommendation {
  switch (interviewType) {
    case 'onsite':
    case 'panel':
      return {
        label: 'Send within 2 hours',
        urgency: 'high',
        color: 'text-[var(--badge-amber-text)]',
        bg: 'bg-[var(--badge-amber-text)]/10',
        border: 'border-[var(--badge-amber-text)]/20',
      };
    case 'video':
      return {
        label: 'Send within 4 hours',
        urgency: 'medium',
        color: 'text-[var(--link)]',
        bg: 'bg-[var(--link)]/10',
        border: 'border-[var(--link)]/20',
      };
    case 'phone':
    default:
      return {
        label: 'Send same day',
        urgency: 'low',
        color: 'text-[var(--badge-green-text)]',
        bg: 'bg-[var(--badge-green-text)]/10',
        border: 'border-[var(--badge-green-text)]/20',
      };
  }
}

// ─── Recipient card ────────────────────────────────────────────────

let recipientIdCounter = 0;
type RecipientFormEntry = RecipientInput & { _id: number };

function makeEmptyRecipient(): RecipientFormEntry {
  return {
    _id: ++recipientIdCounter,
    role: 'hiring_manager',
    name: '',
    title: '',
    topics_discussed: [],
    rapport_notes: '',
    key_questions: [],
  };
}

interface RecipientCardProps {
  index: number;
  recipient: RecipientFormEntry;
  onChange: (index: number, updated: RecipientFormEntry) => void;
  onRemove: (index: number) => void;
  isOnly: boolean;
}

function RecipientCard({ index, recipient, onChange, onRemove, isOnly }: RecipientCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [topicsRaw, setTopicsRaw] = useState((recipient.topics_discussed ?? []).join(', '));
  const [keyQsRaw, setKeyQsRaw] = useState((recipient.key_questions ?? []).join('\n'));

  const update = (patch: Partial<RecipientFormEntry>) => onChange(index, { ...recipient, ...patch });

  const handleTopicsBlur = () => {
    const topics = topicsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    update({ topics_discussed: topics });
  };

  const handleKeyQsBlur = () => {
    const qs = keyQsRaw.split('\n').map((q) => q.trim()).filter(Boolean);
    update({ key_questions: qs });
  };

  const label = recipient.name.trim() || `Recipient ${index + 1}`;
  const roleLabel = RECIPIENT_ROLE_OPTIONS.find((r) => r.value === recipient.role)?.label ?? recipient.role;

  return (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--accent-muted)] transition-colors"
      >
        <div className="h-8 w-8 rounded-full bg-[var(--link)]/10 flex items-center justify-center flex-shrink-0">
          <User size={14} className="text-[var(--link)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[14px] font-medium text-[var(--text-strong)]">{label}</span>
            <span className="text-[11px] text-[var(--link)]/70 uppercase tracking-wider">{roleLabel}</span>
            {recipient.title && (
              <span className="text-[12px] text-[var(--text-soft)]">{recipient.title}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOnly && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              className="p-1 rounded-lg text-[var(--text-soft)] hover:text-[var(--badge-red-text)]/70 hover:bg-[var(--badge-red-text)]/5 transition-colors"
              aria-label="Remove recipient"
            >
              <Trash2 size={13} />
            </button>
          )}
          {expanded ? <ChevronUp size={14} className="text-[var(--text-soft)]" /> : <ChevronDown size={14} className="text-[var(--text-soft)]" />}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-[var(--line-soft)]">
          <div className="pt-4">
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Role <span className="text-[var(--link)]/60">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {RECIPIENT_ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ role: opt.value })}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors',
                    recipient.role === opt.value
                      ? 'border-[var(--link)]/30 bg-[var(--link)]/[0.06]'
                      : 'border-[var(--line-soft)] hover:bg-[var(--accent-muted)]',
                  )}
                >
                  <span className={cn(
                    'text-[12px] font-semibold',
                    recipient.role === opt.value ? 'text-[var(--text-strong)]' : 'text-[var(--text-soft)]',
                  )}>
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-[var(--text-soft)] leading-snug">{opt.helper}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
                Name <span className="text-[var(--link)]/60">*</span>
              </label>
              <input
                type="text"
                value={recipient.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. Sarah Chen"
                className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
                Title <span className="text-[var(--text-soft)] normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={recipient.title ?? ''}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. VP of Engineering"
                className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Topics Discussed <span className="text-[var(--text-soft)] normal-case font-normal">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              value={topicsRaw}
              onChange={(e) => setTopicsRaw(e.target.value)}
              onBlur={handleTopicsBlur}
              placeholder="e.g. supply chain transformation, Q3 targets"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Rapport Notes <span className="text-[var(--text-soft)] normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={recipient.rapport_notes ?? ''}
              onChange={(e) => update({ rapport_notes: e.target.value })}
              placeholder="Shared interests, personal anecdotes, memorable moments..."
              rows={2}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Key Questions Asked <span className="text-[var(--text-soft)] normal-case font-normal">(one per line, optional)</span>
            </label>
            <textarea
              value={keyQsRaw}
              onChange={(e) => setKeyQsRaw(e.target.value)}
              onBlur={handleKeyQsBlur}
              placeholder="Tell me about a transformation you led..."
              rows={2}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors resize-none leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Interview-prep pull control (soft coupling) ───────────────────

interface InterviewPrepPullControlProps {
  applicationId: string;
  enabled: boolean;
  onChange: (enabled: boolean, sourceSessionId?: string) => void;
}

interface PrepPointer {
  session_id: string;
  generated_at: string;
}

function InterviewPrepPullControl({ applicationId, enabled, onChange }: InterviewPrepPullControlProps) {
  const [pointer, setPointer] = useState<PrepPointer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPointer(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (!cancelled) { setLoading(false); }
          return;
        }
        const res = await fetch(
          `${API_BASE}/interview-prep/reports/by-application/${encodeURIComponent(applicationId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setPointer(null);
        } else if (res.ok) {
          const data = (await res.json()) as Partial<PrepPointer>;
          if (data.session_id) {
            setPointer({
              session_id: data.session_id,
              generated_at: data.generated_at ?? '',
            });
          }
        } else {
          setError(`Failed to look up interview prep (${res.status})`);
        }
      } catch {
        if (!cancelled) setError('Failed to look up interview prep');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
          <Loader2 size={12} className="animate-spin" />
          Checking for a prior interview-prep session…
        </div>
      </GlassCard>
    );
  }

  if (error || !pointer) {
    return null;
  }

  return (
    <GlassCard className="p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked, pointer.session_id)}
          className="mt-0.5 h-4 w-4"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <LinkIcon size={12} className="text-[var(--link)]" />
            <span className="text-[13px] font-semibold text-[var(--text-strong)]">
              Use my interview-prep notes for this application
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-soft)] mt-1 leading-relaxed">
            Pulls the most recent interview-prep report for this application so the drafts can reference
            real moments from your prep without you retyping them.
          </p>
          {pointer.generated_at && (
            <p className="text-[11px] text-[var(--text-soft)] mt-1">
              Prepared: {new Date(pointer.generated_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </label>
    </GlassCard>
  );
}

// ─── Timing warning banner ─────────────────────────────────────────

function TimingWarningBanner({ warning }: { warning: TimingWarning }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.06] px-4 py-3">
      <AlertCircle size={14} className="text-[var(--badge-amber-text)] flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="text-[12px] font-semibold text-[var(--badge-amber-text)] uppercase tracking-wider">
          Timing note · {warning.days_since_interview} days since interview
        </div>
        <p className="text-[13px] text-[var(--text-soft)] mt-0.5 leading-relaxed">{warning.message}</p>
      </div>
    </div>
  );
}

// ─── Per-recipient review card ─────────────────────────────────────

interface PerRecipientReviewCardProps {
  note: ThankYouNote;
  index: number;
  onRequestRevise: (index: number, feedback: string) => Promise<boolean>;
  onSaveEdit: (index: number, editedSubject: string | undefined, editedBody: string) => Promise<boolean>;
  disabled: boolean;
}

function PerRecipientReviewCard({
  note,
  index,
  onRequestRevise,
  onSaveEdit,
  disabled,
}: PerRecipientReviewCardProps) {
  const [mode, setMode] = useState<'preview' | 'revise' | 'edit'>('preview');
  const [feedback, setFeedback] = useState('');
  const [editSubject, setEditSubject] = useState(note.subject_line ?? '');
  const [editBody, setEditBody] = useState(note.content);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset edit buffers when the note prop changes (e.g., after a rerun).
  useEffect(() => {
    setEditSubject(note.subject_line ?? '');
    setEditBody(note.content);
  }, [note.subject_line, note.content]);

  const roleLabel = RECIPIENT_ROLE_OPTIONS.find((r) => r.value === note.recipient_role)?.label ?? note.recipient_role;
  const wordCount = note.content.trim().split(/\s+/).filter(Boolean).length;

  const handleCopy = useCallback(async () => {
    const text = note.subject_line
      ? `Subject: ${note.subject_line}\n\n${note.content}`
      : note.content;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [note.content, note.subject_line]);

  const handleRevise = useCallback(async () => {
    const trimmed = feedback.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await onRequestRevise(index, trimmed);
    setSubmitting(false);
    if (ok) {
      setFeedback('');
      setMode('preview');
    }
  }, [feedback, submitting, onRequestRevise, index]);

  const handleSaveEdit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const ok = await onSaveEdit(
      index,
      note.format === 'email' ? editSubject : undefined,
      editBody,
    );
    setSubmitting(false);
    if (ok) setMode('preview');
  }, [submitting, onSaveEdit, index, note.format, editSubject, editBody]);

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--link)]/10 p-2">
          <Mail size={14} className="text-[var(--link)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[var(--text-strong)]">{note.recipient_name}</span>
            <span className="text-[11px] text-[var(--link)]/70 uppercase tracking-wider">{roleLabel}</span>
            {note.recipient_title && (
              <span className="text-[12px] text-[var(--text-soft)]">· {note.recipient_title}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--text-soft)]">
            <span>{note.format.replace('_', ' ')}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Hash size={10} />{wordCount}w</span>
            {typeof note.quality_score === 'number' && (
              <>
                <span>·</span>
                <span>Quality: {note.quality_score}/100</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-[12px] border transition-all',
            copied
              ? 'bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20 text-[var(--badge-green-text)]'
              : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)] hover:text-[var(--text-muted)]',
          )}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {mode === 'preview' && (
        <>
          {note.format === 'email' && note.subject_line && (
            <div className="text-[12px] text-[var(--text-soft)]">
              <span className="font-semibold uppercase tracking-wider">Subject:</span> {note.subject_line}
            </div>
          )}
          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">{note.content}</p>

          <div className="flex items-center gap-2 pt-1 border-t border-[var(--line-soft)]/60">
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => setMode('revise')}
              disabled={disabled || submitting}
              className="text-[13px]"
            >
              Revise this one
            </GlassButton>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => setMode('edit')}
              disabled={disabled || submitting}
              className="text-[13px]"
            >
              <Edit3 size={12} className="mr-1.5" />
              Edit directly
            </GlassButton>
          </div>
        </>
      )}

      {mode === 'revise' && (
        <div className="space-y-3">
          <label className="block text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">
            Ask the agent to revise this note only
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. make it shorter · reference the Q3 roadmap question · more assertive close"
            rows={3}
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] resize-none leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40"
          />
          <div className="flex items-center gap-2">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => void handleRevise()}
              disabled={feedback.trim().length === 0 || submitting || disabled}
              className="text-[13px]"
            >
              {submitting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : null}
              Request revision
            </GlassButton>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => { setMode('preview'); setFeedback(''); }}
              disabled={submitting}
              className="text-[13px]"
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-3">
          {note.format === 'email' && (
            <div>
              <label className="block text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
                Subject
              </label>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40"
              />
            </div>
          )}
          <div>
            <label className="block text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Body
            </label>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] resize-none leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 whitespace-pre-wrap"
            />
          </div>
          <div className="flex items-center gap-2">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => void handleSaveEdit()}
              disabled={submitting || disabled}
              className="text-[13px]"
            >
              {submitting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : null}
              Save my edits
            </GlassButton>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('preview');
                setEditSubject(note.subject_line ?? '');
                setEditBody(note.content);
              }}
              disabled={submitting}
              className="text-[13px]"
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Activity feed (kept, light trim) ───────────────────────────────

function ActivityFeed({
  activityMessages,
  currentStage,
  company,
}: {
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
  company: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activityMessages.length]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 size={14} className="text-[var(--link)] animate-spin" />
        <span className="text-[13px] font-semibold text-[var(--text-strong)]">
          Drafting for {company || 'your interview'}
        </span>
        {currentStage && (
          <span className="ml-auto text-[11px] text-[var(--text-soft)] uppercase tracking-wider">{currentStage}</span>
        )}
      </div>
      <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-1.5">
        {activityMessages.length === 0 ? (
          <div className="text-[12px] text-[var(--text-soft)]">Waiting for the first update…</div>
        ) : (
          activityMessages.map((m) => (
            <div key={m.id} className="text-[12px] text-[var(--text-soft)] leading-relaxed">{m.message}</div>
          ))
        )}
      </div>
    </GlassCard>
  );
}

// ─── Report view (complete state) ──────────────────────────────────

function ReportView({
  report,
  qualityScore,
  company,
  role,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  company: string;
  role: string;
  interviewType: string;
  onReset: () => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch { /* ignore */ }
  }, [report]);

  const scoreColor =
    qualityScore !== null && qualityScore >= 80
      ? 'text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20'
      : qualityScore !== null && qualityScore >= 60
      ? 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10 border-[var(--badge-amber-text)]/20'
      : 'text-[var(--badge-red-text)] bg-[var(--badge-red-text)]/10 border-[var(--badge-red-text)]/20';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          <ArrowLeft size={14} />
          Draft another version
        </button>
        <div className="flex-1" />
        {qualityScore !== null && (
          <div className={cn('text-[12px] font-semibold px-3 py-1 rounded-full border', scoreColor)}>
            Note Strength {qualityScore}%
          </div>
        )}
        <GlassButton variant="ghost" onClick={() => void handleCopyAll()} size="sm">
          {copiedAll ? <Check size={13} className="mr-1.5 text-[var(--badge-green-text)]" /> : <Copy size={13} className="mr-1.5" />}
          {copiedAll ? 'Copied!' : 'Copy All'}
        </GlassButton>
      </div>

      <GlassCard className="px-5 py-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 rounded-full bg-[var(--link)]/[0.03] blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[var(--badge-green-text)]/10 p-2.5">
            <CheckCircle2 size={18} className="text-[var(--badge-green-text)]" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-strong)]">Thank-You Notes — {company}</h2>
            <p className="text-[12px] text-[var(--text-soft)] mt-0.5">{role}</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-8 relative overflow-hidden">
        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-[var(--text-strong)] prose-headings:font-semibold
            prose-h1:text-[18px] prose-h1:border-b prose-h1:border-[var(--line-soft)] prose-h1:pb-3 prose-h1:mb-5
            prose-h2:text-[15px] prose-h2:mt-8 prose-h2:mb-3
            prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2
            prose-p:text-[var(--text-soft)] prose-p:text-[13px] prose-p:leading-relaxed
            prose-li:text-[var(--text-soft)] prose-li:text-[13px] prose-li:leading-relaxed
            prose-strong:text-[var(--text-muted)]
            prose-em:text-[var(--text-soft)]
            prose-blockquote:border-[var(--link)]/30 prose-blockquote:text-[var(--text-soft)] prose-blockquote:italic
            prose-hr:border-[var(--line-soft)]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────

interface ThankYouNoteRoomProps {
  initialCompany?: string;
  initialRole?: string;
  initialJobApplicationId?: string;
  initialSessionId?: string;
}

export function ThankYouNoteRoom({
  initialCompany,
  initialRole,
  initialJobApplicationId,
  initialSessionId,
}: ThankYouNoteRoomProps = {}) {
  const [company, setCompany] = useState(initialCompany ?? '');
  const [role, setRole] = useState(initialRole ?? '');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewType, setInterviewType] = useState('video');
  const [recipients, setRecipients] = useState<RecipientFormEntry[]>([makeEmptyRecipient()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [pullInterviewPrep, setPullInterviewPrep] = useState(false);
  const [pulledSourceSessionId, setPulledSourceSessionId] = useState<string | undefined>(undefined);
  const resumeRef = useRef<string>('');
  const { resumeText: loadedResumeText, loading: loadingResume } = useLatestMasterResumeText();

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    noteReviewData,
    timingWarning,
    startPipeline,
    respondToGate,
    reset,
  } = useThankYouNote();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{ report_markdown?: string; quality_score?: number }>({
    productSlug: 'thank-you-note',
    skip: isPipelineActive,
    sessionId: initialSessionId,
  });

  useEffect(() => {
    if (loadedResumeText) {
      resumeRef.current = loadedResumeText;
    }
  }, [loadedResumeText]);

  useEffect(() => {
    if (initialCompany) setCompany(initialCompany);
    if (initialRole) setRole(initialRole);
  }, [initialCompany, initialRole]);

  const handleAddRecipient = () => {
    setRecipients((prev) => (prev.length >= 10 ? prev : [...prev, makeEmptyRecipient()]));
  };

  const handleChangeRecipient = (index: number, updated: RecipientFormEntry) => {
    setRecipients((prev) => prev.map((r, i) => (i === index ? updated : r)));
  };

  const handleRemoveRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePullChange = useCallback((enabled: boolean, sessionId?: string) => {
    setPullInterviewPrep(enabled);
    setPulledSourceSessionId(enabled ? sessionId : undefined);
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!initialJobApplicationId) {
      setFormError('Open this tool from inside an application to draft scoped thank-yous.');
      return;
    }
    if (!company.trim()) { setFormError('Company name is required.'); return; }
    if (!role.trim()) { setFormError('Role title is required.'); return; }

    const validRecipients: RecipientInput[] = recipients
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        role: r.role,
        name: r.name.trim(),
        title: r.title?.trim() || undefined,
        topics_discussed: r.topics_discussed && r.topics_discussed.length > 0 ? r.topics_discussed : undefined,
        rapport_notes: r.rapport_notes?.trim() || undefined,
        key_questions: r.key_questions && r.key_questions.length > 0 ? r.key_questions : undefined,
      }));

    if (validRecipients.length === 0) {
      setFormError('Add at least one recipient with a name.');
      return;
    }
    if (validRecipients.length > 10) {
      setFormError('Add up to 10 recipients.');
      return;
    }
    if (!resumeRef.current) {
      setFormError('No resume found. Please complete the Resume Strategist first to load your resume.');
      return;
    }

    await startPipeline({
      applicationId: initialJobApplicationId,
      resumeText: resumeRef.current,
      company: company.trim(),
      role: role.trim(),
      interviewDate: interviewDate || undefined,
      interviewType,
      recipients: validRecipients,
      sourceSessionId: pullInterviewPrep ? pulledSourceSessionId : undefined,
    });
  }, [
    company,
    role,
    interviewDate,
    interviewType,
    recipients,
    initialJobApplicationId,
    pullInterviewPrep,
    pulledSourceSessionId,
    startPipeline,
  ]);

  const handleReset = useCallback(() => {
    reset();
    setFormError(null);
    setCompany(initialCompany ?? '');
    setRole(initialRole ?? '');
    setReviewFeedback('');
  }, [initialCompany, initialRole, reset]);

  const handlePerRecipientRevise = useCallback(
    (index: number, feedback: string) =>
      respondToGate('note_review', { recipient_index: index, feedback }),
    [respondToGate],
  );

  const handlePerRecipientEdit = useCallback(
    (index: number, editedSubject: string | undefined, editedBody: string) =>
      respondToGate('note_review', {
        recipient_index: index,
        ...(editedSubject !== undefined ? { edited_subject: editedSubject } : {}),
        edited_body: editedBody,
      }),
    [respondToGate],
  );

  const reviewNotes: ThankYouNote[] = useMemo(
    () => noteReviewData?.notes ?? [],
    [noteReviewData],
  );
  const reviewQualityScore = noteReviewData?.quality_score ?? null;

  // ── Note review gate ───────────────────────────────────────────
  if (status === 'note_review') {
    const reviewDisabled = false;
    return (
      <div className="flex flex-col gap-6 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Review Your Notes</h1>
          <p className="text-[13px] text-[var(--text-soft)] mt-1">
            Each note is tuned to the recipient&rsquo;s role. Revise one at a time, edit directly, or approve the full set.
          </p>
        </div>

        {timingWarning && <TimingWarningBanner warning={timingWarning} />}

        {reviewQualityScore !== null && reviewQualityScore > 0 && (
          <GlassCard className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] text-[var(--text-soft)]">Note Strength</span>
              <span className={cn(
                'text-[13px] font-semibold',
                reviewQualityScore >= 80 ? 'text-[var(--badge-green-text)]'
                : reviewQualityScore >= 60 ? 'text-[var(--badge-amber-text)]'
                : 'text-[var(--badge-red-text)]',
              )}>
                {reviewQualityScore >= 80 ? 'Strong' : reviewQualityScore >= 60 ? 'Solid' : 'Needs polish'}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--accent-muted)]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  reviewQualityScore >= 80 ? 'bg-[var(--badge-green-text)]/60'
                  : reviewQualityScore >= 60 ? 'bg-[var(--badge-amber-text)]/60'
                  : 'bg-[var(--badge-red-text)]/60',
                )}
                style={{ width: `${reviewQualityScore}%` }}
              />
            </div>
          </GlassCard>
        )}

        <div className="space-y-3">
          {reviewNotes.map((note, i) => (
            <PerRecipientReviewCard
              key={`${note.recipient_name}-${i}`}
              note={note}
              index={i}
              onRequestRevise={handlePerRecipientRevise}
              onSaveEdit={handlePerRecipientEdit}
              disabled={reviewDisabled}
            />
          ))}
        </div>

        <GlassCard className="p-5 space-y-3">
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">
              Collection-level request (optional)
            </p>
            <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
              Rewrites every note. For single-recipient changes, use the per-card controls above.
            </p>
          </div>
          <textarea
            value={reviewFeedback}
            onChange={(e) => setReviewFeedback(e.target.value)}
            placeholder="e.g. make all notes more concise; emphasize the transformation track record"
            rows={2}
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] resize-none leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40"
          />
          <div className="flex items-center gap-3">
            <GlassButton
              variant="primary"
              onClick={() => void respondToGate('note_review', true)}
              className="gap-2"
            >
              <CheckCircle2 size={14} />
              Approve all notes
            </GlassButton>
            {reviewFeedback.trim() && (
              <GlassButton
                variant="ghost"
                onClick={() => {
                  void respondToGate('note_review', { feedback: reviewFeedback.trim() });
                  setReviewFeedback('');
                }}
              >
                Rewrite all with this feedback
              </GlassButton>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  // ── Complete → report ─────────────────────────────────────────
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        {timingWarning && <TimingWarningBanner warning={timingWarning} />}
        <ReportView
          report={report}
          qualityScore={qualityScore}
          company={company}
          role={role}
          interviewType={interviewType}
          onReset={handleReset}
        />
      </div>
    );
  }

  if (status === 'idle' && initialSessionId && priorResult?.report_markdown) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={priorResult.report_markdown}
          qualityScore={priorResult.quality_score ?? null}
          company={company}
          role={role}
          interviewType={interviewType}
          onReset={() => {
            clearPrior();
            handleReset();
          }}
        />
      </div>
    );
  }

  // ── Running ───────────────────────────────────────────────────
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-6 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Thank-You Notes</h1>
          <p className="text-[13px] text-[var(--text-soft)] mt-1">Drafting recipient-calibrated notes</p>
        </div>
        {timingWarning && <TimingWarningBanner warning={timingWarning} />}
        <ActivityFeed activityMessages={activityMessages} currentStage={currentStage} company={company} />
        <div className="flex justify-start">
          <button
            type="button"
            onClick={handleReset}
            className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (status === 'error' && error) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle size={18} className="text-[var(--badge-red-text)]" />
            <span className="text-[13px] text-[var(--badge-red-text)]">{error}</span>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
            <ArrowLeft size={14} className="mr-1.5" />
            Try again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // ── Idle form ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      <div className="flex gap-3">
        <div className="rounded-xl bg-[var(--link)]/10 p-2.5 self-start shrink-0">
          <Mail size={20} className="text-[var(--link)]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Thank-You Notes</h1>
          <p className="text-[13px] text-[var(--text-soft)] leading-relaxed mt-1">
            Draft notes for each recipient, calibrated to their role — hiring manager, recruiter, panel, sponsor. Refine each one independently.
          </p>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['career_profile', 'positioning_strategy', 'emotional_baseline']}
        className="mb-3"
      />

      {/* Prior saved draft */}
      {priorLoading && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading saved draft...
          </div>
        </GlassCard>
      )}
      {priorResult && !isPipelineActive && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--text-muted)]">
              {initialSessionId ? 'Saved thank-you notes for this job' : 'Earlier draft'}
            </h3>
            <button
              type="button"
              onClick={clearPrior}
              className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Start New Draft
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-[var(--text-strong)] max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {/* Resume status */}
      {loadingResume ? (
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
          <Loader2 size={12} className="animate-spin" />
          Loading your resume...
        </div>
      ) : loadedResumeText ? (
        <div className="flex items-center gap-2 text-[12px] text-[var(--badge-green-text)]/70">
          <CheckCircle2 size={12} />
          Resume loaded from your profile
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-[var(--badge-amber-text)]/70">
          <AlertCircle size={12} />
          No resume found — complete the Resume Strategist first for best results
        </div>
      )}

      {/* Soft interview-prep coupling */}
      {initialJobApplicationId && (
        <InterviewPrepPullControl
          applicationId={initialJobApplicationId}
          enabled={pullInterviewPrep}
          onChange={handlePullChange}
        />
      )}

      {/* Section 1: Interview details */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Interview Details</h2>
          <div className="flex-1 h-px bg-[var(--accent-muted)]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Company <span className="text-[var(--link)]/60">*</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Medtronic"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Role <span className="text-[var(--link)]/60">*</span>
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. VP of Supply Chain"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Interview Date <span className="text-[var(--text-soft)] normal-case font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-2">
              Interview Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {INTERVIEW_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInterviewType(value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border transition-all',
                    interviewType === value
                      ? 'border-[var(--link)]/30 bg-[var(--link)]/10 text-[var(--link)]'
                      : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:border-[var(--line-strong)]',
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {interviewType && (
          <div className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 border text-[12px]',
            getDeliveryRecommendation(interviewType).bg,
            getDeliveryRecommendation(interviewType).border,
            getDeliveryRecommendation(interviewType).color,
          )}>
            <Clock size={12} className="flex-shrink-0" />
            <span>
              Recommended send time: <span className="font-semibold">{getDeliveryRecommendation(interviewType).label}</span> after the interview
            </span>
          </div>
        )}
      </div>

      {/* Section 2: Recipients */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <User size={16} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Recipients</h2>
          <span className="text-[11px] text-[var(--text-soft)]">({recipients.length} / 10)</span>
          <div className="flex-1 h-px bg-[var(--accent-muted)]" />
          <button
            type="button"
            onClick={handleAddRecipient}
            disabled={recipients.length >= 10}
            className="flex items-center gap-1.5 text-[12px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors disabled:opacity-50"
          >
            <Plus size={13} />
            Add recipient
          </button>
        </div>

        <div className="space-y-3">
          {recipients.map((r, i) => (
            <RecipientCard
              key={r._id}
              index={i}
              recipient={r}
              onChange={handleChangeRecipient}
              onRemove={handleRemoveRecipient}
              isOnly={recipients.length === 1}
            />
          ))}
        </div>
      </div>

      {formError && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--badge-red-text)] bg-[var(--badge-red-text)]/5 border border-[var(--badge-red-text)]/15 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="flex-shrink-0" />
          {formError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-soft)] flex items-center gap-1">
          <Zap size={11} />
          Each note is calibrated to the recipient&rsquo;s role. Refine each one independently after drafting.
        </p>
        <GlassButton
          variant="primary"
          onClick={() => void handleSubmit()}
          className="text-[14px] px-6 py-3 gap-2"
        >
          <Sparkles size={15} />
          Draft Notes
        </GlassButton>
      </div>
    </div>
  );
}
