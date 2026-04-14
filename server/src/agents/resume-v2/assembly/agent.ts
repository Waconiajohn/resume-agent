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
  HiringManagerScan,
  JobIntelligenceOutput,
  ResumeBullet,
  ResumeDraftOutput,
  PositioningAssessment,
  PositioningAssessmentEntry,
} from '../types.js';
import { bulletPreservesProofDensity } from '../resume-writer/agent.js';

export function runAssembly(input: AssemblyInput): AssemblyOutput {
  const { draft, truth_verification, ats_optimization, executive_tone } = input;

  // Apply tone fixes to the draft, then enforce truth gate
  const toned_resume = applyToneFixes(draft, executive_tone.findings);
  const truth_gated_resume = applyTruthGate(toned_resume, truth_verification, input.candidate_raw_text ?? '');
  const final_resume = applyPresentationSafety(
    truth_gated_resume,
    input.job_intelligence,
    input.candidate_raw_text ?? '',
  );

  // Compute quick wins from all verification agents
  const quick_wins = computeQuickWins(input);

  // Build positioning assessment if gap analysis data is available
  const positioning_assessment = input.gap_analysis
    ? buildPositioningAssessment(input)
    : undefined;

  // Run hiring manager scan on the finalized resume
  const hiring_manager_scan = input.job_intelligence
    ? computeHiringManagerScan(final_resume, input.job_intelligence)
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
    hiring_manager_scan,
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

  const applyProtectedReplacements = (text: string): string => {
    const updated = applyReplacements(text);
    if (updated === text) return text;
    return bulletPreservesProofDensity(updated, text) ? updated : text;
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
      content: applyProtectedReplacements(a.content),
    })),
    professional_experience: draft.professional_experience.map(exp => ({
      ...exp,
      scope_statement: applyProtectedReplacements(exp.scope_statement),
      bullets: exp.bullets.map(b => ({
        ...b,
        text: applyProtectedReplacements(b.text),
      })),
    })),
  };
}

/**
 * Truth gate — demotes or flags bullets containing fabricated or unverified claims.
 *
 * Fabricated bullets (issue text contains 'unsupported', 'fabricat', 'invented', or 'no basis'):
 *   - If the bullet has evidence_found, replace its text with the evidence and mark code_red.
 *   - Otherwise, mark code_red so the user is forced to review it.
 *
 * Unverified bullets (all other flagged items):
 *   - Downgrade to confirm_fit so the user can validate before sending.
 *
 * Numeric check — any number that appears in the final resume but not in the source
 * text is flagged confirm_fit regardless of whether truth_verification caught it.
 */
