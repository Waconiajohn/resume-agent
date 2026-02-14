import { anthropic, MODEL } from '../../lib/anthropic.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeGenerateCoverLetterSection(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ paragraph_type: string; content: string; reasoning: string }> {
  const paragraphType = input.paragraph_type as string; // 'opening' | 'body_1' | 'body_2' | 'closing'
  const instructions = (input.instructions as string) || '';
  const previousParagraphs = (input.previous_paragraphs as string[]) || [];

  const companyContext = ctx.companyResearch.company_name
    ? `Company: ${ctx.companyResearch.company_name}
Culture: ${ctx.companyResearch.culture || 'Professional'}
Values: ${ctx.companyResearch.values?.join(', ') || 'Not specified'}
Language style: ${ctx.companyResearch.language_style || 'Professional'}`
    : '';

  const roleContext = ctx.jdAnalysis.job_title
    ? `Role: ${ctx.jdAnalysis.job_title}
Key requirements: ${ctx.jdAnalysis.must_haves?.slice(0, 5).join(', ') || 'Not specified'}`
    : '';

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Write a single paragraph for a cover letter. This should feel personal, specific, and human — never template-generated.

PARAGRAPH TYPE: ${paragraphType}
- opening: Hook with a specific connection to the company. Show you know them.
- body_1: Your strongest qualification for this role. Be specific.
- body_2: A story that demonstrates culture fit + skills. Make it memorable.
- closing: Clear call to action with genuine enthusiasm.

${companyContext ? `COMPANY CONTEXT:\n${companyContext}` : ''}

${roleContext ? `ROLE CONTEXT:\n${roleContext}` : ''}

${previousParagraphs.length > 0 ? `PREVIOUS PARAGRAPHS (maintain flow):\n${previousParagraphs.join('\n\n')}` : ''}

${instructions ? `SPECIFIC INSTRUCTIONS:\n${instructions}` : ''}

CANDIDATE CONTEXT:
${ctx.buildContextSummary()}

Return ONLY valid JSON:
{
  "content": "The paragraph text",
  "reasoning": "Why this approach was chosen"
}`,
      },
    ],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  let content = '';
  let reasoning = '';

  const parsed = repairJSON<Record<string, unknown>>(rawText);
  if (parsed) {
    content = (parsed.content as string) ?? '';
    reasoning = (parsed.reasoning as string) ?? '';
  } else {
    content = rawText;
    reasoning = 'Generated paragraph';
  }

  // Emit to right panel
  emit({
    type: 'right_panel_update',
    panel_type: 'cover_letter',
    data: {
      paragraphs: [
        ...previousParagraphs.map((p, i) => ({
          type: i === 0 ? 'opening' : `body_${i}`,
          content: p,
          status: 'confirmed',
        })),
        {
          type: paragraphType,
          content,
          status: 'draft',
        },
      ],
      company_name: ctx.companyResearch.company_name,
      role_title: ctx.jdAnalysis.job_title,
    },
  });

  return { paragraph_type: paragraphType, content, reasoning };
}
