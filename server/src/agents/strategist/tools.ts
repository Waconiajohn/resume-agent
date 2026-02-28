/**
 * Strategist Agent — Tool Definitions
 *
 * Each tool wraps an existing pipeline agent function, adapting it to the
 * AgentTool interface. Tools read from and write to ctx.getState() /
 * ctx.scratchpad so the coordinator can inspect accumulated results.
 */

import { runIntakeAgent } from '../intake.js';
import { runResearchAgent } from '../research.js';
import { runGapAnalyst } from '../gap-analyst.js';
import { runArchitect } from '../architect.js';
import type { AgentTool, AgentContext } from '../runtime/agent-protocol.js';
import type {
  IntakeInput,
  ResearchInput,
  GapAnalystInput,
  ArchitectInput,
  PositioningProfile,
  PositioningQuestion,
  EvidenceItem,
} from '../types.js';
import { randomUUID } from 'node:crypto';
import { positioningToQuestionnaire, extractInterviewAnswers, buildQuestionnaireEvent } from '../../lib/questionnaire-helpers.js';
import { evaluateFollowUp } from '../positioning-coach.js';

// ─── Tool: parse_resume ───────────────────────────────────────────────

const parseResumeTool: AgentTool = {
  name: 'parse_resume',
  description: 'Parse the candidate\'s raw resume text into structured data (contact info, experience entries, skills, education, certifications). Call this first before any other tool. Reads raw_resume_text from pipeline state.',
  input_schema: {
    type: 'object',
    properties: {
      raw_resume_text: {
        type: 'string',
        description: 'The raw resume text to parse. If not provided, reads from pipeline state.',
      },
    },
    required: [],
  },
  model_tier: 'light',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const state = ctx.getState();

    // Prefer explicit input, fall back to pipeline state
    const rawText = (typeof input.raw_resume_text === 'string' && input.raw_resume_text.trim())
      ? input.raw_resume_text
      : (state.intake?.raw_text ?? '');

    if (!rawText.trim()) {
      throw new Error('parse_resume: No resume text available. Provide raw_resume_text or ensure pipeline state has intake.raw_text.');
    }

    const intakeInput: IntakeInput = { raw_resume_text: rawText };
    const result = await runIntakeAgent(intakeInput);

    // Persist to pipeline state and scratchpad
    ctx.updateState({ intake: result });
    ctx.scratchpad.intake = result;

    return {
      success: true,
      contact: result.contact,
      experience_count: result.experience.length,
      skills_count: result.skills.length,
      career_span_years: result.career_span_years,
      summary: result.summary ? result.summary.slice(0, 200) + (result.summary.length > 200 ? '...' : '') : '',
    };
  },
};

// ─── Tool: analyze_jd ────────────────────────────────────────────────

const analyzeJdTool: AgentTool = {
  name: 'analyze_jd',
  description: 'Analyze the job description to extract must-haves, nice-to-haves, implicit requirements, seniority level, and language keywords. Reads job_description and company_name from pipeline state.',
  input_schema: {
    type: 'object',
    properties: {
      job_description: {
        type: 'string',
        description: 'The full job description text. If not provided, reads from pipeline state.',
      },
      company_name: {
        type: 'string',
        description: 'The target company name. If not provided, reads from pipeline state.',
      },
    },
    required: [],
  },
  model_tier: 'light',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const state = ctx.getState();
    const intake = (ctx.scratchpad.intake ?? state.intake) as IntakeInput | undefined;

    const jobDescription = (typeof input.job_description === 'string' && input.job_description.trim())
      ? input.job_description
      : '';

    const companyName = (typeof input.company_name === 'string' && input.company_name.trim())
      ? input.company_name
      : '';

    if (!jobDescription) {
      throw new Error('analyze_jd: job_description is required. The job description was not found in pipeline state or input.');
    }

    if (!intake) {
      throw new Error('analyze_jd: parse_resume must be called before analyze_jd.');
    }

    // We need a parsed resume for the research agent — use what we have or a minimal placeholder
    const parsedResume = (ctx.scratchpad.intake ?? state.intake) as NonNullable<typeof state.intake>;

    const researchInput: ResearchInput = {
      job_description: jobDescription,
      company_name: companyName,
      parsed_resume: parsedResume,
    };

    // Run only JD analysis by calling the full agent (it caches internally)
    // The research agent runs JD + company + benchmark in parallel; we capture just jd_analysis here
    // and store everything so research_company / build_benchmark can reuse the cached result
    const result = await runResearchAgent(researchInput);

    // Store full research output so subsequent tools can reuse it
    ctx.updateState({ research: result });
    ctx.scratchpad.research = result;

    return {
      success: true,
      role_title: result.jd_analysis.role_title,
      company: result.jd_analysis.company,
      seniority_level: result.jd_analysis.seniority_level,
      must_haves_count: result.jd_analysis.must_haves.length,
      nice_to_haves_count: result.jd_analysis.nice_to_haves.length,
      implicit_requirements_count: result.jd_analysis.implicit_requirements.length,
      language_keywords: result.jd_analysis.language_keywords.slice(0, 15),
      must_haves: result.jd_analysis.must_haves,
      nice_to_haves: result.jd_analysis.nice_to_haves,
      implicit_requirements: result.jd_analysis.implicit_requirements,
    };
  },
};

