/**
 * Agent 2: Positioning Coach ("Why Me" Agent)
 *
 * Conducts a JD-informed, dynamic coaching interview to extract the user's
 * authentic positioning data. Generates 8-15 questions informed by JD
 * requirements, benchmark candidate profile, and company research.
 * Probes deeper with follow-up questions when answers are vague or lack metrics.
 *
 * Uses MODEL_MID for question generation (~$0.002/call) and
 * MODEL_PRIMARY for profile synthesis.
 *
 * Unlike other agents, the Positioning Coach is interactive — it emits
 * questions via SSE and waits for user responses. The pipeline orchestrator
 * manages the back-and-forth.
 */

import { setMaxListeners } from 'node:events';
import { repairJSON } from '../lib/json-repair.js';
import { withRetry } from '../lib/retry.js';
import logger from '../lib/logger.js';
import type {
  IntakeOutput,
  ResearchOutput,
  PositioningProfile,
  PositioningQuestion,
  EvidenceItem,
  QuestionCategory,
} from './types.js';

/** Maximum total follow-up questions across the entire interview. */
export const MAX_FOLLOW_UPS = 3;

type LLMRuntime = typeof import('../lib/llm.js');
let llmRuntimePromise: Promise<LLMRuntime> | null = null;

async function getLLMRuntime(): Promise<LLMRuntime> {
  if (!llmRuntimePromise) {
    llmRuntimePromise = import('../lib/llm.js');
  }
  return llmRuntimePromise;
}

// ─── Requirement gap detection ────────────────────────────────────────

interface RequirementGap {
  requirement: string;
  gap_type: 'no_evidence' | 'no_metrics' | 'strong';
  partial_evidence?: string;
}

