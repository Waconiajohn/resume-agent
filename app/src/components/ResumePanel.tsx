import { useState } from 'react';
import { Download, FileText, FileType2, Loader2, Printer } from 'lucide-react';
import { GlassButton } from './GlassButton';
import { WYSIWYGResume } from './WYSIWYGResume';
import { resumeToText, downloadAsText } from '@/lib/export';
import { exportDocx } from '@/lib/export-docx';
import { exportPdf } from '@/lib/export-pdf';
import { buildResumeFilename } from '@/lib/export-filename';
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
          <FileText className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/60">
            Your tailored resume will appear here as we work together.
          </p>
        </div>
      </div>
    );
  }

  const handleDownloadText = () => {
    setExportError(null);
    const text = resumeToText(resume);
    const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'txt');
    downloadAsText(text, filename);
  };

  const handleDownloadDocx = async () => {
    setExportError(null);
    setExportingDocx(true);
    try {
      const result = await exportDocx(resume);
      if (!result.success) {
        setExportError(result.error ?? 'Failed to export DOCX');
      }
    } finally {
      setExportingDocx(false);
    }
  };

  const handleDownloadPdf = () => {
    setExportError(null);
    setExportingPdf(true);
    try {
      const result = exportPdf(resume);
      if (!result.success) {
        setExportError(result.error ?? 'Failed to export PDF');
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const isExporting = exportingDocx || exportingPdf;

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Resume Preview</span>
        <div className="flex items-center gap-2">
          {resume.ats_score > 0 && (
            <span className="rounded-full border border-white/[0.14] bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/78">
              ATS {resume.ats_score}%
            </span>
          )}
          <GlassButton variant="ghost" onClick={handleDownloadText} className="h-8 px-2" title="Download as text" disabled={isExporting}>
            <Download className="h-4 w-4" />
          </GlassButton>
          <GlassButton variant="ghost" onClick={handleDownloadDocx} className="h-8 px-2" title="Download as DOCX" disabled={isExporting}>
            {exportingDocx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType2 className="h-4 w-4" />}
          </GlassButton>
          <GlassButton variant="ghost" onClick={handleDownloadPdf} className="h-8 px-2" title="Print / Save as PDF" disabled={isExporting}>
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          </GlassButton>
        </div>
      </div>

      {exportError && (
        <div className="mx-4 mt-3 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-3 py-2 text-xs text-red-100/90">
          {exportError}
        </div>
      )}

      <div data-panel-scroll className="flex-1 overflow-y-auto">
        <WYSIWYGResume resume={resume} />
      </div>
    </div>
  );
}
