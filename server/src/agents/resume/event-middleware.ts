/**
 * Resume SSE Event Middleware
 *
 * Factory function that creates per-session SSE event processing middleware.
 * Handles workflow artifact persistence, panel state debouncing, section context
 * sanitization, runtime metrics tracking, and error sanitization for SSE broadcast.
 *
 * Usage:
 *   const mw = createResumeEventMiddleware(sessionId, pipelineRunStartedAt);
 *   // Pass mw.onEvent, mw.onComplete, mw.onError to the product route factory hooks.
 *   // Call mw.dispose() when the middleware is no longer needed.
 */

import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { parsePositiveInt } from '../../lib/http-body-guard.js';
import {
  type WorkflowNodeKey,
  workflowNodeFromStage,
} from '../../lib/workflow-nodes.js';
import {
  persistWorkflowArtifactBestEffort,
  upsertWorkflowNodeStatusBestEffort,
  resetWorkflowNodesForNewRunBestEffort,
} from '../../lib/workflow-persistence.js';
import type { PipelineSSEEvent } from '../types.js';

// ─── Configurable constants ───────────────────────────────────────────

const MAX_SECTION_CONTEXT_EVIDENCE_ITEMS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_EVIDENCE_ITEMS, 20);
const MAX_SECTION_CONTEXT_KEYWORDS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_KEYWORDS, 40);
const MAX_SECTION_CONTEXT_GAPS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_GAPS, 40);
const MAX_SECTION_CONTEXT_ORDER_ITEMS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_ORDER_ITEMS, 40);
const MAX_SECTION_CONTEXT_TEXT_CHARS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_TEXT_CHARS, 700);
const MAX_SECTION_CONTEXT_BLUEPRINT_BYTES = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_BLUEPRINT_BYTES, 120_000);
const MAX_SECTION_CONTEXT_SUGGESTIONS = parsePositiveInt(process.env.MAX_SECTION_CONTEXT_SUGGESTIONS, 5);
const MAX_SUGGESTION_QUESTION_TEXT_CHARS = parsePositiveInt(process.env.MAX_SUGGESTION_QUESTION_TEXT_CHARS, 300);
const MAX_SUGGESTION_CONTEXT_CHARS = parsePositiveInt(process.env.MAX_SUGGESTION_CONTEXT_CHARS, 200);
const MAX_SUGGESTION_OPTION_LABEL_CHARS = parsePositiveInt(process.env.MAX_SUGGESTION_OPTION_LABEL_CHARS, 40);
const MAX_SUGGESTION_ID_CHARS = parsePositiveInt(process.env.MAX_SUGGESTION_ID_CHARS, 80);

const PANEL_PERSIST_DEBOUNCE_MS = 250;
const MAX_QUEUED_PANEL_PERSISTS = parsePositiveInt(process.env.MAX_QUEUED_PANEL_PERSISTS, 50);

export const VALID_SUGGESTION_INTENTS = new Set([
  'address_requirement', 'weave_evidence', 'integrate_keyword',
  'quantify_bullet', 'tighten', 'strengthen_verb', 'align_positioning',
]);

export const VALID_RESOLUTION_TYPES = new Set([
  'keyword_present', 'evidence_referenced', 'requirement_addressed', 'always_recheck',
]);

// ─── Module-level registry for graceful shutdown ───────────────────────

const activeMiddlewares = new Set<() => Promise<number>>();

/**
 * Flush all queued panel persists across all active middleware instances.
 * Called during graceful server shutdown from index.ts.
 */
export async function flushAllQueuedPanelPersists(): Promise<number> {
  let total = 0;
  for (const flush of activeMiddlewares) {
    total += await flush();
  }
  return total;
}

// ─── Section context sanitization helpers ────────────────────────────

function truncateText(value: string, maxChars = MAX_SECTION_CONTEXT_TEXT_CHARS): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function clampFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sanitizeBlueprintSlice(slice: Record<string, unknown>): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(slice);
    if (serialized.length <= MAX_SECTION_CONTEXT_BLUEPRINT_BYTES) return slice;
    return {
      truncated: true,
      reason: 'blueprint_slice_too_large',
      max_bytes: MAX_SECTION_CONTEXT_BLUEPRINT_BYTES,
      keys: Object.keys(slice).slice(0, 25),
    };
  } catch (err) {
    logger.warn({ keys: Object.keys(slice), err }, 'blueprint_slice serialization failed');
    return {
      truncated: true,
      reason: 'blueprint_slice_serialization_failed',
    };
  }
}

