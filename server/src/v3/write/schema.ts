// Runtime validation schemas for each Stage 4 section writer.
// The four parallel section writers each return a narrowly-typed result;
// write/index.ts composes them into WrittenResume (mirrored in ../types.ts).
//
// Phase 3.5: WrittenPosition.bullets and WrittenCustomSection.entries
// carry per-bullet attribution metadata (is_new/source/evidence_found/
// confidence) so verify can check claim attribution. See
// docs/v3-rebuild/04-Decision-Log.md 2026-04-18.

import { z } from 'zod';

const dateRange = z.object({
  start: z.string(),
  end: z.string().nullable(),
  raw: z.string(),
});

const confidence = z.number().min(0).max(1);

// Mirrors classify/schema.ts `bullet`. v3 Phase 3.5 — write rewrites
// emit is_new:true, source: reference to source bullet id/text,
// evidence_found indicates whether the rewrite's claims trace to source.
const writtenBullet = z.object({
  text: z.string(),
  is_new: z.boolean(),
  source: z.string().optional(),
  evidence_found: z.boolean(),
  confidence,
});

const writtenCustomSectionEntry = z.object({
  text: z.string(),
  source: z.string().optional(),
  is_new: z.boolean(),
  evidence_found: z.boolean(),
  confidence,
});

const writtenCustomSection = z.object({
  title: z.string(),
  entries: z.array(writtenCustomSectionEntry),
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
  bullets: z.array(writtenBullet),
});

export const WrittenCustomSectionSchema = writtenCustomSection;

export const WrittenResumeSchema = z.object({
  summary: z.string(),
  selectedAccomplishments: z.array(z.string()),
  coreCompetencies: z.array(z.string()),
  positions: z.array(WrittenPositionSchema),
  customSections: z.array(WrittenCustomSectionSchema),
});

export type WrittenResumeParsed = z.infer<typeof WrittenResumeSchema>;
