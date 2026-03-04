import { useState, useEffect, useRef, useMemo } from 'react';
import { Download, FileType2, Printer, Loader2 } from 'lucide-react';
import { DEFAULT_SECTION_ORDER } from '@/lib/constants';
import { resumeToText, downloadAsText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';
import { useTypingAnimation } from '@/hooks/useTypingAnimation';
import type { FinalResume } from '@/types/resume';
import type { QualityDashboardData } from '@/types/panels';

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  summary: 'Professional Summary',
  selected_accomplishments: 'Selected Accomplishments',
  skills: 'Core Competencies',
  experience: 'Professional Experience',
  education: 'Education',
  certifications: 'Certifications',
};

interface LiveResumeDocumentProps {
  sectionOrder: string[];
  sectionContent: Record<string, string>;
  sectionDraftsVersion: number;
  approvedSections: Record<string, string>;
  activeSectionKey: string | null;
  onEditSection?: (key: string, content: string) => void;
  resume: FinalResume | null;
  isProcessing: boolean;
  sessionComplete?: boolean;
  qualityData?: QualityDashboardData | null;
}

/**
 * Resolve the best content for a given section key.
 * Priority: FinalResume > approved > draft > null (placeholder)
 */
function resolveSectionContent(
  key: string,
  resume: FinalResume | null,
  approvedSections: Record<string, string>,
  sectionContent: Record<string, string>,
): { content: string | null; source: 'resume' | 'approved' | 'draft' | 'placeholder' } {
  // 1. FinalResume sections
  if (resume) {
    const resumeVal = getResumeSection(resume, key);
    if (resumeVal) return { content: resumeVal, source: 'resume' };
  }
  // 2. Approved
  if (approvedSections[key]) return { content: approvedSections[key], source: 'approved' };
  // 3. Draft
  if (sectionContent[key]) return { content: sectionContent[key], source: 'draft' };
  // 4. Placeholder
  return { content: null, source: 'placeholder' };
}

function getResumeSection(resume: FinalResume, key: string): string | null {
  switch (key) {
    case 'summary':
      return resume.summary || null;
    case 'selected_accomplishments':
      return resume.selected_accomplishments || null;
    case 'skills': {
      if (!resume.skills) return null;
      if (typeof resume.skills === 'object' && !Array.isArray(resume.skills)) {
        return Object.entries(resume.skills)
          .map(([cat, items]) => `${cat}: ${Array.isArray(items) ? items.join(', ') : String(items)}`)
          .join('\n');
      }
      return String(resume.skills);
    }
    case 'experience': {
      if (!Array.isArray(resume.experience) || resume.experience.length === 0) return null;
      return resume.experience
        .map((exp) => {
          const header = `${exp.title} — ${exp.company} (${exp.start_date} – ${exp.end_date})`;
          const bullets = exp.bullets?.map((b) => `  • ${b.text}`).join('\n') ?? '';
          return `${header}\n${bullets}`;
        })
        .join('\n\n');
    }
    case 'education': {
      if (!Array.isArray(resume.education) || resume.education.length === 0) return null;
      return resume.education
        .map((edu) => `${edu.degree}${edu.field ? ` in ${edu.field}` : ''}, ${edu.institution}${edu.year ? ` (${edu.year})` : ''}`)
        .join('\n');
    }
    case 'certifications': {
      if (!Array.isArray(resume.certifications) || resume.certifications.length === 0) return null;
      return resume.certifications
        .map((cert) => `${cert.name}${cert.issuer ? ` — ${cert.issuer}` : ''}${cert.year ? ` (${cert.year})` : ''}`)
        .join('\n');
    }
    default:
      return resume._raw_sections?.[key] ?? null;
  }
}

function ContactHeaderPlaceholder() {
  return (
    <div className="mb-4 text-center">
      <div className="mx-auto h-6 w-48 animate-pulse rounded bg-gray-200" />
      <div className="mx-auto mt-2 h-3 w-64 animate-pulse rounded bg-gray-100" />
      <hr className="mt-2 border-gray-300" />
    </div>
  );
}

function ContactHeader({ resume }: { resume: FinalResume }) {
  const ci = resume.contact_info;
  if (!ci?.name) return <ContactHeaderPlaceholder />;

  const contactParts: string[] = [];
  if (ci.email) contactParts.push(ci.email);
  if (ci.phone) contactParts.push(ci.phone);
  if (ci.linkedin) contactParts.push(ci.linkedin);
  if (ci.location) contactParts.push(ci.location);

  return (
    <div className="mb-4 text-center">
      <h1 className="text-xl font-bold text-gray-900">{ci.name}</h1>
      {contactParts.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">{contactParts.join(' • ')}</p>
      )}
      <hr className="mt-2 border-gray-400" />
    </div>
  );
}

