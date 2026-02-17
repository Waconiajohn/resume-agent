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

export async function executeGenerateSection(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ section: string; content: string; changes_made: string[] }> {
  const section = SECTION_ALIASES[input.section as string] ?? (input.section as string);
  const currentContent = input.current_content as string;
  const requirements = input.requirements as string[];
  const instructions = input.instructions as string;

  // Section order enforcement
  const blockMessage = checkSectionOrder(section, ctx);
  if (blockMessage) {
    return { section, content: currentContent ?? '', changes_made: [blockMessage] };
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

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    max_tokens: 4096,
    system: '',
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
  "content": "The full rewritten section content",
  "changes_made": [
    {
      "original": "Exact short snippet from CURRENT CONTENT that was changed",
      "proposed": "The replacement snippet (NOT the full section)",
      "reasoning": "Why this specific change was made and which guide rule it follows"
    }
  ]
}

CHANGE FORMAT RULES:
- Each entry in changes_made must be an object with "original", "proposed", and "reasoning".
- "original" must be a specific phrase, sentence, or bullet from CURRENT CONTENT — NOT the full section.
- "proposed" must be the replacement for that specific snippet — NOT the full section.
- Maximum 5 changes. Prioritize the highest-impact edits.
- NEVER put the full section text in individual change entries.`,
      },
    ],
  });

  const rawText = response.text;

  let content = currentContent;
  let changes: Array<{ original: string; proposed: string; reasoning: string; jd_requirements: string[] }> = [];
  let changesMade: string[] = [];

  const parsed = repairJSON<Record<string, unknown>>(rawText);
  if (parsed) {
    // Ensure content is always a plain string, never an object
    const rawContent = parsed.content ?? currentContent;
    content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

    // Parse changes_made — may be objects (new format) or strings (legacy)
    const rawChanges = Array.isArray(parsed.changes_made) ? parsed.changes_made : [];
    for (const entry of rawChanges) {
      if (typeof entry === 'object' && entry !== null && 'original' in entry) {
        const e = entry as { original?: string; proposed?: string; reasoning?: string };
        changes.push({
          original: typeof e.original === 'string' ? e.original : '',
          proposed: typeof e.proposed === 'string' ? e.proposed : '',
          reasoning: typeof e.reasoning === 'string' ? e.reasoning : '',
          jd_requirements: [],
        });
        changesMade.push(typeof e.reasoning === 'string' ? e.reasoning : 'Section edit');
      } else if (typeof entry === 'string') {
        changes.push({ original: '', proposed: '', reasoning: entry, jd_requirements: [] });
        changesMade.push(entry);
      }
    }

    if (section === 'selected_accomplishments') {
      const bulletLines = content.split('\n').filter(line => /^\s*[•\-\*]/.test(line));
      if (bulletLines.length > 6) {
        const trimmed = bulletLines.slice(0, 6);
        // Replace content keeping only first 6 bullets
        const nonBulletPrefix = content.split('\n').filter(line => !/^\s*[•\-\*]/.test(line) && line.trim()).join('\n');
        content = nonBulletPrefix ? nonBulletPrefix + '\n' + trimmed.join('\n') : trimmed.join('\n');
        changesMade.push('Trimmed selected accomplishments to 6 bullets (maximum per resume guide)');
        changes.push({ original: '', proposed: '', reasoning: 'Trimmed selected accomplishments to 6 bullets (maximum per resume guide)', jd_requirements: [] });
      }
    }
  } else {
    // If parsing still fails, use raw text but strip any JSON wrapper artifacts
    content = rawText || currentContent;
    changesMade = ['Section rewritten (raw format)'];
    changes = [{ original: '', proposed: '', reasoning: 'Section rewritten (raw format)', jd_requirements: [] }];
  }

  (ctx.tailoredSections as Record<string, unknown>)[section] = content;

  // Update section status so ordering enforcement allows the next section
  ctx.upsertSectionStatus(section, 'proposed');

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
      changes,
      proposed_content: content,
    },
  });

  // Truncate return value to avoid API tool-result size limits
  const truncatedChangesMade = changesMade.slice(0, 5).map(c => c.slice(0, 200));

  return { section, content: content.slice(0, 2000), changes_made: truncatedChangesMade };
}
