/**
 * Pipeline Orchestrator
 *
 * Replaces the monolithic agent loop (loop.ts) with a linear pipeline of
 * 7 specialized agents. Manages data flow between agents, SSE events,
 * user interaction gates, and the revision loop.
 *
 * The orchestrator itself uses no LLM calls — it's pure coordination logic.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { MODEL_PRICING } from '../lib/llm.js';
import { createSessionLogger } from '../lib/logger.js';
import { runIntakeAgent } from './intake.js';
import { generateQuestions, synthesizeProfile } from './positioning-coach.js';
import { runResearchAgent } from './research.js';
import { runGapAnalyst } from './gap-analyst.js';
import { runArchitect } from './architect.js';
import { runSectionWriter, runSectionRevision } from './section-writer.js';
import { runQualityReviewer } from './quality-reviewer.js';
import type {
  PipelineState,
  PipelineStage,
  PipelineSSEEvent,
  IntakeOutput,
  PositioningProfile,
  PositioningQuestion,
  ArchitectOutput,
  SectionWriterOutput,
  QualityReviewerOutput,
} from './types.js';

export type PipelineEmitter = (event: PipelineSSEEvent) => void;

/**
 * User response callback — the pipeline pauses at interactive gates
 * and the orchestrator calls this to wait for user input.
 */
export type WaitForUser = <T>(gate: string) => Promise<T>;

// ─── Pipeline entry point ────────────────────────────────────────────

export interface PipelineConfig {
  session_id: string;
  user_id: string;
  raw_resume_text: string;
  job_description: string;
  company_name: string;
  emit: PipelineEmitter;
  waitForUser: WaitForUser;
}

/**
 * Run the full 7-agent pipeline from start to finish.
 * The pipeline pauses at user interaction gates and resumes when responses arrive.
 */
