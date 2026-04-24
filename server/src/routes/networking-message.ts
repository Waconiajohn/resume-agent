/**
 * Networking Message Routes — Phase 2.3f thin peer tool.
 *
 * Mounted at /api/networking-message/*. Feature-flagged via
 * FF_NETWORKING_MESSAGE. Parallel to the heavier
 * /api/networking-outreach/* pipeline (unchanged).
 *
 * Single-agent writer + one message_review gate + per-application
 * context injection via transformInput.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createNetworkingMessageProductConfig } from '../agents/networking-message/product.js';
import { FF_NETWORKING_MESSAGE } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type {
  NetworkingMessageState,
  NetworkingMessageSSEEvent,
} from '../agents/networking-message/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';

const RECIPIENT_TYPES_TUPLE = [
  'former_colleague',
  'second_degree',
  'cold',
  'referrer',
  'other',
] as const;

const MESSAGING_METHODS_TUPLE = [
  'connection_request',
  'inmail',
  'group_message',
] as const;

const startSchema = z.object({
  session_id: z.string().uuid(),
  job_application_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  recipient_name: z.string().min(1).max(200),
  recipient_type: z.enum(RECIPIENT_TYPES_TUPLE),
  recipient_title: z.string().max(200).optional(),
  recipient_company: z.string().max(200).optional(),
  recipient_linkedin_url: z.string().url().max(500).optional(),
  messaging_method: z.enum(MESSAGING_METHODS_TUPLE).optional(),
  goal: z.string().min(1).max(2_000),
  context: z.string().max(5_000).optional(),
});

const JD_EXCERPT_MAX_CHARS = 4_000;

/**
 * Stage-derived default rule for the networking peer tool.
 * Active on every non-terminal stage. Pure stage rule — the lookup
 * only fetches the application to read its stage.
 */
export async function computeNetworkingDefault(
  applicationId: string,
  userId: string,
): Promise<boolean> {
  const { data: app } = await supabaseAdmin
    .from('job_applications')
    .select('stage')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle();

  const stage = (app?.stage as string | undefined) ?? 'saved';
  if (stage === 'offer' || stage === 'closed_won' || stage === 'closed_lost') {
    return false;
  }
  // saved, researching, applied, screening, interviewing — all active.
  return true;
}

export const networkingMessageRoutes = createProductRoutes<
  NetworkingMessageState,
  NetworkingMessageSSEEvent
>({
  startSchema,
  buildProductConfig: () => createNetworkingMessageProductConfig(),
  isEnabled: () => FF_NETWORKING_MESSAGE,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const jobApplicationId = input.job_application_id as string;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        product_type: 'networking_message',
        job_application_id: jobApplicationId,
      })
      .eq('id', sessionId);
    if (error) {
      logger.warn(
        { session_id: sessionId, error: error.message },
        'Networking message: failed to set product_type',
      );
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    const jobApplicationId = input.job_application_id as string;
    if (!userId) return input;

    const enriched: Record<string, unknown> = { ...input };

    // ── Career Profile + shared context (standard peer-tool bundle) ──
    try {
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeCareerNarrative: true,
        includeWhyMeStory: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      if (Object.keys(platformContext).length > 0) {
        enriched.platform_context = platformContext;
      }
      enriched.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'networking_message',
          artifactGoal: 'draft a single focused networking message',
          targetAudience: 'networking contact',
          successCriteria: [
            'peer-to-peer voice',
            'specific hook earned by real context',
            'respect the channel character cap',
          ],
        },
        workflowState: {
          room: 'networking_message',
          stage: 'context_loaded',
          activeTask: 'draft one outreach message for this application',
        },
      });
      if (emotionalBaseline) {
        enriched.emotional_baseline = emotionalBaseline;
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), userId },
        'Networking message: failed to load Career Profile context (continuing without it)',
      );
    }

    // ── Per-application target context ───────────────────────────────
    try {
      const { data: app } = await supabaseAdmin
        .from('job_applications')
        .select('title, company, jd_text, stage')
        .eq('id', jobApplicationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (app) {
        const jdText = typeof app.jd_text === 'string' ? app.jd_text : '';
        enriched.target_application = {
          company_name: typeof app.company === 'string' ? app.company : '',
          role_title: typeof app.title === 'string' ? app.title : '',
          jd_excerpt: jdText ? jdText.slice(0, JD_EXCERPT_MAX_CHARS) : undefined,
          stage: typeof app.stage === 'string' ? app.stage : undefined,
        };
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jobApplicationId },
        'Networking message: failed to load target application (continuing without it)',
      );
    }

    return enriched;
  },
});
