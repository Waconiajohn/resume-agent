import { useState } from 'react';
import { Download, FileText, CheckCircle, Loader2, FileDown } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { exportDocx } from '@/lib/export-docx';
import { resumeToText, downloadAsText } from '@/lib/export';
import { exportPdf } from '@/lib/export-pdf';
import { buildResumeFilename } from '@/lib/export-filename';
import { validateResumeForExport } from '@/lib/export-validation';
import type { FinalResume } from '@/types/resume';
import type { CompletionData } from '@/types/panels';

interface CompletionPanelProps {
  data: CompletionData;
  resume: FinalResume | null;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-3">
      <span className="text-xl font-bold text-white">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
    </div>
  );
}

export function CompletionPanel({
  data,
  resume,
  onSaveCurrentResumeAsBase,
}: CompletionPanelProps) {
  const [exportingResume, setExportingResume] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<'default' | 'alternate' | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const validationIssues = validateResumeForExport(resume);
  const blockingIssue = validationIssues.find((i) => i.severity === 'error');

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
    const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'txt');
    downloadAsText(resumeToText(resume), filename);
  };

  const handleResumePdf = () => {
    if (!resume) return;
    const result = exportPdf(resume);
    if (!result.success) {
      setExportError(result.error ?? 'Failed to generate PDF');
    }
  };

  const handleSaveBase = async (mode: 'default' | 'alternate') => {
    if (!resume || !onSaveCurrentResumeAsBase) return;
    setSavingMode(mode);
    setSaveMessage(null);
    try {
      const result = await onSaveCurrentResumeAsBase(mode);
      setSaveMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-[#a8d7b8]" />
          <span className="text-sm font-medium text-white/85">Session Complete</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Export error banner */}
        {exportError && (
          <div className="rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 py-2 text-xs text-white/74">
            {exportError}
          </div>
        )}
        {validationIssues.map((issue) => (
          <div
            key={`${issue.field}-${issue.message}`}
            className={`rounded-lg border px-3 py-2 text-xs ${
              issue.severity === 'error'
                ? 'border-white/[0.14] bg-white/[0.04] text-white/74'
                : 'border-white/[0.14] bg-white/[0.04] text-white/74'
            }`}
          >
            {issue.message}
          </div>
        ))}
        {data.export_validation && !data.export_validation.passed && (
          <div className="rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 py-2 text-xs text-white/74">
            ATS validation flagged {data.export_validation.findings.length} item(s). Review before sharing.
          </div>
        )}
        {saveMessage && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              saveMessage.type === 'success'
                ? 'border-white/[0.14] bg-white/[0.04] text-white/74'
                : 'border-white/[0.14] bg-white/[0.04] text-white/74'
            }`}
          >
            {saveMessage.text}
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
          <div className="rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 py-2 text-xs text-white/74">
            Contact name is missing. Your exports will not include a name header.
          </div>
        )}

        {/* Resume Export */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-[#afc4ff]" />
            <h3 className="text-sm font-medium text-white/85">Tailored Resume</h3>
          </div>
          {resume ? (
            <div className="space-y-2">
              <GlassButton variant="primary" className="w-full" onClick={handleResumeDocx} disabled={exportingResume || !!blockingIssue}>
                {exportingResume ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download Word (.docx)
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={handleResumePdf} disabled={!!blockingIssue}>
                <FileDown className="mr-2 h-4 w-4" />
                Download PDF (.pdf)
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={handleResumeTxt} disabled={!!blockingIssue}>
                <Download className="mr-2 h-4 w-4" />
                Download Text (.txt)
              </GlassButton>
            </div>
          ) : (
            <p className="text-xs text-white/50">Resume data not available for export.</p>
          )}
        </GlassCard>

        {resume && onSaveCurrentResumeAsBase && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-4 w-4 text-[#a8d7b8]" />
              <h3 className="text-sm font-medium text-white/85">Save As Base Resume</h3>
            </div>
            <div className="space-y-2">
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={() => void handleSaveBase('default')}
                disabled={savingMode !== null}
              >
                {savingMode === 'default' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Save As New Default Base
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="w-full"
                onClick={() => void handleSaveBase('alternate')}
                disabled={savingMode !== null}
              >
                {savingMode === 'alternate' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Save As Alternate
              </GlassButton>
            </div>
          </GlassCard>
        )}

      </div>
    </div>
  );
}
