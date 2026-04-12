/**
 * ExportBar — DOCX + PDF download buttons, plain-text copy, and Apply to This Job for completed v2 resume
 */

import { useState, useCallback } from 'react';
import { Download, FileType2, Loader2, AlertCircle, Clipboard, ClipboardCheck, ExternalLink } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import { TemplateSelector } from '../TemplateSelector';
import type { ResumeDraft } from '@/types/resume-v2';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';
import { getExportGateState } from '@/lib/export-bar-gating';
import { trackProductEvent } from '@/lib/product-telemetry';
import { DEFAULT_TEMPLATE_ID } from '@/lib/export-templates';
import type { TemplateId } from '@/lib/export-templates';
import { useToast } from '@/components/Toast';
import { API_BASE } from '@/lib/api';

interface ExportBarProps {
  resume: ResumeDraft;
  companyName?: string;
  jobTitle?: string;
  atsScore?: number;
  hasCompletedFinalReview?: boolean;
  isFinalReviewStale?: boolean;
  unresolvedCriticalCount?: number;
  unresolvedHardGapCount?: number;
  queueNeedsAttentionCount?: number;
  queuePartialCount?: number;
  /** Three-tier queue counts for health score display */
  queueNeedsUserInput?: number;
  queueNeedsApproval?: number;
  queueHandled?: number;
  queueTotal?: number;
  nextQueueItemLabel?: string;
  warningsAcknowledged?: boolean;
  onAcknowledgeWarnings?: () => void;
  /** Optional: called when the user clicks Copy. Supply a plain-text representation. */
  onCopy?: () => string | undefined;
  /** Job application URL — when present, shows the "Apply to This Job" button */
  jobUrl?: string;
  /** Session ID — required for linking the resume to the job application */
  sessionId?: string;
  /** Access token — required for the link-resume API call */
  accessToken?: string | null;
}