function applyTruthGate(
  draft: ResumeDraftOutput,
  truthVerification: AssemblyInput['truth_verification'],
  sourceText: string,
): ResumeDraftOutput {
  const flaggedItems = truthVerification.flagged_items ?? [];
  if (flaggedItems.length === 0 && sourceText.trim().length === 0) return draft;

  const result = { ...draft };

  // Build sets of fabricated vs unverified claim texts (lowercased for matching)
  const fabricatedClaims = new Set<string>();
  const unverifiedClaims = new Set<string>();

  for (const item of flaggedItems) {
    const claimLower = item.claim?.toLowerCase().trim() ?? '';
    if (!claimLower) continue;
    const issueLower = item.issue?.toLowerCase() ?? '';
    if (
      issueLower.includes('unsupported') ||
      issueLower.includes('fabricat') ||
      issueLower.includes('invented') ||
      issueLower.includes('no basis')
    ) {
      fabricatedClaims.add(claimLower);
    } else {
      unverifiedClaims.add(claimLower);
    }
  }

  // Extract all numbers from source text for the deterministic numeric check
  const sourceNumbers = extractNumbers(sourceText);

  const applyBulletTruthGate = (bullet: ResumeBullet): ResumeBullet => {
    const bulletLower = bullet.text.toLowerCase();
    const bulletPrefix = bulletLower.slice(0, 50);

    // Fabrication check — highest severity
    const isFabricated = [...fabricatedClaims].some(
      claim => bulletLower.includes(claim) || claim.includes(bulletPrefix),
    );

    if (isFabricated) {
      if (typeof bullet.evidence_found === 'string' && bullet.evidence_found.trim().length > 10) {
        return {
          ...bullet,
          text: bullet.evidence_found.trim(),
          is_new: false,
          review_state: 'code_red',
          confidence: 'needs_validation',
        };
      }
      return { ...bullet, review_state: 'code_red', confidence: 'needs_validation' };
    }

    // Unverified claim check
    const isUnverified = [...unverifiedClaims].some(
      claim => bulletLower.includes(claim) || claim.includes(bulletPrefix),
    );

    if (isUnverified) {
      return { ...bullet, review_state: 'confirm_fit', confidence: 'partial' };
    }

    // Numeric check — any number in this bullet that doesn't appear in the source
    if (sourceNumbers.size > 0) {
      const bulletNumbers = extractNumbers(bullet.text);
      const hasUnsourcedNumber = [...bulletNumbers].some(n => !sourceNumbers.has(n));
      if (hasUnsourcedNumber && bullet.review_state !== 'code_red') {
        return { ...bullet, review_state: 'confirm_fit', confidence: 'partial' };
      }
    }

    return bullet;
  };

  // Process professional experience bullets
  if (result.professional_experience) {
    result.professional_experience = result.professional_experience.map(exp => ({
      ...exp,
      bullets: exp.bullets.map(applyBulletTruthGate),
    }));
  }

  // Process selected accomplishments
  if (result.selected_accomplishments) {
    result.selected_accomplishments = result.selected_accomplishments.map(acc => {
      const accLower = acc.content.toLowerCase();
      const accPrefix = accLower.slice(0, 50);
      const evidenceBundle = `${acc.evidence_found ?? ''} ${acc.target_evidence ?? ''}`;

      const isFabricated = [...fabricatedClaims].some(
        claim => accLower.includes(claim) || claim.includes(accPrefix),
      );
      if (isFabricated) {
        return { ...acc, review_state: 'code_red' as const, confidence: 'needs_validation' as const };
      }

      if (looksLikeSyntheticEvidence(evidenceBundle)) {
        return { ...acc, review_state: 'code_red' as const, confidence: 'needs_validation' as const };
      }

      const isUnverified = [...unverifiedClaims].some(
        claim => accLower.includes(claim) || claim.includes(accPrefix),
      );
      if (isUnverified) {
        return { ...acc, review_state: 'confirm_fit' as const, confidence: 'partial' as const };
      }

      if (sourceNumbers.size > 0) {
        const accNumbers = extractNumbers(acc.content);
        const hasUnsourcedNumber = [...accNumbers].some(n => !sourceNumbers.has(n));
        if (hasUnsourcedNumber && acc.review_state !== 'code_red') {
          return { ...acc, review_state: 'confirm_fit' as const, confidence: 'partial' as const };
        }
      }

      return acc;
    });
  }

  if (result.executive_summary?.content) {
    const summaryLower = result.executive_summary.content.toLowerCase();
    const summaryPrefix = summaryLower.slice(0, 80);
    const summaryNumbers = extractNumbers(result.executive_summary.content);
    const hasUnsourcedNumber = sourceNumbers.size > 0
      && [...summaryNumbers].some((n) => !sourceNumbers.has(n));

    const isFabricated = [...fabricatedClaims].some(
      (claim) => summaryLower.includes(claim) || claim.includes(summaryPrefix),
    );
    const isUnverified = !isFabricated && [...unverifiedClaims].some(
      (claim) => summaryLower.includes(claim) || claim.includes(summaryPrefix),
    );

    if (isFabricated) {
      result.executive_summary = {
        ...result.executive_summary,
        confidence: 'needs_validation',
        review_state: 'code_red',
        next_best_action: 'answer',
      };
    } else if (isUnverified || hasUnsourcedNumber) {
      result.executive_summary = {
        ...result.executive_summary,
        confidence: 'partial',
        review_state: 'confirm_fit',
        next_best_action: hasUnsourcedNumber ? 'quantify' : 'confirm',
      };
    }
  }

  return result;
}

