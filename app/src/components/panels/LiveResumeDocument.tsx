import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Download, FileType2, Printer, Loader2, Pencil } from 'lucide-react';
import { DEFAULT_SECTION_ORDER } from '@/lib/constants';
import { resumeToText, downloadAsText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';
import { useTypingAnimation } from '@/hooks/useTypingAnimation';
import type { FinalResume } from '@/types/resume';
import type { QualityDashboardData } from '@/types/panels';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveResumeDocumentProps {
  sectionOrder: string[];
  sectionContent: Record<string, string>;
  approvedSections: Record<string, string>;
  activeSectionKey: string | null;
  onEditSection?: (key: string, content: string) => void;
  resume: FinalResume | null;
  isProcessing: boolean;
  sessionComplete?: boolean;
  qualityData?: QualityDashboardData | null;
  reviewMode?: boolean;
  reviewSection?: string;
  reviewToken?: string;
  onApproveSection?: () => void;
  onQuickFixSection?: (feedback: string) => void;
  editModeHint?: boolean;
}

type SectionSource = 'resume' | 'approved' | 'draft' | 'placeholder';

// ─── Content Resolution ──────────────────────────────────────────────────────

function resolveSectionContent(
  key: string,
  resume: FinalResume | null,
  approvedSections: Record<string, string>,
  sectionContent: Record<string, string>,
): { content: string | null; source: SectionSource; hasStructuredData: boolean } {
  // User local edits (written via onLocalSectionEdit -> setSectionDraftEntry) live in
  // sectionContent. They must take highest priority so that post-pipeline inline edits
  // to structured sections are not silently discarded. By the time `resume` structured
  // data exists, the SSE pipeline is complete and no further SSE drafts will arrive for
  // these sections, so checking sectionContent first is safe here.
  if (sectionContent[key]) return { content: sectionContent[key], source: 'draft', hasStructuredData: false };
  if (resume && hasStructuredResumeSection(resume, key)) {
    return { content: null, source: 'resume', hasStructuredData: true };
  }
  if (approvedSections[key]) return { content: approvedSections[key], source: 'approved', hasStructuredData: false };
  return { content: null, source: 'placeholder', hasStructuredData: false };
}

function hasStructuredResumeSection(resume: FinalResume, key: string): boolean {
  switch (key) {
    case 'summary': return Boolean(resume.summary);
    case 'selected_accomplishments': return Boolean(resume.selected_accomplishments);
    case 'skills': return Boolean(resume.skills && typeof resume.skills === 'object' && Object.keys(resume.skills).length > 0);
    case 'experience': return Array.isArray(resume.experience) && resume.experience.length > 0;
    case 'education': return Array.isArray(resume.education) && resume.education.length > 0;
    case 'certifications': return Array.isArray(resume.certifications) && resume.certifications.length > 0;
    default: return Boolean(resume._raw_sections?.[key]);
  }
}

function getResumeSectionText(resume: FinalResume, key: string): string {
  switch (key) {
    case 'summary': return resume.summary || '';
    case 'selected_accomplishments': return resume.selected_accomplishments || '';
    case 'skills': {
      if (!resume.skills || typeof resume.skills !== 'object') return '';
      return Object.entries(resume.skills)
        .map(([cat, items]) => `${cat}: ${Array.isArray(items) ? items.join(', ') : String(items)}`)
        .join('\n');
    }
    case 'experience': {
      if (!Array.isArray(resume.experience)) return '';
      return resume.experience
        .map((exp) => {
          const header = `${exp.title ?? 'Position'} — ${exp.company ?? 'Company'} (${exp.start_date ?? ''} – ${exp.end_date ?? 'Present'})`;
          const bullets = exp.bullets?.map((b) => `  • ${b.text ?? ''}`).join('\n') ?? '';
          return `${header}\n${bullets}`;
        })
        .join('\n\n');
    }
    case 'education': {
      if (!Array.isArray(resume.education)) return '';
      return resume.education
        .map((edu) => `${edu.degree ?? ''}${edu.field ? ` in ${edu.field}` : ''}, ${edu.institution ?? ''}${edu.year ? ` (${edu.year})` : ''}`)
        .join('\n');
    }
    case 'certifications': {
      if (!Array.isArray(resume.certifications)) return '';
      return resume.certifications
        .map((cert) => `${cert.name ?? ''}${cert.issuer ? ` — ${cert.issuer}` : ''}${cert.year ? ` (${cert.year})` : ''}`)
        .join('\n');
    }
    default: return resume._raw_sections?.[key] ?? '';
  }
}

// ─── Contact Header ──────────────────────────────────────────────────────────

function ContactHeaderPlaceholder() {
  return (
    <div className="mb-4 text-center" aria-hidden="true">
      <div className="mx-auto h-7 w-52 animate-pulse rounded bg-gray-200" />
      <div className="mx-auto mt-2 h-3 w-72 animate-pulse rounded bg-gray-100" style={{ animationDelay: '150ms' }} />
      <hr className="mt-3 border-gray-400" />
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
        <p className="mt-1 text-xs text-gray-500">{contactParts.join('; ')}</p>
      )}
      <hr className="mt-2 border-gray-400" />
    </div>
  );
}

