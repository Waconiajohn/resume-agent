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

export interface ProductTelemetrySummary {
  generated_at: string;
  days: number;
  total_events: number;
  active_users: number;
  event_counts: Record<string, number>;
  funnel_steps: ProductTelemetryFunnelStep[];
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

  return {
    generated_at: new Date().toISOString(),
    days,
    total_events: rows.length,
    active_users: activeUsers.size,
    event_counts: eventCounts,
    funnel_steps: funnelSteps,
    path_breakdown: {
      smart_referrals: smartReferralsBreakdown,
      shortlist_entry_points: shortlistEntryBreakdown,
      boolean_copy_targets: booleanCopyBreakdown,
    },
  };
}
