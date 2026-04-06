import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LiveResumeState } from '@/types/discovery';

interface LiveResumeProps {
  resume: LiveResumeState;
  highlightedSections: string[];
  footerText?: string;
}

interface ParsedSection {
  heading: string;
  items: Array<{ type: 'bullet' | 'text'; text: string }>;
}

function parseRawText(text: string): ParsedSection[] {
  const lines = text.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeader =
      (trimmed === trimmed.toUpperCase() && trimmed.length < 40 && trimmed.length > 2) ||
      (trimmed.endsWith(':') && trimmed.length < 40);

    const isBullet = /^[•\-–—*]/.test(trimmed) || /^\d+\./.test(trimmed);

    if (isHeader) {
      if (current) sections.push(current);
      current = { heading: trimmed.replace(/:$/, ''), items: [] };
    } else if (isBullet && current) {
      current.items.push({ type: 'bullet', text: trimmed.replace(/^[•\-–—*]\s*/, '').replace(/^\d+\.\s*/, '') });
    } else if (current) {
      current.items.push({ type: 'text', text: trimmed });
    } else {
      if (!sections.length) {
        sections.push({ heading: '', items: [{ type: 'text', text: trimmed }] });
      } else {
        sections[sections.length - 1].items.push({ type: 'text', text: trimmed });
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function LiveResume({ resume, highlightedSections, footerText }: LiveResumeProps) {
  const [glowSections, setGlowSections] = useState<Set<string>>(new Set());
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (highlightedSections.length === 0) return;
    setGlowSections(new Set(highlightedSections));

    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => {
      setGlowSections(new Set());
    }, 2500);

    return () => {
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    };
  }, [highlightedSections]);

  const isRawTextFallback =
    resume.experience.length === 0 && resume.summary.length > 200;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 bg-gray-900 px-8 py-6">
        {/* Contact header */}
        <div className="mb-6 pb-4 border-b border-gray-700">
          <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
            {resume.name || 'Your Name'}
          </h1>
          <p className="mt-1 text-xs text-gray-400 leading-relaxed">
            {[resume.email, resume.phone].filter(Boolean).join(' · ')}
          </p>
        </div>

        {isRawTextFallback ? (
          /* Raw text fallback: parse summary as structured resume text */
          <div className="space-y-5">
            {parseRawText(resume.summary).map((section, sIdx) => (
              <div key={sIdx}>
                {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
                <div className="mt-2 space-y-1.5">
                  {section.items.map((item, iIdx) =>
                    item.type === 'bullet' ? (
                      <p
                        key={iIdx}
                        className="text-xs leading-relaxed pl-3 border-l-2 border-gray-700 text-gray-400"
                      >
                        {item.text}
                      </p>
                    ) : (
                      <p key={iIdx} className="text-xs leading-relaxed text-gray-300">
                        {item.text}
                      </p>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Summary */}
            {resume.summary && (
              <div
                className={cn(
                  'mb-5 transition-all duration-700',
                  glowSections.has('summary') && 'bg-blue-400/5 rounded-r',
                )}
              >
                <SectionHeading>Summary</SectionHeading>
                <p className="text-xs leading-relaxed text-gray-300 mt-2">{resume.summary}</p>
              </div>
            )}

            {/* Experience */}
            {resume.experience.length > 0 && (
              <div className="mb-5">
                <SectionHeading>Experience</SectionHeading>
                <div className="mt-3 space-y-5">
                  {resume.experience.map((exp) => (
                    <div key={exp.id}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-white">{exp.title}</span>
                          {exp.company && (
                            <span className="text-xs text-gray-400">{exp.company}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 shrink-0 ml-3">{exp.dates}</span>
                      </div>
                      {exp.bullets.length > 0 && (
                        <ul className="space-y-1.5 mt-1">
                          {exp.bullets.map((bullet) => (
                            <li
                              key={bullet.id}
                              className={cn(
                                'text-xs leading-relaxed pl-3 border-l-2 transition-all duration-700',
                                glowSections.has(exp.id) ||
                                  glowSections.has('experience') ||
                                  bullet.highlighted
                                  ? 'text-white border-blue-400 bg-blue-400/5 rounded-r'
                                  : 'text-gray-400 border-gray-700',
                              )}
                            >
                              {bullet.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {resume.skills.length > 0 && (
              <div className="mb-5">
                <SectionHeading>Skills</SectionHeading>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resume.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700 leading-normal"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {resume.education.length > 0 && (
              <div className="mb-5">
                <SectionHeading>Education</SectionHeading>
                <div className="mt-2 space-y-1">
                  {resume.education.map((edu, idx) => (
                    <div key={idx} className="flex items-baseline justify-between">
                      <div>
                        <span className="text-xs font-medium text-white">{edu.degree}</span>
                        {edu.institution && (
                          <span className="text-xs text-gray-400"> · {edu.institution}</span>
                        )}
                      </div>
                      {edu.year && <span className="text-xs text-gray-500">{edu.year}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {footerText && (
        <p className="px-8 py-3 text-center text-xs text-[var(--text-soft)] italic">{footerText}</p>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 pb-1 text-xs font-semibold uppercase tracking-widest text-gray-500 border-b border-gray-700">
      {children}
    </h2>
  );
}
