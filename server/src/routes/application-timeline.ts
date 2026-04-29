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

  if (companyErr) {
    logger.warn(
      { source: 'company_directory', code: companyErr.code, message: companyErr.message, companyName },
      'application-timeline: referral bonus lookup degraded (company_directory)',
    );
    return { exists: false };
  }
  if (!company?.id) return { exists: false };

  const { data: program, error: programErr } = await supabaseAdmin
    .from('referral_bonus_programs')
    .select('bonus_amount, bonus_currency, program_url, source, bonus_entry')
    .eq('company_id', company.id)
    .maybeSingle();

  if (programErr) {
    logger.warn(
      { source: 'referral_bonus_programs', code: programErr.code, message: programErr.message, companyId: company.id },
      'application-timeline: referral bonus lookup degraded (referral_bonus_programs)',
    );
    return { exists: false };
  }
  if (!program) return { exists: false };

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

// ─── Bulk endpoint (Phase 5 — Today view) ────────────────────────────────

const TODAY_TERMINAL_STAGES = new Set(['offer', 'closed_won', 'closed_lost']);
const TODAY_BULK_CAP = 50;

interface NetworkingMessageRow {
  job_application_id: string | null;
  created_at: string;
}

interface CompanyDirectoryRow {
  id: string;
  name_normalized: string;
}

interface ReferralBonusRow {
  company_id: string;
  bonus_amount: string | null;
  bonus_currency: string | null;
  program_url: string | null;
  source: string | null;
  bonus_entry?: string | null;
}

/**
 * GET /:userId-scoped/timeline/all — single round-trip for the cross-pursuit
 * Today view. Filters applications to non-terminal (stage NOT IN
 * offer/closed_won/closed_lost) and returns up to TODAY_BULK_CAP raw payloads,
 * one per application. The client runs the rule engine on each payload, so the
 * single source of truth for next/their-turn lives in one place.
 *
 * Uses bulk queries (~9 round-trips total) rather than N×9. Per-app payloads
 * are assembled in JS from the bulk results.
 */
