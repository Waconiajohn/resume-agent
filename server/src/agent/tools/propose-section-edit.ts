import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { SECTION_GUIDANCE } from '../resume-guide.js';
import { checkSectionOrder } from './section-order.js';

const SECTION_ALIASES: Record<string, string> = {
  technical_expertise: 'skills',
  core_competencies: 'skills',
  technical_skills: 'skills',
  work_experience: 'experience',
  professional_experience: 'experience',
  work_history: 'experience',
  professional_summary: 'summary',
  executive_summary: 'summary',
  career_highlights: 'selected_accomplishments',
  key_achievements: 'selected_accomplishments',
};

export async function executeProposeSectionEdit(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  section: string;
  proposed_content: string;
  changes: Array<{ original: string; proposed: string; reasoning: string; jd_requirements: string[] }>;
}> {
  const section = SECTION_ALIASES[input.section as string] ?? (input.section as string);

  // Reject edits when all sections are confirmed — agent should be transitioning
  if (ctx.areAllSectionsConfirmed()) {
    throw new Error(
      'ALL SECTIONS ARE ALREADY CONFIRMED. Do NOT edit sections. ' +
      'Call confirm_phase_complete with next_phase="quality_review" IMMEDIATELY.',
    );
  }
  const currentContent = input.current_content as string;
  const requirements = (input.requirements as string[]) || [];
  const instructions = (input.instructions as string) || '';

  // Section order enforcement
  const blockMessage = checkSectionOrder(section, ctx);
  if (blockMessage) {
    return { section, proposed_content: currentContent ?? '', changes: [{ original: '', proposed: '', reasoning: blockMessage, jd_requirements: [] }] };
  }

  const companyContext = ctx.companyResearch.company_name
    ? `Target company: ${ctx.companyResearch.company_name}
Language style: ${ctx.companyResearch.language_style || 'Professional'}
Values: ${ctx.companyResearch.values?.join(', ') || 'Not researched'}`
    : 'No company research available';

  const benchmarkContext = ctx.benchmarkCandidate
    ? `Benchmark: ${ctx.benchmarkCandidate.ideal_candidate_summary}
Keywords to echo: ${ctx.benchmarkCandidate.language_keywords.join(', ')}`
    : '';

  const interviewContext = ctx.interviewResponses.length > 0
    ? `Interview data:\n${ctx.interviewResponses.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n')}`
    : '';

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    max_tokens: 4096,
    system: '',
    messages: [
      {
        role: 'user',
        content: `You are an expert executive resume writer specializing in professionals aged 45+. Propose changes to this resume section following the expert guidance below. Flag any anti-patterns found in the original text (cliches like "responsible for," "proven track record," weak verbs, missing metrics, age-bias signals).

SECTION: ${section}

${SECTION_GUIDANCE[section] ? `EXPERT SECTION GUIDANCE:\n${SECTION_GUIDANCE[section]}\n` : ''}
CURRENT CONTENT:
${currentContent}

KEY REQUIREMENTS TO ADDRESS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

COMPANY CONTEXT:
${companyContext}

${benchmarkContext ? `BENCHMARK CANDIDATE:\n${benchmarkContext}` : ''}

${interviewContext ? `CANDIDATE INTERVIEW DATA:\n${interviewContext}` : ''}

${instructions ? `SPECIFIC INSTRUCTIONS:\n${instructions}` : ''}

CRITICAL RULES:
- Never use "responsible for" — replace with strong action verbs
- Every bullet must have a NUMBER or METRIC
- Front-load bullets with results/impact using CAR/RAS/STAR frameworks
- Match the company's language and voice throughout
- Flag and fix any age-bias signals

METRIC INTEGRITY RULE: If you need a specific number (percentage, dollar amount, team size, timeframe, etc.) that is NOT explicitly stated in the candidate's resume, interview responses, or provided data above, DO NOT estimate or fabricate it. Instead, use placeholder format [ASK: description of what metric is needed] in the content and include a change entry with reasoning "NEEDS_USER_INPUT: description". The coaching system will prompt the user for this information.

CHANGE FORMAT RULES — READ CAREFULLY:
You must return a "changes" array where EACH entry is a SPECIFIC, SURGICAL text substitution — a short snippet from the original and its replacement.
- "original": Copy-paste the EXACT text snippet from CURRENT CONTENT that you are replacing. This must be a specific phrase, sentence, or bullet — NOT the full section.
- "proposed": The replacement text for that specific snippet — NOT the full section.
- "reasoning": Why this specific change was made.
- NEVER put the full section text in individual change entries. Each change must target a specific phrase, sentence, or bullet point.
- Maximum 5 changes per call. Prioritize the highest-impact edits.

CORRECT EXAMPLE (surgical snippet substitution):
{
  "proposed_content": "Spearheaded migration of 200+ microservices to Kubernetes, reducing deployment time by 74% and saving $1.2M annually in infrastructure costs.",
  "changes": [
    {
      "original": "Responsible for managing cloud infrastructure",
      "proposed": "Spearheaded migration of 200+ microservices to Kubernetes",
      "reasoning": "Replaced weak 'responsible for' with action verb; added specifics",
      "jd_requirements": ["Cloud infrastructure management"]
    },
    {
      "original": "which helped reduce costs",
      "proposed": "reducing deployment time by 74% and saving $1.2M annually in infrastructure costs",
      "reasoning": "Added concrete metrics per CAR framework",
      "jd_requirements": ["Cost optimization"]
    }
  ]
}

WRONG EXAMPLE (do NOT do this — full section repeated in each change):
{
  "changes": [
    { "original": "", "proposed": "THE ENTIRE REWRITTEN SECTION...", "reasoning": "..." },
    { "original": "", "proposed": "THE ENTIRE REWRITTEN SECTION AGAIN...", "reasoning": "..." }
  ]
}

Return ONLY valid JSON:
{
  "proposed_content": "The full rewritten section with all changes applied",
  "changes": [
    {
      "original": "Exact short snippet from CURRENT CONTENT being replaced",
      "proposed": "The replacement snippet (NOT the full section)",
      "reasoning": "Why this specific change was made and which guide rule it follows",
      "jd_requirements": ["Which requirements this change addresses"]
    }
  ]
}`,
      },
    ],
  });

  const rawText = response.text;

  let proposedContent = currentContent;
  let changes: Array<{ original: string; proposed: string; reasoning: string; jd_requirements: string[] }> = [];

  const parsed = repairJSON<Record<string, unknown>>(rawText);
  if (parsed) {
    proposedContent = typeof parsed.proposed_content === 'string' ? parsed.proposed_content : currentContent;
    const rawChanges: Array<{ original: string; proposed: string; reasoning: string; jd_requirements: string[] }> =
      Array.isArray(parsed.changes) ? parsed.changes : [];

    // Filter out malformed entries where original is empty or proposed is the full section
    const proposedLen = proposedContent.length;
    changes = rawChanges
      .filter(c => {
        if (!c.original || c.original.trim().length === 0) return false;
        // If proposed is >80% of the full section length, it's likely the full section pasted in
        if (c.proposed && c.proposed.length > proposedLen * 0.8) return false;
        return true;
      })
      .slice(0, 5); // Cap at 5 changes

    // If all changes were filtered out, create a single summary entry
    if (changes.length === 0 && rawChanges.length > 0) {
      changes = [{ original: '(see original section)', proposed: '(see rewritten section)', reasoning: 'Full section rewrite applied', jd_requirements: [] }];
    }
  } else {
    proposedContent = rawText || currentContent;
    changes = [{ original: '', proposed: '', reasoning: 'Section rewritten', jd_requirements: [] }];
  }

  // Store in tailored sections
  (ctx.tailoredSections as Record<string, unknown>)[section] = proposedContent;

  // Update section status
  const jdReqs = [...new Set(changes.flatMap(c => c.jd_requirements))];
  ctx.upsertSectionStatus(section, 'proposed', jdReqs);

  // Emit resume update (for backward compat)
  emit({
    type: 'resume_update',
    section,
    content: proposedContent,
    change_type: 'rewrite',
  });

  // Emit section status
  emit({
    type: 'section_status',
    section,
    status: 'proposed',
    jd_requirements_addressed: jdReqs,
  });

  // Emit to right panel with diff data + WYSIWYG content
  emit({
    type: 'right_panel_update',
    panel_type: 'live_resume',
    data: {
      active_section: section,
      changes,
      proposed_content: proposedContent,
    },
  });

  // Truncate return value to avoid API tool-result size limits
  const truncatedChanges = changes.slice(0, 3).map(c => ({
    ...c,
    reasoning: c.reasoning?.slice(0, 200) ?? '',
    original: c.original?.slice(0, 100) ?? '',
    proposed: c.proposed?.slice(0, 200) ?? '',
  }));

  return { section, proposed_content: proposedContent.slice(0, 2000), changes: truncatedChanges };
}
