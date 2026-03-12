/**
 * Agent 10: Resume Assembly
 *
 * Deterministic agent (no LLM). Merges verification feedback into
 * the final document and computes combined scores.
 *
 * Model: None
 */

import type {
  AssemblyInput,
  AssemblyOutput,
  ResumeDraftOutput,
} from '../types.js';

export function runAssembly(input: AssemblyInput): AssemblyOutput {
  const { draft, truth_verification, ats_optimization, executive_tone } = input;

  // Apply tone fixes to the draft
  const final_resume = applyToneFixes(draft, executive_tone.findings);

  // Compute quick wins from all verification agents
  const quick_wins = computeQuickWins(input);

  return {
    final_resume,
    scores: {
      ats_match: ats_optimization.match_score,
      truth: truth_verification.truth_score,
      tone: executive_tone.tone_score,
    },
    quick_wins,
  };
}

/**
 * Apply tone audit suggestions to the resume draft.
 * Returns a new draft with fixes applied (does not mutate input).
 */
function applyToneFixes(
  draft: ResumeDraftOutput,
  findings: AssemblyInput['executive_tone']['findings'],
): ResumeDraftOutput {
  if (findings.length === 0) return draft;

  // Build a replacement map: old text → new text
  const replacements = new Map<string, string>();
  for (const f of findings) {
    if (f.suggestion && f.text) {
      replacements.set(f.text, f.suggestion);
    }
  }

  if (replacements.size === 0) return draft;

  // Apply replacements across all text fields
  const applyReplacements = (text: string): string => {
    let result = text;
    for (const [old, replacement] of replacements) {
      if (result.includes(old)) {
        result = result.replace(old, replacement);
      }
    }
    return result;
  };

  return {
    ...draft,
    executive_summary: {
      ...draft.executive_summary,
      content: applyReplacements(draft.executive_summary.content),
    },
    selected_accomplishments: draft.selected_accomplishments.map(a => ({
      ...a,
      content: applyReplacements(a.content),
    })),
    professional_experience: draft.professional_experience.map(exp => ({
      ...exp,
      scope_statement: applyReplacements(exp.scope_statement),
      bullets: exp.bullets.map(b => ({
        ...b,
        text: applyReplacements(b.text),
      })),
    })),
  };
}

/**
 * Compute the top 3 quick wins from all verification outputs.
 * Prioritize: fabricated claims > missing must_have keywords > banned phrases.
 */
function computeQuickWins(input: AssemblyInput): AssemblyOutput['quick_wins'] {
  const wins: AssemblyOutput['quick_wins'] = [];

  // Flagged truth items are highest priority
  for (const item of input.truth_verification.flagged_items.slice(0, 2)) {
    wins.push({
      description: `Fix: ${item.issue} — ${item.recommendation}`,
      impact: 'high',
    });
  }

  // Missing must-have keywords
  const missingKeywords = input.ats_optimization.keywords_missing.slice(0, 3);
  if (missingKeywords.length > 0) {
    wins.push({
      description: `Add missing keywords: ${missingKeywords.join(', ')}`,
      impact: 'medium',
    });
  }

  // Banned phrases found
  if (input.executive_tone.banned_phrases_found.length > 0) {
    wins.push({
      description: `Remove banned phrases: ${input.executive_tone.banned_phrases_found.slice(0, 3).join(', ')}`,
      impact: 'low',
    });
  }

  return wins.slice(0, 3);
}
