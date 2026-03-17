export type ProductTelemetryEventName =
  | 'route_viewed'
  | 'career_profile_started'
  | 'career_profile_completed'
  | 'career_profile_stalled'
  | 'resume_builder_opened'
  | 'resume_builder_session_started'
  | 'resume_rewrite_stalled'
  | 'final_review_requested'
  | 'final_review_completed'
  | 'final_review_stalled'
  | 'export_warning_acknowledged'
  | 'export_attempted';

export interface ProductTelemetryEvent {
  id: string;
  name: ProductTelemetryEventName;
  timestamp: string;
  path: string;
  payload: Record<string, unknown>;
}

const STORAGE_KEY = 'resume-agent:product-telemetry:v1';
const MAX_EVENTS = 200;

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

export function trackProductEvent(
  name: ProductTelemetryEventName,
  payload: Record<string, unknown> = {},
): ProductTelemetryEvent | null {
  if (typeof window === 'undefined') return null;

  const event: ProductTelemetryEvent = {
    id: buildEventId(),
    name,
    timestamp: new Date().toISOString(),
    path: `${window.location.pathname}${window.location.search}`,
    payload,
  };

  const nextEvents = [...readEvents(), event];
  writeEvents(nextEvents);

  window.dispatchEvent(new CustomEvent<ProductTelemetryEvent>('resume-agent:product-telemetry', {
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
