export interface ProductTelemetryPayloadMap {
  route_viewed: {
    view: string;
    room: string | null;
  };
  career_profile_started: {
    readiness_percent: number;
    dashboard_state: string | null;
  };
  career_profile_completed: {
    readiness_percent: number;
  };
  career_profile_stalled: {
    dashboard_state: string | null;
    readiness_percent: number;
    focus_areas: string[];
  };
  profile_setup_retry_needed: {
    session_id: string;
    source: 'initial_complete' | 'retry';
  };
  profile_setup_retry_requested: {
    session_id: string;
    source: 'reveal';
  };
  profile_setup_retry_succeeded: {
    session_id: string;
    master_resume_id: string | null;
  };
  profile_setup_retry_failed: {
    session_id: string;
    reason: 'request_failed' | 'master_resume_not_created';
    message: string;
  };
  resume_builder_opened: {
    surface: string;
  };
  resume_builder_session_started: {
    source: string;
  };
  resume_rewrite_stalled: {
    session_id: string;
    has_resume: boolean;
    has_final_review: boolean;
  };
  final_review_requested: {
    session_id: string;
    company_name: string;
    role_title: string;
  };
  final_review_completed: {
    session_id: string;
    verdict: string;
    unresolved_critical_count: number;
  };
  final_review_stalled: {
    session_id: string;
    is_stale: boolean;
    unresolved_critical_count: number;
  };
  export_warning_acknowledged: {
    unresolved_critical_count: number;
    queue_needs_attention_count: number;
    queue_partial_count: number;
  };
  export_attempted: {
    format: string;
    export_blocked: boolean;
    has_completed_final_review: boolean;
    is_final_review_stale: boolean;
    unresolved_critical_count: number;
    unresolved_hard_gap_count: number;
    queue_needs_attention_count: number;
    queue_partial_count: number;
  };
  job_board_search_run: {
    query: string;
    location: string | null;
    date_posted: string;
    remote_type: string;
    source: 'manual' | 'watchlist';
  };
  job_saved_to_shortlist: {
    source: 'job_board';
    company_name: string;
    role_title: string;
    has_apply_url: boolean;
    job_source: string | null;
  };
  job_shortlist_opened: {
    entry_point: 'overview_cta' | 'board_target';
    shortlist_count: number;
  };
  job_resume_build_requested: {
    source: 'job_board' | 'pipeline' | 'suggestions';
    company_name: string | null;
    role_title: string | null;
  };
  boolean_search_generated: {
    title_count: number;
    has_resume_text: boolean;
  };
  boolean_search_copied: {
    target: 'linkedin' | 'indeed' | 'titles';
    title_count: number;
  };
  more_role_suggestions_requested: {
    source: 'boolean_search_panel' | 'suggestions_card';
  };
  smart_referrals_path_selected: {
    path: 'network' | 'bonus';
    source: 'user';
    has_connections: boolean;
  };
  smart_referrals_connections_imported: {
    total_rows: number;
    valid_rows: number;
    skipped_rows: number;
    duplicates_removed: number;
    unique_companies: number;
  };
  smart_referrals_matches_opened: {
    path: 'network' | 'bonus';
    initial_filter: 'network_connections' | 'bonus_search';
  };
  smart_referrals_outreach_opened: {
    path: 'network' | 'bonus';
    prefilled: boolean;
    trigger: 'manual' | 'referral_bonus';
  };
}

export type ProductTelemetryEventName = keyof ProductTelemetryPayloadMap;

export interface ProductTelemetryEvent<Name extends ProductTelemetryEventName = ProductTelemetryEventName> {
  id: string;
  name: Name;
  timestamp: string;
  path: string;
  payload: ProductTelemetryPayloadMap[Name];
}

const STORAGE_KEY = 'resume-agent:product-telemetry:v1';
const MAX_EVENTS = 200;
export const PRODUCT_TELEMETRY_SCHEMA_VERSION = 1;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function buildEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readEvents(): ProductTelemetryEvent[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductTelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: ProductTelemetryEvent[]) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Best effort only.
  }
}

function removeEventsById(eventIds: string[]) {
  if (eventIds.length === 0) return;
  const ids = new Set(eventIds);
  writeEvents(readEvents().filter((event) => !ids.has(event.id)));
}

export function trackProductEvent<Name extends ProductTelemetryEventName>(
  name: Name,
  payload: ProductTelemetryPayloadMap[Name],
): ProductTelemetryEvent<Name> | null {
  if (typeof window === 'undefined') return null;

  const event: ProductTelemetryEvent<Name> = {
    id: buildEventId(),
    name,
    timestamp: new Date().toISOString(),
    path: `${window.location.pathname}${window.location.search}`,
    payload,
  };

  const nextEvents = [...readEvents(), event];
  writeEvents(nextEvents);

  window.dispatchEvent(new CustomEvent<ProductTelemetryEvent<Name>>('resume-agent:product-telemetry', {
    detail: event,
  }));

  return event;
}

export function readProductTelemetryEvents(): ProductTelemetryEvent[] {
  return readEvents();
}

export function clearProductTelemetryEvents() {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort only.
  }
}

export function removeProductTelemetryEvents(eventIds: string[]) {
  if (!canUseStorage()) return;

  try {
    removeEventsById(eventIds);
  } catch {
    // Best effort only.
  }
}
