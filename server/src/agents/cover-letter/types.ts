/**
 * Cover Letter — Shared types for the cover letter product.
 *
 * Minimal POC types that demonstrate the platform abstraction
 * works for a second product beyond resumes.
 */

import { z } from 'zod';
import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── review_letter schema (added 2026-04-21) ─────────────────────────
// Zod schema for the JSON the reviewer LLM returns. Kept deliberately
// lenient on `criteria` (any-shape record) because the tool's graceful
// degradation path already handles partial/absent criteria — strictness
// here would only convert real partial responses into StructuredLlmCallError
// throws, forcing the word-count fallback unnecessarily.
//
// The FOUR required fields (total_score, passed, issues, criteria presence)
// are the minimum the tool's contract with its caller depends on. Anything
// looser breaks the return-shape assertions in cover-letter-agents.test.ts.

export const CoverLetterReviewSchema = z.object({
  criteria: z.record(z.string(), z.unknown()).default({}),
  total_score: z.number(),
  passed: z.boolean(),
  issues: z.array(z.string()),
});

export type CoverLetterReview = z.infer<typeof CoverLetterReviewSchema>;

// ─── Pipeline State ───────────────────────────────────────────────────

export interface CoverLetterState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Job application this letter is being written for. Required for the
   * pursuit timeline's "cover letter drafted" Done card. */
  job_application_id?: string;

  /** Cross-product context from resume strategist (positioning + evidence) */
  platform_context?: {
    career_profile?: CareerProfileV2;
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;

  /** Parsed resume key points */
  resume_data?: {
    name: string;
    current_title: string;
    key_skills: string[];
    key_achievements: string[];
  };

  /** JD analysis result */
  jd_analysis?: {
    company_name: string;
    role_title: string;
    requirements: string[];
    culture_cues: string[];
  };

  /** Planned letter structure */
  letter_plan?: {
    opening_hook: string;
    body_points: string[];
    closing_strategy: string;
  };

  /** Generated cover letter content */
  letter_draft?: string;

  /** Self-review quality score (0-100) */
  quality_score?: number;

  /** Review feedback from self-review */
  review_feedback?: string;

  /** User-supplied revision feedback from the letter_review gate */
  revision_feedback?: string;

  /** Tone selected by the user on the intake form */
  tone?: 'formal' | 'conversational' | 'bold';
}

// ─── SSE Events ───────────────────────────────────────────────────────

export type CoverLetterSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'letter_draft'; letter: string; quality_score?: number }
  | { type: 'letter_review_ready'; session_id: string; letter_draft: string; quality_score?: number }
  | { type: 'pipeline_gate'; gate: string }
  | {
      type: 'letter_complete';
      session_id: string;
      letter: string;
      quality_score: number;
      jd_analysis?: CoverLetterState['jd_analysis'];
      letter_plan?: CoverLetterState['letter_plan'];
    }
  | { type: 'pipeline_error'; stage: string; error: string };
