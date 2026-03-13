/**
 * LinkedIn Tools Routes — Stateless utility endpoints for the LinkedIn Studio.
 *
 * Mounted at /api/linkedin-tools/*. Feature-flagged via FF_LINKEDIN_TOOLS.
 *
 * Endpoints:
 *   POST /api/linkedin-tools/recruiter-sim   — Recruiter search simulator
 *   POST /api/linkedin-tools/writing-analyzer — Writing quality analyzer
 *
 * Both endpoints are stateless (no session), use MODEL_LIGHT for fast responses,
 * and return structured JSON analysis.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { repairJSON } from '../lib/json-repair.js';
import { FF_LINKEDIN_TOOLS } from '../lib/feature-flags.js';
import { MODEL_LIGHT } from '../lib/model-constants.js';
import logger from '../lib/logger.js';
import { llm } from '../lib/llm.js';

export const linkedInToolsRoutes = new Hono();

// ─── Feature flag gate ───────────────────────────────────────────────

linkedInToolsRoutes.use('*', async (c, next) => {
  if (!FF_LINKEDIN_TOOLS) {
    return c.json({ error: 'LinkedIn Tools is not enabled on this server.' }, 404);
  }
  await next();
});

// ─── POST /recruiter-sim ─────────────────────────────────────────────

const recruiterSimSchema = z.object({
  search_terms: z.string().min(2).max(500),
  headline: z.string().max(500).optional(),
  about_section: z.string().max(5000).optional(),
  skills: z.string().max(2000).optional(),
  experience_summary: z.string().max(5000).optional(),
});

interface RecruiterSimResult {
  visibility_score: number;
  rank_assessment: string;
  keyword_matches: string[];
  keyword_gaps: string[];
  profile_completeness_feedback: string;
  top_recommendation: string;
  full_explanation: string;
}

linkedInToolsRoutes.post(
  '/recruiter-sim',
  authMiddleware,
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const parsedBody = await parseJsonBodyWithLimit(c, 10_000);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = recruiterSimSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }

    const { search_terms, headline, about_section, skills, experience_summary } = parsed.data;

    const systemPrompt = `You are a LinkedIn recruiter search algorithm simulator. Your job is to analyze how well a LinkedIn profile would rank for a given set of recruiter search terms, and explain exactly what's working and what's missing.

You MUST respond with valid JSON in exactly this format:
{
  "visibility_score": <number 0-100>,
  "rank_assessment": "<one of: top_10_percent | top_25_percent | average | below_average | unlikely_to_appear>",
  "keyword_matches": ["<keyword1>", "<keyword2>"],
  "keyword_gaps": ["<missing_keyword1>", "<missing_keyword2>"],
  "profile_completeness_feedback": "<1-2 sentences on missing profile sections that hurt visibility>",
  "top_recommendation": "<single most impactful change to improve rank, 1 sentence>",
  "full_explanation": "<2-3 paragraph explanation of the ranking assessment>"
}

Do not include any markdown, preamble, or explanation outside the JSON object.`;

    const profileParts = [
      `## Recruiter Search Terms\n${search_terms}`,
    ];
    if (headline) profileParts.push(`\n## LinkedIn Headline\n${headline}`);
    if (about_section) profileParts.push(`\n## About Section\n${about_section}`);
    if (skills) profileParts.push(`\n## Skills\n${skills}`);
    if (experience_summary) profileParts.push(`\n## Experience Summary\n${experience_summary}`);

    const userMessage = `Simulate how a recruiter searching for "${search_terms}" would see this profile:\n\n${profileParts.join('\n')}`;

    try {
      const response = await llm.chat({
        model: MODEL_LIGHT,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 1500,
      });

      const result = repairJSON<RecruiterSimResult>(response.text);
      if (!result || typeof result.visibility_score !== 'number') {
        // Return cleaned raw text as fallback
        const fallback: RecruiterSimResult = {
          visibility_score: 50,
          rank_assessment: 'average',
          keyword_matches: [],
          keyword_gaps: [],
          profile_completeness_feedback: 'Unable to parse structured results.',
          top_recommendation: response.text.slice(0, 200),
          full_explanation: response.text,
        };
        return c.json({ result: fallback });
      }

      logger.info({ user_id: c.get('user').id, search_terms }, 'Recruiter sim completed');
      return c.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, user_id: c.get('user').id }, `Recruiter sim failed: ${message}`);
      return c.json({ error: 'Analysis failed', message }, 500);
    }
  },
);

// ─── POST /writing-analyzer ──────────────────────────────────────────

const writingAnalyzerSchema = z.object({
  text: z.string().min(10).max(10000),
  context: z.enum(['post', 'headline', 'about', 'experience', 'comment']).optional().default('post'),
});

interface WritingAnalysisResult {
  overall_score: number;
  tone_assessment: string;
  readability_level: string;
  engagement_prediction: string;
  strengths: string[];
  improvements: string[];
  ai_detection_risk: string;
  authenticity_score: number;
  hook_quality: number;
  suggested_rewrite_of_first_line: string;
}

linkedInToolsRoutes.post(
  '/writing-analyzer',
  authMiddleware,
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const parsedBody = await parseJsonBodyWithLimit(c, 15_000);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = writingAnalyzerSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }

    const { text, context } = parsed.data;

    const contextDescriptions: Record<string, string> = {
      post: 'a LinkedIn post',
      headline: 'a LinkedIn headline',
      about: 'a LinkedIn About section',
      experience: 'a LinkedIn experience entry',
      comment: 'a LinkedIn comment',
    };
    const contextLabel = contextDescriptions[context] ?? 'LinkedIn content';

    const systemPrompt = `You are a LinkedIn content quality analyzer. Analyze the provided text for tone, readability, engagement potential, and authenticity. Identify what works, what needs improvement, and assess the risk of sounding AI-generated.

You MUST respond with valid JSON in exactly this format:
{
  "overall_score": <number 0-100>,
  "tone_assessment": "<one of: authoritative | conversational | inspirational | educational | too_formal | too_casual | generic>",
  "readability_level": "<one of: executive | professional | accessible | too_complex | too_simple>",
  "engagement_prediction": "<one of: high | above_average | average | below_average | low>",
  "strengths": ["<strength1>", "<strength2>"],
  "improvements": ["<improvement1>", "<improvement2>"],
  "ai_detection_risk": "<one of: very_low | low | moderate | high | very_high>",
  "authenticity_score": <number 0-100>,
  "hook_quality": <number 0-100>,
  "suggested_rewrite_of_first_line": "<improved opening line>"
}

Do not include any markdown, preamble, or explanation outside the JSON object.`;

    const userMessage = `Analyze this ${contextLabel}:\n\n${text}`;

    try {
      const response = await llm.chat({
        model: MODEL_LIGHT,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 1000,
      });

      const result = repairJSON<WritingAnalysisResult>(response.text);
      if (!result || typeof result.overall_score !== 'number') {
        const fallback: WritingAnalysisResult = {
          overall_score: 50,
          tone_assessment: 'professional',
          readability_level: 'professional',
          engagement_prediction: 'average',
          strengths: [],
          improvements: [],
          ai_detection_risk: 'moderate',
          authenticity_score: 60,
          hook_quality: 50,
          suggested_rewrite_of_first_line: '',
        };
        return c.json({ result: fallback });
      }

      logger.info({ user_id: c.get('user').id, context }, 'Writing analyzer completed');
      return c.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, user_id: c.get('user').id }, `Writing analyzer failed: ${message}`);
      return c.json({ error: 'Analysis failed', message }, 500);
    }
  },
);
