import { useState } from 'react';
import { Download, FileText, FileType2, Loader2, Printer } from 'lucide-react';
import { GlassButton } from './GlassButton';
import { WYSIWYGResume } from './WYSIWYGResume';
import { resumeToText, downloadAsText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';
import { recordExportDiagnostic } from '@/lib/export-diagnostics';
import type { FinalResume } from '@/types/resume';

interface ResumePanelProps {
  resume: FinalResume | null;
}

export function ResumePanel({ resume }: ResumePanelProps) {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!resume) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileText className="h-10 w-10 text-[var(--text-soft)]" />
          <p className="text-sm text-[var(--text-soft)]">
            Your tailored resume will appear here as we work together.
          </p>
        </div>
      </div>
    );
  }

  const handleDownloadText = () => {
    setExportError(null);
    recordExportDiagnostic(resume, 'txt', 'attempt');
    try {
      const text = resumeToText(resume);
      const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'txt');
      downloadAsText(text, filename);
      recordExportDiagnostic(resume, 'txt', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export text';
      recordExportDiagnostic(resume, 'txt', 'failure', message);
      setExportError(message);
    }
  };

  const handleDownloadDocx = async () => {
    setExportError(null);
    setExportingDocx(true);
    recordExportDiagnostic(resume, 'docx', 'attempt');
    try {
      const { exportDocx } = await import('@/lib/export-docx');
      const result = await exportDocx(resume);
      if (!result.success) {
        const message = result.error ?? 'Failed to export DOCX';
        recordExportDiagnostic(resume, 'docx', 'failure', message);
        setExportError(message);
      } else {
        recordExportDiagnostic(resume, 'docx', 'success');
      }
    } finally {
      setExportingDocx(false);
    }
  };

  const handleDownloadPdf = () => {
    setExportError(null);
    setExportingPdf(true);
    recordExportDiagnostic(resume, 'pdf', 'attempt');
    // exportPdf is synchronous — wrap in rAF so React can paint the loading state first
    requestAnimationFrame(() => {
      void import('@/lib/export-pdf')
        .then(({ exportPdf }) => {
          const result = exportPdf(resume);
          if (!result.success) {
            const message = result.error ?? 'Failed to export PDF';
            recordExportDiagnostic(resume, 'pdf', 'failure', message);
            setExportError(message);
          } else {
            recordExportDiagnostic(resume, 'pdf', 'success');
          }
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Failed to export PDF';
          recordExportDiagnostic(resume, 'pdf', 'failure', message);
          setExportError(message);
        })
        .finally(() => {
          setExportingPdf(false);
        });
    });
  };

  const isExporting = exportingDocx || exportingPdf;

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <span className="text-sm font-medium text-[var(--text-strong)]">Resume Preview</span>
        <div className="flex items-center gap-2">
          {resume.ats_score > 0 && (
            <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              ATS {resume.ats_score}%
            </span>
          )}
          <GlassButton variant="ghost" size="sm" onClick={handleDownloadText} className="h-8 px-2" aria-label="Download as text" disabled={isExporting}>
            <Download className="h-4 w-4" />
          </GlassButton>
          <GlassButton variant="ghost" size="sm" onClick={handleDownloadDocx} className="h-8 px-2" aria-label="Download as DOCX" disabled={isExporting}>
            {exportingDocx ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <FileType2 className="h-4 w-4" />}
          </GlassButton>
          <GlassButton variant="ghost" size="sm" onClick={handleDownloadPdf} className="h-8 px-2" aria-label="Print or save as PDF" disabled={isExporting}>
            {exportingPdf ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Printer className="h-4 w-4" />}
          </GlassButton>
        </div>
      </div>

      {exportError && (
        <div className="mx-4 mt-3 rounded-lg border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-3 py-2 text-xs text-[var(--badge-red-text)]/90">
          {exportError}
        </div>
      )}

      <div data-panel-scroll className="flex-1 overflow-y-auto">
        <WYSIWYGResume resume={resume} />
      </div>
    </div>
  );
}