// ─── Tool: research_company ───────────────────────────────────────────

const researchCompanyTool: AgentTool = {
  name: 'research_company',
  description: 'Research the target company: industry, size, culture signals, values, and communication style. If analyze_jd was already called, this returns cached results. Otherwise calls the research agent.',
  input_schema: {
    type: 'object',
    properties: {
      company_name: {
        type: 'string',
        description: 'The company name to research.',
      },
      job_description: {
        type: 'string',
        description: 'The job description (used for context). If not provided, uses cached data.',
      },
    },
    required: [],
  },
  model_tier: 'light',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const state = ctx.getState();

    // If research was already done by analyze_jd, return company_research from cache
    const cachedResearch = (ctx.scratchpad.research ?? state.research) as typeof state.research | undefined;
    if (cachedResearch?.company_research) {
      return {
        success: true,
        source: 'cached',
        company_name: cachedResearch.company_research.company_name,
        industry: cachedResearch.company_research.industry,
        size: cachedResearch.company_research.size,
        culture_signals: cachedResearch.company_research.culture_signals,
      };
    }

    const companyName = (typeof input.company_name === 'string' && input.company_name.trim())
      ? input.company_name
      : '';

    const jobDescription = (typeof input.job_description === 'string' && input.job_description.trim())
      ? input.job_description
      : '';

    if (!companyName) {
      throw new Error('research_company: company_name is required when no cached research is available.');
    }

    const parsedResume = (ctx.scratchpad.intake ?? state.intake) as NonNullable<typeof state.intake>;
    if (!parsedResume) {
      throw new Error('research_company: parse_resume must be called before research_company.');
    }

    const researchInput: ResearchInput = {
      job_description: jobDescription,
      company_name: companyName,
      parsed_resume: parsedResume,
    };

    const result = await runResearchAgent(researchInput);
    ctx.updateState({ research: result });
    ctx.scratchpad.research = result;

    return {
      success: true,
      source: 'fresh',
      company_name: result.company_research.company_name,
      industry: result.company_research.industry,
      size: result.company_research.size,
      culture_signals: result.company_research.culture_signals,
    };
  },
};

// ─── Tool: build_benchmark ────────────────────────────────────────────

const buildBenchmarkTool: AgentTool = {
  name: 'build_benchmark',
  description: 'Synthesize the ideal benchmark candidate profile from JD analysis and company research. Returns ideal_profile description, language_keywords to use, and section_expectations. Requires analyze_jd to have been called first.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  model_tier: 'mid',
  execute: async (_input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const state = ctx.getState();
    const cachedResearch = (ctx.scratchpad.research ?? state.research) as typeof state.research | undefined;

    if (!cachedResearch) {
      throw new Error('build_benchmark: analyze_jd must be called first to populate research data.');
    }

    // Benchmark is already computed as part of runResearchAgent — return it from cache
    return {
      success: true,
      ideal_profile: cachedResearch.benchmark_candidate.ideal_profile,
      language_keywords: cachedResearch.benchmark_candidate.language_keywords,
      section_expectations: cachedResearch.benchmark_candidate.section_expectations,
    };
  },
};

// ─── Interview Budget ────────────────────────────────────────────────

const INTERVIEW_BUDGET: Record<string, number> = {
  fast_draft: 5,
  balanced: 7,
  deep_dive: 12,
};

function getInterviewBudget(ctx: AgentContext): number {
  const mode = ctx.getState().user_preferences?.workflow_mode ?? 'balanced';
  return INTERVIEW_BUDGET[mode] ?? 7;
}

