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
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Write a single paragraph for a cover letter. Total cover letter target: 250-350 words. This is ONE of 4 paragraphs — keep it tight and punchy. This should feel personal, specific, and human — never template-generated.

PARAGRAPH TYPE: ${paragraphType}
- opening (50-75 words): Hook with a specific connection to the company. Show you know them. One vivid detail.
- body_1 (75-100 words): Your strongest qualification for this role. One specific metric.
- body_2 (75-100 words): A story that demonstrates culture fit + skills. Different from body_1.
- closing (40-60 words): Clear call to action with genuine enthusiasm. 2-3 sentences MAX.

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

  const firstBlock = response.content[0];
  const rawText = firstBlock?.type === 'text' ? firstBlock.text : '';

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

  // Sync previous_paragraphs into context accumulator
  if (previousParagraphs.length > 0) {
    const types = ['opening', 'body_1', 'body_2', 'closing'];
    previousParagraphs.forEach((p, i) => {
      const type = types[i] ?? `body_${i}`;
      const existing = ctx.coverLetterParagraphs.findIndex(pp => pp.type === type);
      if (existing >= 0) {
        ctx.coverLetterParagraphs[existing] = { type, content: p, status: 'confirmed' };
      } else {
        ctx.coverLetterParagraphs.push({ type, content: p, status: 'confirmed' });
      }
    });
  }

  // Upsert current paragraph
  const existingIdx = ctx.coverLetterParagraphs.findIndex(pp => pp.type === paragraphType);
  if (existingIdx >= 0) {
    ctx.coverLetterParagraphs[existingIdx] = { type: paragraphType, content, status: 'draft' };
  } else {
    ctx.coverLetterParagraphs.push({ type: paragraphType, content, status: 'draft' });
  }

  // Emit ALL accumulated paragraphs to right panel
  emit({
    type: 'right_panel_update',
    panel_type: 'cover_letter',
    data: {
      paragraphs: ctx.coverLetterParagraphs,
      company_name: ctx.companyResearch.company_name,
      role_title: ctx.jdAnalysis.job_title,
    },
  });

  return { paragraph_type: paragraphType, content, reasoning };
}
