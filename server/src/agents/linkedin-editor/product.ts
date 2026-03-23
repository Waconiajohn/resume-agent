/**
 * LinkedIn Profile Editor Product — ProductConfig implementation.
 *
 * Agent #22 in the 33-agent platform. Single-agent pipeline with per-section
 * gates: writes each profile section (headline, about, experience, skills,
 * education) and pauses for user approval before writing the next.
 *
 * Cross-product context: Loads positioning strategy and evidence items
 * from prior sessions.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { editorConfig } from './editor/agent.js';
import type {
  LinkedInEditorState,
  LinkedInEditorSSEEvent,
  ProfileSection,
  SectionQualityScores,
} from './types.js';
import { PROFILE_SECTION_ORDER } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import {
  renderCareerProfileSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../contracts/shared-context-prompt.js';

export function createLinkedInEditorProductConfig(): ProductConfig<LinkedInEditorState, LinkedInEditorSSEEvent> {
  return {
    domain: 'linkedin-editor',

    agents: [
      {
        name: 'editor',
        config: editorConfig,
        stageMessage: {
          startStage: 'editing',
          start: 'Starting your LinkedIn profile optimization...',
          complete: 'LinkedIn profile complete',
        },
        gates: PROFILE_SECTION_ORDER.map((section) => ({
          name: `section_review_${section}`,
          condition: (state: LinkedInEditorState) => {
            // Gate fires when the section has been drafted but not yet approved
            return (
              !!state.section_drafts[section] &&
              !state.sections_completed.includes(section)
            );
          },
          onResponse: (response: unknown, state: LinkedInEditorState, emit?: (event: LinkedInEditorSSEEvent) => void) => {
            const approve = () => {
              state.sections_completed = [...state.sections_completed, section];
              if (emit) {
                emit({
                  type: 'section_approved',
                  session_id: state.session_id,
                  section,
                } as LinkedInEditorSSEEvent);
              }
            };

            if (response === true || response === 'approved') {
              approve();
            } else if (response && typeof response === 'object') {
              const resp = response as Record<string, unknown>;
              if (typeof resp.feedback === 'string') {
                state.section_feedback = {
                  ...state.section_feedback,
                  [section]: resp.feedback,
                };
              } else if (resp.approved === true) {
                approve();
              }
            }
          },
        })),
        onComplete: (scratchpad, state) => {
          // Transfer all approved section drafts from scratchpad to state
          for (const section of PROFILE_SECTION_ORDER) {
            const key = `draft_${section}`;
            if (typeof scratchpad[key] === 'string' && !state.section_drafts[section]) {
              state.section_drafts = {
                ...state.section_drafts,
                [section]: scratchpad[key] as string,
              };
            }

            const scoresKey = `scores_${section}`;
            if (scratchpad[scoresKey] && !state.quality_scores[section]) {
              state.quality_scores = {
                ...state.quality_scores,
                [section]: scratchpad[scoresKey] as SectionQualityScores,
              };
            }
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'editing',
      platform_context: input.platform_context as LinkedInEditorState['platform_context'],
      current_profile: typeof input.current_profile === 'string' ? input.current_profile : undefined,
      sections_completed: [],
      section_drafts: {},
      section_feedback: {},
      quality_scores: {},
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'editor') {
        // Determine which sections remain
        const completed = state.sections_completed ?? [];
        const remaining = PROFILE_SECTION_ORDER.filter((s) => !completed.includes(s));
        const nextSection = remaining[0];

        const parts: string[] = [
          'Optimize this professional\'s LinkedIn profile, one section at a time.',
          '',
        ];

        if (completed.length > 0) {
          parts.push(
            `## Sections Already Approved (${completed.join(', ')})`,
            'Do NOT rewrite these sections.',
            '',
          );
        }

        if (nextSection) {
          parts.push(`## Next Section to Write: "${nextSection}"`, '');

          // Include the feedback for this section if revision was requested
          const feedback = state.section_feedback?.[nextSection as ProfileSection];
          if (feedback) {
            parts.push(
              `## Revision Requested for ${nextSection}`,
              `User feedback: "${feedback}"`,
              'Use the section tools to revise only this section, self-review it, and then present it for approval.',
              '',
            );
          } else {
            parts.push(
              `Draft only the ${nextSection} section, self-review it, and present it for approval before moving on.`,
              '',
            );
          }
        }

        if (state.platform_context?.career_profile) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            legacyCareerProfile: state.platform_context.career_profile,
          }));
        }

        if (state.platform_context?.positioning_strategy) {
          parts.push(...renderPositioningStrategySection({
            heading: '## Positioning Strategy',
            legacyStrategy: state.platform_context.positioning_strategy,
          }));
        }

        if (state.current_profile) {
          parts.push(
            '## Current LinkedIn Profile (analyze and improve)',
            state.current_profile.slice(0, 3000),
            '',
          );
        }

        if (state.platform_context?.evidence_items && state.platform_context.evidence_items.length > 0) {
          parts.push(...renderEvidenceInventorySection({
            heading: '## Evidence Items',
            legacyEvidence: state.platform_context.evidence_items,
            maxItems: 8,
          }));
        }

        // Distress resources — always first agent
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

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      const sections = state.section_drafts;

      emit({
        type: 'editor_complete',
        session_id: state.session_id,
        sections,
      });

      return {
        sections,
        sections_completed: state.sections_completed,
        quality_scores: state.quality_scores,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        sections: Partial<Record<ProfileSection, string>>;
        sections_completed: ProfileSection[];
        quality_scores: Partial<Record<ProfileSection, SectionQualityScores>>;
      };

      try {
        await supabaseAdmin
          .from('content_posts')
          .insert({
            user_id: state.user_id,
            platform: 'linkedin',
            post_type: 'profile_optimization',
            topic: 'LinkedIn Profile',
            content: JSON.stringify(data.sections),
            hashtags: [],
            status: 'draft',
            quality_scores: data.quality_scores,
            source_session_id: state.session_id,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'LinkedIn editor: failed to persist profile (non-fatal)',
        );
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
