/**
 * ExportBar — DOCX + PDF download buttons and plain-text copy for completed v2 resume
 */

import { useState, useCallback } from 'react';
import { Download, FileType2, Loader2, AlertCircle, Clipboard, ClipboardCheck } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import type { ResumeDraft } from '@/types/resume-v2';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';
import { getExportGateState } from '@/lib/export-bar-gating';

interface ExportBarProps {
  resume: ResumeDraft;
  companyName?: string;
  jobTitle?: string;
  atsScore?: number;
  hasCompletedFinalReview?: boolean;
  isFinalReviewStale?: boolean;
  unresolvedCriticalCount?: number;
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
  const { hasWarnings, exportBlocked } = getExportGateState({
    hasCompletedFinalReview,
    isFinalReviewStale,
    unresolvedCriticalCount,
    warningsAcknowledged,
  });

  const getFinalResume = useCallback(() => {
    return resumeDraftToFinalResume(resume, { companyName, jobTitle, atsScore });
  }, [resume, companyName, jobTitle, atsScore]);

  const handleDocx = useCallback(async () => {
    setExporting('docx');
    setError(null);
    try {
      const { exportDocx } = await import('@/lib/export-docx');
      const result = await exportDocx(getFinalResume());
      if (!result.success) setError(result.error ?? 'DOCX export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }, [getFinalResume]);

  const handlePdf = useCallback(async () => {
    setExporting('pdf');
    setError(null);
    try {
      const { exportPdf } = await import('@/lib/export-pdf');
      const result = exportPdf(getFinalResume());
      if (!result.success) setError(result.error ?? 'PDF export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }, [getFinalResume]);

  const handleCopy = useCallback(async () => {
    const text = onCopy ? onCopy() : buildPlainText(resume);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy to clipboard failed');
    }
  }, [onCopy, resume]);

  return (
    <div className="space-y-2">
      {hasWarnings && (
        <div className="rounded-xl border border-[#f0d99f]/20 bg-[#f0d99f]/[0.05] px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d99f]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white/84">Export warning</p>
              <div className="mt-1 space-y-1 text-xs leading-5 text-white/62">
                {!hasCompletedFinalReview && (
                  <p>Final Review has not been run yet, so the draft has not been pressure-tested with the recruiter scan and hiring manager critique.</p>
                )}
                {isFinalReviewStale && (
                  <p>Final Review is out of date because the resume changed after the last review.</p>
                )}
                {unresolvedCriticalCount > 0 && (
                  <p>{unresolvedCriticalCount} critical Final Review concern{unresolvedCriticalCount === 1 ? '' : 's'} still remain unresolved.</p>
                )}
                {(queueNeedsAttentionCount > 0 || queuePartialCount > 0) && (
                  <p>
                    The rewrite queue still has {queueNeedsAttentionCount} needs-attention item{queueNeedsAttentionCount === 1 ? '' : 's'} and {queuePartialCount} partial item{queuePartialCount === 1 ? '' : 's'}.
                    {nextQueueItemLabel ? ` The clearest next move is "${nextQueueItemLabel}".` : ''}
                  </p>
                )}
              </div>
              {exportBlocked ? (
                <button
                  type="button"
                  onClick={onAcknowledgeWarnings}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#f0d99f]/25 bg-[#f0d99f]/10 px-3 py-2 text-xs font-medium text-[#f0d99f] transition-colors hover:bg-[#f0d99f]/16"
                >
                  I understand, enable export
                </button>
              ) : (
                <p className="mt-3 text-xs text-white/50">
                  Warning acknowledged. Export is enabled.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasWarnings && (queueNeedsAttentionCount > 0 || queuePartialCount > 0) && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/58">
          Export is enabled, but the queue still has {queueNeedsAttentionCount} needs-attention item{queueNeedsAttentionCount === 1 ? '' : 's'} and {queuePartialCount} partial item{queuePartialCount === 1 ? '' : 's'}.
          {nextQueueItemLabel ? ` If you want to keep improving the draft first, start with "${nextQueueItemLabel}".` : ''}
        </div>
      )}

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
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-white/20 animate-pulse" aria-hidden="true" />
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
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-white/20 animate-pulse" aria-hidden="true" />
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
              <ClipboardCheck className="h-3.5 w-3.5 text-[#b5dec2]" />
              <span className="text-[#b5dec2]">Copied!</span>
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
        <div className="flex items-center gap-2 text-xs text-[#f0b8b8]/80">
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
