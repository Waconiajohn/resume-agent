import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CareerIQProfileFull } from '@/types/profile-setup';

interface ProfileRevealProps {
  profile: CareerIQProfileFull;
}

const STAGGER_DELAYS = [0, 200, 400, 600, 800, 1000, 1200];

interface FadeInSectionProps {
  children: React.ReactNode;
  delayMs: number;
}

function FadeInSection({ children, delayMs }: FadeInSectionProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      {children}
    </div>
  );
}

export function ProfileReveal({ profile }: ProfileRevealProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-2xl">
        <FadeInSection delayMs={STAGGER_DELAYS[0] ?? 0}>
          <h1
            className="text-3xl font-light text-[var(--text-strong)] mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Your CareerIQ Profile
          </h1>
          <p className="text-sm text-[var(--text-muted)] mb-2">
            Built from your career history and your interview.
            This is who you are — in language that lands.
          </p>
          <p className="text-sm text-[var(--text-soft)] mt-1 mb-12">
            This profile is the foundation. Every resume you build from here will use it.
          </p>
        </FadeInSection>

        {/* Section 1: Career Thread */}
        <FadeInSection delayMs={STAGGER_DELAYS[1] ?? 200}>
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              Career Thread
            </p>
            <p
              className="text-xl font-light leading-relaxed text-[var(--text-strong)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {profile.career_thread}
            </p>
          </div>
        </FadeInSection>

        {/* Section 2: Where You Are Exceptional */}
        <FadeInSection delayMs={STAGGER_DELAYS[2] ?? 400}>
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              Where You Are Exceptional
            </p>
            <div className="space-y-3">
              {profile.top_capabilities.map((cap, i) => (
                <div
                  key={i}
                  className="rounded-xl px-5 py-4"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--line-soft)',
                  }}
                >
                  <p className="text-sm font-medium text-[var(--text-strong)] mb-1">
                    {cap.capability}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {cap.evidence}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </FadeInSection>

        {/* Section 3: Signature Story */}
        <FadeInSection delayMs={STAGGER_DELAYS[3] ?? 600}>
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              Signature Story
            </p>
            <div className="space-y-4">
              {[
                { label: 'The situation', text: profile.signature_story.situation },
                { label: 'What you were asked to do', text: profile.signature_story.task },
                { label: 'How you did it', text: profile.signature_story.action },
                { label: 'What happened', text: profile.signature_story.result },
                { label: 'What it says about you', text: profile.signature_story.reflection },
              ].map(({ label, text }) => (
                <div key={label}>
                  <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                  <p className="text-sm leading-relaxed text-[var(--text-strong)]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeInSection>

        {/* Section 4: Honest Answer */}
        <FadeInSection delayMs={STAGGER_DELAYS[4] ?? 800}>
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              The Honest Answer
            </p>
            <div className="rounded-xl px-5 py-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--line-soft)' }}>
              <p className="text-xs text-[var(--text-muted)] mb-2">{profile.honest_answer.concern}</p>
              <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                {profile.honest_answer.response}
              </p>
            </div>
          </div>
        </FadeInSection>

        {/* Section 5: Righteous Close */}
        <FadeInSection delayMs={STAGGER_DELAYS[5] ?? 1000}>
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              How You Close
            </p>
            <p className="text-sm leading-relaxed text-[var(--text-strong)]">
              {profile.righteous_close}
            </p>
          </div>
        </FadeInSection>

        {/* Full Why Me Final */}
        <FadeInSection delayMs={STAGGER_DELAYS[6] ?? 1200}>
          <div className="mb-16">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              Your Why Me
            </p>
            {typeof profile.why_me_final === 'string' ? (
              // Legacy string format
              <p
                className="text-xl font-light leading-relaxed text-[var(--text-strong)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {profile.why_me_final}
              </p>
            ) : (
              <>
                <p
                  className="text-xl font-light leading-relaxed text-[var(--text-strong)] mb-4"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {profile.why_me_final.headline}
                </p>
                {profile.why_me_final.body && (
                  <p className="text-sm leading-relaxed text-[var(--text-soft)]">
                    {profile.why_me_final.body}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Path-forward buttons */}
          <div className="mt-16 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/workspace?room=career-profile')}
              className="w-full py-4 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
              style={{ background: 'var(--link)', color: '#080b10' }}
            >
              Go to Your Profile →
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/workspace?room=jobs')}
                className="flex-1 py-4 rounded-xl text-sm text-[var(--text-strong)] border border-[var(--line-soft)] hover:border-[var(--link)] transition-colors"
              >
                Find jobs that fit this profile →
              </button>
              <button
                type="button"
                onClick={() => navigate('/workspace?room=resume')}
                className="flex-1 py-4 rounded-xl text-sm text-[var(--text-strong)] border border-[var(--line-soft)] hover:border-[var(--link)] transition-colors"
              >
                Analyze a specific job →
              </button>
            </div>
          </div>
        </FadeInSection>
      </div>
    </div>
  );
}
