import { anthropic, MODEL, extractResponseText } from '../../lib/anthropic.js';
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

## ANTI-FABRICATION RULES (CRITICAL)
- ONLY use facts, metrics, and stories that appear in the candidate's resume or interview responses below
- NEVER invent projects, initiatives, achievements, or anecdotes that aren't in the source material
- NEVER fabricate specific numbers, percentages, dollar amounts, or team sizes not provided by the candidate
- If the candidate hasn't provided a relevant story for body_2, use a genuine skill/experience and frame it around culture fit — do NOT make up a scenario
- It's better to be vague ("significant cost savings") than to fabricate a specific number ("$2.3M in savings") that the candidate never mentioned
- The candidate will be asked about everything in interviews — fabricated content will embarrass them

${companyContext ? `COMPANY CONTEXT:\n${companyContext}` : ''}

${roleContext ? `ROLE CONTEXT:\n${roleContext}` : ''}

${previousParagraphs.length > 0 ? `PREVIOUS PARAGRAPHS (maintain flow):\n${previousParagraphs.join('\n\n')}` : ''}

${instructions ? `SPECIFIC INSTRUCTIONS:\n${instructions}` : ''}

CANDIDATE CONTEXT:
${ctx.buildContextSummary()}

Return ONLY valid JSON:
{
  "content": "The paragraph text (STRICT word count: ${paragraphType === 'opening' ? '50-75' : paragraphType === 'closing' ? '40-60' : '75-100'} words)",
  "reasoning": "Why this approach was chosen and which candidate data points were used"
}`,
      },
    ],
  });

  const rawText = extractResponseText(response);

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

  // Upsert a paragraph entry by type, inserting if not found
  function upsertParagraph(type: string, paragraphContent: string, status: 'draft' | 'confirmed') {
    const idx = ctx.coverLetterParagraphs.findIndex(pp => pp.type === type);
    const entry = { type, content: paragraphContent, status };
    if (idx >= 0) {
      ctx.coverLetterParagraphs[idx] = entry;
    } else {
      ctx.coverLetterParagraphs.push(entry);
    }
  }

  // Sync previous_paragraphs into context accumulator
  const PARAGRAPH_TYPES = ['opening', 'body_1', 'body_2', 'closing'];
  for (let i = 0; i < previousParagraphs.length; i++) {
    upsertParagraph(PARAGRAPH_TYPES[i] ?? `body_${i}`, previousParagraphs[i], 'confirmed');
  }

  // Upsert current paragraph
  upsertParagraph(paragraphType, content, 'draft');

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