function applyPresentationSafety(
  resume: ResumeDraftOutput,
  jobIntelligence: JobIntelligenceOutput | undefined,
  sourceText: string,
): ResumeDraftOutput {
  const enabledSectionIds = new Set(
    (resume.section_plan ?? [])
      .filter((item) => item.enabled)
      .map((item) => item.id),
  );
  // Keep code_red items in the resume — they will be surfaced in the coaching UI
  // where the user can confirm, edit, provide evidence, or remove them.
  // Stripping them here would discard positioning opportunities before the user
  // ever gets a chance to provide the evidence that makes them safe.
  const filteredExperience = resume.professional_experience;

  const filteredAccomplishments = resume.selected_accomplishments;
  const filteredCustomSections = (resume.custom_sections ?? []).filter((section) => (
    enabledSectionIds.has(section.id)
  ));

  const nextResume: ResumeDraftOutput = {
    ...resume,
    professional_experience: filteredExperience,
    selected_accomplishments: filteredAccomplishments,
    custom_sections: filteredCustomSections,
    header: {
      ...resume.header,
      branded_title: sanitizeBrandedTitle(resume, jobIntelligence, sourceText),
    },
  };

  if (
    nextResume.executive_summary.review_state === 'code_red'
    || summaryNeedsConservativeFallback(nextResume.executive_summary.content, sourceText)
  ) {
    nextResume.executive_summary = {
      ...nextResume.executive_summary,
      content: buildConservativeExecutiveSummary(nextResume, jobIntelligence, sourceText),
      review_state: 'confirm_fit',
      confidence: 'partial',
      next_best_action: 'confirm',
    };
  }

  return nextResume;
}

/**
 * Extract all numeric tokens from text as normalised strings.
 * Captures dollar amounts, percentages, plain integers, and decimal numbers.
 * Returns a set of raw numeric strings (e.g. "2", "2.5", "100", "1000000").
 */
function extractNumbers(text: string): Set<string> {
  const results = new Set<string>();
  // Match $-prefixed, %-suffixed, and plain integers/decimals
  const pattern = /\$?\d[\d,]*\.?\d*%?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // Normalise by stripping currency and percent symbols, removing commas
    const normalised = match[0].replace(/[$,%]/g, '').replace(/,/g, '');
    if (normalised.length > 0) results.add(normalised);
  }
  return results;
}

function looksLikeSyntheticEvidence(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('executive summary')
    || lower.includes('inferred from context')
    || lower.includes('not directly stated')
    || /\bevidence\s+\d+\b/.test(lower);
}

function sanitizeBrandedTitle(
  resume: ResumeDraftOutput,
  jobIntelligence: JobIntelligenceOutput | undefined,
  sourceText: string,
): string {
  const current = resume.header.branded_title?.trim() ?? '';
  const lower = current.toLowerCase();
  if (!current) return buildConservativeBrandedTitle(resume, jobIntelligence, sourceText);

  const soundsLikeLinkedInBranding = /\barchitect\b|\bninja\b|\bguru\b|\bvisionary\b/.test(lower);
  const overclaimsOwnership = /\bp&l\b/.test(lower) && /\bowner\b/.test(lower);
  const containsMoneyClaim = /\$\d/.test(current);

  if (soundsLikeLinkedInBranding || overclaimsOwnership || containsMoneyClaim) {
    return buildConservativeBrandedTitle(resume, jobIntelligence, sourceText);
  }

  return current;
}

