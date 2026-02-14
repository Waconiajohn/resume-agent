import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { SECTION_GUIDANCE } from '../resume-guide.js';

export async function executeGenerateSection(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ section: string; content: string; changes_made: string[] }> {
  const section = input.section as string;
  const currentContent = input.current_content as string;
  const requirements = input.requirements as string[];
  const instructions = input.instructions as string;

  const companyContext = ctx.companyResearch.company_name
    ? `Target company: ${ctx.companyResearch.company_name}
Language style: ${ctx.companyResearch.language_style || 'Professional'}
Values: ${ctx.companyResearch.values?.join(', ') || 'Not researched'}
Culture: ${ctx.companyResearch.culture || 'Not researched'}`
    : 'No company research available';

  const interviewContext = ctx.interviewResponses.length > 0
    ? `Interview responses:\n${ctx.interviewResponses.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n')}`
    : 'No interview responses yet';

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are an expert executive resume writer specializing in professionals aged 45+. Rewrite this section following the expert guidance below. Apply every rule rigorously and reference which guidance rules you followed in your changes_made list.

SECTION: ${section}

${SECTION_GUIDANCE[section] ? `EXPERT SECTION GUIDANCE:\n${SECTION_GUIDANCE[section]}\n` : ''}
CURRENT CONTENT:
${currentContent}

KEY REQUIREMENTS TO ADDRESS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

COMPANY CONTEXT:
${companyContext}

CANDIDATE INTERVIEW DATA:
${interviewContext}

SPECIFIC INSTRUCTIONS:
${instructions}

CRITICAL RULES:
- Never use "responsible for" — replace with strong action verbs
- Every bullet must have a NUMBER or METRIC
- Front-load bullets with results/impact
- Use CAR/RAS/STAR frameworks for bullet construction
- Match the company's language and voice throughout
- Flag and fix any age-bias signals (graduation years 20+ years old, "30 years of experience", obsolete tech references)

METRIC INTEGRITY RULE: If you need a specific number (percentage, dollar amount, team size, timeframe, etc.) that is NOT explicitly stated in the candidate's resume, interview responses, or provided data above, DO NOT estimate or fabricate it. Instead, use placeholder format [ASK: description of what metric is needed] in the content and include "NEEDS_USER_INPUT: description" in the changes_made list. The coaching system will prompt the user for this information.

Return ONLY valid JSON:
{
  "content": "The rewritten section content",
  "changes_made": ["List of specific changes, why each was made, and which guide rule it follows"]
}`,
      },
    ],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  let content = currentContent;
  let changesMade: string[] = [];

  // Claude sometimes wraps JSON in markdown code fences — strip them before parsing
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    // Ensure content is always a plain string, never an object
    const rawContent = parsed.content ?? currentContent;
    content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    changesMade = Array.isArray(parsed.changes_made) ? parsed.changes_made : [];
  } catch {
    // If parsing still fails, use raw text but strip any JSON wrapper artifacts
    content = rawText || currentContent;
    changesMade = ['Section rewritten (raw format)'];
  }

  if (!ctx.tailoredSections) ctx.tailoredSections = {};
  (ctx.tailoredSections as Record<string, unknown>)[section] = content;

  emit({
    type: 'resume_update',
    section,
    content,
    change_type: 'rewrite',
  });

  return { section, content, changes_made: changesMade };
}
