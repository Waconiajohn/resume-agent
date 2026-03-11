/**
 * Cover Letter — Shared types for the cover letter product.
 *
 * Minimal POC types that demonstrate the platform abstraction
 * works for a second product beyond resumes.
 */

import type { BaseState, BaseEvent } from '../runtime/agent-protocol.js';

// ─── Pipeline State ───────────────────────────────────────────────────

export interface CoverLetterState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Cross-product context from resume strategist (positioning + evidence) */
  platform_context?: {
    positioning_strategy?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
  };

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
