/**
 * LinkedIn Optimizer Product — ProductConfig implementation.
 *
 * Agent #11: 2-agent pipeline (Analyzer → Writer) that generates
 * LinkedIn profile optimization recommendations from resume + positioning
 * strategy + current LinkedIn profile text.
 * Autonomous — no user gates. Full report delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { analyzerConfig } from './analyzer/agent.js';
import { writerConfig } from './writer/agent.js';
import type { LinkedInOptimizerState, LinkedInOptimizerSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import {
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';

export function createLinkedInOptimizerProductConfig(): ProductConfig<LinkedInOptimizerState, LinkedInOptimizerSSEEvent> {
  return {
    domain: 'linkedin-optimizer',

    agents: [
      {
        name: 'analyzer',
        config: analyzerConfig,
        stageMessage: {
          startStage: 'analysis',
          start: 'Analyzing resume and current LinkedIn profile...',
          complete: 'Analysis complete — profile gaps and keyword coverage identified',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as LinkedInOptimizerState['resume_data'];
          }
          if (scratchpad.profile_analysis && !state.profile_analysis) {
            state.profile_analysis = scratchpad.profile_analysis as LinkedInOptimizerState['profile_analysis'];
          }
          if (scratchpad.keyword_analysis && !state.keyword_analysis) {
            state.keyword_analysis = scratchpad.keyword_analysis as LinkedInOptimizerState['keyword_analysis'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your optimized LinkedIn profile...',
          complete: 'LinkedIn optimization report complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (scratchpad.audit_report && !state.audit_report) {
            state.audit_report = scratchpad.audit_report as LinkedInOptimizerState['audit_report'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      job_application_id: input.job_application_id as string | undefined,
      platform_context: input.platform_context as LinkedInOptimizerState['platform_context'],
      shared_context: input.shared_context as LinkedInOptimizerState['shared_context'],
      target_context: {
        target_role: (input.target_role as string) ?? '',
        target_industry: (input.target_industry as string) ?? '',
        target_seniority: (input.target_seniority as string) ?? '',
      },
      sections: {} as LinkedInOptimizerState['sections'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyzer') {
        const sharedContext = state.shared_context;
        const parts = [
          'Analyze the candidate resume and current LinkedIn profile to identify optimization opportunities.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
        ];

        if (input.linkedin_headline || input.linkedin_about || input.linkedin_experience) {
          parts.push(
            '',
            '## Current LinkedIn Profile',
            `Headline: ${String(input.linkedin_headline ?? '')}`,
            `About: ${String(input.linkedin_about ?? '')}`,
            `Experience: ${String(input.linkedin_experience ?? '')}`,
          );
        }

        if (input.target_role) {
          parts.push('', `Target Role: ${String(input.target_role)}`);
        }
        if (input.target_industry) {
          parts.push(`Target Industry: ${String(input.target_industry)}`);
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
        } else if (state.platform_context?.why_me_story) {
          parts.push(...renderWhyMeStorySection({
            heading: '## Why-Me Story (from CareerIQ)',
            legacyWhyMeStory: state.platform_context?.why_me_story,
          }));
        }

        if (state.platform_context?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
          parts.push(
            '',
            ...renderPositioningStrategySection({
              heading: '## Prior Positioning Strategy',
              sharedStrategy: sharedContext?.positioningStrategy,
              legacyStrategy: state.platform_context?.positioning_strategy,
            }),
          );
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

        parts.push('', 'Call parse_inputs first, then analyze_current_profile, then identify_keyword_gaps.');

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
        const parts = [
          'Write a benchmark-quality LinkedIn profile optimization for this candidate.',
          'Every section must be grounded in the resume evidence and analysis below.',
          'Generic output that could apply to any executive is not acceptable.',
          '',
        ];

        // Pass resume data so the writer is grounded before calling any tool
        if (state.resume_data) {
          parts.push('## Candidate Resume Data');
          parts.push(`Name: ${state.resume_data.name}`);
          parts.push(`Current Title: ${state.resume_data.current_title}`);
          if (state.resume_data.career_summary) {
            parts.push(`Career Summary: ${state.resume_data.career_summary}`);
          }
          if (state.resume_data.key_skills.length > 0) {
            parts.push(`Key Skills: ${state.resume_data.key_skills.join(', ')}`);
          }
          if (state.resume_data.key_achievements.length > 0) {
            parts.push('Key Achievements:');
            for (const a of state.resume_data.key_achievements) {
              parts.push(`- ${a}`);
            }
          }
          if (state.resume_data.work_history.length > 0) {
            parts.push('Work History:');
            for (const w of state.resume_data.work_history) {
              parts.push(`- ${w.title} at ${w.company} (${w.duration})`);
              for (const h of w.highlights) {
                parts.push(`  - ${h}`);
              }
            }
          }
          parts.push('');
        } else if (input.resume_text) {
          // Fallback: pass raw resume text if structured data not yet parsed
          parts.push('## Resume Text');
          parts.push(String(input.resume_text));
          parts.push('');
        }

        if (state.target_context?.target_role) {
          parts.push(`Target Role: ${state.target_context.target_role}`);
          if (state.target_context.target_industry) {
            parts.push(`Target Industry: ${state.target_context.target_industry}`);
          }
          parts.push('');
        }

        if (state.current_profile) {
          parts.push('## Current LinkedIn Profile (what we are improving)');
          parts.push(`Headline: ${state.current_profile.headline || '(empty)'}`);
          if (state.current_profile.about) {
            parts.push(`About: ${state.current_profile.about}`);
          }
          if (state.current_profile.experience_text) {
            parts.push(`Experience: ${state.current_profile.experience_text}`);
          }
          parts.push('');
        }

        if (state.profile_analysis) {
          parts.push('## Profile Analysis (from Analyzer)');
          parts.push(`Headline Assessment: ${state.profile_analysis.headline_assessment}`);
          parts.push(`About Assessment: ${state.profile_analysis.about_assessment}`);
          if (state.profile_analysis.positioning_gaps.length > 0) {
            parts.push('Positioning Gaps:');
            for (const g of state.profile_analysis.positioning_gaps) {
              parts.push(`- ${g}`);
            }
          }
          if (state.profile_analysis.strengths.length > 0) {
            parts.push('Strengths:');
            for (const s of state.profile_analysis.strengths) {
              parts.push(`- ${s}`);
            }
          }
          parts.push('');
        }

        if (state.keyword_analysis) {
          parts.push('## Keyword Analysis (from Analyzer)');
          parts.push(`Coverage Score: ${state.keyword_analysis.coverage_score}%`);
          if (state.keyword_analysis.missing_keywords.length > 0) {
            parts.push(`Missing Keywords: ${state.keyword_analysis.missing_keywords.join(', ')}`);
          }
          if (state.keyword_analysis.recommended_keywords.length > 0) {
            parts.push(`Recommended Keywords: ${state.keyword_analysis.recommended_keywords.join(', ')}`);
          }
          parts.push('');
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
        type: 'report_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        experience_entries: state.experience_entries,
        audit_report: state.audit_report,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        sections: state.sections,
        keyword_analysis: state.keyword_analysis,
        profile_analysis: state.profile_analysis,
        audit_report: state.audit_report,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        sections: unknown;
        keyword_analysis: unknown;
        profile_analysis: unknown;
        audit_report: unknown;
      };

      try {
        await supabaseAdmin
          .from('linkedin_optimization_reports')
          .insert({
            user_id: state.user_id,
            job_application_id: state.job_application_id ?? null,
            target_role: state.target_context?.target_role ?? '',
            target_industry: state.target_context?.target_industry ?? '',
            report_markdown: data.report,
            quality_score: data.quality_score,
            sections: data.sections,
            keyword_analysis: data.keyword_analysis,
            profile_analysis: data.profile_analysis,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'LinkedIn optimizer: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'analyzer') {
        if (!state.resume_data) {
          throw new Error('Analyzer did not parse resume data');
        }
        // Profile analysis and keyword analysis are optional — profile may not be provided
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
