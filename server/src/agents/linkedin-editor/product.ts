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
  renderBenchmarkProfileDirectionSection,
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';
import { LINKEDIN_PROFILE_KICKOFF_QUALITY_BAR } from '../linkedin-shared/editorial-brain.js';

function pendingReviewSection(state: LinkedInEditorState): ProfileSection | null {
  return PROFILE_SECTION_ORDER.find((section) =>
    !!state.section_drafts[section] && !state.sections_completed.includes(section)
  ) ?? null;
}

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
          complete: 'LinkedIn section ready for review',
        },
        gates: [{
          name: 'section_review',
          condition: (state: LinkedInEditorState) => {
            // Gate fires when the current section has been drafted but not yet approved.
            return pendingReviewSection(state) !== null;
          },
          onResponse: (response: unknown, state: LinkedInEditorState, emit?: (event: LinkedInEditorSSEEvent) => void) => {
            const section = pendingReviewSection(state);
            if (!section) return;
            const approve = () => {
              if (!state.sections_completed.includes(section)) {
                state.sections_completed = [...state.sections_completed, section];
              }
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
          requiresRerun: (state: LinkedInEditorState) =>
            pendingReviewSection(state) !== null
            || PROFILE_SECTION_ORDER.some((section) => !state.sections_completed.includes(section)),
          maxReruns: PROFILE_SECTION_ORDER.length + 2,
        }],
        onComplete: (scratchpad, state) => {
          // Transfer all approved section drafts from scratchpad to state
          for (const section of PROFILE_SECTION_ORDER) {
            const key = `draft_${section}`;
            if (
              typeof scratchpad[key] === 'string'
              && (!state.section_drafts[section] || !state.sections_completed.includes(section))
            ) {
              state.section_drafts = {
                ...state.section_drafts,
                [section]: scratchpad[key],
              };
            }

            const scoresKey = `scores_${section}`;
            if (
              scratchpad[scoresKey]
              && (!state.quality_scores[section] || !state.sections_completed.includes(section))
            ) {
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
      shared_context: input.shared_context as LinkedInEditorState['shared_context'],
      current_profile: typeof input.current_profile === 'string' ? input.current_profile : undefined,
      sections_completed: [],
      section_drafts: {},
      section_feedback: {},
      quality_scores: {},
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'editor') {
        const sharedContext = state.shared_context;
        // Determine which sections remain
        const completed = state.sections_completed ?? [];
        const remaining = PROFILE_SECTION_ORDER.filter((s) => !completed.includes(s));
        const nextSection = remaining[0];

        const parts: string[] = [
          'Optimize this professional\'s LinkedIn profile, one section at a time.',
          '',
          '## Quality Bar',
          LINKEDIN_PROFILE_KICKOFF_QUALITY_BAR,
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
          const feedback = state.section_feedback?.[nextSection];
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

        if (state.platform_context?.career_profile || hasMeaningfulSharedValue(sharedContext?.candidateProfile)) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            sharedContext,
            legacyCareerProfile: state.platform_context?.career_profile,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative Signals',
            sharedNarrative: sharedContext?.careerNarrative,
          }));
        }

        parts.push(...renderBenchmarkProfileDirectionSection({
          heading: '## Benchmark Profile Direction',
          sharedContext,
        }));

        if (state.platform_context?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
          parts.push(...renderPositioningStrategySection({
            heading: '## Positioning Strategy',
            sharedStrategy: sharedContext?.positioningStrategy,
            legacyStrategy: state.platform_context?.positioning_strategy,
          }));
        }

        if (state.current_profile) {
          parts.push(
            '## Current LinkedIn Profile (analyze and improve)',
            state.current_profile.slice(0, 3000),
            '',
          );
        }

        if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)
          || (state.platform_context?.evidence_items?.length ?? 0) > 0) {
          parts.push(...renderEvidenceInventorySection({
            heading: '## Evidence Items',
            sharedInventory: sharedContext?.evidenceInventory,
            legacyEvidence: state.platform_context?.evidence_items,
            maxItems: 15,
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
