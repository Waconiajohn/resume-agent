// Runtime validation schemas for each Stage 4 section writer.
// The four parallel section writers each return a narrowly-typed result;
// write/index.ts composes them into WrittenResume (mirrored in ../types.ts).

import { z } from 'zod';

const dateRange = z.object({
  start: z.string(),
  end: z.string().nullable(),
  raw: z.string(),
});

export const WrittenSummarySchema = z.object({
  summary: z.string(),
});

export const WrittenAccomplishmentsSchema = z.object({
  selectedAccomplishments: z.array(z.string()),
});

export const WrittenCompetenciesSchema = z.object({
  coreCompetencies: z.array(z.string()),
});

export const WrittenPositionSchema = z.object({
  positionIndex: z.number(),
  title: z.string(),
  company: z.string(),
  dates: dateRange,
  scope: z.string().optional(),
  bullets: z.array(z.string()),
});

export const WrittenResumeSchema = z.object({
  summary: z.string(),
  selectedAccomplishments: z.array(z.string()),
  coreCompetencies: z.array(z.string()),
  positions: z.array(WrittenPositionSchema),
});

export type WrittenResumeParsed = z.infer<typeof WrittenResumeSchema>;
