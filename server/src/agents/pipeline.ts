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
import { startUsageTracking, stopUsageTracking, setUsageTrackingContext } from '../lib/llm-provider.js';
import { createSessionLogger } from '../lib/logger.js';
import { withRetry } from '../lib/retry.js';
import { runIntakeAgent } from './intake.js';
import { generateQuestions, synthesizeProfile, evaluateFollowUp, MAX_FOLLOW_UPS } from './positioning-coach.js';
import { runResearchAgent } from './research.js';
import { runGapAnalyst, generateGapQuestions, enrichGapAnalysis } from './gap-analyst.js';
import { runArchitect } from './architect.js';
import { runSectionWriter, runSectionRevision } from './section-writer.js';
import { runQualityReviewer } from './quality-reviewer.js';
import { runAtsComplianceCheck, type AtsFinding } from './ats-rules.js';
import { isQuestionnaireEnabled, isFeatureEnabled, type QuestionnaireStage } from '../lib/feature-flags.js';
import { buildQuestionnaireEvent, makeQuestion, getSelectedLabels } from '../lib/questionnaire-helpers.js';
import type {
  PipelineState,
  PipelineStage,
  PipelineSSEEvent,
  IntakeOutput,
  PositioningProfile,
  PositioningQuestion,
  ResearchOutput,
  ArchitectOutput,
  SectionWriterOutput,
  QualityReviewerOutput,
  QuestionnaireQuestion,
  QuestionnaireSubmission,
  CategoryProgress,
} from './types.js';

export type PipelineEmitter = (event: PipelineSSEEvent) => void;

/**
 * User response callback — the pipeline pauses at interactive gates
 * and the orchestrator calls this to wait for user input.
 */
export type WaitForUser = <T>(gate: string) => Promise<T>;

/**
 * Generic questionnaire helper — checks feature flag, emits questionnaire SSE event,
 * waits for user response, and returns the submission (or null if flag is disabled).
 */
