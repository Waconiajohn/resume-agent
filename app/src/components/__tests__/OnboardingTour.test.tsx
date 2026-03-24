// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { OnboardingTour } from '../OnboardingTour';

// ---------------------------------------------------------------------------
// Mock react-joyride
// React-joyride renders complex portal-based UI that requires a full browser
// environment to work properly. For unit tests we only care that:
//   (a) the component mounts and calls onMountReplay
//   (b) the tour auto-starts (run=true) when the localStorage flag is absent
//   (c) the tour does NOT auto-start when the flag is present
//   (d) completing the tour sets the localStorage flag
// ---------------------------------------------------------------------------

const mockJoyrideFn = vi.fn();

vi.mock('react-joyride', () => {
  const STATUS = { FINISHED: 'finished', SKIPPED: 'skipped' };

  // Capture the onEvent callback so tests can fire tour lifecycle events
  const Joyride = (props: { run: boolean; onEvent?: (data: { status: string }) => void }) => {
    mockJoyrideFn(props);
    return null;
  };

  return { default: Joyride, Joyride, STATUS };
});

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const TOUR_KEY = 'careeriq_tour_completed';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTour(onMountReplay = vi.fn()) {
  return render(<OnboardingTour onMountReplay={onMountReplay} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OnboardingTour', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('does not auto-start the tour when the completed flag is set in localStorage', () => {
    localStorageMock.setItem(TOUR_KEY, 'true');

    renderTour();

    // Advance timers past the 800ms delay used by OnboardingTour
    vi.advanceTimersByTime(1000);

    // Joyride should have been rendered but with run=false
    const lastCall = mockJoyrideFn.mock.calls[mockJoyrideFn.mock.calls.length - 1];
    expect(lastCall[0].run).toBe(false);
  });

  it('auto-starts the tour when the completed flag is NOT set', async () => {
    // localStorage returns null for the key (flag not set)
    const { rerender } = renderTour();

    // Advance past the 800ms delay and flush all pending React updates
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Re-render to pick up the state update triggered by the timer
    rerender(<OnboardingTour onMountReplay={vi.fn()} />);

    const calls = mockJoyrideFn.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0].run).toBe(true);
  });

  it('calls onMountReplay with a function', () => {
    const onMountReplay = vi.fn();
    renderTour(onMountReplay);

    vi.advanceTimersByTime(0);

    expect(onMountReplay).toHaveBeenCalledTimes(1);
    expect(typeof onMountReplay.mock.calls[0][0]).toBe('function');
  });

  it('renders (mounts) without crashing regardless of localStorage state', () => {
    expect(() => renderTour()).not.toThrow();
  });

  it('completing the tour sets the localStorage completed flag', async () => {
    let capturedOnEvent: ((data: { status: string }) => void) | undefined;

    mockJoyrideFn.mockImplementation(
      (props: { run: boolean; onEvent?: (data: { status: string }) => void }) => {
        capturedOnEvent = props.onEvent;
        return null;
      },
    );

    renderTour();

    // Joyride is rendered immediately on mount — onEvent is captured synchronously
    expect(capturedOnEvent).toBeDefined();

    // Simulate joyride finishing inside act so React state updates flush
    await act(async () => {
      capturedOnEvent!({ status: 'finished' });
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(TOUR_KEY, 'true');
  });

  it('skipping the tour also sets the localStorage completed flag', async () => {
    let capturedOnEvent: ((data: { status: string }) => void) | undefined;

    mockJoyrideFn.mockImplementation(
      (props: { run: boolean; onEvent?: (data: { status: string }) => void }) => {
        capturedOnEvent = props.onEvent;
        return null;
      },
    );

    renderTour();

    expect(capturedOnEvent).toBeDefined();

    await act(async () => {
      capturedOnEvent!({ status: 'skipped' });
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(TOUR_KEY, 'true');
  });

  it('the replay function provided to onMountReplay can be called without error', async () => {
    let replayFn: (() => void) | undefined;
    const onMountReplay = vi.fn((fn: () => void) => {
      replayFn = fn;
    });

    renderTour(onMountReplay);
    vi.advanceTimersByTime(0);

    expect(replayFn).toBeDefined();
    expect(() => replayFn!()).not.toThrow();
  });
});
