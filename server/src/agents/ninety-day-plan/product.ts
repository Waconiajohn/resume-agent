/**
 * 90-Day Plan Agent Product — ProductConfig implementation.
 *
 * Agent #20: 2-agent pipeline (Role Researcher -> Plan Writer) that
 * analyzes the target role context, maps stakeholders, identifies quick
 * wins, and produces a strategic 90-day onboarding plan.
 * Autonomous — no user gates. Full plan delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { researcherConfig } from './researcher/agent.js';
import { plannerConfig } from './planner/agent.js';
import type { NinetyDayPlanState, NinetyDayPlanSSEEvent, PlanPhase, Stakeholder, QuickWin, LearningPriority } from './types.js';
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

export function createNinetyDayPlanProductConfig(): ProductConfig<NinetyDayPlanState, NinetyDayPlanSSEEvent> {
  return {
    domain: 'ninety-day-plan',

    agents: [
      {
        name: 'researcher',
        config: researcherConfig,
        stageMessage: {
          startStage: 'research',
          start: 'Analyzing role context and mapping stakeholders...',
          complete: 'Stakeholder map ready for review',
        },
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as NinetyDayPlanState['resume_data'];
          }
          if (Array.isArray(scratchpad.stakeholder_map)) {
            state.stakeholder_map = scratchpad.stakeholder_map as Stakeholder[];
          }
          if (Array.isArray(scratchpad.quick_wins)) {
            state.quick_wins = scratchpad.quick_wins as QuickWin[];
          }
          if (Array.isArray(scratchpad.learning_priorities)) {
            state.learning_priorities = scratchpad.learning_priorities as LearningPriority[];
          }

          // Emit stakeholder map for review before the gate blocks
          if (state.stakeholder_map.length > 0) {
            emit({
              type: 'stakeholder_review_ready',
              session_id: state.session_id,
              stakeholder_map: state.stakeholder_map,
              quick_wins: state.quick_wins,
              role_context: state.role_context,
            });
            emit({ type: 'pipeline_gate', gate: 'stakeholder_review' });
          }
        },
        gates: [
          {
            name: 'stakeholder_review',
            condition: (state) => state.stakeholder_map.length > 0,
            onResponse: (response, state) => {
              if (response === true || response === 'approved') {
                // Approved — proceed with the inferred stakeholder map
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                }
                // Merge corrected stakeholder map if user provided one
                if (Array.isArray(resp.stakeholder_map)) {
                  state.stakeholder_map = resp.stakeholder_map as Stakeholder[];
                }
              }
            },
          },
        ],
      },
      {
        name: 'planner',
        config: plannerConfig,
        stageMessage: {
          startStage: 'planning',
          start: 'Writing strategic 90-day onboarding plan...',
          complete: '90-day plan complete',
        },
        onComplete: (scratchpad, state) => {
          if (Array.isArray(scratchpad.phases)) {
            state.phases = scratchpad.phases as PlanPhase[];
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
      current_stage: 'research',
      job_application_id: input.job_application_id as string | undefined,
      role_context: input.role_context as NinetyDayPlanState['role_context'] ?? {
        target_role: '',
        target_company: '',
        target_industry: '',
      },
      stakeholder_map: [] as Stakeholder[],
      quick_wins: [] as QuickWin[],
      learning_priorities: [] as LearningPriority[],
      phases: [] as PlanPhase[],
      platform_context: input.platform_context as NinetyDayPlanState['platform_context'],
      shared_context: input.shared_context as NinetyDayPlanState['shared_context'],
      target_context: input.target_context as NinetyDayPlanState['target_context'] ?? {
        target_role: '',
        target_industry: '',
        target_seniority: '',
      },
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'researcher') {
        const sharedContext = state.shared_context;
        const parts = [
          'Analyze this executive\'s target role and prepare research for the 90-day onboarding plan.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Target Role',
          `Role: ${state.role_context.target_role}`,
          `Company: ${state.role_context.target_company}`,
          `Industry: ${state.role_context.target_industry}`,
        ];

        if (state.role_context.reporting_to) parts.push(`Reporting To: ${state.role_context.reporting_to}`);
        if (state.role_context.team_size) parts.push(`Team Size: ${state.role_context.team_size}`);

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
            heading: '## Evidence Inventory',
            sharedInventory: sharedContext?.evidenceInventory,
            legacyEvidence: state.platform_context?.evidence_items,
            maxItems: 15,
          }));
        }

        parts.push(
          '',
          'Call tools in order: analyze_role_context, map_stakeholders, identify_quick_wins, assess_learning_priorities.',
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

      if (agentName === 'planner') {
        const stakeholderSummary = state.stakeholder_map.length > 0
          ? state.stakeholder_map.map((s, i) => `${i + 1}. ${s.name_or_role} (${s.relationship_type}, ${s.priority})`).join('\n')
          : '(no stakeholders mapped)';

        const quickWinSummary = state.quick_wins.length > 0
          ? state.quick_wins.map((qw, i) => `${i + 1}. ${qw.description} (impact: ${qw.impact}, effort: ${qw.effort})`).join('\n')
          : '(no quick wins identified)';

        const learningSummary = state.learning_priorities.length > 0
          ? state.learning_priorities.map((lp, i) => `${i + 1}. ${lp.area} (${lp.importance})`).join('\n')
          : '(no learning priorities assessed)';

        const parts = [
          'Write a strategic 90-day onboarding plan using the research data below.',
          '',
          '## Stakeholder Map',
          stakeholderSummary,
          '',
          '## Quick Wins',
          quickWinSummary,
          '',
          '## Learning Priorities',
          learningSummary,
          '',
          'Write the plan in order:',
          '1. Call write_30_day_plan for Phase 1: Listen & Learn',
          '2. Call write_60_day_plan for Phase 2: Contribute & Build',
          '3. Call write_90_day_plan for Phase 3: Lead & Deliver',
          '4. Call assemble_strategic_plan to produce the final plan document',
          '',
          'Do NOT skip any phase.',
        ];

        // If the user corrected the stakeholder map at the review gate, acknowledge changes
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Corrections to Stakeholder Map',
            `The user reviewed the stakeholder map and provided corrections: "${state.revision_feedback}"`,
            'Incorporate these corrections when writing the stakeholder engagement sections of the plan.',
          );
        }

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
        type: 'plan_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        phase_count: state.phases.length,
        phases: state.phases,
        stakeholder_map: state.stakeholder_map,
        quick_wins: state.quick_wins,
        learning_priorities: state.learning_priorities,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        phases: state.phases,
        stakeholder_map: state.stakeholder_map,
        quick_wins: state.quick_wins,
        learning_priorities: state.learning_priorities,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        phases: unknown;
        stakeholder_map: unknown;
        quick_wins: unknown;
      };

      try {
        await supabaseAdmin
          .from('ninety_day_plan_reports')
          .insert({
            user_id: state.user_id,
            session_id: state.session_id,
            job_application_id: state.job_application_id ?? null,
            report_markdown: data.report,
            quality_score: data.quality_score,
            phases: data.phases,
            stakeholder_map: data.stakeholder_map,
            quick_wins: data.quick_wins,
            role_context: state.role_context,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          '90-day plan: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'researcher') {
        if (!state.stakeholder_map || state.stakeholder_map.length === 0) {
          throw new Error('Researcher did not produce a stakeholder map');
        }
      }
      if (agentName === 'planner') {
        if (!state.final_report) {
          throw new Error('Planner did not produce a final report');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