export function sanitizeSectionContext(event: Extract<PipelineSSEEvent, { type: 'section_context' }>) {
  return {
    context_version: event.context_version,
    generated_at: event.generated_at,
    blueprint_slice: sanitizeBlueprintSlice(event.blueprint_slice),
    evidence: event.evidence.slice(0, MAX_SECTION_CONTEXT_EVIDENCE_ITEMS).map((e) => ({
      id: truncateText(e.id, 80),
      situation: truncateText(e.situation),
      action: truncateText(e.action),
      result: truncateText(e.result),
      metrics_defensible: e.metrics_defensible,
      user_validated: e.user_validated,
      mapped_requirements: e.mapped_requirements
        .slice(0, 8)
        .map((req) => truncateText(req, 180)),
      scope_metrics: Object.fromEntries(
        Object.entries(e.scope_metrics ?? {})
          .slice(0, 8)
          .map(([k, v]) => [truncateText(String(k), 40), truncateText(String(v), 120)]),
      ),
    })),
    keywords: event.keywords.slice(0, MAX_SECTION_CONTEXT_KEYWORDS).map((k) => ({
      keyword: truncateText(k.keyword, 80),
      target_density: clampFiniteNumber(k.target_density),
      current_count: clampFiniteNumber(k.current_count),
    })),
    gap_mappings: event.gap_mappings.slice(0, MAX_SECTION_CONTEXT_GAPS).map((g) => ({
      requirement: truncateText(g.requirement, 180),
      classification: g.classification,
    })),
    section_order: event.section_order.slice(0, MAX_SECTION_CONTEXT_ORDER_ITEMS).map((s) => truncateText(s, 60)),
    sections_approved: event.sections_approved.slice(0, MAX_SECTION_CONTEXT_ORDER_ITEMS).map((s) => truncateText(s, 60)),
    review_strategy: event.review_strategy === 'bundled' ? 'bundled' : 'per_section',
    review_required_sections: Array.isArray(event.review_required_sections)
      ? event.review_required_sections.slice(0, MAX_SECTION_CONTEXT_ORDER_ITEMS).map((s) => truncateText(String(s), 60))
      : undefined,
    auto_approved_sections: Array.isArray(event.auto_approved_sections)
      ? event.auto_approved_sections.slice(0, MAX_SECTION_CONTEXT_ORDER_ITEMS).map((s) => truncateText(String(s), 60))
      : undefined,
    current_review_bundle_key:
      event.current_review_bundle_key === 'headline'
      || event.current_review_bundle_key === 'core_experience'
      || event.current_review_bundle_key === 'supporting'
        ? event.current_review_bundle_key
        : undefined,
    review_bundles: Array.isArray(event.review_bundles)
      ? event.review_bundles
          .filter((b) => b && typeof b === 'object')
          .slice(0, 6)
          .map((b) => ({
            key: (b.key === 'headline' || b.key === 'core_experience' || b.key === 'supporting') ? b.key : 'supporting',
            label: truncateText(String(b.label ?? ''), 40),
            total_sections: clampFiniteNumber(b.total_sections),
            review_required: clampFiniteNumber(b.review_required),
            reviewed_required: clampFiniteNumber(b.reviewed_required),
            status:
              b.status === 'complete' || b.status === 'in_progress' || b.status === 'auto_approved'
                ? b.status
                : 'pending',
          }))
      : undefined,
    suggestions: Array.isArray(event.suggestions)
      ? event.suggestions
          .filter((s) => s && typeof s === 'object' && typeof s.question_text === 'string' && VALID_SUGGESTION_INTENTS.has(s.intent))
          .slice(0, MAX_SECTION_CONTEXT_SUGGESTIONS)
          .map((s) => ({
            id: truncateText(s.id, MAX_SUGGESTION_ID_CHARS),
            intent: s.intent,
            question_text: truncateText(s.question_text, MAX_SUGGESTION_QUESTION_TEXT_CHARS),
            ...(s.context ? { context: truncateText(s.context, MAX_SUGGESTION_CONTEXT_CHARS) } : {}),
            ...(s.target_id ? { target_id: truncateText(s.target_id, MAX_SUGGESTION_ID_CHARS) } : {}),
            options: Array.isArray(s.options)
              ? s.options.slice(0, 4).map((o: { id: string; label: string; action: string }) => ({
                  id: truncateText(String(o.id ?? ''), MAX_SUGGESTION_ID_CHARS),
                  label: truncateText(String(o.label ?? ''), MAX_SUGGESTION_OPTION_LABEL_CHARS),
                  action: o.action === 'skip' ? 'skip' as const : 'apply' as const,
                }))
              : [],
            priority: clampFiniteNumber(s.priority),
            priority_tier: ['high', 'medium', 'low'].includes(s.priority_tier) ? s.priority_tier : 'low',
            resolved_when: s.resolved_when && typeof s.resolved_when === 'object' && VALID_RESOLUTION_TYPES.has(s.resolved_when.type)
              ? {
                  type: s.resolved_when.type,
                  target_id: truncateText(String(s.resolved_when.target_id ?? ''), MAX_SUGGESTION_ID_CHARS),
                }
              : { type: 'always_recheck' as const, target_id: '' },
          }))
      : undefined,
  };
}

