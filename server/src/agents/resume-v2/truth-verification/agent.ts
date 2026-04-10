/**
 * Agent 7: Truth Verification
 *
 * Claim-by-claim verification. Every bullet must trace to source data.
 * Flags hallucinated metrics or fabricated experience.
 *
 * Model: MODEL_PRIMARY — this is a critical guardrail; accuracy requires the
 * strongest available model, not a cost-saving mid-tier model.
 */

import { MODEL_PRIMARY } from '../../../lib/llm.js';
import { chatWithTruncationRetry } from '../../../lib/llm-retry.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { SOURCE_DISCIPLINE } from '../knowledge/resume-rules.js';
import type { TruthVerificationInput, TruthVerificationOutput } from '../types.js';
import { mapTruthVerificationOutputToEvidenceItems } from '../../../contracts/shared-evidence.js';

const JSON_OUTPUT_GUARDRAILS = `CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary, bullets, or notes outside the JSON object.
- Keep source_text and note concise; use an empty string when there is nothing useful to add.`;

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
- Be strict but fair — creative positioning of REAL experience is fine, inventing experience is not

${SOURCE_DISCIPLINE}

${JSON_OUTPUT_GUARDRAILS}`;

export async function runTruthVerification(
  input: TruthVerificationInput,
  signal?: AbortSignal,
): Promise<TruthVerificationOutput> {
  const resumeText = formatDraftForVerification(input);

  const userMessage = `## Resume Draft to Verify\n\n${resumeText}\n\n## Original Resume (source of truth)\n\n${input.original_resume}\n\nVerify every claim in the draft against the original resume. Return JSON only.`;

  try {
    const response = await chatWithTruncationRetry({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const parsed = repairJSON<TruthVerificationOutput>(response.text);
    if (parsed) return attachCanonicalEvidence(attachClaimWorkItemIds(parsed, input));

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Truth Verification: first attempt unparseable, retrying with stricter prompt',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Truth Verification: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicTruthVerification(input);
  }

  try {
    const retry = await chatWithTruncationRetry({
      model: MODEL_PRIMARY,
      system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const retryParsed = repairJSON<TruthVerificationOutput>(retry.text);
    if (retryParsed) return attachCanonicalEvidence(attachClaimWorkItemIds(retryParsed, input));

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Truth Verification: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Truth Verification: retry failed, using deterministic fallback',
    );
  }

  return buildDeterministicTruthVerification(input);
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

  if (d.earlier_career && d.earlier_career.length > 0) {
    parts.push('\nEARLIER CAREER:');
    for (const e of d.earlier_career) {
      parts.push(`- ${e.title} at ${e.company} (${e.dates})`);
    }
  }

  if (d.education.length > 0) {
    parts.push('\nEDUCATION:');
    for (const edu of d.education) {
      parts.push(`- ${edu.degree} from ${edu.institution}${edu.year ? ` (${edu.year})` : ''}`);
    }
  }

  if (d.certifications.length > 0) {
    parts.push('\nCERTIFICATIONS:');
    parts.push(d.certifications.join(', '));
  }

  return parts.join('\n');
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function buildDeterministicTruthVerification(
  input: TruthVerificationInput,
): TruthVerificationOutput {
  const sourceText = `${input.original_resume}\n${input.candidate.raw_text}`.toLowerCase();
  const claims = collectDraftClaims(input).map((item) => {
    const normalizedClaim = normalizeText(item.claim);
    const claimTokens = tokenize(normalizedClaim);
    const sourceTokens = tokenize(sourceText);
    const sharedTokens = claimTokens.filter((token) => sourceTokens.includes(token));
    const overlapScore = claimTokens.length > 0 ? sharedTokens.length / claimTokens.length : 0;
    const claimNumbers = item.claim.match(/[$]?\d[\d,]*(?:\.\d+)?\s?(?:%|million|billion|k|m)?/gi) ?? [];
    const metricsSupported = claimNumbers.length > 0
      && claimNumbers.every((metric) => sourceText.includes(metric.toLowerCase()));
    const sourceFound = metricsSupported
      || overlapScore >= 0.65
      || sourceText.includes(normalizedClaim);

    const confidence = classifyConfidence(item.claim, sourceFound, overlapScore, claimNumbers, sourceText);
    const source_text = sourceFound ? extractSupportingSourceLine(sourceText, claimTokens) : '';
    const note = confidence === 'verified'
      ? ''
      : confidence === 'plausible'
        ? 'The wording is adjacent to the source material but not fully verbatim.'
        : claimNumbers.length > 0
          ? 'The numeric or scope language is not fully supported by the available source text.'
          : 'This statement needs closer proof from the original resume before it should be trusted.';

    return {
      claim: item.claim,
      section: item.section,
      source_found: sourceFound,
      source_text,
      confidence,
      note: note || undefined,
    };
  });

  const flagged_items = claims
    .filter((claim) => claim.confidence === 'unverified' || claim.confidence === 'fabricated')
    .slice(0, 12)
    .map((claim) => ({
      claim: claim.claim,
      issue: claim.confidence === 'fabricated'
        ? 'The claim introduces unsupported numeric or scope detail.'
        : 'The claim needs stronger source support before it should stay in the resume.',
      recommendation: 'Tighten the wording to match the original resume or add direct source evidence before keeping it.',
    }));

  const trustworthyCount = claims.filter((claim) => claim.confidence === 'verified' || claim.confidence === 'plausible').length;
  const truth_score = claims.length > 0 ? Math.round((trustworthyCount / claims.length) * 100) : 100;

  return attachCanonicalEvidence({
    claims,
    truth_score,
    flagged_items,
  });
}

function attachCanonicalEvidence(output: TruthVerificationOutput): TruthVerificationOutput {
  return {
    ...output,
    evidence_items: mapTruthVerificationOutputToEvidenceItems(output.claims, {
      sourceProduct: 'resume_v2',
    }),
  };
}

function collectDraftClaims(input: TruthVerificationInput): Array<{ claim: string; section: string; work_item_id?: string }> {
  const claims: Array<{ claim: string; section: string; work_item_id?: string }> = [];
  const pushClaim = (claim: string, section: string, workItemId?: string) => {
    const trimmed = typeof claim === 'string' ? claim.trim() : '';
    if (!trimmed) return;
    claims.push({ claim: trimmed, section, work_item_id: workItemId });
  };

  pushClaim(input.draft.executive_summary.content, 'executive_summary');
  input.draft.selected_accomplishments.forEach((item) => pushClaim(item.content, 'selected_accomplishments', item.work_item_id));
  input.draft.professional_experience.forEach((experience) => {
    pushClaim(experience.scope_statement, `${experience.company} scope_statement`);
    experience.bullets.forEach((bullet) => pushClaim(bullet.text, `${experience.company} bullet`, bullet.work_item_id));
  });
  input.draft.education.forEach((education) => pushClaim(`${education.degree} ${education.institution} ${education.year ?? ''}`.trim(), 'education'));
  input.draft.certifications.forEach((certification) => pushClaim(certification, 'certifications'));

  return claims.slice(0, 40);
}

function attachClaimWorkItemIds(
  output: TruthVerificationOutput,
  input: TruthVerificationInput,
): TruthVerificationOutput {
  const draftClaims = collectDraftClaims(input);
  const byClaimAndSection = new Map(
    draftClaims.map((item) => [`${normalizeText(item.claim)}::${normalizeText(item.section)}`, item.work_item_id]),
  );
  const byClaim = new Map(
    draftClaims.map((item) => [normalizeText(item.claim), item.work_item_id]),
  );

  return {
    ...output,
    claims: output.claims.map((claim) => ({
      ...claim,
      work_item_id: claim.work_item_id
        ?? byClaimAndSection.get(`${normalizeText(claim.claim)}::${normalizeText(claim.section)}`)
        ?? byClaim.get(normalizeText(claim.claim))
        ?? undefined,
    })),
  };
}

function classifyConfidence(
  claim: string,
  sourceFound: boolean,
  overlapScore: number,
  claimNumbers: string[],
  sourceText: string,
): 'verified' | 'plausible' | 'unverified' | 'fabricated' {
  if (sourceFound) return 'verified';
  if (overlapScore >= 0.45) return 'plausible';
  if (claimNumbers.length > 0 && claimNumbers.some((metric) => !sourceText.includes(metric.toLowerCase()))) {
    return 'fabricated';
  }
  return 'unverified';
}

function extractSupportingSourceLine(sourceText: string, claimTokens: string[]): string {
  const sourceLines = sourceText.split('\n').map((line) => line.trim()).filter(Boolean);
  return sourceLines.find((line) => claimTokens.filter((token) => line.includes(token)).length >= Math.min(3, claimTokens.length)) ?? '';
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9$%.,\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'over', 'under', 'was', 'were',
  'are', 'has', 'have', 'had', 'led', 'drive', 'drove', 'built', 'build', 'managed', 'management',
  'across', 'through', 'within', 'while', 'then', 'than',
]);
