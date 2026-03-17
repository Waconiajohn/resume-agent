/**
 * Counter-Offer Simulation Product — ProductConfig implementation.
 *
 * Single-agent pipeline (Employer only). Gate-based: the agent pauses once
 * per negotiation round for the user to respond, then evaluates and continues.
 *
 * Full mode:        3 rounds (initial_response → counter → final)
 * Single-round mode: 1 round of a specified type
 *
 * Results are ephemeral — no DB persistence. The simulation_complete SSE
 * event carries the full summary to the frontend.
 */

import type { ProductConfig } from '../../runtime/product-config.js';
import { employerConfig } from './employer/agent.js';
import type {
  CounterOfferSimState,
  CounterOfferSSEEvent,
  CounterOfferMode,
  NegotiationRound,
} from './types.js';

export function createCounterOfferSimProductConfig(): ProductConfig<
  CounterOfferSimState,
  CounterOfferSSEEvent
> {
  return {
    domain: 'counter-offer-simulation',

    agents: [
      {
        name: 'employer',
        config: employerConfig,
        stageMessage: {
          startStage: 'negotiation',
          start: 'Starting your counter-offer negotiation simulation...',
          complete: 'Negotiation simulation complete — reviewing your performance',
        },
        onComplete: (scratchpad, state) => {
          // Transfer accumulated data from scratchpad if not already in state
          if (Array.isArray(scratchpad.pushbacks) && state.pushbacks.length === 0) {
            state.pushbacks = scratchpad.pushbacks as CounterOfferSimState['pushbacks'];
          }
          if (Array.isArray(scratchpad.evaluations) && state.evaluations.length === 0) {
            state.evaluations = scratchpad.evaluations as CounterOfferSimState['evaluations'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => {
      const mode: CounterOfferMode =
        input.mode === 'single_round' ? 'single_round' : 'full';
      const maxRounds = mode === 'single_round' ? 1 : 3;

      return {
        session_id: sessionId,
        user_id: userId,
        current_stage: 'negotiation',
        mode,
        max_rounds: maxRounds,
        current_round: 0,
        pushbacks: [],
        evaluations: [],
        offer_company: String(input.offer_company ?? 'the company'),
        offer_role: String(input.offer_role ?? 'the role'),
        offer_base_salary: input.offer_base_salary ? Number(input.offer_base_salary) : undefined,
        offer_total_comp: input.offer_total_comp ? Number(input.offer_total_comp) : undefined,
        target_salary: input.target_salary ? Number(input.target_salary) : undefined,
        resume_text: input.resume_text ? String(input.resume_text) : undefined,
        platform_context: input.platform_context as CounterOfferSimState['platform_context'],
      };
    },

    buildAgentMessage: (agentName, state, input) => {
      if (agentName !== 'employer') return '';

      const parts: string[] = [];

      if (state.mode === 'full') {
        parts.push(
          `Conduct a 3-round counter-offer negotiation simulation for ${state.offer_company} (${state.offer_role}).`,
          '',
          `For each round follow this exact sequence:`,
          `  generate_pushback → present_to_user_pushback → evaluate_response`,
          '',
          `Round sequence:`,
          `  Round 1: round_type=initial_response`,
          `  Round 2: round_type=counter`,
          `  Round 3: round_type=final`,
          '',
          `After all 3 rounds are complete, call emit_transparency with a brief message ` +
            `summarizing overall performance (e.g. average score, top strength observed). ` +
            `The system will generate the final summary automatically.`,
        );
      } else {
        // Single-round mode
        const roundType: NegotiationRound =
          input.round_type === 'counter'
            ? 'counter'
            : input.round_type === 'final'
              ? 'final'
              : 'initial_response';

        parts.push(
          `Conduct a focused single-round negotiation simulation for ${state.offer_company} (${state.offer_role}).`,
          '',
          `Sequence: generate_pushback (round_type: ${roundType}) → present_to_user_pushback → evaluate_response`,
          '',
          `Provide detailed evaluation feedback — this is a practice session so the candidate ` +
            `wants to understand exactly how to improve their negotiation technique.`,
        );
      }

      // Offer context
      parts.push('', '## Offer Details');
      parts.push(`Company: ${state.offer_company}`);
      parts.push(`Role: ${state.offer_role}`);
      if (state.offer_base_salary) {
        parts.push(`Offered base salary: $${state.offer_base_salary.toLocaleString()}`);
      }
      if (state.offer_total_comp) {
        parts.push(`Offered total comp: $${state.offer_total_comp.toLocaleString()}`);
      }
      if (state.target_salary) {
        parts.push(`Candidate's target salary: $${state.target_salary.toLocaleString()}`);
      }

      // Resume context
      if (state.resume_text) {
        parts.push('', '## Candidate Resume (excerpt)', state.resume_text.slice(0, 3000));
      }

      // Platform context enrichment
      if (state.platform_context?.positioning_strategy) {
        parts.push(
          '',
          '## Prior Positioning Strategy (from CareerIQ resume session)',
          JSON.stringify(state.platform_context.positioning_strategy, null, 2),
        );
      }
      if (state.platform_context?.why_me_story) {
        parts.push(
          '',
          '## Why-Me Story',
          typeof state.platform_context.why_me_story === 'string'
            ? state.platform_context.why_me_story
            : JSON.stringify(state.platform_context.why_me_story, null, 2),
        );
      }
      if (state.platform_context?.market_research) {
        parts.push(
          '',
          '## Market Research (from prior salary negotiation session)',
          JSON.stringify(state.platform_context.market_research, null, 2),
        );
      }

      return parts.join('\n');
    },

    finalizeResult: (state, _input, emit) => {
      const evaluations = state.evaluations;
      const totalRounds = evaluations.length;

      let overallScore = 0;
      let bestRound = 1;
      let bestScore = 0;
      const allStrengths: string[] = [];
      const allImprovements: string[] = [];

      if (totalRounds > 0) {
        overallScore = Math.round(
          evaluations.reduce((sum, e) => sum + e.overall_score, 0) / totalRounds,
        );

        // Find the best-performing round
        for (const e of evaluations) {
          if (e.overall_score > bestScore) {
            bestScore = e.overall_score;
            bestRound = e.round;
          }
          for (const s of e.what_worked) {
            if (!allStrengths.includes(s)) allStrengths.push(s);
          }
          for (const imp of e.what_to_improve) {
            if (!allImprovements.includes(imp)) allImprovements.push(imp);
          }
        }
      }

      // Generate recommendation based on overall score
      let recommendation: string;
      if (overallScore >= 85) {
        recommendation =
          'Outstanding negotiation performance. You project confidence, anchor effectively to your value, ' +
          'and maintain a collaborative tone. In the real conversation, keep the same composure and ' +
          'ensure you have market data ready to reference.';
      } else if (overallScore >= 70) {
        recommendation =
          'Strong performance with room to sharpen your anchoring. You held your ground well in most ' +
          'rounds — focus on leading with specific market data and concrete accomplishments rather than ' +
          'general statements about your experience.';
      } else if (overallScore >= 55) {
        recommendation =
          'Solid foundation with opportunities to build confidence. Practice responding to pushback ' +
          'without reanchoring to the employer\'s number. Lead with your value, not their constraints. ' +
          'Prepare 2-3 specific data points before the real conversation.';
      } else {
        recommendation =
          'Good start — negotiating is a skill that improves with practice. Focus on two things: ' +
          '(1) never accept the employer\'s frame as the starting point, and (2) always have a ' +
          'specific number anchored to market data. Revisit the simulation after reviewing market research.';
      }

      const summary: CounterOfferSimState['final_summary'] = {
        overall_score: overallScore,
        total_rounds: totalRounds,
        best_round: bestRound,
        strengths: allStrengths.slice(0, 5),
        areas_for_improvement: allImprovements.slice(0, 5),
        recommendation,
      };

      // Persist final summary to state
      state.final_summary = summary;

      emit({
        type: 'simulation_complete',
        session_id: state.session_id,
        summary,
      });

      return { summary, evaluations };
    },

    // No DB persistence — counter-offer simulations are ephemeral
    persistResult: undefined,

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
