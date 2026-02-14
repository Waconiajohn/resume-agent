import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { SECTION_GUIDANCE, SECTION_ORDER_KEYS } from '../resume-guide.js';

export async function executeGenerateSection(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ section: string; content: string; changes_made: string[] }> {
  const section = input.section as string;
  const currentContent = input.current_content as string;
  const requirements = input.requirements as string[];
  const instructions = input.instructions as string;

  // Section order enforcement
  const selected = ctx.designChoices.find(d => d.selected);
  const effectiveOrder: string[] = selected?.section_order?.length
    ? selected.section_order
    : [...SECTION_ORDER_KEYS];

  const confirmed = new Set(
    ctx.sectionStatuses.filter(s => s.status === 'confirmed' || s.status === 'proposed').map(s => s.section)
  );
  const targetIdx = effectiveOrder.indexOf(section);
  if (targetIdx > 0) {
    const prev = effectiveOrder[targetIdx - 1];
    if (!confirmed.has(prev)) {
      return { section, content: currentContent ?? '', changes_made: [`BLOCKED: Complete "${prev}" before "${section}". Order: ${effectiveOrder.join(' → ')}`] };
    }
  }

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

    if (section === 'selected_accomplishments') {
      const bulletLines = content.split('\n').filter(line => /^\s*[•\-\*]/.test(line));
      if (bulletLines.length > 6) {
        const trimmed = bulletLines.slice(0, 6);
        // Replace content keeping only first 6 bullets
        const nonBulletPrefix = content.split('\n').filter(line => !/^\s*[•\-\*]/.test(line) && line.trim()).join('\n');
        content = nonBulletPrefix ? nonBulletPrefix + '\n' + trimmed.join('\n') : trimmed.join('\n');
        changesMade.push('Trimmed selected accomplishments to 6 bullets (maximum per resume guide)');
      }
    }
  } catch {
    // If parsing still fails, use raw text but strip any JSON wrapper artifacts
    content = rawText || currentContent;
    changesMade = ['Section rewritten (raw format)'];
  }

  if (!ctx.tailoredSections) ctx.tailoredSections = {};
  (ctx.tailoredSections as Record<string, unknown>)[section] = content;

  // Update section status so ordering enforcement allows the next section
  const existing = ctx.sectionStatuses.find(s => s.section === section);
  if (existing) {
    existing.status = 'proposed';
  } else {
    ctx.sectionStatuses.push({
      section,
      status: 'proposed',
      jd_requirements_addressed: [],
    });
  }

  emit({
    type: 'resume_update',
    section,
    content,
    change_type: 'rewrite',
  });

  // Emit section status so frontend can track progress
  emit({
    type: 'section_status',
    section,
    status: 'proposed',
    jd_requirements_addressed: [],
  });

  emit({
    type: 'right_panel_update',
    panel_type: 'live_resume',
    data: {
      active_section: section,
      changes: changesMade.map((change) => ({
        original: '',
        proposed: content,
        reasoning: change,
        jd_requirements: [],
      })),
    },
  });

  return { section, content, changes_made: changesMade };
}
