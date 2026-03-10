/**
 * Virtual Coach Tool — detect_red_flags
 *
 * Scans the client snapshot for conditions that warrant proactive coaching:
 * stalled pipelines, inactivity, missing interview prep, financial urgency.
 * Returns a prioritized list of alerts the coach should address.
 */

import type { CoachTool } from '../types.js';
import { RED_FLAG_THRESHOLDS } from '../knowledge/red-flags.js';

const detectRedFlagsTool: CoachTool = {
  name: 'detect_red_flags',
  description:
    "Scan the client's current state for red flags — inactivity, stalled pipelines, missing prep, " +
    'financial urgency. Returns a prioritized list of alerts the coach should proactively address. ' +
    'Call this at the start of each conversation to check for urgent situations.',
  model_tier: undefined, // Pure logic, no LLM call
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_input, ctx) {
    const state = ctx.getState();
    const snapshot = state.client_snapshot;

    if (!snapshot) {
      return JSON.stringify({
        error: 'Client snapshot not loaded. Call load_client_context first.',
      });
    }

    const alerts: Array<{
      type: string;
      priority: string;
      message: string;
      coaching_response: string;
    }> = [];

    for (const threshold of RED_FLAG_THRESHOLDS) {
      switch (threshold.type) {
        case 'no_login': {
          if (snapshot.days_since_last_activity >= threshold.days) {
            alerts.push({
              type: threshold.type,
              priority: threshold.priority,
              message: `Client has been inactive for ${snapshot.days_since_last_activity} days (threshold: ${threshold.days}).`,
              coaching_response: threshold.coaching_response,
            });
          }
          break;
        }

        case 'stalled_pipeline': {
          for (const stall of snapshot.stalled_items) {
            if (stall.stalled_days >= threshold.days) {
              alerts.push({
                type: threshold.type,
                priority: threshold.priority,
                message: `${stall.product_type} pipeline stalled for ${stall.stalled_days} days at stage "${stall.pipeline_stage ?? 'unknown'}".`,
                coaching_response: threshold.coaching_response,
              });
            }
          }
          break;
        }

        case 'no_applications': {
          // Only relevant if resume is complete but no job_finder activity
          const hasResume = snapshot.completed_products.includes('resume');
          const hasJobFinder = snapshot.completed_products.includes('job_finder');
          const hasActiveJobSearch = snapshot.active_pipelines.some(
            (p) => p.product_type === 'job_finder'
          );
          if (
            hasResume &&
            !hasJobFinder &&
            !hasActiveJobSearch &&
            snapshot.days_since_last_activity >= threshold.days
          ) {
            alerts.push({
              type: threshold.type,
              priority: threshold.priority,
              message: `Resume is complete but no job applications started in ${snapshot.days_since_last_activity} days.`,
              coaching_response: threshold.coaching_response,
            });
          }
          break;
        }

        case 'no_interview_prep': {
          // Only relevant if there are active applications but no interview_prep
          const hasApplications =
            snapshot.completed_products.includes('job_finder') ||
            snapshot.active_pipelines.some((p) => p.product_type === 'job_finder');
          const hasInterviewPrep = snapshot.completed_products.includes('interview_prep');
          const hasActivePrep = snapshot.active_pipelines.some(
            (p) => p.product_type === 'interview_prep'
          );
          if (hasApplications && !hasInterviewPrep && !hasActivePrep) {
            alerts.push({
              type: threshold.type,
              priority: threshold.priority,
              message: 'Active job applications but no interview preparation completed.',
              coaching_response: threshold.coaching_response,
            });
          }
          break;
        }

        case 'approaching_financial_deadline': {
          const profile = snapshot.client_profile as Record<string, unknown> | undefined;
          const segment =
            typeof profile?.['financial_segment'] === 'string'
              ? profile['financial_segment']
              : null;
          if (segment === 'crisis' || segment === 'stressed') {
            // For financially pressured clients, everything is more urgent
            alerts.push({
              type: threshold.type,
              priority: threshold.priority,
              message: `Client is in "${segment}" financial segment. Time-sensitive coaching required.`,
              coaching_response: threshold.coaching_response,
            });
          }
          break;
        }
      }
    }

    // Sort by priority: high > medium > low
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    alerts.sort(
      (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
    );

    return JSON.stringify({
      alert_count: alerts.length,
      has_urgent: alerts.some((a) => a.priority === 'high'),
      alerts,
    });
  },
};

export { detectRedFlagsTool };
