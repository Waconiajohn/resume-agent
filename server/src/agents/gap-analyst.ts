/**
 * Agent 4: Gap Analyst
 *
 * Maps every JD requirement against the user's evidence (from resume + Positioning
 * Coach) and classifies each as strong / partial / gap. For partial matches,
 * specifies how to strengthen. For gaps, proposes reframe strategies or marks
 * as unaddressable.
 *
 * Uses MODEL_MID (analytical comparison, not creative writing).
 *
 * Kept separate from Architect per user directive: "AI takes shortcuts when combined."
 * The Gap Analyst only classifies — it does NOT decide how to use the information.
 */

import { llm, MODEL_MID } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import logger from '../lib/logger.js';
import type {
  GapAnalystInput,
  GapAnalystOutput,
  RequirementMapping,
} from './types.js';

/**
 * Normalize classification values from LLM output.
 * Z.AI models may return "Strong", "Strong Match", "strong_match", etc.
 */
function normalizeClassification(raw: unknown): 'strong' | 'partial' | 'gap' {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'strong' || s.includes('strong') || s.includes('exceptional') || s.includes('excellent') || s.includes('direct')) return 'strong';
  if (s === 'partial' || s.includes('partial') || s.includes('moderate') || s.includes('related') || s.includes('meet') || s.includes('indirect') || s.includes('strengthen')) return 'partial';
  return 'gap';
}

export async function runGapAnalyst(input: GapAnalystInput): Promise<GapAnalystOutput> {
  const { parsed_resume, positioning, jd_analysis, benchmark } = input;

  // Build evidence context from resume + positioning coach output
  const resumeContext = parsed_resume.experience.slice(0, 4).map(e =>
    `${e.title} at ${e.company} (${e.start_date}–${e.end_date})\n${e.bullets.slice(0, 5).join('\n')}`
  ).join('\n\n');

  const positioningContext = [
    `Career Arc: ${positioning.career_arc.label} — ${positioning.career_arc.evidence}`,
    `Top Capabilities: ${positioning.top_capabilities.map(c => c.capability).join('; ')}`,
    `Evidence Library:\n${positioning.evidence_library.map(e =>
      `- ${e.situation} → ${e.action} → ${e.result}`
    ).join('\n')}`,
    positioning.signature_method?.name
      ? `Signature Method: ${positioning.signature_method.name} — ${positioning.signature_method.what_it_improves}`
      : '',
    `Unconscious Competence: ${positioning.unconscious_competence}`,
  ].filter(Boolean).join('\n\n');

  // All requirements to evaluate
  const allRequirements = [
    ...jd_analysis.must_haves.map(r => ({ text: r, tier: 'must_have' })),
    ...jd_analysis.nice_to_haves.map(r => ({ text: r, tier: 'nice_to_have' })),
    ...jd_analysis.implicit_requirements.map(r => ({ text: r, tier: 'implicit' })),
  ];

  const response = await llm.chat({
    model: MODEL_MID,
    max_tokens: 8192,
    system: `You are an expert resume gap analyst. Your job is to objectively assess how well a candidate's evidence matches each job requirement. Be honest — do not inflate matches. A "strong" match means clear, specific evidence exists. A "partial" match means related experience exists but needs strengthening. A "gap" means no meaningful evidence exists.

For gaps, think creatively about reframes — adjacent experience that could address the requirement if positioned correctly. But never fabricate. If there's truly no evidence, mark it as unaddressable.`,
    messages: [{
      role: 'user',
      content: `Classify this candidate's fit against every requirement.

CANDIDATE RESUME:
${resumeContext}

CANDIDATE SKILLS: ${parsed_resume.skills.join(', ')}

POSITIONING PROFILE (from interview):
${positioningContext}

BENCHMARK (ideal candidate): ${benchmark.ideal_profile}

REQUIREMENTS TO CLASSIFY:
${allRequirements.map((r, i) => `${i + 1}. [${r.tier.toUpperCase()}] ${r.text}`).join('\n')}

For EACH requirement, return:
- classification: "strong" | "partial" | "gap"
- evidence: specific proof from resume or positioning profile
- resume_location: where the evidence appears (e.g., "experience.0.bullet.3")
- positioning_source: which positioning interview question provided evidence (if any)
- strengthen: (for partial) how to make the match stronger
- mitigation: (for gap) reframe strategy using adjacent evidence, or null if unaddressable

Return ONLY valid JSON:
{
  "requirements": [
    {
      "requirement": "The requirement text",
      "classification": "strong",
      "evidence": ["Specific evidence 1", "Evidence 2"],
      "resume_location": "experience.0.bullet.2",
      "positioning_source": "best_win",
      "strengthen": null,
      "mitigation": null,
      "unaddressable": false
    }
  ],
  "strength_summary": "2-3 sentence honest assessment of overall candidate fit"
}`,
    }],
  });

  const parsed = repairJSON<Record<string, unknown>>(response.text);

  let requirements: RequirementMapping[] = [];
  let strength_summary = '';

  if (parsed?.requirements && Array.isArray(parsed.requirements)) {
    requirements = (parsed.requirements as Record<string, unknown>[]).map(r => ({
      requirement: String(r.requirement ?? ''),
      classification: normalizeClassification(r.classification ?? r.status ?? r.match),
      evidence: Array.isArray(r.evidence)
        ? (r.evidence as string[])
        : r.evidence ? [String(r.evidence)] : [],
      resume_location: r.resume_location ? String(r.resume_location) : undefined,
      positioning_source: r.positioning_source ? String(r.positioning_source) : undefined,
      strengthen: r.strengthen ? String(r.strengthen) : undefined,
      mitigation: r.mitigation ? String(r.mitigation) : undefined,
      unaddressable: Boolean(r.unaddressable),
    }));
    strength_summary = String(parsed.strength_summary ?? '');

    const strong = requirements.filter(r => r.classification === 'strong').length;
    const partial = requirements.filter(r => r.classification === 'partial').length;
    const gap = requirements.filter(r => r.classification === 'gap').length;
    logger.info({ strong, partial, gap, total: requirements.length }, 'Gap analysis classification counts');
  } else {
    // Fallback: mark all as gap
    logger.warn(
      { rawSnippet: response.text.substring(0, 500), parsedKeys: parsed ? Object.keys(parsed) : null },
      'Gap analysis JSON parse failed — falling back to all-gap',
    );
    requirements = allRequirements.map(r => ({
      requirement: r.text,
      classification: 'gap' as const,
      evidence: [],
      unaddressable: false,
    }));
    strength_summary = 'Gap analysis failed — all requirements marked as gap for safety.';
  }

  const strong = requirements.filter(r => r.classification === 'strong').length;
  const partial = requirements.filter(r => r.classification === 'partial').length;
  const gaps = requirements.filter(r => r.classification === 'gap').length;
  const total = requirements.length;

  return {
    requirements,
    coverage_score: total > 0 ? Math.round(((strong + partial * 0.5) / total) * 100) : 0,
    critical_gaps: requirements
      .filter(r => r.classification === 'gap' && !r.unaddressable)
      .map(r => r.requirement),
    addressable_gaps: requirements
      .filter(r => r.classification === 'gap' && r.mitigation && !r.unaddressable)
      .map(r => `${r.requirement} → ${r.mitigation}`),
    strength_summary,
  };
}