const METRICS_PATTERN = /\$[\d,.]+|\d+%|\d+[xX]|\d+\+?\s*(million|billion|users|customers|clients|employees|team|reports|people|members)/i;
const REQUIREMENT_STOPWORDS = new Set([
  'with', 'and', 'the', 'for', 'from', 'into', 'across', 'through', 'using',
  'experience', 'ability', 'strong', 'proven', 'demonstrated', 'knowledge', 'skills',
  'work', 'working', 'lead', 'leading', 'manage', 'managed', 'management',
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+/#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requirementKeywords(req: string): string[] {
  const normalized = normalizeText(req);
  return normalized
    .split(/[\s,/&()-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !REQUIREMENT_STOPWORDS.has(token))
    .slice(0, 8);
}

/**
 * For each JD must-have, check if resume has keyword matches with metrics
 * (strong), keyword matches without metrics (no_metrics), or no matches (no_evidence).
 */
function identifyRequirementGaps(
  resume: IntakeOutput,
  research: ResearchOutput,
): RequirementGap[] {
  const allBullets = resume.experience.flatMap(e => e.bullets);
  const bulletRows = resume.experience.flatMap(e =>
    e.bullets.map((bullet) => ({
      text: bullet,
      role: `${e.title} at ${e.company}`,
    })),
  );
  const titlesText = normalizeText(resume.experience.map((e) => `${e.title} ${e.company}`).join(' '));
  const summaryText = normalizeText(resume.summary ?? '');
  const skillsText = normalizeText(resume.skills.join(' '));
  const allResumeText = [summaryText, titlesText, skillsText, ...allBullets.map(normalizeText)].join(' ');

  return research.jd_analysis.must_haves.map(req => {
    const normalizedRequirement = normalizeText(req);
    const keywords = requirementKeywords(req);
    const phraseTokens = normalizedRequirement.split(' ').filter(Boolean);
    const hasPhraseMatch = normalizedRequirement.length >= 6 && allResumeText.includes(normalizedRequirement);
    const keywordMatches = keywords.filter((kw) => allResumeText.includes(kw));
    const keywordCoverage = keywords.length > 0 ? keywordMatches.length / keywords.length : 0;

    const matchingBullets = bulletRows.filter((row) => {
      const lower = normalizeText(row.text);
      if (normalizedRequirement.length >= 6 && lower.includes(normalizedRequirement)) return true;
      const rowKeywordMatches = keywords.filter((kw) => lower.includes(kw));
      if (rowKeywordMatches.length >= Math.min(2, keywords.length)) return true;
      // Handle short acronym-ish requirements (e.g., P&L, M&A) by raw text check
      return phraseTokens.some((token) => token.length <= 4 && row.text.toLowerCase().includes(token));
    });

    const hasSkillMatch = keywords.some(kw => skillsText.includes(kw))
      || (normalizedRequirement.length >= 6 && skillsText.includes(normalizedRequirement));
    const hasTitleOrSummaryMatch = keywords.some((kw) => titlesText.includes(kw) || summaryText.includes(kw));

    if (matchingBullets.length === 0 && !hasSkillMatch && !hasTitleOrSummaryMatch && !hasPhraseMatch && keywordCoverage < 0.4) {
      return { requirement: req, gap_type: 'no_evidence' as const };
    }

    const hasMetrics = matchingBullets.some(({ text }) => METRICS_PATTERN.test(text));
    if (hasMetrics) {
      return { requirement: req, gap_type: 'strong' as const };
    }

    const partialEvidence = matchingBullets[0]?.text
      ?? (hasSkillMatch ? `Skill match in resume skills: ${req}` : undefined)
      ?? (hasTitleOrSummaryMatch ? `Mentioned in title/summary context: ${req}` : undefined);

    return {
      requirement: req,
      gap_type: 'no_metrics' as const,
      partial_evidence: partialEvidence?.slice(0, 120),
    };
  });
}

// ─── LLM-powered question generation ─────────────────────────────────

/**
 * Generate 8-15 dynamic positioning questions informed by JD requirements,
 * benchmark candidate, and company research. Falls back to static questions
 * if LLM call fails.
 */
export async function generateQuestions(
  resume: IntakeOutput,
  research?: ResearchOutput,
  preferences?: {
    primary_goal?: string;
    resume_priority?: string;
    seniority_delta?: string;
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
    minimum_evidence_target?: number;
  },
): Promise<PositioningQuestion[]> {
  // If no research available (e.g., pipeline reorder didn't happen), use fallback
  if (!research) {
    return generateFallbackQuestions(resume);
  }

  try {
    const gaps = identifyRequirementGaps(resume, research);
    const questions = await withRetry(
      () => {
        // Each attempt gets its own AbortController so the in-flight fetch is
        // cancelled before a retry starts — prevents duplicate concurrent calls.
        const controller = new AbortController();
        setMaxListeners(15, controller.signal);
        const timer = setTimeout(() => controller.abort(), 120_000);
        return generateQuestionsViaLLM(resume, research, gaps, preferences, controller.signal)
          .finally(() => clearTimeout(timer));
      },
      {
        maxAttempts: 2,
        baseDelay: 2_000,
        onRetry: (attempt, error) => {
          logger.warn({ attempt, error: error.message }, 'Retrying LLM question generation');
        },
      },
    );
    return questions;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'LLM question generation failed — using fallback questions',
    );
    return generateFallbackQuestions(resume, research);
  }
}

async function generateQuestionsViaLLM(
  resume: IntakeOutput,
  research: ResearchOutput,
  gaps: RequirementGap[],
  preferences?: {
    primary_goal?: string;
    resume_priority?: string;
    seniority_delta?: string;
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
    minimum_evidence_target?: number;
  },
  signal?: AbortSignal,
): Promise<PositioningQuestion[]> {
  const { llm, MODEL_MID } = await getLLMRuntime();
  const needsAgeProtection = resume.career_span_years > 15;
  const mode = preferences?.workflow_mode ?? 'balanced';
  const evidenceTarget = typeof preferences?.minimum_evidence_target === 'number'
    ? Math.min(20, Math.max(3, Math.round(preferences.minimum_evidence_target)))
    : undefined;
  const targetQuestionCount = mode === 'fast_draft'
    ? '6-9'
    : mode === 'deep_dive'
      ? '10-15'
      : '8-12';

  const systemPrompt = `You are an elite executive career positioning strategist. Design a "Why Me" coaching interview that extracts the candidate's most powerful, authentic stories and maps them directly to what this specific role demands.

PRINCIPLES:
1. NEVER ask about something the resume already proves with metrics (gap_type: "strong")
2. For requirements with partial evidence (gap_type: "no_metrics"), ask for the specific metric or quantifiable proof
3. Frame as coaching, not interrogation: "Tell me about..." not "Do you have..."
4. For executives, assume scope exists — ask them to quantify it
5. Pre-populate suggestions from resume data where possible — include source field "resume", "inferred", or "jd"

CATEGORIES (distribute questions across these):
- scale_and_scope (2-3 questions): Surface operating scope executives take for granted — team size, budget, P&L, geography
- requirement_mapped (3-6 questions): One question per JD must-have that lacks strong resume evidence
- career_narrative (1-2 questions): Career thread, professional identity, what drives them
- hidden_accomplishments (1-2 questions): What's NOT on the resume — biggest wins they left off
${needsAgeProtection ? '- currency_and_adaptability (1-2 questions): Recent tech adoption, modern methodologies, continuous learning — ONLY because career_span > 15 years' : '- currency_and_adaptability: SKIP — career_span <= 15 years'}

PACE MODE:
- fast_draft: ask only the highest-impact questions and rely heavily on suggestions
- balanced: ask a focused but complete set of questions
- deep_dive: ask a thorough set of questions

Generate ${targetQuestionCount} questions based on the selected mode. Each question must have:
- id: unique string (e.g., "scope_1", "req_pnl", "career_1", "hidden_1", "currency_1")
- question_text: the coaching question
- context: 1-2 sentences of context shown to the user
- category: one of the category names above
- requirement_map: array of JD requirements this question addresses (can be empty)
- suggestions: 2-4 pre-populated answer options, each with label, description, and source ("resume", "inferred", or "jd")
- encouraging_text: brief positive message shown AFTER they answer (e.g., "Great — that's exactly the kind of proof hiring managers look for.")
- optional: true only for currency_and_adaptability questions

Return ONLY valid JSON array.`;

  const resumeContext = resume.experience.slice(0, 4).map(e =>
    `${e.title} at ${e.company} (${e.start_date}–${e.end_date})${e.inferred_scope ? ` [scope: team ${e.inferred_scope.team_size ?? '?'}, budget ${e.inferred_scope.budget ?? '?'}]` : ''}\n${e.bullets.slice(0, 4).join('\n')}`
  ).join('\n\n');

  const gapContext = gaps.map(g => {
    if (g.gap_type === 'strong') return `- [STRONG] ${g.requirement} — skip, resume already proves this with metrics`;
    if (g.gap_type === 'no_metrics') return `- [NO_METRICS] ${g.requirement} — partial evidence: "${g.partial_evidence}" — ask for the number`;
    return `- [NO_EVIDENCE] ${g.requirement} — no resume match, probe for hidden experience`;
  }).join('\n');

  const userPrompt = `PARSED RESUME:
Career span: ${resume.career_span_years} years
Skills: ${resume.skills.slice(0, 15).join(', ')}

Experience:
${resumeContext}

JD ANALYSIS:
Role: ${research.jd_analysis.role_title} at ${research.jd_analysis.company}
Seniority: ${research.jd_analysis.seniority_level}
Must-haves: ${research.jd_analysis.must_haves.join('; ')}
Nice-to-haves: ${research.jd_analysis.nice_to_haves.join('; ')}
Implicit requirements: ${research.jd_analysis.implicit_requirements.join('; ')}

BENCHMARK CANDIDATE: ${research.benchmark_candidate.ideal_profile}

COMPANY CULTURE: ${research.company_research.culture_signals.join(', ')}

REQUIREMENT GAP ANALYSIS:
${gapContext}

${preferences ? `USER PREFERENCES:
Goal: ${preferences.primary_goal ?? 'not specified'}
Priority: ${preferences.resume_priority ?? 'not specified'}
Seniority delta: ${preferences.seniority_delta ?? 'not specified'}
Workflow mode: ${preferences.workflow_mode ?? 'balanced'}
Minimum evidence target: ${evidenceTarget ?? 'not specified'}` : ''}

Generate the coaching interview questions as a JSON array.`;

  const response = await llm.chat({
    model: MODEL_MID,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    signal,
  });

  const parsed = repairJSON<unknown[]>(response.text);
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Failed to parse LLM question output');
  }

  // Normalize and validate
  return normalizeQuestions(parsed, resume);
}

