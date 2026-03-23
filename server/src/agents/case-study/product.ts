/**
 * Case Study Agent Product — ProductConfig implementation.
 *
 * Agent #17: 2-agent pipeline (Achievement Analyst → Case Study Writer) that
 * analyzes executive achievements, selects the highest-impact ones, and produces
 * consulting-grade case studies that prove capability through evidence, not claims.
 * Autonomous — no user gates. Full case study collection delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { analystConfig } from './analyst/agent.js';
import { writerConfig } from './writer/agent.js';
import type { CaseStudyState, CaseStudySSEEvent } from './types.js';
import {
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../contracts/shared-context-prompt.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';

export function createCaseStudyProductConfig(): ProductConfig<CaseStudyState, CaseStudySSEEvent> {
  return {
    domain: 'case-study',

    agents: [
      {
        name: 'analyst',
        config: analystConfig,
        stageMessage: {
          startStage: 'analysis',
          start: 'Analyzing achievements and selecting top case study candidates...',
          complete: 'Analysis complete — top achievements selected and narratives extracted',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as CaseStudyState['resume_data'];
          }
          if (Array.isArray(scratchpad.achievements) && !state.achievements) {
            state.achievements = scratchpad.achievements as CaseStudyState['achievements'];
          }
          if (Array.isArray(scratchpad.selected_achievements) && !state.selected_achievements) {
            state.selected_achievements = scratchpad.selected_achievements as CaseStudyState['selected_achievements'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing consulting-grade case studies...',
          complete: 'Case study portfolio complete',
        },
        onComplete: (scratchpad, state) => {
          if (Array.isArray(scratchpad.case_studies)) {
            state.case_studies = scratchpad.case_studies as CaseStudyState['case_studies'];
          }
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      platform_context: input.platform_context as CaseStudyState['platform_context'],
      shared_context: input.shared_context as CaseStudyState['shared_context'],
      target_context: input.target_context as CaseStudyState['target_context'] ?? {
        target_role: '',
        target_industry: '',
        target_seniority: '',
      },
      case_studies: [],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyst') {
        const sharedContext = state.shared_context;
        const parts = [
          'Analyze this executive resume to extract and score achievements for case study writing.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
        ];

        if (hasMeaningfulSharedValue(sharedContext?.candidateProfile)) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            sharedContext,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative Signals',
            sharedNarrative: sharedContext?.careerNarrative,
          }));
        }

        if (state.platform_context?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
          parts.push(...renderPositioningStrategySection({
            heading: '## Positioning Strategy',
            sharedStrategy: sharedContext?.positioningStrategy,
            legacyStrategy: state.platform_context?.positioning_strategy,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)
          || (state.platform_context?.evidence_items?.length ?? 0) > 0) {
          parts.push(...renderEvidenceInventorySection({
            heading: '## Evidence Items',
            sharedInventory: sharedContext?.evidenceInventory,
            legacyEvidence: state.platform_context?.evidence_items,
            maxItems: 8,
          }));
        }

        if (state.target_context) {
          parts.push('', '## Target Context');
          if (state.target_context.target_role) parts.push(`Target Role: ${state.target_context.target_role}`);
          if (state.target_context.target_industry) parts.push(`Target Industry: ${state.target_context.target_industry}`);
        }

        parts.push(
          '',
          'Call tools in order: parse_achievements, score_impact, extract_narrative_elements, identify_metrics.',
        );

        // Distress resources — first agent only
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'writer') {
        const selectedList = state.selected_achievements
          ? state.selected_achievements.map((a, i) => `${i + 1}. "${a.title}" (${a.company}, impact: ${a.impact_score})`).join('\n')
          : '(no achievements selected)';

        const parts = [
          'Write consulting-grade case studies for the following selected achievements:',
          '',
          selectedList,
          '',
          'For each achievement, follow this workflow:',
          '1. Call write_case_study to draft the case study',
          '2. Call add_metrics_visualization to enhance metrics with before/after context',
          '3. Call quality_review to score and validate the case study',
          '',
          'After all case studies are written, call assemble_portfolio to produce the final collection report.',
          '',
          'Do NOT skip any step.',
        ];

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'collection_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        case_study_count: state.case_studies.length,
        case_studies: state.case_studies,
        selected_achievements: state.selected_achievements ?? [],
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        case_studies: state.case_studies,
        selected_achievements: state.selected_achievements,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        case_studies: unknown;
      };

      try {
        await supabaseAdmin
          .from('case_study_reports')
          .insert({
            user_id: state.user_id,
            report_markdown: data.report,
            quality_score: data.quality_score,
            case_studies: data.case_studies,
            selected_achievements: state.selected_achievements,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Case study: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'analyst') {
        if (!state.selected_achievements || state.selected_achievements.length === 0) {
          throw new Error('Analyst did not produce selected achievements');
        }
      }
      if (agentName === 'writer') {
        if (!state.final_report) {
          throw new Error('Writer did not produce a final report');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