function PlaceholderSection({ name }: { name: string }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 border-b border-dashed border-gray-200 pb-1 text-sm font-bold uppercase tracking-wider text-gray-300">
        {SECTION_DISPLAY_NAMES[name] ?? toTitleCase(name)}
      </h2>
      <div className="space-y-2 py-1">
        <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-4/6 animate-pulse rounded bg-gray-50" />
      </div>
    </section>
  );
}

function SectionStatusBadge({ source, isActive }: { source: string; isActive: boolean }) {
  if (isActive) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-blue-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
        Writing...
      </span>
    );
  }
  if (source === 'draft') {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Draft
      </span>
    );
  }
  if (source === 'approved' || source === 'resume') {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Complete
      </span>
    );
  }
  return null;
}

function AnimatedContentSection({
  name,
  content,
  source,
  isActive,
  onEdit,
}: {
  name: string;
  content: string;
  source: string;
  isActive: boolean;
  onEdit?: (key: string, content: string) => void;
}) {
  const { displayText, isAnimating, skipToEnd } = useTypingAnimation({
    targetText: content,
    isActive,
  });

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync edit value when content changes externally
  useEffect(() => {
    if (!editing) setEditValue(content);
  }, [content, editing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [editing]);

  const canEdit = !isActive && !isAnimating && onEdit && (source === 'approved' || source === 'resume' || source === 'draft');

  const handleSave = () => {
    onEdit?.(name, editValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(content);
    setEditing(false);
  };

  return (
    <section
      className={`group mb-5 rounded transition-all duration-300 ${
        isActive ? 'border-l-2 border-blue-400 pl-3' : ''
      } ${canEdit && !editing ? 'cursor-pointer hover:ring-2 hover:ring-blue-300/30' : ''}`}
      onClick={canEdit && !editing ? () => setEditing(true) : undefined}
      role={canEdit && !editing ? 'button' : undefined}
      tabIndex={canEdit && !editing ? 0 : undefined}
      onKeyDown={canEdit && !editing ? (e) => { if (e.key === 'Enter') setEditing(true); } : undefined}
    >
      <h2 className="mb-2 flex items-center border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
        {SECTION_DISPLAY_NAMES[name] ?? toTitleCase(name)}
        <SectionStatusBadge source={source} isActive={isActive} />
        {canEdit && !editing && (
          <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
            Click to edit
          </span>
        )}
      </h2>

      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full resize-y rounded border border-blue-300 bg-blue-50/50 p-2 text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={Math.max(4, editValue.split('\n').length + 1)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleCancel();
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800"
          onClick={isAnimating ? skipToEnd : undefined}
          role={isAnimating ? 'button' : undefined}
          tabIndex={isAnimating ? 0 : undefined}
          onKeyDown={isAnimating ? (e) => { if (e.key === 'Enter' || e.key === ' ') skipToEnd(); } : undefined}
          title={isAnimating ? 'Click to skip animation' : undefined}
        >
          {isActive ? displayText : content}
          {isAnimating && <span className="inline-block h-4 w-0.5 animate-pulse bg-gray-400 align-text-bottom" />}
        </div>
      )}
    </section>
  );
}

function qualityScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
  if (score >= 60) return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
  return 'text-red-400 border-red-400/40 bg-red-400/10';
}