export function ExportBar({
  resume,
  companyName,
  jobTitle,
  atsScore,
  hasCompletedFinalReview = false,
  isFinalReviewStale = false,
  unresolvedCriticalCount = 0,
  unresolvedHardGapCount = 0,
  queueNeedsAttentionCount = 0,
  queuePartialCount = 0,
  queueNeedsUserInput = 0,
  queueNeedsApproval = 0,
  queueHandled = 0,
  queueTotal = 0,
  nextQueueItemLabel,
  warningsAcknowledged = false,
  onAcknowledgeWarnings: _onAcknowledgeWarnings,
  onCopy,
  jobUrl,
  sessionId,
  accessToken,
}: ExportBarProps) {
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [isLinkingResume, setIsLinkingResume] = useState(false);
  const { addToast } = useToast();
  const { hasWarnings } = getExportGateState({
    hasCompletedFinalReview,
    isFinalReviewStale,
    unresolvedCriticalCount,
    unresolvedHardGapCount,
    warningsAcknowledged,
  });

  // Health score: percentage of queue items that are handled
  const healthScore = queueTotal > 0 ? Math.round((queueHandled / queueTotal) * 100) : 100;
  const itemsToImprove = queueTotal - queueHandled;

  const getFinalResume = useCallback(() => {
    return resumeDraftToFinalResume(resume, { companyName, jobTitle, atsScore });
  }, [resume, companyName, jobTitle, atsScore]);

  const handleDocx = useCallback(async () => {
    trackProductEvent('export_attempted', {
      format: 'docx',
      has_completed_final_review: hasCompletedFinalReview,
      is_final_review_stale: isFinalReviewStale,
      unresolved_critical_count: unresolvedCriticalCount,
      unresolved_hard_gap_count: unresolvedHardGapCount,
      queue_needs_attention_count: queueNeedsAttentionCount,
      queue_partial_count: queuePartialCount,
      health_score: healthScore,
    });
    setExporting('docx');
    setError(null);
    try {
      const { exportDocx } = await import('@/lib/export-docx');
      const result = await exportDocx(getFinalResume(), selectedTemplate);
      if (!result.success) setError(result.error ?? 'DOCX export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }, [
    getFinalResume,
    hasCompletedFinalReview,
    healthScore,
    isFinalReviewStale,
    queueNeedsAttentionCount,
    queuePartialCount,
    selectedTemplate,
    unresolvedCriticalCount,
    unresolvedHardGapCount,
  ]);

  const handlePdf = useCallback(async () => {
    trackProductEvent('export_attempted', {
      format: 'pdf',
      has_completed_final_review: hasCompletedFinalReview,
      is_final_review_stale: isFinalReviewStale,
      unresolved_critical_count: unresolvedCriticalCount,
      unresolved_hard_gap_count: unresolvedHardGapCount,
      queue_needs_attention_count: queueNeedsAttentionCount,
      queue_partial_count: queuePartialCount,
      health_score: healthScore,
    });
    setExporting('pdf');
    setError(null);
    try {
      const { exportPdf } = await import('@/lib/export-pdf');
      const result = exportPdf(getFinalResume(), selectedTemplate);
      if (!result.success) setError(result.error ?? 'PDF export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }, [
    getFinalResume,
    hasCompletedFinalReview,
    healthScore,
    isFinalReviewStale,
    queueNeedsAttentionCount,
    queuePartialCount,
    selectedTemplate,
    unresolvedCriticalCount,
    unresolvedHardGapCount,
  ]);

  const handleCopy = useCallback(async () => {
    const text = onCopy ? onCopy() : buildPlainText(resume);
    if (!text) return;
    trackProductEvent('export_attempted', {
      format: 'copy',
      has_completed_final_review: hasCompletedFinalReview,
      is_final_review_stale: isFinalReviewStale,
      unresolved_critical_count: unresolvedCriticalCount,
      unresolved_hard_gap_count: unresolvedHardGapCount,
      queue_needs_attention_count: queueNeedsAttentionCount,
      queue_partial_count: queuePartialCount,
      health_score: healthScore,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy to clipboard failed');
    }
  }, [
    hasCompletedFinalReview,
    healthScore,
    isFinalReviewStale,
    onCopy,
    queueNeedsAttentionCount,
    queuePartialCount,
    resume,
    unresolvedCriticalCount,
    unresolvedHardGapCount,
  ]);

  const handleApply = useCallback(async () => {
    if (!jobUrl || !sessionId || !accessToken) return;
    setIsLinkingResume(true);
    try {
      await fetch(`${API_BASE}/extension/link-resume`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          job_url: jobUrl,
          job_title: jobTitle,
          company_name: companyName,
        }),
      });
      window.open(jobUrl, '_blank', 'noopener,noreferrer');
      addToast({
        type: 'info',
        message: 'Opening application — the CareerIQ extension will auto-fill your resume',
        duration: 5000,
      });
    } catch {
      addToast({
        type: 'error',
        message: 'Failed to link resume. The application page will still open.',
      });
      window.open(jobUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setIsLinkingResume(false);
    }
  }, [jobUrl, sessionId, accessToken, jobTitle, companyName, addToast]);

  return (
    <div className="space-y-2">
      {/* Health score */}
      {queueTotal > 0 && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xs text-[var(--text-soft)]">
                Resume health: <span className="font-semibold text-[var(--text-strong)]">{healthScore}%</span>
              </span>
              {itemsToImprove > 0 && (
                <span className="text-xs text-[var(--text-muted)]">
                  — {itemsToImprove} item{itemsToImprove === 1 ? '' : 's'} could make it stronger
                </span>
              )}
            </div>
            <div className="mt-1 h-1 w-full rounded-full bg-[var(--line-soft)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--badge-green-text)] transition-all duration-500"
                style={{ width: `${healthScore}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}

      {/* Three-tier queue summary */}
      {queueTotal > 0 && (
        <div className="flex items-center gap-3 px-1 flex-wrap">
          {queueNeedsUserInput > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-soft)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--badge-red-text)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--badge-red-text)]">{queueNeedsUserInput}</span>{' '}
              {queueNeedsUserInput === 1 ? 'item needs' : 'items need'} your input
            </span>
          )}
          {queueNeedsApproval > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-soft)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--badge-amber-text)]" aria-hidden="true" />
              <span className="font-medium">{queueNeedsApproval}</span>{' '}
              {queueNeedsApproval === 1 ? 'item wants' : 'items want'} your approval
            </span>
          )}
          {queueHandled > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--badge-green-text)]" aria-hidden="true" />
              {queueHandled} handled
            </span>
          )}
        </div>
      )}

      {/* Informational warnings — never blocking */}
      {hasWarnings && (
        <div className="support-callout border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.05] px-4 py-3.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--badge-amber-text)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-strong)]">A few things to be aware of</p>
              <div className="mt-1 space-y-1 text-xs leading-5 text-[var(--text-soft)]">
                {!hasCompletedFinalReview && (
                  <p>Final Review has not been run yet.</p>
                )}
                {isFinalReviewStale && (
                  <p>Final Review is out of date because the resume changed.</p>
                )}
                {unresolvedCriticalCount > 0 && (
                  <p>{unresolvedCriticalCount} critical Final Review concern{unresolvedCriticalCount === 1 ? '' : 's'} still remain unresolved.</p>
                )}
                {unresolvedHardGapCount > 0 && (
                  <p>{unresolvedHardGapCount} hard requirement risk{unresolvedHardGapCount === 1 ? '' : 's'} still remain on the draft.</p>
                )}
                {(queueNeedsAttentionCount > 0 || queuePartialCount > 0) && nextQueueItemLabel && (
                  <p>The clearest next move is "{nextQueueItemLabel}".</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <TemplateSelector
        selected={selectedTemplate}
        onChange={setSelectedTemplate}
        className="pb-1"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <GlassButton
          data-export-docx
          onClick={handleDocx}
          disabled={exporting !== null}
          size="sm"
          className="gap-1.5"
        >
          {exporting === 'docx' ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : (
            <FileType2 className="h-3.5 w-3.5" />
          )}
          Download DOCX
        </GlassButton>

        <GlassButton
          data-export-pdf
          onClick={handlePdf}
          disabled={exporting !== null}
          variant="ghost"
          size="sm"
          className="gap-1.5"
        >
          {exporting === 'pdf' ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download PDF
        </GlassButton>

        <GlassButton
          onClick={handleCopy}
          disabled={exporting !== null}
          variant="ghost"
          size="sm"
          className="gap-1.5"
          aria-label={copied ? 'Copied to clipboard' : 'Copy resume as plain text'}
        >
          {copied ? (
            <>
              <ClipboardCheck className="h-3.5 w-3.5 text-[var(--badge-green-text)]" />
              <span className="text-[var(--badge-green-text)]">Copied!</span>
            </>
          ) : (
            <>
              <Clipboard className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </GlassButton>

        {jobUrl && sessionId && accessToken && (
          <GlassButton
            onClick={handleApply}
            disabled={isLinkingResume}
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label="Open job application and auto-fill with CareerIQ extension"
          >
            {isLinkingResume ? (
              <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
            Apply to This Job
          </GlassButton>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-[var(--badge-red-text)]/80">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Plain-text builder ───────────────────────────────────────────────────────

function buildPlainText(resume: ResumeDraft): string {
  const lines: string[] = [];

  // Header
  lines.push(resume.header.name);
  if (resume.header.branded_title) lines.push(resume.header.branded_title);
  const contact = [resume.header.phone, resume.header.email, resume.header.linkedin]
    .filter(Boolean)
    .join(' | ');
  if (contact) lines.push(contact);

  // Executive summary
  if (resume.executive_summary.content) {
    lines.push('', 'EXECUTIVE SUMMARY', resume.executive_summary.content);
  }

  // Core competencies
  if (resume.core_competencies.length > 0) {
    lines.push('', 'CORE COMPETENCIES', resume.core_competencies.join(' · '));
  }

  // Professional experience
  if (resume.professional_experience.length > 0) {
    lines.push('', 'PROFESSIONAL EXPERIENCE');
    for (const exp of resume.professional_experience) {
      lines.push(
        '',
        exp.company,
        `${exp.title} | ${exp.start_date} – ${exp.end_date}`,
      );
      if (exp.scope_statement) lines.push(exp.scope_statement);
      for (const bullet of exp.bullets) {
        lines.push(`• ${bullet.text}`);
      }
    }
  }

  // Earlier career
  if (resume.earlier_career && resume.earlier_career.length > 0) {
    lines.push('', 'EARLIER CAREER');
    for (const ec of resume.earlier_career) {
      lines.push(`${ec.company} — ${ec.title} (${ec.dates})`);
    }
  }

  // Selected accomplishments
  if (resume.selected_accomplishments.length > 0) {
    lines.push('', 'SELECTED ACCOMPLISHMENTS');
    for (const acc of resume.selected_accomplishments) {
      lines.push(`• ${acc.content}`);
    }
  }

  // Education
  if (resume.education.length > 0) {
    lines.push('', 'EDUCATION');
    for (const ed of resume.education) {
      lines.push(`${ed.degree} — ${ed.institution}${ed.year ? ` (${ed.year})` : ''}`);
    }
  }

  // Certifications
  if (resume.certifications.length > 0) {
    lines.push('', 'CERTIFICATIONS');
    for (const cert of resume.certifications) {
      lines.push(`• ${cert}`);
    }
  }

  return lines.join('\n');
}
