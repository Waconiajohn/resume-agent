/**
 * NetworkingRoom — Phase 2.3f thin peer-tool host.
 *
 * Application-scoped wrapper around useNetworking. Single recipient,
 * single message per session. Mirrors FollowUpEmailRoom's shape.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Edit3,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  useNetworking,
  MESSAGING_METHOD_CHAR_CAP,
  type MessagingMethod,
  type RecipientType,
} from '@/hooks/useNetworking';
import { useLatestMasterResumeText } from './useLatestMasterResumeText';

const RECIPIENT_TYPE_OPTIONS: Array<{ value: RecipientType; label: string; helper: string }> = [
  {
    value: 'former_colleague',
    label: 'Former colleague',
    helper: 'Familiar opener. Skip the pitch — they already know you.',
  },
  {
    value: 'second_degree',
    label: 'Second-degree connection',
    helper: 'Lead with the shared context or mutual contact.',
  },
  {
    value: 'cold',
    label: 'Cold outreach',
    helper: 'Open with a specific, well-researched reason to reach out.',
  },
  {
    value: 'referrer',
    label: 'Referrer / referral target',
    helper: 'Acknowledge the ask and make it easy to say no.',
  },
  {
    value: 'other',
    label: 'Other',
    helper: 'Peer/professional default. Use whatever context you supply.',
  },
];

const MESSAGING_METHOD_OPTIONS: Array<{
  value: MessagingMethod;
  label: string;
  helper: string;
}> = [
  {
    value: 'connection_request',
    label: `Connection request (${MESSAGING_METHOD_CHAR_CAP.connection_request} chars)`,
    helper: 'LinkedIn connection request note. Strict cap — every word earns its place.',
  },
  {
    value: 'inmail',
    label: `InMail (${MESSAGING_METHOD_CHAR_CAP.inmail} chars)`,
    helper: 'Paid InMail. Room for one paragraph + a specific ask.',
  },
  {
    value: 'group_message',
    label: `Group message (${MESSAGING_METHOD_CHAR_CAP.group_message} chars)`,
    helper: 'Free group messaging. Use real space for substance.',
  },
];

interface NetworkingRoomProps {
  applicationId: string;
  initialCompany?: string;
  initialRole?: string;
}

export function NetworkingRoom({
  applicationId,
  initialCompany,
  initialRole,
}: NetworkingRoomProps) {
  const {
    status,
    draft,
    activityMessages,
    error,
    pendingGate,
    startPipeline,
    respondToGate,
    reset,
  } = useNetworking();

  const { resumeText, loading: loadingResume } = useLatestMasterResumeText();
  const resumeRef = useRef<string>('');
  useEffect(() => {
    if (resumeText) resumeRef.current = resumeText;
  }, [resumeText]);

  // Form state.
  const [recipientName, setRecipientName] = useState('');
  const [recipientType, setRecipientType] = useState<RecipientType>('former_colleague');
  const [recipientTitle, setRecipientTitle] = useState('');
  const [recipientCompany, setRecipientCompany] = useState('');
  const [recipientLinkedin, setRecipientLinkedin] = useState('');
  const [messagingMethod, setMessagingMethod] = useState<MessagingMethod>('connection_request');
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Review state.
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [editedBody, setEditedBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  // When a new draft arrives, reset any pending edit buffer.
  useEffect(() => {
    if (draft) {
      setEditedBody(null);
      setEditing(false);
    }
  }, [draft?.message_markdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const canStart = status === 'idle';
  const busy = status === 'connecting' || status === 'running';
  const awaitingReview = status === 'message_review' && pendingGate === 'message_review';
  const complete = status === 'complete';

  const latestDraft = useMemo(() => {
    if (!draft) return null;
    return editedBody !== null
      ? { ...draft, message_markdown: editedBody, char_count: editedBody.length }
      : draft;
  }, [draft, editedBody]);

  const charCap = MESSAGING_METHOD_CHAR_CAP[latestDraft?.messaging_method ?? messagingMethod];
  const overCap = latestDraft ? latestDraft.char_count > charCap : false;

  const handleStart = useCallback(async () => {
    setFormError(null);
    if (!recipientName.trim()) {
      setFormError('Recipient name is required.');
      return;
    }
    if (!goal.trim()) {
      setFormError('Describe your goal for this message.');
      return;
    }
    if (!resumeRef.current || resumeRef.current.length < 50) {
      setFormError('No resume found. Complete the Resume Strategist first so we can calibrate the voice.');
      return;
    }
    await startPipeline({
      applicationId,
      resumeText: resumeRef.current,
      recipientName: recipientName.trim(),
      recipientType,
      recipientTitle: recipientTitle.trim() || undefined,
      recipientCompany: recipientCompany.trim() || undefined,
      recipientLinkedinUrl: recipientLinkedin.trim() || undefined,
      messagingMethod,
      goal: goal.trim(),
      context: context.trim() || undefined,
    });
  }, [
    applicationId,
    recipientName,
    recipientType,
    recipientTitle,
    recipientCompany,
    recipientLinkedin,
    messagingMethod,
    goal,
    context,
    startPipeline,
  ]);

  const handleApprove = useCallback(async () => {
    await respondToGate('message_review', true);
  }, [respondToGate]);

  const handleRevise = useCallback(async () => {
    const trimmed = revisionFeedback.trim();
    if (!trimmed) return;
    const ok = await respondToGate('message_review', { feedback: trimmed });
    if (ok) setRevisionFeedback('');
  }, [revisionFeedback, respondToGate]);

  const handleSaveEdit = useCallback(async () => {
    if (!latestDraft) return;
    const body = editedBody ?? latestDraft.message_markdown;
    const ok = await respondToGate('message_review', { edited_content: body });
    if (ok) {
      setEditing(false);
    }
  }, [editedBody, latestDraft, respondToGate]);

  const handleCopy = useCallback(async () => {
    if (!latestDraft) return;
    try {
      await navigator.clipboard.writeText(latestDraft.message_markdown);
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
            <MessageSquare size={15} className="text-[var(--link)]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Networking Message</h3>
            <p className="text-[13px] text-[var(--text-soft)]">
              {initialCompany ?? 'this company'} — {initialRole ?? 'this role'}
            </p>
          </div>
        </div>

        {loadingResume ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading your resume…
          </div>
        ) : resumeText ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--badge-green-text)]/70">
            <CheckCircle2 size={12} />
            Resume loaded from your profile
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-[var(--badge-amber-text)]/70">
            <AlertCircle size={12} />
            No resume found — complete the Resume Strategist for better voice
          </div>
        )}

        <div>
          <label className={labelClass}>Recipient type</label>
          <div className="space-y-1.5">
            {RECIPIENT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRecipientType(opt.value)}
                disabled={!canStart}
                className={cn(
                  'w-full flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60',
                  recipientType === opt.value
                    ? 'border-[var(--link)]/25 bg-[var(--link)]/[0.06]'
                    : 'border-[var(--line-soft)] hover:bg-[var(--accent-muted)]',
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 h-3 w-3 flex-shrink-0 rounded-full border-2',
                    recipientType === opt.value
                      ? 'border-[var(--link)] bg-[var(--link)]/30'
                      : 'border-[var(--line-strong)]',
                  )}
                />
                <div>
                  <div
                    className={cn(
                      'text-[12px] font-medium',
                      recipientType === opt.value
                        ? 'text-[var(--text-strong)]'
                        : 'text-[var(--text-soft)]',
                    )}
                  >
                    {opt.label}
                  </div>
                  <div className="text-[13px] text-[var(--text-soft)] mt-0.5 leading-snug">
                    {opt.helper}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Recipient name *</label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={!canStart}
              placeholder="e.g. Sarah Chen"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Title (optional)</label>
            <input
              type="text"
              value={recipientTitle}
              onChange={(e) => setRecipientTitle(e.target.value)}
              disabled={!canStart}
              placeholder="e.g. VP of Engineering"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Company (optional)</label>
            <input
              type="text"
              value={recipientCompany}
              onChange={(e) => setRecipientCompany(e.target.value)}
              disabled={!canStart}
              placeholder="e.g. Medtronic"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>LinkedIn URL (optional)</label>
            <input
              type="url"
              value={recipientLinkedin}
              onChange={(e) => setRecipientLinkedin(e.target.value)}
              disabled={!canStart}
              placeholder="https://linkedin.com/in/..."
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Channel</label>
          <select
            value={messagingMethod}
            onChange={(e) => setMessagingMethod(e.target.value as MessagingMethod)}
            disabled={!canStart}
            className={inputClass}
          >
            {MESSAGING_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.helper}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Goal *</label>
          <textarea
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={!canStart}
            placeholder="What do you want from this message? (e.g., &quot;ask for a 20-minute informational call about their AI platform work&quot;)"
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>Specific context (optional)</label>
          <textarea
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            disabled={!canStart}
            placeholder="Shared project, mutual connection, specific article you read, anything worth referencing."
            className={`${inputClass} resize-none`}
          />
        </div>

        {formError && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-3 py-2">
            <AlertCircle size={13} className="text-[var(--badge-red-text)] flex-shrink-0" />
            <span className="text-[12px] text-[var(--badge-red-text)]/80">{formError}</span>
          </div>
        )}
        {error && !formError && (
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
              <Sparkles size={13} className="mr-1.5" />
            )}
            {canStart ? 'Draft message' : busy ? 'Drafting…' : 'Drafting complete'}
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
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">
              Draft
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {latestDraft.messaging_method.replace('_', ' ')} · {latestDraft.recipient_type.replace('_', ' ')}
            </span>
            <span
              className={cn(
                'text-[11px]',
                overCap ? 'text-[var(--badge-red-text)]' : 'text-[var(--text-muted)]',
              )}
            >
              {latestDraft.char_count} / {charCap} chars
            </span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="ml-auto flex items-center gap-1 text-[13px] text-[var(--link)]/60 transition-colors hover:text-[var(--link)]"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {editing ? (
            <textarea
              rows={10}
              value={editedBody ?? latestDraft.message_markdown}
              onChange={(e) => setEditedBody(e.target.value)}
              className={`${inputClass} resize-none leading-relaxed whitespace-pre-wrap`}
            />
          ) : (
            <p className="text-[13px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {latestDraft.message_markdown}
            </p>
          )}

          {awaitingReview && !editing && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Ask the agent to revise</label>
                <textarea
                  rows={2}
                  placeholder="e.g. shorter · reference the mutual connection more clearly · less formal"
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
                <GlassButton
                  variant="ghost"
                  onClick={() => {
                    setEditedBody(latestDraft.message_markdown);
                    setEditing(true);
                  }}
                  className="text-[13px]"
                >
                  <Edit3 size={12} className="mr-1.5" />
                  Edit directly
                </GlassButton>
              </div>
            </div>
          )}

          {awaitingReview && editing && (
            <div className="flex items-center gap-2">
              <GlassButton
                variant="primary"
                onClick={() => void handleSaveEdit()}
                className="text-[13px]"
              >
                <Send size={12} className="mr-1.5" />
                Save my edits
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => {
                  setEditedBody(null);
                  setEditing(false);
                }}
                className="text-[13px]"
              >
                Cancel edit
              </GlassButton>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
