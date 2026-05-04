// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3StrategyPanel } from '@/components/resume-v3/V3StrategyPanel';
import type {
  V3BenchmarkProfile,
  V3Strategy,
  V3StructuredResume,
  V3WrittenResume,
} from '@/hooks/useV3Pipeline';

const benchmark: V3BenchmarkProfile = {
  roleProblemHypothesis: 'Coventry needs an operator who can standardize multi-site manufacturing and speak credibly about financial discipline.',
  idealProfileSummary: 'A strong candidate has multi-site operations scope, financial ownership, and board-ready reporting experience.',
  directMatches: [],
  gapAssessment: [
    {
      gap: 'Board-level reporting is not explicit in the source resume.',
      severity: 'manageable',
      bridgingStrategy: 'Use advisory-board exposure carefully and ask for direct board or PE sponsor reporting before claiming it.',
    },
  ],
  positioningFrame: 'multi-site manufacturing operations',
  hiringManagerObjections: [],
};

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

const structured: V3StructuredResume = {
  contact: {
    fullName: 'David Harrington',
  },
  discipline: 'manufacturing operations leadership',
  positions: [
    {
      title: 'Vice President of Operations',
      company: 'Meridian Industrial Group',
      dates: { start: '2017', end: null, raw: '2017 - Present' },
      scope: '3 manufacturing facilities and 420 employees',
      bullets: [
        {
          text: 'Led operations across 3 manufacturing facilities with 420 employees.',
          is_new: false,
          evidence_found: true,
          confidence: 1,
        },
      ],
      confidence: 1,
    },
  ],
  education: [],
  certifications: [],
  skills: [],
  customSections: [],
  crossRoleHighlights: [],
  careerGaps: [],
  pronoun: null,
};

const written: V3WrittenResume = {
  summary: 'Multi-site manufacturing operations leader who led 3 facilities with 420 employees.',
  selectedAccomplishments: [
    'Led operations across 3 manufacturing facilities with 420 employees.',
  ],
  coreCompetencies: [],
  positions: [
    {
      positionIndex: 0,
      title: 'Vice President of Operations',
      company: 'Meridian Industrial Group',
      dates: { start: '2017', end: null, raw: '2017 - Present' },
      scope: '3 manufacturing facilities and 420 employees',
      bullets: [
        {
          text: 'Led operations across 3 manufacturing facilities with 420 employees.',
          is_new: true,
          source: 'bullets[0]',
          evidence_found: true,
          confidence: 1,
        },
      ],
    },
  ],
  customSections: [],
};

afterEach(() => {
  cleanup();
});

describe('V3StrategyPanel editorial evidence layer', () => {
  it('translates strategy into consumer-facing rewrite receipts', () => {
    render(
      <V3StrategyPanel
        benchmark={benchmark}
        strategy={strategy}
        structured={structured}
        written={written}
      />,
    );

    expect(screen.getByText('Why we wrote this resume this way')).toBeInTheDocument();
    expect(screen.getByText('What this job is asking for')).toBeInTheDocument();
    expect(screen.getByText('What we changed in your resume')).toBeInTheDocument();
    expect(screen.getByText(/3-facility operating scope with measurable employee scale/i)).toBeInTheDocument();
    expect(screen.getByText(/look for it in: summary, selected accomplishments, meridian industrial group - vice president of operations/i)).toBeInTheDocument();
    expect(screen.getByText('Questions that could make this stronger')).toBeInTheDocument();
    expect(screen.getByText('What we handled carefully')).toBeInTheDocument();
    expect(screen.getByText('Proof we found')).toBeInTheDocument();
    expect(screen.getByText('Multi-site manufacturing leadership')).toBeInTheDocument();
    expect(screen.getAllByText('SAP experience').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Strategist read')).not.toBeInTheDocument();
    expect(screen.queryByText('Evidence map (2)')).not.toBeInTheDocument();
    expect(screen.queryByText('Position weight')).not.toBeInTheDocument();
  });

  it('collects pick-list discovery answers and sends them back for a resume rebuild', async () => {
    const user = userEvent.setup();
    const onRunDiscoveryAnswers = vi.fn();

    render(
      <V3StrategyPanel
        benchmark={null}
        strategy={strategy}
        onRunDiscoveryAnswers={onRunDiscoveryAnswers}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Worked with a similar system' }));
    await user.type(
      screen.getByLabelText('Add detail for SAP experience'),
      'Used SAP MM reports weekly during the 2021 inventory migration.',
    );
    await user.click(screen.getByRole('button', { name: /rebuild resume with my answers/i }));

    expect(onRunDiscoveryAnswers).toHaveBeenCalledWith([
      expect.objectContaining({
        requirement: 'SAP experience',
        question: 'Have you worked directly with SAP modules, reporting, or integrations?',
        answer: 'Worked with a similar system - Used SAP MM reports weekly during the 2021 inventory migration.',
        level: 'adjacent_proof',
        risk: 'medium',
        sourceSignal: 'Oracle ERP rollout',
        recommendedFraming: 'Use enterprise ERP implementation exposure; do not claim SAP.',
      }),
    ]);
  });
});
