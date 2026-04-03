/**
 * ExportBar — DOCX + PDF download buttons and plain-text copy for completed v2 resume
 */

import { useState, useCallback } from 'react';
import { Download, FileType2, Loader2, AlertCircle, Clipboard, ClipboardCheck } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import { TemplateSelector } from '../TemplateSelector';
import type { ResumeDraft } from '@/types/resume-v2';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';
import { getExportGateState } from '@/lib/export-bar-gating';
import { trackProductEvent } from '@/lib/product-telemetry';
import { DEFAULT_TEMPLATE_ID } from '@/lib/export-templates';
import type { TemplateId } from '@/lib/export-templates';

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
  nextQueueItemLabel?: string;
  warningsAcknowledged?: boolean;
  onAcknowledgeWarnings?: () => void;
  /** Optional: called when the user clicks Copy. Supply a plain-text representation. */
  onCopy?: () => string | undefined;
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
  nextQueueItemLabel,
  warningsAcknowledged = false,
  onAcknowledgeWarnings,
  onCopy,
}: ExportBarProps) {
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const { hasWarnings, exportBlocked } = getExportGateState({
    hasCompletedFinalReview,
    isFinalReviewStale,
    unresolvedCriticalCount,
    unresolvedHardGapCount,
    warningsAcknowledged,
  });

  const getFinalResume = useCallback(() => {
    return resumeDraftToFinalResume(resume, { companyName, jobTitle, atsScore });
  }, [resume, companyName, jobTitle, atsScore]);

  const handleDocx = useCallback(async () => {
    trackProductEvent('export_attempted', {
      format: 'docx',
      export_blocked: exportBlocked,
      has_completed_final_review: hasCompletedFinalReview,
      is_final_review_stale: isFinalReviewStale,
      unresolved_critical_count: unresolvedCriticalCount,
      unresolved_hard_gap_count: unresolvedHardGapCount,
      queue_needs_attention_count: queueNeedsAttentionCount,
      queue_partial_count: queuePartialCount,
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
    exportBlocked,
    getFinalResume,
    hasCompletedFinalReview,
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
      export_blocked: exportBlocked,
      has_completed_final_review: hasCompletedFinalReview,
      is_final_review_stale: isFinalReviewStale,
      unresolved_critical_count: unresolvedCriticalCount,
      unresolved_hard_gap_count: unresolvedHardGapCount,
      queue_needs_attention_count: queueNeedsAttentionCount,
      queue_partial_count: queuePartialCount,
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
    exportBlocked,
    getFinalResume,
    hasCompletedFinalReview,
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
      export_blocked: exportBlocked,
      has_completed_final_review: hasCompletedFinalReview,
      is_final_review_stale: isFinalReviewStale,
      unresolved_critical_count: unresolvedCriticalCount,
      unresolved_hard_gap_count: unresolvedHardGapCount,
      queue_needs_attention_count: queueNeedsAttentionCount,
      queue_partial_count: queuePartialCount,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy to clipboard failed');
    }
  }, [
    exportBlocked,
    hasCompletedFinalReview,
    isFinalReviewStale,
    onCopy,
    queueNeedsAttentionCount,
    queuePartialCount,
    resume,
    unresolvedCriticalCount,
    unresolvedHardGapCount,
  ]);

  return (
    <div className="space-y-2">
      {hasWarnings && (
        <div className="support-callout border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.05] px-4 py-3.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--badge-amber-text)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-strong)]">Export still has open warnings</p>
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
                {(queueNeedsAttentionCount > 0 || queuePartialCount > 0) && (
                  <p>
                    The rewrite queue still has {queueNeedsAttentionCount} needs-attention item{queueNeedsAttentionCount === 1 ? '' : 's'} and {queuePartialCount} partial item{queuePartialCount === 1 ? '' : 's'}.
                    {nextQueueItemLabel ? ` The clearest next move is "${nextQueueItemLabel}".` : ''}
                  </p>
                )}
              </div>
              {exportBlocked ? (
                <GlassButton
                  onClick={() => {
                    trackProductEvent('export_warning_acknowledged', {
                      unresolved_critical_count: unresolvedCriticalCount,
                      queue_needs_attention_count: queueNeedsAttentionCount,
                      queue_partial_count: queuePartialCount,
                    });
                    onAcknowledgeWarnings?.();
                  }}
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                >
                  I understand, enable export
                </GlassButton>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-soft)]">
                  Warning acknowledged. Export is enabled, but the draft still has open review warnings.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasWarnings && (queueNeedsAttentionCount > 0 || queuePartialCount > 0) && (
        <div className="support-callout px-4 py-3 text-xs leading-5 text-[var(--text-soft)]">
          Export is available, but the queue still has {queueNeedsAttentionCount} needs-attention item{queueNeedsAttentionCount === 1 ? '' : 's'} and {queuePartialCount} partial item{queuePartialCount === 1 ? '' : 's'}.
          {nextQueueItemLabel ? ` If you want to keep improving the draft first, start with "${nextQueueItemLabel}".` : ''}
        </div>
      )}

      <TemplateSelector
        selected={selectedTemplate}
        onChange={setSelectedTemplate}
        className="pb-1"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <GlassButton
          onClick={handleDocx}
          disabled={exporting === 'docx' || exportBlocked}
          size="sm"
          className="gap-1.5"
        >
          {exporting === 'docx' ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : (
            <FileType2 className="h-3.5 w-3.5" />
          )}
          Download DOCX
          {exporting === 'pdf' && (
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--line-strong)] animate-pulse" aria-hidden="true" />
          )}
        </GlassButton>

        <GlassButton
          onClick={handlePdf}
          disabled={exporting === 'pdf' || exportBlocked}
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
          {exporting === 'docx' && (
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--line-strong)] animate-pulse" aria-hidden="true" />
          )}
        </GlassButton>

        <GlassButton
          onClick={handleCopy}
          disabled={exporting !== null || exportBlocked}
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
        `${exp.company}`,
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