export type SanitizedSectionContext = ReturnType<typeof sanitizeSectionContext>;

export function deriveSectionBundleStatusFromContext(
  context: SanitizedSectionContext,
  justApprovedSection?: string,
) {
  if (context.review_strategy !== 'bundled' || !Array.isArray(context.review_bundles) || context.review_bundles.length === 0) {
    return null;
  }

  const approved = new Set(context.sections_approved);
  if (justApprovedSection) approved.add(justApprovedSection);
  const reviewRequiredSet = new Set(context.review_required_sections ?? []);

  const sectionToBundle = (section: string): 'headline' | 'core_experience' | 'supporting' => {
    if (section === 'summary' || section === 'selected_accomplishments') return 'headline';
    if (section.startsWith('experience_role_')) return 'core_experience';
    return 'supporting';
  };

  const bundles = context.review_bundles.map((bundle) => {
    const sectionsInBundle = context.section_order.filter((section) => sectionToBundle(section) === bundle.key);
    const reviewRequiredSections = sectionsInBundle.filter((section) => reviewRequiredSet.has(section));
    const reviewedRequired = reviewRequiredSections.filter((section) => approved.has(section)).length;
    let status: 'pending' | 'in_progress' | 'complete' | 'auto_approved' = 'pending';
    if (reviewRequiredSections.length === 0) {
      status = sectionsInBundle.length > 0 ? 'auto_approved' : 'pending';
    } else if (reviewedRequired >= reviewRequiredSections.length) {
      status = 'complete';
    } else if (bundle.key === context.current_review_bundle_key || reviewedRequired > 0) {
      status = 'in_progress';
    }
    return {
      key: bundle.key,
      label: bundle.label,
      total_sections: sectionsInBundle.length,
      review_required: reviewRequiredSections.length,
      reviewed_required: reviewedRequired,
      status,
    };
  });

  const totalBundles = bundles.length;
  const completedBundles = bundles.filter((bundle) => bundle.status === 'complete' || bundle.status === 'auto_approved').length;

  return {
    review_strategy: 'bundled' as const,
    current_review_bundle_key: context.current_review_bundle_key ?? null,
    review_required_sections: context.review_required_sections ?? [],
    auto_approved_sections: context.auto_approved_sections ?? [],
    total_bundles: totalBundles,
    completed_bundles: completedBundles,
    bundles,
    sections_approved_count: approved.size,
    section_order_count: context.section_order.length,
    updated_at: new Date().toISOString(),
  };
}

// ─── Workflow node mapping ────────────────────────────────────────────

export function workflowNodeFromPanelType(panelType: string): WorkflowNodeKey | null {
  switch (panelType) {
    case 'onboarding_summary':
      return 'overview';
    case 'research_dashboard':
      return 'benchmark';
    case 'gap_analysis':
      return 'gaps';
    case 'questionnaire':
    case 'positioning_interview':
      return 'questions';
    case 'blueprint_review':
    case 'design_options':
      return 'blueprint';
    case 'section_review':
    case 'live_resume':
      return 'sections';
    case 'quality_dashboard':
      return 'quality';
    case 'completion':
      return 'export';
    default:
      return null;
  }
}

// Workflow persistence helpers — imported from shared module, re-exported for tests
export { resetWorkflowNodesForNewRunBestEffort } from '../../lib/workflow-persistence.js';

// ─── Stage completion summary helper ─────────────────────────────────

/**
 * Builds a human-readable summary message for a stage_complete event.
 * Returns null for stages that do not warrant a summary (e.g., internal
 * substages that users do not need to see).
 *
 * Where possible, data from the event payload is used. For most stages the
 * event only carries a `stage` and `message` field, so summaries are
 * descriptive rather than data-interpolated.
 */
function buildStageSummaryMessage(
  event: Extract<PipelineSSEEvent, { type: 'stage_complete' }>,
): string | null {
  const stage = event.stage;

  switch (stage) {
    case 'intake':
      return 'Parsed your resume: extracted career history, key achievements, and leadership transitions. Now analyzing the job description...';

    case 'research':
      return 'Completed market analysis: built benchmark profile and identified competitive positioning opportunities.';

    case 'gap_analysis':
      return event.message
        ? `Gap analysis complete: ${event.message}`
        : 'Gap analysis complete: requirements evaluated, strong matches identified, and positioning strategies defined for gaps.';

    case 'architect':
      return 'Blueprint designed: sections planned with evidence allocated to highest-impact positions.';

    case 'section_writing':
      return event.message
        ? `Section drafted and passed quality self-review. ${event.message}`
        : 'Section drafted and passed quality self-review.';

    case 'quality_review':
      return 'Quality review complete: all dimensions evaluated, ATS compatibility verified, and authenticity confirmed.';

    case 'positioning':
    case 'architect_review':
    case 'section_review':
    case 'revision':
    case 'complete':
      return null;

    default:
      return null;
  }
}

