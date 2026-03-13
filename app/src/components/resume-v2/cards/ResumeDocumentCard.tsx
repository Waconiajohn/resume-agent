import { useCallback, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { ResumeDraft } from '@/types/resume-v2';
import { scrollToAuditRow } from '../useStrategyThread';

interface ResumeDocumentCardProps {
  resume: ResumeDraft;
  onTextSelect?: (selectedText: string, section: string, rect: DOMRect) => void;
}

export function ResumeDocumentCard({ resume, onTextSelect }: ResumeDocumentCardProps) {
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
      className="space-y-6 font-['Georgia','Times_New_Roman',serif] leading-relaxed select-text cursor-text"
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div data-section="header" className="text-center border-b border-white/[0.12] pb-5">
        <h2 className="text-2xl font-bold tracking-wide text-white/95">{resume.header.name}</h2>
        <p className="text-base text-[#afc4ff]/80 font-medium tracking-wider uppercase mt-1.5">
          {resume.header.branded_title}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-0 gap-y-1 text-xs text-white/50 sm:flex-row">
          {resume.header.phone && (
            <>
              <span className="px-2 sm:first:pl-0">{resume.header.phone}</span>
              {(resume.header.email || resume.header.linkedin) && (
                <span className="hidden sm:inline text-white/20" aria-hidden="true">·</span>
              )}
            </>
          )}
          {resume.header.email && (
            <>
              <span className="px-2">{resume.header.email}</span>
              {resume.header.linkedin && (
                <span className="hidden sm:inline text-white/20" aria-hidden="true">·</span>
              )}
            </>
          )}
          {resume.header.linkedin && (
            <span className="px-2">{resume.header.linkedin}</span>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <section data-section="executive_summary">
        <SectionHeading>Executive Summary</SectionHeading>
        <p
          className={`text-sm leading-relaxed text-white/80 ${
            resume.executive_summary.is_new
              ? 'border-l-2 border-[#b5dec2]/40 pl-2'
              : ''
          }`}
        >
          {resume.executive_summary.content}
        </p>
      </section>

      {/* Core Competencies */}
      {resume.core_competencies.length > 0 && (
        <section data-section="core_competencies">
          <SectionHeading>Core Competencies</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {resume.core_competencies.map((comp, i) => (
              <span
                key={i}
                className="rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70"
              >
                {comp}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Selected Accomplishments */}
      {resume.selected_accomplishments.length > 0 && (
        <section data-section="selected_accomplishments">
          <SectionHeading>Selected Accomplishments</SectionHeading>
          <ul className="space-y-2">
            {resume.selected_accomplishments.map((a, i) => {
              const hasStrategy = a.addresses_requirements.length > 0;
              return (
                <li
                  key={i}
                  className={`text-sm text-white/80 leading-relaxed pl-4 relative ${
                    a.is_new ? 'border-l-2 border-[#b5dec2]/40' : ''
                  }`}
                  {...(hasStrategy
                    ? { 'data-addresses': JSON.stringify(a.addresses_requirements) }
                    : {})}
                >
                  {/* Bullet dot — blue for strategy, neutral default */}
                  <span
                    className={`absolute left-0 top-[0.45em] h-1.5 w-1.5 rounded-full ${
                      hasStrategy ? 'bg-[#afc4ff]/60' : 'bg-white/25'
                    }`}
                    aria-hidden="true"
                  />
                  {a.is_new && <NewMarker />}
                  {a.content}
                  {hasStrategy && (
                    <StrategyTooltip requirements={a.addresses_requirements} />
                  )}
                </li>
              );
            })}
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
                    <span className="text-sm font-bold text-white/90">{exp.title}</span>
                    <span className="text-sm text-white/50"> · {exp.company}</span>
                  </div>
                  <span className="text-xs text-white/40 whitespace-nowrap shrink-0">
                    {exp.start_date} — {exp.end_date}
                  </span>
                </div>
                {exp.scope_statement && (
                  <p className="mt-1 text-xs text-white/50 italic pl-1">{exp.scope_statement}</p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {exp.bullets.map((bullet, j) => {
                    const hasStrategy = bullet.addresses_requirements.length > 0;
                    return (
                      <li
                        key={j}
                        className={`text-sm text-white/80 leading-relaxed pl-4 relative ${
                          bullet.is_new ? 'border-l-2 border-[#b5dec2]/40' : ''
                        }`}
                        {...(hasStrategy
                          ? { 'data-addresses': JSON.stringify(bullet.addresses_requirements) }
                          : {})}
                      >
                        {/* Bullet dot — blue (repositioned), green (direct), neutral */}
                        <span
                          className={`absolute left-0 top-[0.5em] h-1 w-1 rounded-full ${
                            hasStrategy ? 'bg-[#afc4ff]/60' : 'bg-white/25'
                          }`}
                          aria-hidden="true"
                        />
                        {bullet.is_new && <NewMarker />}
                        {bullet.text}
                        {hasStrategy && (
                          <StrategyTooltip requirements={bullet.addresses_requirements} />
                        )}
                      </li>
                    );
                  })}
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
                <span className="text-white/70">
                  {ec.title}{' '}
                  <span className="text-white/40">· {ec.company}</span>
                </span>
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
              <div key={i} className="text-sm text-white/80">
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
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {resume.certifications.map((cert, i) => (
              <span key={i} className="text-sm text-white/70">{cert}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StrategyTooltip({ requirements }: { requirements: string[] }) {
  const [show, setShow] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (requirements.length > 0) {
      scrollToAuditRow(requirements[0]);
    }
  }

  return (
    <span
      className="relative inline-flex items-center ml-1.5 align-middle"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={`View strategy audit for: ${requirements[0] ?? 'requirement'}`}
        className="flex items-center focus:outline-none focus-visible:ring-1 focus-visible:ring-[#afc4ff]/60 rounded"
      >
        <Lightbulb
          className={`h-3 w-3 transition-colors duration-150 ${
            show ? 'text-[#afc4ff]/80' : 'text-[#afc4ff]/40'
          } hover:text-[#afc4ff]/80`}
        />
      </button>

      {show && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[280px] bg-[#0f141e]/95 backdrop-blur-md border border-white/[0.12] rounded-lg shadow-xl pointer-events-none"
          role="tooltip"
        >
          {/* Tooltip header */}
          <span className="block px-3 pt-2 pb-1.5 border-b border-white/[0.08]">
            <span className="flex items-center gap-1.5">
              <Lightbulb className="h-2.5 w-2.5 text-[#afc4ff]/60 shrink-0" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#afc4ff]/70">
                Strategy Applied
              </span>
            </span>
          </span>

          {/* Requirements list */}
          <span className="block px-3 pt-2 pb-2.5 space-y-1.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/35 mb-1">
              Addresses:
            </span>
            {requirements.map((req, i) => (
              <span
                key={i}
                className="flex items-start gap-1.5"
              >
                <span
                  className="mt-[3px] h-1.5 w-1.5 rounded-full bg-[#afc4ff]/50 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[11px] text-white/75 leading-snug">{req}</span>
              </span>
            ))}
            <span className="block mt-2 pt-2 border-t border-white/[0.07] text-[10px] text-white/35 italic">
              Click to view in audit table
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold tracking-[0.2em] uppercase text-white/70 border-b border-white/[0.12] pb-1 sm:text-[11px]">
      {children}
    </h3>
  );
}

function NewMarker() {
  return (
    <span className="inline-flex items-center rounded bg-[#b5dec2]/10 px-1 py-0.5 text-[9px] font-semibold text-[#b5dec2]/70 mr-1 align-middle border border-[#b5dec2]/20">
      New
    </span>
  );
}
