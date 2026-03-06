import { useState } from 'react';
import { Download, FileText, CheckCircle, Loader2, FileDown, Save, Lock } from 'lucide-react';
import { buildPositioningSummaryText } from '@/lib/export-positioning-summary';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { resumeToText, downloadAsText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';
import { validateResumeForExport } from '@/lib/export-validation';
import { buildExportDiagnosticsReport, recordExportDiagnostic } from '@/lib/export-diagnostics';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
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
      return 'border-[#e0abab]/28 bg-[#e0abab]/[0.08] text-[#e0abab]/90';
    case 'warning':
      return 'border-[#dfc797]/28 bg-[#dfc797]/[0.08] text-[#dfc797]/90';
    case 'success':
      return 'border-[#b5dec2]/28 bg-[#b5dec2]/[0.08] text-[#b5dec2]/90';
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
  // Set to true when server returns 402 for DOCX export (plan does not include it)
  const [docxBlocked, setDocxBlocked] = useState(false);
  const validationIssues = validateResumeForExport(resume);
  const blockingIssue = validationIssues.find((i) => i.severity === 'error');
  const hasWarnings = validationIssues.some((i) => i.severity === 'warning') || Boolean(data.export_validation && !data.export_validation.passed);

  const handleResumeDocx = async () => {
    if (!resume) return;
    setExportingResume(true);
    setExportError(null);
    setExportInfo(null);
    recordExportDiagnostic(resume, 'docx', 'attempt');
    try {
      // Verify DOCX export is allowed on the user's plan before generating client-side
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const checkRes = await fetch(`${API_BASE}/resumes/export-docx`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (checkRes.status === 402) {
        const message = 'Word (.docx) export requires a paid plan. Please upgrade to download in Word format.';
        recordExportDiagnostic(resume, 'docx', 'failure', message);
        setExportError(message);
        setDocxBlocked(true);
        return;
      }
      if (!checkRes.ok) {
        // Non-402 errors: log and proceed (fail open so auth issues don't block export)
        const message = 'Could not verify export permissions. Proceeding with export.';
        setExportInfo(message);
      }

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
            <CheckCircle className="h-8 w-8 text-[#a8d7b8]" />
          </div>
          <span className="text-lg font-semibold text-white/85">Your Resume Is Ready!</span>
        </div>
        {data.ats_score != null && (
          <p className="text-sm text-[#b5dec2]/80 mt-1">{data.ats_score}% match for this role</p>
        )}
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="quality_review"
          tone="export"
          userDoesOverride="Download your finished resume, then optionally save it as your starting point for future applications."
          nextOverride="Use this version for this job, or save it as your go-to resume for future applications."
        />

        <p className="text-sm text-white/60">Download your resume below, or save it for future applications.</p>

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
            We found {data.export_validation.findings.length} formatting item(s) that some hiring systems might flag. Please review before submitting.
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
              <div className="motion-safe:opacity-0 motion-safe:animate-card-stagger" style={{ animationDelay: '0ms' }}>
                <StatBadge label="ATS Score" value={`${data.ats_score}%`} />
              </div>
            )}
            {data.requirements_addressed != null && (
              <div className="motion-safe:opacity-0 motion-safe:animate-card-stagger" style={{ animationDelay: '75ms' }}>
                <StatBadge label="Requirements Met" value={data.requirements_addressed} />
              </div>
            )}
            {data.sections_rewritten != null && (
              <div className="motion-safe:opacity-0 motion-safe:animate-card-stagger" style={{ animationDelay: '150ms' }}>
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
            <span className="rounded-full border border-[#afc4ff]/20 bg-[#afc4ff]/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#afc4ff]/85">
              Action
            </span>
            <FileText className="h-4 w-4 text-[#afc4ff]" />
            <h3 className="text-sm font-medium text-white/85">Download Your Resume</h3>
          </div>
          {resume ? (
            <div className="space-y-2">
              <GlassButton variant="primary" className="w-full" onClick={() => void handleResumeDocx()} disabled={exportingResume || !!blockingIssue} aria-label="Download resume as Word document">
                {exportingResume ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : docxBlocked ? (
                  <Lock className="mr-2 h-4 w-4" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download Word (.docx)
                {docxBlocked && (
                  <span className="ml-2 rounded-full border border-[#dfc797]/30 bg-[#dfc797]/[0.08] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#dfc797]/80">
                    Upgrade
                  </span>
                )}
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={() => void handleResumePdf()} disabled={exportingResume || !!blockingIssue} aria-label="Download resume as PDF">
                <FileDown className="mr-2 h-4 w-4" />
                Download PDF (.pdf)
              </GlassButton>
              <GlassButton variant="ghost" className="w-full" onClick={handleResumeTxt} disabled={exportingResume || !!blockingIssue} aria-label="Download resume as plain text">
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
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/48">
                Optional
              </span>
              <Save className="h-4 w-4 text-[#a8d7b8]" />
              <h3 className="text-sm font-medium text-white/85">Save for Future Applications</h3>
            </div>
            <p className="mb-3 text-xs text-white/55">
              Want to use this improved version as your starting point for future job applications?
            </p>
            <div className="space-y-2">
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={() => void handleSaveBase('default')}
                disabled={savingMode !== null}
                aria-label="Save as your main resume for future applications"
              >
                {savingMode === 'default' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save as My Main Resume
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="w-full"
                onClick={() => void handleSaveBase('alternate')}
                disabled={savingMode !== null}
                aria-label="Save as a backup version"
              >
                {savingMode === 'alternate' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save a Backup Version
              </GlassButton>
            </div>
          </GlassCard>
        )}

        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/48">
              Optional
            </span>
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

        <GlassCard className="p-4">
          <h3 className="text-sm font-medium text-white/85 mb-3">What To Do Next</h3>
          <ul className="space-y-2 text-xs text-white/60">
            <li>1. Download your resume in the format you prefer</li>
            <li>2. Review it one final time before submitting</li>
            <li>3. Optionally save this version as your starting point for future applications</li>
          </ul>
        </GlassCard>

      </div>
    </div>
  );
}
