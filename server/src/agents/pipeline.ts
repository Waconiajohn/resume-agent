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
import { runAtsComplianceCheck, type AtsFinding } from './ats-rules.js';
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

type StageTimingMap = Partial<Record<PipelineStage, number>>;

interface FinalResumePayload {
  summary: string;
  selected_accomplishments?: string;
  experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    location: string;
    bullets: Array<{ text: string; source: string }>;
  }>;
  skills: Record<string, string[]>;
  education: Array<{ institution: string; degree: string; field: string; year: string }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  ats_score: number;
  contact_info?: Record<string, string>;
  section_order?: string[];
  company_name?: string;
  job_title?: string;
  _raw_sections?: Record<string, string>;
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
  const stageTimingsMs: StageTimingMap = {};
  const stageStart = new Map<PipelineStage, number>();
  const markStageStart = (stage: PipelineStage) => stageStart.set(stage, Date.now());
  const markStageEnd = (stage: PipelineStage) => {
    const start = stageStart.get(stage);
    if (start) stageTimingsMs[stage] = Date.now() - start;
  };

  try {
    // ─── Stage 1: Intake ─────────────────────────────────────────
    emit({ type: 'stage_start', stage: 'intake', message: 'Parsing your resume...' });
    state.current_stage = 'intake';
    markStageStart('intake');

    state.intake = await runIntakeAgent({
      raw_resume_text: config.raw_resume_text,
      job_description: config.job_description,
    });

    markStageEnd('intake');
    emit({ type: 'stage_complete', stage: 'intake', message: 'Resume parsed successfully', duration_ms: stageTimingsMs.intake });
    emit({
      type: 'right_panel_update',
      panel_type: 'onboarding_summary',
      data: buildOnboardingSummary(state.intake),
    });

    log.info({ experience_count: state.intake.experience.length }, 'Intake complete');

    // ─── Stage 2: Positioning Coach ──────────────────────────────
    state.current_stage = 'positioning';
    markStageStart('positioning');
    state.positioning = await runPositioningStage(
      state, config, emit, waitForUser, log,
    );
    markStageEnd('positioning');

    // ─── Stage 3: Research ───────────────────────────────────────
    emit({ type: 'stage_start', stage: 'research', message: 'Researching company, role, and industry...' });
    state.current_stage = 'research';
    markStageStart('research');

    state.research = await runResearchAgent({
      job_description: config.job_description,
      company_name: config.company_name,
      parsed_resume: state.intake,
    });

    markStageEnd('research');
    emit({ type: 'stage_complete', stage: 'research', message: 'Research complete', duration_ms: stageTimingsMs.research });
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
    markStageStart('gap_analysis');

    state.gap_analysis = await runGapAnalyst({
      parsed_resume: state.intake,
      positioning: state.positioning,
      jd_analysis: state.research.jd_analysis,
      benchmark: state.research.benchmark_candidate,
    });

    markStageEnd('gap_analysis');
    emit({ type: 'stage_complete', stage: 'gap_analysis', message: `Coverage: ${state.gap_analysis.coverage_score}%`, duration_ms: stageTimingsMs.gap_analysis });
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
    markStageStart('architect');

    state.architect = await runArchitect({
      parsed_resume: state.intake,
      positioning: state.positioning,
      research: state.research,
      gap_analysis: state.gap_analysis,
    });

    markStageEnd('architect');
    emit({ type: 'stage_complete', stage: 'architect', message: 'Blueprint ready for review', duration_ms: stageTimingsMs.architect });

    // ─── Gate: User reviews blueprint ────────────────────────────
    state.current_stage = 'architect_review';
    markStageStart('architect_review');
    // blueprint_ready event sets up BlueprintReviewPanel with approve button
    emit({ type: 'blueprint_ready', blueprint: state.architect });

    await waitForUser<void>('architect_review');
    markStageEnd('architect_review');

    log.info('Blueprint approved by user');

    // ─── Stage 6: Section Writing ────────────────────────────────
    emit({ type: 'stage_start', stage: 'section_writing', message: 'Writing resume sections...' });
    state.current_stage = 'section_writing';
    markStageStart('section_writing');
    state.sections = {};

    const sectionCalls = buildSectionCalls(state.architect, state.intake, state.positioning);

    // Fire ALL section LLM calls in parallel for ~40% speed improvement
    const sectionPromises = new Map<string, Promise<{ ok: true; value: SectionWriterOutput } | { ok: false; error: unknown }>>();
    for (const call of sectionCalls) {
      // Catch per-promise immediately to avoid unhandled rejections while user is approving earlier sections.
      sectionPromises.set(
        call.section,
        runSectionWriter(call)
          .then((value) => ({ ok: true as const, value }))
          .catch((error) => ({ ok: false as const, error })),
      );
    }

    // Present sections sequentially for user review (LLM work already in flight)
    for (const call of sectionCalls) {
      const outcome = await sectionPromises.get(call.section)!;
      if (!outcome.ok) {
        throw outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error));
      }
      const result = outcome.value;
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

    markStageEnd('section_writing');
    emit({ type: 'stage_complete', stage: 'section_writing', message: 'All sections written', duration_ms: stageTimingsMs.section_writing });
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
    markStageStart('quality_review');

    const fullText = assembleResume(state.sections, state.architect);

    // Simple keyword coverage check (no LLM call needed)
    const keywordCoverage = computeKeywordCoverage(fullText, state.research.jd_analysis.language_keywords);
    emit({
      type: 'transparency',
      stage: 'quality_review',
      message: `Keyword coverage: ${keywordCoverage.found}/${keywordCoverage.total} JD keywords found (${keywordCoverage.percentage}%)`,
    });

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
      markStageStart('revision');
      state.revision_count = 1;

      emit({
        type: 'revision_start',
        instructions: state.quality_review.revision_instructions,
      });

      const actionable = state.quality_review.revision_instructions.slice(0, 4);
      for (const instruction of actionable) {
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
      markStageEnd('revision');
    }

    // ─── Explicit ATS compliance check before export ──────────────
    const postRevisionText = assembleResume(state.sections, state.architect);
    const atsFindings = runAtsComplianceCheck(postRevisionText);
    if (atsFindings.length > 0) {
      state.current_stage = 'revision';
      emit({
        type: 'transparency',
        stage: 'revision',
        message: 'Applying ATS compliance corrections before export...',
      });

      for (const finding of atsFindings.filter((f) => f.priority !== 'low').slice(0, 3)) {
        const section = mapFindingToSection(finding.section, state.sections);
        const original = section ? state.sections[section] : undefined;
        if (!section || !original) continue;

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        const revised = await runSectionRevision(
          section,
          original.content,
          `${finding.issue}. ${finding.instruction}`,
          blueprintSlice,
          state.architect.global_rules,
        );
        state.sections[section] = revised;
        emit({ type: 'section_revised', section, content: revised.content });
      }
    }

    markStageEnd('quality_review');
    emit({ type: 'stage_complete', stage: 'quality_review', message: 'Quality review complete', duration_ms: stageTimingsMs.quality_review });

    // ─── Complete ────────────────────────────────────────────────
    state.current_stage = 'complete';
    const finalResume = buildFinalResumePayload(state, config);
    const exportValidation = runAtsComplianceCheck(assembleResume(state.sections, state.architect));
    emit({
      type: 'pipeline_complete',
      session_id,
      contact_info: state.intake.contact,
      company_name: config.company_name,
      resume: finalResume,
      export_validation: {
        passed: exportValidation.length === 0,
        findings: exportValidation,
      },
    });

    // Persist final state (including resume for reconnect restore)
    await persistSession(state, finalResume);

    log.info({
      stages_completed: 7,
      sections: Object.keys(state.sections).length,
      quality_decision: state.quality_review.decision,
      quality_scores: state.quality_review.scores,
      stage_timings_ms: stageTimingsMs,
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

    // Expand "experience" into one call per role from the blueprint
    if (section === 'experience') {
      const roleCount = blueprint.experience_blueprint.roles.length;
      for (let i = 0; i < roleCount; i++) {
        const roleSection = `experience_role_${i}`;
        calls.push({
          section: roleSection,
          blueprint_slice: getSectionBlueprint(roleSection, blueprint),
          evidence_sources: getSectionEvidence(roleSection, blueprint, resume, positioning),
          global_rules: blueprint.global_rules,
        });
      }
      // Earlier career as a separate section if included
      if (blueprint.experience_blueprint.earlier_career?.include) {
        calls.push({
          section: 'earlier_career',
          blueprint_slice: {
            earlier_career: blueprint.experience_blueprint.earlier_career,
          },
          evidence_sources: getSectionEvidence('earlier_career', blueprint, resume, positioning),
          global_rules: blueprint.global_rules,
        });
      }
      continue;
    }

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
        // Map "experience" to all role slices; "experience_role_N" to a single role.
        if (section === 'experience') {
          return {
            roles: blueprint.experience_blueprint.roles,
            experience_instructions: blueprint.evidence_allocation.experience_section,
            keyword_targets: blueprint.keyword_map,
          };
        }
        const roleKey = section.replace('experience_', '');
        const roleIndex = parseInt(roleKey.replace('role_', ''), 10);
        return {
          role: blueprint.evidence_allocation.experience_section[roleKey] ?? {},
          role_meta: blueprint.experience_blueprint.roles[roleIndex] ?? blueprint.experience_blueprint.roles[0] ?? {},
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
  // Minimal shared context — only keyword targets (needed everywhere for density)
  const keywordTargets = blueprint.keyword_map;

  if (section === 'summary') {
    return {
      authentic_phrases: positioning.authentic_phrases.slice(0, 8),
      career_arc: positioning.career_arc,
      top_capabilities: positioning.top_capabilities.slice(0, 6),
      keyword_targets: keywordTargets,
      evidence_library: positioning.evidence_library.slice(0, 10),
      original_summary: resume.summary,
    };
  }

  if (section === 'selected_accomplishments') {
    // Only the allocated accomplishments + evidence they reference
    const allocated = blueprint.evidence_allocation.selected_accomplishments ?? [];
    const allocatedIds = new Set(allocated.map(a => a.evidence_id));
    const relevantEvidence = positioning.evidence_library.filter(e => e.id && allocatedIds.has(e.id));
    return {
      keyword_targets: keywordTargets,
      top_capabilities: positioning.top_capabilities.slice(0, 4),
      accomplishments_target: allocated,
      evidence_library: relevantEvidence.length > 0 ? relevantEvidence : positioning.evidence_library.slice(0, 8),
    };
  }

  if (section === 'skills') {
    return {
      keyword_targets: keywordTargets,
      original_skills: resume.skills,
      skills_blueprint: blueprint.skills_blueprint,
    };
  }

  if (section === 'education_and_certifications') {
    return {
      original_education: resume.education,
      original_certifications: resume.certifications,
      age_protection: blueprint.age_protection,
    };
  }

  if (section.startsWith('experience_role_')) {
    const roleKey = section.replace('experience_', '');
    const roleAllocation = blueprint.evidence_allocation.experience_section[roleKey] ?? {};
    // Only include evidence items referenced by this role's bullet instructions
    const bulletSources = new Set(
      ((roleAllocation as Record<string, unknown>).bullets_to_write as Array<{ evidence_source?: string }> ?? [])
        .map(b => b.evidence_source).filter(Boolean)
    );
    const roleEvidence = positioning.evidence_library.filter(e => e.id && bulletSources.has(e.id));
    return {
      keyword_targets: keywordTargets,
      role_key: roleKey,
      role_blueprint: roleAllocation,
      role_source: resume.experience.find((_, idx) => `role_${idx}` === roleKey) ?? null,
      evidence_library: roleEvidence.length > 0 ? roleEvidence : positioning.evidence_library.slice(0, 6),
      authentic_phrases: positioning.authentic_phrases.slice(0, 4),
    };
  }

  if (section === 'earlier_career') {
    return {
      earlier_career: blueprint.experience_blueprint.earlier_career,
      original_experience: resume.experience,
    };
  }

  // Fallback for any unknown section
  return {
    keyword_targets: keywordTargets,
    evidence_library: positioning.evidence_library.slice(0, 6),
  };
}

// ─── Resume assembly ─────────────────────────────────────────────────

function assembleResume(
  sections: Record<string, SectionWriterOutput>,
  blueprint: ArchitectOutput,
): string {
  const parts: string[] = [];

  for (const sectionName of blueprint.section_plan.order) {
    if (sectionName === 'experience') {
      // Collect all experience_role_* entries in sorted order
      const roleKeys = Object.keys(sections)
        .filter(k => k.startsWith('experience_role_'))
        .sort();
      for (const key of roleKeys) {
        parts.push(sections[key].content);
      }
      if (sections['earlier_career']) {
        parts.push(sections['earlier_career'].content);
      }
      continue;
    }

    const section = sections[sectionName];
    if (section) {
      parts.push(section.content);
    }
  }

  return parts.join('\n\n');
}

function mapFindingToSection(
  findingSection: string,
  sections: Record<string, SectionWriterOutput>,
): string | null {
  if (sections[findingSection]) return findingSection;
  if (findingSection === 'skills' && sections.skills) return 'skills';
  if (findingSection === 'summary' && sections.summary) return 'summary';
  // Map generic "experience" finding to first experience_role_* section
  if (findingSection === 'experience') {
    const roleKey = Object.keys(sections).filter(k => k.startsWith('experience_role_')).sort()[0];
    if (roleKey) return roleKey;
  }
  if (findingSection === 'formatting') return Object.keys(sections)[0] ?? null;
  return null;
}

function normalizeSkills(intakeSkills: string[]): Record<string, string[]> {
  if (!Array.isArray(intakeSkills) || intakeSkills.length === 0) return {};
  return { Core: intakeSkills.slice(0, 30) };
}

function parseExperienceRoleForStructuredPayload(
  crafted: string | undefined,
  fallback: IntakeOutput['experience'][number],
): {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: Array<{ text: string; source: string }>;
} {
  if (!crafted) {
    return {
      title: fallback.title,
      company: fallback.company,
      start_date: fallback.start_date,
      end_date: fallback.end_date,
      location: '',
      bullets: fallback.bullets.map((b) => ({ text: b, source: 'resume' })),
    };
  }

  const lines = crafted.split('\n').map((l) => l.trim()).filter(Boolean);
  const nonBullets = lines.filter((l) => !/^[•\-*]\s/.test(l));
  const titleLine = nonBullets[0] ?? fallback.title;
  const companyLine = nonBullets[1] ?? '';

  let startDate = fallback.start_date;
  let endDate = fallback.end_date;
  let location = '';

  const titleDate = titleLine.match(/\b(\d{4})\s*[–-]\s*(\d{4}|Present|Current)\b/i);
  if (titleDate) {
    startDate = titleDate[1];
    endDate = titleDate[2];
  }

  if (companyLine) {
    const companyParts = companyLine.split('|').map((p) => p.trim()).filter(Boolean);
    if (companyParts.length > 0) {
      const trailingDate = companyParts[companyParts.length - 1].match(/^(\d{4})\s*[–-]\s*(\d{4}|Present|Current)$/i);
      if (trailingDate) {
        startDate = trailingDate[1];
        endDate = trailingDate[2];
        companyParts.pop();
      }
      if (companyParts.length > 1) {
        location = companyParts[companyParts.length - 1];
      }
    }
  }

  const companyParsed = companyLine
    ? companyLine.split('|').map((p) => p.trim()).filter(Boolean)[0] ?? fallback.company
    : fallback.company;
  const titleParsed = titleLine.replace(/\b\d{4}\s*[–-]\s*(?:\d{4}|Present|Current)\b/i, '').trim() || fallback.title;

  const parsedBullets = lines
    .filter((l) => /^[•\-*]\s/.test(l))
    .map((l) => ({ text: l.replace(/^[•\-*]\s*/, ''), source: 'crafted' }));

  return {
    title: titleParsed,
    company: companyParsed,
    start_date: startDate,
    end_date: endDate,
    location,
    bullets: parsedBullets.length > 0 ? parsedBullets : fallback.bullets.map((b) => ({ text: b, source: 'resume' })),
  };
}

function buildFinalResumePayload(state: PipelineState, config: PipelineConfig): FinalResumePayload {
  const sections = state.sections ?? {};
  const intake = state.intake!;
  const sectionOrder = (state.architect?.section_plan.order ?? ['summary', 'experience', 'skills', 'education', 'certifications'])
    .flatMap((s) => {
      if (s === 'education_and_certifications') return ['education', 'certifications'];
      if (s === 'experience') {
        // Expand into actual experience_role_* keys + earlier_career
        const roleKeys = Object.keys(state.sections ?? {})
          .filter(k => k.startsWith('experience_role_'))
          .sort();
        const keys = roleKeys.length > 0 ? roleKeys : ['experience'];
        if (state.sections?.['earlier_career']) keys.push('earlier_career');
        return keys;
      }
      return [s];
    })
    .filter((s) => s !== 'header');
  const resume: FinalResumePayload = {
    summary: sections.summary?.content ?? intake.summary ?? '',
    selected_accomplishments: sections.selected_accomplishments?.content,
    experience: intake.experience.map((exp, idx) =>
      parseExperienceRoleForStructuredPayload(sections[`experience_role_${idx}`]?.content, exp),
    ),
    skills: normalizeSkills(intake.skills),
    education: intake.education.map((edu) => ({
      institution: edu.institution,
      degree: edu.degree,
      field: '',
      year: edu.year ?? '',
    })),
    certifications: intake.certifications.map((cert) => ({
      name: cert,
      issuer: '',
      year: '',
    })),
    ats_score: state.quality_review?.scores.ats_score ?? 0,
    contact_info: intake.contact,
    section_order: sectionOrder,
    company_name: config.company_name,
    job_title: state.research?.jd_analysis.role_title,
    _raw_sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.content])),
  };

  // Best-effort: parse a skills section output into structured categories when present.
  const skillsText = sections.skills?.content;
  if (skillsText) {
    const parsedSkills: Record<string, string[]> = {};
    for (const line of skillsText.split('\n')) {
      // Strip markdown bold/italic before parsing
      const trimmed = line.trim().replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '');
      const idx = trimmed.indexOf(':');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key || !value) continue;
      parsedSkills[key] = value.split(/[,\u2022]/).map(s => s.trim()).filter(Boolean);
    }
    if (Object.keys(parsedSkills).length > 0) {
      resume.skills = parsedSkills;
    }
  }

  return resume;
}

