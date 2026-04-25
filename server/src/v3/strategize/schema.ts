// Runtime validation schema for Strategy (Stage 3 output).
// Mirrors the Strategy type in ../types.ts. No silent repair —
// failures throw in strategize/index.ts.

import { z } from 'zod';

const emphasizedAccomplishment = z.object({
  positionIndex: z.number().nullable(),   // null = cross-role / summary-level
  summary: z.string(),
  rationale: z.string(),
});

const objection = z.object({
  objection: z.string(),
  rebuttal: z.string(),
});

const positionEmphasis = z.object({
  positionIndex: z.number(),
  weight: z.union([z.literal('primary'), z.literal('secondary'), z.literal('brief')]),
  rationale: z.string(),
});

const evidenceOpportunity = z.object({
  requirement: z.string(),
  level: z.union([
    z.literal('direct_proof'),
    z.literal('reasonable_inference'),
    z.literal('adjacent_proof'),
    z.literal('candidate_discovery_needed'),
    z.literal('unsupported'),
  ]),
  sourceSignal: z.string().optional(),
  recommendedFraming: z.string(),
  discoveryQuestion: z.string().optional(),
  risk: z.union([z.literal('low'), z.literal('medium'), z.literal('high')]),
});

const editorialAssessment = z.object({
  callbackPower: z.number().min(0).max(100),
  strongestAngle: z.string(),
  weakestAngle: z.string(),
  hiringManagerQuestion: z.string(),
  recommendedMove: z.string(),
});

export const StrategySchema = z.object({
  positioningFrame: z.string(),
  targetDisciplinePhrase: z.string(),
  emphasizedAccomplishments: z.array(emphasizedAccomplishment),
  objections: z.array(objection),
  positionEmphasis: z.array(positionEmphasis),
  evidenceOpportunities: z.array(evidenceOpportunity).optional(),
  editorialAssessment: editorialAssessment.optional(),
  notes: z.string().optional(),
});

export type StrategyParsed = z.infer<typeof StrategySchema>;
