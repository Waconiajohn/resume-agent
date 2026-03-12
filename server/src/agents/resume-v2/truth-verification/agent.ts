/**
 * Agent 7: Truth Verification
 *
 * Claim-by-claim verification. Every bullet must trace to source data.
 * Flags hallucinated metrics or fabricated experience.
 *
 * Model: MODEL_MID
 */

import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import type { TruthVerificationInput, TruthVerificationOutput } from '../types.js';

const SYSTEM_PROMPT = `You are a fact-checker for executive resumes. Your job: verify that EVERY claim in this resume can be traced to the candidate's original resume or structured profile data.

For each claim (bullet point, metric, accomplishment, scope statement), determine:
- "verified" — directly stated in source data
- "plausible" — reasonable inference from source data (e.g., budget inferred from team size)
- "unverified" — cannot be confirmed from available data but not clearly fabricated
- "fabricated" — contradicts source data or has no basis whatsoever

OUTPUT FORMAT: Return valid JSON:
{
  "claims": [
    {
      "claim": "the resume text being verified",
      "section": "which resume section",
      "source_found": true,
      "source_text": "the original resume text that supports this claim",
      "confidence": "verified|plausible|unverified|fabricated",
      "note": "explanation if not verified"
    }
  ],
  "truth_score": 95,
  "flagged_items": [
    {
      "claim": "the problematic claim",
      "issue": "what's wrong",
      "recommendation": "how to fix it"
    }
  ]
}

RULES:
- Check EVERY bullet point and metric in the resume
- truth_score = (verified + plausible) / total claims × 100
- "plausible" inferences are acceptable (budget from team size, etc.) — don't flag these
- Flag anything "unverified" or "fabricated" in flagged_items
- Be strict but fair — creative positioning of REAL experience is fine, inventing experience is not`;

export async function runTruthVerification(
  input: TruthVerificationInput,
  signal?: AbortSignal,
): Promise<TruthVerificationOutput> {
  const resumeText = formatDraftForVerification(input);

  const response = await llm.chat({
    model: MODEL_MID,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `## Resume Draft to Verify\n\n${resumeText}\n\n## Original Resume (source of truth)\n\n${input.original_resume}\n\nVerify every claim in the draft against the original resume.`,
    }],
    max_tokens: 8192,
    signal,
  });

  const parsed = repairJSON<TruthVerificationOutput>(response.text);
  if (!parsed) throw new Error('Truth Verification agent returned unparseable response');
  return parsed;
}

function formatDraftForVerification(input: TruthVerificationInput): string {
  const d = input.draft;
  const parts: string[] = [
    `HEADER: ${d.header.name} | ${d.header.branded_title}`,
    `SUMMARY: ${d.executive_summary.content}`,
    `COMPETENCIES: ${d.core_competencies.join(', ')}`,
    '',
    'SELECTED ACCOMPLISHMENTS:',
    ...d.selected_accomplishments.map(a => `- ${a.content}`),
    '',
    'PROFESSIONAL EXPERIENCE:',
  ];

  for (const exp of d.professional_experience) {
    parts.push(`\n${exp.title} at ${exp.company} (${exp.start_date}–${exp.end_date})`);
    parts.push(`Scope: ${exp.scope_statement}`);
    for (const b of exp.bullets) {
      parts.push(`- ${b.text}`);
    }
  }

  return parts.join('\n');
}
