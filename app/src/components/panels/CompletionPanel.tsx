import { useState } from 'react';
import { Download, FileText, CheckCircle, Loader2, FileDown, Save } from 'lucide-react';
import { buildPositioningSummaryText } from '@/lib/export-positioning-summary';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { resumeToText, downloadAsText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';
import { validateResumeForExport } from '@/lib/export-validation';
import { buildExportDiagnosticsReport, recordExportDiagnostic } from '@/lib/export-diagnostics';
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

function toneClass(tone: 'error' | 'warning' | 'success' | 'info'): string {
  switch (tone) {
    case 'error':
      return 'border-red-300/28 bg-red-500/[0.08] text-red-100/90';
    case 'warning':
      return 'border-amber-300/28 bg-amber-500/[0.08] text-amber-100/90';
    case 'success':
      return 'border-emerald-300/28 bg-emerald-500/[0.08] text-emerald-100/90';
    case 'info':
    default:
      return 'border-white/[0.14] bg-white/[0.04] text-white/74';
  }
}

export function CompletionPanel({
  data,
  resume,
  onSaveCurrentResumeAsBase,
}: CompletionPanelProps) {
  const [exportingResume, setExportingResume] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<'default' | 'alternate' | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const validationIssues = validateResumeForExport(resume);
  const blockingIssue = validationIssues.find((i) => i.severity === 'error');

  const handleResumeDocx = async () => {
    if (!resume) return;
    setExportingResume(true);
    setExportError(null);
    setExportInfo(null);
    recordExportDiagnostic(resume, 'docx', 'attempt');
    try {
      const { exportDocx } = await import('@/lib/export-docx');
      const result = await exportDocx(resume);
      if (!result.success) {
        const message = result.error ?? 'Failed to generate resume DOCX';
        recordExportDiagnostic(resume, 'docx', 'failure', message);
        setExportError(message);
      } else {
        recordExportDiagnostic(resume, 'docx', 'success');
      }
    } finally {
      setExportingResume(false);
    }
  };

  const handleResumeTxt = () => {
    if (!resume) return;
    setExportError(null);
    setExportInfo(null);
    recordExportDiagnostic(resume, 'txt', 'attempt');
    try {
      const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'txt');
      downloadAsText(resumeToText(resume), filename);
      recordExportDiagnostic(resume, 'txt', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate text export';
      recordExportDiagnostic(resume, 'txt', 'failure', message);
      setExportError(message);
    }
  };

  const handleResumePdf = async () => {
    if (!resume) return;
    setExportingResume(true);
    setExportError(null);
    setExportInfo(null);
    recordExportDiagnostic(resume, 'pdf', 'attempt');
    try {
      const { exportPdf } = await import('@/lib/export-pdf');
      const result = exportPdf(resume);
      if (!result.success) {
        const message = result.error ?? 'Failed to generate PDF';
        recordExportDiagnostic(resume, 'pdf', 'failure', message);
        setExportError(message);
      } else {
        recordExportDiagnostic(resume, 'pdf', 'success');
      }
    } finally {
      setExportingResume(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    setExportError(null);
    setExportInfo(null);
    try {
      const report = buildExportDiagnosticsReport();
      await navigator.clipboard.writeText(report);
      setExportInfo('Export diagnostics copied to clipboard.');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to copy diagnostics');
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
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="animate-celebration-check rounded-full animate-celebration-glow">
            <CheckCircle className="h-5 w-5 text-[#a8d7b8]" />
          </div>
          <span className="text-sm font-medium text-white/85">Session Complete</span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="quality_review"
          tone="export"
          userDoesOverride="Download the tailored resume, then optionally save it as your default or alternate base resume for future sessions."
          nextOverride="Use this version for this job, or save it as a stronger reusable starting point."
        />

        {/* Export error banner */}
        {exportError && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass('error')}`}>
            {exportError}
          </div>
        )}
        {exportInfo && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass('info')}`}>
            {exportInfo}
          </div>
        )}
        {validationIssues.map((issue) => (
          <div
            key={`${issue.field}-${issue.message}`}
            className={`rounded-lg border px-3 py-2 text-xs ${toneClass(issue.severity === 'error' ? 'error' : 'warning')}`}
          >
            {issue.message}
          </div>
        ))}
        {data.export_validation && !data.export_validation.passed && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass('warning')}`}>
            ATS validation flagged {data.export_validation.findings.length} item(s). Review before sharing.
          </div>
        )}
        {saveMessage && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${toneClass(saveMessage.type === 'success' ? 'success' : 'error')}`}
          >
            {saveMessage.text}
          </div>
        )}

        {/* Stats */}
        {(data.ats_score != null || data.requirements_addressed != null) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {data.ats_score != null && (
              <div className="opacity-0 animate-card-stagger" style={{ animationDelay: '0ms' }}>
                <StatBadge label="ATS Score" value={`${data.ats_score}%`} />
              </div>
            )}
            {data.requirements_addressed != null && (
              <div className="opacity-0 animate-card-stagger" style={{ animationDelay: '75ms' }}>
                <StatBadge label="Reqs Met" value={data.requirements_addressed} />
              </div>
            )}
            {data.sections_rewritten != null && (
              <div className="opacity-0 animate-card-stagger" style={{ animationDelay: '150ms' }}>
                <StatBadge label="Sections" value={data.sections_rewritten} />
              </div>
            )}
          </div>
        )}

        {/* Missing contact info warning */}
        {resume && !resume.contact_info?.name && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass('warning')}`}>
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
              <GlassButton variant="ghost" className="w-full" onClick={() => void handleResumePdf()} disabled={exportingResume || !!blockingIssue}>
                <FileDown className="mr-2 h-4 w-4" />
                Download PDF (.pdf)
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={handleResumeTxt} disabled={exportingResume || !!blockingIssue}>
                <Download className="mr-2 h-4 w-4" />
                Download Text (.txt)
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={() => void handleCopyDiagnostics()}>
                <FileText className="mr-2 h-4 w-4" />
                Copy Export Diagnostics
              </GlassButton>
            </div>
          ) : (
            <p className="text-xs text-white/50">Resume data not available for export.</p>
          )}
        </GlassCard>

        {resume && onSaveCurrentResumeAsBase && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Save className="h-4 w-4 text-[#a8d7b8]" />
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
                  <Save className="mr-2 h-4 w-4" />
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
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save As Alternate
              </GlassButton>
            </div>
          </GlassCard>
        )}

        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-[#afc4ff]" />
            <h3 className="text-sm font-medium text-white/85">Positioning Summary</h3>
          </div>
          <p className="mb-3 text-xs text-white/50">
            Download a text summary of your positioning results for this session.
          </p>
          <GlassButton
            variant="ghost"
            className="w-full"
            onClick={() => {
              const summaryText = buildPositioningSummaryText(resume ?? null, data);
              const filename = buildResumeFilename(
                resume?.contact_info,
                resume?.company_name,
                'Positioning-Summary',
                'txt',
              );
              downloadAsText(summaryText, filename);
            }}
          >
            <FileText className="mr-2 h-4 w-4" />
            Download Positioning Summary
          </GlassButton>
        </GlassCard>

      </div>
    </div>
  );
}
