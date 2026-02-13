import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

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
        content: `Rewrite this resume section. Match the company's language and voice. Quantify everything possible.

SECTION: ${section}

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

Return ONLY valid JSON:
{
  "content": "The rewritten section content",
  "changes_made": ["List of specific changes and why each was made"]
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
