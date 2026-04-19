// Zod schema for validating the benchmark stage LLM output.
// Paired with server/prompts/benchmark.v1.md — the prompt tells the model
// what fields to emit; this schema enforces the shape mechanically.

import { z } from 'zod';

export const BenchmarkDirectMatchSchema = z.object({
  jdRequirement: z.string().min(1).max(500),
  candidateEvidence: z.string().min(1).max(800),
  strength: z.enum(['strong', 'partial']),
});

export const BenchmarkGapSchema = z.object({
  gap: z.string().min(1).max(500),
  severity: z.enum(['disqualifying', 'manageable', 'noise']),
  bridgingStrategy: z.string().min(1).max(800),
});

export const BenchmarkObjectionSchema = z.object({
  objection: z.string().min(1).max(500),
  neutralizationStrategy: z.string().min(1).max(800),
});

export const BenchmarkProfileSchema = z.object({
  roleProblemHypothesis: z.string().min(20).max(1200),
  idealProfileSummary: z.string().min(40).max(1200),
  directMatches: z.array(BenchmarkDirectMatchSchema).min(1).max(15),
  gapAssessment: z.array(BenchmarkGapSchema).min(0).max(15),
  positioningFrame: z.string().min(40).max(1200),
  hiringManagerObjections: z.array(BenchmarkObjectionSchema).min(0).max(10),
});