function getInterviewQuestionCount(ctx: AgentContext): number {
  return ((ctx.scratchpad.interview_answers as unknown[] | undefined) ?? []).length;
}

// ─── Tool: interview_candidate ────────────────────────────────────────

const interviewCandidateTool: AgentTool = {
  name: 'interview_candidate',
  description: 'Ask the candidate a targeted question to surface hidden experience, metrics, or context not visible on the resume. Use this to probe partial matches and critical gaps. The question is presented in the UI and the candidate\'s answer is returned. Answers are accumulated in the evidence library. Respects the interview question budget — returns a budget_reached signal when the limit is hit.',
  input_schema: {
    type: 'object',
    properties: {
      question_text: {
        type: 'string',
        description: 'The specific question to ask. Be targeted — reference the specific requirement, gap, or experience context. Open-ended questions work best.',
      },
      context: {
        type: 'string',
        description: 'Why you are asking this question. Shown to the candidate as context (e.g., "The role requires P&L ownership — your resume shows cost management but not full ownership").',
      },
      category: {
        type: 'string',
        enum: ['scale_and_scope', 'requirement_mapped', 'career_narrative', 'hidden_accomplishments', 'currency_and_adaptability'],
        description: 'Category of question. scale_and_scope: team/budget/geo scope. requirement_mapped: directly tied to a JD gap. career_narrative: arc and trajectory. hidden_accomplishments: wins not on resume. currency_and_adaptability: modern skills and adaptation.',
      },
      suggestions: {
        type: 'array',
        description: 'Optional pre-built suggestions to show the candidate as starting points. Each has a label and description.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short option label' },
            description: { type: 'string', description: 'Longer description of this suggestion' },
            source: {
              type: 'string',
              enum: ['resume', 'inferred', 'jd'],
              description: 'Where this suggestion comes from: resume (already shown), inferred (reasonable to assume), jd (implied by role requirements)',
            },
          },
          required: ['label', 'description', 'source'],
        },
      },
    },
    required: ['question_text', 'context', 'category'],
  },
  model_tier: 'orchestrator',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const questionText = String(input.question_text ?? '');
    const context = String(input.context ?? '');
    const category = String(input.category ?? 'requirement_mapped');

    // ── Budget enforcement ──────────────────────────────────────────
    const budget = getInterviewBudget(ctx);
    const asked = getInterviewQuestionCount(ctx);
    if (asked >= budget) {
      const mode = ctx.getState().user_preferences?.workflow_mode ?? 'balanced';
      ctx.emit({
        type: 'transparency',
        message: `Interview budget reached (${asked}/${budget} questions for ${mode} mode). Moving to gap analysis.`,
        stage: ctx.getState().current_stage,
      });
      return {
        budget_reached: true,
        questions_asked: asked,
        budget,
        message: `Interview budget reached (${budget} questions for ${mode} mode). You have sufficient evidence — proceed to classify_fit now.`,
      };
    }

    if (!questionText.trim()) {
      throw new Error('interview_candidate: question_text is required.');
    }

    // Build the question number from existing answers
    const existingAnswers = (ctx.scratchpad.interview_answers as Record<string, unknown>[] | undefined) ?? [];
    const questionNumber = existingAnswers.length + 1;

    // Build suggestions array
    const rawSuggestions = Array.isArray(input.suggestions) ? input.suggestions as Record<string, unknown>[] : [];
    const suggestions = rawSuggestions
      .filter(s => typeof s.label === 'string' && s.label.trim())
      .map(s => ({
        label: String(s.label ?? ''),
        description: String(s.description ?? ''),
        source: (s.source as 'resume' | 'inferred' | 'jd') ?? 'inferred',
      }));

    const question: PositioningQuestion = {
      id: randomUUID(),
      question_number: questionNumber,
      question_text: questionText,
      context,
      input_type: suggestions.length > 0 ? 'hybrid' : 'text',
      category: category as PositioningQuestion['category'],
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };

    // Emit the question via SSE so the frontend renders it
    ctx.emit({
      type: 'positioning_question',
      question,
      questions_total: questionNumber, // Will be updated as more questions come in
    });

    // Wait for the candidate's response
    const answer = await ctx.waitForUser<string>(`positioning_q_${question.id}`);

    // Accumulate the answer in scratchpad
    const answerRecord = {
      question_id: question.id,
      question_text: questionText,
      category,
      answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
      timestamp: new Date().toISOString(),
    };

    if (!ctx.scratchpad.interview_answers) {
      ctx.scratchpad.interview_answers = [];
    }
    (ctx.scratchpad.interview_answers as typeof answerRecord[]).push(answerRecord);

    // Persist raw Q&A to pipeline state so the Craftsman can hear the candidate's voice
    const transcript = ctx.getState().interview_transcript ?? [];
    transcript.push({
      question_id: question.id,
      question_text: questionText,
      category,
      answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
    });
    ctx.updateState({ interview_transcript: transcript });

    // Also build a minimal evidence item from the answer so classify_fit can use it
    const evidenceItem: EvidenceItem = {
      id: `ev_interview_${questionNumber}`,
      situation: `In response to: ${questionText}`,
      action: typeof answer === 'string' ? answer : JSON.stringify(answer),
      result: '(to be extracted from context)',
      metrics_defensible: false,
      user_validated: true,
      source_question_id: question.id,
    };

    if (!ctx.scratchpad.evidence_library) {
      ctx.scratchpad.evidence_library = [];
    }
    (ctx.scratchpad.evidence_library as EvidenceItem[]).push(evidenceItem);

    return {
      success: true,
      question_id: question.id,
      question_number: questionNumber,
      answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
      evidence_id: evidenceItem.id,
    };
  },
};

