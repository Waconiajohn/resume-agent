/**
 * FollowUpEmailRoom — Phase 2.3d peer-tool host.
 *
 * Application-scoped wrapper around useFollowUpEmail. Provides the
 * sequence / tone / recipient inputs, starts the SSE agent pipeline,
 * surfaces the email_review gate with approve / revise / direct-edit, and
 * lets the user iterate multi-turn until the draft is right.
 *
 * This is the replacement for the legacy PostInterviewFollowUpEmailForm
 * that lived in InterviewLabRoom and POSTed directly to the sync
 * /interview-prep/follow-up-email handler.
 */

import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  useFollowUpEmail,
  type FollowUpTone,
  type FollowUpSituation,
} from '@/hooks/useFollowUpEmail';

interface FollowUpEmailRoomProps {
  applicationId: string;
  initialCompany?: string;
  initialRole?: string;
}

const TONE_OPTIONS: Array<{ value: FollowUpTone; label: string; description: string }> = [
  { value: 'warm', label: 'Warm', description: 'Friendly check-in that references a real moment' },
  { value: 'direct', label: 'Direct', description: 'Plainspoken and brief — clean ask about timing' },
  { value: 'value-add', label: 'Value-add', description: 'Lead with something useful, ask nothing' },
];

const FOLLOW_UP_NUMBER_OPTIONS: Array<{ value: number; label: string; helper: string }> = [
  { value: 1, label: 'First nudge', helper: 'Day 5–7 check-in, warm by default' },
  { value: 2, label: 'Second nudge', helper: 'Day 10–14 ask, direct by default' },
  { value: 3, label: 'Third nudge / breakup', helper: 'Graceful value-add, leaves the door open' },
];

