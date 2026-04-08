import { supabaseAdmin } from './supabase.js';

export interface ProductTelemetryRow {
  user_id: string;
  event_name: string;
  occurred_at: string;
  path: string;
  payload: Record<string, unknown> | null;
}

export interface ProductTelemetryFunnelStep {
  id: string;
  label: string;
  event_names: string[];
  users: number;
  events: number;
}

export interface ProductTelemetryWatchMetric {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  rate_pct: number | null;
  status: 'healthy' | 'watch' | 'needs_attention';
  note: string;
}

export interface ProductTelemetrySummary {
  generated_at: string;
  days: number;
  total_events: number;
  active_users: number;
  event_counts: Record<string, number>;
  funnel_steps: ProductTelemetryFunnelStep[];
  watch_metrics: ProductTelemetryWatchMetric[];
  path_breakdown: {
    smart_referrals: Record<string, number>;
    shortlist_entry_points: Record<string, number>;
    boolean_copy_targets: Record<string, number>;
  };
}

const FUNNEL_STEPS: Array<{
  id: string;
  label: string;
  eventNames: string[];
}> = [
  {
    id: 'career_profile_started',
    label: 'Career Profile Started',
    eventNames: ['career_profile_started'],
  },
  {
    id: 'resume_session_started',
    label: 'Resume Session Started',
    eventNames: ['resume_builder_session_started'],
  },
  {
    id: 'job_search_used',
    label: 'Job Search Used',
    eventNames: ['job_board_search_run', 'boolean_search_generated'],
  },
  {
    id: 'shortlist_built',
    label: 'Shortlist Built',
    eventNames: ['job_saved_to_shortlist', 'job_shortlist_opened'],
  },
  {
    id: 'smart_referrals_used',
    label: 'Smart Referrals Used',
    eventNames: ['smart_referrals_path_selected', 'smart_referrals_matches_opened'],
  },
  {
    id: 'outreach_started',
    label: 'Outreach Started',
    eventNames: ['smart_referrals_outreach_opened'],
  },
  {
    id: 'final_review_completed',
    label: 'Final Review Completed',
    eventNames: ['final_review_completed'],
  },
  {
    id: 'export_attempted',
    label: 'Export Attempted',
    eventNames: ['export_attempted'],
  },
];

export async function listProductTelemetryRows(days: number): Promise<ProductTelemetryRow[]> {
  const boundedDays = Number.isFinite(days) ? Math.max(1, Math.min(30, Math.floor(days))) : 7;
  const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('product_telemetry_events')
    .select('user_id,event_name,occurred_at,path,payload')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .range(0, 9999);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProductTelemetryRow[];
}

