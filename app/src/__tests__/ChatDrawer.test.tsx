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

  it('renders collapsed by default with toggle bar visible', () => {
    render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands when toggle is clicked', () => {
    render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses when toggle is clicked again', () => {
    render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    fireEvent.click(toggle); // expand
    fireEvent.click(toggle); // collapse
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('auto-expands when streamingText transitions from empty to non-empty', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    rerender(<ChatDrawer {...makeProps({ streamingText: 'Hello' })} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('auto-expands when phaseGate transitions from null to non-null', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    const gate = { toolCallId: 'test', currentPhase: 'intake', nextPhase: 'research', phaseSummary: 'Done', nextPhasePreview: 'Next' };
    rerender(<ChatDrawer {...makeProps({ phaseGate: gate })} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('auto-expands when messages.length increases', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    const msg: ChatMessageType = { id: '1', role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() };
    rerender(<ChatDrawer {...makeProps({ messages: [msg] })} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not auto-collapse after triggers clear', () => {
    const { rerender } = render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });

    // Trigger auto-expand
    rerender(<ChatDrawer {...makeProps({ streamingText: 'Working...' })} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    // Clear the trigger
    rerender(<ChatDrawer {...makeProps({ streamingText: '' })} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows status label based on runtime state', () => {
    render(<ChatDrawer {...makeProps({ isProcessing: true })} />);
    // The toggle bar contains "Coach" and the status label
    const toggle = screen.getByRole('button', { name: /coach/i });
    expect(toggle.textContent).toContain('Working');
  });

  it('aria-expanded reflects current state', () => {
    render(<ChatDrawer {...makeProps()} />);
    const toggle = screen.getByRole('button', { name: /coach/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
