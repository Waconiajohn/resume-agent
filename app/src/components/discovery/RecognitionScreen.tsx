import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { LiveResume } from './LiveResume';
import { cn } from '@/lib/utils';
import type { DiscoveryOutput, LiveResumeState } from '@/types/discovery';

interface RecognitionScreenProps {
  discovery: DiscoveryOutput;
  resume: LiveResumeState;
  onRespond: (response: 'confirmed' | 'corrected') => void;
}

export function RecognitionScreen({ discovery, resume, onRespond }: RecognitionScreenProps) {
  const [visibleParagraphs, setVisibleParagraphs] = useState(0);
  const [showQuestion, setShowQuestion] = useState(false);
  const [showCards, setShowCards] = useState(false);

  const { recognition } = discovery;
  const paragraphs = [recognition.career_thread, recognition.role_fit, recognition.differentiator];

  // Stagger in paragraphs then question then cards
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    paragraphs.forEach((_, idx) => {
      timers.push(
        setTimeout(() => {
          setVisibleParagraphs((prev) => Math.max(prev, idx + 1));
        }, idx * 800 + 300),
      );
    });

    timers.push(
      setTimeout(() => setShowQuestion(true), paragraphs.length * 800 + 600),
      setTimeout(() => setShowCards(true), paragraphs.length * 800 + 1000),
    );

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full gap-0">
      {/* Left — recognition statement */}
      <div className="flex w-[55%] flex-col justify-center overflow-y-auto px-12 py-10">
        <div className="max-w-lg">
          <p className="mb-6 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
            What we found
          </p>

          <div className="space-y-6">
            {paragraphs.map((text, idx) => (
              <p
                key={idx}
                className={cn(
                  'text-xl leading-relaxed text-[var(--text-strong)] transition-all duration-700',
                  idx < visibleParagraphs ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
                )}
                style={{ fontFamily: 'var(--font-display)', transitionDelay: `${idx * 100}ms` }}
              >
                {text}
              </p>
            ))}
          </div>

          {/* Question */}
          <div
            className={cn(
              'mt-10 transition-all duration-700',
              showQuestion ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
            )}
          >
            <p
              className="text-2xl font-semibold text-[var(--text-strong)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Is this true?
            </p>
          </div>

          {/* Response cards */}
          <div
            className={cn(
              'mt-6 flex flex-col gap-3 transition-all duration-700',
              showCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
            )}
          >
            <ResponseCard
              onClick={() => onRespond('confirmed')}
              label="Yes — and there's more you should know"
            />
            <ResponseCard
              onClick={() => onRespond('corrected')}
              label="Not quite — let me help you see it better"
            />
          </div>
        </div>
      </div>

      {/* Right — live resume */}
      <div className="flex w-[45%] flex-col border-l border-[var(--line-soft)] px-8 py-10">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
          Your resume now
        </p>
        <div className="flex-1 overflow-hidden">
          <LiveResume
            resume={resume}
            highlightedSections={[]}
            footerText="This is your resume right now. Watch what it becomes."
          />
        </div>
      </div>
    </div>
  );
}

function ResponseCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <GlassCard
      hover
      className={cn(
        'cursor-pointer px-5 py-4 transition-all duration-200',
        'hover:border-[var(--line-strong)]',
      )}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      aria-label={label}
    >
      <p className="text-sm font-medium text-[var(--text-strong)]">{label}</p>
    </GlassCard>
  );
}
