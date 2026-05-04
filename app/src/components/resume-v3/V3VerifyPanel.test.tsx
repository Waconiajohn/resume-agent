// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { V3VerifyPanel } from './V3VerifyPanel';

describe('V3VerifyPanel', () => {
  const baseProps = {
    isRunning: false,
    editedWritten: null,
    pristineWritten: null,
    focusCue: null,
    dismissedIssueKeys: new Set<string>(),
    appliedIssueKeys: new Set<string>(),
    onAddress: vi.fn(),
    onDismiss: vi.fn(),
    onUndismiss: vi.fn(),
    onApplyPatch: vi.fn(),
  };

  it('does not call a resume ready to export when discovery questions are still unresolved', () => {
    const onAnswerDiscoveryWarning = vi.fn();
    render(
      <V3VerifyPanel
        {...baseProps}
        verify={{ passed: true, issues: [], translated: [] }}
        discoveryWarning={{ count: 2, highRiskCount: 1 }}
        onAnswerDiscoveryWarning={onAnswerDiscoveryWarning}
      />,
    );

    expect(screen.getByText('Final Check')).toBeInTheDocument();
    expect(screen.getByText('Answer needed in tailoring plan')).toBeInTheDocument();
    expect(screen.getByText(/2 role-specific proof questions still need an answer in the tailoring plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/ready to export/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /answer in tailoring plan/i }));
    expect(onAnswerDiscoveryWarning).toHaveBeenCalledTimes(1);
  });

  it('uses consumer-facing final check actions for visible issues', () => {
    render(
      <V3VerifyPanel
        {...baseProps}
        verify={{
          passed: false,
          issues: [
            {
              severity: 'warning',
              section: 'summary',
              message: 'Raw issue',
            },
          ],
          translated: [
            {
              shouldShow: true,
              severity: 'warning',
              label: 'Summary',
              message: 'The summary could better explain the COO-level operating scope.',
              suggestion: 'Lead with the three-facility scope.',
              suggestedPatches: [
                {
                  target: 'summary',
                  text: 'Multi-site operations executive with COO-level operating scope.',
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('1 item to check')).toBeInTheDocument();
    expect(screen.getByText('Check before export')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use this fix/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep as written/i })).toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });
});
