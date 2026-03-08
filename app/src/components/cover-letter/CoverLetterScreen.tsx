import { useState, useCallback, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, Download, FileText, RotateCcw, ArrowLeft } from 'lucide-react';
import { CoverLetterIntakeForm } from './CoverLetterIntakeForm';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { useCoverLetter } from '@/hooks/useCoverLetter';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { MasterResume } from '@/types/resume';

interface CoverLetterScreenProps {
  accessToken: string | null;
  onNavigate: (route: string) => void;
  onGetDefaultResume?: () => Promise<MasterResume | null>;
}

type Phase = 'intake' | 'running' | 'complete' | 'error';

export function CoverLetterScreen({ accessToken, onNavigate, onGetDefaultResume }: CoverLetterScreenProps) {
  const [phase, setPhase] = useState<Phase>('intake');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [defaultResumeText, setDefaultResumeText] = useState<string | undefined>(undefined);
  const [resumeLoading, setResumeLoading] = useState(false);

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
    async (data: { resumeText: string; jobDescription: string; companyName: string }) => {
      if (!accessToken) return;
      setIntakeLoading(true);
      setIntakeError(null);
      setCompanyName(data.companyName);

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

        const ok = await startPipeline(sessionId, data.resumeText, data.jobDescription, data.companyName);
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
  }, [reset]);

  const handleRetry = useCallback(() => {
    reset();
    setPhase('intake');
    setIntakeError(null);
  }, [reset]);

  // ─── Intake Phase ────────────────────────────────────────────────
  if (effectivePhase === 'intake') {
    return (
      <CoverLetterIntakeForm
        onSubmit={handleSubmit}
        onBack={() => onNavigate('/tools')}
        loading={intakeLoading}
        error={intakeError}
        defaultResumeText={defaultResumeText}
        resumeLoading={resumeLoading}
      />
    );
  }

  // ─── Running / Complete / Error Phases ───────────────────────────
  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          type="button"
          onClick={() => onNavigate('/tools')}
          className="mb-6 flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Tools
        </button>

        {/* Activity Feed (running + complete) */}
        {effectivePhase === 'running' && (
          <GlassCard className="mb-6 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin text-[#aec3ff]" />
              <span className="text-sm font-medium text-white/85">
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
                        ? 'text-white/70'
                        : 'text-white/40',
                    )}
                  >
                    {msg.text}
                  </p>
                ))}
              </div>
            )}
            {/* Progress bar */}
            <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full motion-safe:animate-pulse rounded-full bg-[#aec3ff]/40" style={{ width: '60%' }} />
            </div>
          </GlassCard>
        )}

        {/* Error Phase */}
        {effectivePhase === 'error' && (
          <GlassCard className="mb-6 border-[#e0abab]/20 p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#e0abab]" />
              <span className="text-sm font-medium text-[#e0abab]">Something went wrong</span>
            </div>
            <p className="mb-4 text-xs text-white/60">
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
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#b5dec2]" />
                <span className="text-sm font-medium text-white/85">Cover Letter Ready</span>
                {companyName && (
                  <span className="text-xs text-white/50">for {companyName}</span>
                )}
              </div>
              {qualityScore != null && (
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    qualityScore >= 80
                      ? 'bg-[#b5dec2]/15 text-[#b5dec2]'
                      : qualityScore >= 60
                        ? 'bg-[#dfc797]/15 text-[#dfc797]'
                        : 'bg-[#e0abab]/15 text-[#e0abab]',
                  )}
                >
                  Quality: {qualityScore}/100
                </span>
              )}
            </div>

            <GlassCard className="mb-6 p-6">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                {letterDraft}
              </div>
            </GlassCard>

            <div className="flex flex-wrap items-center gap-3" data-testid="cover-letter-actions">
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
