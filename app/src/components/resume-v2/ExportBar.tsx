/**
 * ExportBar — DOCX + PDF download buttons for completed v2 resume
 */

import { useState, useCallback } from 'react';
import { Download, FileType2, Loader2, AlertCircle } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import type { ResumeDraft } from '@/types/resume-v2';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';

interface ExportBarProps {
  resume: ResumeDraft;
  companyName?: string;
  jobTitle?: string;
  atsScore?: number;
}

export function ExportBar({ resume, companyName, jobTitle, atsScore }: ExportBarProps) {
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GlassButton onClick={handleDocx} disabled={exporting !== null} size="sm" className="gap-1.5">
          {exporting === 'docx' ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : (
            <FileType2 className="h-3.5 w-3.5" />
          )}
          Download DOCX
        </GlassButton>
        <GlassButton onClick={handlePdf} disabled={exporting !== null} variant="ghost" size="sm" className="gap-1.5">
          {exporting === 'pdf' ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download PDF
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
