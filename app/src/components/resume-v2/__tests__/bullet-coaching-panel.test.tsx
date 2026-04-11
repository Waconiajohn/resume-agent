// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/react';

import { BulletCoachingPanel } from '../cards/BulletCoachingPanel';
import type { GapChatContext } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';

beforeEach(() => cleanup());
afterEach(() => cleanup());

function makeGapChat(): GapChatHook {
  return {
    getItemState: vi.fn(() => ({ isLoading: false })),
    sendMessage: vi.fn(() => Promise.resolve()),
    resolveLanguage: vi.fn(),
    clearResolution: vi.fn(),
    hydrate: vi.fn(),
    reset: vi.fn(),
    acceptLanguage: vi.fn(),
    clearResolvedLanguage: vi.fn(),
    getSnapshot: vi.fn(),
    hydrateSnapshot: vi.fn(),
    resetChat: vi.fn(),
    resolvedCount: 0,
    isAnyLoading: false,
  } as unknown as GapChatHook;
}

function makeChatContext(overrides: Partial<GapChatContext> = {}): GapChatContext {
  return {
    evidence: [],
    currentStrategy: undefined,
    aiReasoning: undefined,
    inferredMetric: undefined,
    coachingPolicy: undefined,
    jobDescriptionExcerpt: 'Own KPI development, scorecards, and operating rhythm.',
    candidateExperienceSummary: 'Led a 45-person engineering organization across multiple launches.',
    alternativeBullets: [],
    primaryRequirement: 'Product delivery',
    requirementSource: 'job_description',
    sourceEvidence: 'Own KPI development, scorecards, and operating rhythm.',
    lineText: 'Seasoned engineering leader driving outcomes at scale.',
    lineKind: 'summary',
    sectionKey: 'executive_summary',
    sectionLabel: 'Executive Summary',
    relatedRequirements: ['Product delivery', 'Executive leadership'],
    coachingGoal: 'Rewrite this line.',
    clarifyingQuestions: ['What scale or business outcome makes this more concrete?'],
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof BulletCoachingPanel>[0]> = {}) {
  const defaults: Parameters<typeof BulletCoachingPanel>[0] = {
    bulletText: 'Built and tracked performance metrics.',
    section: 'professional_experience',
    bulletIndex: 0,
    requirements: ['Develop and track performance metrics'],
    reviewState: 'strengthen',
    requirementSource: 'job_description',
    evidenceFound: 'Built weekly KPI reviews.',
    gapChat: makeGapChat(),
    chatContext: makeChatContext({
      lineKind: 'bullet',
      sectionKey: 'professional_experience',
      sectionLabel: 'Professional Experience',
    }),
    onApplyToResume: vi.fn(),
    onRemoveBullet: vi.fn(),
    onClose: vi.fn(),
    onBulletEnhance: vi.fn(async () => null),
    sectionType: 'experience_bullet',
  };
  return render(<BulletCoachingPanel {...defaults} {...props} />);
}

// Helper: get angle buttons from a panel (those with blue bg that are not in "try another" section)
function getAngleButtons(container: HTMLElement) {
  const suggestionArea = container.querySelector('.space-y-3');
  if (!suggestionArea) return [];
  const btns = Array.from(suggestionArea.querySelectorAll('button[class*="bg-blue-600"]'));
  return btns as HTMLButtonElement[];
}

describe('BulletCoachingPanel', () => {
  it('renders section name and bullet text', () => {
    const { container } = renderPanel({
      bulletText: 'Seasoned engineering leader driving outcomes at scale.',
      section: 'executive_summary',
      chatContext: makeChatContext({ sectionLabel: 'Executive Summary' }),
      canRemove: false,
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    expect(panel.textContent).toContain('Executive Summary');
    expect(panel.textContent).toContain('Seasoned engineering leader driving outcomes at scale.');
  });

  it('shows angle selection and Edit Myself / Skip in the default state', () => {
    const { container } = renderPanel();
    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    const p = within(panel as HTMLElement);

    expect(p.getByText(/how should we strengthen this/i)).toBeInTheDocument();
    expect(p.getByRole('button', { name: /edit myself/i })).toBeInTheDocument();
    expect(p.getByRole('button', { name: /^skip$/i })).toBeInTheDocument();
  });

  it('calls onBulletEnhance when an angle button is clicked', async () => {
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => null);
    const { container } = renderPanel({ onBulletEnhance: enhanceFn });

    const angleButtons = getAngleButtons(container);
    expect(angleButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    expect(enhanceFn).toHaveBeenCalledWith(
      expect.any(String),
      'Built and tracked performance metrics.',
      'Develop and track performance metrics',
      'Built weekly KPI reviews.',
      expect.any(Object),
    );
  });

  it('shows shimmer while enhancing', async () => {
    // Never resolves during this test
    const enhanceFn = vi.fn(() => new Promise<EnhanceResult | null>(() => {}));
    const { container } = renderPanel({ onBulletEnhance: enhanceFn });

    const angleButtons = getAngleButtons(container);
    // Start the enhance (don't await — we want to check mid-flight state)
    act(() => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    // Shimmer: animate-pulse div present
    expect(panel.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows Use This / Edit / Skip after AI result is returned', async () => {
    const mockResult: EnhanceResult = {
      enhancedBullet: 'Built weekly KPI reviews across 3 plants, improving throughput by 12%.',
      alternatives: [],
    };
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => mockResult);
    const { container } = renderPanel({ onBulletEnhance: enhanceFn });

    const angleButtons = getAngleButtons(container);
    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    await waitFor(() => {
      expect(panel.textContent).toContain(
        'Built weekly KPI reviews across 3 plants, improving throughput by 12%.',
      );
    });

    const p = within(panel as HTMLElement);
    expect(p.getByRole('button', { name: /use this/i })).toBeInTheDocument();
    expect(Array.from(panel.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Edit')).toBe(true);
    expect(Array.from(panel.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Skip')).toBe(true);
  });

  it('calls onApplyToResume with enhanced text when Use This is clicked', async () => {
    const mockResult: EnhanceResult = {
      enhancedBullet: 'Built weekly KPI reviews across 3 plants, improving throughput by 12%.',
      alternatives: [],
    };
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => mockResult);
    const onApplyToResume = vi.fn();
    const onClose = vi.fn();
    const { container } = renderPanel({ onBulletEnhance: enhanceFn, onApplyToResume, onClose });

    const angleButtons = getAngleButtons(container);
    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    await waitFor(() => {
      expect(panel.textContent).toContain(
        'Built weekly KPI reviews across 3 plants, improving throughput by 12%.',
      );
    });

    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: /use this/i }));

    expect(onApplyToResume).toHaveBeenCalledWith(
      'professional_experience',
      0,
      'Built weekly KPI reviews across 3 plants, improving throughput by 12%.',
      expect.objectContaining({ reviewState: 'strengthen' }),
    );
    // onClose is NOT called — the parent (handleCoachApplyToResume) handles advancing
  });

  it('shows alternative angle buttons when result has alternatives', async () => {
    const mockResult: EnhanceResult = {
      enhancedBullet: 'Built weekly KPI reviews across 3 plants.',
      alternatives: [
        { angle: 'Metrics', text: 'Drove 12% throughput gain via weekly KPI cadence at 3 plants.' },
        { angle: 'Leadership', text: 'Led cross-plant performance cadence improving safety and throughput.' },
      ],
    };
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => mockResult);
    const { container } = renderPanel({ onBulletEnhance: enhanceFn });

    const angleButtons = getAngleButtons(container);
    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    await waitFor(() => {
      expect(panel.textContent).toContain('Other angles:');
    });

    expect(panel.textContent).toContain('Metrics:');
    expect(panel.textContent).toContain('Leadership:');
  });

  it('clicking an alternative calls onApplyToResume with that text', async () => {
    const mockResult: EnhanceResult = {
      enhancedBullet: 'Built weekly KPI reviews across 3 plants.',
      alternatives: [
        { angle: 'Metrics', text: 'Drove 12% throughput gain via weekly KPI cadence at 3 plants.' },
      ],
    };
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => mockResult);
    const onApplyToResume = vi.fn();
    const onClose = vi.fn();
    const { container } = renderPanel({ onBulletEnhance: enhanceFn, onApplyToResume, onClose });

    const angleButtons = getAngleButtons(container);
    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    await waitFor(() => {
      expect(panel.textContent).toContain('Metrics:');
    });

    // Click the alternative button
    const altBtn = Array.from(panel.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Metrics:'),
    );
    expect(altBtn).toBeTruthy();
    fireEvent.click(altBtn!);

    expect(onApplyToResume).toHaveBeenCalledWith(
      'professional_experience',
      0,
      'Drove 12% throughput gain via weekly KPI cadence at 3 plants.',
      expect.any(Object),
    );
    // onClose is NOT called — the parent handles advancing
  });

  it('calls onClose when Skip is clicked in the default state', () => {
    const onClose = vi.fn();
    const { container } = renderPanel({ onClose });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    const skipBtn = Array.from(panel.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Skip',
    );
    expect(skipBtn).toBeTruthy();
    fireEvent.click(skipBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows remove confirmation flow when canRemove is true', () => {
    const onRemoveBullet = vi.fn();
    const onClose = vi.fn();
    const { container } = renderPanel({ canRemove: true, onRemoveBullet, onClose });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    const removeBtn = panel.querySelector('[aria-label="Remove this line from the resume"]') as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();

    fireEvent.click(removeBtn);

    const confirmBtn = panel.querySelector('[aria-label="Confirm removal of this line"]') as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();

    fireEvent.click(confirmBtn);
    expect(onRemoveBullet).toHaveBeenCalledWith('professional_experience', 0);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render remove button when canRemove is false', () => {
    const { container } = renderPanel({ canRemove: false });
    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    expect(panel.querySelector('[aria-label="Remove this line from the resume"]')).toBeNull();
  });

  it('resets to angle selection state when bullet changes', async () => {
    const mockResult: EnhanceResult = {
      enhancedBullet: 'Enhanced version.',
      alternatives: [],
    };
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => mockResult);

    const { container, rerender } = renderPanel({ onBulletEnhance: enhanceFn });

    const angleButtons = getAngleButtons(container);
    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    await waitFor(() => {
      expect(panel.textContent).toContain('Enhanced version.');
    });

    // Rerender with different bullet — should reset
    const newProps: Parameters<typeof BulletCoachingPanel>[0] = {
      bulletText: 'Second bullet.',
      section: 'professional_experience',
      bulletIndex: 1,
      requirements: ['Requirement B'],
      reviewState: 'strengthen',
      requirementSource: 'job_description',
      evidenceFound: '',
      gapChat: makeGapChat(),
      chatContext: makeChatContext({ sectionLabel: 'Professional Experience' }),
      onApplyToResume: vi.fn(),
      onRemoveBullet: vi.fn(),
      onClose: vi.fn(),
      onBulletEnhance: enhanceFn,
      sectionType: 'experience_bullet',
    };

    rerender(<BulletCoachingPanel {...newProps} />);

    expect(panel.textContent).toContain('How should we strengthen this?');
    expect(panel.textContent).not.toContain('Enhanced version.');
  });

  it('shows Try a different angle toggle when result exists', async () => {
    const mockResult: EnhanceResult = {
      enhancedBullet: 'Enhanced version.',
      alternatives: [],
    };
    const enhanceFn = vi.fn(async (): Promise<EnhanceResult | null> => mockResult);
    const { container } = renderPanel({ onBulletEnhance: enhanceFn });

    const angleButtons = getAngleButtons(container);
    await act(async () => {
      fireEvent.click(angleButtons[0]);
    });

    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    await waitFor(() => {
      expect(panel.textContent).toContain('Enhanced version.');
    });

    expect(panel.textContent).toContain('Try a different angle');
  });
});