// ─── Structured Section Renderers (mirror WYSIWYGResume) ──────────────────────

function StructuredSummarySection({ resume }: { resume: FinalResume }) {
  if (!resume.summary) return null;
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{stripHtml(resume.summary)}</p>;
}

function StructuredAccomplishmentsSection({ resume }: { resume: FinalResume }) {
  if (!resume.selected_accomplishments) return null;
  return <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{stripHtml(resume.selected_accomplishments)}</div>;
}

function StructuredSkillsSection({ resume }: { resume: FinalResume }) {
  const skills = resume.skills;
  if (!skills || typeof skills !== 'object' || Object.keys(skills).length === 0) return null;
  return (
    <div className="space-y-1">
      {Object.entries(skills).map(([category, items]) => (
        <div key={category || '_default'} className="text-sm">
          {category && <span className="font-semibold text-gray-700">{category}: </span>}
          <span className="text-gray-800">{Array.isArray(items) ? items.join(', ') : String(items)}</span>
        </div>
      ))}
    </div>
  );
}

function StructuredExperienceSection({ resume }: { resume: FinalResume }) {
  if (!resume.experience) return null;
  if (!Array.isArray(resume.experience)) {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{stripHtml(String(resume.experience))}</div>;
  }
  if (resume.experience.length === 0) return null;
  return (
    <div className="space-y-4">
      {resume.experience.map((exp, i) => (
        <div key={`${exp.company ?? ''}-${exp.title ?? ''}-${i}`}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-gray-900">{exp.title ?? 'Position'}</span>
            <span className="text-xs text-gray-500">{exp.start_date ?? ''} – {exp.end_date ?? 'Present'}</span>
          </div>
          <div className="text-sm text-gray-600">
            {exp.company ?? 'Company'}{exp.location ? `, ${exp.location}` : ''}
          </div>
          {exp.bullets && exp.bullets.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 pl-4">
              {exp.bullets.map((b, j) => (
                <li key={j} className="list-disc text-sm text-gray-800">{stripHtml(b.text ?? '')}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function StructuredEducationSection({ resume }: { resume: FinalResume }) {
  if (!resume.education) return null;
  if (!Array.isArray(resume.education)) {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{stripHtml(String(resume.education))}</div>;
  }
  if (resume.education.length === 0) return null;
  return (
    <div>
      {resume.education.map((edu, i) => (
        <div key={`${edu.institution ?? ''}-${edu.degree ?? ''}-${i}`} className="text-sm text-gray-800">
          <span className="font-semibold">{edu.degree ?? ''}</span>
          {edu.field ? ` in ${edu.field}` : ''}, {edu.institution ?? ''}
          {edu.year ? ` (${edu.year})` : ''}
        </div>
      ))}
    </div>
  );
}

function StructuredCertificationsSection({ resume }: { resume: FinalResume }) {
  if (!resume.certifications) return null;
  if (!Array.isArray(resume.certifications)) {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{stripHtml(String(resume.certifications))}</div>;
  }
  if (resume.certifications.length === 0) return null;
  return (
    <div>
      {resume.certifications.map((cert, i) => (
        <div key={`${cert.name ?? ''}-${i}`} className="text-sm text-gray-800">
          <span className="font-semibold">{cert.name ?? ''}</span>
          {cert.issuer ? ` — ${cert.issuer}` : ''}
          {cert.year ? ` (${cert.year})` : ''}
        </div>
      ))}
    </div>
  );
}

const structuredRenderers: Record<string, React.ComponentType<{ resume: FinalResume }>> = {
  summary: StructuredSummarySection,
  selected_accomplishments: StructuredAccomplishmentsSection,
  skills: StructuredSkillsSection,
  experience: StructuredExperienceSection,
  education: StructuredEducationSection,
  certifications: StructuredCertificationsSection,
};

// ─── Placeholder Section ──────────────────────────────────────────────────────

function PlaceholderSection({ name }: { name: string }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-400">
        {SECTION_DISPLAY_NAMES[name] ?? toTitleCase(name)}
      </h2>
      <div className="space-y-2 py-1">
        <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-gray-100" style={{ animationDelay: '150ms' }} />
        <div className="h-3 w-4/6 animate-pulse rounded bg-gray-50" style={{ animationDelay: '300ms' }} />
      </div>
    </section>
  );
}

// ─── Section Status Badge ─────────────────────────────────────────────────────

function SectionStatusBadge({ source, isActive }: { source: string; isActive: boolean }) {
  if (isActive) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-blue-500" role="status" aria-live="polite">
        <span className="h-1.5 w-1.5 animate-pulse bg-blue-400" />
        Creating...
      </span>
    );
  }
  if (source === 'draft') {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-500">
        <span className="h-1.5 w-1.5 bg-amber-400" />
        Draft
      </span>
    );
  }
  if (source === 'approved' || source === 'resume') {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500">
        <span className="h-1.5 w-1.5 bg-emerald-400" />
        Complete
      </span>
    );
  }
  return null;
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function SectionWrapper({
  sectionKey,
  source,
  isActive,
  canEdit,
  editing,
  onStartEdit,
  children,
}: {
  sectionKey: string;
  source: SectionSource;
  isActive: boolean;
  canEdit: boolean;
  editing: boolean;
  onStartEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`group mb-5 rounded transition-all duration-300 ${
        isActive ? 'border-l-[3px] border-blue-500 bg-blue-50/30 pl-3 shadow-sm' : ''
      } ${canEdit && !editing ? 'cursor-pointer hover:ring-2 hover:ring-blue-300/30' : ''}`}
      onClick={canEdit && !editing ? onStartEdit : undefined}
    >
      <h2 className="mb-2 flex items-center border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
        {SECTION_DISPLAY_NAMES[sectionKey] ?? toTitleCase(sectionKey)}
        <SectionStatusBadge source={source} isActive={isActive} />
        {canEdit && !editing && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-gray-400 opacity-40 transition-opacity hover:bg-gray-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 group-hover:opacity-100"
            aria-label={`Edit ${SECTION_DISPLAY_NAMES[sectionKey] ?? toTitleCase(sectionKey)}`}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </h2>
      {children}
    </section>
  );
}

// ─── Inline Edit Overlay ──────────────────────────────────────────────────────

function InlineEditOverlay({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, []);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        aria-label="Edit section content"
        className="w-full resize-y rounded-lg border-2 border-blue-400 bg-blue-50 p-3 text-sm leading-relaxed text-gray-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        rows={Math.max(4, editValue.split('\n').length + 1)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(editValue);
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {/Mac|iPhone|iPad/.test(navigator.userAgent) ? '\u2318' : 'Ctrl'}+Enter to save \u00b7 Esc to cancel
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(editValue)}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Content Section (for draft/approved text) ───────────────────────

const AnimatedContentSection = React.memo(function AnimatedContentSection({
  sectionKey,
  content,
  source,
  isActive,
  onEdit,
}: {
  sectionKey: string;
  content: string;
  source: SectionSource;
  isActive: boolean;
  onEdit?: (key: string, content: string) => void;
}) {
  const { displayText, isAnimating, skipToEnd } = useTypingAnimation({
    targetText: content,
    isActive,
  });

  const [editing, setEditing] = useState(false);
  const canEdit = !isActive && !isAnimating && Boolean(onEdit) && (source === 'approved' || source === 'draft');

  const handleSave = useCallback((newContent: string) => {
    onEdit?.(sectionKey, newContent);
    setEditing(false);
  }, [onEdit, sectionKey]);

  const handleCancel = useCallback(() => setEditing(false), []);

  return (
    <SectionWrapper
      sectionKey={sectionKey}
      source={source}
      isActive={isActive}
      canEdit={canEdit}
      editing={editing}
      onStartEdit={() => setEditing(true)}
    >
      {editing ? (
        <InlineEditOverlay value={stripHtml(content)} onSave={handleSave} onCancel={handleCancel} />
      ) : (
        <div
          className={`whitespace-pre-wrap text-sm leading-relaxed text-gray-800 ${isAnimating ? 'cursor-pointer' : ''}`}
          onClick={isAnimating ? skipToEnd : undefined}
          role={isAnimating ? 'button' : undefined}
          tabIndex={isAnimating ? 0 : undefined}
          onKeyDown={isAnimating ? (e) => { if (e.key === 'Enter' || e.key === ' ') skipToEnd(); } : undefined}
          title={isAnimating ? 'Click to skip animation' : undefined}
          aria-busy={isAnimating}
        >
          {isActive ? displayText : stripHtml(content)}
          {isAnimating && <span className="inline-block h-3.5 w-0.5 animate-pulse bg-gray-400 align-text-bottom" />}
        </div>
      )}
    </SectionWrapper>
  );
}, (prev, next) => {
  return prev.content === next.content
    && prev.isActive === next.isActive
    && prev.source === next.source
    && prev.sectionKey === next.sectionKey
    && prev.onEdit === next.onEdit;
});

// ─── Structured Resume Section (for completed FinalResume) ────────────────────

const StructuredResumeSection = React.memo(function StructuredResumeSection({
  sectionKey,
  resume,
  onEdit,
}: {
  sectionKey: string;
  resume: FinalResume;
  onEdit?: (key: string, content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = Boolean(onEdit);
  const Renderer = structuredRenderers[sectionKey];

  const handleSave = useCallback((newContent: string) => {
    onEdit?.(sectionKey, newContent);
    setEditing(false);
  }, [onEdit, sectionKey]);

  const handleCancel = useCallback(() => setEditing(false), []);

  return (
    <SectionWrapper
      sectionKey={sectionKey}
      source="resume"
      isActive={false}
      canEdit={canEdit}
      editing={editing}
      onStartEdit={() => setEditing(true)}
    >
      {editing ? (
        <InlineEditOverlay
          value={getResumeSectionText(resume, sectionKey)}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : Renderer ? (
        <Renderer resume={resume} />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {stripHtml(resume._raw_sections?.[sectionKey] ?? '')}
        </div>
      )}
    </SectionWrapper>
  );
});

// ─── Quality Badge (outside the document) ─────────────────────────────────────

function qualityScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
  if (score >= 60) return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
  return 'text-red-400 border-red-400/40 bg-red-400/10';
}

function QualityBadge({ data }: { data: QualityDashboardData }) {
  const [expanded, setExpanded] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

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
    <div ref={overlayRef} className="relative">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex h-10 w-10 items-center justify-center rounded-md border-2 text-sm font-bold shadow-lg transition-all ${qualityScoreColor(overallScore)}`}
        aria-label={`Quality score ${overallScore}%. Click for breakdown.`}
      >
        {overallScore}
      </button>
      {expanded && (
        <div className="absolute right-0 top-12 z-20 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Quality Breakdown</div>
          <div className="space-y-1.5">
            {scores.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{label}</span>
                <span className={`font-semibold ${value >= 80 ? 'text-emerald-600' : value >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
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

// ─── Export Toolbar ────────────────────────────────────────────────────────────

function ExportToolbar({ resume }: { resume: FinalResume }) {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const isExporting = exportingDocx || exportingPdf;

  useEffect(() => {
    if (!exportError) return;
    const timer = setTimeout(() => setExportError(null), 5000);
    return () => clearTimeout(timer);
  }, [exportError]);

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
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Failed to export DOCX');
    } finally {
      setExportingDocx(false);
    }
  };

  const handleDownloadPdf = async () => {
    setExportError(null);
    setExportingPdf(true);
    try {
      const { exportPdf } = await import('@/lib/export-pdf');
      const result = exportPdf(resume);
      if (!result.success) setExportError(result.error ?? 'Failed to export PDF');
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <>
      {exportError && <span className="mr-auto text-xs text-red-400">{exportError}</span>}
      <button
        type="button"
        onClick={handleDownloadText}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
        aria-label="Download resume as text file"
      >
        <Download className="h-3.5 w-3.5" />
        Text
      </button>
      <button
        type="button"
        onClick={() => void handleDownloadDocx()}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
        aria-label="Download resume as DOCX document"
      >
        {exportingDocx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileType2 className="h-3.5 w-3.5" />}
        DOCX
      </button>
      <button
        type="button"
        onClick={() => void handleDownloadPdf()}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
        aria-label="Print or save resume as PDF"
      >
        {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        PDF
      </button>
    </>
  );
}

// ─── Inline Review Bar (Story 4) ───────────────────────────────────────────────

const INLINE_QUICK_FIX_CHIPS = [
  'Add metrics',
  'Make shorter',
  'More leadership focus',
  'Strengthen verbs',
  'Add specifics',
  'Reduce jargon',
] as const;

function QuickFixPopover({
  onSend,
  onClose,
}: {
  onSend: (feedback: string) => void;
  onClose: () => void;
}) {
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState('');

  const toggleChip = (chip: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  };

  const handleSend = () => {
    const parts = Array.from(selectedChips);
    if (customText.trim()) parts.push(customText.trim());
    if (parts.length === 0) return;
    onSend(parts.join('; '));
    onClose();
  };

  return (
    <div
      className="mt-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5 mb-2">
        {INLINE_QUICK_FIX_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => toggleChip(chip)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
              selectedChips.has(chip)
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>
      <textarea
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        placeholder="Additional feedback..."
        className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
        rows={2}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={selectedChips.size === 0 && !customText.trim()}
          className="rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function InlineReviewBar({
  onApprove,
  onQuickFix,
  onEdit,
}: {
  onApprove: () => void;
  onQuickFix: (feedback: string) => void;
  onEdit: () => void;
}) {
  const [showQuickFix, setShowQuickFix] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onApprove();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onApprove]);

  return (
    <div className="mt-3 border-t border-gray-200 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
          title={`${/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+Enter`}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setShowQuickFix(!showQuickFix)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            showQuickFix
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          Quick Fix ▾
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          Edit
        </button>
      </div>
      {showQuickFix && (
        <QuickFixPopover
          onSend={onQuickFix}
          onClose={() => setShowQuickFix(false)}
        />
      )}
    </div>
  );
}

// ─── Edit Mode Hint ────────────────────────────────────────────────────────────

function EditModeHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="edit-hint-fade mb-2 rounded-md bg-blue-50 px-3 py-1.5 text-center text-xs font-medium text-blue-600">
      Click any section to edit
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiveResumeDocument({
  sectionOrder,
  sectionContent,
  approvedSections,
  activeSectionKey,
  onEditSection,
  resume,
  isProcessing,
  sessionComplete,
  qualityData,
  reviewMode,
  reviewSection,
  reviewToken: _reviewToken,
  onApproveSection,
  onQuickFixSection,
  editModeHint,
}: LiveResumeDocumentProps) {
  const activeSectionRef = useRef<HTMLDivElement>(null);

  const effectiveOrder = useMemo(
    () => (sectionOrder.length > 0 ? sectionOrder : DEFAULT_SECTION_ORDER),
    [sectionOrder],
  );

  const resolvedSections = useMemo(() => {
    return effectiveOrder.map((key) => ({
      key,
      ...resolveSectionContent(key, resume, approvedSections, sectionContent),
    }));
  }, [effectiveOrder, resume, approvedSections, sectionContent]);

  const completedCount = useMemo(
    () => resolvedSections.filter((s) => s.source !== 'placeholder').length,
    [resolvedSections],
  );
  const totalCount = effectiveOrder.length;
  const allComplete = completedCount === totalCount || sessionComplete;

  useEffect(() => {
    if (activeSectionKey && activeSectionRef.current) {
      activeSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSectionKey]);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-[#1a1d23] px-6 py-8 lg:px-8 lg:py-10">
      {/* Toolbar: progress + quality + export */}
      <div className="mb-3 flex w-full max-w-[8.5in] items-center gap-3 px-1">
        {isProcessing && !allComplete && (
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden bg-gray-700">
              <div
                className="h-full bg-blue-400 transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-white/50">
              {completedCount}/{totalCount} sections
            </span>
          </div>
        )}
        {isProcessing && allComplete && !sessionComplete && (
          <div className="flex flex-1 items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
            <span className="text-xs text-white/50">Finalizing...</span>
          </div>
        )}
        {(!isProcessing || (allComplete && sessionComplete)) && <div className="flex-1" />}

        {qualityData && <QualityBadge data={qualityData} />}
        {resume && allComplete && <ExportToolbar resume={resume} />}
      </div>

      {/* A4 document */}
      <div
        id="live-resume-document"
        className="relative mx-auto w-full max-w-[8.5in] overflow-x-auto break-words rounded-lg bg-white px-4 py-6 shadow-2xl shadow-black/40 text-gray-900 md:px-10 md:py-8"
        style={{ fontFamily: 'Calibri, "Segoe UI", system-ui, sans-serif' }}
      >
        {resume ? <ContactHeader resume={resume} /> : <ContactHeaderPlaceholder />}

        {editModeHint && <EditModeHint />}

        {resolvedSections.map(({ key, source, content, hasStructuredData }) => {
          const isActive = key === activeSectionKey;
          const isReviewTarget = reviewMode && key === reviewSection;

          if (source === 'placeholder') {
            return (
              <div key={key} ref={isActive ? activeSectionRef : undefined}>
                <PlaceholderSection name={key} />
              </div>
            );
          }

          if (source === 'resume' && hasStructuredData && resume) {
            return (
              <div key={key} ref={isActive ? activeSectionRef : undefined}>
                <StructuredResumeSection
                  sectionKey={key}
                  resume={resume}
                  onEdit={onEditSection}
                />
                {isReviewTarget && onApproveSection && onQuickFixSection && (
                  <InlineReviewBar
                    onApprove={onApproveSection}
                    onQuickFix={onQuickFixSection}
                    onEdit={() => {
                      // Find and click the section's edit button
                      const section = activeSectionRef.current;
                      const editBtn = section?.querySelector<HTMLButtonElement>('button[aria-label^="Edit"]');
                      editBtn?.click();
                    }}
                  />
                )}
              </div>
            );
          }

          return (
            <div key={key} ref={isActive ? activeSectionRef : undefined}>
              <AnimatedContentSection
                sectionKey={key}
                content={content ?? ''}
                source={source}
                isActive={isActive}
                onEdit={onEditSection}
              />
              {isReviewTarget && onApproveSection && onQuickFixSection && (
                <InlineReviewBar
                  onApprove={onApproveSection}
                  onQuickFix={onQuickFixSection}
                  onEdit={() => {
                    const section = activeSectionRef.current;
                    const editBtn = section?.querySelector<HTMLButtonElement>('button[aria-label^="Edit"]');
                    editBtn?.click();
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
