/**
 * Cover Letter Routes — POC product using the generic route factory.
 *
 * Mounted at /api/cover-letter/*. Feature-flagged via FF_COVER_LETTER.
 * Demonstrates the platform abstraction by running a 2-agent pipeline
 * (Analyst → Writer) through the same infrastructure as the resume product.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createCoverLetterProductConfig } from '../agents/cover-letter/product.js';
import { FF_COVER_LETTER } from '../lib/feature-flags.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../agents/cover-letter/types.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
});

export const coverLetterRoutes = createProductRoutes<CoverLetterState, CoverLetterSSEEvent>({
  startSchema,
  buildProductConfig: (input) => createCoverLetterProductConfig(),
  isEnabled: () => FF_COVER_LETTER,
});
