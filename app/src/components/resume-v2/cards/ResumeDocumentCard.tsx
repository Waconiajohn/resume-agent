import { useCallback, useRef } from 'react';
import type { ResumeDraft } from '@/types/resume-v2';

interface ResumeDocumentCardProps {
  resume: ResumeDraft;
  onTextSelect?: (selectedText: string, section: string, rect: DOMRect) => void;
}

export function ResumeDocumentCard({ resume, onTextSelect }: ResumeDocumentCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    if (!onTextSelect) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    const text = selection.toString().trim();
    if (text.length < 5) return;

    // Find which section the selection is in
    const range = selection.getRangeAt(0);
    const sectionEl = (range.startContainer as HTMLElement).closest?.('[data-section]')
      ?? (range.startContainer.parentElement)?.closest?.('[data-section]');
    const section = sectionEl?.getAttribute('data-section') ?? 'unknown';

    const rect = range.getBoundingClientRect();
    onTextSelect(text, section, rect);
  }, [onTextSelect]);

  return (
    <div
      ref={containerRef}
      className="space-y-6 font-serif select-text cursor-text"
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div className="text-center border-b border-white/10 pb-4">
        <h2 className="text-2xl font-bold text-white/95">{resume.header.name}</h2>
        <p className="text-sm text-[#afc4ff] mt-1">{resume.header.branded_title}</p>
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-white/50">
          {resume.header.phone && <span>{resume.header.phone}</span>}
          {resume.header.email && <span>{resume.header.email}</span>}
          {resume.header.linkedin && <span>{resume.header.linkedin}</span>}
        </div>
      </div>

      {/* Executive Summary */}
      <section data-section="executive_summary">
        <SectionHeading>Executive Summary</SectionHeading>
        <p className="text-sm text-white/75 leading-relaxed">
          {resume.executive_summary.is_new && <NewMarker />}
          {resume.executive_summary.content}
        </p>
      </section>

      {/* Core Competencies */}
      {resume.core_competencies.length > 0 && (
        <section data-section="core_competencies">
          <SectionHeading>Core Competencies</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {resume.core_competencies.map((comp, i) => (
              <span key={i} className="rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70">{comp}</span>
            ))}
          </div>
        </section>
      )}

      {/* Selected Accomplishments */}
      {resume.selected_accomplishments.length > 0 && (
        <section data-section="selected_accomplishments">
          <SectionHeading>Selected Accomplishments</SectionHeading>
          <ul className="space-y-2">
            {resume.selected_accomplishments.map((a, i) => (
              <li key={i} className="text-sm text-white/75 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#afc4ff]/40">
                {a.is_new && <NewMarker />}
                {a.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Professional Experience */}
      {resume.professional_experience.length > 0 && (
        <section data-section="professional_experience">
          <SectionHeading>Professional Experience</SectionHeading>
          <div className="space-y-5">
            {resume.professional_experience.map((exp, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-white/90">{exp.title}</span>
                    <span className="text-sm text-white/50"> | {exp.company}</span>
                  </div>
                  <span className="text-xs text-white/40 whitespace-nowrap">{exp.start_date} — {exp.end_date}</span>
                </div>
                {exp.scope_statement && (
                  <p className="mt-1 text-xs text-white/55 italic">{exp.scope_statement}</p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {exp.bullets.map((bullet, j) => (
                    <li key={j} className="text-sm text-white/70 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-white/25">
                      {bullet.is_new && <NewMarker />}
                      {bullet.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Earlier Career */}
      {resume.earlier_career && resume.earlier_career.length > 0 && (
        <section data-section="earlier_career">
          <SectionHeading>Earlier Career</SectionHeading>
          <div className="space-y-1">
            {resume.earlier_career.map((ec, i) => (
              <div key={i} className="flex items-baseline justify-between text-sm">
                <span className="text-white/70">{ec.title} <span className="text-white/40">| {ec.company}</span></span>
                <span className="text-xs text-white/40">{ec.dates}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {resume.education.length > 0 && (
        <section data-section="education">
          <SectionHeading>Education</SectionHeading>
          <div className="space-y-1">
            {resume.education.map((edu, i) => (
              <div key={i} className="text-sm text-white/70">
                {edu.degree} — {edu.institution}
                {edu.year && <span className="text-white/40"> ({edu.year})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {resume.certifications.length > 0 && (
        <section data-section="certifications">
          <SectionHeading>Certifications</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {resume.certifications.map((cert, i) => (
              <span key={i} className="text-sm text-white/70">{cert}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#afc4ff]/70 border-b border-white/[0.06] pb-1">
      {children}
    </h3>
  );
}

function NewMarker() {
  return (
    <span className="inline-flex items-center rounded bg-[#afc4ff]/15 px-1 py-0.5 text-[9px] font-semibold text-[#afc4ff]/80 mr-1 align-middle border border-[#afc4ff]/20">
      New
    </span>
  );
}
