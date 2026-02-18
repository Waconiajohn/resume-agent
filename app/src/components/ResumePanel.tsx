import { Download, FileText, FileType2, Printer } from 'lucide-react';
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
    const text = resumeToText(resume);
    const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'txt');
    downloadAsText(text, filename);
  };

  const handleDownloadDocx = () => {
    exportDocx(resume);
  };

  const handleDownloadPdf = () => {
    exportPdf(resume);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Resume Preview</span>
        <div className="flex items-center gap-2">
          {resume.ats_score > 0 && (
            <span className="rounded-full border border-white/[0.14] bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/78">
              ATS {resume.ats_score}%
            </span>
          )}
          <GlassButton variant="ghost" onClick={handleDownloadText} className="h-8 px-2" title="Download as text">
            <Download className="h-4 w-4" />
          </GlassButton>
          <GlassButton variant="ghost" onClick={handleDownloadDocx} className="h-8 px-2" title="Download as DOCX">
            <FileType2 className="h-4 w-4" />
          </GlassButton>
          <GlassButton variant="ghost" onClick={handleDownloadPdf} className="h-8 px-2" title="Print / Save as PDF">
            <Printer className="h-4 w-4" />
          </GlassButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <WYSIWYGResume resume={resume} />
      </div>
    </div>
  );
}
