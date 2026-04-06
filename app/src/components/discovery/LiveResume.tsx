import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ResumeHighlight } from './ResumeHighlight';
import type { LiveResumeState } from '@/types/discovery';

interface LiveResumeProps {
  resume: LiveResumeState;
  highlightedSections: string[];
  footerText?: string;
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

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex-1 overflow-y-auto bg-gray-900 p-6 text-white"
        style={{ fontSize: '0.82rem', lineHeight: '1.6' }}
      >
        {/* Header */}
        <div className="mb-5 border-b border-[var(--line-soft)] pb-4">
          <h2 className="text-lg font-bold text-white">
            {resume.name || 'Your Name'}
          </h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
            {resume.email && <span>{resume.email}</span>}
            {resume.phone && <span>&bull; {resume.phone}</span>}
          </div>
        </div>

        {/* Summary */}
        {resume.summary && (
          <div
            className={cn(
              'mb-5 rounded-lg p-3 transition-all duration-700',
              glowSections.has('summary')
                ? 'ring-1 ring-blue-400/40 bg-blue-400/5'
                : 'ring-1 ring-transparent',
            )}
          >
            <SectionHeading>Summary</SectionHeading>
            <p className="mt-1 text-gray-400">{resume.summary}</p>
          </div>
        )}

        {/* Experience */}
        {resume.experience.length > 0 && (
          <div className="mb-5">
            <SectionHeading>Experience</SectionHeading>
            <div className="mt-2 space-y-4">
              {resume.experience.map((exp) => (
                <div
                  key={exp.id}
                  className={cn(
                    'rounded-lg p-3 transition-all duration-700',
                    glowSections.has(exp.id) || glowSections.has('experience')
                      ? 'ring-1 ring-blue-400/40 bg-blue-400/5'
                      : 'ring-1 ring-transparent',
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <span className="text-sm font-semibold text-white">{exp.title}</span>
                      {exp.company && (
                        <span className="text-sm text-gray-400"> &middot; {exp.company}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{exp.dates}</span>
                  </div>
                  {exp.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {exp.bullets.map((bullet) => {
                        const isAnnotated = bullet.highlighted || bullet.strengthened;
                        const highlightType = bullet.strengthened ? 'strengthened' : 'referenced';
                        return (
                          <li
                            key={bullet.id}
                            className={cn(
                              'text-sm leading-relaxed pl-3 border-l-2 transition-colors duration-500',
                              bullet.highlighted
                                ? 'text-white border-blue-400'
                                : 'text-gray-400 border-transparent',
                            )}
                          >
                            {isAnnotated ? (
                              <ResumeHighlight
                                bulletText={bullet.text}
                                highlightType={highlightType}
                              >
                                <span className={cn(bullet.strengthened && 'font-medium')}>
                                  {bullet.text}
                                </span>
                              </ResumeHighlight>
                            ) : (
                              bullet.text
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {resume.skills.length > 0 && (
          <div
            className={cn(
              'mb-5 rounded-lg p-3 transition-all duration-700',
              glowSections.has('skills')
                ? 'ring-1 ring-blue-400/40 bg-blue-400/5'
                : 'ring-1 ring-transparent',
            )}
          >
            <SectionHeading>Skills</SectionHeading>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {resume.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-xs text-gray-400"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {resume.education.length > 0 && (
          <div
            className={cn(
              'rounded-lg p-3 transition-all duration-700',
              glowSections.has('education')
                ? 'ring-1 ring-blue-400/40 bg-blue-400/5'
                : 'ring-1 ring-transparent',
            )}
          >
            <SectionHeading>Education</SectionHeading>
            <div className="mt-2 space-y-1">
              {resume.education.map((edu, idx) => (
                <div key={idx} className="flex items-baseline justify-between">
                  <div>
                    <span className="font-medium text-white">{edu.degree}</span>
                    {edu.institution && (
                      <span className="text-gray-400"> &bull; {edu.institution}</span>
                    )}
                  </div>
                  {edu.year && <span className="text-xs text-gray-500">{edu.year}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {footerText && (
        <p className="mt-3 text-center text-xs text-[var(--text-soft)] italic">{footerText}</p>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
      {children}
    </h3>
  );
}
