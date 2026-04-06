import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LiveResumeState, ResumeUpdate } from '@/types/discovery';

interface LiveResumeProps {
  resume: LiveResumeState;
  highlightedSections: string[];
  pendingUpdates?: ResumeUpdate[];
  footerText?: string;
}

export function LiveResume({ resume, highlightedSections, footerText }: LiveResumeProps) {
  const [glowSections, setGlowSections] = useState<Set<string>>(new Set());
  const glowTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (highlightedSections.length === 0) return;

    setGlowSections(new Set(highlightedSections));

    const timer = setTimeout(() => {
      setGlowSections(new Set());
    }, 2500);

    glowTimerRef.current.push(timer);
    return () => clearTimeout(timer);
  }, [highlightedSections]);

  useEffect(() => {
    return () => {
      glowTimerRef.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex-1 overflow-y-auto rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-3)] p-6 text-[var(--text-strong)]"
        style={{ fontSize: '0.82rem', lineHeight: '1.6' }}
      >
        {/* Header */}
        <div className="mb-5 border-b border-[var(--line-soft)] pb-4">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">
            {resume.name || 'Your Name'}
          </h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
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
            <p className="mt-1 text-[var(--text-muted)]">{resume.summary}</p>
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
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[var(--text-strong)]">{exp.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">{exp.company}</p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--text-soft)]">{exp.dates}</span>
                  </div>
                  {exp.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {exp.bullets.map((bullet) => (
                        <li
                          key={bullet.id}
                          className={cn(
                            'pl-3 relative text-[var(--text-muted)] transition-all duration-500',
                            'before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-[var(--text-soft)]',
                            bullet.highlighted && 'text-[var(--text-strong)] ring-1 ring-blue-400/30 rounded bg-blue-400/5 px-2',
                            bullet.strengthened && 'font-medium',
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
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]"
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
                    <span className="font-medium text-[var(--text-strong)]">{edu.degree}</span>
                    <span className="text-[var(--text-muted)]"> &bull; {edu.institution}</span>
                  </div>
                  {edu.year && <span className="text-xs text-[var(--text-soft)]">{edu.year}</span>}
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
    <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-[var(--text-soft)]">
      {children}
    </h3>
  );
}
