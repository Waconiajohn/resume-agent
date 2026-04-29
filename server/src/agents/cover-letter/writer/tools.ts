/**
 * Cover Letter Writer — Tool definitions.
 *
 * 2 tools for the Writer agent:
 * - write_letter: Generate the cover letter from the analyst's plan
 * - review_letter: Self-review for tone, specificity, and length
 */

import type { AgentContext, AgentTool } from '../../runtime/agent-protocol.js';
import { CoverLetterReviewSchema } from '../types.js';
import type { CoverLetterReview, CoverLetterState, CoverLetterSSEEvent } from '../types.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
  type StructuralError,
} from '../../../lib/structured-llm.js';
import logger from '../../../lib/logger.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';
import {
  renderBenchmarkProfileDirectionSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';
import {
  EVIDENCE_LADDER_RULES,
  HUMAN_EDITORIAL_EFFECTIVENESS_RULES,
} from '../../shared-knowledge.js';
import { COVER_LETTER_RULES } from '../knowledge/rules.js';

type CoverLetterTool = AgentTool<CoverLetterState, CoverLetterSSEEvent>;

const COVER_LETTER_DEFAULT_MIN_WORDS = 225;
const COVER_LETTER_DEFAULT_MAX_WORDS = 300;
const COVER_LETTER_EXECUTIVE_MAX_WORDS = 375;
const COVER_LETTER_HARD_MAX_WORDS = 425;

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function isExecutiveOrComplexRole(jd: NonNullable<CoverLetterState['jd_analysis']>): boolean {
  const roleAndRequirements = [
    jd.role_title,
    ...jd.requirements,
  ].join(' ').toLowerCase();
  return /\b(chief|c-suite|cfo|coo|cio|cto|ceo|vp|vice president|director|head of|general manager|board|p&l|private equity|sponsor)\b/.test(roleAndRequirements);
}

function targetMaxWordsForRole(jd: NonNullable<CoverLetterState['jd_analysis']>): number {
  return isExecutiveOrComplexRole(jd)
    ? COVER_LETTER_EXECUTIVE_MAX_WORDS
    : COVER_LETTER_DEFAULT_MAX_WORDS;
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [paragraph.trim()].filter(Boolean);
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, Math.max(1, maxWords)).join(' ').replace(/[,:;—-]\s*$/, '')}.`;
}

function deterministicCondenseLetter(letter: string, maxWords: number): string {
  const paragraphs = letter.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0 || countWords(letter) <= maxWords) return letter.trim();

  const working = [...paragraphs];
  const salutation = /^dear\b/i.test(working[0] ?? '') ? working.shift() : null;
  const signoff = /^(sincerely|best|regards|thank you|respectfully),?/i.test(working.at(-1) ?? '')
    ? working.pop()
    : null;

  let body = working;
  if (body.length > 3) {
    body = [
      body[0]!,
      ...body.slice(1, -1).slice(0, 1),
      body[body.length - 1]!,
    ].filter((paragraph): paragraph is string => Boolean(paragraph));
  }

  body = body.map((paragraph) => splitSentences(paragraph).slice(0, 2).join(' '));

  const assemble = () => [salutation, ...body, signoff].filter(Boolean).join('\n\n');
  let condensed = assemble();

  while (countWords(condensed) > maxWords && body.length > 0) {
    let longestIndex = 0;
    for (let i = 1; i < body.length; i++) {
      if (countWords(body[i]!) > countWords(body[longestIndex]!)) longestIndex = i;
    }

    const longestParagraph = body[longestIndex]!;
    const sentences = splitSentences(longestParagraph);
    if (sentences.length > 1) {
      body[longestIndex] = sentences.slice(0, -1).join(' ');
    } else {
      body[longestIndex] = truncateWords(longestParagraph, Math.max(24, countWords(longestParagraph) - 20));
    }

    condensed = assemble();
  }

  return condensed;
}

async function enforceCoverLetterLength(
  letter: string,
  jd: NonNullable<CoverLetterState['jd_analysis']>,
  resume: NonNullable<CoverLetterState['resume_data']>,
  ctx: AgentContext<CoverLetterState, CoverLetterSSEEvent>,
): Promise<{ letter: string; trimmed: boolean }> {
  const hardMax = COVER_LETTER_HARD_MAX_WORDS;
  const targetMax = targetMaxWordsForRole(jd);
  if (countWords(letter) <= hardMax) return { letter, trimmed: false };

  const trimPrompt = `Shorten the cover letter below without adding any new facts.

