/**
 * Zod schemas for Strategist agent LLM output validation.
 *
 * These schemas match the TypeScript interfaces in ../types.ts but are
 * intentionally permissive — LLM output is unpredictable, so all
 * non-critical fields are optional and objects use .passthrough() to
 * allow extra keys without throwing.
 *
 * Usage:
 *   const result = BenchmarkCandidateSchema.safeParse(parsed);
 *   if (result.success) { use result.data } else { log warning + use raw }
 */

import { z } from 'zod';

// ─── build_benchmark output ───────────────────────────────────────────
// Corresponds to BenchmarkCandidate in types.ts (returned from runResearchAgent)

export const BenchmarkCandidateSchema = z.object({
  ideal_profile: z.string().optional().default(''),
  language_keywords: z.array(z.string()).optional().default([]),
  section_expectations: z.record(z.string(), z.string()).optional().default({}),
}).passthrough();

export type BenchmarkCandidateOutput = z.infer<typeof BenchmarkCandidateSchema>;

// ─── classify_fit output ──────────────────────────────────────────────
// The classify_fit tool returns gap analysis results from runGapAnalyst.
// Corresponds to GapAnalystOutput in types.ts.

export const RequirementMappingSchema = z.object({
  requirement: z.string().optional().default(''),
  classification: z.enum(['strong', 'partial', 'gap']).optional().default('gap'),
  evidence: z.array(z.string()).optional().default([]),
  resume_location: z.string().optional(),
  positioning_source: z.string().optional(),
  strengthen: z.string().optional(),
  mitigation: z.string().optional(),
  unaddressable: z.boolean().optional(),
}).passthrough();

export const ClassifyFitOutputSchema = z.object({
  requirements: z.array(RequirementMappingSchema).optional().default([]),
  coverage_score: z.number().optional().default(0),
  critical_gaps: z.array(z.string()).optional().default([]),
  addressable_gaps: z.array(z.string()).optional().default([]),
  strength_summary: z.string().optional().default(''),
}).passthrough();

export type ClassifyFitOutput = z.infer<typeof ClassifyFitOutputSchema>;

// ─── design_blueprint output ──────────────────────────────────────────
// Corresponds to ArchitectOutput in types.ts.
// blueprint is a complex nested structure — key fields validated, rest passthrough.

export const SectionPlanSchema = z.object({
  order: z.array(z.string()).optional().default([]),
  rationale: z.string().optional().default(''),
}).passthrough();

export const SummaryBlueprintSchema = z.object({
  positioning_angle: z.string().optional().default(''),
  must_include: z.array(z.string()).optional().default([]),
  gap_reframe: z.record(z.string(), z.string()).optional().default({}),
  tone_guidance: z.string().optional().default(''),
  keywords_to_embed: z.array(z.string()).optional().default([]),
  authentic_phrases_to_echo: z.array(z.string()).optional().default([]),
  length: z.string().optional().default(''),
}).passthrough();

export const EvidencePrioritySchema = z.object({
  requirement: z.string().optional().default(''),
  available_evidence: z.array(z.string()).optional().default([]),
  importance: z.enum(['critical', 'important', 'supporting']).optional().default('supporting'),
  narrative_note: z.string().optional(),
}).passthrough();

export const ExperienceSectionEntrySchema = z.object({
  company: z.string().optional().default(''),
  evidence_priorities: z.array(EvidencePrioritySchema).optional(),
  bullet_count_range: z.tuple([z.number(), z.number()]).optional(),
  do_not_include: z.array(z.string()).optional(),
  bullets_to_write: z.array(z.object({
    focus: z.string().optional().default(''),
    maps_to: z.string().optional().default(''),
    evidence_source: z.string().optional().default(''),
    instruction: z.string().optional().default(''),
    target_metric: z.string().optional(),
  }).passthrough()).optional(),
  bullets_to_keep: z.array(z.string()).optional(),
  bullets_to_cut: z.array(z.string()).optional(),
}).passthrough();

export const EvidenceAllocationSchema = z.object({
  selected_accomplishments: z.array(z.object({
    evidence_id: z.string().optional().default(''),
    achievement: z.string().optional().default(''),
    maps_to_requirements: z.array(z.string()).optional().default([]),
    placement_rationale: z.string().optional().default(''),
    enhancement: z.string().optional().default(''),
  }).passthrough()).optional(),
  experience_section: z.record(z.string(), ExperienceSectionEntrySchema).optional().default({}),
  unallocated_requirements: z.array(z.object({
    requirement: z.string().optional().default(''),
    resolution: z.string().optional().default(''),
  }).passthrough()).optional().default([]),
}).passthrough();

export const SkillsBlueprintSchema = z.object({
  format: z.string().optional().default('categorized'),
  categories: z.array(z.object({
    label: z.string().optional().default(''),
    skills: z.array(z.string()).optional().default([]),
    rationale: z.string().optional().default(''),
  }).passthrough()).optional().default([]),
  keywords_still_missing: z.array(z.string()).optional().default([]),
  age_protection_removals: z.array(z.string()).optional().default([]),
}).passthrough();

export const ExperienceBlueprintSchema = z.object({
  roles: z.array(z.object({
    company: z.string().optional().default(''),
    title: z.string().optional().default(''),
    dates: z.string().optional().default(''),
    title_adjustment: z.string().optional(),
    bullet_count: z.number().optional().default(4),
  }).passthrough()).optional().default([]),
  earlier_career: z.object({
    include: z.boolean().optional().default(false),
    roles: z.array(z.object({
      title: z.string().optional().default(''),
      company: z.string().optional().default(''),
    }).passthrough()).optional().default([]),
    format: z.string().optional().default(''),
    rationale: z.string().optional().default(''),
  }).passthrough().optional(),
}).passthrough();

export const AgeProtectionAuditSchema = z.object({
  flags: z.array(z.object({
    item: z.string().optional().default(''),
    risk: z.string().optional().default(''),
    action: z.string().optional().default(''),
  }).passthrough()).optional().default([]),
  clean: z.boolean().optional().default(true),
}).passthrough();

export const KeywordTargetSchema = z.object({
  target_density: z.number().optional().default(1),
  placements: z.array(z.string()).optional().default([]),
  current_count: z.number().optional().default(0),
  action: z.string().optional().default(''),
}).passthrough();

export const GlobalRulesSchema = z.object({
  voice: z.string().optional().default('executive'),
  bullet_format: z.string().optional().default('RAS'),
  length_target: z.string().optional().default('1-2 pages'),
  ats_rules: z.string().optional().default('standard'),
}).passthrough();

export const DesignBlueprintOutputSchema = z.object({
  blueprint_version: z.string().optional().default('1.0'),
  target_role: z.string().optional().default(''),
  positioning_angle: z.string().optional().default(''),
  section_plan: SectionPlanSchema.optional(),
  summary_blueprint: SummaryBlueprintSchema.optional(),
  evidence_allocation: EvidenceAllocationSchema.optional(),
  skills_blueprint: SkillsBlueprintSchema.optional(),
  experience_blueprint: ExperienceBlueprintSchema.optional(),
  age_protection: AgeProtectionAuditSchema.optional(),
  keyword_map: z.record(z.string(), KeywordTargetSchema).optional().default({}),
  global_rules: GlobalRulesSchema.optional(),
}).passthrough();

export type DesignBlueprintOutput = z.infer<typeof DesignBlueprintOutputSchema>;