function QualityOverlay({ data }: { data: QualityDashboardData }) {
  const [expanded, setExpanded] = useState(false);

  // Compute overall score (average of available scores)
  const scores: { label: string; value: number }[] = [];
  if (typeof data.ats_score === 'number') scores.push({ label: 'ATS', value: data.ats_score });
  if (typeof data.keyword_coverage === 'number') scores.push({ label: 'Keywords', value: data.keyword_coverage });
  if (typeof data.authenticity_score === 'number') scores.push({ label: 'Authenticity', value: data.authenticity_score });
  if (typeof data.evidence_integrity === 'number') scores.push({ label: 'Evidence', value: data.evidence_integrity });
  if (typeof data.blueprint_compliance === 'number') scores.push({ label: 'Blueprint', value: data.blueprint_compliance });
  if (typeof data.narrative_coherence === 'number') scores.push({ label: 'Coherence', value: data.narrative_coherence });

  if (scores.length === 0) return null;

  const overallScore = Math.round(scores.reduce((sum, s) => sum + s.value, 0) / scores.length);

  return (
    <div className="absolute right-4 top-4 z-10">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-bold shadow-lg transition-all ${qualityScoreColor(overallScore)}`}
        title={`Quality score: ${overallScore}%`}
      >
        {overallScore}
      </button>

      {expanded && (
        <div className="absolute right-0 top-14 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Quality Breakdown
          </div>
          <div className="space-y-1.5">
            {scores.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{label}</span>
                <span className={`font-semibold ${
                  value >= 80 ? 'text-emerald-600' : value >= 60 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {value}%
                </span>
              </div>
            ))}
          </div>
          {data.overall_assessment && (
            <p className="mt-2 border-t border-gray-100 pt-2 text-xs leading-relaxed text-gray-500">
              {data.overall_assessment}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ExportToolbar({ resume }: { resume: FinalResume }) {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const isExporting = exportingDocx || exportingPdf;

  const handleDownloadText = () => {
    setExportError(null);
    try {
      const text = resumeToText(resume);
      const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'txt');
      downloadAsText(text, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export text');
    }
  };

  const handleDownloadDocx = async () => {
    setExportError(null);
    setExportingDocx(true);
    try {
      const { exportDocx } = await import('@/lib/export-docx');
      const result = await exportDocx(resume);
      if (!result.success) setExportError(result.error ?? 'Failed to export DOCX');
    } finally {
      setExportingDocx(false);
    }
  };

  const handleDownloadPdf = () => {
    setExportError(null);
    setExportingPdf(true);
    requestAnimationFrame(() => {
      void import('@/lib/export-pdf')
        .then(({ exportPdf }) => {
          const result = exportPdf(resume);
          if (!result.success) setExportError(result.error ?? 'Failed to export PDF');
        })
        .catch((err: unknown) => {
          setExportError(err instanceof Error ? err.message : 'Failed to export PDF');
        })
        .finally(() => setExportingPdf(false));
    });
  };

  return (
    <div className="mb-3 flex w-full max-w-[8.5in] items-center justify-end gap-2 px-1">
      {exportError && (
        <span className="mr-auto text-xs text-red-400">{exportError}</span>
      )}
      <button
        type="button"
        onClick={handleDownloadText}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
        title="Download as text"
      >
        <Download className="h-3.5 w-3.5" />
        Text
      </button>
      <button
        type="button"
        onClick={() => void handleDownloadDocx()}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
        title="Download as DOCX"
      >
        {exportingDocx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileType2 className="h-3.5 w-3.5" />}
        DOCX
      </button>
      <button
        type="button"
        onClick={handleDownloadPdf}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
        title="Print / Save as PDF"
      >
        {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        PDF
      </button>
    </div>
  );
}

export function LiveResumeDocument({
  sectionOrder,
  sectionContent,
  sectionDraftsVersion,
  approvedSections,
  activeSectionKey,
  onEditSection,
  resume,
  isProcessing,
  sessionComplete,
  qualityData,
}: LiveResumeDocumentProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const activeSectionRef = useRef<HTMLDivElement>(null);

  // Determine section order: blueprint order > default
  const effectiveOrder = useMemo(
    () => (sectionOrder.length > 0 ? sectionOrder : DEFAULT_SECTION_ORDER),
    [sectionOrder],
  );

  // Count completed sections for progress
  // sectionDraftsVersion is included to re-compute when ref-based sectionContent changes
  const completedCount = useMemo(() => {
    let count = 0;
    for (const key of effectiveOrder) {
      const { source } = resolveSectionContent(key, resume, approvedSections, sectionContent);
      if (source !== 'placeholder') count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOrder, resume, approvedSections, sectionContent, sectionDraftsVersion]);

  const totalCount = effectiveOrder.length;
  const allComplete = completedCount === totalCount || sessionComplete;

  // Auto-scroll to active section
  useEffect(() => {
    if (activeSectionKey && activeSectionRef.current) {
      activeSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSectionKey]);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-[#1a1d23] px-4 py-6">
      {/* Document-level progress */}
      {isProcessing && !allComplete && (
        <div className="mb-3 flex w-full max-w-[8.5in] items-center gap-3 px-1">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-white/50">
            {completedCount}/{totalCount} sections
          </span>
        </div>
      )}

      {/* Export toolbar — visible when resume has content */}
      {resume && completedCount > 0 && <ExportToolbar resume={resume} />}

      {/* A4 document */}
      <div
        ref={documentRef}
        id="live-resume-document"
        className="relative mx-auto w-full max-w-[8.5in] rounded-lg bg-white px-4 py-6 shadow-2xl shadow-black/40 text-gray-900 md:px-10 md:py-8"
        style={{ fontFamily: 'Calibri, "Segoe UI", system-ui, sans-serif' }}
      >
        {/* Quality overlay */}
        {qualityData && <QualityOverlay data={qualityData} />}

        {/* Contact header */}
        {resume ? <ContactHeader resume={resume} /> : <ContactHeaderPlaceholder />}

        {/* Sections */}
        {effectiveOrder.map((key) => {
          const { content, source } = resolveSectionContent(key, resume, approvedSections, sectionContent);
          const isActive = key === activeSectionKey;

          if (source === 'placeholder') {
            return (
              <div key={key} ref={isActive ? activeSectionRef : undefined}>
                <PlaceholderSection name={key} />
              </div>
            );
          }

          return (
            <div key={key} ref={isActive ? activeSectionRef : undefined}>
              <AnimatedContentSection
                name={key}
                content={content!}
                source={source}
                isActive={isActive}
                onEdit={onEditSection}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