Rules:
- Preserve the salutation and sign-off.
- Keep the strongest WHY ME positioning and the two strongest proof points.
- Remove repetition, resume recap, and secondary examples.
- Target ${COVER_LETTER_DEFAULT_MIN_WORDS}-${targetMax} words; never exceed ${hardMax} words.
- Keep 3-4 short paragraphs.
- Use only evidence already present in the letter.
- Output the revised letter text only.

Candidate: ${resume.name}
Target role: ${jd.role_title} at ${jd.company_name}

COVER LETTER TO TRIM:
${letter}`;

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: 'You are a senior editor. Tighten the cover letter without weakening evidence or adding facts.',
      messages: [{ role: 'user', content: trimPrompt }],
      max_tokens: 1600,
      signal: ctx.signal,
      session_id: ctx.sessionId,
    });
    const trimmed = removeDefensiveCoverLetterCaveats(response.text.trim());
    if (countWords(trimmed) > 0 && countWords(trimmed) <= hardMax) {
      return { letter: trimmed, trimmed: true };
    }
  } catch (err) {
    logger.warn({ err, session_id: ctx.sessionId }, 'cover-letter trim pass failed; using deterministic condense fallback');
  }

  return {
    letter: deterministicCondenseLetter(letter, hardMax),
    trimmed: true,
  };
}

function removeDefensiveCoverLetterCaveats(letter: string): string {
  return letter
    .replace(/\bWhile I have not (?:held|had) final P&L sign-off,\s*the\s+/gi, 'The ')
    .replace(/\bWhile I do not claim final P&L sign-off,\s*the\s+/gi, 'The ')
    .replace(/\bI do not claim final P&L sign-off,\s+but\s+/gi, '')
    .replace(/\bI don't claim final P&L sign-off,\s+but\s+/gi, '')
    .replace(/\bI have not had final P&L sign-off,\s+but\s+/gi, '')
    .replace(/\bI have not held final P&L sign-off,\s+but\s+/gi, '')
    .replace(/\bI do not have direct (?:PE )?board reporting experience,\s+but\s+/gi, '')
    .replace(/\bI have not directly reported to a (?:PE )?board,\s+but\s+/gi, '')
    .replace(/\bI would not claim [^.]+\.?\s*/gi, '')
    .trim();
}

function coverLetterSalutation(companyName: string): string {
  const normalized = companyName.replace(/\s+/g, ' ').trim();
  if (!normalized || /^(the company|unknown|n\/a|null)$/i.test(normalized)) {
    return 'Dear Hiring Team,';
  }
  return `Dear ${normalized} Hiring Team,`;
}

// ─── Tool: write_letter ───────────────────────────────────────────────

const writeLetterTool: CoverLetterTool = {
  name: 'write_letter',
  description:
    'Generate a professional cover letter based on the letter plan from the Analyst. ' +
    'Uses the opening hook, body points, and closing strategy to create a cohesive letter. ' +
    'Stores the draft in state and emits a letter_draft SSE event.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      tone: {
        type: 'string',
        enum: ['formal', 'conversational', 'bold'],
        description: 'Desired tone for the letter (default: formal)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const plan = state.letter_plan;
    const resume = state.resume_data;
    const jd = state.jd_analysis;

    if (!plan || !resume || !jd) {
      return { error: 'Missing letter plan or input data. Analyst must run first.' };
    }

    const tone = String(input.tone ?? state.tone ?? 'formal');

    const platformCtx = state.platform_context;
    const sharedContext = state.shared_context;
    const positioningStrategySource = hasMeaningfulSharedValue(sharedContext?.positioningStrategy)
      ? sharedContext?.positioningStrategy
      : platformCtx?.positioning_strategy;
    const evidenceItemSource = hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)
      ? sharedContext?.evidenceInventory.evidenceItems
      : platformCtx?.evidence_items;
    const hasSharedPositioning = hasMeaningfulSharedValue(sharedContext?.positioningStrategy);
    const hasSharedEvidence = hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems);
    const positioningStrategyBlock = positioningStrategySource
      ? renderPositioningStrategySection({
          heading: 'POSITIONING STRATEGY FROM RESUME STRATEGIST',
          sharedStrategy: hasSharedPositioning ? sharedContext?.positioningStrategy : undefined,
          legacyStrategy: hasSharedPositioning ? undefined : platformCtx?.positioning_strategy,
        }).join('\n')
      : '';
    const evidenceItemsBlock = Array.isArray(evidenceItemSource) && evidenceItemSource.length > 0
      ? renderEvidenceInventorySection({
          heading: 'KEY EVIDENCE ITEMS',
          sharedInventory: hasSharedEvidence ? sharedContext?.evidenceInventory : undefined,
          legacyEvidence: hasSharedEvidence ? undefined : (platformCtx?.evidence_items ?? undefined),
          maxItems: 15,
        }).join('\n')
      : '';
    const positioningStrategy = positioningStrategyBlock
      ? `\n\n${positioningStrategyBlock}`
      : '';
    const evidenceItems = evidenceItemsBlock
      ? `\n\n${evidenceItemsBlock}`
      : '';
    const benchmarkProfileDirection = renderBenchmarkProfileDirectionSection({
      heading: 'BENCHMARK PROFILE DIRECTION',
      sharedContext,
    }).join('\n');
    const benchmarkDirection = benchmarkProfileDirection
      ? `\n\n${benchmarkProfileDirection}`
      : '';

    // Build work history block — this is the primary source of evidence.
    // Include company, title, duration, and all highlights so the writer
    // can reference specific roles and real accomplishments.
    const workHistoryBlock = (resume as typeof resume & { work_history?: Array<{ company: string; title: string; duration: string; highlights: string[] }> }).work_history && (resume as typeof resume & { work_history?: Array<{ company: string; title: string; duration: string; highlights: string[] }> }).work_history!.length > 0
      ? '\n\nWORK HISTORY (primary evidence source — cite specific roles and highlights):\n' +
        (resume as typeof resume & { work_history?: Array<{ company: string; title: string; duration: string; highlights: string[] }> }).work_history!.map(
          (role) =>
            `${role.title} at ${role.company} (${role.duration})\n` +
            role.highlights.map((h) => `  - ${h}`).join('\n'),
        ).join('\n\n')
      : '';

    const systemPrompt = `You are an expert executive cover letter writer. You write in the candidate's authentic voice — you never fabricate experience, inflate credentials, or misrepresent anyone. You better position real skills and genuine accomplishments so the reader immediately recognises this candidate as someone worth interviewing.