interface RawLLMQuestion {
  id?: string;
  question_text?: string;
  context?: string;
  category?: string;
  requirement_map?: string[];
  suggestions?: Array<{
    label?: string;
    description?: string;
    source?: string;
  }>;
  encouraging_text?: string;
  optional?: boolean;
}

function normalizeQuestions(raw: unknown[], resume: IntakeOutput): PositioningQuestion[] {
  const validCategories = new Set<string>([
    'scale_and_scope', 'requirement_mapped', 'career_narrative',
    'hidden_accomplishments', 'currency_and_adaptability',
  ]);

  const questions: PositioningQuestion[] = [];
  const seenIds = new Set<string>();
  let questionNumber = 1;

  for (const item of raw) {
    const q = item as RawLLMQuestion;
    if (!q?.question_text || typeof q.question_text !== 'string') continue;

    const category = (validCategories.has(q.category ?? '')
      ? q.category
      : 'career_narrative') as QuestionCategory;

    const suggestions = (q.suggestions ?? [])
      .filter((s): s is { label: string; description: string; source?: string } =>
        typeof s?.label === 'string' && s.label.length > 0
      )
      .slice(0, 4)
      .map(s => ({
        label: s.label.length > 100 ? s.label.slice(0, 97) + '...' : s.label,
        description: s.description ?? '',
        source: (['resume', 'inferred', 'jd'].includes(s.source ?? '') ? s.source : 'inferred') as 'resume' | 'inferred' | 'jd',
      }));

    let id = q.id && typeof q.id === 'string' ? q.id : `q_${questionNumber}`;
    while (seenIds.has(id)) {
      id = `${id}_${questionNumber}`;
    }
    seenIds.add(id);

    questions.push({
      id,
      question_number: questionNumber,
      question_text: q.question_text,
      context: q.context ?? '',
      input_type: 'hybrid',
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      category,
      requirement_map: Array.isArray(q.requirement_map) ? q.requirement_map.filter(r => typeof r === 'string') : undefined,
      encouraging_text: typeof q.encouraging_text === 'string' ? q.encouraging_text : undefined,
      optional: Boolean(q.optional),
    });

    questionNumber++;
  }

  // Ensure minimum 8 questions — pad with fallback if needed
  if (questions.length < 8) {
    const fallbacks = generateFallbackQuestions(resume);
    const existingIds = new Set(questions.map(q => q.id));
    for (const fb of fallbacks) {
      if (questions.length >= 8) break;
      if (existingIds.has(fb.id)) continue;
      fb.question_number = questionNumber++;
      questions.push(fb);
    }
  }

  // Cap at 15
  return questions.slice(0, 15);
}

