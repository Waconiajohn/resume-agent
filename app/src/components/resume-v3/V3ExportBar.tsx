/**
 * V3ExportBar — DOCX + PDF + TXT + Copy buttons for a completed V3 run.
 *
 * Structurally parallel to resume-v2/ExportBar but without v2's queue /
 * health-score gating. V3 keeps export available, with a non-blocking
 * readiness warning when Tailoring Plan or Final Check still has open items.
 *
 * The adapter (`v3ToFinalResume`) bridges V3's split (structured + written)
 * into the FinalResume shape that export-docx and export-pdf expect, so the
 * underlying template renderers are shared across v2 and v3.
 */

import { useCallback, useState } from 'react';
import {
  AlertCircle,
  Clipboard,
  ClipboardCheck,
  Download,
  FileType2,
  Loader2,
} from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';
import { TemplateSelector } from '@/components/TemplateSelector';
import { DEFAULT_TEMPLATE_ID, type TemplateId } from '@/lib/export-templates';
import { v3ToFinalResume } from '@/lib/resume-v3-export';
import { trackProductEvent } from '@/lib/product-telemetry';
import type {
  V3StructuredResume,
  V3WrittenResume,
} from '@/hooks/useV3Pipeline';

interface V3ExportBarProps {
  structured: V3StructuredResume;
  written: V3WrittenResume;
  companyName?: string;
  jobTitle?: string;
  /** Session id for telemetry; optional. */
  sessionId?: string | null;
  /** Non-blocking readiness warning shown when Final Check still has open items. */
  readinessWarning?: string | null;
}

export function V3ExportBar({
  structured,
  written,
  companyName,
  jobTitle,
  sessionId,
  readinessWarning,
}: V3ExportBarProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getFinalResume = useCallback(() => {
    return v3ToFinalResume(structured, written, { companyName, jobTitle });
  }, [structured, written, companyName, jobTitle]);

  const handleDocx = useCallback(async () => {
    trackProductEvent('export_attempted', {
      format: 'docx',
      product: 'resume_v3',
      template: selectedTemplate,
      session_id: sessionId ?? undefined,
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
  }, [getFinalResume, selectedTemplate, sessionId]);

  const handlePdf = useCallback(async () => {
    trackProductEvent('export_attempted', {
      format: 'pdf',
      product: 'resume_v3',
      template: selectedTemplate,
      session_id: sessionId ?? undefined,
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
  }, [getFinalResume, selectedTemplate, sessionId]);

  const handleCopy = useCallback(async () => {
    trackProductEvent('export_attempted', {
      format: 'copy',
      product: 'resume_v3',
      session_id: sessionId ?? undefined,
    });
    const text = buildPlainText(structured, written);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy to clipboard failed');
    }
  }, [structured, written, sessionId]);

  return (
    <div className="space-y-2">
      {readinessWarning && (
        <div className="flex items-start gap-2 rounded border border-[var(--badge-amber-text)]/25 bg-[var(--badge-amber-bg)]/35 px-3 py-2 text-[12px] leading-snug text-[var(--badge-amber-text)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-semibold">Review before export</div>
            <p className="mt-0.5">{readinessWarning}</p>
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

// ─── Plain-text builder ───────────────────────────────────────────────────
// Mirrors the layout of resume-v2's ExportBar.buildPlainText so TXT exports
// across v2 and v3 feel consistent (same section labels, same bullet marks).

function buildPlainText(
  structured: V3StructuredResume,
  written: V3WrittenResume,
): string {
  const lines: string[] = [];

  lines.push(structured.contact.fullName);
  const contact = [
    structured.contact.phone,
    structured.contact.email,
    structured.contact.linkedin,
    structured.contact.location,
  ]
    .filter(Boolean)
    .join(' | ');
  if (contact) lines.push(contact);

  if (written.summary) {
    lines.push('', 'EXECUTIVE SUMMARY', written.summary);
  }

  if (written.coreCompetencies.length > 0) {
    lines.push('', 'CORE COMPETENCIES', written.coreCompetencies.join(' · '));
  }

  if (written.selectedAccomplishments.length > 0) {
    lines.push('', 'SELECTED ACCOMPLISHMENTS');
    for (const a of written.selectedAccomplishments) lines.push(`• ${a}`);
  }

  if (written.positions.length > 0) {
    lines.push('', 'PROFESSIONAL EXPERIENCE');
    for (const p of written.positions) {
      lines.push('', p.company, `${p.title} | ${p.dates.raw}`);
      if (p.scope) lines.push(p.scope);
      for (const b of p.bullets) lines.push(`• ${b.text}`);
    }
  }

  if (structured.education.length > 0) {
    lines.push('', 'EDUCATION');
    for (const ed of structured.education) {
      lines.push(
        `${ed.degree} — ${ed.institution}${ed.graduationYear ? ` (${ed.graduationYear})` : ''}`,
      );
    }
  }

  if (structured.certifications.length > 0) {
    lines.push('', 'CERTIFICATIONS');
    for (const c of structured.certifications) {
      const parts = [c.name, c.issuer, c.year].filter(Boolean).join(' — ');
      lines.push(`• ${parts}`);
    }
  }

  written.customSections.forEach((cs) => {
    if (cs.entries.length === 0) return;
    lines.push('', cs.title.toUpperCase());
    for (const e of cs.entries) lines.push(`• ${e.text}`);
  });

  return lines.join('\n');
}