EVIDENCE-BOUND RULE: Every factual claim in the cover letter must trace directly to the candidate data provided below. The JD can define the need; candidate data decides what can be claimed. This means:
- Metrics must come from the source data. Use the exact figures provided — do not round up, inflate, or substitute different numbers.
- Company names and role titles must match the work history exactly. Do not invent employers or titles.
- Do not invent projects, outcomes, or experiences that are not listed in the candidate data.
- When the candidate's background does not directly map to a JD requirement, look for reasonable inference or adjacent proof before dropping the angle. Bridge with a real transferable skill; do not fabricate direct experience.
- Forbidden filler phrases: "passionate about", "proven track record", "results-oriented", "dynamic leader", "I am the perfect candidate", "I am confident I would be an asset", "leverage my expertise". Replace any of these with specific, sourced evidence.

${EVIDENCE_LADDER_RULES}

${HUMAN_EDITORIAL_EFFECTIVENESS_RULES}

${COVER_LETTER_RULES}

Writing philosophy:
- Executives are better suited for far more roles than they initially believe — your job is to surface that real fit.
- Use the candidate's own language and phrasing wherever possible; avoid generic resume-speak.
- Tone must feel human and confident, not formulaic.
- This is a strategic positioning letter, not a prose resume. Interpret the evidence into why the candidate fits this specific role; do not walk chronologically through the resume.
- The first sentence must name the role's business problem, mandate, or benchmark-candidate need. Do not begin with "I am writing to express my interest."
- Use no more than two past-employer references unless the target role genuinely requires breadth across several environments.
- If the target role explicitly requires board/PE sponsor communication, P&L ownership, or another high-risk stretch area, do not skip it. Use one concise sentence of confident adjacent-proof framing from the positioning strategy. Never claim direct board/PE reporting or final P&L ownership unless the evidence explicitly says so.
- Cover letters should not volunteer self-defeating disclaimers such as "I have not..." or "I do not have..." unless the user explicitly asks for that level of disclosure. Handle gaps with positive, truthful language: show the operating-budget, executive-cadence, or board-ready evidence that makes the stretch credible, and save explicit gap handling for interview prep.
- If Board/PE/P&L appears in the target role, include positive language like "board-ready operating rhythm", "sponsor-ready operating evidence", or "operating-budget discipline" only when supported by the evidence. This must read as confident positioning, not a caveat.
- Length target: 225-300 words for most roles; 300-375 words only for executive or unusually complex roles. Hard cap: 425 words. No fluff.`;

    const salutation = coverLetterSalutation(jd.company_name);
    const userMessage = `Write a complete, polished cover letter using ONLY the information provided below. Output the letter text only — no JSON, no commentary, no markdown fencing.

