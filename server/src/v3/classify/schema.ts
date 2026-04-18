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
//
// Phase 3.5 expansion: Bullet gains is_new/source/evidence_found; new
// CustomSection type added (see docs/v3-rebuild/04-Decision-Log.md
// 2026-04-18 entries on per-bullet metadata and custom sections).

import { z } from 'zod';

// ─── Primitives ─────────────────────────────────────────────────────────

const confidence = z.number().min(0).max(1);

const dateRange = z.object({
  start: z.string().nullable(),
  end: z.string().nullable(),
  raw: z.string(),
});

// v3 Phase 3.5 — every bullet carries per-source attribution metadata. The
// Bullet schema is consumed by both classify output (source bullets with
// is_new=false) and write output (rewritten bullets with is_new=true and
// a source reference). See docs/v3-rebuild/04-Decision-Log.md.
const bullet = z.object({
  text: z.string(),
  is_new: z.boolean(),
  source: z.string().nullable().optional(),
  evidence_found: z.boolean(),
  confidence,
});

const contactInfo = z.object({
  fullName: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

// ─── Sections ───────────────────────────────────────────────────────────

const position = z.object({
  title: z.string(),
  company: z.string(),
  parentCompany: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  dates: dateRange,
  scope: z.string().nullable().optional(),
  bullets: z.array(bullet),
  confidence,
});

const educationEntry = z.object({
  degree: z.string(),
  institution: z.string(),
  location: z.string().nullable().optional(),
  graduationYear: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence,
});

const certification = z.object({
  name: z.string(),
  issuer: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  confidence,
});

const careerGapNote = z.object({
  description: z.string(),
  dates: dateRange.nullable().optional(),
  confidence,
});

const crossRoleHighlight = z.object({
  text: z.string(),
  sourceContext: z.string(),
  confidence,
});

const customSectionEntry = z.object({
  text: z.string(),
  source: z.string().nullable().optional(),
  confidence,
});

const customSection = z.object({
  title: z.string(),
  entries: z.array(customSectionEntry),
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
  crossRoleHighlights: z.array(crossRoleHighlight),
  customSections: z.array(customSection),
  pronoun: pronounGuess,
  flags: z.array(ambiguityFlag),
  overallConfidence: confidence,
});

export type StructuredResumeParsed = z.infer<typeof StructuredResumeSchema>;
