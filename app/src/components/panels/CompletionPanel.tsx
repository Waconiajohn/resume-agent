import { useState } from 'react';
import { Download, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { exportDocx } from '@/lib/export-docx';
import { resumeToText, downloadAsText } from '@/lib/export';
import type { FinalResume } from '@/types/resume';
import type { CompletionData } from '@/types/panels';

interface CompletionPanelProps {
  data: CompletionData;
  resume: FinalResume | null;
}

function sanitizeFilenameSegment(s: string): string {
  // Preserve Unicode letters/numbers (accented chars like é, ñ, ü)
  return s.replace(/[^\p{L}\p{N}]/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function buildFilename(contactInfo?: FinalResume['contact_info'], companyName?: string, suffix?: string, ext = 'txt'): string {
  const parts: string[] = [];
  if (contactInfo?.name) {
    const names = contactInfo.name.trim().split(/\s+/);
    parts.push(names.map(n => sanitizeFilenameSegment(n)).filter(Boolean).join('_'));
  }
  if (companyName) {
    parts.push(sanitizeFilenameSegment(companyName));
  }
  parts.push(suffix ?? 'Resume');
  return `${parts.join('_')}.${ext}`;
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.04] px-4 py-3">
      <span className="text-xl font-bold text-white">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
    </div>
  );
}

export function CompletionPanel({
  data,
  resume,
}: CompletionPanelProps) {
  const [exportingResume, setExportingResume] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleResumeDocx = async () => {
    if (!resume) return;
    setExportingResume(true);
    setExportError(null);
    try {
      const result = await exportDocx(resume);
      if (!result.success) {
        setExportError(result.error ?? 'Failed to generate resume DOCX');
      }
    } finally {
      setExportingResume(false);
    }
  };

  const handleResumeTxt = () => {
    if (!resume) return;
    const filename = buildFilename(resume.contact_info, resume.company_name, 'Resume');
    downloadAsText(resumeToText(resume), filename);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-white/85">Session Complete</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Export error banner */}
        {exportError && (
          <div className="rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-2 text-xs text-red-300">
            {exportError}
          </div>
        )}

        {/* Stats */}
        {(data.ats_score != null || data.requirements_addressed != null) && (
          <div className="grid grid-cols-3 gap-2">
            {data.ats_score != null && (
              <StatBadge label="ATS Score" value={`${data.ats_score}%`} />
            )}
            {data.requirements_addressed != null && (
              <StatBadge label="Reqs Met" value={data.requirements_addressed} />
            )}
            {data.sections_rewritten != null && (
              <StatBadge label="Sections" value={data.sections_rewritten} />
            )}
          </div>
        )}

        {/* Missing contact info warning */}
        {resume && !resume.contact_info?.name && (
          <div className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-xs text-amber-300">
            Contact name is missing. Your exports will not include a name header.
          </div>
        )}

        {/* Resume Export */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium text-white/85">Tailored Resume</h3>
          </div>
          {resume ? (
            <div className="space-y-2">
              <GlassButton variant="primary" className="w-full" onClick={handleResumeDocx} disabled={exportingResume}>
                {exportingResume ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download Word (.docx)
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={handleResumeTxt}>
                <Download className="mr-2 h-4 w-4" />
                Download Text (.txt)
              </GlassButton>
            </div>
          ) : (
            <p className="text-xs text-white/50">Resume data not available for export.</p>
          )}
        </GlassCard>

      </div>
    </div>
  );
}
