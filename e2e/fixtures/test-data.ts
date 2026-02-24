import type { SSEEvent } from './mock-sse';
import {
  connectedEvent,
  draftReadinessUpdateEvent,
  stageStartEvent,
  sectionContextEvent,
  sectionDraftEvent,
  workflowReplanRequestedEvent,
  workflowReplanStartedEvent,
} from './mock-sse';

export const MOCK_SESSION_ID = 'e2e-test-session-001';
export const MOCK_REVIEW_TOKEN = 'tok_test';

export const SAMPLE_RESUME_TEXT = `
John Smith
Senior Software Engineer

Experience:
- Led migration of monolithic architecture to microservices, reducing deployment time by 60%
- Managed team of 8 engineers delivering cloud-native solutions
- Implemented CI/CD pipelines serving 200+ deployments per month
`.trim();

export const SAMPLE_JD_TEXT = `
Senior Cloud Architect — Acme Corp

Requirements:
- 8+ years in cloud architecture (AWS preferred)
- Experience with Kubernetes and container orchestration
- Strong background in distributed systems
- Team leadership experience
`.trim();

export const SAMPLE_COMPANY = 'Acme Corp';

export const SAMPLE_SECTION_CONTENT = `Senior Cloud Architect with 10+ years driving enterprise-scale transformations.
• Led migration of monolithic architecture to microservices, reducing deployment time by 60%
• Managed cross-functional team of 8 engineers delivering cloud-native solutions
• Implemented CI/CD pipelines serving 200+ deployments per month`;

/** 3 suggestions covering different intents and priority tiers */
export function makeSuggestions() {
  return [
    {
      id: 'gap_cloud_arch',
      intent: 'address_requirement',
      question_text: 'The JD requires AWS cloud architecture experience. Can you add specific AWS services you have used?',
      context: 'Addresses: 8+ years in cloud architecture (AWS preferred)',
      target_id: 'AWS',
      options: [
        { id: 'opt_apply_1', label: 'Apply', action: 'apply' },
        { id: 'opt_skip_1', label: 'Skip', action: 'skip' },
      ],
      priority: 90,
      priority_tier: 'high',
      resolved_when: { type: 'keyword_present', target_id: 'AWS' },
    },
    {
      id: 'kw_kubernetes',
      intent: 'integrate_keyword',
      question_text: 'The keyword "Kubernetes" is missing from this section. Integrate it naturally.',
      target_id: 'Kubernetes',
      options: [
        { id: 'opt_apply_2', label: 'Add Kubernetes', action: 'apply' },
        { id: 'opt_skip_2', label: 'Skip', action: 'skip' },
      ],
      priority: 50,
      priority_tier: 'medium',
      resolved_when: { type: 'keyword_present', target_id: 'Kubernetes' },
    },
    {
      id: 'ev_distributed',
      intent: 'weave_evidence',
      question_text: 'You mentioned distributed systems experience in your interview. Weave that evidence into this section.',
      target_id: 'distributed_systems_evidence',
      options: [
        { id: 'opt_apply_3', label: 'Weave In', action: 'apply' },
        { id: 'opt_skip_3', label: 'Skip', action: 'skip' },
      ],
      priority: 40,
      priority_tier: 'low',
      resolved_when: { type: 'evidence_referenced', target_id: 'distributed systems' },
    },
  ];
}

/** Standard context payload with suggestions.
 *  Pass `suggestions: null` to explicitly omit the field. */
export function makeContextPayload(overrides?: { suggestions?: unknown[] | null }) {
  const baseSuggestions =
    overrides?.suggestions === null
      ? undefined  // omit from payload entirely
      : overrides?.suggestions ?? makeSuggestions();
  return {
    section: 'summary',
    context_version: 1,
    ...(baseSuggestions !== undefined ? { suggestions: baseSuggestions } : {}),
    evidence: [
      {
        id: 'ev_1',
        situation: 'Legacy monolith causing 4-hour deploys',
        action: 'Designed and led microservices migration',
        result: 'Reduced deployment time by 60%',
        metrics_defensible: true,
        user_validated: true,
        mapped_requirements: ['distributed systems'],
        scope_metrics: { team_size: '8', timeline: '6 months' },
      },
    ],
    keywords: [
      { keyword: 'AWS', target_density: 2, current_count: 0 },
      { keyword: 'Kubernetes', target_density: 1, current_count: 0 },
    ],
    gap_mappings: [
      { requirement: 'AWS cloud architecture', classification: 'gap' },
      { requirement: 'Team leadership', classification: 'strong' },
    ],
    blueprint_slice: { positioning_angle: 'Enterprise cloud transformation leader' },
    section_order: ['summary', 'experience', 'skills', 'education'],
    sections_approved: [],
  };
}

/** Build the SSE events that render the workbench with suggestions.
 *  Pass `suggestions: null` to explicitly omit suggestions from the payload. */
export function workbenchSSEEvents(overrides?: {
  suggestions?: unknown[] | null;
  section?: string;
  content?: string;
  reviewToken?: string;
  includeDraftReadiness?: boolean;
  bundledReview?: boolean;
  includeReplanRequested?: boolean;
  includeReplanStarted?: boolean;
}): SSEEvent[] {
  const section = overrides?.section ?? 'summary';
  const content = overrides?.content ?? SAMPLE_SECTION_CONTENT;
  const reviewToken = overrides?.reviewToken ?? MOCK_REVIEW_TOKEN;
  const contextPayload = makeContextPayload({
    suggestions: overrides?.suggestions,
  });
  const bundledContext = overrides?.bundledReview
    ? {
        review_strategy: 'bundled' as const,
        review_required_sections: ['summary', 'experience_role_0'],
        auto_approved_sections: ['skills', 'education_and_certifications'],
        current_review_bundle_key: 'headline' as const,
        review_bundles: [
          {
            key: 'headline' as const,
            label: 'Headline',
            total_sections: 2,
            review_required: 2,
            reviewed_required: 0,
            status: 'in_progress' as const,
          },
          {
            key: 'core_experience' as const,
            label: 'Core Experience',
            total_sections: 2,
            review_required: 1,
            reviewed_required: 0,
            status: 'pending' as const,
          },
          {
            key: 'supporting' as const,
            label: 'Supporting Sections',
            total_sections: 2,
            review_required: 0,
            reviewed_required: 0,
            status: 'auto_approved' as const,
          },
        ],
      }
    : {};

  const events: SSEEvent[] = [
    connectedEvent(),
    stageStartEvent('section_writing', 'Writing summary section...'),
    ...(overrides?.includeDraftReadiness
      ? [draftReadinessUpdateEvent({
          workflow_mode: 'fast_draft',
          evidence_count: 5,
          minimum_evidence_target: 5,
          coverage_score: 74,
          coverage_threshold: 65,
          ready: true,
          note: 'Mock readiness update for UI smoke test.',
        })]
      : []),
    ...(overrides?.includeReplanRequested ? [workflowReplanRequestedEvent()] : []),
    ...(overrides?.includeReplanStarted
      ? [workflowReplanStartedEvent({
          phase: 'refresh_gap_analysis',
          message: 'Mock replan is regenerating gap analysis.',
        })]
      : []),
    sectionContextEvent({ ...contextPayload, ...bundledContext, section }),
    sectionDraftEvent({ section, content, review_token: reviewToken }),
  ];
  return events;
}
