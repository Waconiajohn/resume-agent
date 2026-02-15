import { queryPerplexity } from '../../lib/perplexity.js';
import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext, CompanyResearch } from '../context.js';
import { createSessionLogger } from '../../lib/logger.js';

export async function executeResearchCompany(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ research: CompanyResearch }> {
  const companyName = (input.company_name as string).slice(0, 200);
  const jobTitle = (input.job_title as string).slice(0, 200);
  const additionalContext = ((input.additional_context as string) || '').slice(0, 2000);

  const researchPrompt = `Research ${companyName} for a ${jobTitle} candidate. I need:

1. **Company Culture**: What is their internal culture like?
2. **Core Values**: What are their stated and practiced values?
3. **Recent News**: Any major recent developments (last 6 months)
4. **Language Style**: How does the company communicate?
5. **Tech Stack / Tools**: What technologies and methodologies do they use?
6. **Leadership Expectations**: For a ${jobTitle}, what leadership qualities do they emphasize?
7. **Interview Culture**: What is their hiring process like?

${additionalContext ? `Additional context: ${additionalContext}` : ''}

Be specific and factual. If you're not sure about something, say so.`;

  let researchText: string;
  try {
    researchText = await queryPerplexity([
      {
        role: 'system',
        content: 'You are a company research analyst. Return detailed, structured information about companies, focusing on culture, values, leadership style, and what they look for in senior hires.',
      },
      { role: 'user', content: researchPrompt },
    ]);
  } catch (perplexityError) {
    const log = createSessionLogger(ctx.sessionId);
    log.warn({ error: perplexityError instanceof Error ? perplexityError.message : String(perplexityError) }, 'Perplexity API unavailable, falling back to Claude');
    const fallbackResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: 'You are a company research analyst. Return detailed, structured information about companies, focusing on culture, values, leadership style, and what they look for in senior hires. Note: you are answering from training data, not live search. Flag any information that may be outdated.',
      messages: [{ role: 'user', content: researchPrompt }],
    });
    researchText = fallbackResponse.content[0].type === 'text' ? fallbackResponse.content[0].text : '';
  }

  const research: CompanyResearch = {
    company_name: companyName,
    culture: extractSection(researchText, 'Culture', 'Company Culture'),
    values: extractList(researchText, 'Values', 'Core Values'),
    recent_news: extractList(researchText, 'News', 'Recent News', 'Recent Developments'),
    language_style: extractSection(researchText, 'Language', 'Language Style', 'Communication'),
    tech_stack: extractList(researchText, 'Tech', 'Tech Stack', 'Technologies', 'Tools'),
    leadership_style: extractSection(researchText, 'Leadership', 'Leadership Expectations'),
    raw_research: researchText,
  };

  ctx.companyResearch = research;
  return { research };
}

function extractSection(text: string, ...keywords: string[]): string {
  for (const keyword of keywords) {
    const regex = new RegExp(`\\*?\\*?${keyword}[^:]*\\*?\\*?:?\\s*([\\s\\S]*?)(?=\\n\\*?\\*?\\d|\\n##|$)`, 'i');
    const match = text.match(regex);
    if (match?.[1]?.trim()) {
      return match[1].trim().replace(/^\*+|\*+$/g, '').trim();
    }
  }
  return '';
}

function extractList(text: string, ...keywords: string[]): string[] {
  const section = extractSection(text, ...keywords);
  if (!section) return [];

  return section
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length < 200);
}