Every factual claim must trace to the candidate data below. Do not add accomplishments, metrics, or experiences that do not appear in this data. Use reasonable inference and adjacent proof only when the source facts make the bridge honest and clear.

CANDIDATE PROFILE
Name: ${resume.name}
Current title: ${resume.current_title}
Key skills: ${resume.key_skills.join(', ')}
Key achievements:
- ${resume.key_achievements.join('\n- ')}${workHistoryBlock}${benchmarkDirection}${positioningStrategy}${evidenceItems}

TARGET ROLE
Company: ${jd.company_name}
Role: ${jd.role_title}
Key requirements:
- ${jd.requirements.join('\n- ')}
Culture cues: ${jd.culture_cues.length > 0 ? jd.culture_cues.join(', ') : 'Not specified'}

LETTER PLAN (from Analyst — use the specific evidence cited here)
Opening hook: ${plan.opening_hook}
Body points:
${plan.body_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}
Closing strategy: ${plan.closing_strategy}

TONE: ${tone}

Write the full letter now. Start with "${salutation}" and end with a professional sign-off using the candidate's name.

Structure it as 3-4 short paragraphs, ${COVER_LETTER_DEFAULT_MIN_WORDS}-${targetMaxWordsForRole(jd)} words:
1. Company/role mandate + strongest proof.
2. Role-fit proof for the top operating requirement.
3. Second proof point or why-company connection.
4. Brief close.

