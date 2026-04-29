import { useState, useCallback, useEffect } from 'react';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  FileText,
  RotateCcw,
  ArrowLeft,
  Copy,
  Check,
  Sparkles,
  Building2,
  Target,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { CoverLetterIntakeForm } from './CoverLetterIntakeForm';
import type { CoverLetterTone } from './CoverLetterIntakeForm';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { useCoverLetter } from '@/hooks/useCoverLetter';
import { IAppliedCTA } from '@/components/applications/IAppliedCTA';
import { WhatsNextCTABar } from '@/components/applications/WhatsNextCTABar';
import { API_BASE } from '@/lib/api';
import { buildResumeWorkspaceRoute } from '@/lib/app-routing';
import { cn } from '@/lib/utils';
import type { MasterResume } from '@/types/resume';

interface CoverLetterScreenProps {
  accessToken: string | null;
  onNavigate: (route: string) => void;
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  embedded?: boolean;
  backTarget?: string;
  backLabel?: string;
  /**
   * Approach C Phase 1.3 — when the screen is rendered inside
   * /workspace/application/:applicationId/cover-letter, this prop is
   * populated with the application ID. Gets passed to the backend so the
   * generated cover letter is linked to the application (coach_sessions.
   * job_application_id). Unset when the screen runs outside an application
   * workspace context — in that case the cover letter is unscoped, same
   * as today.
   */
  applicationId?: string;
  /**
   * Approach C Sprint A — when rendered inside an application workspace, the
   * parent threads company name and JD text from the application record so
   * the intake form prefills instead of asking the user to retype.
   */
  initialCompanyName?: string;
  initialRoleTitle?: string;
  initialJobDescription?: string;
}

type Phase = 'intake' | 'running' | 'letter_review' | 'complete' | 'error';

// ─── Section parsing ──────────────────────────────────────────────────────────

interface LetterSection {
  type: 'opening_hook' | 'why_company' | 'value_proposition' | 'call_to_action' | 'body';
  label: string;
  content: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
}

function parseSectionsFromLetter(text: string): LetterSection[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const sectionConfig: Omit<LetterSection, 'content'>[] = [
    {
      type: 'opening_hook',
      label: 'Opening Hook',
      icon: Sparkles,
      color: 'text-[var(--link)]',
      borderColor: 'border-[var(--badge-blue-text)]/15',
    },
    {
      type: 'why_company',
      label: 'Why This Company',
      icon: Building2,
      color: 'text-[var(--badge-green-text)]',
      borderColor: 'border-[var(--badge-green-text)]/15',
    },
    {
      type: 'value_proposition',
      label: 'Value Proposition',
      icon: Target,
      color: 'text-[var(--badge-amber-text)]',
      borderColor: 'border-[var(--badge-amber-text)]/15',
    },
    {
      type: 'call_to_action',
      label: 'Call to Action',
      icon: ArrowRight,
      color: 'text-[var(--link)]',
      borderColor: 'border-[var(--badge-blue-text)]/15',
    },
  ];

  // Assign paragraphs to sections. Opening = first, CTA = last, body paragraphs fill middle.
  const sections: LetterSection[] = [];

  if (paragraphs.length === 1) {
    sections.push({ ...sectionConfig[0], content: paragraphs[0] });
    return sections;
  }

  // Opening hook = first paragraph
  sections.push({ ...sectionConfig[0], content: paragraphs[0] });

  // Call to action = last paragraph
  const last = paragraphs[paragraphs.length - 1];

  // Middle paragraphs: assign why_company and value_proposition
  const middle = paragraphs.slice(1, paragraphs.length - 1);

  if (middle.length >= 1) {
    sections.push({ ...sectionConfig[1], content: middle[0] });
  }
  if (middle.length >= 2) {
    sections.push({ ...sectionConfig[2], content: middle[1] });
  }
  // Any additional middle paragraphs become generic body sections
  for (let i = 2; i < middle.length; i++) {
    sections.push({
      type: 'body',
      label: `Body ${i - 1}`,
      icon: MessageSquare,
      color: 'text-[var(--text-soft)]',
      borderColor: 'border-[var(--line-soft)]',
      content: middle[i],
    });
  }

  sections.push({ ...sectionConfig[3], content: last });

  return sections;
}

// ─── Letter output ────────────────────────────────────────────────────────────

