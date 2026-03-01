/**
 * useSSEDataValidation.ts
 *
 * Pure utility functions for parsing and sanitizing SSE event payloads.
 * No React hooks — these are plain TypeScript functions exported directly.
 */

import type { WorkflowReplanUpdate } from '@/types/session';
import type { SectionWorkbenchContext, SectionSuggestion } from '@/types/panels';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SUGGESTION_LIMITS = {
  max_count: 5,
  max_question_text_chars: 300,
  max_context_chars: 200,
  max_option_label_chars: 40,
  max_id_chars: 80,
};

export const VALID_INTENTS = new Set([
  'address_requirement',
  'weave_evidence',
  'integrate_keyword',
  'quantify_bullet',
  'tighten',
  'strengthen_verb',
  'align_positioning',
]);

// ─── Parsing ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeParse(data: string): Record<string, any> | null {
  try {
    return JSON.parse(data);
  } catch {
    console.warn('[useAgent] Failed to parse SSE data:', data?.substring(0, 200));
    return null;
  }
}

// ─── Type coercions ───────────────────────────────────────────────────────────

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function asGapClassification(value: unknown): 'strong' | 'partial' | 'gap' {
  if (value === 'strong' || value === 'partial' || value === 'gap') return value;
  return 'gap';
}

export function asPriorityTier(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

export function asReplanStaleNodes(value: unknown): WorkflowReplanUpdate['stale_nodes'] {
  if (!Array.isArray(value)) return undefined;
  const nodes = value.filter(
    (v): v is NonNullable<WorkflowReplanUpdate['stale_nodes']>[number] =>
      v === 'gaps' ||
      v === 'questions' ||
      v === 'blueprint' ||
      v === 'sections' ||
      v === 'quality' ||
      v === 'export',
  );
  return nodes.length > 0 ? nodes : undefined;
}

// ─── Sanitizers ───────────────────────────────────────────────────────────────

export function sanitizeSectionContextPayload(
  data: Record<string, unknown>,
): { section: string; context: SectionWorkbenchContext } | null {
  const section = typeof data.section === 'string' ? data.section : '';
  if (!section) return null;

  const evidenceRaw = Array.isArray(data.evidence) ? data.evidence : [];
  const keywordsRaw = Array.isArray(data.keywords) ? data.keywords : [];
  const gapsRaw = Array.isArray(data.gap_mappings) ? data.gap_mappings : [];

  const context: SectionWorkbenchContext = {
    context_version: Number.isFinite(data.context_version as number)
      ? Math.max(0, Math.floor(data.context_version as number))
      : 0,
    generated_at:
      typeof data.generated_at === 'string'
        ? data.generated_at
        : new Date().toISOString(),
    blueprint_slice:
      data.blueprint_slice &&
      typeof data.blueprint_slice === 'object' &&
      !Array.isArray(data.blueprint_slice)
        ? (data.blueprint_slice as Record<string, unknown>)
        : {},
    evidence: evidenceRaw
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item, idx) => {
        const scopeMetrics: Record<string, string> = {};
        if (
          item.scope_metrics &&
          typeof item.scope_metrics === 'object' &&
          !Array.isArray(item.scope_metrics)
        ) {
          for (const [k, v] of Object.entries(
            item.scope_metrics as Record<string, unknown>,
          )) {
            if (typeof k === 'string' && typeof v === 'string') {
              scopeMetrics[k] = v;
            }
          }
        }
        return {
          id:
            typeof item.id === 'string' && item.id.trim()
              ? item.id.trim()
              : `evidence_${idx + 1}`,
          situation: typeof item.situation === 'string' ? item.situation : '',
          action: typeof item.action === 'string' ? item.action : '',
          result: typeof item.result === 'string' ? item.result : '',
          metrics_defensible: Boolean(item.metrics_defensible),
          user_validated: Boolean(item.user_validated),
          mapped_requirements: asStringArray(item.mapped_requirements),
          scope_metrics: scopeMetrics,
        };
      }),
    keywords: keywordsRaw
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => ({
        keyword: typeof item.keyword === 'string' ? item.keyword : '',
        target_density: Number.isFinite(item.target_density as number)
          ? Math.max(0, item.target_density as number)
          : 0,
        current_count: Number.isFinite(item.current_count as number)
          ? Math.max(0, item.current_count as number)
          : 0,
      }))
      .filter((item) => item.keyword.length > 0),
    gap_mappings: gapsRaw
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => ({
        requirement: typeof item.requirement === 'string' ? item.requirement : '',
        classification: asGapClassification(item.classification),
      }))
      .filter((item) => item.requirement.length > 0),
    section_order: asStringArray(data.section_order),
    sections_approved: asStringArray(data.sections_approved),
    review_strategy: data.review_strategy === 'bundled' ? 'bundled' : 'per_section',
    review_required_sections: asStringArray(data.review_required_sections),
    auto_approved_sections: asStringArray(data.auto_approved_sections),
    current_review_bundle_key:
      data.current_review_bundle_key === 'headline' ||
      data.current_review_bundle_key === 'core_experience' ||
      data.current_review_bundle_key === 'supporting'
        ? data.current_review_bundle_key
        : undefined,
    review_bundles: Array.isArray(data.review_bundles)
      ? data.review_bundles
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item),
          )
          .map((item) => ({
            key:
              item.key === 'headline' ||
              item.key === 'core_experience' ||
              item.key === 'supporting'
                ? item.key
                : ('supporting' as const),
            label: typeof item.label === 'string' ? item.label : 'Bundle',
            total_sections: Number.isFinite(item.total_sections as number)
              ? Math.max(0, Math.floor(item.total_sections as number))
              : 0,
            review_required: Number.isFinite(item.review_required as number)
              ? Math.max(0, Math.floor(item.review_required as number))
              : 0,
            reviewed_required: Number.isFinite(item.reviewed_required as number)
              ? Math.max(0, Math.floor(item.reviewed_required as number))
              : 0,
            status:
              item.status === 'complete' ||
              item.status === 'in_progress' ||
              item.status === 'auto_approved'
                ? item.status
                : ('pending' as const),
          }))
      : undefined,
  };

  const suggestionsRaw = Array.isArray(data.suggestions) ? data.suggestions : [];
  const suggestions: SectionSuggestion[] = suggestionsRaw
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof item.question_text === 'string' &&
        typeof item.intent === 'string' &&
        VALID_INTENTS.has(item.intent as string) &&
        typeof item.target_id === 'string' &&
        (item.target_id as string).length > 0,
    )
    .slice(0, SUGGESTION_LIMITS.max_count)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.slice(0, SUGGESTION_LIMITS.max_id_chars) : '',
      intent: item.intent as SectionSuggestion['intent'],
      question_text:
        typeof item.question_text === 'string'
          ? item.question_text.slice(0, SUGGESTION_LIMITS.max_question_text_chars)
          : '',
      ...(typeof item.context === 'string'
        ? { context: item.context.slice(0, SUGGESTION_LIMITS.max_context_chars) }
        : {}),
      ...(typeof item.target_id === 'string'
        ? { target_id: item.target_id.slice(0, SUGGESTION_LIMITS.max_id_chars) }
        : {}),
      options: Array.isArray(item.options)
        ? (item.options as Array<Record<string, unknown>>)
            .filter(
              (o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object',
            )
            .slice(0, 4)
            .map((o) => ({
              id: typeof o.id === 'string' ? o.id.slice(0, SUGGESTION_LIMITS.max_id_chars) : '',
              label:
                typeof o.label === 'string'
                  ? o.label.slice(0, SUGGESTION_LIMITS.max_option_label_chars)
                  : '',
              action: (o.action === 'skip' ? 'skip' : 'apply') as 'apply' | 'skip',
            }))
        : [],
      priority: Number.isFinite(item.priority as number)
        ? Math.max(0, item.priority as number)
        : 0,
      priority_tier: asPriorityTier(item.priority_tier),
      resolved_when:
        item.resolved_when &&
        typeof item.resolved_when === 'object' &&
        !Array.isArray(item.resolved_when)
          ? {
              type: (
                ['keyword_present', 'evidence_referenced', 'requirement_addressed', 'always_recheck'].includes(
                  (item.resolved_when as Record<string, unknown>).type as string,
                )
                  ? (item.resolved_when as Record<string, unknown>).type
                  : 'always_recheck'
              ) as SectionSuggestion['resolved_when']['type'],
              target_id:
                typeof (item.resolved_when as Record<string, unknown>).target_id === 'string'
                  ? (
                      (item.resolved_when as Record<string, unknown>).target_id as string
                    ).slice(0, SUGGESTION_LIMITS.max_id_chars)
                  : '',
            }
          : { type: 'always_recheck' as const, target_id: '' },
    }))
    .filter((s) => s.id.length > 0 && s.question_text.length > 0);

  if (suggestions.length > 0) {
    context.suggestions = suggestions;
  }

  return { section, context };
}
