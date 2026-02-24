// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { WorkbenchSuggestions } from '../components/panels/workbench/WorkbenchSuggestions';
import type { SectionSuggestion } from '../types/panels';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeSuggestion(overrides?: Partial<SectionSuggestion>): SectionSuggestion {
  return {
    id: 'gap_test123',
    intent: 'address_requirement',
    question_text: 'The JD requires cloud architecture. Address it?',
    context: 'Key requirement from JD',
    target_id: 'cloud architecture',
    options: [
      { id: 'apply', label: 'Yes, address it', action: 'apply' },
      { id: 'skip', label: 'Skip', action: 'skip' },
    ],
    priority: 9,
    priority_tier: 'high',
    resolved_when: {
      type: 'requirement_addressed',
      target_id: 'cloud architecture',
    },
    ...overrides,
  };
}

const noop = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkbenchSuggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // 1. One-at-a-time: renders first suggestion question text
  it('renders first suggestion question text', () => {
    render(
      <WorkbenchSuggestions
        suggestions={[makeSuggestion()]}
        content=""
        onApplySuggestion={noop}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );
    expect(
      screen.getByText('The JD requires cloud architecture. Address it?'),
    ).toBeInTheDocument();
  });

  // 2. Apply advances to the next suggestion
  it('Apply button calls onApplySuggestion and advances to next suggestion', () => {
    const onApply = vi.fn();
    render(
      <WorkbenchSuggestions
        suggestions={[
          makeSuggestion({ id: 'first', question_text: 'First question?' }),
          makeSuggestion({ id: 'second', question_text: 'Second question?' }),
        ]}
        content=""
        onApplySuggestion={onApply}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );

    // Only the first suggestion is shown
    expect(screen.getByText('First question?')).toBeInTheDocument();
    expect(screen.queryByText('Second question?')).not.toBeInTheDocument();

    // Click the apply button (label comes from options[0].label)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, address it' }));
    expect(onApply).toHaveBeenCalledWith('first');

    // Advance the 200ms animation timer that triggers advance()
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByText('Second question?')).toBeInTheDocument();
    expect(screen.queryByText('First question?')).not.toBeInTheDocument();
  });

  // 3. Skip advances to next suggestion for low-priority (no reason UI shown)
  it('Skip button advances to next suggestion for low-priority suggestion', () => {
    const onSkip = vi.fn();
    render(
      <WorkbenchSuggestions
        suggestions={[
          makeSuggestion({ id: 'first', question_text: 'First?', priority_tier: 'low', intent: 'tighten' }),
          makeSuggestion({ id: 'second', question_text: 'Second?' }),
        ]}
        content=""
        onApplySuggestion={noop}
        onSkipSuggestion={onSkip}
        disabled={false}
      />,
    );

    expect(screen.getByText('First?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledWith('first', undefined);

    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByText('Second?')).toBeInTheDocument();
    expect(screen.queryByText('First?')).not.toBeInTheDocument();
  });

  // 4. High-priority gap skip shows reason input UI
  it('Skip on high-priority gap shows reason UI instead of advancing', () => {
    render(
      <WorkbenchSuggestions
        suggestions={[
          makeSuggestion({ priority_tier: 'high', intent: 'address_requirement' }),
        ]}
        content=""
        onApplySuggestion={noop}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    // Reason UI replaces action buttons
    expect(screen.getByText('Why are you skipping this?')).toBeInTheDocument();
    expect(screen.getByText('Not applicable to my experience')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Or type a reason...')).toBeInTheDocument();
  });

  // 5. All dismissed → shows "All suggestions addressed"
  it('shows all-addressed state after last suggestion is dismissed via Apply', () => {
    const onApply = vi.fn();
    render(
      <WorkbenchSuggestions
        suggestions={[makeSuggestion({ id: 'only' })]}
        content=""
        onApplySuggestion={onApply}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yes, address it' }));
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByText('All suggestions addressed')).toBeInTheDocument();
  });

  // 6. Client-side resolution: keyword added to content → suggestion auto-resolves
  it('auto-resolves suggestion when matching keyword appears in content', () => {
    const { rerender } = render(
      <WorkbenchSuggestions
        suggestions={[
          makeSuggestion({
            id: 'kw1',
            question_text: 'Add cloud experience?',
            resolved_when: { type: 'keyword_present', target_id: 'cloud' },
          }),
        ]}
        content="I have broad enterprise experience."
        onApplySuggestion={noop}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );

    expect(screen.getByText('Add cloud experience?')).toBeInTheDocument();

    // Rerender with content containing the resolution keyword
    rerender(
      <WorkbenchSuggestions
        suggestions={[
          makeSuggestion({
            id: 'kw1',
            question_text: 'Add cloud experience?',
            resolved_when: { type: 'keyword_present', target_id: 'cloud' },
          }),
        ]}
        content="I led cloud migrations at scale."
        onApplySuggestion={noop}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );

    // The useEffect fires, sets a 400ms timer before dismissing
    act(() => { vi.advanceTimersByTime(400); });

    expect(screen.getByText('All suggestions addressed')).toBeInTheDocument();
  });

  // 7. Empty suggestions array → shows all-addressed fallback immediately
  it('renders all-addressed state when given empty suggestions array', () => {
    render(
      <WorkbenchSuggestions
        suggestions={[]}
        content=""
        onApplySuggestion={noop}
        onSkipSuggestion={noop}
        disabled={false}
      />,
    );
    expect(screen.getByText('All suggestions addressed')).toBeInTheDocument();
  });

  // 8. Disabled state — buttons have disabled attribute; callbacks not fired
  it('disables Apply and Skip buttons when disabled prop is true', () => {
    const onApply = vi.fn();
    const onSkip = vi.fn();
    render(
      <WorkbenchSuggestions
        suggestions={[makeSuggestion({ priority_tier: 'low', intent: 'tighten' })]}
        content=""
        onApplySuggestion={onApply}
        onSkipSuggestion={onSkip}
        disabled={true}
      />,
    );

    const applyBtn = screen.getByRole('button', { name: 'Yes, address it' });
    const skipBtn = screen.getByRole('button', { name: 'Skip' });

    expect(applyBtn).toBeDisabled();
    expect(skipBtn).toBeDisabled();

    fireEvent.click(applyBtn);
    fireEvent.click(skipBtn);

    expect(onApply).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });
});