Mandatory COO-scope coverage when present in the target role:
- Do not address every executive requirement. Pick the two strongest evidence-backed angles and make them memorable.
- Consolidated P&L ownership: bridge with operating-budget partnership, cost-per-unit accountability, margin levers, or finance partnership; do not claim final P&L ownership unless directly evidenced.
- Board/PE sponsor quarterly reviews: bridge with board-ready operating rhythm, sponsor-ready operating evidence, executive reporting, or measurable value-creation narrative; do not claim direct PE-board reporting unless directly evidenced.
- ERP, procurement, cross-divisional integration, CFO partnership, or working capital: include only if it is one of the two strongest source-backed differentiators.

Every paragraph must include at least one concrete source-backed detail, but the paragraph's job is to interpret why that proof matters for ${jd.company_name}'s ${jd.role_title} role.`;

    try {
      const response = await llm.chat({
        model: MODEL_PRIMARY,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 4096,
        signal: ctx.signal,
        session_id: ctx.sessionId,
      });

      const draft = removeDefensiveCoverLetterCaveats(response.text.trim());
      const lengthChecked = await enforceCoverLetterLength(draft, jd, resume, ctx);
      const letter = lengthChecked.letter;

      state.letter_draft = letter;
      ctx.scratchpad['letter_draft'] = letter;
      ctx.scratchpad['letter_tone'] = tone;
      ctx.scratchpad['letter_trimmed_for_length'] = lengthChecked.trimmed;

      ctx.emit({
        type: 'letter_draft',
        letter,
      });

      return {
        status: 'drafted',
        word_count: countWords(letter),
        tone,
        trimmed: lengthChecked.trimmed,
      };
    } catch (err) {
      logger.error({ err, session_id: ctx.sessionId }, 'write_letter LLM call failed');
      return { error: 'Failed to generate cover letter. Please try again.' };
    }
  },
};

// ─── Tool: review_letter ──────────────────────────────────────────────

const reviewLetterTool: CoverLetterTool = {
  name: 'review_letter',
  description:
    'Self-review the drafted cover letter for tone consistency, specificity, ' +
    'appropriate length (225-300 words by default, 300-375 for executive complexity), and alignment with the job requirements. ' +
    'Returns a quality score (0-100) and feedback.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const letter = state.letter_draft;

    if (!letter) {
      return { error: 'No letter draft to review. Call write_letter first.' };
    }

    const wordCount = letter.split(/\s+/).length;
    const jd = state.jd_analysis;
    const resume = state.resume_data;

    const reviewPrompt = `You are a rigorous executive cover letter reviewer. Evaluate the cover letter below against five criteria and return ONLY valid JSON in the schema provided — no commentary, no markdown fencing.

COVER LETTER:
${letter}

${jd ? `TARGET ROLE: ${jd.role_title} at ${jd.company_name}\nRequirements: ${jd.requirements.join('; ')}` : ''}
${resume ? `CANDIDATE: ${resume.name}, ${resume.current_title}` : ''}
Word count: ${wordCount}

${COVER_LETTER_RULES}

EVALUATION CRITERIA (score each 0-20):
1. voice_authenticity — Does it sound like a real person, not a template? Penalise generic phrases, clichés, or robotic phrasing.
2. jd_alignment — Does it directly address the stated requirements and culture cues?
3. evidence_specificity — Are claims backed by concrete achievements, metrics, or named projects from the candidate's background?
4. executive_tone — Is the tone confident and peer-level, not overly eager or subservient?
5. length_appropriateness — Is it 225-300 words for most roles, or 300-375 words for executive/complex roles? Penalise <180 or >425.

Return JSON matching this exact schema:
{
  "criteria": {
    "voice_authenticity": { "score": <0-20>, "note": "<brief finding>" },
    "jd_alignment": { "score": <0-20>, "note": "<brief finding>" },
    "evidence_specificity": { "score": <0-20>, "note": "<brief finding>" },
    "executive_tone": { "score": <0-20>, "note": "<brief finding>" },
    "length_appropriateness": { "score": <0-20>, "note": "<brief finding>" }
  },
  "total_score": <0-100>,
  "passed": <true if total_score >= 70>,
  "issues": ["<actionable fix 1>", "<actionable fix 2>"]
}