async function runQuestionnaire(
  stage: QuestionnaireStage,
  questionnaire_id: string,
  title: string,
  questions: QuestionnaireQuestion[],
  emit: PipelineEmitter,
  waitForUser: WaitForUser,
  subtitle?: string,
): Promise<QuestionnaireSubmission | null> {
  if (!isQuestionnaireEnabled(stage)) return null;
  if (questions.length === 0) return null;

  const event = buildQuestionnaireEvent(questionnaire_id, stage, title, questions, subtitle);
  emit(event);

  const submission = await waitForUser<QuestionnaireSubmission>(`questionnaire_${questionnaire_id}`);
  return submission;
}

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
const SECTION_WRITE_CONCURRENCY = 3;

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

  // Track token usage across all LLM calls made during this pipeline run
  const usageAcc = startUsageTracking(session_id);
  setUsageTrackingContext(session_id);

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

    // ─── Intake Quiz (optional) ─────────────────────────────────
    const intakeQuizQuestions = [
      makeQuestion('goal', "What's your primary goal for this application?", 'single_choice', [
        { id: 'dream_job', label: 'Dream job', description: 'This is THE role I really want' },
        { id: 'exploring', label: 'Exploring options', description: "I'm actively looking and casting a wide net" },
        { id: 'urgent', label: 'Urgent need', description: 'I need a new role quickly' },
        { id: 'leverage', label: 'Building leverage', description: 'I want a strong application for negotiation' },
      ]),
      makeQuestion('priority', 'What matters most in your resume?', 'single_choice', [
        { id: 'authentic', label: 'Sounds like me', description: 'Authentic voice that represents who I am' },
        { id: 'ats', label: 'Beats the ATS', description: 'Maximum keyword coverage and formatting' },
        { id: 'impact', label: 'Shows impact', description: 'Metrics-driven accomplishments front and center' },
        { id: 'balanced', label: 'Balanced approach', description: 'A well-rounded resume that covers all bases' },
      ]),
      makeQuestion('seniority', 'How senior is this role compared to your current level?', 'single_choice', [
        { id: 'same', label: 'Same level', description: 'Lateral move with similar responsibilities' },
        { id: 'one_up', label: 'One step up', description: 'Natural next promotion' },
        { id: 'big_jump', label: 'Big jump', description: 'Significant stretch role' },
        { id: 'step_back', label: 'Step back', description: 'Intentionally moving to a less senior role' },
      ], { allow_skip: true }),
    ];

    const intakeSubmission = await runQuestionnaire(
      'intake_quiz', 'intake_quiz', 'Quick Setup', intakeQuizQuestions, emit, waitForUser,
      "A few quick questions to tailor your resume experience",
    );

    if (intakeSubmission) {
      const goalResp = intakeSubmission.responses.find(r => r.question_id === 'goal');
      const priorityResp = intakeSubmission.responses.find(r => r.question_id === 'priority');
      const seniorityResp = intakeSubmission.responses.find(r => r.question_id === 'seniority');
      state.user_preferences = {
        primary_goal: goalResp?.selected_option_ids[0],
        resume_priority: priorityResp?.selected_option_ids[0],
        seniority_delta: seniorityResp?.skipped ? undefined : seniorityResp?.selected_option_ids[0],
      };
      log.info({ preferences: state.user_preferences }, 'Intake quiz complete');
    }

    if (isFeatureEnabled('positioning_v2')) {
      // ─── v2: Race research with 20s timeout, then positioning with JD-informed questions ───
      emit({ type: 'stage_start', stage: 'research', message: 'Researching company, role, and industry...' });
      state.current_stage = 'research';
      markStageStart('research');

      // Fire off research as a background promise
      const researchPromise = runResearchAgent({
        job_description: config.job_description,
        company_name: config.company_name,
        parsed_resume: state.intake,
      });

      // Race: give research 20s to complete before falling back
      const RESEARCH_RACE_TIMEOUT_MS = 20_000;
      const researchRaceResult = await Promise.race([
        researchPromise.then(r => ({ resolved: true as const, data: r })),
        sleep(RESEARCH_RACE_TIMEOUT_MS).then(() => ({ resolved: false as const, data: null })),
      ]);

      if (researchRaceResult.resolved) {
        state.research = researchRaceResult.data!;
        markStageEnd('research');
        emit({ type: 'stage_complete', stage: 'research', message: 'Research complete', duration_ms: stageTimingsMs.research });
        log.info({ coverage_keywords: state.research.jd_analysis.language_keywords.length }, 'Research complete (within timeout)');
      } else {
        log.info('Research still running after timeout — starting positioning with fallback questions');
        emit({ type: 'transparency', stage: 'research', message: 'Research is still running — starting your interview with general questions...' });
      }

      // Emit research dashboard if research is ready
      if (state.research) {
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
      }

      // ─── Research Validation Quiz (if research is ready) ────────
      if (state.research) {
        const researchQuizQuestions = buildResearchQuizQuestions(state.research);
        const researchSubmission = await runQuestionnaire(
          'research_validation', 'research_validation', 'Validate Research', researchQuizQuestions, emit, waitForUser,
          'Help us fine-tune our research findings',
        );
        if (researchSubmission) {
          processResearchSubmission(state, researchSubmission, researchQuizQuestions, log);
        }
      }

      // ─── Positioning Coach ──────────────────────────────────
      emit({ type: 'stage_start', stage: 'positioning', message: 'Starting positioning interview...' });
      state.current_stage = 'positioning';
      markStageStart('positioning');
      state.positioning = await runPositioningStage(
        state, config, emit, waitForUser, log,
      );
      markStageEnd('positioning');
      emit({
        type: 'stage_complete',
        stage: 'positioning',
        message: state.positioning_reuse_mode === 'reuse'
          ? 'Using saved positioning profile'
          : 'Positioning profile created and saved',
        duration_ms: stageTimingsMs.positioning,
      });

      // ─── Await research if it hasn't finished yet ───────────
      if (!state.research) {
        try {
          state.research = await researchPromise;
        } catch (researchErr) {
          // Research failed after positioning — retry once before giving up.
          log.warn(
            { error: researchErr instanceof Error ? researchErr.message : String(researchErr) },
            'Late research promise rejected — retrying once',
          );
          try {
            state.research = await withRetry(
              () => runResearchAgent({
                job_description: config.job_description,
                company_name: config.company_name,
                parsed_resume: state.intake!,
              }),
              { maxAttempts: 2, baseDelay: 3_000, onRetry: (a, e) => log.warn({ attempt: a, error: e.message }, 'Research retry') },
            );
          } catch (retryErr) {
            log.error(
              { error: retryErr instanceof Error ? retryErr.message : String(retryErr) },
              'Research failed after retry — pipeline cannot continue without research',
            );
            throw retryErr;
          }
        }
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
        log.info({ coverage_keywords: state.research.jd_analysis.language_keywords.length }, 'Research complete (after positioning)');

        // Run research validation quiz now
        const researchQuizQuestions = buildResearchQuizQuestions(state.research);
        const researchSubmission = await runQuestionnaire(
          'research_validation', 'research_validation', 'Validate Research', researchQuizQuestions, emit, waitForUser,
          'Help us fine-tune our research findings',
        );
        if (researchSubmission) {
          processResearchSubmission(state, researchSubmission, researchQuizQuestions, log);
        }
      }
    } else {
      // ─── v1: Positioning first, then research (original order) ───
      emit({ type: 'stage_start', stage: 'positioning', message: 'Starting positioning interview...' });
      state.current_stage = 'positioning';
      markStageStart('positioning');
      state.positioning = await runPositioningStage(
        state, config, emit, waitForUser, log,
      );
      markStageEnd('positioning');
      emit({
        type: 'stage_complete',
        stage: 'positioning',
        message: state.positioning_reuse_mode === 'reuse'
          ? 'Using saved positioning profile'
          : 'Positioning profile created and saved',
        duration_ms: stageTimingsMs.positioning,
      });

      // ─── Research ─────────────────────────────────────
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

      // ─── Research Validation Quiz (optional) ────────────────
      const researchQuizQuestions = buildResearchQuizQuestions(state.research);
      const researchSubmission = await runQuestionnaire(
        'research_validation', 'research_validation', 'Validate Research', researchQuizQuestions, emit, waitForUser,
        'Help us fine-tune our research findings',
      );
      if (researchSubmission) {
        processResearchSubmission(state, researchSubmission, researchQuizQuestions, log);
      }
    }

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
    const gapReqs = state.gap_analysis.requirements;
    const gapStrong = gapReqs.filter(r => r.classification === 'strong').length;
    const gapPartial = gapReqs.filter(r => r.classification === 'partial').length;
    const gapGap = gapReqs.filter(r => r.classification === 'gap').length;
    emit({
      type: 'right_panel_update',
      panel_type: 'gap_analysis',
      data: {
        requirements: gapReqs,
        coverage_score: state.gap_analysis.coverage_score,
        critical_gaps: state.gap_analysis.critical_gaps,
        strength_summary: state.gap_analysis.strength_summary,
        total: gapReqs.length,
        addressed: gapStrong + gapPartial,
        strong_count: gapStrong,
        partial_count: gapPartial,
        gap_count: gapGap,
      },
    });

    log.info({ coverage: state.gap_analysis.coverage_score, gaps: state.gap_analysis.critical_gaps.length }, 'Gap analysis complete');

    // ─── Gap Analysis Quiz (optional) ───────────────────────────
    const gapQuizQuestions = generateGapQuestions(state.gap_analysis);
    const gapSubmission = await runQuestionnaire(
      'gap_analysis_quiz', 'gap_analysis', 'Verify Your Skills', gapQuizQuestions, emit, waitForUser,
      'Help us understand your true proficiency in these areas',
    );

    if (gapSubmission && gapQuizQuestions.length > 0) {
      state.gap_analysis = enrichGapAnalysis(state.gap_analysis, gapSubmission.responses, gapQuizQuestions);
      // Re-emit the updated gap panel
      const enrichedReqs = state.gap_analysis.requirements;
      const enrichedStrong = enrichedReqs.filter(r => r.classification === 'strong').length;
      const enrichedPartial = enrichedReqs.filter(r => r.classification === 'partial').length;
      const enrichedGap = enrichedReqs.filter(r => r.classification === 'gap').length;
      emit({
        type: 'right_panel_update',
        panel_type: 'gap_analysis',
        data: {
          requirements: enrichedReqs,
          coverage_score: state.gap_analysis.coverage_score,
          critical_gaps: state.gap_analysis.critical_gaps,
          strength_summary: state.gap_analysis.strength_summary,
          total: enrichedReqs.length,
          addressed: enrichedStrong + enrichedPartial,
          strong_count: enrichedStrong,
          partial_count: enrichedPartial,
          gap_count: enrichedGap,
        },
      });
      log.info({ enriched_coverage: state.gap_analysis.coverage_score }, 'Gap analysis enriched by user');
    }

    // ─── Stage 5: Resume Architect ───────────────────────────────
    emit({ type: 'stage_start', stage: 'architect', message: 'Designing resume strategy...' });
    state.current_stage = 'architect';
    markStageStart('architect');

    state.architect = await withRetry(
      () => runArchitect({
        parsed_resume: state.intake!,
        positioning: state.positioning!,
        research: state.research!,
        gap_analysis: state.gap_analysis!,
        user_preferences: state.user_preferences,
        research_preferences: state.research_preferences_summary,
      }),
      {
        maxAttempts: 3,
        baseDelay: 1_500,
        onRetry: (attempt, error) => {
          log.warn({ attempt, error: error.message }, 'Architect retry');
        },
      },
    );

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

    // Run section calls with bounded concurrency to reduce provider 429 bursts.
    const runWithSectionLimit = createConcurrencyLimiter(SECTION_WRITE_CONCURRENCY);
    const sectionPromises = new Map<string, Promise<{ ok: true; value: SectionWriterOutput } | { ok: false; error: unknown }>>();
    for (const [index, call] of sectionCalls.entries()) {
      // Catch per-promise immediately to avoid unhandled rejections while user is approving earlier sections.
      sectionPromises.set(
        call.section,
        runWithSectionLimit(async () => {
          // Add slight stagger so calls do not hit the provider at the same millisecond.
          if (index > 0) {
            await sleep(Math.min(index * 120, 900) + Math.floor(Math.random() * 120));
          }
          return withRetry(
          () => runSectionWriter(call),
            {
              maxAttempts: 4,
              baseDelay: 1_250,
              onRetry: (attempt, error) => {
                log.warn({ section: call.section, attempt, error: error.message }, 'Section writer retry');
              },
            },
          );
        })
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
      let result = outcome.value;
      state.sections[call.section] = result;

      // Revision loop: keep presenting section until user approves
      const MAX_REVIEW_ITERATIONS = 5;
      let sectionApproved = false;
      let reviewIterations = 0;
      while (!sectionApproved) {
        reviewIterations++;
        if (reviewIterations > MAX_REVIEW_ITERATIONS) {
          log.warn({ section: call.section, iterations: reviewIterations }, 'Max review iterations exceeded — auto-approving section');
          emit({ type: 'section_approved', section: call.section });
          break;
        }
        // Emit section for progressive rendering / re-review
        emit({ type: 'section_draft', section: call.section, content: result.content });

        // Gate: User approves, quick-fixes, directly edits, or provides feedback
        state.current_stage = 'section_review';
        const reviewResponse = await waitForUser<boolean | { approved: boolean; edited_content?: string; feedback?: string; refinement_ids?: string[] }>(
          `section_review_${call.section}`,
        );
        const normalizedReview = normalizeSectionReviewResponse(reviewResponse);

        if (normalizedReview.approved) {
          emit({ type: 'section_approved', section: call.section });
          sectionApproved = true;
        } else if (normalizedReview.edited_content) {
          // User directly edited — use their content without LLM rewrite
          result = { ...result, content: normalizedReview.edited_content };
          state.sections[call.section] = result;
          emit({ type: 'section_approved', section: call.section });
          sectionApproved = true;
          log.info({ section: call.section }, 'Section directly edited by user');
        } else if (normalizedReview.feedback) {
          // Quick Fix: re-run section writer with user feedback as revision instruction
          const feedback = normalizedReview.feedback;
          const refinementIds = normalizedReview.refinement_ids;
          const instruction = refinementIds?.length
            ? `Apply these fixes: ${refinementIds.join(', ')}. User feedback: ${feedback}`
            : feedback;

          const blueprintSlice = getSectionBlueprint(call.section, state.architect!);
          const revised = await withRetry(
            () => runSectionRevision(call.section, result.content, instruction, blueprintSlice, state.architect!.global_rules),
            { maxAttempts: 3, baseDelay: 1_000, onRetry: (a, e) => { log.warn({ section: call.section, attempt: a, error: e.message }, 'Section revision retry'); } },
          );
          result = revised;
          state.sections[call.section] = revised;
          emit({ type: 'section_revised', section: call.section, content: revised.content });
          log.info({ section: call.section }, 'Section revised via Quick Fix feedback');
          // Loop continues — re-present revised section for re-review
        } else {
          // Keep the review gate active until we receive an actionable response.
          emit({
            type: 'transparency',
            stage: 'section_review',
            message: 'Please approve, use Quick Fix, or edit the section directly.',
          });
          log.warn({ section: call.section, reviewResponse }, 'Non-actionable section review response');
        }
      }
    }

    markStageEnd('section_writing');
    emit({ type: 'stage_complete', stage: 'section_writing', message: 'All sections written', duration_ms: stageTimingsMs.section_writing });

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

    state.quality_review = await withRetry(
      () => runQualityReviewer({
        assembled_resume: {
          sections: Object.fromEntries(
            Object.entries(state.sections ?? {}).map(([k, v]) => [k, v.content])
          ),
          full_text: fullText,
        },
        architect_blueprint: state.architect!,
        jd_analysis: state.research!.jd_analysis,
        evidence_library: state.positioning!.evidence_library,
      }),
      {
        maxAttempts: 3,
        baseDelay: 1_500,
        onRetry: (attempt, error) => {
          log.warn({ attempt, error: error.message }, 'Quality reviewer retry');
        },
      },
    );

    // Use a single source of truth for keyword coverage in UI surfaces.
    // The deterministic counter above should match the quality dashboard value.
    state.quality_review.scores.requirement_coverage = keywordCoverage.percentage;

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

      const allInstructions = state.quality_review.revision_instructions.slice(0, 4);
      const highPriority = allInstructions.filter(i => i.priority === 'high');
      const autoApply = allInstructions.filter(i => i.priority !== 'high');

      // Auto-apply low/medium priority fixes without asking
      for (const instruction of autoApply) {
        const section = instruction.target_section;
        const original = state.sections[section];
        if (!original) continue;

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        const revised = await withRetry(
          () => runSectionRevision(section, original.content, instruction.instruction, blueprintSlice, state.architect!.global_rules),
          { maxAttempts: 3, baseDelay: 1_000, onRetry: (attempt, error) => { log.warn({ section, attempt, error: error.message }, 'Section revision retry'); } },
        );
        state.sections[section] = revised;
        emit({ type: 'section_revised', section, content: revised.content });
      }

      // High-priority fixes: present to user for approval (if feature flag enabled)
      let approvedFixIds: Set<string> = new Set(highPriority.map((_, i) => `fix_${i}`)); // default: apply all
      const customModifications = new Map<string, string>();
      if (highPriority.length > 0) {
        const fixQuestions = highPriority.map((inst, i) =>
          makeQuestion(`fix_${i}`, `${inst.target_section}: ${inst.issue}`, 'single_choice', [
            { id: 'apply', label: 'Apply this fix' },
            { id: 'skip', label: 'Skip this one' },
            { id: 'modify', label: 'Apply with changes' },
          ], { allow_custom: true, context: inst.instruction }),
        );

        const fixSubmission = await runQuestionnaire(
          'quality_review_approval', 'quality_fixes', 'Review Suggested Fixes', fixQuestions, emit, waitForUser,
          `${highPriority.length} important fix${highPriority.length > 1 ? 'es' : ''} need your approval`,
        );

        if (fixSubmission) {
          approvedFixIds = new Set<string>();
          for (const resp of fixSubmission.responses) {
            const selected = resp.selected_option_ids[0];
            if (selected === 'apply' || selected === 'modify') {
              approvedFixIds.add(resp.question_id);
              if (selected === 'modify' && resp.custom_text?.trim()) {
                customModifications.set(resp.question_id, resp.custom_text.trim());
              }
            }
          }
        }
      }

      // Apply approved high-priority fixes
      for (let i = 0; i < highPriority.length; i++) {
        if (!approvedFixIds.has(`fix_${i}`)) continue;

        const instruction = highPriority[i];
        const section = instruction.target_section;
        const original = state.sections[section];
        if (!original) continue;

        // Append user's custom modification text when "Apply with changes" was selected
        const customText = customModifications.get(`fix_${i}`);
        const revisionInstruction = customText
          ? `${instruction.instruction}\n\nUSER MODIFICATION: ${customText}`
          : instruction.instruction;

        const blueprintSlice = getSectionBlueprint(section, state.architect);
        const revised = await withRetry(
          () => runSectionRevision(section, original.content, revisionInstruction, blueprintSlice, state.architect!.global_rules),
          { maxAttempts: 3, baseDelay: 1_000, onRetry: (attempt, error) => { log.warn({ section, attempt, error: error.message }, 'Section revision retry'); } },
        );
        state.sections[section] = revised;
        emit({ type: 'section_revised', section, content: revised.content });
      }

      log.info({ revisions: allInstructions.length, approved: approvedFixIds.size }, 'Revision cycle complete');
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
        const revised = await withRetry(
          () => runSectionRevision(
            section,
            original.content,
            `${finding.issue}. ${finding.instruction}`,
            blueprintSlice,
            state.architect!.global_rules,
          ),
          {
            maxAttempts: 3,
            baseDelay: 1_000,
            onRetry: (attempt, error) => {
              log.warn({ section, attempt, error: error.message }, 'ATS revision retry');
            },
          },
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

    // Collect accumulated token usage from all LLM calls
    state.token_usage.input_tokens = usageAcc.input_tokens;
    state.token_usage.output_tokens = usageAcc.output_tokens;
    // Estimate cost using MODEL_PRICING — use average across all model tiers
    const pricingEntries = Object.values(MODEL_PRICING);
    const avgInput = pricingEntries.reduce((s, p) => s + p.input, 0) / (pricingEntries.length || 1);
    const avgOutput = pricingEntries.reduce((s, p) => s + p.output, 0) / (pricingEntries.length || 1);
    state.token_usage.estimated_cost_usd = Number(
      ((usageAcc.input_tokens / 1_000_000) * avgInput +
       (usageAcc.output_tokens / 1_000_000) * avgOutput).toFixed(4),
    );
    stopUsageTracking(session_id);

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
    stopUsageTracking(session_id);
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
    .select('id, positioning_data, updated_at, version')
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
      log.info('Reusing existing positioning profile');
      return existingProfile.positioning_data as PositioningProfile;
    }
    // For 'update' and 'fresh', proceed with the interview
  }

  // Generate JD-informed questions (async, LLM-powered when research is available)
  const questions = await generateQuestions(state.intake!, state.research ?? undefined, state.user_preferences);
  const answers: Array<{ question_id: string; answer: string; selected_suggestion?: string }> = [];

  // Build category progress tracking
  const categoryLabels: Record<string, string> = {
    scale_and_scope: 'Scale & Scope',
    requirement_mapped: 'Requirements',
    career_narrative: 'Career Story',
    hidden_accomplishments: 'Hidden Wins',
    currency_and_adaptability: 'Adaptability',
  };
  const buildCategoryProgress = (answeredIds: Set<string>): CategoryProgress[] => {
    const cats = new Map<string, { total: number; answered: number }>();
    for (const q of questions) {
      const cat = q.category ?? 'career_narrative';
      if (!cats.has(cat)) cats.set(cat, { total: 0, answered: 0 });
      const c = cats.get(cat)!;
      c.total++;
      if (answeredIds.has(q.id)) c.answered++;
    }
    return Array.from(cats.entries()).map(([cat, c]) => ({
      category: cat as CategoryProgress['category'],
      label: categoryLabels[cat] ?? cat,
      answered: c.answered,
      total: c.total,
    }));
  };

  const answeredIds = new Set<string>();
  let previousEncouragingText: string | undefined;
  let followUpCount = 0;

  for (const question of questions) {
    const catProgress = buildCategoryProgress(answeredIds);
    emit({
      type: 'positioning_question',
      question: {
        ...question,
        encouraging_text: previousEncouragingText,
      },
      questions_total: questions.length,
      category_progress: catProgress,
    });

    const response = await waitForUser<{ answer: string; selected_suggestion?: string }>(
      `positioning_q_${question.id}`,
    );

    answers.push({
      question_id: question.id,
      answer: response.answer,
      selected_suggestion: response.selected_suggestion,
    });
    answeredIds.add(question.id);
    previousEncouragingText = question.encouraging_text;

    // Evaluate follow-up triggers (max 1 follow-up per question, capped globally)
    if (followUpCount < MAX_FOLLOW_UPS) {
      const followUp = evaluateFollowUp(question, response.answer);
      if (followUp) {
        followUpCount++;
        const followUpQuestion: PositioningQuestion = {
          ...followUp,
          question_number: question.question_number,
          is_follow_up: true,
          parent_question_id: question.id,
        };

        emit({
          type: 'positioning_question',
          question: followUpQuestion,
          questions_total: questions.length,
          category_progress: buildCategoryProgress(answeredIds),
        });

        const followUpResponse = await waitForUser<{ answer: string; selected_suggestion?: string }>(
          `positioning_q_${followUpQuestion.id}`,
        );

        answers.push({
          question_id: followUpQuestion.id,
          answer: followUpResponse.answer,
          selected_suggestion: followUpResponse.selected_suggestion,
        });
      }
    }
  }

  // Synthesize the profile (research-aware when available)
  emit({ type: 'transparency', message: 'Synthesizing your positioning profile...', stage: 'positioning' });
  const profile = await synthesizeProfile(state.intake!, answers, state.research ?? undefined);

  // Save to database
  const currentVersion = Number.isFinite((existingProfile as { version?: unknown } | null)?.version as number)
    ? Number((existingProfile as { version?: number }).version)
    : 0;
  const { data: saved } = await supabaseAdmin
    .from('user_positioning_profiles')
    .upsert({
      user_id: config.user_id,
      positioning_data: profile,
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (saved) {
    state.positioning_profile_id = saved.id;
  }
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
      // Earlier career as a separate section if included — but skip if ALL original
      // resume roles are already individually expanded (prevents duplicate entries).
      if (blueprint.experience_blueprint.earlier_career?.include && roleCount < resume.experience.length) {
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
        .sort(compareExperienceRoleKeys);
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
    const roleKey = Object.keys(sections).filter(k => k.startsWith('experience_role_')).sort(compareExperienceRoleKeys)[0];
    if (roleKey) return roleKey;
  }
  if (findingSection === 'formatting') return Object.keys(sections)[0] ?? null;
  return null;
}

function normalizeSectionReviewResponse(
  response: boolean | { approved: boolean; edited_content?: string; feedback?: string; refinement_ids?: string[] },
): { approved: boolean; edited_content?: string; feedback?: string; refinement_ids?: string[] } {
  if (typeof response === 'boolean') {
    // Legacy false path: treat as a request for a generic improvement instead of auto-approving.
    return response
      ? { approved: true }
      : {
          approved: false,
          feedback: 'Improve this section for clarity, impact, and ATS alignment while preserving factual accuracy.',
        };
  }

  const editedContent = response.edited_content?.trim();
  const feedback = response.feedback?.trim();
  return {
    approved: Boolean(response.approved),
    edited_content: editedContent ? editedContent : undefined,
    feedback: feedback ? feedback : undefined,
    refinement_ids: response.refinement_ids?.filter(Boolean),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createConcurrencyLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  };

  return async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * Strip leading section title lines that the LLM includes in raw section text.
 * Prevents "PROFESSIONAL SUMMARY" heading duplicating the structured heading.
 */
function stripLeadingSectionTitle(content: string): string {
  const lines = content.split('\n');
  // Remove leading blank lines
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  if (lines.length === 0) return '';
  const first = lines[0].trim();
  // ALL CAPS heading (e.g. "SELECTED ACCOMPLISHMENTS", "PROFESSIONAL SUMMARY")
  if (/^[A-Z][A-Z &/]+$/.test(first) && first.length > 2) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }
  // Title-case variant (e.g. "Professional Summary", "Selected Accomplishments", "Experience")
  else if (/^(Professional Summary|Selected Accomplishments|Core Competencies|Skills|Education|Certifications|Experience|Professional Experience|Earlier Career)$/i.test(first)) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }
  return lines.join('\n').trim();
}

