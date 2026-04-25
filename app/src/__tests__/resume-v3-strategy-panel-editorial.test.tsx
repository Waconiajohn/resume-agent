// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3StrategyPanel } from '@/components/resume-v3/V3StrategyPanel';
import type { V3Strategy } from '@/hooks/useV3Pipeline';

const strategy: V3Strategy = {
  positioningFrame: 'multi-site manufacturing operations',
  targetDisciplinePhrase: 'VP Operations, Manufacturing',
  emphasizedAccomplishments: [
    {
      positionIndex: 0,
      summary: 'Led operations across 3 manufacturing facilities with 420 employees.',
      rationale: 'Proves scope for the multi-site VP Operations target.',
    },
  ],
  objections: [
    {
      objection: 'No SAP certification is listed.',
      rebuttal: 'Use Oracle ERP implementation as adjacent proof and ask about SAP exposure.',
    },
  ],
  positionEmphasis: [
    {
      positionIndex: 0,
      weight: 'primary',
      rationale: 'Most relevant role for the target operations mandate.',
    },
  ],
  evidenceOpportunities: [
    {
      requirement: 'Multi-site manufacturing leadership',
      level: 'reasonable_inference',
      sourceSignal: '3 manufacturing facilities',
      recommendedFraming: 'Frame as multi-site manufacturing operations while keeping 3 facilities visible.',
      risk: 'low',
    },
    {
      requirement: 'SAP experience',
      level: 'adjacent_proof',
      sourceSignal: 'Oracle ERP rollout',
      recommendedFraming: 'Use enterprise ERP implementation exposure; do not claim SAP.',
      discoveryQuestion: 'Have you worked directly with SAP modules, reporting, or integrations?',
      risk: 'medium',
    },
  ],
  editorialAssessment: {
    callbackPower: 84,
    strongestAngle: '3-facility operating scope with measurable employee scale.',
    weakestAngle: 'Named SAP evidence is not present.',
    hiringManagerQuestion: 'Can this candidate standardize operations across all sites?',
    recommendedMove: 'Lead with the 3-facility scope and ask the SAP discovery question.',
  },
};

afterEach(() => {
  cleanup();
});

describe('V3StrategyPanel editorial evidence layer', () => {
  it('renders the strategist read and evidence calls for user review', () => {
    render(<V3StrategyPanel benchmark={null} strategy={strategy} />);

    expect(screen.getByText('Strategist read')).toBeInTheDocument();
    expect(screen.getByText('84/100')).toBeInTheDocument();
    expect(screen.getByText('3-facility operating scope with measurable employee scale.')).toBeInTheDocument();
    expect(screen.getByText('Evidence map (2)')).toBeInTheDocument();
    expect(screen.getByText('Multi-site manufacturing leadership')).toBeInTheDocument();
    expect(screen.getByText('inferred')).toBeInTheDocument();
    expect(screen.getAllByText('SAP experience').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('adjacent').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ask: Have you worked directly with SAP modules, reporting, or integrations?')).toBeInTheDocument();
  });

  it('collects discovery answers and sends them back for a pipeline rerun', async () => {
    const user = userEvent.setup();
    const onRunDiscoveryAnswers = vi.fn();

    render(
      <V3StrategyPanel
        benchmark={null}
        strategy={strategy}
        onRunDiscoveryAnswers={onRunDiscoveryAnswers}
      />,
    );

    await user.type(
      screen.getAllByLabelText('Answer for SAP experience')[0],
      'Used SAP MM reports weekly during the 2021 inventory migration.',
    );
    await user.click(screen.getByRole('button', { name: /re-run/i }));

    expect(onRunDiscoveryAnswers).toHaveBeenCalledWith([
      expect.objectContaining({
        requirement: 'SAP experience',
        question: 'Have you worked directly with SAP modules, reporting, or integrations?',
        answer: 'Used SAP MM reports weekly during the 2021 inventory migration.',
        level: 'adjacent_proof',
        risk: 'medium',
        sourceSignal: 'Oracle ERP rollout',
        recommendedFraming: 'Use enterprise ERP implementation exposure; do not claim SAP.',
      }),
    ]);
  });
});