export function FollowUpEmailRoom({
  applicationId,
  initialCompany,
  initialRole,
}: FollowUpEmailRoomProps) {
  const {
    status,
    draft,
    activityMessages,
    error,
    pendingGate,
    startPipeline,
    respondToGate,
    reset,
  } = useFollowUpEmail();

  const [followUpNumber, setFollowUpNumber] = useState<number>(1);
  const [tone, setTone] = useState<FollowUpTone | ''>('');
  const [situation, setSituation] = useState<FollowUpSituation | ''>('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientTitle, setRecipientTitle] = useState('');
  const [specificContext, setSpecificContext] = useState('');

  // Multi-turn refinement state.
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const busy = status === 'connecting' || status === 'running';
  const awaitingReview = status === 'email_review' && pendingGate === 'email_review';
  const complete = status === 'complete';

  const canStart = status === 'idle';

  const latestDraft = useMemo(() => {
    if (!draft) return null;
    return {
      ...draft,
      subject: editedSubject ?? draft.subject,
      body: editedBody ?? draft.body,
    };
  }, [draft, editedSubject, editedBody]);

  const handleStart = useCallback(async () => {
    setEditedSubject(null);
    setEditedBody(null);
    setRevisionFeedback('');
    await startPipeline({
      jobApplicationId: applicationId,
      followUpNumber,
      tone: tone === '' ? undefined : tone,
      situation: situation === '' ? undefined : situation,
      companyName: initialCompany,
      roleTitle: initialRole,
      recipientName: recipientName || undefined,
      recipientTitle: recipientTitle || undefined,
      specificContext: specificContext || undefined,
    });
  }, [
    applicationId,
    followUpNumber,
    tone,
    situation,
    initialCompany,
    initialRole,
    recipientName,
    recipientTitle,
    specificContext,
    startPipeline,
  ]);

  const handleApprove = useCallback(async () => {
    await respondToGate('email_review', true);
  }, [respondToGate]);

  const handleRevise = useCallback(async () => {
    const trimmed = revisionFeedback.trim();
    if (!trimmed) return;
    const ok = await respondToGate('email_review', { feedback: trimmed });
    if (ok) setRevisionFeedback('');
  }, [revisionFeedback, respondToGate]);

  const handleSaveDirectEdit = useCallback(async () => {
    if (!draft) return;
    const subject = editedSubject ?? draft.subject;
    const body = editedBody ?? draft.body;
    await respondToGate('email_review', {
      edited_subject: subject,
      edited_body: body,
    });
  }, [draft, editedSubject, editedBody, respondToGate]);

  const handleCopy = useCallback(async () => {
    if (!latestDraft) return;
    const text = `Subject: ${latestDraft.subject}\n\n${latestDraft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [latestDraft]);

  const inputClass =
    'w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[12px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30';
  const labelClass =
    'block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5';

  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--link)]/10 p-2">
            <Send size={15} className="text-[var(--link)]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Follow-Up Email</h3>
            <p className="text-[13px] text-[var(--text-soft)]">
              {initialCompany ?? 'this company'} — {initialRole ?? 'this role'}
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Sequence</label>
          <div className="space-y-1.5">
            {FOLLOW_UP_NUMBER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFollowUpNumber(opt.value)}
                disabled={!canStart}
                className={cn(
                  'w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                  followUpNumber === opt.value
                    ? 'border-[var(--link)]/25 bg-[var(--link)]/[0.06]'
                    : 'border-[var(--line-soft)] hover:bg-[var(--accent-muted)]',
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 h-3 w-3 flex-shrink-0 rounded-full border-2',
                    followUpNumber === opt.value
                      ? 'border-[var(--link)] bg-[var(--link)]/30'
                      : 'border-[var(--line-strong)]',
                  )}
                />
                <div>
                  <div
                    className={cn(
                      'text-[12px] font-medium',
                      followUpNumber === opt.value ? 'text-[var(--text-strong)]' : 'text-[var(--text-soft)]',
                    )}
                  >
                    {opt.label}
                  </div>
                  <div className="text-[13px] text-[var(--text-soft)] mt-0.5">{opt.helper}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tone (optional)</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as FollowUpTone | '')}
              disabled={!canStart}
              className={inputClass}
            >
              <option value="">Use default ({followUpNumber <= 1 ? 'warm' : followUpNumber === 2 ? 'direct' : 'value-add'})</option>
              {TONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Situation (optional)</label>
            <select
              value={situation}
              onChange={(e) => setSituation(e.target.value as FollowUpSituation | '')}
              disabled={!canStart}
              className={inputClass}
            >
              <option value="">Use default</option>
              <option value="post_interview">Post-interview status check</option>
              <option value="no_response">No response (2+ weeks)</option>
              <option value="rejection_graceful">Graceful rejection response</option>
              <option value="keep_warm">Keep warm</option>
              <option value="negotiation_counter">Negotiation counter</option>
            </select>
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
              disabled={!canStart}
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
              disabled={!canStart}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Specific context (optional)</label>
          <textarea
            rows={3}
            placeholder="A specific topic to reference, an ask, or a moment from the interview…"
            value={specificContext}
            onChange={(e) => setSpecificContext(e.target.value)}
            disabled={!canStart}
            className={`${inputClass} resize-none`}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-3 py-2">
            <AlertCircle size={13} className="text-[var(--badge-red-text)] flex-shrink-0" />
            <span className="text-[12px] text-[var(--badge-red-text)]/80">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <GlassButton
            variant="primary"
            onClick={() => void handleStart()}
            disabled={!canStart}
            className="text-[13px]"
          >
            {busy ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Send size={13} className="mr-1.5" />
            )}
            {canStart ? 'Draft follow-up' : busy ? 'Drafting…' : 'Drafting complete'}
          </GlassButton>
          {(complete || status === 'error') && (
            <GlassButton variant="ghost" onClick={reset} className="text-[13px]">
              Start over
            </GlassButton>
          )}
        </div>
      </GlassCard>

      {(busy || activityMessages.length > 0) && !latestDraft && (
        <GlassCard className="p-5">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--link)]">
            Agent activity
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-[var(--text-soft)]">
            {activityMessages.slice(-6).map((m) => (
              <li key={m.id} className="leading-relaxed">
                {m.message}
              </li>
            ))}
            {activityMessages.length === 0 && (
              <li className="text-[var(--text-muted)]">Waiting for the first update…</li>
            )}
          </ul>
        </GlassCard>
      )}

      {latestDraft && (
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">
              Draft
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              tone: {latestDraft.tone} · nudge #{latestDraft.follow_up_number}
            </span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="ml-auto flex items-center gap-1 text-[13px] text-[var(--link)]/60 transition-colors hover:text-[var(--link)]"
            >
              {copied ? <CheckCircle2 size={11} /> : <FileText size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div>
            <label className={labelClass}>Subject</label>
            <input
              type="text"
              value={latestDraft.subject}
              onChange={(e) => setEditedSubject(e.target.value)}
              disabled={!awaitingReview && !complete}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Body</label>
            <textarea
              rows={10}
              value={latestDraft.body}
              onChange={(e) => setEditedBody(e.target.value)}
              disabled={!awaitingReview && !complete}
              className={`${inputClass} resize-none leading-relaxed whitespace-pre-wrap`}
            />
          </div>

          {latestDraft.timing_guidance && (
            <div className="rounded-lg border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-text)]/[0.04] px-3 py-2">
              <p className="text-[13px] text-[var(--badge-amber-text)]/70">
                {latestDraft.timing_guidance}
              </p>
            </div>
          )}

          {awaitingReview && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Ask the agent to revise</label>
                <textarea
                  rows={2}
                  placeholder="e.g. make it shorter · reference the Q3 roadmap · more assertive"
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <GlassButton
                  variant="primary"
                  onClick={() => void handleApprove()}
                  className="text-[13px]"
                >
                  Approve
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  onClick={() => void handleRevise()}
                  disabled={revisionFeedback.trim().length === 0}
                  className="text-[13px]"
                >
                  Revise
                </GlassButton>
                {(editedSubject !== null || editedBody !== null) && (
                  <GlassButton
                    variant="ghost"
                    onClick={() => void handleSaveDirectEdit()}
                    className="text-[13px]"
                  >
                    Save my edits
                  </GlassButton>
                )}
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
