/**
 * Personal Brand Audit Agent Product — ProductConfig implementation.
 *
 * Agent #19: 2-agent pipeline (Brand Auditor -> Brand Advisor) that
 * audits executive personal brand across multiple touchpoints, scores
 * consistency, identifies gaps, and produces actionable recommendations.
 * Autonomous — no user gates. Full audit report delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { auditorConfig } from './auditor/agent.js';
import { advisorConfig } from './advisor/agent.js';
import type {
  PersonalBrandState,
  PersonalBrandSSEEvent,
  BrandSourceInput,
  AuditFinding,
  BrandRecommendation,
  ConsistencyScores,
} from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createPersonalBrandProductConfig(): ProductConfig<PersonalBrandState, PersonalBrandSSEEvent> {
  return {
    domain: 'personal-brand',

    agents: [
      {
        name: 'auditor',
        config: auditorConfig,
        stageMessage: {
          startStage: 'auditing',
          start: 'Auditing brand consistency across all provided sources...',
          complete: 'Audit complete — findings and consistency scores ready',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as PersonalBrandState['resume_data'];
          }
          if (Array.isArray(scratchpad.all_findings) && state.audit_findings.length === 0) {
            state.audit_findings = scratchpad.all_findings as AuditFinding[];
          }
          if (scratchpad.resume_brand || scratchpad.linkedin_brand || scratchpad.bio_brand) {
            // Consistency scores should already be on state from score_consistency tool
          }
        },
      },
      {
        name: 'advisor',
        config: advisorConfig,
        stageMessage: {
          startStage: 'advising',
          start: 'Analyzing gaps and writing improvement recommendations...',
          complete: 'Brand audit report complete',
        },
        onComplete: (scratchpad, state) => {
          if (Array.isArray(scratchpad.recommendations)) {
            state.recommendations = scratchpad.recommendations as BrandRecommendation[];
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
      current_stage: 'auditing',
      brand_sources: (input.brand_sources as BrandSourceInput[]) ?? ([] as BrandSourceInput[]),
      audit_findings: [] as AuditFinding[],
      recommendations: [] as BrandRecommendation[],
      platform_context: input.platform_context as PersonalBrandState['platform_context'],
      target_context: input.target_context as PersonalBrandState['target_context'] ?? {
        target_role: '',
        target_industry: '',
      },
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'auditor') {
        const parts = [
          'Audit this executive\'s personal brand across the provided sources. Analyze each source, then score cross-source consistency.',
          '',
        ];

        // Add each brand source
        for (const source of state.brand_sources) {
          parts.push(`## ${source.source.charAt(0).toUpperCase() + source.source.slice(1)} Content`);
          parts.push(source.content);
          parts.push('');
        }

        if (state.platform_context) {
          if (state.platform_context.positioning_strategy) {
            parts.push('## Positioning Strategy (from resume pipeline)');
            parts.push(JSON.stringify(state.platform_context.positioning_strategy, null, 2));
            parts.push('');
          }
          if (state.platform_context.bios && state.platform_context.bios.length > 0) {
            parts.push('## Existing Bios (from executive bio pipeline)');
            parts.push(JSON.stringify(state.platform_context.bios, null, 2));
            parts.push('');
          }
        }

        if (state.target_context) {
          parts.push('## Target Context');
          if (state.target_context.target_role) parts.push(`Target Role: ${state.target_context.target_role}`);
          if (state.target_context.target_industry) parts.push(`Target Industry: ${state.target_context.target_industry}`);
          parts.push('');
        }

        // Build tool call instructions based on available sources
        const sourceTypes = state.brand_sources.map((s) => s.source);
        const toolOrder: string[] = [];
        if (sourceTypes.includes('resume')) {
          toolOrder.push('analyze_resume_brand (with the resume text)');
        }
        if (sourceTypes.includes('linkedin')) {
          toolOrder.push('analyze_linkedin_brand (with the LinkedIn text)');
        }
        if (sourceTypes.includes('bio')) {
          toolOrder.push('analyze_bio_brand (with the bio text)');
        }
        toolOrder.push('score_consistency');

        parts.push(`Call tools in order: ${toolOrder.join(', ')}.`);

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

      if (agentName === 'advisor') {
        const findingsSummary = state.audit_findings.length > 0
          ? state.audit_findings.map((f) => `- [${f.severity}] ${f.title} (${f.source})`).join('\n')
          : '(no findings)';

        const scoresSummary = state.consistency_scores
          ? `Overall: ${state.consistency_scores.overall}/100, Messaging: ${state.consistency_scores.messaging}/100, Value Prop: ${state.consistency_scores.value_proposition}/100`
          : '(no scores available)';

        const parts = [
          'Produce a comprehensive brand improvement plan based on the following audit results:',
          '',
          '## Audit Findings',
          findingsSummary,
          '',
          '## Consistency Scores',
          scoresSummary,
          '',
          '## Sources Analyzed',
          state.brand_sources.map((s) => `- ${s.source}`).join('\n'),
          '',
          'Follow this workflow:',
          '1. Call identify_gaps to find patterns and contradictions',
          '2. Call write_recommendations to produce actionable recommendations',
          '3. Call prioritize_fixes to rank by impact and effort',
          '4. Call assemble_audit_report to produce the final report',
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
        finding_count: state.audit_findings.length,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        audit_findings: state.audit_findings,
        consistency_scores: state.consistency_scores,
        recommendations: state.recommendations,
        brand_sources: state.brand_sources,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        audit_findings: AuditFinding[];
        consistency_scores: ConsistencyScores;
        recommendations: BrandRecommendation[];
        brand_sources: BrandSourceInput[];
      };

      try {
        await supabaseAdmin
          .from('personal_brand_reports')
          .insert({
            user_id: state.user_id,
            report_markdown: data.report,
            quality_score: data.quality_score,
            audit_findings: data.audit_findings,
            consistency_scores: data.consistency_scores,
            recommendations: data.recommendations,
            brand_sources: data.brand_sources,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Personal brand: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'auditor') {
        if (!state.audit_findings || state.audit_findings.length === 0) {
          throw new Error('Auditor did not produce audit findings');
        }
      }
      if (agentName === 'advisor') {
        if (!state.final_report) {
          throw new Error('Advisor did not produce a final report');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