// ─── Question response persistence ───────────────────────────────────

function inferQuestionResponseStatus(response: unknown): 'answered' | 'skipped' | 'deferred' {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (r.status === 'deferred' || r.deferred === true) return 'deferred';
    if (r.skipped === true) return 'skipped';
  }
  return 'answered';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractQuestionnaireResponsesForPersistence(response: unknown): Array<{
  question_id: string;
  stage: string;
  status: 'answered' | 'skipped' | 'deferred';
  response: unknown;
  impact_tag?: string | null;
}> {
  const payload = asRecord(response);
  if (!payload) return [];
  const questionnaireId = typeof payload.questionnaire_id === 'string' ? payload.questionnaire_id.trim() : '';
  const stage = typeof payload.stage === 'string' && payload.stage.trim() ? payload.stage.trim() : 'unknown';
  const responses = Array.isArray(payload.responses) ? payload.responses : [];
  if (!questionnaireId || responses.length === 0) return [];

  const rows: Array<{
    question_id: string;
    stage: string;
    status: 'answered' | 'skipped' | 'deferred';
    response: unknown;
    impact_tag?: string | null;
  }> = [];

  for (const item of responses) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const rawQuestionId = typeof rec.question_id === 'string' ? rec.question_id.trim() : '';
    if (!rawQuestionId) continue;
    const impactTag = rec.impact_tag === 'high' || rec.impact_tag === 'medium' || rec.impact_tag === 'low'
      ? rec.impact_tag
      : null;
    rows.push({
      question_id: `${questionnaireId}:${rawQuestionId}`,
      stage,
      status: inferQuestionResponseStatus(rec),
      response: {
        selected_option_ids: Array.isArray(rec.selected_option_ids)
          ? rec.selected_option_ids.filter((v): v is string => typeof v === 'string').slice(0, 12)
          : [],
        ...(typeof rec.custom_text === 'string' ? { custom_text: rec.custom_text } : {}),
        skipped: rec.skipped === true,
        ...(impactTag ? { impact_tag: impactTag } : {}),
        ...(typeof rec.payoff_hint === 'string' ? { payoff_hint: rec.payoff_hint.slice(0, 240) } : {}),
        ...(Array.isArray(rec.topic_keys)
          ? {
              topic_keys: rec.topic_keys
                .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                .map((v) => v.trim().toLowerCase())
                .slice(0, 8),
            }
          : {}),
        ...(typeof rec.benchmark_edit_version === 'number'
          ? { benchmark_edit_version: rec.benchmark_edit_version }
          : (rec.benchmark_edit_version === null ? { benchmark_edit_version: null } : {})),
      },
      impact_tag: impactTag,
    });
  }

  return rows;
}