Be strict. Only list issues that, if fixed, would materially improve the letter.`;

    try {
      // 2026-04-21 — migrated from bespoke llm.chat + repairJSON to the
      // shared structured-llm-call primitive. The primitive owns the
      // one-shot JSON/Zod retry so gpt-5.4-mini's stochastic schema
      // failures (the boolean-confidence class) recover instead of
      // hard-failing the review step. On double-failure it throws
      // StructuredLlmCallError, which the catch block converts into
      // the same graceful word-count fallback the pre-migration code
      // produced.
      const result = await structuredLlmCall<CoverLetterReview>({
        provider: llm,
        model: MODEL_MID,
        system: 'You are a rigorous cover letter reviewer. Return only valid JSON.',
        userMessage: reviewPrompt,
        temperature: 0.2,
        maxTokens: 1024,
        signal: ctx.signal,
        schema: CoverLetterReviewSchema,
        buildRetryAddendum: buildReviewRetryAddendum,
        stage: 'cover-letter-review',
        promptName: 'review_letter',
        promptVersion: '1',
      });

      const parsed = result.parsed;
      const score = Math.max(0, Math.min(100, parsed.total_score));
      const passed = parsed.passed;
      const issues = parsed.issues;
      const feedback = issues.length > 0 ? issues.join('; ') : 'No issues found';

      state.quality_score = score;
      state.review_feedback = feedback;
      ctx.scratchpad['quality_score'] = score;
      ctx.scratchpad['review_feedback'] = feedback;

      return {
        score,
        passed,
        issues,
        word_count: wordCount,
        criteria: parsed.criteria,
      };
    } catch (err) {
      if (err instanceof StructuredLlmCallError) {
        // Graceful degradation: same word-count fallback the pre-migration
        // repairJSON-null branch produced. Preserves the existing contract
        // that a broken review never crashes the tool — the user sees a
        // reduced-confidence score instead.
        logger.warn(
          { session_id: ctx.sessionId, err: err.message },
          'review_letter primitive failed on both attempts — falling back to word-count check',
        );
        const fallbackScore = wordCount >= 180 && wordCount <= COVER_LETTER_HARD_MAX_WORDS ? 70 : 55;
        state.quality_score = fallbackScore;
        state.review_feedback = 'Review parse failed — manual check recommended';
        ctx.scratchpad['quality_score'] = fallbackScore;
        ctx.scratchpad['review_feedback'] = state.review_feedback;
        return {
          score: fallbackScore,
          passed: fallbackScore >= 70,
          issues: ['Review parse failed'],
          word_count: wordCount,
        };
      }
      logger.error({ err, session_id: ctx.sessionId }, 'review_letter LLM call failed');
      return { error: 'Failed to review cover letter. Please try again.' };
    }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────

function buildReviewRetryAddendum(error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return [
      `RETRY: Your previous response was not valid JSON — the parser reported: ${error.message}.`,
      '',
      'Return ONLY the complete review JSON object. No prose. No markdown fences. Every string properly quoted; every bracket/brace balanced.',
    ].join('\n');
  }
  const issues = error.issues
    .slice(0, 10)
    .map((i) => `  • ${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`);
  return [
    'RETRY: Your previous response failed review-schema validation. The schema reported:',
    '',
    issues.join('\n'),
    '',
    'Return the JSON with these fields corrected. Required fields:',
    '  • `total_score` — number between 0 and 100.',
    '  • `passed` — boolean (true if total_score >= 70).',
    '  • `issues` — array of strings (may be empty).',
    '  • `criteria` — object (may be partial but must be present).',
    '',
    'Return ONLY the JSON — no prose, no markdown fences.',
  ].join('\n');
}

// ─── Export ───────────────────────────────────────────────────────────

export const writerTools: CoverLetterTool[] = [
  writeLetterTool,
  reviewLetterTool,
];
