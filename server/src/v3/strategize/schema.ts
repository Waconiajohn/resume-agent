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

export const StrategySchema = z.object({
  positioningFrame: z.string(),
  targetDisciplinePhrase: z.string(),
  emphasizedAccomplishments: z.array(emphasizedAccomplishment),
  objections: z.array(objection),
  positionEmphasis: z.array(positionEmphasis),
  notes: z.string().optional(),
});

export type StrategyParsed = z.infer<typeof StrategySchema>;
