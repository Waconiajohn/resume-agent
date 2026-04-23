import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CareerProfileV2 } from '@/types/career-profile';

interface ProfileRevealProps {
  profile: CareerProfileV2;
  masterResumeCreated?: boolean | null;
  masterResumeRecovered?: boolean;
  onRetryMasterResume?: () => void;
  retryingMasterResume?: boolean;
}

const STAGGER_DELAYS = [0, 200, 400, 600];

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

export function ProfileReveal({
  profile,
  masterResumeCreated = null,
  masterResumeRecovered = false,
  onRetryMasterResume,
  retryingMasterResume = false,
}: ProfileRevealProps) {
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
          {masterResumeRecovered && masterResumeCreated && (
            <div
              className="mb-8 rounded-2xl border px-5 py-4"
              style={{
                background: 'var(--surface-1)',
                borderColor: 'var(--badge-green-text)',
              }}
            >
              <p className="text-sm font-medium text-[var(--text-strong)] mb-1">
                Your Career Record is ready now.
              </p>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                The retry worked, and future Resume Builder runs will use this profile and Career Record together.
              </p>
            </div>
          )}
          {masterResumeCreated === false && onRetryMasterResume && (
            <div
              className="mb-8 rounded-2xl border px-5 py-4"
              style={{
                background: 'var(--surface-1)',
                borderColor: 'var(--line-soft)',
              }}
            >
              <p className="text-sm font-medium text-[var(--text-strong)] mb-1">
                Your profile is saved, but your first Career Record still needs one more step.
              </p>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-3">
                We kept your setup data so you can retry the Career Record creation now without losing anything.
              </p>
              <button
                type="button"
                onClick={onRetryMasterResume}
                disabled={retryingMasterResume}
                className="rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
                style={{
                  background: retryingMasterResume ? 'var(--surface-1)' : 'var(--link)',
                  color: retryingMasterResume ? 'var(--text-muted)' : 'var(--bg-0)',
                }}
              >
                {retryingMasterResume ? 'Retrying Career Record creation...' : 'Retry creating my Career Record'}
              </button>
            </div>
          )}
        </FadeInSection>

        {/* Section 1: Positioning Statement (was Career Thread) */}
        <FadeInSection delayMs={STAGGER_DELAYS[1] ?? 200}>
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              Career Thread
            </p>
            <p
              className="text-xl font-light leading-relaxed text-[var(--text-strong)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {profile.positioning.positioning_statement}
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
              {profile.positioning.core_strengths.map((strength, i) => (
                <div
                  key={i}
                  className="rounded-xl px-5 py-4"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--line-soft)',
                  }}
                >
                  <p className="text-sm font-medium text-[var(--text-strong)]">
                    {strength}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </FadeInSection>

        {/* Positioning Statement */}
        <FadeInSection delayMs={STAGGER_DELAYS[3] ?? 600}>
          <div className="mb-16">
            <p className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
              Positioning Statement
            </p>
            <p
              className="text-xl font-light leading-relaxed text-[var(--text-strong)] mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {profile.narrative.known_for_what}
            </p>
            {profile.narrative.colleagues_came_for_what && (
              <p className="text-sm leading-relaxed text-[var(--text-soft)]">
                {profile.narrative.colleagues_came_for_what}
              </p>
            )}
          </div>

          {/* Path-forward buttons */}
          <div className="mt-16 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/workspace')}
              className="w-full py-4 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
              style={{ background: 'var(--link)', color: 'var(--bg-0)' }}
            >
              Go to Workspace →
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