async function persistQuestionResponseBestEffort(
  sessionId: string,
  questionId: string,
  stage: string,
  response: unknown,
) {
  const status = inferQuestionResponseStatus(response);
  const payload = {
    session_id: sessionId,
    question_id: questionId,
    stage,
    status,
    response,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from('session_question_responses')
    .upsert(payload, { onConflict: 'session_id,question_id' });
  if (error) {
    logger.warn({ session_id: sessionId, question_id: questionId, error: error.message }, 'Failed to persist question response');
  }

  const nestedQuestionnaireRows = extractQuestionnaireResponsesForPersistence(response).map((row) => ({
    session_id: sessionId,
    question_id: row.question_id,
    stage: row.stage,
    status: row.status,
    response: row.response,
    impact_tag: row.impact_tag ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (nestedQuestionnaireRows.length > 0) {
    const { error: nestedError } = await supabaseAdmin
      .from('session_question_responses')
      .upsert(nestedQuestionnaireRows, { onConflict: 'session_id,question_id' });
    if (nestedError) {
      logger.warn({ session_id: sessionId, question_id: questionId, error: nestedError.message }, 'Failed to persist questionnaire response analytics rows');
    }
  }
}

// ─── Panel persistence ─────────────────────────────────────────────────

async function persistLastPanelState(sessionId: string, panelType: string, panelData: unknown) {
  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      last_panel_type: panelType,
      last_panel_data: panelData,
    })
    .eq('id', sessionId);
  if (error) {
    logger.warn(
      { session_id: sessionId, panel_type: panelType, error: error.message },
      'Failed to persist last panel state',
    );
  }
}

// ─── Middleware interface ─────────────────────────────────────────────

export interface ResumeEventMiddleware {
  /** onEvent hook — call for every SSE event. Returns sanitized event for broadcast. */
  onEvent: (event: PipelineSSEEvent, sessionId: string) => PipelineSSEEvent | void;
  /** onComplete hook — pipeline success cleanup */
  onComplete: (sessionId: string) => Promise<void>;
  /** onError hook — pipeline failure cleanup */
  onError: (sessionId: string, error: unknown) => Promise<void>;
  /** Flush all queued panel persists for this middleware instance */
  flushPanelPersists: () => Promise<number>;
  /** Dispose this middleware (remove from global registry) */
  dispose: () => void;
}

// ─── Factory ──────────────────────────────────────────────────────────

export function createResumeEventMiddleware(
  sessionId: string,
  pipelineRunStartedAt = new Date().toISOString(),
): ResumeEventMiddleware {

  // ─── Closure state ────────────────────────────────────────────────

  let latestSectionContext: {
    section: string;
    context: SanitizedSectionContext;
  } | null = null;

  const runtimeMetricsState: {
    run_started_at: string;
    first_progress_at: string | null;
    first_progress_event_type: string | null;
    first_action_ready_at: string | null;
    first_action_ready_event_type: string | null;
    latest_event_at: string;
    latest_event_type: string;
    stage_durations_ms: Record<string, number>;
  } = {
    run_started_at: pipelineRunStartedAt,
    first_progress_at: null,
    first_progress_event_type: null,
    first_action_ready_at: null,
    first_action_ready_event_type: null,
    latest_event_at: pipelineRunStartedAt,
    latest_event_type: 'pipeline_start',
    stage_durations_ms: {},
  };

  const queuedPanelPersists = new Map<string, {
    panelType: string;
    panelData: unknown;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  // ─── Panel persist helpers ─────────────────────────────────────────

  function cancelQueuedPanelPersist(sid: string) {
    const queued = queuedPanelPersists.get(sid);
    if (!queued) return;
    clearTimeout(queued.timeout);
    queuedPanelPersists.delete(sid);
  }

  function queuePanelPersist(sid: string, panelType: string, panelData: unknown) {
    if (!queuedPanelPersists.has(sid) && queuedPanelPersists.size >= MAX_QUEUED_PANEL_PERSISTS) {
      logger.warn(
        { queue_size: queuedPanelPersists.size, max: MAX_QUEUED_PANEL_PERSISTS, session_id: sid },
        'queuedPanelPersists at capacity; skipping new persist',
      );
      return;
    }
    cancelQueuedPanelPersist(sid);
    const timeout = setTimeout(() => {
      queuedPanelPersists.delete(sid);
      void persistLastPanelState(sid, panelType, panelData);
    }, PANEL_PERSIST_DEBOUNCE_MS);
    timeout.unref?.();
    queuedPanelPersists.set(sid, { panelType, panelData, timeout });
  }

  async function flushQueuedPanelPersist(sid: string) {
    const queued = queuedPanelPersists.get(sid);
    if (!queued) return;
    clearTimeout(queued.timeout);
    queuedPanelPersists.delete(sid);
    await persistLastPanelState(sid, queued.panelType, queued.panelData);
  }

  const flushPanelPersists = async (): Promise<number> => {
    const entries = Array.from(queuedPanelPersists.entries());
    for (const [sid, queued] of entries) {
      clearTimeout(queued.timeout);
      queuedPanelPersists.delete(sid);
    }

    if (entries.length === 0) return 0;

    const results = await Promise.allSettled(
      entries.map(([sid, queued]) =>
        persistLastPanelState(sid, queued.panelType, queued.panelData),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      logger.warn({ attempted: entries.length, failed }, 'Some queued panel persists failed during flush');
    }
    return entries.length - failed;
  };

  // Register this instance in the global registry for graceful shutdown
  activeMiddlewares.add(flushPanelPersists);

  // ─── Runtime metrics helpers ────────────────────────────────────────

  const persistPipelineActivityStatusBestEffort = (event: PipelineSSEEvent) => {
    const nowIso = new Date().toISOString();
    let payload: Record<string, unknown> | null = null;

    if (event.type === 'stage_start') {
      payload = {
        processing_state: 'processing',
        stage: event.stage,
        stage_started_at: nowIso,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: event.message,
        current_activity_source: 'stage_start',
        expected_next_action: 'Wait for the next backend update or a review/question step',
      };
    } else if (event.type === 'stage_complete') {
      payload = {
        processing_state: 'idle',
        stage: event.stage,
        stage_started_at: null,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        last_stage_duration_ms: typeof event.duration_ms === 'number' ? Math.max(0, event.duration_ms) : null,
        current_activity_message: event.message,
        current_activity_source: 'stage_complete',
        expected_next_action: 'Wait for the next workflow step or required action',
      };
    } else if (event.type === 'transparency') {
      payload = {
        processing_state: 'processing',
        stage: event.stage,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: event.message,
        current_activity_source: 'transparency',
      };
    } else if (event.type === 'positioning_question') {
      payload = {
        processing_state: 'waiting_for_input',
        stage: 'positioning',
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: 'Step 3 question is ready. Waiting for your answer.',
        current_activity_source: 'gate',
        expected_next_action: 'Answer the Why Me question in the workspace',
      };
    } else if (event.type === 'questionnaire') {
      payload = {
        processing_state: 'waiting_for_input',
        stage: typeof event.stage === 'string' ? event.stage : null,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: typeof event.title === 'string' ? `${event.title} is ready for your input.` : 'A questionnaire is ready for your input.',
        current_activity_source: 'gate',
        expected_next_action: 'Complete the questionnaire in the workspace',
      };
    } else if (event.type === 'blueprint_ready') {
      payload = {
        processing_state: 'waiting_for_input',
        stage: 'architect_review',
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: 'Step 5 blueprint is ready for review.',
        current_activity_source: 'gate',
        expected_next_action: 'Review and approve the blueprint in the workspace',
      };
    } else if (event.type === 'section_draft') {
      payload = {
        processing_state: 'waiting_for_input',
        stage: 'section_review',
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: `Section draft ready: ${event.section}`,
        current_activity_source: 'gate',
        expected_next_action: 'Review the section draft in Step 6',
      };
    } else if (event.type === 'pipeline_complete') {
      payload = {
        processing_state: 'complete',
        stage: 'complete',
        stage_started_at: null,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: 'Resume pipeline complete. Final resume and export checks are ready.',
        current_activity_source: 'stage_complete',
        expected_next_action: 'Review Step 7 results and export your resume',
      };
    } else if (event.type === 'pipeline_error') {
      payload = {
        processing_state: 'error',
        stage: event.stage,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: `Pipeline error: ${event.error}`,
        current_activity_source: 'system',
        expected_next_action: 'Refresh state or restart the pipeline',
      };
    } else if (
      event.type === 'workflow_replan_requested'
      || event.type === 'workflow_replan_started'
      || event.type === 'workflow_replan_completed'
    ) {
      payload = {
        processing_state: event.type === 'workflow_replan_completed' ? 'idle' : 'processing',
        stage: event.current_stage,
        last_progress_at: nowIso,
        last_backend_activity_at: nowIso,
        current_activity_message: event.message
          ?? (event.type === 'workflow_replan_requested'
            ? 'Benchmark assumptions changed. The pipeline will replan downstream work.'
            : event.type === 'workflow_replan_started'
              ? 'Applying benchmark updates and rebuilding downstream work.'
              : 'Benchmark replan completed for the current run.'),
        current_activity_source: 'system',
        expected_next_action: event.type === 'workflow_replan_requested' && event.requires_restart
          ? 'Restart and rebuild from the workspace banner'
          : null,
      };
    }

    if (payload) {
      persistWorkflowArtifactBestEffort(sessionId, 'overview', 'pipeline_activity_status', payload, 'system');
    }
  };

  const persistPipelineRuntimeMetricsBestEffort = (event: PipelineSSEEvent) => {
    const eventType = event.type;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    runtimeMetricsState.latest_event_at = nowIso;
    runtimeMetricsState.latest_event_type = eventType;

    const isProgressEvent =
      eventType === 'stage_start'
      || eventType === 'stage_complete'
      || eventType === 'transparency'
      || eventType === 'positioning_question'
      || eventType === 'questionnaire'
      || eventType === 'positioning_profile_found'
      || eventType === 'blueprint_ready'
      || eventType === 'section_draft'
      || eventType === 'quality_scores'
      || eventType === 'revision_start'
      || eventType === 'workflow_replan_requested'
      || eventType === 'workflow_replan_started'
      || eventType === 'workflow_replan_completed'
      || eventType === 'pipeline_complete'
      || eventType === 'pipeline_error';

    if (isProgressEvent && !runtimeMetricsState.first_progress_at) {
      runtimeMetricsState.first_progress_at = nowIso;
      runtimeMetricsState.first_progress_event_type = eventType;
    }

    const isActionReadyEvent =
      eventType === 'positioning_question'
      || eventType === 'questionnaire'
      || eventType === 'positioning_profile_found'
      || eventType === 'blueprint_ready'
      || eventType === 'section_draft';

    if (isActionReadyEvent && !runtimeMetricsState.first_action_ready_at) {
      runtimeMetricsState.first_action_ready_at = nowIso;
      runtimeMetricsState.first_action_ready_event_type = eventType;
    }

    if (event.type === 'stage_complete' && typeof event.duration_ms === 'number' && Number.isFinite(event.duration_ms)) {
      runtimeMetricsState.stage_durations_ms[event.stage] = Math.max(0, Math.round(event.duration_ms));
    }

    const shouldPersist = isProgressEvent;
    if (!shouldPersist) return;

    const runStartedMs = new Date(runtimeMetricsState.run_started_at).getTime();
    const firstProgressMs = runtimeMetricsState.first_progress_at ? new Date(runtimeMetricsState.first_progress_at).getTime() : null;
    const firstActionReadyMs = runtimeMetricsState.first_action_ready_at ? new Date(runtimeMetricsState.first_action_ready_at).getTime() : null;

    persistWorkflowArtifactBestEffort(sessionId, 'overview', 'pipeline_runtime_metrics', {
      run_started_at: runtimeMetricsState.run_started_at,
      first_progress_at: runtimeMetricsState.first_progress_at,
      first_progress_event_type: runtimeMetricsState.first_progress_event_type,
      first_progress_delay_ms:
        firstProgressMs != null && Number.isFinite(runStartedMs)
          ? Math.max(0, firstProgressMs - runStartedMs)
          : null,
      first_action_ready_at: runtimeMetricsState.first_action_ready_at,
      first_action_ready_event_type: runtimeMetricsState.first_action_ready_event_type,
      first_action_ready_delay_ms:
        firstActionReadyMs != null && Number.isFinite(runStartedMs)
          ? Math.max(0, firstActionReadyMs - runStartedMs)
          : null,
      latest_event_at: runtimeMetricsState.latest_event_at,
      latest_event_type: runtimeMetricsState.latest_event_type,
      stage_durations_ms: runtimeMetricsState.stage_durations_ms,
    }, 'system');
  };

  // ─── Per-event dispatch (core onEvent logic) ────────────────────────

  const onEvent = (event: PipelineSSEEvent, _sid: string): PipelineSSEEvent | void => {
    persistPipelineActivityStatusBestEffort(event);
    persistPipelineRuntimeMetricsBestEffort(event);

    if (event.type === 'stage_start') {
      upsertWorkflowNodeStatusBestEffort(sessionId, workflowNodeFromStage(event.stage), 'in_progress', {
        stage: event.stage,
      });
      void (async () => {
        try {
          const { error } = await supabaseAdmin
            .from('coach_sessions')
            .update({ pipeline_stage: event.stage })
            .eq('id', sessionId);
          if (error) {
            logger.warn({ session_id: sessionId, stage: event.stage, error: error.message }, 'Failed to persist pipeline stage');
          }
        } catch (err) {
          logger.warn(
            { session_id: sessionId, stage: event.stage, error: err instanceof Error ? err.message : String(err) },
            'Failed to persist pipeline stage',
          );
        }
      })();
    }

    if (event.type === 'questionnaire') {
      queuePanelPersist(sessionId, 'questionnaire', event);
      upsertWorkflowNodeStatusBestEffort(sessionId, 'questions', 'blocked', {
        stage: event.stage,
        questionnaire_id: event.questionnaire_id,
      });
      persistWorkflowArtifactBestEffort(sessionId, 'questions', 'questionnaire', event);
    }

    if (event.type === 'right_panel_update') {
      queuePanelPersist(sessionId, event.panel_type, event.data);
      const nodeKey = workflowNodeFromPanelType(event.panel_type);
      if (nodeKey) {
        persistWorkflowArtifactBestEffort(sessionId, nodeKey, `panel_${event.panel_type}`, event.data);
      }
    }

    if (event.type === 'section_context') {
      const sanitizedContext = sanitizeSectionContext(event);
      latestSectionContext = {
        section: event.section,
        context: sanitizedContext,
      };
      const bundleStatus = deriveSectionBundleStatusFromContext(sanitizedContext);
      if (bundleStatus) {
        persistWorkflowArtifactBestEffort(sessionId, 'sections', 'sections_bundle_review_status', bundleStatus, 'system');
      }
    }

    if (event.type === 'section_draft') {
      const contextForSection =
        latestSectionContext?.section === event.section
          ? latestSectionContext.context
          : null;
      queuePanelPersist(sessionId, 'section_review', {
        section: event.section,
        content: event.content,
        review_token: event.review_token,
        ...(contextForSection ? { context: contextForSection } : {}),
      });
      upsertWorkflowNodeStatusBestEffort(sessionId, 'sections', 'blocked', { section: event.section });
      persistWorkflowArtifactBestEffort(sessionId, 'sections', 'section_review', {
        section: event.section,
        content: event.content,
        review_token: event.review_token,
        ...(contextForSection ? { context: contextForSection } : {}),
      });
    }

    if (event.type === 'blueprint_ready') {
      queuePanelPersist(sessionId, 'blueprint_review', event.blueprint);
      upsertWorkflowNodeStatusBestEffort(sessionId, 'blueprint', 'blocked');
      persistWorkflowArtifactBestEffort(sessionId, 'blueprint', 'blueprint', event.blueprint);
    }

    if (event.type === 'positioning_question') {
      upsertWorkflowNodeStatusBestEffort(sessionId, 'questions', 'blocked', {
        question_id: event.question.id,
      });
      persistWorkflowArtifactBestEffort(sessionId, 'questions', 'positioning_question', event);
    }

    if (event.type === 'quality_scores') {
      upsertWorkflowNodeStatusBestEffort(sessionId, 'quality', 'complete');
      persistWorkflowArtifactBestEffort(sessionId, 'quality', 'quality_scores', event.scores);
    }

    if (event.type === 'section_approved') {
      const contextForSection =
        latestSectionContext?.section === event.section
          ? latestSectionContext.context
          : null;
      if (contextForSection) {
        const bundleStatus = deriveSectionBundleStatusFromContext(contextForSection, event.section);
        if (bundleStatus) {
          persistWorkflowArtifactBestEffort(sessionId, 'sections', 'sections_bundle_review_status', bundleStatus, 'system');
        }
      }
    }

    if (event.type === 'draft_readiness_update') {
      persistWorkflowArtifactBestEffort(sessionId, 'overview', 'draft_readiness', event);
      upsertWorkflowNodeStatusBestEffort(sessionId, 'overview', event.ready ? 'complete' : 'in_progress', {
        stage: event.stage,
        draft_ready: event.ready,
        evidence_count: event.evidence_count,
        minimum_evidence_target: event.minimum_evidence_target,
        coverage_score: event.coverage_score,
        coverage_threshold: event.coverage_threshold,
      });
    }

    if (event.type === 'draft_path_decision') {
      persistWorkflowArtifactBestEffort(sessionId, 'overview', 'draft_path_decision', event, 'system');
    }

    if (event.type === 'questionnaire_reuse_summary') {
      persistWorkflowArtifactBestEffort(sessionId, 'questions', 'questionnaire_reuse_summary', event, 'system');
    }

    if (
      event.type === 'workflow_replan_requested'
      || event.type === 'workflow_replan_started'
      || event.type === 'workflow_replan_completed'
    ) {
      persistWorkflowArtifactBestEffort(sessionId, 'overview', 'workflow_replan_status', event, 'system');
      if (event.type === 'workflow_replan_requested') {
        upsertWorkflowNodeStatusBestEffort(sessionId, 'overview', 'in_progress', {
          replan_state: 'requested',
          replan_reason: event.reason,
          benchmark_edit_version: event.benchmark_edit_version,
          rebuild_from_stage: event.rebuild_from_stage,
          requires_restart: event.requires_restart,
        });
      } else if (event.type === 'workflow_replan_started') {
        upsertWorkflowNodeStatusBestEffort(sessionId, 'overview', 'in_progress', {
          replan_state: 'in_progress',
          replan_reason: event.reason,
          benchmark_edit_version: event.benchmark_edit_version,
          rebuild_from_stage: event.rebuild_from_stage,
          phase: event.phase,
        });
      } else {
        upsertWorkflowNodeStatusBestEffort(sessionId, 'overview', 'complete', {
          replan_state: 'completed',
          replan_reason: event.reason,
          benchmark_edit_version: event.benchmark_edit_version,
          rebuild_from_stage: event.rebuild_from_stage,
          rebuilt_through_stage: event.rebuilt_through_stage,
        });
      }
    }

    if (event.type === 'stage_complete') {
      upsertWorkflowNodeStatusBestEffort(sessionId, workflowNodeFromStage(event.stage), 'complete', {
        stage: event.stage,
      });
      const stageSummaryMessage = buildStageSummaryMessage(event);
      if (stageSummaryMessage) {
        persistWorkflowArtifactBestEffort(
          sessionId,
          workflowNodeFromStage(event.stage),
          `stage_summary_${event.stage}`,
          {
            stage: event.stage,
            message: stageSummaryMessage,
            emitted_at: new Date().toISOString(),
            source: 'stage_complete',
          },
          'system',
        );
      }
    }

    if (event.type === 'pipeline_error') {
      upsertWorkflowNodeStatusBestEffort(sessionId, workflowNodeFromStage(event.stage), 'stale', {
        error: event.error,
      });
      cancelQueuedPanelPersist(sessionId);
      // Sanitize error before broadcasting — internal details must not leak via SSE
      return { ...event, error: 'An internal error occurred. Please try again.' };
    }

    if (event.type === 'pipeline_complete') {
      cancelQueuedPanelPersist(sessionId);
      void persistLastPanelState(sessionId, 'completion', { resume: event.resume });
      upsertWorkflowNodeStatusBestEffort(sessionId, 'export', 'complete');
      persistWorkflowArtifactBestEffort(sessionId, 'export', 'completion', { resume: event.resume });
    }

    // Return void — event is broadcast unchanged (except pipeline_error which returns early above)
  };

  // ─── Lifecycle hooks ───────────────────────────────────────────────

  const onComplete = async (sid: string): Promise<void> => {
    await flushQueuedPanelPersist(sid);
  };

  const onError = async (sid: string, _error: unknown): Promise<void> => {
    cancelQueuedPanelPersist(sid);
    await flushQueuedPanelPersist(sid);
  };

  const dispose = () => {
    activeMiddlewares.delete(flushPanelPersists);
  };

  return {
    onEvent,
    onComplete,
    onError,
    flushPanelPersists,
    dispose,
  };
}
