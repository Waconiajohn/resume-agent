import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const PROCESSING_MESSAGES = [
  'Reading your career history...',
  'Finding the thread that runs through all of it...',
  'Mapping your experience against what they need...',
  'Identifying what you bring that most candidates cannot...',
  'Building the case for why you belong in this room...',
];

const RESUME_SECTIONS = ['Experience', 'Accomplishments', 'Skills', 'Education', 'Leadership'];
const JOB_SECTIONS = ['Must-haves', 'Culture signals', 'Key requirements', 'Team fit'];

interface ProcessingRevealProps {
  resumeText: string;
  jobText: string;
  currentStage?: { stage: string; message: string } | null;
}

export function ProcessingReveal({ resumeText, jobText, currentStage }: ProcessingRevealProps) {
  const [messageIdx, setMessageIdx] = useState(0);
  const [visibleMessage, setVisibleMessage] = useState(true);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [activeJobSectionIdx, setActiveJobSectionIdx] = useState(0);

  // Extract candidate name from first line of resume text
  const candidateName = resumeText.trim().split('\n')[0]?.trim().slice(0, 60) || 'Your Resume';
  const jobFirstLine = jobText.trim().split('\n')[0]?.trim().slice(0, 60) || 'Position';

  // Rotate messages — only runs as fallback when no live stage data
  useEffect(() => {
    if (currentStage) return;
    const interval = setInterval(() => {
      setVisibleMessage(false);
      setTimeout(() => {
        setMessageIdx((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
        setVisibleMessage(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [currentStage]);

  // When stage advances, light up all sections immediately
  useEffect(() => {
    if (!currentStage) return;
    const { stage } = currentStage;
    if (stage === 'benchmark' || stage === 'discovery') {
      setActiveSectionIdx(RESUME_SECTIONS.length - 1);
      setActiveJobSectionIdx(JOB_SECTIONS.length - 1);
    }
  }, [currentStage]);

  // Advance resume sections (fallback timer when no live stage)
  useEffect(() => {
    if (currentStage) return;
    if (activeSectionIdx >= RESUME_SECTIONS.length - 1) return;
    const timer = setTimeout(() => {
      setActiveSectionIdx((prev) => prev + 1);
    }, 1200);
    return () => clearTimeout(timer);
  }, [activeSectionIdx, currentStage]);

  // Advance job sections (fallback timer when no live stage)
  useEffect(() => {
    if (currentStage) return;
    if (activeJobSectionIdx >= JOB_SECTIONS.length - 1) return;
    const timer = setTimeout(() => {
      setActiveJobSectionIdx((prev) => prev + 1);
    }, 1400);
    return () => clearTimeout(timer);
  }, [activeJobSectionIdx, currentStage]);

  // Derive the displayed message
  const displayMessage = currentStage
    ? currentStage.stage === 'discovery'
      ? 'Almost there...'
      : currentStage.message
    : PROCESSING_MESSAGES[messageIdx];

  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-start gap-8">
        {/* Resume column */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
            Your Resume
          </p>
          <p
            className="text-lg font-semibold text-[var(--text-strong)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {candidateName}
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {RESUME_SECTIONS.map((section, idx) => (
              <SectionGlow
                key={section}
                label={section}
                visible={idx <= activeSectionIdx}
                active={idx === activeSectionIdx}
              />
            ))}
          </div>
        </div>

        {/* Center column — rotating message */}
        <div className="flex flex-col items-center gap-6 pt-8">
          <div
            className="h-px w-px rounded-full bg-[var(--link)] shadow-[0_0_32px_12px_rgba(175,196,255,0.25)]"
            aria-hidden="true"
          />
          <div className="w-52 text-center">
            <p
              className={cn(
                'text-sm font-medium leading-relaxed text-[var(--text-muted)] transition-opacity duration-300',
                currentStage || visibleMessage ? 'opacity-100' : 'opacity-0',
              )}
              aria-live="polite"
              aria-atomic="true"
            >
              {displayMessage}
            </p>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-soft)] animate-[dot-bounce_1.4s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        </div>

        {/* Job column */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
            The Job
          </p>
          <p
            className="text-lg font-semibold text-[var(--text-strong)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {jobFirstLine}
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {JOB_SECTIONS.map((section, idx) => (
              <SectionGlow
                key={section}
                label={section}
                visible={idx <= activeJobSectionIdx}
                active={idx === activeJobSectionIdx}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SectionGlowProps {
  label: string;
  visible: boolean;
  active: boolean;
}

function SectionGlow({ label, visible, active }: SectionGlowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 transition-all duration-700',
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-500',
          active ? 'bg-[var(--link)] shadow-[0_0_8px_3px_rgba(175,196,255,0.5)]' : 'bg-[var(--line-strong)]',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'text-sm transition-colors duration-500',
          active ? 'font-semibold text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
        )}
      >
        {label}
      </span>
    </div>
  );
}