// ─── Follow-up evaluation ─────────────────────────────────────────────

/**
 * Evaluate whether a follow-up question should be asked based on the answer.
 * Returns a follow-up question or null. Max 1 follow-up per question.
 */
export function evaluateFollowUp(
  question: PositioningQuestion,
  answer: string,
): PositioningQuestion | null {
  const trimmed = answer.trim();

  // Skip follow-ups for optional questions or career_narrative (those are inherently open)
  if (question.optional) return null;

  // Trigger: Short answer (< 100 chars) on a non-optional question
  if (trimmed.length < 100 && question.category !== 'career_narrative') {
    return {
      id: `${question.id}_followup`,
      question_number: question.question_number,
      question_text: 'Can you walk me through the specific situation, what you did, and what resulted from it?',
      context: 'The more specific you are, the stronger your resume will be. Think: situation, action, result.',
      input_type: 'text',
      category: question.category,
      requirement_map: question.requirement_map,
      encouraging_text: 'Details like these are what separate a good resume from a great one.',
    };
  }

  // Trigger: No metrics (no $, %, or numbers) on requirement_mapped or scale_and_scope
  if (
    (question.category === 'requirement_mapped' || question.category === 'scale_and_scope') &&
    !METRICS_PATTERN.test(trimmed) &&
    !/\d/.test(trimmed)
  ) {
    return {
      id: `${question.id}_metrics`,
      question_number: question.question_number,
      question_text: 'Can you put a number on the impact? Revenue generated, costs saved, team size, percentage improvement — even approximate numbers help.',
      context: 'Hiring managers and ATS systems look for quantified results. Approximations are fine.',
      input_type: 'text',
      category: question.category,
      requirement_map: question.requirement_map,
      encouraging_text: 'Perfect — even approximate metrics make your resume 2-3x more compelling.',
    };
  }

  // Trigger: Vague language — "responsible for" / "worked on" without "I led/built/drove"
  const vaguePatterns = /\b(responsible for|worked on|was involved|helped with|assisted|participated)\b/i;
  const strongVerbs = /\b(led|built|drove|launched|created|designed|implemented|delivered|achieved|increased|reduced|transformed|spearheaded)\b/i;
  if (vaguePatterns.test(trimmed) && !strongVerbs.test(trimmed)) {
    return {
      id: `${question.id}_ownership`,
      question_number: question.question_number,
      question_text: 'What was YOUR specific contribution — not the team\'s? What decision did you make, what did you build, or what outcome did you personally drive?',
      context: 'Resumes that show personal ownership are significantly more impactful than team-level descriptions.',
      input_type: 'text',
      category: question.category,
      requirement_map: question.requirement_map,
      encouraging_text: 'That\'s exactly the kind of ownership hiring managers want to see.',
    };
  }

  return null;
}

