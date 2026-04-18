// Runtime validation schema for StructuredResume (Stage 2 output).
// Mirrors the TypeScript types in ../types.ts — when you add a field to the
// TS type, add it here and run the fixture suite.
//
// The classify() function parses the LLM's JSON output and passes it through
// this schema. A schema failure is a LOUD error per OPERATING-MANUAL.md
// "No silent fallbacks" — the caller sees the exact validation issues.
//
// Implements: docs/v3-rebuild/kickoffs/phase-3-kickoff.md §2.5
//             (zod validation, throw on failure, no silent repair).

import { z } from 'zod';

// ─── Primitives ─────────────────────────────────────────────────────────

const confidence = z.number().min(0).max(1);

const dateRange = z.object({
  start: z.string(),
  end: z.string().nullable(),
  raw: z.string(),
});

const bullet = z.object({
  text: z.string(),
  confidence,
});

const contactInfo = z.object({
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  website: z.string().optional(),
});

// ─── Sections ───────────────────────────────────────────────────────────

const position = z.object({
  title: z.string(),
  company: z.string(),
  parentCompany: z.string().optional(),
  location: z.string().optional(),
  dates: dateRange,
  scope: z.string().optional(),
  bullets: z.array(bullet),
  confidence,
});

const educationEntry = z.object({
  degree: z.string(),
  institution: z.string(),
  location: z.string().optional(),
  graduationYear: z.string().optional(),
  notes: z.string().optional(),
  confidence,
});

const certification = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  year: z.string().optional(),
  confidence,
});

const careerGapNote = z.object({
  description: z.string(),
  dates: dateRange.optional(),
  confidence,
});

const pronounGuess = z.union([
  z.literal('she/her'),
  z.literal('he/him'),
  z.literal('they/them'),
  z.null(),
]);

const ambiguityFlag = z.object({
  field: z.string(),
  reason: z.string(),
  severity: z.union([z.literal('low'), z.literal('medium'), z.literal('high')]),
});

// ─── Top-level ──────────────────────────────────────────────────────────

export const StructuredResumeSchema = z.object({
  contact: contactInfo,
  discipline: z.string(),
  positions: z.array(position),
  education: z.array(educationEntry),
  certifications: z.array(certification),
  skills: z.array(z.string()),
  careerGaps: z.array(careerGapNote),
  pronoun: pronounGuess,
  flags: z.array(ambiguityFlag),
  overallConfidence: confidence,
});

export type StructuredResumeParsed = z.infer<typeof StructuredResumeSchema>;