export async function runPipeline(config: PipelineConfig): Promise<PipelineState> {
  const { session_id, user_id, emit, waitForUser } = config;
  const log = createSessionLogger(session_id);

  const state: PipelineState = {
    session_id,
    user_id,
    current_stage: 'intake',
    revision_count: 0,
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  };

  try {
    // ─── Stage 1: Intake ─────────────────────────────────────────
    emit({ type: 'stage_start', stage: 'intake', message: 'Parsing your resume...' });
    state.current_stage = 'intake';

    state.intake = await runIntakeAgent({
      raw_resume_text: config.raw_resume_text,
      job_description: config.job_description,
    });

    emit({ type: 'stage_complete', stage: 'intake', message: 'Resume parsed successfully' });
    emit({
      type: 'right_panel_update',
      panel_type: 'onboarding_summary',
      data: buildOnboardingSummary(state.intake),
    });

    log.info({ experience_count: state.intake.experience.length }, 'Intake complete');

    // ─── Stage 2: Positioning Coach ──────────────────────────────
    state.current_stage = 'positioning';
    state.positioning = await runPositioningStage(
      state, config, emit, waitForUser, log,
    );

    // ─── Stage 3: Research ───────────────────────────────────────
    emit({ type: 'stage_start', stage: 'research', message: 'Researching company, role, and industry...' });
    state.current_stage = 'research';

    state.research = await runResearchAgent({
      job_description: config.job_description,
      company_name: config.company_name,
      parsed_resume: state.intake,
    });

    emit({ type: 'stage_complete', stage: 'research', message: 'Research complete' });
    emit({
      type: 'right_panel_update',
      panel_type: 'research_dashboard',
      data: {
        company: state.research.company_research,
        jd_requirements: {
          must_haves: state.research.jd_analysis.must_haves,
          nice_to_haves: state.research.jd_analysis.nice_to_haves,
          seniority_level: state.research.jd_analysis.seniority_level,
        },
        benchmark: state.research.benchmark_candidate,
      },
    });

    log.info({ coverage_keywords: state.research.jd_analysis.language_keywords.length }, 'Research complete');

    // ─── Stage 4: Gap Analysis ───────────────────────────────────
    emit({ type: 'stage_start', stage: 'gap_analysis', message: 'Analyzing requirement gaps...' });
    state.current_stage = 'gap_analysis';

    state.gap_analysis = await runGapAnalyst({
      parsed_resume: state.intake,
      positioning: state.positioning,
      jd_analysis: state.research.jd_analysis,
      benchmark: state.research.benchmark_candidate,
    });

    emit({ type: 'stage_complete', stage: 'gap_analysis', message: `Coverage: ${state.gap_analysis.coverage_score}%` });
    emit({
      type: 'right_panel_update',
      panel_type: 'gap_analysis',
      data: {
        requirements: state.gap_analysis.requirements,
        coverage_score: state.gap_analysis.coverage_score,
        critical_gaps: state.gap_analysis.critical_gaps,
        strength_summary: state.gap_analysis.strength_summary,
      },
    });

    log.info({ coverage: state.gap_analysis.coverage_score, gaps: state.gap_analysis.critical_gaps.length }, 'Gap analysis complete');

    // ─── Stage 5: Resume Architect ───────────────────────────────
    emit({ type: 'stage_start', stage: 'architect', message: 'Designing resume strategy...' });
    state.current_stage = 'architect';

    state.architect = await runArchitect({
      parsed_resume: state.intake,
      positioning: state.positioning,
      research: state.research,
      gap_analysis: state.gap_analysis,
    });

    emit({ type: 'stage_complete', stage: 'architect', message: 'Blueprint ready for review' });

    // ─── Gate: User reviews blueprint ────────────────────────────
    state.current_stage = 'architect_review';
    // blueprint_ready event sets up BlueprintReviewPanel with approve button
    emit({ type: 'blueprint_ready', blueprint: state.architect });

    await waitForUser<void>('architect_review');

    log.info('Blueprint approved by user');

    // ─── Stage 6: Section Writing ────────────────────────────────
    emit({ type: 'stage_start', stage: 'section_writing', message: 'Writing resume sections...' });
    state.current_stage = 'section_writing';
    state.sections = {};

    const sectionCalls = buildSectionCalls(state.architect, state.intake, state.positioning);

    for (const call of sectionCalls) {
      const result = await runSectionWriter(call);
      state.sections[call.section] = result;

      // Emit each section for progressive rendering
      emit({ type: 'section_draft', section: call.section, content: result.content });

      // Gate: User approves each section
      state.current_stage = 'section_review';
      const approved = await waitForUser<boolean>(`section_review_${call.section}`);

      if (approved) {
        emit({ type: 'section_approved', section: call.section });
      }
      // If not approved, the user provided feedback which triggered a rewrite
      // (handled by the waitForUser callback in the route layer)
    }

    emit({ type: 'stage_complete', stage: 'section_writing', message: 'All sections written' });
    emit({
      type: 'right_panel_update',
      panel_type: 'live_resume',
      data: {
        sections: Object.fromEntries(
          Object.entries(state.sections).map(([k, v]) => [k, v.content])
        ),
      },
    });

    log.info({ sections: Object.keys(state.sections).length }, 'Section writing complete');

    // ─── Stage 7: Quality Review ─────────────────────────────────
    emit({ type: 'stage_start', stage: 'quality_review', message: 'Running quality review...' });
    state.current_stage = 'quality_review';

    const fullText = assembleResume(state.sections, state.architect);

    state.quality_review = await runQualityReviewer({
      assembled_resume: {
        sections: Object.fromEntries(
          Object.entries(state.sections).map(([k, v]) => [k, v.content])
        ),
        full_text: fullText,
      },
      architect_blueprint: state.architect,
      jd_analysis: state.research.jd_analysis,
      evidence_library: state.positioning.evidence_library,
    });

    emit({ type: 'quality_scores', scores: state.quality_review.scores });

    // ─── Revision loop (max 1 cycle) ────────────────────────────
    if (state.quality_review.decision === 'revise' && state.quality_review.revision_instructions) {
      state.current_stage = 'revision';
      state.revision_count = 1;

      emit({
        type: 'revision_start',
        instructions: state.quality_review.revision_instructions,
      });

      for (const instruction of state.quality_review.revision_instructions) {
        const section = instruction.target_section;
        const original = state.sections[section];
        if (!original) continue;

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        const revised = await runSectionRevision(
          section,
          original.content,
          instruction.instruction,
          blueprintSlice,
          state.architect.global_rules,
        );

        state.sections[section] = revised;
        emit({ type: 'section_revised', section, content: revised.content });
      }

      log.info({ revisions: state.quality_review.revision_instructions.length }, 'Revision cycle complete');
    }

    emit({ type: 'stage_complete', stage: 'quality_review', message: 'Quality review complete' });

    // ─── Complete ────────────────────────────────────────────────
    state.current_stage = 'complete';
    emit({
      type: 'pipeline_complete',
      session_id,
      contact_info: state.intake.contact,
      company_name: config.company_name,
    });

    // Persist final state
    await persistSession(state);

    log.info({
      stages_completed: 7,
      sections: Object.keys(state.sections).length,
      quality_decision: state.quality_review.decision,
      quality_scores: state.quality_review.scores,
    }, 'Pipeline complete');

    return state;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMsg, stage: state.current_stage }, 'Pipeline error');
    emit({ type: 'pipeline_error', stage: state.current_stage, error: errorMsg });
    throw error;
  }
}