// ─── Fallback questions (used when LLM fails) ────────────────────────

function generateFallbackQuestions(
  resume: IntakeOutput,
  research?: ResearchOutput,
): PositioningQuestion[] {
  const questions: PositioningQuestion[] = [];
  let num = 1;

  // Scale & Scope (2)
  const recentRole = resume.experience[0];
  questions.push({
    id: 'scope_team',
    question_number: num++,
    question_text: 'How large was the team or organization you managed in your most recent role? What was the budget?',
    context: recentRole
      ? `In your role as ${recentRole.title} at ${recentRole.company}, what was the scale of your responsibility?`
      : 'Help us understand the scope of your most recent leadership role.',
    input_type: 'hybrid',
    category: 'scale_and_scope',
    suggestions: recentRole?.inferred_scope?.team_size ? [{
      label: `Team of ${recentRole.inferred_scope.team_size}`,
      description: 'Based on your resume',
      source: 'resume' as const,
    }] : undefined,
    encouraging_text: 'Scope like this immediately signals seniority to hiring managers.',
  });

  questions.push({
    id: 'scope_impact',
    question_number: num++,
    question_text: 'What\'s the largest measurable business impact you\'ve had — revenue generated, costs saved, or efficiency gained?',
    context: 'Think about your biggest wins in terms of numbers.',
    input_type: 'hybrid',
    category: 'scale_and_scope',
    suggestions: extractMetricBullets(resume).map(b => ({
      label: b.text.length > 80 ? b.text.slice(0, 77) + '...' : b.text,
      description: `From your role as ${b.role}`,
      source: 'resume' as const,
    })),
    encouraging_text: 'Great — concrete numbers are the single most impactful thing on a resume.',
  });

  // Requirement-mapped (3-4 based on research)
  if (research) {
    const gaps = identifyRequirementGaps(resume, research);
    const needsProbing = gaps.filter(g => g.gap_type !== 'strong').slice(0, 4);
    for (const gap of needsProbing) {
      questions.push({
        id: `req_${num}`,
        question_number: num++,
        question_text: gap.gap_type === 'no_metrics'
          ? `Your resume mentions ${gap.requirement} — can you quantify the impact?`
          : `The role requires ${gap.requirement} — tell me about your experience with this.`,
        context: gap.gap_type === 'no_metrics'
          ? `We found partial evidence: "${gap.partial_evidence}" — but it needs a number.`
          : `This is a must-have for the ${research.jd_analysis.role_title} role.`,
        input_type: 'hybrid',
        category: 'requirement_mapped',
        requirement_map: [gap.requirement],
        suggestions: gap.partial_evidence ? [{
          label: gap.partial_evidence,
          description: 'From your resume — can you add metrics?',
          source: 'resume' as const,
        }] : [{
          label: `Yes, I have relevant experience`,
          description: 'Tell us about it',
          source: 'jd' as const,
        }],
        encouraging_text: 'This directly addresses what the hiring manager is looking for.',
      });
    }
  }

  // Career narrative (1)
  const titles = resume.experience.slice(0, 3).map(e => e.title);
  questions.push({
    id: 'career_arc',
    question_number: num++,
    question_text: 'What\'s the thread that connects your last few career moves — what were you chasing?',
    context: `Looking at your path (${titles.join(' → ')}), what\'s the story?`,
    input_type: 'hybrid',
    category: 'career_narrative',
    suggestions: [
      { label: 'Builder — I create things from scratch', description: 'Teams, products, functions', source: 'inferred' as const },
      { label: 'Scaler — I grow what\'s working', description: 'Revenue, teams, operations', source: 'inferred' as const },
      { label: 'Fixer — I turn things around', description: 'Underperformance, chaos, transitions', source: 'inferred' as const },
    ],
    encouraging_text: 'This narrative thread will be the backbone of your resume positioning.',
  });

  // Hidden accomplishments (1)
  questions.push({
    id: 'hidden_win',
    question_number: num++,
    question_text: 'What\'s an achievement you\'re proud of that\'s NOT on your resume — and why did you leave it off?',
    context: 'Sometimes the most impressive things don\'t make it onto the page.',
    input_type: 'hybrid',
    category: 'hidden_accomplishments',
    suggestions: [
      { label: 'Something else entirely', description: 'An achievement that doesn\'t fit typical categories', source: 'inferred' as const },
    ],
    encouraging_text: 'Hidden wins like these often become the most compelling resume content.',
  });

  // Currency & adaptability (only if career_span > 15)
  if (resume.career_span_years > 15) {
    questions.push({
      id: 'currency_1',
      question_number: num++,
      question_text: 'What\'s a new technology, methodology, or approach you\'ve adopted in the last 2-3 years?',
      context: 'Showing recent learning signals that you stay current and adaptable.',
      input_type: 'hybrid',
      category: 'currency_and_adaptability',
      optional: true,
      encouraging_text: 'This signals adaptability — crucial for experienced executives.',
    });
  }

  return questions;
}

