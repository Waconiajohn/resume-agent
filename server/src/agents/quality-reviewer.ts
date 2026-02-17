/**
 * Agent 7: Quality Reviewer
 *
 * Final gate before export. Evaluates the assembled resume across 6 quality
 * dimensions and produces a pass/revise/redesign verdict.
 *
 * Uses MODEL_MID (analytical evaluation, not creative writing).
 *
 * The 6 dimensions:
 * 1. Hiring Manager Impact (1-5, pass: 4+)
 * 2. Requirement Coverage (0-100%, pass: 80%+)
 * 3. ATS Compliance (0-100, pass: 80+)
 * 4. Authenticity (0-100, pass: 75+)
 * 5. Evidence Integrity (0-100, pass: 90+)
 * 6. Blueprint Compliance (0-100, pass: 85+)
 */

import { llm, MODEL_MID } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import type {
  QualityReviewerInput,
  QualityReviewerOutput,
  QualityScores,
  RevisionInstruction,
} from './types.js';

export async function runQualityReviewer(input: QualityReviewerInput): Promise<QualityReviewerOutput> {
  const { assembled_resume, architect_blueprint, jd_analysis, evidence_library } = input;

  const response = await llm.chat({
    model: MODEL_MID,
    max_tokens: 6144,
    system: REVIEWER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Evaluate this resume across all 6 quality dimensions.

TARGET ROLE: ${architect_blueprint.target_role}
POSITIONING ANGLE: ${architect_blueprint.positioning_angle}

ASSEMBLED RESUME:
${assembled_resume.full_text}

JD MUST-HAVES:
${jd_analysis.must_haves.map((r, i) => `${i + 1}. ${r}`).join('\n')}

JD NICE-TO-HAVES:
${jd_analysis.nice_to_haves.map((r, i) => `${i + 1}. ${r}`).join('\n')}

JD KEYWORDS:
${jd_analysis.language_keywords.join(', ')}

EVIDENCE LIBRARY (for integrity checking):
${evidence_library.map(e => `[${e.id}] ${e.situation} → ${e.action} → ${e.result} (defensible: ${e.metrics_defensible})`).join('\n')}

ARCHITECT BLUEPRINT SUMMARY:
- Summary must_include: ${architect_blueprint.summary_blueprint.must_include.join('; ')}
- Keywords to embed: ${Object.keys(architect_blueprint.keyword_map).join(', ')}
- Age protection flags: ${architect_blueprint.age_protection.flags.map(f => f.item).join('; ') || 'none'}
- Voice guidance: ${architect_blueprint.global_rules.voice}
- Section order: ${architect_blueprint.section_plan.order.join(' → ')}

Score each dimension and identify specific issues. Return ONLY valid JSON:
{
  "scores": {
    "hiring_manager_impact": 4,
    "requirement_coverage": 85,
    "ats_score": 88,
    "authenticity": 82,
    "evidence_integrity": 92,
    "blueprint_compliance": 90
  },
  "dimension_details": {
    "hiring_manager_impact": {
      "assessment": "Brief assessment of 30-second scan impression",
      "issues": ["Any specific issues"]
    },
    "requirement_coverage": {
      "covered": ["Requirements addressed"],
      "missing": ["Requirements not addressed"],
      "reframes_effective": ["Gap reframes that worked"],
      "reframes_weak": ["Gap reframes that need strengthening"]
    },
    "ats_compliance": {
      "keywords_found": ["keywords present"],
      "keywords_missing": ["keywords absent"],
      "keyword_coverage_pct": 74,
      "section_header_issues": [],
      "formatting_hazards": []
    },
    "authenticity": {
      "issues": [
        {
          "pattern": "What's wrong",
          "location": "Where in the resume",
          "fix": "How to fix it"
        }
      ],
      "authentic_phrases_used": 2,
      "authentic_phrases_available": 5
    },
    "evidence_integrity": {
      "claims_checked": 14,
      "claims_verified": 12,
      "claims_flagged": [
        {
          "claim": "The claim in the resume",
          "location": "Where it appears",
          "evidence_source": "What the evidence actually says",
          "issue": "What's wrong",
          "action": "What to do"
        }
      ]
    },
    "blueprint_compliance": {
      "deviations": [
        {
          "instruction": "What the blueprint said",
          "actual": "What the resume actually has",
          "severity": "high | medium | low"
        }
      ]
    }
  },
  "revision_instructions": [
    {
      "target_section": "experience_role_0",
      "issue": "What's wrong",
      "instruction": "Specific fix instruction",
      "priority": "high"
    }
  ]
}`,
    }],
  });

  const parsed = repairJSON<Record<string, unknown>>(response.text);
  if (!parsed) {
    // Conservative fallback: flag for revision
    return {
      decision: 'revise',
      scores: {
        hiring_manager_impact: 3,
        requirement_coverage: 0,
        ats_score: 0,
        authenticity: 0,
        evidence_integrity: 0,
        blueprint_compliance: 0,
      },
      overall_pass: false,
      revision_instructions: [{
        target_section: 'all',
        issue: 'Quality review failed to parse — manual review recommended',
        instruction: 'Review all sections for quality',
        priority: 'high',
      }],
    };
  }

  const scores = normalizeScores((parsed.scores ?? {}) as Record<string, unknown>);
  const revision_instructions = normalizeRevisionInstructions(
    (parsed.revision_instructions ?? []) as Record<string, unknown>[],
  );

  // Determine verdict based on scores
  const overall_pass = checkPassThresholds(scores);
  let decision: QualityReviewerOutput['decision'];

  if (overall_pass && revision_instructions.length === 0) {
    decision = 'approve';
  } else if (scores.requirement_coverage < 60 || scores.hiring_manager_impact <= 2) {
    decision = 'redesign';
  } else {
    decision = 'revise';
  }

  // For revise decisions, only include high and medium priority instructions
  const actionable_instructions = decision === 'revise'
    ? revision_instructions.filter(r => r.priority !== 'low')
    : revision_instructions;

  return {
    decision,
    scores,
    overall_pass,
    revision_instructions: actionable_instructions.length > 0 ? actionable_instructions : undefined,
    redesign_reason: decision === 'redesign'
      ? `Coverage ${scores.requirement_coverage}%, Impact ${scores.hiring_manager_impact}/5 — structural changes needed`
      : undefined,
  };
}

// ─── System prompt ───────────────────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are a rigorous resume quality reviewer. You evaluate resumes across 6 dimensions with specific, evidence-based scoring.

SCORING RULES:
1. Hiring Manager Impact (1-5): Would a skeptical hiring manager phone-screen this person in 30 seconds?
   - 5: Immediate yes. 4: Likely yes. 3: Maybe pile. 2: Probably not. 1: Reject.

2. Requirement Coverage (0-100%): What percentage of JD must-haves are addressed?
   - Count each must-have as addressed if there's clear evidence in the resume.
   - Effective reframes of gaps count as addressed. Weak reframes don't.

3. ATS Compliance (0-100): Will this parse correctly through ATS software?
   - Check: keyword coverage (60-80% target), standard section headers, no formatting hazards.

4. Authenticity (0-100): Does this sound human-written or AI-generated?
   - Flag: uniform sentence structure, generic buzzwords, parallel lists, missing personality.

5. Evidence Integrity (0-100): Are all claims supported by the evidence library?
   - CRITICAL: Cross-reference every quantified claim against the evidence library.
   - Flag ANY metric that doesn't match the evidence or has no evidence trail.

6. Blueprint Compliance (0-100): Did the writer follow the Architect's instructions?
   - Check: section order, required elements, age protection, keyword placements.

Be HONEST. Do not inflate scores. A score of 70 means there are real issues to fix.
For every issue, provide a SPECIFIC fix instruction with the exact location and what to change.`;

// ─── Normalization helpers ───────────────────────────────────────────

function normalizeScores(raw: Record<string, unknown>): QualityScores {
  return {
    hiring_manager_impact: clamp(Number(raw.hiring_manager_impact ?? 3), 1, 5),
    requirement_coverage: clamp(Number(raw.requirement_coverage ?? 0), 0, 100),
    ats_score: clamp(Number(raw.ats_score ?? 0), 0, 100),
    authenticity: clamp(Number(raw.authenticity ?? 0), 0, 100),
    evidence_integrity: clamp(Number(raw.evidence_integrity ?? 0), 0, 100),
    blueprint_compliance: clamp(Number(raw.blueprint_compliance ?? 0), 0, 100),
  };
}

function normalizeRevisionInstructions(raw: Record<string, unknown>[]): RevisionInstruction[] {
  return raw.map(r => ({
    target_section: String(r.target_section ?? 'unknown'),
    issue: String(r.issue ?? ''),
    instruction: String(r.instruction ?? ''),
    priority: (['high', 'medium', 'low'].includes(String(r.priority))
      ? String(r.priority)
      : 'medium') as RevisionInstruction['priority'],
  })).filter(r => r.issue && r.instruction);
}

function checkPassThresholds(scores: QualityScores): boolean {
  return (
    scores.hiring_manager_impact >= 4 &&
    scores.requirement_coverage >= 80 &&
    scores.ats_score >= 80 &&
    scores.authenticity >= 75 &&
    scores.evidence_integrity >= 90 &&
    scores.blueprint_compliance >= 85
  );
}

function clamp(value: number, min: number, max: number): number {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