function normalizeSkills(intakeSkills: string[]): Record<string, string[]> {
  if (!Array.isArray(intakeSkills) || intakeSkills.length === 0) return {};
  return { '': intakeSkills.slice(0, 30) };
}

function compareExperienceRoleKeys(a: string, b: string): number {
  const ai = Number.parseInt(a.replace('experience_role_', ''), 10);
  const bi = Number.parseInt(b.replace('experience_role_', ''), 10);
  if (Number.isNaN(ai) || Number.isNaN(bi)) return a.localeCompare(b);
  return ai - bi;
}

function sanitizeEducationYear(
  rawYear: string | undefined,
  ageProtection: ArchitectOutput['age_protection'] | undefined,
): string {
  const yearText = (rawYear ?? '').trim();
  if (!yearText) return '';
  if (!ageProtection || ageProtection.clean) return yearText;

  const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return yearText;
  const yearToken = yearMatch[0];

  const flaggedYears = new Set<string>();
  for (const flag of ageProtection.flags ?? []) {
    const matches = `${flag.item} ${flag.risk} ${flag.action}`.match(/\b(19|20)\d{2}\b/g) ?? [];
    for (const y of matches) flaggedYears.add(y);
  }

  if (flaggedYears.has(yearToken)) return '';

  // Guardrail from architect rules: hide graduation years 20+ years old.
  const numericYear = Number.parseInt(yearToken, 10);
  if (!Number.isNaN(numericYear) && new Date().getFullYear() - numericYear >= 20) {
    return '';
  }

  return yearText;
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

  // Strip markdown bold/italic from LLM output
  const stripMd = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '');
  const lines = crafted.split('\n').map((l) => stripMd(l.trim())).filter(Boolean);

  // Separate bullet lines from header/body lines
  const bulletLines = lines.filter((l) => /^[•\-*]\s/.test(l));
  const nonBullets = lines.filter((l) => !/^[•\-*]\s/.test(l));

  // Skip section title lines (ALL CAPS like "PROFESSIONAL EXPERIENCE" or mixed-case like "Experience")
  const headerLines = nonBullets.filter((l) => {
    if (/^[A-Z][A-Z &/]+$/.test(l) && l.length > 2) return false;
    if (/^(Experience|Professional Experience|Earlier Career)$/i.test(l)) return false;
    return true;
  });

  let startDate = fallback.start_date;
  let endDate = fallback.end_date;
  let location = '';

  // Find the date line — could be standalone (e.g. "2020 – Present") or embedded
  const dateLine = headerLines.find((l) => /^\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current)$/i.test(l));
  if (dateLine) {
    const dateMatch = dateLine.match(/^(\d{4})\s*[–\-]\s*(\d{4}|Present|Current)$/i);
    if (dateMatch) {
      startDate = dateMatch[1];
      endDate = dateMatch[2];
    }
  }

  // Header lines excluding standalone date lines
  const contentHeaders = headerLines.filter((l) => !/^\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current)$/i.test(l));
  const titleLine = contentHeaders[0] ?? fallback.title;
  const companyLine = contentHeaders[1] ?? '';

  // Extract date from title line if embedded (e.g. "VP Engineering | Company | 2020 – Present")
  const titleDate = titleLine.match(/\b(\d{4})\s*[–\-]\s*(\d{4}|Present|Current)\b/i);
  if (titleDate && startDate === fallback.start_date) {
    startDate = titleDate[1];
    endDate = titleDate[2];
  }

  // Parse company line for location and trailing dates
  if (companyLine) {
    const companyParts = companyLine.split('|').map((p) => p.trim()).filter(Boolean);
    if (companyParts.length > 0) {
      const trailingDate = companyParts[companyParts.length - 1].match(/^(\d{4})\s*[–\-]\s*(\d{4}|Present|Current)$/i);
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
  const titleParsed = titleLine
    .replace(/\b\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current)\b/i, '')
    .replace(/\|/g, '')
    .trim() || fallback.title;

  // Parse bullets — LLM may use bullet markers or plain paragraph text
  let parsedBullets = bulletLines
    .map((l) => ({ text: l.replace(/^[•\-*]\s*/, ''), source: 'crafted' }));

  // If no bullet-marked lines, treat remaining content headers (after title/company/date) as bullets
  if (parsedBullets.length === 0) {
    const bodyLines = contentHeaders.slice(2).filter((l) => l.length > 20); // skip short lines
    if (bodyLines.length > 0) {
      parsedBullets = bodyLines.map((l) => ({ text: l, source: 'crafted' }));
    }
  }

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
          .sort(compareExperienceRoleKeys);
        const keys = roleKeys.length > 0 ? roleKeys : ['experience'];
        if (state.sections?.['earlier_career']) keys.push('earlier_career');
        return keys;
      }
      return [s];
    })
    .filter((s) => s !== 'header');
  const resume: FinalResumePayload = {
    summary: stripLeadingSectionTitle(sections.summary?.content ?? intake.summary ?? ''),
    selected_accomplishments: sections.selected_accomplishments?.content
      ? stripLeadingSectionTitle(sections.selected_accomplishments.content)
      : undefined,
    experience: intake.experience.map((exp, idx) =>
      parseExperienceRoleForStructuredPayload(sections[`experience_role_${idx}`]?.content, exp),
    ),
    skills: normalizeSkills(intake.skills),
    education: intake.education.map((edu) => ({
      institution: edu.institution,
      degree: edu.degree,
      field: '',
      year: sanitizeEducationYear(edu.year, state.architect?.age_protection),
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
    _raw_sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, stripLeadingSectionTitle(v.content)])),
  };

  // Best-effort: parse a skills section output into structured categories when present.
  const skillsText = sections.skills?.content;
  if (skillsText) {
    const parsedSkills: Record<string, string[]> = {};
    for (const line of skillsText.split('\n')) {
      // Strip markdown bold/italic and leading list markers before parsing
      const trimmed = line.trim()
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/^[-•*]\s*/, '');  // Handle "- Category: skills" and "• Category: skills"
      const idx = trimmed.indexOf(':');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key || !value) continue;
      parsedSkills[key] = value.split(/[,|;\u2022]/).map(s => s.trim()).filter(Boolean);
    }
    if (Object.keys(parsedSkills).length > 0) {
      resume.skills = parsedSkills;
    } else {
      console.warn('[pipeline] Skills section could not be parsed into categories — falling back to intake skills');
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

// ─── Research quiz helpers (extracted to avoid duplication in v1/v2 paths) ────

function buildResearchQuizQuestions(research: ResearchOutput): QuestionnaireQuestion[] {
  return [
    makeQuestion('top_requirements', 'Which requirements matter most for this role?', 'multi_choice',
      research.jd_analysis.must_haves.slice(0, 6).map((req, i) => ({
        id: `req_${i}`,
        label: req,
        source: 'jd' as const,
      })),
      { context: 'Select up to 3 that you think the hiring manager cares about most' },
    ),
    makeQuestion('culture_check', 'Does this company culture description sound right?', 'single_choice', [
      { id: 'yes', label: 'Yes, spot on' },
      { id: 'somewhat', label: 'Somewhat accurate' },
      { id: 'not_quite', label: 'Not quite right' },
    ], { allow_custom: true, context: `We found: ${research.company_research.culture_signals.slice(0, 3).join(', ')}` }),
    makeQuestion('anything_else', 'Anything else we should know about this role?', 'single_choice', [
      { id: 'nope', label: 'No, looks good' },
    ], { allow_custom: true, allow_skip: true, context: 'Insider knowledge, team dynamics, or role nuances' }),
  ];
}

function processResearchSubmission(
  state: PipelineState,
  submission: QuestionnaireSubmission,
  quizQuestions: QuestionnaireQuestion[],
  log: ReturnType<typeof createSessionLogger>,
): void {
  state.research_preferences = submission;
  const topReqResponse = submission.responses.find((r) => r.question_id === 'top_requirements');
  const cultureResponse = submission.responses.find((r) => r.question_id === 'culture_check');
  const notesResponse = submission.responses.find((r) => r.question_id === 'anything_else');

  state.research_preferences_summary = {
    top_requirements: topReqResponse
      ? getSelectedLabels(topReqResponse, quizQuestions[0]).slice(0, 3)
      : [],
    culture_alignment: (cultureResponse?.selected_option_ids[0] as 'yes' | 'somewhat' | 'not_quite' | undefined),
    culture_notes: cultureResponse?.custom_text?.trim() || undefined,
    additional_notes: notesResponse?.custom_text?.trim() || undefined,
  };
  log.info('Research validation quiz complete');
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
