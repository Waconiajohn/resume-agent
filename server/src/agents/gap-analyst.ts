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
  QuestionnaireQuestion,
  QuestionnaireResponse,
} from './types.js';
import { makeQuestion } from '../lib/questionnaire-helpers.js';

/**
 * Normalize classification values from LLM output.
 * Z.AI models may return "Strong", "Strong Match", "strong_match", etc.
 */
function normalizeClassification(raw: unknown): 'strong' | 'partial' | 'gap' {
  const s = String(raw ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!s) return 'gap';

  // Evaluate negatives first so phrases like "does not meet" don't classify as partial.
  if (/\b(gap|missing|unaddressable|unmet|not met|does not meet|doesn't meet|no meaningful evidence|no match|unrelated)\b/.test(s)) {
    return 'gap';
  }
  if (/\b(partial|moderate|indirect|related|needs? strengthen(?:ing)?|needs? work|some match)\b/.test(s)) {
    return 'partial';
  }
  if (/\b(strong|excellent|exceptional|direct match|clear match|clearly meets?|fully meets?)\b/.test(s)) {
    return 'strong';
  }

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

// ─── Gap Analysis Questionnaire Helpers ──────────────────────────────

const GAP_OPTIONS = [
  { id: 'significant', label: 'Yes, significant experience', description: 'I can describe a specific achievement with results' },
  { id: 'some', label: 'Yes, some experience', description: "I've worked with this but it's not a headline skill" },
  { id: 'adjacent', label: 'Adjacent experience', description: 'I have transferable skills from a related area' },
  { id: 'none', label: 'No direct experience', description: 'This is genuinely new territory for me' },
];

const PARTIAL_OPTIONS = [
  { id: 'stronger', label: 'Yes, I have a stronger example', description: 'I can provide a more compelling proof point' },
  { id: 'covers_it', label: "What's on my resume covers it", description: 'The existing evidence is my best example' },
  { id: 'different_angle', label: 'Different angle', description: 'I can demonstrate this through a different experience' },
  { id: 'not_applicable', label: 'Not really applicable', description: "This doesn't reflect my experience accurately" },
];

/**
 * Generate evidence-probing questionnaire questions for partial/gap requirements.
 * Gaps are prioritized over partials; capped at 6 questions total.
 * Questions differ by classification — gaps ask if experience exists, partials ask
 * whether stronger evidence can be surfaced.
 */
export function generateGapQuestions(analysis: GapAnalystOutput): QuestionnaireQuestion[] {
  const gaps = analysis.requirements.filter(r => r.classification === 'gap');
  const partials = analysis.requirements.filter(r => r.classification === 'partial');

  // Prioritize gaps first, then partials, cap at 6
  const candidates = [...gaps, ...partials].slice(0, 6);

  return candidates.map((req, i) => {
    if (req.classification === 'gap') {
      return makeQuestion(
        `gap_${i}`,
        `The role requires ${req.requirement} — do you have experience with this?`,
        'single_choice',
        GAP_OPTIONS,
        {
          allow_custom: true,
          context: 'Describe a specific situation where you demonstrated this — what happened and what resulted?',
        },
      );
    } else {
      // partial
      const existingEvidence = (req.evidence ?? []).slice(0, 2).join('; ');
      return makeQuestion(
        `gap_${i}`,
        `We found some evidence for ${req.requirement} — can you strengthen it?`,
        'single_choice',
        PARTIAL_OPTIONS,
        {
          allow_custom: true,
          context: existingEvidence
            ? `Existing evidence: ${existingEvidence}`
            : undefined,
        },
      );
    }
  });
}

/**
 * Enrich gap analysis with user's evidence-probe responses.
 *
 * Reclassification rules:
 * - significant (gap)       → strong
 * - some (gap)              → partial
 * - adjacent (gap)          → partial (with custom text as evidence)
 * - none (partial)          → gap
 * - stronger (partial)      → strong
 * - covers_it (partial)     → keep current (partial)
 * - different_angle (partial) → keep partial, add custom text as evidence
 * - custom_text (any)       → append as "User-reported: [text]" to evidence
 */
export function enrichGapAnalysis(
  original: GapAnalystOutput,
  responses: QuestionnaireResponse[],
  questions: QuestionnaireQuestion[],
): GapAnalystOutput {
  const gaps = original.requirements.filter(r => r.classification === 'gap');
  const partials = original.requirements.filter(r => r.classification === 'partial');
  const candidates = [...gaps, ...partials].slice(0, 6);

  const enrichedReqs = original.requirements.map(req => {
    const candidateIdx = candidates.indexOf(req);
    if (candidateIdx === -1) return req;

    const questionId = `gap_${candidateIdx}`;
    const response = responses.find(r => r.question_id === questionId);
    if (!response || response.skipped) return req;

    const selectedId = response.selected_option_ids[0];
    const clone = { ...req, evidence: [...(req.evidence ?? [])] };

    // Always append custom text as evidence regardless of selected option
    if (response.custom_text?.trim()) {
      clone.evidence.push(`User-reported: ${response.custom_text.trim()}`);
    }

    if (req.classification === 'gap') {
      if (selectedId === 'significant') {
        clone.classification = 'strong';
      } else if (selectedId === 'some') {
        clone.classification = 'partial';
      } else if (selectedId === 'adjacent') {
        clone.classification = 'partial';
        // custom_text already added above; no further reclassification needed
      }
      // 'none' → stay as gap (no change)
    } else {
      // req.classification === 'partial'
      if (selectedId === 'stronger') {
        clone.classification = 'strong';
      } else if (selectedId === 'not_applicable') {
        clone.classification = 'gap';
      } else if (selectedId === 'different_angle') {
        // Keep partial; custom_text already added above as evidence
      }
      // 'covers_it' → keep partial (no change)
    }

    return clone;
  });

  const strong = enrichedReqs.filter(r => r.classification === 'strong').length;
  const partial = enrichedReqs.filter(r => r.classification === 'partial').length;
  const total = enrichedReqs.length;

  return {
    ...original,
    requirements: enrichedReqs,
    coverage_score: total > 0 ? Math.round(((strong + partial * 0.5) / total) * 100) : 0,
    critical_gaps: enrichedReqs
      .filter(r => r.classification === 'gap' && !r.unaddressable)
      .map(r => r.requirement),
    addressable_gaps: enrichedReqs
      .filter(r => r.classification === 'gap' && r.mitigation && !r.unaddressable)
      .map(r => `${r.requirement} → ${r.mitigation}`),
  };
}
