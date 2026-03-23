/**
 * LinkedIn Content Writer Product — ProductConfig implementation.
 *
 * Agent #21 in the 33-agent platform. 2-agent pipeline:
 * 1. Strategist: Analyzes expertise + generates topic suggestions (topic_selection gate)
 * 2. Writer: Drafts post in user's authentic voice (post_review gate)
 *
 * Cross-product context: Loads positioning strategy, evidence items, and
 * career narrative from prior sessions.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { strategistConfig } from './strategist/agent.js';
import { writerConfig } from './writer/agent.js';
import type { LinkedInContentState, LinkedInContentSSEEvent, TopicSuggestion, PostQualityScores } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../contracts/shared-context-prompt.js';

export function createLinkedInContentProductConfig(): ProductConfig<LinkedInContentState, LinkedInContentSSEEvent> {
  return {
    domain: 'linkedin-content',

    agents: [
      {
        name: 'strategist',
        config: strategistConfig,
        stageMessage: {
          startStage: 'strategy',
          start: 'Analyzing your expertise areas and generating topic ideas...',
          complete: 'Topics ready — choose one to write about',
        },
        gates: [
          {
            name: 'topic_selection',
            condition: (state) => Array.isArray(state.suggested_topics) && state.suggested_topics.length > 0 && !state.selected_topic,
            onResponse: (response, state) => {
              // User selects a topic — could be a TopicSuggestion id or custom topic text
              if (typeof response === 'string') {
                // Check if it matches a suggested topic id
                const matched = state.suggested_topics?.find((t: TopicSuggestion) => t.id === response);
                state.selected_topic = matched ? matched.topic : response;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                state.selected_topic = typeof resp.topic === 'string' ? resp.topic : String(resp.topic_id ?? resp.id ?? '');
              }
            },
          },
        ],
        onComplete: (scratchpad, state) => {
          if (Array.isArray(scratchpad.suggested_topics) && !state.suggested_topics) {
            state.suggested_topics = scratchpad.suggested_topics as TopicSuggestion[];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your LinkedIn post...',
          complete: 'Post ready for review',
        },
        gates: [
          {
            name: 'post_review',
            onResponse: (response, state) => {
              // Response: true (approved), or { feedback: string } (revision requested)
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                } else {
                  state.revision_feedback = undefined;
                }
              }
            },
            requiresRerun: (state) => !!state.revision_feedback,
          },
        ],
        onComplete: (scratchpad, state) => {
          if (typeof scratchpad.post_draft === 'string') {
            state.post_draft = scratchpad.post_draft;
          }
          if (Array.isArray(scratchpad.post_hashtags)) {
            state.post_hashtags = (scratchpad.post_hashtags as unknown[]).map(String);
          }
          if (scratchpad.quality_scores && typeof scratchpad.quality_scores === 'object') {
            state.quality_scores = scratchpad.quality_scores as PostQualityScores;
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'strategy',
      platform_context: input.platform_context as LinkedInContentState['platform_context'],
      shared_context: input.shared_context as LinkedInContentState['shared_context'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'strategist') {
        const sharedContext = state.shared_context;
        const parts = [
          'Analyze this professional\'s positioning and generate compelling LinkedIn post topic suggestions.',
          '',
        ];

        if (state.platform_context?.career_profile) {
          parts.push(
            '## Career Profile',
            JSON.stringify(state.platform_context.career_profile, null, 2),
            '',
          );
        }

        if (hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
          parts.push(...renderPositioningStrategySection({
            heading: '## Prior Positioning Strategy',
            sharedStrategy: sharedContext?.positioningStrategy,
          }));
        } else if (state.platform_context?.positioning_strategy) {
          parts.push(...renderPositioningStrategySection({
            heading: '## Prior Positioning Strategy',
            legacyStrategy: state.platform_context.positioning_strategy,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
          parts.push(...renderEvidenceInventorySection({
            heading: '## Evidence Items',
            sharedInventory: sharedContext?.evidenceInventory,
            maxItems: 8,
          }));
        } else if (state.platform_context?.evidence_items && state.platform_context.evidence_items.length > 0) {
          parts.push(...renderEvidenceInventorySection({
            heading: '## Evidence Items',
            legacyEvidence: state.platform_context.evidence_items,
            maxItems: 8,
          }));
        }

        parts.push(
          '## Objective',
          'Use the available tools to identify what this person should be known for on LinkedIn right now, then suggest topics that are truthful, differentiated, and well-supported by their evidence and Career Profile.',
        );

        // Distress resources — first agent only
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'writer') {
        const sharedContext = state.shared_context;
        const selectedTopic = state.selected_topic ?? 'professional insight';

        const parts = [
          `Write a LinkedIn post on this topic: "${selectedTopic}"`,
          '',
          'Use the available writing tools to draft an authentic post, self-review it for voice and usefulness, and then present the finished version.',
          '',
        ];

        if (state.platform_context?.career_profile) {
          parts.push(
            '## Career Profile',
            JSON.stringify(state.platform_context.career_profile, null, 2),
            '',
          );
        }

        if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative (match this authentic voice)',
            sharedNarrative: sharedContext?.careerNarrative,
          }));
        } else if (state.platform_context?.career_narrative) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative (match this authentic voice)',
            legacyNarrative: state.platform_context.career_narrative,
          }));
        }

        // If revision is needed, include the feedback
        if (state.revision_feedback) {
          parts.push(
            '## Revision Requested',
            `The user reviewed the post and requested changes: "${state.revision_feedback}"`,
            'Revise the draft to address this feedback, keep the voice credible, and re-check the post before you present it.',
            '',
          );
        }

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      const post = state.post_draft ?? '';
      const hashtags = state.post_hashtags ?? [];
      const qualityScores = state.quality_scores ?? {
        authenticity: 0,
        engagement_potential: 0,
        keyword_density: 0,
      };

      emit({
        type: 'content_complete',
        session_id: state.session_id,
        post,
        hashtags,
        quality_scores: qualityScores,
      });

      return { post, hashtags, quality_scores: qualityScores };
    },

    persistResult: async (state, result) => {
      const data = result as {
        post: string;
        hashtags: string[];
        quality_scores: PostQualityScores;
      };

      try {
        await supabaseAdmin
          .from('content_posts')
          .insert({
            user_id: state.user_id,
            platform: 'linkedin',
            post_type: 'thought_leadership',
            topic: state.selected_topic ?? null,
            content: data.post,
            hashtags: data.hashtags,
            status: 'draft',
            quality_scores: data.quality_scores,
            source_session_id: state.session_id,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'LinkedIn content: failed to persist post (non-fatal)',
        );
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
