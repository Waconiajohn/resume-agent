/**
 * Application Timeline Route — /api/job-applications/:applicationId/timeline
 *
 * Phase 3 of the pursuit timeline. One round-trip endpoint that returns the
 * full payload the workspace overview needs:
 *
 *   - application core (stage, stage_history, created_at, role/company)
 *   - per-artifact existence + last_at for the Done region
 *   - all application_events for Next/Their-turn rule evaluation
 *   - networking_messages count + last_at
 *   - referral_bonus signal for the company (drives the N4 rule)
 *
 * Mounted as a sub-router under jobApplicationsRoutes alongside
 * applicationEventsRoutes; auth + feature-flag inherit from the parent chain.
 *
 * The frontend rule engine derives Next/Their-turn from this payload — the
 * server doesn't compute rules. This keeps the contract simple and lets us
 * iterate on rules without redeploying.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { normalizeCompanyName } from '../lib/ni/company-normalizer.js';
import logger from '../lib/logger.js';

interface ApplicationCore {
  id: string;
  stage: string;
  role_title: string | null;
  company_name: string | null;
  stage_history: Array<{ stage: string; at: string; from?: string; note?: string }> | null;
  created_at: string;
  applied_date: string | null;
}

interface ArtifactSignal {
  exists: boolean;
  last_at: string | null;
}

interface ReferralBonusSignal {
  exists: boolean;
  bonus_amount?: string | null;
  bonus_currency?: string | null;
  program_url?: string | null;
  source?: string | null;
}

export interface TimelineEvent {
  id: string;
  type: 'applied' | 'interview_happened' | 'offer_received' | 'interview_scheduled';
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ApplicationTimelinePayload {
  application: ApplicationCore;
  resume: ArtifactSignal & { session_id: string | null };
  cover_letter: ArtifactSignal;
  interview_prep: ArtifactSignal;
  thank_you: ArtifactSignal;
  follow_up: ArtifactSignal;
  networking_messages: { count: number; last_at: string | null };
  events: TimelineEvent[];
  referral_bonus: ReferralBonusSignal;
}

async function loadReferralBonus(companyName: string | null): Promise<ReferralBonusSignal> {
  if (!companyName?.trim()) return { exists: false };
  const normalized = normalizeCompanyName(companyName).toLowerCase();
  if (!normalized) return { exists: false };

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('company_directory')
    .select('id')
    .eq('name_normalized', normalized)
    .maybeSingle();

  if (companyErr || !company?.id) return { exists: false };

  const { data: program, error: programErr } = await supabaseAdmin
    .from('referral_bonus_programs')
    .select('bonus_amount, bonus_currency, program_url, source, bonus_entry')
    .eq('company_id', company.id)
    .maybeSingle();

  if (programErr || !program) return { exists: false };

  const hasAmount = !!(program.bonus_amount || program.bonus_entry);
  if (!hasAmount) return { exists: false };

  return {
    exists: true,
    bonus_amount: (program.bonus_amount ?? program.bonus_entry) as string | null,
    bonus_currency: program.bonus_currency as string | null,
    program_url: program.program_url as string | null,
    source: program.source as string | null,
  };
}

export const applicationTimelineRoutes = new Hono();

applicationTimelineRoutes.get(
  '/:applicationId/timeline',
  rateLimitMiddleware(120, 60_000),
  async (c) => {
    const user = c.get('user');
    const applicationId = c.req.param('applicationId') ?? '';
    if (!z.string().uuid().safeParse(applicationId).success) {
      return c.json({ error: 'Invalid application id' }, 400);
    }

    // Application core — also acts as the ownership check.
    const { data: appRow, error: appErr } = await supabaseAdmin
      .from('job_applications')
      .select('id, stage, title, company, stage_history, created_at, applied_date')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (appErr) {
      logger.error(
        { error: appErr.message, userId: user.id, applicationId },
        'application-timeline: ownership check failed',
      );
      return c.json({ error: 'Failed to load application' }, 500);
    }
    if (!appRow) return c.json({ error: 'Application not found' }, 404);

    const application: ApplicationCore = {
      id: appRow.id,
      stage: appRow.stage,
      role_title: (appRow.title as string | null) ?? null,
      company_name: (appRow.company as string | null) ?? null,
      stage_history: (appRow.stage_history as ApplicationCore['stage_history']) ?? null,
      created_at: appRow.created_at,
      applied_date: (appRow.applied_date as string | null) ?? null,
    };

    // Parallel artifact lookups. Each query has an index on job_application_id
    // so this batch resolves in a single round-trip's wall-clock latency.
    const [
      resumeResult,
      coverLetterResult,
      interviewPrepResult,
      thankYouResult,
      followUpResult,
      networkingCountResult,
      networkingLastResult,
      eventsResult,
      referralBonusResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('coach_sessions')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('cover_letter_reports')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('interview_prep_reports')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('thank_you_note_reports')
        .select('id, created_at')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('follow_up_email_reports')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('networking_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId),
      supabaseAdmin
        .from('networking_messages')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('application_events')
        .select('id, type, occurred_at, metadata')
        .eq('user_id', user.id)
        .eq('job_application_id', applicationId)
        .order('occurred_at', { ascending: false }),
      loadReferralBonus(application.company_name),
    ]);

    const resume = {
      exists: !!resumeResult.data,
      last_at: (resumeResult.data?.updated_at as string | undefined) ?? null,
      session_id: (resumeResult.data?.id as string | undefined) ?? null,
    };
    const cover_letter: ArtifactSignal = {
      exists: !!coverLetterResult.data,
      last_at: (coverLetterResult.data?.updated_at as string | undefined) ?? null,
    };
    const interview_prep: ArtifactSignal = {
      exists: !!interviewPrepResult.data,
      last_at: (interviewPrepResult.data?.updated_at as string | undefined) ?? null,
    };
    const thank_you: ArtifactSignal = {
      exists: !!thankYouResult.data,
      last_at: (thankYouResult.data?.created_at as string | undefined) ?? null,
    };
    const follow_up: ArtifactSignal = {
      exists: !!followUpResult.data,
      last_at: (followUpResult.data?.updated_at as string | undefined) ?? null,
    };
    const networking_messages = {
      count: networkingCountResult.count ?? 0,
      last_at: (networkingLastResult.data?.created_at as string | undefined) ?? null,
    };
    const events: TimelineEvent[] = ((eventsResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      id: row.id as string,
      type: row.type as TimelineEvent['type'],
      occurred_at: row.occurred_at as string,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));

    const payload: ApplicationTimelinePayload = {
      application,
      resume,
      cover_letter,
      interview_prep,
      thank_you,
      follow_up,
      networking_messages,
      events,
      referral_bonus: referralBonusResult,
    };

    return c.json(payload);
  },
);