function extractMetricBullets(resume: IntakeOutput): Array<{ text: string; role: string }> {
  return resume.experience
    .flatMap(e => e.bullets.map(b => ({ text: b, role: `${e.title} at ${e.company}` })))
    .filter(b => METRICS_PATTERN.test(b.text))
    .slice(0, 3);
}

// ─── Answer synthesis ────────────────────────────────────────────────

/**
 * After all questions are answered, synthesize the responses into
 * a structured PositioningProfile using MODEL_PRIMARY.
 * Now research-aware: maps evidence items to JD requirements.
 */
export async function synthesizeProfile(
  resume: IntakeOutput,
  answers: Array<{ question_id: string; answer: string; selected_suggestion?: string }>,
  research?: ResearchOutput,
  preferences?: {
    workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
    minimum_evidence_target?: number;
  },
): Promise<PositioningProfile> {
  const { llm, MODEL_PRIMARY } = await getLLMRuntime();
  const mode = preferences?.workflow_mode ?? 'balanced';
  const defaultEvidenceTarget = mode === 'fast_draft' ? 5 : mode === 'deep_dive' ? 12 : 8;
  const evidenceTarget = typeof preferences?.minimum_evidence_target === 'number'
    ? Math.min(20, Math.max(3, Math.round(preferences.minimum_evidence_target)))
    : defaultEvidenceTarget;
  const evidenceExtractionGuidance = evidenceTarget != null
    ? (mode === 'fast_draft'
        ? `TARGET: Extract at least ${evidenceTarget} high-confidence evidence items. Prefer precision over volume. Do NOT infer extra evidence if the interview is sparse.`
        : `TARGET: Extract at least ${evidenceTarget} evidence items if supported by the interview. Prefer concrete, defensible evidence over speculative extrapolation.`)
    : 'TARGET: Extract 10-20 evidence items (STAR format) from the interview responses.';
  const answerBlock = answers.map(a => {
    const label = a.selected_suggestion ? ` [Selected: ${a.selected_suggestion}]` : '';
    return `Q: ${a.question_id}${label}\nA: ${a.answer}`;
  }).join('\n\n');

  const jdContext = research
    ? `\n\nJD REQUIREMENTS (map evidence items to these):
Must-haves: ${research.jd_analysis.must_haves.join('; ')}
Nice-to-haves: ${research.jd_analysis.nice_to_haves.join('; ')}

BENCHMARK CANDIDATE: ${research.benchmark_candidate.ideal_profile}`
    : '';

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    max_tokens: 6144,
    system: `You are an expert career positioning strategist. You have conducted a "Why Me" interview with a professional and need to synthesize their responses into a structured positioning profile.

Your output will be consumed by a Resume Architect agent that uses it to make strategic decisions about resume content, structure, and positioning. Be precise, evidence-based, and honest — do not inflate or fabricate.

IMPORTANT: Capture the person's authentic language. When they use distinctive phrases or metaphors, preserve them in the "authentic_phrases" field. These will be woven into their resume to maintain their voice.

${evidenceExtractionGuidance} Look for every concrete achievement, metric, scope indicator, and accomplishment mentioned. Even brief mentions should be captured when defensible.${research ? '\n\nMap each evidence item to specific JD requirements it addresses.' : ''}`,
    messages: [{
      role: 'user',
      content: `Here is the professional's resume summary and recent experience for context:

RESUME SUMMARY: ${resume.summary}

RECENT EXPERIENCE:
${resume.experience.slice(0, 4).map(e => `${e.title} at ${e.company} (${e.start_date}–${e.end_date})\n${e.bullets.slice(0, 4).join('\n')}`).join('\n\n')}
${jdContext}

INTERVIEW RESPONSES (${answers.length} answers from guided coaching interview):
${answerBlock}

Synthesize this into a positioning profile. Return ONLY valid JSON:

{
  "career_arc": {
    "label": "Builder|Scaler|Fixer|Operator|Connector|other",
    "evidence": "Specific evidence from their career that supports this label",
    "user_description": "How they described their own career thread, in their words"
  },
  "top_capabilities": [
    {
      "capability": "What they do distinctively (verb + context)",
      "evidence": ["Specific proof point 1", "Proof point 2"],
      "source": "resume|interview|both"
    }
  ],
  "evidence_library": [
    {
      "situation": "The context/challenge",
      "action": "What they specifically did",
      "result": "The measurable outcome",
      "metrics_defensible": true,
      "user_validated": true,
      "source_question_id": "which interview question produced this evidence",
      "mapped_requirements": ["JD requirement this evidence addresses"],
      "scope_metrics": {
        "team_size": "number or null",
        "budget": "amount or null",
        "revenue_impact": "amount or null",
        "geography": "scope or null"
      }
    }
  ],
  "signature_method": {
    "name": "Name of their approach or null if they don't have one",
    "what_it_improves": "What problem it solves",
    "adopted_by_others": true
  },
  "unconscious_competence": "What people rely on them for, in their words",
  "domain_insight": "Their point of view on their field, 1-2 sentences",
  "authentic_phrases": ["Exact phrases they used that sound distinctly like them"],
  "gaps_detected": ["JD requirements still not addressed after the interview"]
}

Extract 5-8 top capabilities, at least ${evidenceTarget} evidence items when supported by the source material, and as many authentic phrases as you can find. Be specific — "strategic thinker" is useless, "turns ambiguous stakeholder conflicts into aligned roadmaps" is valuable.`,
    }],
  });

  const parsed = repairJSON<PositioningProfile>(response.text);
  if (!parsed) {
    throw new Error('Positioning Coach: failed to synthesize profile from interview responses');
  }

  // Assign IDs to evidence items and normalize new fields
  // LLM output may include extra fields; cast through unknown to access them safely.
  const evidence_library: EvidenceItem[] = (parsed.evidence_library ?? []).map((item, i) => {
    const raw = item as unknown as Record<string, unknown>;
    return {
      ...item,
      id: `ev_${String(i + 1).padStart(3, '0')}`,
      source_question_id: typeof raw.source_question_id === 'string' ? raw.source_question_id : undefined,
      mapped_requirements: Array.isArray(raw.mapped_requirements)
        ? (raw.mapped_requirements as string[]).filter(r => typeof r === 'string')
        : undefined,
      scope_metrics: typeof raw.scope_metrics === 'object' && raw.scope_metrics !== null
        ? normalizeScope(raw.scope_metrics as Record<string, unknown>)
        : undefined,
    };
  });

  return {
    career_arc: parsed.career_arc ?? { label: 'Unknown', evidence: '', user_description: '' },
    top_capabilities: parsed.top_capabilities ?? [],
    evidence_library,
    signature_method: parsed.signature_method ?? null,
    unconscious_competence: parsed.unconscious_competence ?? '',
    domain_insight: parsed.domain_insight ?? '',
    authentic_phrases: parsed.authentic_phrases ?? [],
    gaps_detected: parsed.gaps_detected ?? [],
  };
}

function normalizeScope(raw: Record<string, unknown>): EvidenceItem['scope_metrics'] {
  return {
    team_size: typeof raw.team_size === 'string' ? raw.team_size : undefined,
    budget: typeof raw.budget === 'string' ? raw.budget : undefined,
    revenue_impact: typeof raw.revenue_impact === 'string' ? raw.revenue_impact : undefined,
    geography: typeof raw.geography === 'string' ? raw.geography : undefined,
  };
}