function buildConservativeBrandedTitle(
  resume: ResumeDraftOutput,
  jobIntelligence: JobIntelligenceOutput | undefined,
  sourceText: string,
): string {
  const currentTitle = resume.professional_experience[0]?.title?.trim() || 'Operations Executive';
  const domain = deriveAssemblyDomain(sourceText);
  const jdFocus = jobIntelligence?.role_title?.trim();

  if (domain && jdFocus) return `${currentTitle} | ${domain} | ${jdFocus}`;
  if (domain) return `${currentTitle} | ${domain}`;
  if (jdFocus) return `${currentTitle} | ${jdFocus}`;
  return currentTitle;
}

function summaryNeedsConservativeFallback(summary: string, sourceText: string): boolean {
  const lower = summary.toLowerCase();
  const sourceLower = sourceText.toLowerCase();
  const pAndLRisk = /\bp&l\b/.test(lower)
    && (/not ultimate p&l sign-off/.test(sourceLower) || /\bbut not ultimate p&l sign-off\b/.test(sourceLower));
  const boardRisk = /\bboard(?:-level)?\b/.test(lower)
    && !(/\bboard\b/.test(sourceLower) && /\b(present|presented|report|reported|advisory)\b/.test(sourceLower));
  const hardBranding = /\bunified\b/.test(lower) && /\bp&l/.test(lower);
  return pAndLRisk || boardRisk || hardBranding;
}

function buildConservativeExecutiveSummary(
  resume: ResumeDraftOutput,
  jobIntelligence: JobIntelligenceOutput | undefined,
  sourceText: string,
): string {
  const title = resume.professional_experience[0]?.title?.trim() || 'Operations leader';
  const domain = deriveAssemblyDomain(sourceText) || 'operations leadership';
  const proofLine = pickSafestSummaryProof(resume);
  const roleTitle = jobIntelligence?.role_title?.trim();

  const sentences = [
    `${title} with deep experience in ${domain}.`,
    proofLine,
    roleTitle
      ? `Positioned for ${roleTitle} roles that value disciplined execution, plant leadership, and measurable operational improvement.`
      : '',
  ].filter(Boolean);

  return sentences.join(' ');
}

function pickSafestSummaryProof(resume: ResumeDraftOutput): string {
  const accomplishment = resume.selected_accomplishments.find((item) => (
    item.review_state !== 'code_red'
      && item.review_state !== 'confirm_fit'
      && /\d/.test(item.content)
  ));
  if (accomplishment) return ensureSentence(accomplishment.content);

  for (const exp of resume.professional_experience) {
    const bullet = exp.bullets.find((item) => (
      item.review_state !== 'code_red'
        && item.review_state !== 'confirm_fit'
        && /\d/.test(item.text)
    ));
    if (bullet) return ensureSentence(bullet.text);
  }

  return '';
}

function deriveAssemblyDomain(sourceText: string): string {
  const lower = sourceText.toLowerCase();
  if (/\bmanufacturing|plant|lean|six sigma|operations\b/.test(lower)) return 'manufacturing operations';
  if (/\bmarketing|brand|consumer\b/.test(lower)) return 'marketing leadership';
  if (/\bengineering|cloud|software|platform|infrastructure\b/.test(lower)) return 'engineering leadership';
  if (/\bsupply chain|distribution|logistics\b/.test(lower)) return 'operations and supply chain';
  return 'operations leadership';
}

function ensureSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
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
  for (const item of flaggedItems.slice(0, 5)) {
    wins.push({
      description: `Fix: ${item.issue} — ${item.recommendation}`,
      impact: 'high',
    });
  }

  // Missing must-have keywords
  const missingKeywordPreview = missingKeywords;
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
  const getCanonicalSignals = (
    primaryRequirement: unknown,
    addresses: unknown,
  ): string[] => {
    if (typeof primaryRequirement === 'string' && primaryRequirement.trim().length > 0) {
      return [primaryRequirement.trim()];
    }
    return getAddresses(addresses);
  };

  for (const req of gap_analysis.requirements) {
    // Find bullets that address this requirement
    const addressed_by: Array<{ section: string; bullet_text: string }> = [];

    for (const exp of draft.professional_experience) {
      for (const bullet of exp.bullets) {
        if (getCanonicalSignals(bullet.primary_target_requirement, bullet.addresses_requirements).some(r =>
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
      if (getCanonicalSignals(acc.primary_target_requirement, acc.addresses_requirements).some(r =>
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

  const before_score = pre_scores?.overall_fit_score ?? pre_scores?.ats_match ?? 0;
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

// ─── Hiring Manager Scan ─────────────────────────────────────────────────────

/**
 * Simulates the 5-8 second hiring manager scan.
 *
 * Pure text analysis of the finalized resume against JD signals.
 * No LLM call — deterministic, fast, runs at the end of assembly.
 *
 * Scoring rubric (each dimension 0-100, final score is weighted average):
 *   header_impact        — 20%
 *   summary_clarity      — 30%
 *   above_fold_strength  — 25%
 *   keyword_visibility   — 25%
 */
export function computeHiringManagerScan(
  resume: ResumeDraftOutput,
  jd: JobIntelligenceOutput,
): HiringManagerScan {
  const header = scoreHeaderImpact(resume, jd);
  const summary = scoreSummaryClarity(resume, jd);
  const aboveFold = scoreAboveFoldStrength(resume, jd);
  const keywords = scoreKeywordVisibility(resume, jd);

  const scan_score = Math.round(
    header.score * 0.20 +
    summary.score * 0.30 +
    aboveFold.score * 0.25 +
    keywords.score * 0.25,
  );

  const red_flags = detectRedFlags(resume, jd);
  const quick_wins = buildQuickWins(header, summary, aboveFold, keywords, red_flags);

  // A resume passes the scan if it scores >= 60 and has no high-severity red flags
  const pass = scan_score >= 60 && red_flags.length === 0;

  return {
    pass,
    scan_score,
    header_impact: header,
    summary_clarity: summary,
    above_fold_strength: aboveFold,
    keyword_visibility: keywords,
    red_flags,
    quick_wins,
  };
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

/**
 * Header Impact (2-second check).
 *
 * Checks:
 * - Branded title is present (25 pts)
 * - Branded title contains a keyword from the JD role title or core competencies (50 pts)
 * - Contact info is complete — name + email + phone (25 pts)
 */
function scoreHeaderImpact(
  resume: ResumeDraftOutput,
  jd: JobIntelligenceOutput,
): { score: number; note: string } {
  let score = 0;
  const notes: string[] = [];

  const brandedTitle = resume.header.branded_title?.trim() ?? '';
  const titleLower = brandedTitle.toLowerCase();

  if (brandedTitle.length > 0) {
    score += 25;
  } else {
    notes.push('No branded title in header');
  }

  // Check title alignment with JD role and top competencies
  const jdSignals = [
    jd.role_title,
    ...jd.core_competencies.filter(c => c.importance === 'must_have').map(c => c.competency),
    ...jd.language_keywords,
  ].map(s => s.toLowerCase());

  const titleMatches = jdSignals.filter(signal =>
    signal.split(/\s+/).some(word => word.length > 3 && titleLower.includes(word)),
  );

  if (titleMatches.length >= 2) {
    score += 50;
  } else if (titleMatches.length === 1) {
    score += 30;
    notes.push('Branded title has weak alignment with role requirements');
  } else {
    notes.push('Branded title does not reflect target role language');
  }

  // Contact completeness
  const hasName = (resume.header.name?.trim().length ?? 0) > 0;
  const hasEmail = (resume.header.email?.trim().length ?? 0) > 0;
  const hasPhone = (resume.header.phone?.trim().length ?? 0) > 0;

  if (hasName && hasEmail && hasPhone) {
    score += 25;
  } else {
    const missing: string[] = [];
    if (!hasName) missing.push('name');
    if (!hasEmail) missing.push('email');
    if (!hasPhone) missing.push('phone');
    notes.push(`Header missing: ${missing.join(', ')}`);
  }

  const note = notes.length > 0
    ? notes.join('. ')
    : 'Header is compelling and role-aligned';

  return { score: Math.min(score, 100), note };
}

/**
 * Summary Clarity (3-second check).
 *
 * Checks:
 * - Summary is present and non-trivial (>= 50 chars)
 * - First 2 sentences contain JD role title or must-have competency
 * - Summary is concise (< 600 chars — avoids wall-of-text)
 * - No generic filler phrases ("results-driven", "dynamic", "passionate about")
 */
const GENERIC_FILLER = [
  'results-driven',
  'results driven',
  'dynamic professional',
  'passionate about',
  'highly motivated',
  'team player',
  'strategic thinker',
  'thought leader',
  'leverage synergies',
  'hit the ground running',
  'go-getter',
];

function scoreSummaryClarity(
  resume: ResumeDraftOutput,
  jd: JobIntelligenceOutput,
): { score: number; note: string } {
  const summary = resume.executive_summary.content?.trim() ?? '';
  const notes: string[] = [];
  let score = 0;

  if (summary.length < 50) {
    return { score: 0, note: 'No executive summary found — a missing summary kills the scan' };
  }

  // Summary present and non-trivial
  score += 25;

  // First-two-sentences clarity: check whether they name the candidate's domain and value
  const sentences = summary.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const firstTwo = sentences.slice(0, 2).join(' ').toLowerCase();

  const mustHaveCompetencies = jd.core_competencies
    .filter(c => c.importance === 'must_have')
    .map(c => c.competency.toLowerCase());

  const roleTitleWords = jd.role_title.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const firstTwoMatchesRole = roleTitleWords.some(w => firstTwo.includes(w));
  const firstTwoMatchesCompetency = mustHaveCompetencies.some(comp =>
    comp.split(/\s+/).some(w => w.length > 3 && firstTwo.includes(w)),
  );

  if (firstTwoMatchesRole && firstTwoMatchesCompetency) {
    score += 40;
  } else if (firstTwoMatchesRole || firstTwoMatchesCompetency) {
    score += 25;
    notes.push('First two sentences could more directly signal the target role and core competencies');
  } else {
    notes.push('First two sentences do not reflect the target role or must-have competencies');
  }

  // Conciseness
  if (summary.length <= 600) {
    score += 20;
  } else {
    notes.push('Summary is too long — hiring managers stop reading after ~4 lines');
  }

  // Filler-free
  const summaryLower = summary.toLowerCase();
  const fillerFound = GENERIC_FILLER.filter(f => summaryLower.includes(f));
  if (fillerFound.length === 0) {
    score += 15;
  } else {
    notes.push(`Remove generic filler: "${fillerFound[0]}"`);
  }

  const note = notes.length > 0
    ? notes.join('. ')
    : 'Summary is clear, concise, and role-aligned';

  return { score: Math.min(score, 100), note };
}

/**
 * Above-the-Fold Strength.
 *
 * "Above the fold" = header + summary + core competencies + selected accomplishments.
 * Checks:
 * - Core competencies are present (at least 3)
 * - At least 2 competencies match JD must-have or important signals
 * - Selected accomplishments present (at least 1)
 * - At least 1 accomplishment contains a quantified metric
 */
const METRIC_PATTERN = /\b\d[\d,.]*\s*(%|x|X|\$|M|B|K|million|billion|thousand|percent|pts?|points?|basis points?)\b|\b\d{1,3}(,\d{3})+\b|\$[\d,.]+/;

function scoreAboveFoldStrength(
  resume: ResumeDraftOutput,
  jd: JobIntelligenceOutput,
): { score: number; note: string } {
  const notes: string[] = [];
  let score = 0;

  const competencies = resume.core_competencies ?? [];
  const accomplishments = resume.selected_accomplishments ?? [];

  // Core competencies presence
  if (competencies.length >= 3) {
    score += 20;
  } else if (competencies.length > 0) {
    score += 10;
    notes.push('Add more core competencies to signal breadth quickly');
  } else {
    notes.push('No core competencies section — hiring managers scan this immediately');
  }

  // Competency JD alignment
  const jdSignalWords = [
    ...jd.core_competencies.map(c => c.competency.toLowerCase()),
    ...jd.language_keywords.map(k => k.toLowerCase()),
  ];

  const competencyLowers = competencies.map(c => c.toLowerCase());
  const competencyMatches = jdSignalWords.filter(signal =>
    competencyLowers.some(comp =>
      signal.split(/\s+/).some(w => w.length > 3 && comp.includes(w)),
    ),
  );

  if (competencyMatches.length >= 3) {
    score += 30;
  } else if (competencyMatches.length >= 1) {
    score += 15;
    notes.push('Core competencies could better mirror the job description language');
  } else {
    notes.push('Core competencies do not reflect JD keywords — easy win to fix');
  }

  // Selected accomplishments presence
  if (accomplishments.length >= 1) {
    score += 20;
  } else {
    notes.push('No selected accomplishments — this section signals immediate impact');
  }

  // At least one accomplishment has a quantified metric
  const quantified = accomplishments.filter(a => METRIC_PATTERN.test(a.content));
  if (quantified.length >= 1) {
    score += 30;
  } else if (accomplishments.length > 0) {
    notes.push('Accomplishments lack quantified metrics — numbers command attention in a scan');
  }

  const note = notes.length > 0
    ? notes.join('. ')
    : 'Above-the-fold content is strong — key qualifications are immediately visible';

  return { score: Math.min(score, 100), note };
}

/**
 * Keyword Visibility.
 *
 * Simulates a quick-glance read of the first 3 bullets of the most recent role.
 * Checks:
 * - Most recent experience entry has at least 2 bullets
 * - At least 1 of those bullets contains a JD must-have keyword or competency
 * - At least 1 of those bullets contains a metric
 */
function scoreKeywordVisibility(
  resume: ResumeDraftOutput,
  jd: JobIntelligenceOutput,
): { score: number; note: string } {
  const notes: string[] = [];
  let score = 0;

  const experiences = resume.professional_experience ?? [];
  if (experiences.length === 0) {
    return { score: 0, note: 'No professional experience section found' };
  }

  const mostRecent = experiences[0];
  const topBullets = mostRecent.bullets.slice(0, 3);

  if (topBullets.length < 2) {
    notes.push('Most recent role has fewer than 2 bullets — pad it to show scope quickly');
    score += 10;
  } else {
    score += 20;
  }

  const mustHaveKeywords = [
    ...jd.core_competencies
      .filter(c => c.importance === 'must_have')
      .map(c => c.competency.toLowerCase()),
    ...jd.language_keywords.map(k => k.toLowerCase()),
  ];

  const bulletText = topBullets.map(b => b.text.toLowerCase()).join(' ');

  const keywordMatches = mustHaveKeywords.filter(kw =>
    kw.split(/\s+/).some(w => w.length > 3 && bulletText.includes(w)),
  );

  if (keywordMatches.length >= 3) {
    score += 50;
  } else if (keywordMatches.length >= 1) {
    score += 30;
    notes.push('First bullets of recent role could mirror more JD language for quick-glance recognition');
  } else {
    notes.push('First bullets of most recent role lack JD keywords — these are the most-read lines');
  }

  const topBulletsHaveMetric = topBullets.some(b => METRIC_PATTERN.test(b.text));
  if (topBulletsHaveMetric) {
    score += 30;
  } else {
    notes.push('No quantified metrics in the first 3 bullets of your recent role — add numbers to command attention');
  }

  const note = notes.length > 0
    ? notes.join('. ')
    : 'Recent experience leads with JD language and strong metrics';

  return { score: Math.min(score, 100), note };
}

// ─── Red flag detection ───────────────────────────────────────────────────────

/**
 * Detect obvious disqualifiers visible during a quick scan.
 *
 * Checks:
 * - Most recent role title is drastically different from the target (seniority mismatch)
 * - Most recent role has no bullets at all
 * - No quantified metrics anywhere in the resume (pattern-based)
 * - Missing required credentials when JD lists certifications
 * - Summary missing
 */
function detectRedFlags(
  resume: ResumeDraftOutput,
  jd: JobIntelligenceOutput,
): string[] {
  const flags: string[] = [];

  // Missing summary
  if (!resume.executive_summary.content?.trim()) {
    flags.push('No executive summary — resume opens with experience, no context for the reader');
  }

  // Most recent role has no bullets
  const mostRecent = resume.professional_experience?.[0];
  if (mostRecent && mostRecent.bullets.length === 0) {
    flags.push(`Most recent role (${mostRecent.title} at ${mostRecent.company}) has no bullet points`);
  }

  // Seniority mismatch: JD is director/vp/c_suite but recent title is junior
  const juniorSignals = ['analyst', 'associate', 'coordinator', 'assistant', 'junior', 'specialist'];
  const seniorJD = ['director', 'vp', 'vice president', 'c_suite', 'chief', 'svp', 'evp'].includes(
    jd.seniority_level.toLowerCase(),
  );
  if (seniorJD && mostRecent) {
    const recentTitleLower = mostRecent.title.toLowerCase();
    const isJuniorTitle = juniorSignals.some(s => recentTitleLower.includes(s));
    if (isJuniorTitle) {
      flags.push(`Most recent title "${mostRecent.title}" signals a junior level — likely disqualifying for a ${jd.seniority_level} role`);
    }
  }

  // No metrics anywhere in the resume
  const allBulletText = resume.professional_experience
    .flatMap(exp => exp.bullets.map(b => b.text))
    .join(' ') + resume.selected_accomplishments.map(a => a.content).join(' ');

  if (allBulletText.trim().length > 0 && !METRIC_PATTERN.test(allBulletText)) {
    flags.push('No quantified metrics found anywhere in the resume — executives are expected to show numbers');
  }

  return flags;
}

// ─── Quick wins builder ───────────────────────────────────────────────────────

/**
 * Synthesize the top 3 most impactful things to improve for scan performance.
 * Ordered by score gap: the dimension with the lowest score gets the first recommendation.
 */
function buildQuickWins(
  header: { score: number; note: string },
  summary: { score: number; note: string },
  aboveFold: { score: number; note: string },
  keywords: { score: number; note: string },
  redFlags: string[],
): string[] {
  const wins: string[] = [];

  // Any red flag is an immediate call-to-action
  if (redFlags.length > 0) {
    wins.push(`Fix disqualifier: ${redFlags[0]}`);
  }

  // Rank dimensions by score ascending — lowest score = most room to improve
  const dimensions = [
    { label: 'Header', score: header.score, note: header.note },
    { label: 'Summary', score: summary.score, note: summary.note },
    { label: 'Above-the-fold', score: aboveFold.score, note: aboveFold.note },
    { label: 'Keyword visibility', score: keywords.score, note: keywords.note },
  ].sort((a, b) => a.score - b.score);

  for (const dim of dimensions) {
    if (wins.length >= 3) break;
    // Only add a win if the score is below 80 (there's meaningful room to improve)
    if (dim.score < 80 && dim.note && !dim.note.toLowerCase().startsWith('no executive summary')) {
      wins.push(`${dim.label}: ${dim.note}`);
    }
  }

  // If everything scored well, offer a positive note
  if (wins.length === 0) {
    wins.push('Resume performs well on quick-scan — focus on tailoring keywords for each application');
  }

  return wins.slice(0, 3);
}
