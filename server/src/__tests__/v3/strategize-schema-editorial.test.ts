import { describe, expect, it } from 'vitest';
import { StrategySchema } from '../../v3/strategize/schema.js';

describe('strategize schema — editorial evidence layer', () => {
  it('accepts evidence opportunities and editorial assessment', () => {
    const parsed = StrategySchema.parse({
      positioningFrame: 'multi-site manufacturing operations',
      targetDisciplinePhrase: 'VP Operations, Manufacturing',
      emphasizedAccomplishments: [
        {
          positionIndex: 0,
          summary: 'Led operations across 3 manufacturing facilities with 420 employees.',
          rationale: 'The JD needs multi-site operations leadership.',
        },
      ],
      objections: [
        {
          objection: 'No SAP certification is listed.',
          rebuttal: 'Use ERP implementation experience and ask whether SAP exposure exists.',
        },
      ],
      positionEmphasis: [
        {
          positionIndex: 0,
          weight: 'primary',
          rationale: 'Contains the most relevant operating scope.',
        },
      ],
      evidenceOpportunities: [
        {
          requirement: 'Multi-site manufacturing operations',
          level: 'reasonable_inference',
          sourceSignal: '3 manufacturing facilities',
          recommendedFraming: 'Frame as multi-site manufacturing operations and keep 3 facilities visible.',
          risk: 'low',
        },
        {
          requirement: 'SAP experience',
          level: 'adjacent_proof',
          sourceSignal: 'Oracle ERP implementation',
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
    });

    expect(parsed.evidenceOpportunities).toHaveLength(2);
    expect(parsed.editorialAssessment?.callbackPower).toBe(84);
  });

  it('rejects invalid evidence ladder levels', () => {
    const result = StrategySchema.safeParse({
      positioningFrame: 'operations',
      targetDisciplinePhrase: 'Operations Leader',
      emphasizedAccomplishments: [],
      objections: [],
      positionEmphasis: [],
      evidenceOpportunities: [
        {
          requirement: 'SAP',
          level: 'wishful_thinking',
          recommendedFraming: 'Claim SAP anyway.',
          risk: 'high',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
