/**
 * LinkedIn Content Writer Product -- ProductConfig implementation.
 *
 * Agent #21 in the 33-agent platform. 2-agent pipeline:
 * 1. Strategist: Analyzes expertise + generates topic suggestions (topic_selection gate)
 *    OR plans a 12-16 post series (series_selection gate) when series_mode is true
 * 2. Writer: Drafts post in user's authentic voice (post_review gate)
 *
 * Cross-product context: Loads positioning strategy, evidence items, and
 * career narrative from prior sessions.
 *
 * Mode selection: Pass series_mode: true in the initial input to enter series mode.
 * The Strategist will plan the full series; the Writer will draft the first post
 * (or the post number specified in current_series_post).
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { strategistConfig } from './strategist/agent.js';
import { writerConfig } from './writer/agent.js';
import type {
  LinkedInContentState,
  LinkedInContentSSEEvent,
  TopicSuggestion,
  PostQualityScores,
  ContentSeries,
} from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';
import {
  renderCareerProfileSection,
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
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
          start: 'Analyzing your expertise areas and generating content ideas...',
          complete: 'Content plan ready',
        },
        gates: [
          // Single-post gate: fires when topics are ready but no topic selected yet
          {
            name: 'topic_selection',
            condition: (state) =>
              !state.series_mode &&
              Array.isArray(state.suggested_topics) &&
              state.suggested_topics.length > 0 &&
              !state.selected_topic,
            onResponse: (response, state) => {
              // User selects a topic -- could be a TopicSuggestion id or custom topic text
              if (typeof response === 'string') {
                const matched = state.suggested_topics?.find((t: TopicSuggestion) => t.id === response);
                state.selected_topic = matched ? matched.topic : response;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                state.selected_topic = typeof resp.topic === 'string' ? resp.topic : String(resp.topic_id ?? resp.id ?? '');
              }
            },
          },
          // Series gate: fires when series plan is ready and not yet approved
          {
            name: 'series_selection',
            condition: (state) =>
              !!state.series_mode &&
              !!state.series_plan &&
              Array.isArray(state.series_plan.posts) &&
              state.series_plan.posts.length > 0 &&
              !state.current_series_post,
            onResponse: (response, state) => {
              // Response options:
              // - true / 'approved': series approved as-is, start with post 1
              // - { approved: true, start_post?: number }: approved, optionally start at a specific post
              // - { approved: true, edits: ContentSeries }: approved with edits to the series plan
              if (response === true || response === 'approved') {
                state.current_series_post = 1;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (resp.approved === true || resp.approved === 'true') {
                  // Apply edits to series plan if provided
                  if (resp.edits && typeof resp.edits === 'object') {
                    const edits = resp.edits as Partial<ContentSeries>;
                    if (state.series_plan) {
                      if (typeof edits.series_title === 'string') {
                        state.series_plan.series_title = edits.series_title;
                      }
                      if (typeof edits.series_theme === 'string') {
                        state.series_plan.series_theme = edits.series_theme;
                      }
                      if (Array.isArray(edits.posts) && edits.posts.length > 0) {
                        state.series_plan.posts = edits.posts;
                        state.series_plan.total_posts = edits.posts.length;
                      }
                    }
                  }
                  // Determine which post to start with
                  const startPost = typeof resp.start_post === 'number' ? resp.start_post : 1;
                  state.current_series_post = Math.max(1, Math.min(startPost, state.series_plan?.total_posts ?? 1));
                }
              }
            },
          },
        ],
        onComplete: (scratchpad, state) => {
          // Single-post mode: transfer topic suggestions
          if (Array.isArray(scratchpad.suggested_topics) && !state.suggested_topics) {
            state.suggested_topics = scratchpad.suggested_topics as TopicSuggestion[];
          }
          // Series mode: transfer series plan
          if (scratchpad.series_plan && !state.series_plan) {
            state.series_plan = scratchpad.series_plan as ContentSeries;
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
      // series_mode: true activates the 12-16 post series workflow
      series_mode: input.series_mode === true,
      // current_series_post can be set to resume a series mid-way
      current_series_post: typeof input.current_series_post === 'number'
        ? input.current_series_post
        : undefined,
      // series_plan can be pre-loaded if resuming a previously planned series
      series_plan: input.series_plan
        ? (input.series_plan as ContentSeries)
        : undefined,
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'strategist') {
        const sharedContext = state.shared_context;
        const isSeries = state.series_mode;
        const parts: string[] = [];

        if (isSeries) {
          parts.push(
            'Plan a 12-16 post thought leadership series for this executive.',
            'The series must tell a cohesive story: each post stands alone but builds on a shared narrative arc.',
            '',
          );
        } else {
          parts.push(
            'Analyze this professional\'s positioning and generate compelling LinkedIn post topic suggestions.',
            '',
          );
        }

        if (
          hasMeaningfulSharedValue(sharedContext?.candidateProfile) ||
          state.platform_context?.career_profile
        ) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            sharedContext,
            legacyCareerProfile: state.platform_context?.career_profile,
          }));
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
            maxItems: isSeries ? 15 : 8,
          }));
        } else if (state.platform_context?.evidence_items && state.platform_context.evidence_items.length > 0) {
          parts.push(...renderEvidenceInventorySection({
            heading: '## Evidence Items',
            legacyEvidence: state.platform_context.evidence_items,
            maxItems: isSeries ? 15 : 8,
          }));
        }

        // Why Me story -- especially valuable for series narrative thread
        const whyMeStory = (sharedContext as Record<string, unknown> | undefined)?.why_me_story
          ?? (state.platform_context as Record<string, unknown> | undefined)?.why_me_story;
        if (whyMeStory) {
          parts.push(...renderWhyMeStorySection({
            heading: '## Why Me Story',
            legacyWhyMeStory: whyMeStory,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative',
            sharedNarrative: sharedContext?.careerNarrative,
          }));
        }

        parts.push(
          '## Objective',
          isSeries
            ? 'Use analyze_expertise to map this person\'s signature strengths and career themes, then plan_series to design a cohesive series, then present_series to show the user the plan for approval.'
            : 'Use the available tools to identify what this person should be known for on LinkedIn right now, then suggest topics that are truthful, differentiated, and well-supported by their evidence.',
        );

        // Distress resources -- first agent only
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
        const isSeries = state.series_mode && state.series_plan;
        const parts: string[] = [];

        if (isSeries) {
          const postNum = state.current_series_post ?? 1;
          const total = state.series_plan!.total_posts;
          const seriesPost = state.series_plan!.posts.find((p) => p.post_number === postNum);

          parts.push(
            `Write Part ${postNum} of ${total} in the "${state.series_plan!.series_title}" series.`,
            '',
            `**Post topic:** ${seriesPost?.title ?? 'see series context'}`,
            '',
            'Use write_post to draft this post with full series context, self_review_post to check quality, then present_post to show the user.',
            '',
          );
        } else {
          const selectedTopic = state.selected_topic ?? 'professional insight';
          parts.push(
            `Write a LinkedIn post on this topic: "${selectedTopic}"`,
            '',
            'Use write_post, self_review_post, then present_post.',
            '',
          );
        }

        if (
          hasMeaningfulSharedValue(sharedContext?.candidateProfile) ||
          state.platform_context?.career_profile
        ) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            sharedContext,
            legacyCareerProfile: state.platform_context?.career_profile,
          }));
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
        // Surface the series plan in the completion event so the UI can render
        // the full series plan alongside the first completed post
        series_plan: state.series_plan,
      });

      return {
        post,
        hashtags,
        quality_scores: qualityScores,
        series_plan: state.series_plan,
        series_mode: state.series_mode,
        current_series_post: state.current_series_post,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        post: string;
        hashtags: string[];
        quality_scores: PostQualityScores;
        series_plan?: ContentSeries;
        series_mode?: boolean;
        current_series_post?: number;
      };

      try {
        await supabaseAdmin
          .from('content_posts')
          .insert({
            user_id: state.user_id,
            platform: 'linkedin',
            post_type: data.series_mode ? 'thought_leadership_series' : 'thought_leadership',
            topic: state.selected_topic ?? null,
            content: data.post,
            hashtags: data.hashtags,
            status: 'draft',
            quality_scores: data.quality_scores,
            source_session_id: state.session_id,
            // Persist series metadata when in series mode
            ...(data.series_mode && {
              series_title: data.series_plan?.series_title ?? null,
              series_post_number: data.current_series_post ?? null,
              series_total_posts: data.series_plan?.total_posts ?? null,
            }),
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
