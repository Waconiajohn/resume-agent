/**
 * OnboardingTour — Guided first-visit walkthrough using react-joyride.
 *
 * Targets: 55+ executives who may be unfamiliar with complex web applications.
 * Approach: 8 steps covering the major workspace rooms, theme toggle, and help button.
 *
 * Persistence: localStorage key `careeriq_tour_completed` gates auto-start.
 * Replay: exposed via `onReplay` callback and triggered by the Header Help button.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Joyride, type EventData, STATUS } from 'react-joyride';

const TOUR_COMPLETED_KEY = 'careeriq_tour_completed';

/** Returns true when the viewport is narrow enough that the sidebar is replaced by the mobile bottom nav. */
function isMobileViewport(): boolean {
  return window.innerWidth < 768;
}

function loadTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveTourCompleted() {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  } catch {
    // ignore localStorage errors
  }
}

// ─── Tour steps ──────────────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    target: 'body',
    placement: 'center' as const,
    title: 'Welcome to CareerIQ',
    content: (
      <p>
        Let&apos;s take a quick 30-second look at the workspace. You can skip
        this at any time and jump straight in.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-career-profile"]',
    placement: 'right' as const,
    title: 'Career Profile — Start Here',
    content: (
      <p>
        Your Career Profile is the foundation. It captures your background,
        strengths, and goals. Every other tool in the workspace uses this
        information to personalise its output for you.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-resume"]',
    placement: 'right' as const,
    title: 'Resume Builder',
    content: (
      <p>
        Once your profile is set, paste in any job description and the Resume
        Builder creates a role-specific, ATS-optimised resume positioned specifically
        for that role.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-linkedin"]',
    placement: 'right' as const,
    title: 'LinkedIn',
    content: (
      <p>
        Optimise your LinkedIn profile and generate thought leadership content
        grounded in your real experience — not generic templates.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-jobs"]',
    placement: 'right' as const,
    title: 'Job Search',
    content: (
      <p>
        Search multiple job boards at once, track every application in a
        pipeline, and surface opportunities through your professional network.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-interview"]',
    placement: 'right' as const,
    title: 'Interview Prep',
    content: (
      <p>
        Get deep company research, practice questions tailored to the role, a
        full interview strategy, and post-interview follow-up tools — all in one
        place.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: '[data-tour="theme-toggle"]',
    placement: 'bottom' as const,
    title: 'Light or Dark Mode',
    content: (
      <p>
        Switch between light and dark mode at any time for comfortable reading,
        whatever your environment.
      </p>
    ),
    disableBeacon: true,
  },
  {
    target: 'body',
    placement: 'center' as const,
    title: "You're all set",
    content: (
      <p>
        Start with your <strong>Career Profile</strong> — everything else builds
        from there. You can replay this tour at any time using the{' '}
        <strong>Help</strong> button in the top bar.
      </p>
    ),
    disableBeacon: true,
  },
];

// ─── Custom tooltip ───────────────────────────────────────────────────────────

type TooltipProps = {
  continuous: boolean;
  index: number;
  isLastStep: boolean;
  size: number;
  step: {
    title?: React.ReactNode;
    content: React.ReactNode;
  };
  backProps: React.HTMLAttributes<HTMLButtonElement> & { 'data-action': string };
  primaryProps: React.HTMLAttributes<HTMLButtonElement> & { 'data-action': string };
  skipProps: React.HTMLAttributes<HTMLButtonElement> & { 'data-action': string };
  tooltipProps: React.HTMLAttributes<HTMLDivElement>;
};

function TourTooltip({
  continuous,
  index,
  isLastStep,
  size,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipProps) {
  const showBack = index > 0;
  const isCenter = index === 0 || isLastStep;

  return (
    <div
      {...tooltipProps}
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--line-strong)',
        borderRadius: '18px',
        boxShadow: '0 28px 80px -24px rgba(0,0,0,0.72)',
        maxWidth: isCenter ? '420px' : '340px',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      {step.title && (
        <div
          style={{
            borderBottom: '1px solid var(--line-soft)',
            padding: '20px 24px 16px',
          }}
        >
          <p
            style={{
              color: 'var(--text-strong)',
              fontSize: '17px',
              fontWeight: 600,
              lineHeight: 1.3,
              margin: 0,
              letterSpacing: '0.01em',
            }}
          >
            {step.title}
          </p>
        </div>
      )}

      {/* Body */}
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: '15px',
          lineHeight: 1.65,
          padding: '16px 24px',
        }}
      >
        {step.content}
      </div>

      {/* Footer */}
      <div
        style={{
          alignItems: 'center',
          borderTop: '1px solid var(--line-soft)',
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between',
          padding: '14px 24px',
        }}
      >
        {/* Progress */}
        <span
          style={{
            color: 'var(--text-soft)',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {index + 1} of {size}
        </span>

        <div style={{ alignItems: 'center', display: 'flex', gap: '8px' }}>
          {/* Skip */}
          {!isLastStep && (
            <button
              {...skipProps}
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-soft)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.08em',
                padding: '6px 10px',
                textTransform: 'uppercase',
              }}
            >
              Skip
            </button>
          )}

          {/* Back */}
          {showBack && (
            <button
              {...backProps}
              type="button"
              style={{
                background: 'var(--surface-3)',
                border: '1px solid var(--line-strong)',
                borderRadius: '10px',
                color: 'var(--text-strong)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                minHeight: '38px',
                padding: '6px 16px',
                textTransform: 'uppercase',
              }}
            >
              Back
            </button>
          )}

          {/* Next / Done */}
          {continuous && (
            <button
              {...primaryProps}
              type="button"
              style={{
                background: 'var(--accent-strong)',
                border: '1px solid var(--line-strong)',
                borderRadius: '10px',
                color: 'var(--accent-ink)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                minHeight: '38px',
                padding: '6px 18px',
                textTransform: 'uppercase',
              }}
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  /** Ref callback so the parent can trigger a replay */
  onMountReplay: (replayFn: () => void) => void;
}

/** Sidebar-targeting steps are not reachable on mobile; only keep body/non-nav steps. */
const MOBILE_STEP_INDICES = new Set([0, 6, 7]);

function getStepsForViewport() {
  if (isMobileViewport()) {
    return TOUR_STEPS.filter((_, i) => MOBILE_STEP_INDICES.has(i));
  }
  return TOUR_STEPS;
}

export function OnboardingTour({ onMountReplay }: OnboardingTourProps) {
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState(TOUR_STEPS);
  const startedRef = useRef(false);

  // Auto-start on first visit
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setSteps(getStepsForViewport());
    if (!loadTourCompleted()) {
      // Small delay so the workspace has time to render sidebar targets
      const timer = setTimeout(() => setRun(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Expose replay function to parent (for Header Help button)
  const replay = useCallback(() => {
    setSteps(getStepsForViewport());
    setRun(false);
    requestAnimationFrame(() => setRun(true));
  }, []);

  useEffect(() => {
    onMountReplay(replay);
  }, [onMountReplay, replay]);

  const handleEvent = useCallback((data: EventData) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      saveTourCompleted();
    }
  }, []);

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep={false}
      tooltipComponent={TourTooltip as Parameters<typeof Joyride>[0]['tooltipComponent']}
      onEvent={handleEvent}
      options={{
        overlayColor: 'rgba(0, 0, 0, 0.52)',
        zIndex: 9000,
        spotlightRadius: 6,
        arrowColor: 'var(--surface-elevated, #253040)',
        buttons: ['back', 'primary', 'skip'],
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip',
      }}
    />
  );
}
