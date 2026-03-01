/**
 * Zod schemas for Craftsman agent LLM output validation.
 *
 * Covers:
 *   - self_review_section  — LLM quality checklist evaluation
 *   - check_keyword_coverage — string-matching coverage results
 *   - check_anti_patterns   — regex/string anti-pattern detection
 *
 * All schemas are permissive: fields that might be missing from LLM
 * responses are marked .optional() and objects use .passthrough() so
 * unexpected extra fields are ignored rather than causing parse failures.
 */

import { z } from 'zod';

// ─── self_review_section output ───────────────────────────────────────
// LLM returns: { evaluations, score, passed, issues }

export const SelfReviewEvaluationSchema = z.object({
  criterion: z.string().optional().default(''),
  result: z.string().optional().default('PASS'),
  note: z.string().optional().default(''),
}).passthrough();

export const SelfReviewOutputSchema = z.object({
  evaluations: z.array(SelfReviewEvaluationSchema).optional().default([]),
  score: z.number().optional().default(0),
  passed: z.boolean().optional().default(false),
  issues: z.array(z.string()).optional().default([]),
}).passthrough();

export type SelfReviewOutput = z.infer<typeof SelfReviewOutputSchema>;

// ─── check_keyword_coverage output ────────────────────────────────────
// This tool is purely algorithmic (no LLM), but we define a schema
// for the return value to enable consistent validation in tests and
// future refactors.

export const KeywordCoverageOutputSchema = z.object({
  found: z.array(z.string()).optional().default([]),
  missing: z.array(z.string()).optional().default([]),
  coverage_pct: z.number().min(0).max(100).optional().default(0),
}).passthrough();

export type KeywordCoverageOutput = z.infer<typeof KeywordCoverageOutputSchema>;

// ─── check_anti_patterns output ───────────────────────────────────────
// This tool is also algorithmic (no LLM), but same rationale applies.

export const AntiPatternOutputSchema = z.object({
  found_patterns: z.array(z.string()).optional().default([]),
  clean: z.boolean().optional().default(true),
}).passthrough();

export type AntiPatternOutput = z.infer<typeof AntiPatternOutputSchema>;

// ─── check_evidence_integrity LLM output ──────────────────────────────
// The LLM returns: { claims_verified, claims_flagged }

export const EvidenceIntegrityOutputSchema = z.object({
  claims_verified: z.number().optional().default(0),
  claims_flagged: z.array(z.string()).optional().default([]),
}).passthrough();

export type EvidenceIntegrityOutput = z.infer<typeof EvidenceIntegrityOutputSchema>;
