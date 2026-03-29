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
}

type Phase = 'intake' | 'running' | 'complete' | 'error';

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
      color: 'text-[#afc4ff]',
      borderColor: 'border-[#afc4ff]/15',
    },
    {
      type: 'why_company',
      label: 'Why This Company',
      icon: Building2,
      color: 'text-[#b5dec2]',
      borderColor: 'border-[#b5dec2]/15',
    },
    {
      type: 'value_proposition',
      label: 'Value Proposition',
      icon: Target,
      color: 'text-[#f0d99f]',
      borderColor: 'border-[#f0d99f]/15',
    },
    {
      type: 'call_to_action',
      label: 'Call to Action',
      icon: ArrowRight,
      color: 'text-[#afc4ff]',
      borderColor: 'border-[#afc4ff]/15',
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
      label: `Body ${i}`,
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

  const toneLabel = tone === 'bold' ? 'Bold' : tone === 'conversational' ? 'Conversational' : 'Formal';
  const toneBg = tone === 'bold'
    ? 'bg-[#f0d99f]/10 text-[#f0d99f] border-[#f0d99f]/15'
    : tone === 'conversational'
    ? 'bg-[#b5dec2]/10 text-[#b5dec2] border-[#b5dec2]/15'
    : 'bg-[#afc4ff]/10 text-[#afc4ff] border-[#afc4ff]/15';

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-[#b5dec2]" />
          <span className="text-sm font-medium text-[var(--text-strong)]">Cover Letter Draft</span>
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
          <span className="rounded-md px-1.5 py-0.5 text-[12px] bg-[var(--accent-muted)] border border-[var(--line-soft)] text-[var(--text-soft)]">
            {wordCount} words
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
                  ? 'bg-[#b5dec2]/10 text-[#b5dec2] border-[#b5dec2]/15'
                  : qualityScore >= 60
                    ? 'bg-[#f0d99f]/10 text-[#f0d99f] border-[#f0d99f]/15'
                    : 'bg-[#f0b8b8]/10 text-[#f0b8b8] border-[#f0b8b8]/15',
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
              qualityScore >= 80 ? 'text-[#b5dec2]' : qualityScore >= 60 ? 'text-[#f0d99f]' : 'text-[#f0b8b8]',
            )}>
              {qualityScore >= 80 ? 'Strong' : qualityScore >= 60 ? 'Solid' : 'Needs polish'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--accent-muted)]">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                qualityScore >= 80 ? 'bg-[#b5dec2]/60' : qualityScore >= 60 ? 'bg-[#f0d99f]/60' : 'bg-[#f0b8b8]/60',
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
            <><Check className="mr-1.5 h-3 w-3 text-[#b5dec2]" />Copied</>
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
}: CoverLetterScreenProps) {
  const [phase, setPhase] = useState<Phase>('intake');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [selectedTone, setSelectedTone] = useState<CoverLetterTone>('formal');
  const [defaultResumeText, setDefaultResumeText] = useState<string | undefined>(undefined);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
    startPipeline,
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
          setIntakeError('Failed to create session');
          setIntakeLoading(false);
          return;
        }

        const ok = await startPipeline(sessionId, data.resumeText, data.jobDescription, data.companyName, data.tone);
        if (ok) {
          setPhase('running');
        }
      } catch (err) {
        setIntakeError(err instanceof Error ? err.message : 'Failed to start');
      } finally {
        setIntakeLoading(false);
      }
    },
    [accessToken, startPipeline],
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

  const resolvedBackLabel = backLabel ?? (embedded ? 'Back to Resume Builder' : 'Back to Tools');
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
          <ArrowLeft className="h-3.5 w-3.5" />
          {resolvedBackLabel}
        </button>

        {/* Activity Feed (running) */}
        {effectivePhase === 'running' && (
          <GlassCard className="mb-6 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin text-[#afc4ff]" />
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
              <div className="h-full motion-safe:animate-pulse rounded-full bg-[#afc4ff]/40" style={{ width: '60%' }} />
            </div>
          </GlassCard>
        )}

        {/* Error Phase */}
        {effectivePhase === 'error' && (
          <GlassCard className="mb-6 border-[#f0b8b8]/20 p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#f0b8b8]" />
              <span className="text-sm font-medium text-[#f0b8b8]">Something went wrong</span>
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
          </>
        )}
      </div>
    </div>
  );
}
