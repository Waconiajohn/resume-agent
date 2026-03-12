/**
 * Agent 5: Narrative Strategy
 *
 * Generates the positioning narrative, "Why Me" story, and branded title.
 * Only chooses narratives supported by real evidence.
 *
 * The "Why Me" story quality must match the Dan Baumann example standard —
 * a compelling narrative that positions the candidate as the obvious choice.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import type { NarrativeStrategyInput, NarrativeStrategyOutput } from '../types.js';

const SYSTEM_PROMPT = `You are a master brand strategist who has positioned 500+ executives for career transitions. You create the narrative that makes a hiring manager say "this is the one" before they finish reading the first page.

Your job: take everything the analysis has revealed about this candidate and this role, and craft a POSITIONING STRATEGY that makes the candidate the benchmark everyone else is measured against.

THE "WHY ME" STORY:
This is the candidate's core narrative — the story that ties their entire career into a coherent arc that leads inevitably to this role. It should:
- Feel authentic, not manufactured
- Connect their unique combination of experiences to THIS specific role
- Make the hiring manager think "nobody else has this exact background"
- Be specific enough to be memorable, broad enough to be versatile
- Include at least one surprising connection or insight about their career

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "primary_narrative": "2-3 word positioning label (e.g., 'Enterprise Transformation Leader')",
  "supporting_themes": ["3-5 themes that reinforce the primary narrative"],
  "branded_title": "Full branded title line for the resume header — targets the role they WANT",
  "why_me_story": "Full 'Why Me' positioning story (4-6 paragraphs). This is the candidate's career narrative that explains why they are THE candidate for this role. Specific, evidence-based, compelling.",
  "why_me_concise": "2-3 sentence elevator pitch version of the Why Me story for interviews",
  "why_me_best_line": "The single most powerful verbal line — what they'd say if they had 10 seconds with the hiring manager",
  "section_guidance": {
    "summary_angle": "how to frame the executive summary given this narrative",
    "competency_themes": ["how to group/frame the core competencies"],
    "accomplishment_priorities": ["which accomplishments to feature and why"],
    "experience_framing": {
      "Company Name": "how to frame this role given the narrative"
    }
  }
}

RULES:
- primary_narrative: 2-3 words that capture their positioning. Not generic ("Strong Leader") — specific ("Cloud-First Operations Architect").
- branded_title: goes on the resume header. Format: "Primary Narrative | Domain | Scale Indicator". Example: "Enterprise Transformation Leader | Cloud & Digital Strategy | P&L Ownership to $50M"
- why_me_story: MUST be supported by real evidence from the gap analysis and candidate profile. No fabrication. Every claim traces to data.
- section_guidance: tactical instructions for the Resume Writer agent on how to frame each section to reinforce the narrative.
- experience_framing: for each recent role, explain how to position it within the narrative arc.
- Only choose narratives the candidate can actually defend. If they're a support operations leader, don't brand them as a revenue architect (unless the gap analysis found genuine revenue evidence).`;

export async function runNarrativeStrategy(
  input: NarrativeStrategyInput,
  signal?: AbortSignal,
): Promise<NarrativeStrategyOutput> {
  const userMessage = buildUserMessage(input);

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 8192,
    signal,
  });

  const parsed = repairJSON<NarrativeStrategyOutput>(response.text);
  if (!parsed) throw new Error('Narrative Strategy agent returned unparseable response');
  return parsed;
}

function buildUserMessage(input: NarrativeStrategyInput): string {
  const parts: string[] = [
    '## Role Target',
    `${input.job_intelligence.role_title} at ${input.job_intelligence.company_name}`,
    `Industry: ${input.job_intelligence.industry}`,
    `Seniority: ${input.job_intelligence.seniority_level}`,
    '',
    '## Candidate Profile',
    `Name: ${input.candidate.contact.name}`,
    `Career themes: ${input.candidate.career_themes.join(', ')}`,
    `Leadership scope: ${input.candidate.leadership_scope}`,
    `Operational scale: ${input.candidate.operational_scale}`,
    `Career span: ${input.candidate.career_span_years} years`,
    '',
    'Key outcomes:',
    ...input.candidate.quantified_outcomes.slice(0, 10).map(
      o => `- [${o.metric_type}] ${o.outcome}: ${o.value}`
    ),
    '',
    'Recent experience:',
    ...input.candidate.experience.slice(0, 5).map(
      e => `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date}): ${e.bullets.slice(0, 3).join('; ')}`
    ),
    '',
    '## Gap Analysis Results',
    `Coverage score: ${input.gap_analysis.coverage_score}%`,
    `Strength summary: ${input.gap_analysis.strength_summary}`,
    '',
    'Strong matches:',
    ...input.gap_analysis.requirements
      .filter(r => r.classification === 'strong')
      .map(r => `- ${r.requirement}: ${r.evidence.join('; ')}`),
    '',
    'Partial matches (with strategies):',
    ...input.gap_analysis.requirements
      .filter(r => r.classification === 'partial' && r.strategy)
      .map(r => `- ${r.requirement}: ${r.strategy!.positioning}`),
  ];

  if (input.approved_strategies.length > 0) {
    parts.push(
      '',
      '## User-Approved Positioning Strategies',
      '(The candidate has confirmed they can defend these)',
      ...input.approved_strategies.map(
        s => `- ${s.requirement}: ${s.strategy.positioning}${s.strategy.inferred_metric ? ` (${s.strategy.inferred_metric})` : ''}`
      ),
    );
  }

  if (input.gap_analysis.critical_gaps.length > 0) {
    parts.push(
      '',
      '## Critical Gaps (cannot be addressed)',
      ...input.gap_analysis.critical_gaps.map(g => `- ${g}`),
    );
  }

  parts.push(
    '',
    'Craft a positioning strategy that makes this candidate the benchmark for this role. Every narrative choice must be supported by the evidence above.',
  );

  return parts.join('\n');
}
