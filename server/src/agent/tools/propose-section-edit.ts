import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { SECTION_GUIDANCE } from '../resume-guide.js';

export async function executeProposeSectionEdit(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  section: string;
  proposed_content: string;
  changes: Array<{ original: string; proposed: string; reasoning: string; jd_requirements: string[] }>;
}> {
  const section = input.section as string;
  const currentContent = input.current_content as string;
  const requirements = (input.requirements as string[]) || [];
  const instructions = (input.instructions as string) || '';

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

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are an expert executive resume writer specializing in professionals aged 45+. Propose changes to this resume section following the expert guidance below. For EACH change, explain what you changed, why, and which JD requirements it addresses. Flag any anti-patterns found in the original text (cliches like "responsible for," "proven track record," weak verbs, missing metrics, age-bias signals).

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

Return ONLY valid JSON:
{
  "proposed_content": "The full rewritten section",
  "changes": [
    {
      "original": "The original text that was changed",
      "proposed": "The new text",
      "reasoning": "Why this change was made and which guide rule it follows",
      "jd_requirements": ["Which requirements this change addresses"]
    }
  ]
}`,
      },
    ],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  let proposedContent = currentContent;
  let changes: Array<{ original: string; proposed: string; reasoning: string; jd_requirements: string[] }> = [];

  try {
    const parsed = JSON.parse(jsonText);
    proposedContent = typeof parsed.proposed_content === 'string' ? parsed.proposed_content : currentContent;
    changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  } catch {
    proposedContent = rawText || currentContent;
    changes = [{ original: '', proposed: '', reasoning: 'Section rewritten', jd_requirements: [] }];
  }

  // Store in tailored sections
  if (!ctx.tailoredSections) ctx.tailoredSections = {};
  (ctx.tailoredSections as Record<string, unknown>)[section] = proposedContent;

  // Update section status
  const existing = ctx.sectionStatuses.find(s => s.section === section);
  const jdReqs = changes.flatMap(c => c.jd_requirements);
  if (existing) {
    existing.status = 'proposed';
    existing.jd_requirements_addressed = [...new Set(jdReqs)];
  } else {
    ctx.sectionStatuses.push({
      section,
      status: 'proposed',
      jd_requirements_addressed: [...new Set(jdReqs)],
    });
  }

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
    jd_requirements_addressed: [...new Set(jdReqs)],
  });

  // Emit to right panel with diff data
  emit({
    type: 'right_panel_update',
    panel_type: 'live_resume',
    data: {
      active_section: section,
      changes,
    },
  });

  return { section, proposed_content: proposedContent, changes };
}
