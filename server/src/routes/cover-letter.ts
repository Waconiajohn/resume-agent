/**
 * Cover Letter Routes — POC product using the generic route factory.
 *
 * Mounted at /api/cover-letter/*. Feature-flagged via FF_COVER_LETTER.
 * Demonstrates the platform abstraction by running a 2-agent pipeline
 * (Analyst → Writer) through the same infrastructure as the resume product.
 *
 * Cross-product context: If the user has previously completed their Career
 * Profile and resume strategy work, the shared profile, positioning strategy,
 * and evidence items are loaded automatically. Missing context is not an error.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createCoverLetterProductConfig } from '../agents/cover-letter/product.js';
import { FF_COVER_LETTER } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../agents/cover-letter/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
  tone: z.enum(['formal', 'conversational', 'bold']).optional().default('formal'),
});

export const coverLetterRoutes = createProductRoutes<CoverLetterState, CoverLetterSSEEvent>({
  startSchema,
  buildProductConfig: (input) => createCoverLetterProductConfig(),
  isEnabled: () => FF_COVER_LETTER,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const companyName = typeof input.company_name === 'string' ? input.company_name : '';
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        product_type: 'cover_letter',
        last_panel_data: { product_type: 'cover_letter', company_name: companyName },
      })
      .eq('id', sessionId);
    if (error) {
      logger.warn(
        { session_id: sessionId, error: error.message },
        'Cover letter: failed to persist company_name to session (continuing)',
      );
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeEvidenceItems: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'cover_letter',
          artifactGoal: 'draft a role-specific cover letter',
          targetAudience: 'hiring manager',
          successCriteria: ['tie evidence to role requirements', 'remain concise and truthful'],
        },
        workflowState: {
          room: 'cover_letter',
          stage: 'context_loaded',
          activeTask: 'connect shared evidence to the target role',
        },
      });
      if (emotionalBaseline) {
        result.emotional_baseline = emotionalBaseline;
      }
      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Cover letter: failed to load Career Profile context (continuing without it)',
      );
    }

    return input;
  },

  momentumActivityType: 'cover_letter_completed',
});