// ─── Tool: interview_candidate_batch ──────────────────────────────────

const interviewCandidateBatchTool: AgentTool = {
  name: 'interview_candidate_batch',
  description: 'Ask the candidate 2-3 related questions at once. Group questions by category (e.g., all scale_and_scope questions in one batch). More efficient than single questions — the candidate answers all at once. Use this as your primary interview tool. Falls back gracefully if the budget is reached mid-batch.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Array of 1-4 related questions to present together.',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question_text: {
              type: 'string',
              description: 'The question to ask.',
            },
            context: {
              type: 'string',
              description: 'Why you are asking — shown to the candidate.',
            },
            category: {
              type: 'string',
              enum: ['scale_and_scope', 'requirement_mapped', 'career_narrative', 'hidden_accomplishments', 'currency_and_adaptability'],
              description: 'Question category.',
            },
            suggestions: {
              type: 'array',
              description: 'Optional suggestions to show as starting points.',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                  source: { type: 'string', enum: ['resume', 'inferred', 'jd'] },
                },
                required: ['label', 'description', 'source'],
              },
            },
          },
          required: ['question_text', 'context', 'category'],
        },
      },
    },
    required: ['questions'],
  },
  model_tier: 'orchestrator',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const rawQuestions = Array.isArray(input.questions)
      ? (input.questions as Record<string, unknown>[])
      : [];

    if (rawQuestions.length === 0) {
      throw new Error('interview_candidate_batch: questions array is required and must not be empty.');
    }

    // ── Budget enforcement ──────────────────────────────────────────
    const budget = getInterviewBudget(ctx);
    const asked = getInterviewQuestionCount(ctx);
    const remaining = budget - asked;

    if (remaining <= 0) {
      const mode = ctx.getState().user_preferences?.workflow_mode ?? 'balanced';
      ctx.emit({
        type: 'transparency',
        message: `Interview budget reached (${asked}/${budget} questions for ${mode} mode). Moving to gap analysis.`,
        stage: ctx.getState().current_stage,
      });
      return {
        budget_reached: true,
        questions_asked: asked,
        budget,
        message: `Interview budget reached (${budget} questions for ${mode} mode). You have sufficient evidence — proceed to classify_fit now.`,
      };
    }

    // Trim batch to remaining budget
    const trimmedQuestions = rawQuestions.slice(0, remaining);

    // Convert to PositioningQuestion format
    const positioningQuestions: PositioningQuestion[] = trimmedQuestions.map((rq, i) => {
      const rawSuggestions = Array.isArray(rq.suggestions) ? rq.suggestions as Record<string, unknown>[] : [];
      const suggestions = rawSuggestions.map(s => ({
        label: String(s.label ?? ''),
        description: String(s.description ?? ''),
        source: (s.source as 'resume' | 'inferred' | 'jd') ?? 'inferred',
      }));

      return {
        id: randomUUID(),
        question_number: asked + i + 1,
        question_text: String(rq.question_text ?? ''),
        context: String(rq.context ?? ''),
        input_type: suggestions.length > 0 ? 'hybrid' as const : 'text' as const,
        category: (String(rq.category ?? 'requirement_mapped')) as PositioningQuestion['category'],
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    });

    // Convert to QuestionnaireQuestion format and emit as questionnaire
    const questionnaireQuestions = positioningToQuestionnaire(positioningQuestions);
    const batchId = `interview_batch_${randomUUID().slice(0, 8)}`;

    ctx.emit(buildQuestionnaireEvent(
      batchId,
      'positioning',
      'Positioning Interview',
      questionnaireQuestions,
      `Batch ${Math.floor(asked / 3) + 1} — Answer these related questions to help build your positioning.`,
    ));

    // Wait for the candidate's response to the entire batch
    const submission = await ctx.waitForUser<unknown>(`questionnaire_${batchId}`);

    // Handle "draft now" escape
    if (submission && typeof submission === 'object' && 'draft_now' in submission && (submission as Record<string, unknown>).draft_now) {
      ctx.emit({
        type: 'transparency',
        message: 'Candidate requested early draft. Proceeding with available evidence.',
        stage: ctx.getState().current_stage,
      });
      return {
        draft_now_requested: true,
        questions_asked: asked,
        message: 'Candidate requested to skip remaining interview questions and proceed to drafting. Use the evidence collected so far — proceed to classify_fit now.',
      };
    }

    // Extract answers from questionnaire submission
    const typedSubmission = submission as {
      questionnaire_id: string;
      schema_version: number;
      stage: string;
      responses: Array<{
        question_id: string;
        selected_option_ids: string[];
        custom_text?: string;
        skipped: boolean;
      }>;
      submitted_at: string;
    };

    const answers = extractInterviewAnswers(
      typedSubmission as import('../types.js').QuestionnaireSubmission,
      positioningQuestions,
    );

    // Persist answers to scratchpad + pipeline state (same format as interview_candidate)
    if (!ctx.scratchpad.interview_answers) {
      ctx.scratchpad.interview_answers = [];
    }
    const scratchpadAnswers = ctx.scratchpad.interview_answers as Array<{
      question_id: string;
      question_text: string;
      category: string;
      answer: string;
      timestamp: string;
    }>;

    const transcript = ctx.getState().interview_transcript ?? [];

    if (!ctx.scratchpad.evidence_library) {
      ctx.scratchpad.evidence_library = [];
    }
    const evidenceLibrary = ctx.scratchpad.evidence_library as EvidenceItem[];

    const followUpRecommendations: Array<{ question_id: string; recommendation: string }> = [];

    for (const ans of answers) {
      scratchpadAnswers.push(ans);

      transcript.push({
        question_id: ans.question_id,
        question_text: ans.question_text,
        category: ans.category,
        answer: ans.answer,
      });

      // Build evidence item
      const qNum = scratchpadAnswers.length;
      evidenceLibrary.push({
        id: `ev_interview_${qNum}`,
        situation: `In response to: ${ans.question_text}`,
        action: ans.answer,
        result: '(to be extracted from context)',
        metrics_defensible: false,
        user_validated: true,
        source_question_id: ans.question_id,
      });

      // Evaluate follow-up needs
      const originalQuestion = positioningQuestions.find(q => q.id === ans.question_id);
      if (originalQuestion) {
        const followUp = evaluateFollowUp(originalQuestion, ans.answer);
        if (followUp) {
          followUpRecommendations.push({
            question_id: ans.question_id,
            recommendation: followUp.question_text,
          });
        }
      }
    }

    ctx.updateState({ interview_transcript: transcript });

    return {
      success: true,
      questions_presented: positioningQuestions.length,
      answers_received: answers.length,
      total_questions_asked: scratchpadAnswers.length,
      budget_remaining: budget - scratchpadAnswers.length,
      answers: answers.map(a => ({
        question_id: a.question_id,
        question_text: a.question_text,
        category: a.category,
        answer: a.answer,
      })),
      follow_up_recommendations: followUpRecommendations.length > 0
        ? followUpRecommendations
        : undefined,
      message: scratchpadAnswers.length >= budget
        ? `Budget reached (${budget} questions). Proceed to classify_fit.`
        : `${answers.length} answers collected. ${budget - scratchpadAnswers.length} questions remaining in budget.`,
    };
  },
};