export function buildProductTelemetrySummary(rows: ProductTelemetryRow[], days: number): ProductTelemetrySummary {
  const eventCounts: Record<string, number> = {};
  const activeUsers = new Set<string>();
  const smartReferralsBreakdown: Record<string, number> = { network: 0, bonus: 0 };
  const shortlistEntryBreakdown: Record<string, number> = { overview_cta: 0, board_target: 0 };
  const booleanCopyBreakdown: Record<string, number> = { linkedin: 0, indeed: 0, titles: 0 };

  for (const row of rows) {
    activeUsers.add(row.user_id);
    eventCounts[row.event_name] = (eventCounts[row.event_name] ?? 0) + 1;

    if (row.event_name === 'smart_referrals_path_selected') {
      const path = typeof row.payload?.path === 'string' ? row.payload.path : null;
      if (path === 'network' || path === 'bonus') {
        smartReferralsBreakdown[path] = (smartReferralsBreakdown[path] ?? 0) + 1;
      }
    }

    if (row.event_name === 'job_shortlist_opened') {
      const entryPoint = typeof row.payload?.entry_point === 'string' ? row.payload.entry_point : null;
      if (entryPoint === 'overview_cta' || entryPoint === 'board_target') {
        shortlistEntryBreakdown[entryPoint] = (shortlistEntryBreakdown[entryPoint] ?? 0) + 1;
      }
    }

    if (row.event_name === 'boolean_search_copied') {
      const target = typeof row.payload?.target === 'string' ? row.payload.target : null;
      if (target === 'linkedin' || target === 'indeed' || target === 'titles') {
        booleanCopyBreakdown[target] = (booleanCopyBreakdown[target] ?? 0) + 1;
      }
    }
  }

  const funnelSteps = FUNNEL_STEPS.map((step) => {
    const users = new Set<string>();
    let events = 0;

    for (const row of rows) {
      if (!step.eventNames.includes(row.event_name)) continue;
      users.add(row.user_id);
      events += 1;
    }

    return {
      id: step.id,
      label: step.label,
      event_names: step.eventNames,
      users: users.size,
      events,
    };
  });

  const usersByStep = Object.fromEntries(
    funnelSteps.map((step) => [step.id, step.users]),
  ) as Record<string, number>;

  const buildRatioMetric = (
    id: string,
    label: string,
    numerator: number,
    denominator: number,
    note: string,
    thresholds: { healthy: number; watch: number },
  ): ProductTelemetryWatchMetric => {
    const rate = denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
    const status =
      rate === null
        ? 'watch'
        : rate >= thresholds.healthy
          ? 'healthy'
          : rate >= thresholds.watch
            ? 'watch'
            : 'needs_attention';

    return {
      id,
      label,
      numerator,
      denominator,
      rate_pct: rate,
      status,
      note,
    };
  };

  const networkSelections = smartReferralsBreakdown.network ?? 0;
  const bonusSelections = smartReferralsBreakdown.bonus ?? 0;
  const totalPathSelections = networkSelections + bonusSelections;

  const watchMetrics: ProductTelemetryWatchMetric[] = [
    buildRatioMetric(
      'job_search_to_shortlist',
      'Job Search -> Shortlist',
      usersByStep.shortlist_built ?? 0,
      usersByStep.job_search_used ?? 0,
      'Are people finding enough worthwhile roles to save?',
      { healthy: 40, watch: 20 },
    ),
    buildRatioMetric(
      'shortlist_to_resume',
      'Shortlist -> Resume Build',
      eventCounts.job_resume_build_requested ?? 0,
      usersByStep.shortlist_built ?? 0,
      'Are shortlisted roles turning into actual resume work?',
      { healthy: 35, watch: 15 },
    ),
    buildRatioMetric(
      'boolean_generate_to_copy',
      'Boolean Search -> Copy',
      eventCounts.boolean_search_copied ?? 0,
      eventCounts.boolean_search_generated ?? 0,
      'Are generated search strings useful enough to leave the product and use externally?',
      { healthy: 60, watch: 30 },
    ),
    buildRatioMetric(
      'smart_referrals_to_outreach',
      'Smart Referrals -> Outreach',
      usersByStep.outreach_started ?? 0,
      usersByStep.smart_referrals_used ?? 0,
      'Are referral paths making it all the way into outreach work?',
      { healthy: 30, watch: 15 },
    ),
    buildRatioMetric(
      'smart_referrals_network_share',
      'Smart Referrals Network Path Share',
      networkSelections,
      totalPathSelections,
      'The network path is the stronger default and should usually lead the room.',
      { healthy: 60, watch: 40 },
    ),
    buildRatioMetric(
      'profile_setup_retry_success',
      'Profile Setup Retry Success',
      eventCounts.profile_setup_retry_succeeded ?? 0,
      eventCounts.profile_setup_retry_requested ?? 0,
      'When master-resume creation needs a retry, the reveal-screen recovery should usually succeed.',
      { healthy: 80, watch: 50 },
    ),
  ];

  return {
    generated_at: new Date().toISOString(),
    days,
    total_events: rows.length,
    active_users: activeUsers.size,
    event_counts: eventCounts,
    funnel_steps: funnelSteps,
    watch_metrics: watchMetrics,
    path_breakdown: {
      smart_referrals: smartReferralsBreakdown,
      shortlist_entry_points: shortlistEntryBreakdown,
      boolean_copy_targets: booleanCopyBreakdown,
    },
  };
}