// ─── Keyword coverage (deterministic, no LLM) ────────────────────────

function computeKeywordCoverage(
  resumeText: string,
  jdKeywords: string[],
): { found: number; total: number; percentage: number; missing: string[] } {
  if (!jdKeywords || jdKeywords.length === 0) {
    return { found: 0, total: 0, percentage: 100, missing: [] };
  }
  const lower = resumeText.toLowerCase();
  const missing: string[] = [];
  let found = 0;
  for (const kw of jdKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      found++;
    } else {
      missing.push(kw);
    }
  }
  const total = jdKeywords.length;
  const percentage = total > 0 ? Math.round((found / total) * 100) : 100;
  return { found, total, percentage, missing };
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

async function persistSession(state: PipelineState, finalResume?: FinalResumePayload): Promise<void> {
  try {
    await supabaseAdmin
      .from('coach_sessions')
      .update({
        status: 'completed',
        input_tokens_used: state.token_usage.input_tokens,
        output_tokens_used: state.token_usage.output_tokens,
        estimated_cost_usd: state.token_usage.estimated_cost_usd,
        positioning_profile_id: state.positioning_profile_id,
        // Persist panel state so SSE restore can provide resume after reconnect
        last_panel_type: 'completion',
        last_panel_data: finalResume ? { resume: finalResume } : undefined,
      })
      .eq('id', state.session_id)
      .eq('user_id', state.user_id);
  } catch (err) {
    // Non-critical — log but don't fail the pipeline
    console.warn('[pipeline] persistSession failed:', err instanceof Error ? err.message : String(err));
  }
}