function LetterOutput({
  letterDraft,
  qualityScore,
  companyName,
  tone,
  onCopy,
  copied,
}: {
  letterDraft: string;
  qualityScore: number | null;
  companyName: string;
  tone: CoverLetterTone;
  onCopy: () => void;
  copied: boolean;
}) {
  const sections = parseSectionsFromLetter(letterDraft);
  const wordCount = letterDraft.trim().split(/\s+/).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));
  const lengthStatus = wordCount > 425
    ? {
        label: 'Too long',
        className: 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)] border-[var(--badge-red-text)]/15',
      }
    : wordCount > 375
      ? {
          label: 'Long',
          className: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/15',
        }
      : wordCount >= 225
        ? {
            label: 'Sharp',
            className: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border-[var(--badge-green-text)]/15',
          }
        : {
            label: 'Brief',
            className: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/15',
          };

  const toneLabel = tone === 'bold' ? 'Bold' : tone === 'conversational' ? 'Conversational' : 'Formal';
  const toneBg = tone === 'bold'
    ? 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/15'
    : tone === 'conversational'
    ? 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border-[var(--badge-green-text)]/15'
    : 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)] border-[var(--badge-blue-text)]/15';

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-[var(--badge-green-text)]" />
          <span className="text-sm font-medium text-[var(--text-strong)]">Concise WHY ME Letter</span>
          {companyName && (
            <span className="text-xs text-[var(--text-soft)]">for {companyName}</span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Tone badge */}
          <span className={cn('rounded-md px-1.5 py-0.5 text-[12px] font-medium border', toneBg)}>
            {toneLabel}
          </span>
          {/* Word count */}
          <span className={cn('rounded-md px-1.5 py-0.5 text-[12px] font-medium border', lengthStatus.className)}>
            {wordCount} words · {lengthStatus.label}
          </span>
          {/* Read time */}
          <span className="rounded-md px-1.5 py-0.5 text-[12px] bg-[var(--accent-muted)] border border-[var(--line-soft)] text-[var(--text-soft)]">
            ~{readTime} min read
          </span>
          {/* Quality score */}
          {qualityScore != null && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[12px] font-medium border',
                qualityScore >= 80
                  ? 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border-[var(--badge-green-text)]/15'
                  : qualityScore >= 60
                    ? 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/15'
                    : 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)] border-[var(--badge-red-text)]/15',
              )}
            >
              Draft Score {qualityScore}/100
            </span>
          )}
        </div>
      </div>

      {/* Quality score bar (if available) */}
      {qualityScore != null && (
        <GlassCard className="px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] text-[var(--text-soft)]">Draft Score</span>
            <span className={cn(
              'text-[13px] font-semibold',
              qualityScore >= 80 ? 'text-[var(--badge-green-text)]' : qualityScore >= 60 ? 'text-[var(--badge-amber-text)]' : 'text-[var(--badge-red-text)]',
            )}>
              {qualityScore >= 80 ? 'Strong' : qualityScore >= 60 ? 'Solid' : 'Needs polish'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--accent-muted)]">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                qualityScore >= 80 ? 'bg-[var(--badge-green-text)]/60' : qualityScore >= 60 ? 'bg-[var(--badge-amber-text)]/60' : 'bg-[var(--badge-red-text)]/60',
              )}
              style={{ width: `${qualityScore}%` }}
            />
          </div>
        </GlassCard>
      )}

      {/* Sectioned letter display */}
      {sections.length > 0 ? (
        <div className="space-y-3">
          {sections.map((section, i) => {
            const Icon = section.icon;
            return (
              <GlassCard
                key={i}
                className={cn('p-4 border', section.borderColor)}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon className={cn('h-3.5 w-3.5', section.color)} />
                  <span className={cn('text-[13px] font-semibold uppercase tracking-wider', section.color)}>
                    {section.label}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap">
                  {section.content}
                </p>
              </GlassCard>
            );
          })}
        </div>
      ) : (
        <GlassCard className="p-6">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-strong)]">
            {letterDraft}
          </div>
        </GlassCard>
      )}

      {/* Copy full letter button (above the action row) */}
      <div className="flex justify-end">
        <GlassButton variant="ghost" onClick={onCopy} size="sm">
          {copied ? (
            <><Check className="mr-1.5 h-3 w-3 text-[var(--badge-green-text)]" />Copied</>
          ) : (
            <><Copy className="mr-1.5 h-3 w-3" />Copy Full Letter</>
          )}
        </GlassButton>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function CoverLetterScreen({
  accessToken,
  onNavigate,
  onGetDefaultResume,
  embedded = false,
  backTarget = buildResumeWorkspaceRoute(),
  backLabel,
  applicationId,
  initialCompanyName,
  initialRoleTitle,
  initialJobDescription,
}: CoverLetterScreenProps) {
  const [phase, setPhase] = useState<Phase>('intake');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [selectedTone, setSelectedTone] = useState<CoverLetterTone>('formal');
  const [defaultResumeText, setDefaultResumeText] = useState<string | undefined>(undefined);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Fetch the master resume on mount and pre-fill the intake form
  useEffect(() => {
    if (!onGetDefaultResume) return;
    let cancelled = false;
    setResumeLoading(true);
    onGetDefaultResume()
      .then((resume) => {
        if (!cancelled && resume?.raw_text?.trim()) {
          setDefaultResumeText(resume.raw_text);
        }
      })
      .catch(() => {
        // Non-blocking: pre-fill is best-effort
      })
      .finally(() => {
        if (!cancelled) setResumeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onGetDefaultResume]);

  const {
    status,
    letterDraft,
    qualityScore,
    activityMessages,
    error: pipelineError,
    currentStage,
    letterReviewData,
    startPipeline,
    respondToGate,
    reset,
  } = useCoverLetter(accessToken);

  // Sync hook status → phase
  const effectivePhase: Phase =
    phase === 'intake'
      ? 'intake'
      : status === 'complete'
        ? 'complete'
        : status === 'error'
          ? 'error'
          : status === 'letter_review'
            ? 'letter_review'
            : 'running';

  const handleSubmit = useCallback(
    async (data: { resumeText: string; jobDescription: string; companyName: string; tone: CoverLetterTone }) => {
      if (!accessToken) return;
      setIntakeLoading(true);
      setIntakeError(null);
      setCompanyName(data.companyName);
      setSelectedTone(data.tone);

      try {
        // Create a session first
        const sessionRes = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({}),
        });

        if (!sessionRes.ok) {
          setIntakeError(`Failed to create session (${sessionRes.status})`);
          setIntakeLoading(false);
          return;
        }

        const sessionData = await sessionRes.json();
        const sessionId = sessionData.session?.id as string;
        if (!sessionId) {
          setIntakeError('Failed to create cover letter');
          setIntakeLoading(false);
          return;
        }

        const ok = await startPipeline(
          sessionId,
          data.resumeText,
          data.jobDescription,
          data.companyName,
          data.tone,
          initialRoleTitle,
          applicationId,
        );
        if (ok) {
          setPhase('running');
        }
      } catch (err) {
        setIntakeError(err instanceof Error ? err.message : 'Failed to start');
      } finally {
        setIntakeLoading(false);
      }
    },
    [accessToken, applicationId, initialRoleTitle, startPipeline],
  );

  const handleWriteAnother = useCallback(() => {
    reset();
    setPhase('intake');
    setIntakeError(null);
    setCompanyName('');
    setCopied(false);
  }, [reset]);

  const handleRetry = useCallback(() => {
    reset();
    setPhase('intake');
    setIntakeError(null);
    setCopied(false);
  }, [reset]);

  const handleCopy = useCallback(async () => {
    if (!letterDraft) return;
    try {
      await navigator.clipboard.writeText(letterDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [letterDraft]);

  const resolvedBackLabel = backLabel ?? (embedded ? 'Back to Application' : 'Back to Home');
  const outerClassName = embedded ? '' : 'h-[calc(100vh-3.5rem)] overflow-y-auto';

  // ─── Intake Phase ────────────────────────────────────────────────
  if (effectivePhase === 'intake') {
    return (
      <CoverLetterIntakeForm
        onSubmit={handleSubmit}
        onBack={() => onNavigate(backTarget)}
        loading={intakeLoading}
        error={intakeError}
        defaultResumeText={defaultResumeText}
        resumeLoading={resumeLoading}
        backLabel={resolvedBackLabel}
        embedded={embedded}
        initialCompanyName={initialCompanyName}
        initialJobDescription={initialJobDescription}
      />
    );
  }

  // ─── Running / Complete / Error Phases ───────────────────────────
  return (
    <div className={outerClassName}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          type="button"
          onClick={() => onNavigate(backTarget)}
          className="mb-6 flex items-center gap-1.5 text-sm text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {resolvedBackLabel}
        </button>

        {/* Activity Feed (running) */}
        {effectivePhase === 'running' && (
          <GlassCard className="mb-6 p-5" role="status" aria-live="polite">
            <div className="mb-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin text-[var(--link)]" />
              <span className="text-sm font-medium text-[var(--text-strong)]">
                {currentStage
                  ? currentStage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                  : 'Starting...'}
              </span>
            </div>
            {activityMessages.length > 0 && (
              <div className="space-y-1.5">
                {activityMessages.slice(-10).map((msg, i) => (
                  <p
                    key={msg.id}
                    className={cn(
                      'text-xs leading-relaxed',
                      i === activityMessages.slice(-10).length - 1
                        ? 'text-[var(--text-muted)]'
                        : 'text-[var(--text-soft)]',
                    )}
                  >
                    {msg.message}
                  </p>
                ))}
              </div>
            )}
            {/* Progress bar */}
            <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[var(--accent-muted)]">
              <div className="h-full motion-safe:animate-pulse rounded-full bg-[var(--link)]/40" style={{ width: '100%' }} />
            </div>
          </GlassCard>
        )}

        {/* Error Phase */}
        {effectivePhase === 'error' && (
          <GlassCard className="mb-6 border-[var(--badge-red-text)]/20 p-5" role="alert">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[var(--badge-red-text)]" />
              <span className="text-sm font-medium text-[var(--badge-red-text)]">Something went wrong</span>
            </div>
            <p className="mb-4 text-xs text-[var(--text-soft)]">
              {pipelineError ?? 'An unexpected error occurred.'}
            </p>
            <GlassButton variant="ghost" onClick={handleRetry}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Try Again
            </GlassButton>
          </GlassCard>
        )}

        {/* Letter Review Gate */}
        {effectivePhase === 'letter_review' && letterReviewData && (
          <GlassCard className="mb-6 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[var(--badge-green-text)]" />
              <span className="text-sm font-medium text-[var(--text-strong)]">Draft Ready for Review</span>
            </div>

            <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-strong)]">
                {letterReviewData.letter_draft}
              </p>
            </div>

            {letterReviewData.quality_score != null && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-soft)]">Draft score:</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[12px] font-medium border',
                    letterReviewData.quality_score >= 80
                      ? 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border-[var(--badge-green-text)]/15'
                      : letterReviewData.quality_score >= 60
                        ? 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/15'
                        : 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)] border-[var(--badge-red-text)]/15',
                  )}
                >
                  {letterReviewData.quality_score}/100
                </span>
              </div>
            )}

            <div className="space-y-3 pt-1">
              <textarea
                className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus:ring-1 focus:ring-[var(--link)]/40 resize-none"
                rows={3}
                placeholder="Optional: describe any changes you'd like before approving..."
                value={reviewFeedback}
                onChange={(e) => setReviewFeedback(e.target.value)}
                disabled={reviewSubmitting}
              />
              <div className="flex flex-wrap gap-3">
                <GlassButton
                  variant="primary"
                  disabled={reviewSubmitting}
                  onClick={async () => {
                    setReviewSubmitting(true);
                    await respondToGate('letter_review', true);
                    setReviewSubmitting(false);
                    setReviewFeedback('');
                  }}
                >
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                  Approve & Save
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  disabled={reviewSubmitting || !reviewFeedback.trim()}
                  onClick={async () => {
                    if (!reviewFeedback.trim()) return;
                    setReviewSubmitting(true);
                    await respondToGate('letter_review', { approved: false, feedback: reviewFeedback.trim() });
                    setReviewSubmitting(false);
                    setReviewFeedback('');
                  }}
                >
                  {reviewSubmitting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Request Changes
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Complete Phase — no draft received */}
        {effectivePhase === 'complete' && !letterDraft && (
          <GlassCard className="mb-6 border-[var(--badge-amber-text)]/20 p-5" role="alert">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[var(--badge-amber-text)]" />
              <span className="text-sm font-medium text-[var(--badge-amber-text)]">Cover letter not received</span>
            </div>
            <p className="mb-4 text-xs text-[var(--text-soft)]">
              The run completed but no cover letter draft was returned. Please try again.
            </p>
            <GlassButton variant="ghost" onClick={handleRetry}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Try Again
            </GlassButton>
          </GlassCard>
        )}

        {/* Complete Phase — Letter Display */}
        {effectivePhase === 'complete' && letterDraft && (
          <>
            <LetterOutput
              letterDraft={letterDraft}
              qualityScore={qualityScore}
              companyName={companyName}
              tone={selectedTone}
              onCopy={handleCopy}
              copied={copied}
            />

            <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="cover-letter-actions">
              <GlassButton
                variant="primary"
                onClick={async () => {
                  const { exportCoverLetterPdf } = await import('@/lib/export-cover-letter');
                  exportCoverLetterPdf(letterDraft, companyName);
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download PDF
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={async () => {
                  const { exportCoverLetterDocx } = await import('@/lib/export-cover-letter');
                  await exportCoverLetterDocx(letterDraft, companyName);
                }}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Download DOCX
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={async () => {
                  const { downloadCoverLetterAsText } = await import('@/lib/export-cover-letter');
                  downloadCoverLetterAsText(letterDraft, companyName);
                }}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Download Text
              </GlassButton>
              <GlassButton variant="ghost" onClick={handleWriteAnother}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Write Another
              </GlassButton>
            </div>

            {applicationId && (
              <div className="mt-4">
                <IAppliedCTA applicationId={applicationId} />
              </div>
            )}
            {applicationId && (
              <WhatsNextCTABar
                applicationId={applicationId}
                className="mt-4"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
