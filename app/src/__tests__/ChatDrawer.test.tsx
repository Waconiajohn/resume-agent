// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChatDrawer } from '../components/ChatDrawer';
import type { ChatMessage as ChatMessageType } from '@/types/session';

// jsdom doesn't implement scrollTo — stub it to avoid errors from ChatPanel internals
beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

// Minimal props factory
function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    messages: [] as ChatMessageType[],
    streamingText: '',
    tools: [],
    askPrompt: null,
    phaseGate: null,
    currentPhase: 'onboarding',
    isProcessing: false,
    connected: true,
    onSendMessage: () => {},
    panelType: null,
    panelData: null,
    resume: null,
    ...overrides,
  };
}

describe('ChatDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders collapsed by default with open button visible', () => {
    render(<ChatDrawer {...makeProps()} />);
    const openBtn = screen.getByRole('button', { name: /open coach/i });
    expect(openBtn).toBeTruthy();
    // Close button should not be present when collapsed
    expect(screen.queryByRole('button', { name: /close coach/i })).toBeNull();
  });

  it('expands when open button is clicked', () => {
    render(<ChatDrawer {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /open coach/i }));
    // Close button appears when expanded
    expect(screen.getByRole('button', { name: /close coach/i })).toBeTruthy();
  });

  it('collapses when close button is clicked', () => {
    render(<ChatDrawer {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /open coach/i }));
    fireEvent.click(screen.getByRole('button', { name: /close coach/i }));
    // Back to collapsed — open button reappears
    expect(screen.getByRole('button', { name: /open coach/i })).toBeTruthy();
  });

  it('auto-expands when streamingText transitions from empty to non-empty', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    expect(screen.queryByRole('button', { name: /close coach/i })).toBeNull();

    rerender(<ChatDrawer {...makeProps({ streamingText: 'Hello' })} />);
    expect(screen.getByRole('button', { name: /close coach/i })).toBeTruthy();
  });

  it('auto-expands when phaseGate transitions from null to non-null', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    expect(screen.queryByRole('button', { name: /close coach/i })).toBeNull();

    const gate = { toolCallId: 'test', currentPhase: 'intake', nextPhase: 'research', phaseSummary: 'Done', nextPhasePreview: 'Next' };
    rerender(<ChatDrawer {...makeProps({ phaseGate: gate })} />);
    expect(screen.getByRole('button', { name: /close coach/i })).toBeTruthy();
  });

  it('auto-expands when messages.length increases', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    expect(screen.queryByRole('button', { name: /close coach/i })).toBeNull();

    const msg: ChatMessageType = { id: '1', role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() };
    rerender(<ChatDrawer {...makeProps({ messages: [msg] })} />);
    expect(screen.getByRole('button', { name: /close coach/i })).toBeTruthy();
  });

  it('does not auto-collapse after triggers clear', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);

    // Trigger auto-expand
    rerender(<ChatDrawer {...makeProps({ streamingText: 'Working...' })} />);
    expect(screen.getByRole('button', { name: /close coach/i })).toBeTruthy();

    // Clear the trigger — should stay expanded
    rerender(<ChatDrawer {...makeProps({ streamingText: '' })} />);
    expect(screen.getByRole('button', { name: /close coach/i })).toBeTruthy();
  });

  it('shows status label in open button aria-label', () => {
    render(<ChatDrawer {...makeProps({ isProcessing: true })} />);
    const openBtn = screen.getByRole('button', { name: /open coach/i });
    expect(openBtn.getAttribute('aria-label')).toContain('Working');
  });

  it('shows status label in expanded header', () => {
    render(<ChatDrawer {...makeProps({ isProcessing: true })} />);
    fireEvent.click(screen.getByRole('button', { name: /open coach/i }));
    // Status label appears in the header bar
    const labels = screen.getAllByText('Working');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});