// ─── Tool: classify_fit ───────────────────────────────────────────────

const classifyFitTool: AgentTool = {
  name: 'classify_fit',
  description: 'Run gap analysis — classify how the candidate\'s evidence maps to each JD requirement as strong/partial/gap. Requires parse_resume, analyze_jd, and at least a minimal positioning profile built from interview answers. Call this after completing the candidate interview.',
  input_schema: {
    type: 'object',
    properties: {
      positioning_summary: {
        type: 'string',
        description: 'Brief synthesis of the candidate\'s positioning based on interview answers so far. Used as the career arc label.',
      },
    },
    required: [],
  },
  model_tier: 'mid',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const state = ctx.getState();

    const parsedResume = (ctx.scratchpad.intake ?? state.intake) as NonNullable<typeof state.intake> | undefined;
    if (!parsedResume) {
      throw new Error('classify_fit: parse_resume must be called first.');
    }

    const research = (ctx.scratchpad.research ?? state.research) as NonNullable<typeof state.research> | undefined;
    if (!research) {
      throw new Error('classify_fit: analyze_jd must be called first to populate research data.');
    }

    // Build a PositioningProfile from accumulated interview answers
    const interviewAnswers = (ctx.scratchpad.interview_answers as Array<{
      question_id: string;
      question_text: string;
      category: string;
      answer: string;
    }> | undefined) ?? [];

    const evidenceLibrary = (ctx.scratchpad.evidence_library as EvidenceItem[] | undefined) ?? [];

    const positioningSummary = typeof input.positioning_summary === 'string' && input.positioning_summary.trim()
      ? input.positioning_summary
      : `${parsedResume.contact.name} — ${parsedResume.experience[0]?.title ?? 'Executive'} with ${parsedResume.career_span_years} years of experience`;

    // Synthesize a PositioningProfile from what we have
    const positioning: PositioningProfile = {
      career_arc: {
        label: positioningSummary,
        evidence: interviewAnswers.map(a => a.answer).join('; ').slice(0, 2000),
        user_description: interviewAnswers.find(a => a.category === 'career_narrative')?.answer ?? positioningSummary,
      },
      top_capabilities: parsedResume.skills.slice(0, 5).map(skill => ({
        capability: skill,
        evidence: [`Listed on resume: ${skill}`],
        source: 'resume' as const,
      })),
      evidence_library: evidenceLibrary,
      signature_method: null,
      unconscious_competence: interviewAnswers.find(a => a.category === 'hidden_accomplishments')?.answer ?? '',
      domain_insight: interviewAnswers.find(a => a.category === 'currency_and_adaptability')?.answer ?? '',
      authentic_phrases: interviewAnswers
        .flatMap(a => a.answer.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 200))
        .slice(0, 10),
      gaps_detected: [],
    };

    // Store the synthesized profile
    ctx.updateState({ positioning });
    ctx.scratchpad.positioning = positioning;

    const gapInput: GapAnalystInput = {
      parsed_resume: parsedResume,
      positioning,
      jd_analysis: research.jd_analysis,
      benchmark: research.benchmark_candidate,
    };

    const result = await runGapAnalyst(gapInput);

    ctx.updateState({ gap_analysis: result });
    ctx.scratchpad.gap_analysis = result;

    return {
      success: true,
      coverage_score: result.coverage_score,
      requirements_total: result.requirements.length,
      strong_count: result.requirements.filter(r => r.classification === 'strong').length,
      partial_count: result.requirements.filter(r => r.classification === 'partial').length,
      gap_count: result.requirements.filter(r => r.classification === 'gap').length,
      critical_gaps: result.critical_gaps,
      addressable_gaps: result.addressable_gaps,
      strength_summary: result.strength_summary,
    };
  },
};

