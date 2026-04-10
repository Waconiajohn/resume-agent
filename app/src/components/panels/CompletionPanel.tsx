import { useState } from 'react';
import { Download, FileText, CheckCircle, Loader2, FileDown, Save, Lock } from 'lucide-react';
import { buildPositioningSummaryText } from '@/lib/export-positioning-summary';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { TemplateSelector } from '../TemplateSelector';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { resumeToText, downloadAsText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';
import { validateResumeForExport } from '@/lib/export-validation';
import { recordExportDiagnostic } from '@/lib/export-diagnostics';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import type { FinalResume } from '@/types/resume';
import type { CompletionData } from '@/types/panels';
import { DEFAULT_TEMPLATE_ID } from '@/lib/export-templates';
import type { TemplateId } from '@/lib/export-templates';

interface CompletionPanelProps {
  data: CompletionData;
  resume: FinalResume | null;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
      <span className="text-xl font-bold text-[var(--text-strong)]">{value}</span>
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">{label}</span>
    </div>
  );
}

function toneClass(tone: 'error' | 'warning' | 'success' | 'info'): string {
  switch (tone) {
    case 'error':
      return 'border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]/90';
    case 'warning':
      return 'border-[var(--badge-amber-text)]/28 bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]/90';
    case 'success':
      return 'border-[var(--badge-green-text)]/28 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]/90';
    case 'info':
    default:
      return 'border-[var(--line-strong)] bg-[var(--accent-muted)] text-[var(--text-muted)]';
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
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const validationIssues = validateResumeForExport(resume);
  const blockingIssue = validationIssues.find((i) => i.severity === 'error');
  const _hasWarnings = validationIssues.some((i) => i.severity === 'warning') || Boolean(data.export_validation && !data.export_validation.passed);

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
        const message = 'Word (.docx) export is available on paid plans. Upgrade to download this version in Word format.';
        recordExportDiagnostic(resume, 'docx', 'failure', message);
        setExportError(message);
        setDocxBlocked(true);
        return;
      }
      if (!checkRes.ok) {
        // Non-402 errors: log and proceed (fail open so auth issues don't block export)
        const message = 'We could not confirm Word export access, so we tried the export anyway.';
        setExportInfo(message);
      }

      const { exportDocx } = await import('@/lib/export-docx');
      const result = await exportDocx(resume, selectedTemplate);
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
      const result = exportPdf(resume, selectedTemplate);
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
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="motion-safe:animate-celebration-check rounded-full motion-safe:animate-celebration-glow">
            <CheckCircle className="h-8 w-8 text-[var(--badge-green-text)]" />
          </div>
          <span className="text-lg font-semibold text-[var(--text-strong)]" aria-live="assertive" role="status">
            Your Resume Is Ready!
          </span>
        </div>
        {data.ats_score != null && (
          <p className="text-sm text-[var(--badge-green-text)]/80 mt-1">{data.ats_score}% match for this role</p>
        )}
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="quality_review"
          tone="export"
          userDoesOverride="Download your finished resume, then optionally save it as your starting point for future applications."
          nextOverride="Use this version for this job, or save it as your go-to resume for future applications."
        />

        <p className="text-sm text-[var(--text-soft)]">Download your resume below, or save it for future applications.</p>

        {/* Export error banner */}
        {exportError && (
          <div className={`support-callout px-3 py-2 text-xs ${toneClass('error')}`}>
            {exportError}
          </div>
        )}
        {exportInfo && (
          <div className={`support-callout px-3 py-2 text-xs ${toneClass('info')}`}>
            {exportInfo}
          </div>
        )}
        {validationIssues.map((issue) => (
          <div
            key={`${issue.field}-${issue.message}`}
            className={`support-callout px-3 py-2 text-xs ${toneClass(issue.severity === 'error' ? 'error' : 'warning')}`}
          >
            {issue.message}
          </div>
        ))}
        {data.export_validation && !data.export_validation.passed && (
          <div className={`support-callout px-3 py-2 text-xs ${toneClass('warning')}`}>
            We found {data.export_validation.findings.length} formatting item(s) worth checking before you submit.
          </div>
        )}
        {saveMessage && (
          <div
            className={`support-callout px-3 py-2 text-xs ${toneClass(saveMessage.type === 'success' ? 'success' : 'error')}`}
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
          <div className={`support-callout px-3 py-2 text-xs ${toneClass('warning')}`}>
            Your name is missing, so exported versions will not include a name header.
          </div>
        )}

        {/* Resume Export */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-md border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-2.5 py-1 text-[12px] uppercase tracking-[0.12em] text-[var(--link)]/85">
              Action
            </span>
            <FileText className="h-4 w-4 text-[var(--link)]" />
            <h3 className="text-sm font-medium text-[var(--text-strong)]">Download Your Resume</h3>
          </div>
          {resume ? (
            <div className="space-y-2">
              <TemplateSelector
                selected={selectedTemplate}
                onChange={setSelectedTemplate}
                className="pb-1"
              />
              <GlassButton variant="primary" className="w-full" onClick={() => void handleResumeDocx()} disabled={exportingResume || !!blockingIssue} aria-label="Download resume as Word document">
                {exportingResume ? (
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                ) : docxBlocked ? (
                  <Lock className="mr-2 h-4 w-4" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download Word (.docx)
                {docxBlocked && (
                  <span className="ml-2 rounded-md border border-[var(--badge-amber-text)]/30 bg-[var(--badge-amber-bg)] px-2 py-1 text-[12px] uppercase tracking-wider text-[var(--badge-amber-text)]/80">
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
            <p className="text-xs text-[var(--text-soft)]">This resume is not ready to download yet.</p>
          )}
        </GlassCard>

        {resume && onSaveCurrentResumeAsBase && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] uppercase tracking-[0.12em] text-[var(--text-soft)]">
                Optional
              </span>
              <Save className="h-4 w-4 text-[var(--badge-green-text)]" />
              <h3 className="text-sm font-medium text-[var(--text-strong)]">Save for Future Applications</h3>
            </div>
            <p className="mb-3 text-xs text-[var(--text-soft)]">
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
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
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
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
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
            <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] uppercase tracking-[0.12em] text-[var(--text-soft)]">
              Optional
            </span>
            <FileText className="h-4 w-4 text-[var(--link)]" />
            <h3 className="text-sm font-medium text-[var(--text-strong)]">Positioning Summary</h3>
          </div>
          <p className="mb-3 text-xs text-[var(--text-soft)]">
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
          <h3 className="text-sm font-medium text-[var(--text-strong)] mb-3">What To Do Next</h3>
          <ul className="space-y-2 text-xs text-[var(--text-soft)]">
            <li>1. Download your resume in the format you prefer</li>
            <li>2. Review it one final time before submitting</li>
            <li>3. Optionally save this version as your starting point for future applications</li>
          </ul>
        </GlassCard>

      </div>
    </div>
  );
}
