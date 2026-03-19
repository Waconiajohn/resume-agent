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
  PositioningAssessment,
  PositioningAssessmentEntry,
} from '../types.js';

export function runAssembly(input: AssemblyInput): AssemblyOutput {
  const { draft, truth_verification, ats_optimization, executive_tone } = input;

  // Apply tone fixes to the draft
  const final_resume = applyToneFixes(draft, executive_tone.findings);

  // Compute quick wins from all verification agents
  const quick_wins = computeQuickWins(input);

  // Build positioning assessment if gap analysis data is available
  const positioning_assessment = input.gap_analysis
    ? buildPositioningAssessment(input)
    : undefined;

  return {
    final_resume,
    scores: {
      ats_match: ats_optimization.match_score,
      truth: truth_verification.truth_score,
      tone: executive_tone.tone_score,
    },
    quick_wins,
    positioning_assessment,
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
  const safeFindings = Array.isArray(findings) ? findings : [];
  if (safeFindings.length === 0) return draft;

  // Build a replacement map: old text → new text
  const replacements = new Map<string, string>();
  for (const f of safeFindings) {
    if (f.suggestion && f.text) {
      replacements.set(f.text, f.suggestion);
    }
  }

  if (replacements.size === 0) return draft;

  // Apply replacements across all text fields — case-insensitive, replaces all occurrences
  const applyReplacements = (text: string): string => {
    let result = text;
    for (const [old, replacement] of replacements) {
      // Use a case-insensitive global regex so every occurrence is replaced
      const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, replacement);
    }
    return result;
  };

  return {
    ...draft,
    executive_summary: {
      ...draft.executive_summary,
      content: applyReplacements(draft.executive_summary.content),
    },
    core_competencies: draft.core_competencies.map(applyReplacements),
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
  const flaggedItems = Array.isArray(input.truth_verification.flagged_items) ? input.truth_verification.flagged_items : [];
  const missingKeywords = Array.isArray(input.ats_optimization.keywords_missing) ? input.ats_optimization.keywords_missing : [];
  const bannedPhrasesFound = Array.isArray(input.executive_tone.banned_phrases_found) ? input.executive_tone.banned_phrases_found : [];

  // Flagged truth items are highest priority
  for (const item of flaggedItems.slice(0, 2)) {
    wins.push({
      description: `Fix: ${item.issue} — ${item.recommendation}`,
      impact: 'high',
    });
  }

  // Missing must-have keywords
  const missingKeywordPreview = missingKeywords.slice(0, 3);
  if (missingKeywordPreview.length > 0) {
    wins.push({
      description: `Add missing keywords: ${missingKeywordPreview.join(', ')}`,
      impact: 'medium',
    });
  }

  // Banned phrases found
  if (bannedPhrasesFound.length > 0) {
    wins.push({
      description: `Remove banned phrases: ${bannedPhrasesFound.slice(0, 3).join(', ')}`,
      impact: 'low',
    });
  }

  const quickWins = wins.slice(0, 3);

  if (quickWins.length === 0) {
    quickWins.push({ description: 'Resume is well-optimized — no critical improvements needed', impact: 'low' });
  }

  return quickWins;
}

/**
 * Build a positioning assessment by cross-referencing gap analysis requirements
 * with the actual resume bullets that address them.
 */
function buildPositioningAssessment(input: AssemblyInput): PositioningAssessment {
  const { gap_analysis, draft, ats_optimization, pre_scores } = input;
  if (!gap_analysis) {
    return {
      summary: 'Positioning assessment unavailable — gap analysis data missing.',
      requirement_map: [],
      before_score: 0,
      after_score: ats_optimization.match_score,
      strategies_applied: [],
    };
  }

  const requirement_map: PositioningAssessmentEntry[] = [];
  const strategies_applied: string[] = [];
  const getAddresses = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

  for (const req of gap_analysis.requirements) {
    // Find bullets that address this requirement
    const addressed_by: Array<{ section: string; bullet_text: string }> = [];

    for (const exp of draft.professional_experience) {
      for (const bullet of exp.bullets) {
        if (getAddresses(bullet.addresses_requirements).some(r =>
          r.toLowerCase().includes(req.requirement.toLowerCase()) ||
          req.requirement.toLowerCase().includes(r.toLowerCase())
        )) {
          addressed_by.push({
            section: `${exp.title} at ${exp.company}`,
            bullet_text: bullet.text,
          });
        }
      }
    }

    // Check selected accomplishments too
    for (const acc of draft.selected_accomplishments) {
      if (getAddresses(acc.addresses_requirements).some(r =>
        r.toLowerCase().includes(req.requirement.toLowerCase()) ||
        req.requirement.toLowerCase().includes(r.toLowerCase())
      )) {
        addressed_by.push({
          section: 'Selected Accomplishments',
          bullet_text: acc.content,
        });
      }
    }

    // Determine status
    let status: 'strong' | 'repositioned' | 'gap';
    let strategy_used: string | undefined;

    if (req.classification === 'strong') {
      status = 'strong';
    } else if (req.strategy) {
      status = addressed_by.length > 0 ? 'repositioned' : 'gap';
      strategy_used = req.strategy.positioning;
      if (req.strategy.inference_rationale) {
        strategies_applied.push(`${req.requirement}: ${req.strategy.inference_rationale}`);
      } else {
        strategies_applied.push(`${req.requirement}: ${req.strategy.positioning}`);
      }
    } else {
      status = 'gap';
    }

    requirement_map.push({
      requirement: req.requirement,
      importance: req.importance,
      status,
      addressed_by,
      strategy_used,
    });
  }

  const strong_count = requirement_map.filter(r => r.status === 'strong').length;
  const repositioned_count = requirement_map.filter(r => r.status === 'repositioned').length;
  const gap_count = requirement_map.filter(r => r.status === 'gap').length;
  const total = requirement_map.length;

  const before_score = pre_scores?.ats_match ?? 0;
  const after_score = ats_optimization.match_score;

  const summary = `Your resume directly addresses ${strong_count} of ${total} key requirements. ` +
    (repositioned_count > 0 ? `For ${repositioned_count} requirement${repositioned_count > 1 ? 's' : ''} where you had partial experience, we repositioned adjacent expertise. ` : '') +
    (gap_count > 0 ? `${gap_count} requirement${gap_count > 1 ? 's' : ''} ${gap_count > 1 ? 'are' : 'is a'} genuine gap${gap_count > 1 ? 's' : ''} we've acknowledged transparently.` : 'No critical gaps remain.');

  return {
    summary,
    requirement_map,
    before_score,
    after_score,
    strategies_applied,
  };
}