// ─── Tool: design_blueprint ───────────────────────────────────────────

const designBlueprintTool: AgentTool = {
  name: 'design_blueprint',
  description: 'Design the complete resume blueprint — section order, evidence allocation, keyword placement, age protection, and per-bullet writing instructions. This is the final Strategist output. Call this after classify_fit has completed. The blueprint will be handed off to the Craftsman for execution.',
  input_schema: {
    type: 'object',
    properties: {
      workflow_mode: {
        type: 'string',
        enum: ['fast_draft', 'balanced', 'deep_dive'],
        description: 'Workflow mode affects aggressiveness of blueprint decisions. fast_draft: minimize gates. balanced: preserve quality. deep_dive: full detail.',
      },
      primary_goal: {
        type: 'string',
        description: 'The candidate\'s primary positioning goal (e.g., "Move from VP to SVP", "Industry pivot", "Show P&L ownership").',
      },
      resume_priority: {
        type: 'string',
        description: 'What to optimize for: "ats" (keyword density), "impact" (metrics-forward), "authentic" (voice and authenticity).',
      },
      seniority_delta: {
        type: 'string',
        description: 'Target seniority relative to current: "same", "one_level_up", "two_levels_up".',
      },
    },
    required: [],
  },
  model_tier: 'primary',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const state = ctx.getState();

    const parsedResume = (ctx.scratchpad.intake ?? state.intake) as NonNullable<typeof state.intake> | undefined;
    if (!parsedResume) {
      throw new Error('design_blueprint: parse_resume must be called first.');
    }

    const research = (ctx.scratchpad.research ?? state.research) as NonNullable<typeof state.research> | undefined;
    if (!research) {
      throw new Error('design_blueprint: analyze_jd must be called first.');
    }

    const positioning = (ctx.scratchpad.positioning ?? state.positioning) as NonNullable<typeof state.positioning> | undefined;
    if (!positioning) {
      throw new Error('design_blueprint: classify_fit must be called first (it builds the positioning profile).');
    }

    const gapAnalysis = (ctx.scratchpad.gap_analysis ?? state.gap_analysis) as NonNullable<typeof state.gap_analysis> | undefined;
    if (!gapAnalysis) {
      throw new Error('design_blueprint: classify_fit must be called first.');
    }

    // Build user preferences from tool input
    const userPreferences: ArchitectInput['user_preferences'] = {
      workflow_mode: (input.workflow_mode as 'fast_draft' | 'balanced' | 'deep_dive') ?? 'balanced',
      primary_goal: typeof input.primary_goal === 'string' ? input.primary_goal : undefined,
      resume_priority: typeof input.resume_priority === 'string' ? input.resume_priority : undefined,
      seniority_delta: typeof input.seniority_delta === 'string' ? input.seniority_delta : undefined,
    };

    const architectInput: ArchitectInput = {
      parsed_resume: parsedResume,
      positioning,
      research,
      gap_analysis: gapAnalysis,
      user_preferences: userPreferences,
    };

    const blueprint = await runArchitect(architectInput);

    ctx.updateState({ architect: blueprint });
    ctx.scratchpad.blueprint = blueprint;

    // Emit blueprint_ready so the frontend can show the review panel
    ctx.emit({
      type: 'blueprint_ready',
      blueprint,
    });

    return {
      success: true,
      blueprint_version: blueprint.blueprint_version,
      target_role: blueprint.target_role,
      positioning_angle: blueprint.positioning_angle,
      section_order: blueprint.section_plan.order,
      section_rationale: blueprint.section_plan.rationale,
      keyword_count: Object.keys(blueprint.keyword_map).length,
      age_protection_clean: blueprint.age_protection.clean,
      age_protection_flags: blueprint.age_protection.flags.length,
      evidence_allocation_roles: Object.keys(blueprint.evidence_allocation.experience_section).length,
      skills_categories: blueprint.skills_blueprint.categories.length,
    };
  },
};

// ─── Tool: emit_transparency ──────────────────────────────────────────

const emitTransparencyTool: AgentTool = {
  name: 'emit_transparency',
  description: 'Send a transparency message to the frontend so the user knows what the Strategist is doing. Use this at the start of each major phase and when waiting for long-running operations.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A brief, plain-language description of what the Strategist is currently doing. Example: "Analyzing job description requirements..." or "Interviewing you about your P&L leadership experience..."',
      },
    },
    required: ['message'],
  },
  model_tier: 'orchestrator',
  execute: async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    const message = String(input.message ?? '');
    if (!message.trim()) {
      return { success: false, reason: 'message is empty' };
    }

    const state = ctx.getState();

    ctx.emit({
      type: 'transparency',
      message,
      stage: state.current_stage,
    });

    return { success: true, message };
  },
};

// ─── Exports ──────────────────────────────────────────────────────────

export const strategistTools: AgentTool[] = [
  parseResumeTool,
  analyzeJdTool,
  researchCompanyTool,
  buildBenchmarkTool,
  interviewCandidateTool,
  interviewCandidateBatchTool,
  classifyFitTool,
  designBlueprintTool,
  emitTransparencyTool,
];