applicationTimelineRoutes.get(
  '/timeline/all',
  rateLimitMiddleware(60, 60_000),
  async (c) => {
    const user = c.get('user');

    // 1) Applications — non-terminal, capped, ordered by recent activity.
    const { data: appsData, error: appsErr } = await supabaseAdmin
      .from('job_applications')
      .select('id, stage, title, company, stage_history, created_at, applied_date')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(TODAY_BULK_CAP);

    if (appsErr) {
      logger.error(
        { error: appsErr.message, userId: user.id },
        'application-timeline: bulk apps query failed',
      );
      return c.json({ error: 'Failed to load timelines' }, 500);
    }

    const apps = (appsData ?? []).filter(
      (row) => !TODAY_TERMINAL_STAGES.has((row.stage as string) ?? ''),
    );

    if (apps.length === 0) {
      return c.json({ pursuits: [] });
    }

    const appIds = apps.map((a) => a.id as string);

    // 2..8) Bulk artifact + event lookups. Per-query errors are surfaced
    // (not silently absorbed into empty signals) so schema drift / RLS
    // regressions fail loud instead of silent.
    const [
      coachSessionsRes,
      coverLetterRes,
      coverLetterSessionsRes,
      interviewPrepRes,
      thankYouRes,
      followUpRes,
      networkingRes,
      eventsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('coach_sessions')
        .select('id, job_application_id, updated_at')
        .eq('user_id', user.id)
        .eq('product_type', 'resume_v3')
        .not('v3_pipeline_output', 'is', null)
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('cover_letter_reports')
        .select('id, job_application_id, updated_at')
        .eq('user_id', user.id)
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('coach_sessions')
        .select('id, job_application_id, updated_at')
        .eq('user_id', user.id)
        .eq('product_type', 'cover_letter')
        .eq('pipeline_status', 'complete')
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('interview_prep_reports')
        .select('id, job_application_id, updated_at')
        .eq('user_id', user.id)
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('thank_you_note_reports')
        .select('id, job_application_id, created_at')
        .eq('user_id', user.id)
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('follow_up_email_reports')
        .select('id, job_application_id, updated_at')
        .eq('user_id', user.id)
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('networking_messages')
        .select('job_application_id, created_at')
        .eq('user_id', user.id)
        .in('job_application_id', appIds),
      supabaseAdmin
        .from('application_events')
        .select('id, job_application_id, type, occurred_at, metadata')
        .eq('user_id', user.id)
        .in('job_application_id', appIds)
        .order('occurred_at', { ascending: false }),
    ]);

    const labeledResults: Array<[string, { error: { message: string; code?: string } | null }]> = [
      ['coach_sessions(resume_v3)', coachSessionsRes],
      ['cover_letter_reports', coverLetterRes],
      ['coach_sessions(cover_letter)', coverLetterSessionsRes],
      ['interview_prep_reports', interviewPrepRes],
      ['thank_you_note_reports', thankYouRes],
      ['follow_up_email_reports', followUpRes],
      ['networking_messages', networkingRes],
      ['application_events', eventsRes],
    ];
    const failures = labeledResults
      .filter(([, res]) => res.error)
      .map(([label, res]) => ({ source: label, error: res.error! }));
    if (failures.length > 0) {
      logger.error(
        {
          userId: user.id,
          appCount: apps.length,
          failures: failures.map((f) => ({
            source: f.source,
            code: f.error.code,
            message: f.error.message,
          })),
        },
        'application-timeline/all: one or more sub-queries failed',
      );
      return c.json(
        {
          error: 'Failed to load timelines',
          failures: failures.map((f) => ({ source: f.source, code: f.error.code })),
        },
        500,
      );
    }

    // 9) Referral bonus lookups — group company names, normalize, batch.
    const companyNames = Array.from(
      new Set(
        apps
          .map((a) => (typeof a.company === 'string' ? a.company.trim() : ''))
          .filter((c) => c.length > 0),
      ),
    );
    const normalizedToCompany = new Map<string, string>();
    for (const name of companyNames) {
      const normalized = normalizeCompanyName(name).toLowerCase();
      if (normalized) normalizedToCompany.set(normalized, name);
    }
    const normalizedNames = Array.from(normalizedToCompany.keys());

    let companyDirectory: CompanyDirectoryRow[] = [];
    let referralPrograms: ReferralBonusRow[] = [];
    if (normalizedNames.length > 0) {
      const { data: cdData } = await supabaseAdmin
        .from('company_directory')
        .select('id, name_normalized')
        .in('name_normalized', normalizedNames);
      companyDirectory = (cdData as CompanyDirectoryRow[] | null) ?? [];

      if (companyDirectory.length > 0) {
        const { data: rbData } = await supabaseAdmin
          .from('referral_bonus_programs')
          .select('company_id, bonus_amount, bonus_currency, program_url, source, bonus_entry')
          .in('company_id', companyDirectory.map((c) => c.id));
        referralPrograms = (rbData as ReferralBonusRow[] | null) ?? [];
      }
    }

    // Build company name → referral signal lookup.
    const companyNormalizedToId = new Map<string, string>();
    for (const row of companyDirectory) {
      companyNormalizedToId.set(row.name_normalized, row.id);
    }
    const companyIdToReferral = new Map<string, ReferralBonusRow>();
    for (const row of referralPrograms) {
      // Last write wins is fine — there's typically one row per company.
      companyIdToReferral.set(row.company_id, row);
    }

    // ── Group bulk results by job_application_id ─────────────────────
    function indexLatestByAppId<T extends { job_application_id: string | null; updated_at?: string; created_at?: string }>(
      rows: T[] | null | undefined,
      timestampField: 'updated_at' | 'created_at',
    ): Map<string, T> {
      const map = new Map<string, T>();
      for (const row of rows ?? []) {
        if (!row.job_application_id) continue;
        const existing = map.get(row.job_application_id);
        const rowTs = (row as Record<string, unknown>)[timestampField] as string | undefined;
        const existingTs = existing
          ? ((existing as Record<string, unknown>)[timestampField] as string | undefined)
          : undefined;
        if (!existing || (rowTs && existingTs && rowTs > existingTs)) {
          map.set(row.job_application_id, row);
        }
      }
      return map;
    }

    const resumeByApp = indexLatestByAppId(coachSessionsRes.data as Array<{ job_application_id: string | null; id: string; updated_at: string }> | null, 'updated_at');
    const coverLetterRows = [
      ...((coverLetterRes.data as Array<{ job_application_id: string | null; id: string; updated_at: string }> | null) ?? []),
      ...((coverLetterSessionsRes.data as Array<{ job_application_id: string | null; id: string; updated_at: string }> | null) ?? []),
    ];
    const coverLetterByApp = indexLatestByAppId(coverLetterRows, 'updated_at');
    const interviewPrepByApp = indexLatestByAppId(interviewPrepRes.data as Array<{ job_application_id: string | null; id: string; updated_at: string }> | null, 'updated_at');
    const thankYouByApp = indexLatestByAppId(thankYouRes.data as Array<{ job_application_id: string | null; id: string; created_at: string }> | null, 'created_at');
    const followUpByApp = indexLatestByAppId(followUpRes.data as Array<{ job_application_id: string | null; id: string; updated_at: string }> | null, 'updated_at');

    // Networking — count + latest per app.
    const networkingCount = new Map<string, number>();
    const networkingLatest = new Map<string, string>();
    for (const row of (networkingRes.data as NetworkingMessageRow[] | null) ?? []) {
      if (!row.job_application_id) continue;
      networkingCount.set(row.job_application_id, (networkingCount.get(row.job_application_id) ?? 0) + 1);
      const existing = networkingLatest.get(row.job_application_id);
      if (!existing || (row.created_at && row.created_at > existing)) {
        networkingLatest.set(row.job_application_id, row.created_at);
      }
    }

    // Events — group by app id (already sorted desc on occurred_at).
    const eventsByApp = new Map<string, TimelineEvent[]>();
    for (const row of (eventsRes.data as Array<Record<string, unknown>> | null) ?? []) {
      const appId = row.job_application_id as string | null;
      if (!appId) continue;
      const list = eventsByApp.get(appId) ?? [];
      list.push({
        id: row.id as string,
        type: row.type as TimelineEvent['type'],
        occurred_at: row.occurred_at as string,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      });
      eventsByApp.set(appId, list);
    }

    // ── Assemble per-app payloads ────────────────────────────────────
    const pursuits: ApplicationTimelinePayload[] = apps.map((appRow) => {
      const id = appRow.id as string;
      const company = (appRow.company as string | null) ?? null;

      const application: ApplicationCore = {
        id,
        stage: appRow.stage as string,
        role_title: (appRow.title as string | null) ?? null,
        company_name: company,
        stage_history: (appRow.stage_history as ApplicationCore['stage_history']) ?? null,
        created_at: appRow.created_at as string,
        applied_date: (appRow.applied_date as string | null) ?? null,
      };

      const resumeRow = resumeByApp.get(id);
      const coverLetterRow = coverLetterByApp.get(id);
      const interviewPrepRow = interviewPrepByApp.get(id);
      const thankYouRow = thankYouByApp.get(id);
      const followUpRow = followUpByApp.get(id);

      // Referral bonus lookup.
      let referralBonus: ReferralBonusSignal = { exists: false };
      if (company) {
        const normalized = normalizeCompanyName(company).toLowerCase();
        const companyId = normalized ? companyNormalizedToId.get(normalized) : undefined;
        const program = companyId ? companyIdToReferral.get(companyId) : undefined;
        if (program && (program.bonus_amount || program.bonus_entry)) {
          referralBonus = {
            exists: true,
            bonus_amount: program.bonus_amount ?? program.bonus_entry ?? null,
            bonus_currency: program.bonus_currency,
            program_url: program.program_url,
            source: program.source,
          };
        }
      }

      return {
        application,
        resume: {
          exists: !!resumeRow,
          last_at: (resumeRow?.updated_at as string | undefined) ?? null,
          session_id: (resumeRow?.id as string | undefined) ?? null,
        },
        cover_letter: {
          exists: !!coverLetterRow,
          last_at: (coverLetterRow?.updated_at as string | undefined) ?? null,
        },
        interview_prep: {
          exists: !!interviewPrepRow,
          last_at: (interviewPrepRow?.updated_at as string | undefined) ?? null,
        },
        thank_you: {
          exists: !!thankYouRow,
          last_at: (thankYouRow?.created_at as string | undefined) ?? null,
        },
        follow_up: {
          exists: !!followUpRow,
          last_at: (followUpRow?.updated_at as string | undefined) ?? null,
        },
        networking_messages: {
          count: networkingCount.get(id) ?? 0,
          last_at: networkingLatest.get(id) ?? null,
        },
        events: eventsByApp.get(id) ?? [],
        referral_bonus: referralBonus,
      };
    });

    return c.json({ pursuits });
  },
);

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
    // so this batch resolves in a single round-trip's wall-clock latency. Per-
    // query errors are surfaced (not silently absorbed into empty signals) so
    // schema drift / RLS regressions fail loud instead of silent.
    const [
      resumeResult,
      coverLetterResult,
      coverLetterSessionResult,
      interviewPrepResult,
      thankYouResult,
      followUpResult,
      networkingCountResult,
      networkingLastResult,
      eventsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('coach_sessions')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('product_type', 'resume_v3')
        .not('v3_pipeline_output', 'is', null)
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
        .from('coach_sessions')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('product_type', 'cover_letter')
        .eq('pipeline_status', 'complete')
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
    ]);

    const labeledResults: Array<[string, { error: { message: string; code?: string } | null }]> = [
      ['coach_sessions(resume_v3)', resumeResult],
      ['cover_letter_reports', coverLetterResult],
      ['coach_sessions(cover_letter)', coverLetterSessionResult],
      ['interview_prep_reports', interviewPrepResult],
      ['thank_you_note_reports', thankYouResult],
      ['follow_up_email_reports', followUpResult],
      ['networking_messages(count)', networkingCountResult],
      ['networking_messages(latest)', networkingLastResult],
      ['application_events', eventsResult],
    ];
    const failures = labeledResults
      .filter(([, res]) => res.error)
      .map(([label, res]) => ({ source: label, error: res.error! }));
    if (failures.length > 0) {
      logger.error(
        {
          userId: user.id,
          applicationId,
          failures: failures.map((f) => ({
            source: f.source,
            code: f.error.code,
            message: f.error.message,
          })),
        },
        'application-timeline: one or more sub-queries failed',
      );
      return c.json(
        {
          error: 'Failed to load timeline',
          failures: failures.map((f) => ({ source: f.source, code: f.error.code })),
        },
        500,
      );
    }

    // Referral bonus is its own helper that already returns a degraded value
    // on failure (logged inside loadReferralBonus). Treat it as best-effort.
    const referralBonusResult = await loadReferralBonus(application.company_name);

    const resume = {
      exists: !!resumeResult.data,
      last_at: (resumeResult.data?.updated_at as string | undefined) ?? null,
      session_id: (resumeResult.data?.id as string | undefined) ?? null,
    };
    const cover_letter: ArtifactSignal = {
      exists: !!(coverLetterResult.data ?? coverLetterSessionResult.data),
      last_at: (
        (coverLetterResult.data?.updated_at as string | undefined)
        ?? (coverLetterSessionResult.data?.updated_at as string | undefined)
        ?? null
      ),
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