// ─── Positioning stage (interactive) ─────────────────────────────────

async function runPositioningStage(
  state: PipelineState,
  config: PipelineConfig,
  emit: PipelineEmitter,
  waitForUser: WaitForUser,
  log: ReturnType<typeof createSessionLogger>,
): Promise<PositioningProfile> {
  // Check for existing positioning profile
  const { data: existingProfile } = await supabaseAdmin
    .from('user_positioning_profiles')
    .select('id, positioning_data, updated_at')
    .eq('user_id', config.user_id)
    .single();

  if (existingProfile?.positioning_data) {
    // User has a saved profile — ask if they want to reuse it
    emit({
      type: 'positioning_profile_found',
      profile: existingProfile.positioning_data as PositioningProfile,
      updated_at: existingProfile.updated_at,
    });

    const choice = await waitForUser<'reuse' | 'update' | 'fresh'>('positioning_profile_choice');
    state.positioning_reuse_mode = choice;

    if (choice === 'reuse') {
      state.positioning_profile_id = existingProfile.id;
      emit({ type: 'stage_complete', stage: 'positioning', message: 'Using saved positioning profile' });
      log.info('Reusing existing positioning profile');
      return existingProfile.positioning_data as PositioningProfile;
    }
    // For 'update' and 'fresh', proceed with the interview
  }

  // Run the positioning interview
  emit({ type: 'stage_start', stage: 'positioning', message: 'Starting positioning interview...' });

  const questions = generateQuestions(state.intake!);
  const answers: Array<{ question_id: string; answer: string; selected_suggestion?: string }> = [];

  for (const question of questions) {
    emit({ type: 'positioning_question', question });

    const response = await waitForUser<{ answer: string; selected_suggestion?: string }>(
      `positioning_q_${question.id}`,
    );

    answers.push({
      question_id: question.id,
      answer: response.answer,
      selected_suggestion: response.selected_suggestion,
    });
  }

  // Synthesize the profile
  emit({ type: 'transparency', message: 'Synthesizing your positioning profile...', stage: 'positioning' });
  const profile = await synthesizeProfile(state.intake!, answers);

  // Save to database
  const { data: saved } = await supabaseAdmin
    .from('user_positioning_profiles')
    .upsert({
      user_id: config.user_id,
      positioning_data: profile,
      version: existingProfile ? (existingProfile as Record<string, unknown>).version as number + 1 : 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (saved) {
    state.positioning_profile_id = saved.id;
  }

  emit({ type: 'stage_complete', stage: 'positioning', message: 'Positioning profile created and saved' });
  log.info({ capabilities: profile.top_capabilities.length, evidence: profile.evidence_library.length }, 'Positioning complete');

  return profile;
}

// ─── Section call builder ────────────────────────────────────────────

function buildSectionCalls(
  blueprint: ArchitectOutput,
  resume: IntakeOutput,
  positioning: PositioningProfile,
): Array<{ section: string; blueprint_slice: Record<string, unknown>; evidence_sources: Record<string, unknown>; global_rules: ArchitectOutput['global_rules'] }> {
  const calls: Array<{ section: string; blueprint_slice: Record<string, unknown>; evidence_sources: Record<string, unknown>; global_rules: ArchitectOutput['global_rules'] }> = [];

  for (const section of blueprint.section_plan.order) {
    if (section === 'header') continue; // Header is built from contact info, no LLM needed

    const blueprintSlice = getSectionBlueprint(section, blueprint);
    const evidenceSources = getSectionEvidence(section, blueprint, resume, positioning);

    calls.push({
      section,
      blueprint_slice: blueprintSlice,
      evidence_sources: evidenceSources,
      global_rules: blueprint.global_rules,
    });
  }

  return calls;
}

function getSectionBlueprint(section: string, blueprint: ArchitectOutput): Record<string, unknown> {
  switch (section) {
    case 'summary':
      return blueprint.summary_blueprint as unknown as Record<string, unknown>;
    case 'selected_accomplishments':
      return { accomplishments: blueprint.evidence_allocation.selected_accomplishments };
    case 'skills':
      return blueprint.skills_blueprint as unknown as Record<string, unknown>;
    case 'education_and_certifications':
      return { age_protection: blueprint.age_protection };
    default:
      if (section.startsWith('experience')) {
        // Map "experience" or "experience_role_0" etc.
        const roleKey = section.replace('experience_', '').replace('experience', 'role_0');
        const key = section === 'experience' ? 'role_0' : roleKey;
        return {
          role: blueprint.evidence_allocation.experience_section[key] ?? {},
          role_meta: blueprint.experience_blueprint.roles.find(r =>
            key === `role_${blueprint.experience_blueprint.roles.indexOf(r)}`
          ) ?? blueprint.experience_blueprint.roles[0] ?? {},
          keyword_targets: blueprint.keyword_map,
        };
      }
      return {};
  }
}

function getSectionEvidence(
  section: string,
  blueprint: ArchitectOutput,
  resume: IntakeOutput,
  positioning: PositioningProfile,
): Record<string, unknown> {
  return {
    evidence_library: positioning.evidence_library,
    authentic_phrases: positioning.authentic_phrases,
    career_arc: positioning.career_arc,
    top_capabilities: positioning.top_capabilities,
    original_resume: {
      summary: resume.summary,
      experience: resume.experience,
      skills: resume.skills,
      education: resume.education,
      certifications: resume.certifications,
    },
  };
}

// ─── Resume assembly ─────────────────────────────────────────────────

function assembleResume(
  sections: Record<string, SectionWriterOutput>,
  blueprint: ArchitectOutput,
): string {
  const parts: string[] = [];

  for (const sectionName of blueprint.section_plan.order) {
    const section = sections[sectionName];
    if (section) {
      parts.push(section.content);
    }
  }

  return parts.join('\n\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildOnboardingSummary(intake: IntakeOutput): Record<string, unknown> {
  const experienceYears = intake.career_span_years;
  const companiesCount = intake.experience.length;
  const skillsCount = intake.skills.length;

  const leadershipRoles = intake.experience.filter(e =>
    /manager|director|vp|vice president|head of|lead|chief|principal|senior/i.test(e.title)
  );
  const leadershipSpan = leadershipRoles.length > 0
    ? (() => {
        const years = leadershipRoles.map(e => parseInt(e.start_date)).filter(y => !isNaN(y));
        if (years.length === 0) return undefined;
        const span = new Date().getFullYear() - Math.min(...years);
        return span > 0 ? `${span}+ years` : undefined;
      })()
    : undefined;

  return {
    years_of_experience: experienceYears,
    companies_count: companiesCount,
    skills_count: skillsCount,
    leadership_span: leadershipSpan,
    strengths: intake.experience.slice(0, 3).map(e => `${e.title} at ${e.company}`),
  };
}

async function persistSession(state: PipelineState): Promise<void> {
  try {
    await supabaseAdmin
      .from('coach_sessions')
      .update({
        status: 'completed',
        input_tokens_used: state.token_usage.input_tokens,
        output_tokens_used: state.token_usage.output_tokens,
        estimated_cost_usd: state.token_usage.estimated_cost_usd,
        positioning_profile_id: state.positioning_profile_id,
      })
      .eq('id', state.session_id)
      .eq('user_id', state.user_id);
  } catch {
    // Non-critical — log but don't fail the pipeline
  }
}
