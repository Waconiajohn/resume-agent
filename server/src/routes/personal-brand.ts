/**
 * Personal Brand Audit Routes — Agent #19 using the generic route factory.
 *
 * Mounted at /api/personal-brand/*. Feature-flagged via FF_PERSONAL_BRAND_AUDIT.
 * Runs a 2-agent pipeline (Brand Auditor -> Brand Advisor) to audit executive
 * personal brand across multiple touchpoints, score consistency, and produce
 * actionable recommendations. Autonomous — no user gates.
 *
 * Cross-product context: Loads positioning strategy from resume sessions
 * and bios from executive-bio sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createPersonalBrandProductConfig } from '../agents/personal-brand/product.js';
import { FF_PERSONAL_BRAND_AUDIT } from '../lib/feature-flags.js';
import { getUserContext } from '../lib/platform-context.js';
import { getEmotionalBaseline } from '../lib/emotional-baseline.js';
import logger from '../lib/logger.js';
import type { PersonalBrandState, PersonalBrandSSEEvent, BrandSourceInput } from '../agents/personal-brand/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  linkedin_text: z.string().max(100_000).optional(),
  bio_text: z.string().max(50_000).optional(),
  target_role: z.string().max(200).optional(),
  target_industry: z.string().max(200).optional(),
});

export const personalBrandRoutes = createProductRoutes<PersonalBrandState, PersonalBrandSSEEvent>({
  startSchema,
  buildProductConfig: () => createPersonalBrandProductConfig(),
  isEnabled: () => FF_PERSONAL_BRAND_AUDIT,

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    const transformed: Record<string, unknown> = { ...input };

    // Build brand_sources array from provided texts
    const brandSources: BrandSourceInput[] = [];

    if (input.resume_text) {
      brandSources.push({ source: 'resume', content: String(input.resume_text) });
    }
    if (input.linkedin_text) {
      brandSources.push({ source: 'linkedin', content: String(input.linkedin_text) });
    }
    if (input.bio_text) {
      brandSources.push({ source: 'bio', content: String(input.bio_text) });
    }

    transformed.brand_sources = brandSources;

    // Load cross-product platform context and emotional baseline
    try {
      const [baseline, strategyRows, bioRows] = await Promise.all([
        getEmotionalBaseline(userId),
        getUserContext(userId, 'positioning_strategy'),
        getUserContext(userId, 'career_narrative'),
      ]);

      const platformContext: Record<string, unknown> = {};

      if (strategyRows.length > 0) {
        platformContext.positioning_strategy = strategyRows[0].content;
      }
      if (bioRows.length > 0) {
        platformContext.bios = bioRows.map(r => r.content);
      }

      if (Object.keys(platformContext).length > 0) {
        transformed.platform_context = platformContext;
      }
      if (baseline) {
        transformed.emotional_baseline = baseline;
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), userId },
        'Personal brand: failed to load platform context (continuing without it)',
      );
    }

    // Build target context from flat fields
    if (input.target_role || input.target_industry) {
      transformed.target_context = {
        target_role: String(input.target_role ?? ''),
        target_industry: String(input.target_industry ?? ''),
      };
    }

    return transformed;
  },
});
