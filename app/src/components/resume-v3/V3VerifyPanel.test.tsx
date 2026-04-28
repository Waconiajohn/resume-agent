// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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

  it('does not call a resume export-safe when discovery questions are still unresolved', () => {
    render(
      <V3VerifyPanel
        {...baseProps}
        verify={{ passed: true, issues: [], translated: [] }}
        discoveryWarning={{ count: 2, highRiskCount: 1 }}
      />,
    );

    expect(screen.getByText('Discovery still needed')).toBeInTheDocument();
    expect(screen.getByText(/2 role-specific proof questions still need an answer/i)).toBeInTheDocument();
    expect(screen.queryByText(/safe to export/i)).not.toBeInTheDocument();
  });
});
