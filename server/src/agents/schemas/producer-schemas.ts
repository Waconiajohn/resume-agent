/**
 * Zod schemas for Producer agent LLM output validation.
 *
 * Covers:
 *   - adversarial_review       — quality reviewer LLM output (6 dimensions)
 *   - ats_compliance_check     — rule-based ATS findings (no LLM, but schema for consistency)
 *   - humanize_check           — LLM authenticity score + issues
 *   - check_narrative_coherence — LLM narrative arc evaluation
 *
 * All schemas are permissive: .optional() on non-critical fields,
 * .passthrough() on objects to tolerate extra LLM keys.
 */

import { z } from 'zod';

// ─── adversarial_review output ────────────────────────────────────────
// Wraps runQualityReviewer() which returns QualityReviewerOutput from types.ts.

export const QualityScoresSchema = z.object({
  hiring_manager_impact: z.number().optional().default(0),
  requirement_coverage: z.number().optional().default(0),
  ats_score: z.number().optional().default(0),
  authenticity: z.number().optional().default(0),
  evidence_integrity: z.number().optional().default(0),
  blueprint_compliance: z.number().optional().default(0),
}).passthrough();

export const RevisionInstructionSchema = z.object({
  target_section: z.string().optional().default(''),
  issue: z.string().optional().default(''),
  instruction: z.string().optional().default(''),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
}).passthrough();

export const AdversarialReviewOutputSchema = z.object({
  decision: z.enum(['approve', 'revise', 'redesign']).optional().default('revise'),
  scores: QualityScoresSchema.optional(),
  overall_pass: z.boolean().optional().default(false),
  revision_instructions: z.array(RevisionInstructionSchema).optional(),
  redesign_reason: z.string().optional(),
}).passthrough();

export type AdversarialReviewOutput = z.infer<typeof AdversarialReviewOutputSchema>;

// ─── ats_compliance_check output ──────────────────────────────────────
// runAtsComplianceCheck is rule-based (no LLM), returns AtsFinding[].
// Schema covers the tool's return shape: { findings, summary }.

export const AtsComplianceFindingSchema = z.object({
  section: z.string().optional().default(''),
  issue: z.string().optional().default(''),
  instruction: z.string().optional().default(''),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
}).passthrough();

export const AtsComplianceSummarySchema = z.object({
  total: z.number().optional().default(0),
  high_priority: z.number().optional().default(0),
  medium_priority: z.number().optional().default(0),
  low_priority: z.number().optional().default(0),
  passes: z.boolean().optional().default(false),
}).passthrough();

export const AtsComplianceOutputSchema = z.object({
  findings: z.array(AtsComplianceFindingSchema).optional().default([]),
  summary: AtsComplianceSummarySchema.optional(),
}).passthrough();

export type AtsComplianceOutput = z.infer<typeof AtsComplianceOutputSchema>;

// ─── humanize_check LLM output ────────────────────────────────────────
// LLM returns: { score: number (0-100), issues: string[] }

export const HumanizeCheckOutputSchema = z.object({
  score: z.number().min(0).max(100).optional().default(75),
  issues: z.array(z.string()).optional().default([]),
}).passthrough();

export type HumanizeCheckOutput = z.infer<typeof HumanizeCheckOutputSchema>;

// ─── check_narrative_coherence LLM output ─────────────────────────────
// LLM returns: { coherence_score: number (0-100), issues: string[] }

export const NarrativeCoherenceOutputSchema = z.object({
  coherence_score: z.number().min(0).max(100).optional().default(75),
  issues: z.array(z.string()).optional().default([]),
}).passthrough();

export type NarrativeCoherenceOutput = z.infer<typeof NarrativeCoherenceOutputSchema>;
