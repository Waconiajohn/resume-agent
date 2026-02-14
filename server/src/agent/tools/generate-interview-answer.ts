import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeGenerateInterviewAnswer(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  question: string;
  category: string;
  why_asked: string;
  star_framework: { situation: string; task: string; action: string; result: string };
}> {
  const question = input.question as string;
  const category = (input.category as string) || 'general';
  const existingQuestions = (input.existing_questions as Array<Record<string, unknown>>) || [];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Create a STAR-format answer framework for this interview question, using the candidate's actual experience.

QUESTION: ${question}
CATEGORY: ${category}

CANDIDATE CONTEXT:
${ctx.buildContextSummary()}

COMPANY:
${ctx.companyResearch.company_name || 'Unknown'}
Culture: ${ctx.companyResearch.culture || 'Unknown'}

Create an answer framework using the candidate's REAL experience. Don't fabricate — use actual roles, projects, and metrics from their resume and interview responses.

Return ONLY valid JSON:
{
  "why_asked": "Why the interviewer asks this question — what they're really evaluating",
  "star_framework": {
    "situation": "Set the scene using a real scenario from the candidate's experience",
    "task": "What was the candidate's specific responsibility or challenge",
    "action": "What specific steps did the candidate take",
    "result": "Quantified outcome — use real numbers from their resume when possible"
  }
}`,
      },
    ],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  let whyAsked = '';
  let starFramework = { situation: '', task: '', action: '', result: '' };

  try {
    const parsed = JSON.parse(jsonText);
    whyAsked = parsed.why_asked ?? '';
    starFramework = parsed.star_framework ?? starFramework;
  } catch {
    whyAsked = 'Unable to generate framework — please try again';
  }

  // Build updated question bank for right panel
  const allQuestions = [
    ...existingQuestions.map(q => ({
      question: q.question as string,
      why_asked: q.why_asked as string,
      star_framework: q.star_framework as Record<string, string>,
    })),
    { question, why_asked: whyAsked, star_framework: starFramework },
  ];

  // Group by category
  const categories = new Map<string, typeof allQuestions>();
  for (const q of allQuestions) {
    const cat = category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(q);
  }

  emit({
    type: 'right_panel_update',
    panel_type: 'interview_prep',
    data: {
      categories: Array.from(categories.entries()).map(([cat, questions]) => ({
        category: cat,
        questions,
      })),
    },
  });

  return { question, category, why_asked: whyAsked, star_framework: starFramework };
}
