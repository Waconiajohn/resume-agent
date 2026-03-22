/**
 * Shared utilities for coaching actions across UnifiedGapAnalysisCard
 * and RequirementsChecklistPanel.
 */
import type {
  BenchmarkCandidate,
  GapCoachingCard,
  PositioningAssessment,
  ResumeDraft,
} from '@/types/resume-v2';
import type { EditContext } from '@/hooks/useInlineEdit';
import { evidenceLooksDirectForRequirement } from '@/lib/requirement-evidence';

/** Tokenize a string into lowercase words (strips punctuation) */
export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

/** Normalize requirement strings for lookup matching (trim, lowercase, strip trailing punctuation) */
export function normalizeRequirement(s: string): string {
  return s.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

/** Find benchmark context by matching requirement to expected achievements via token overlap */
export function findBenchmarkContext(
  requirement: string,
  expectedAchievements: BenchmarkCandidate['expected_achievements'],
): string | null {
  const needleTokens = tokenize(requirement);
  const match = expectedAchievements.find((a) => {
    const areaTokens = tokenize(a.area);
    const overlap = areaTokens.filter((t) => needleTokens.includes(t)).length;
    return overlap >= 2 || a.area.toLowerCase() === requirement.toLowerCase();
  });
  return match ? match.description : null;
}

/**
 * Find the bullet that addresses a requirement using the positioning assessment.
 * Falls back to word-overlap matching only if positioning assessment is unavailable.
 */
export function findBulletForRequirement(
  requirement: string,
  positioningAssessment: PositioningAssessment | null | undefined,
  resume: ResumeDraft,
): { text: string; section: string } | null {
  // Use positioning assessment when available (authoritative mapping from Assembly agent)
  if (positioningAssessment?.requirement_map) {
    const reqLower = requirement.toLowerCase();
    const entry = positioningAssessment.requirement_map.find(
      r => r.requirement.toLowerCase() === reqLower ||
           r.requirement.toLowerCase().includes(reqLower) ||
           reqLower.includes(r.requirement.toLowerCase()),
    );
    if (entry?.addressed_by && entry.addressed_by.length > 0) {
      const best = entry.addressed_by[0];
      if (!evidenceLooksDirectForRequirement(requirement, best.bullet_text)) {
        return null;
      }
      return { text: best.bullet_text, section: best.section };
    }
  }

  const normalizedRequirement = normalizeRequirement(requirement);
  const exactMatch = (requirements: string[] | undefined) => (
    (requirements ?? []).some((item) => normalizeRequirement(item) === normalizedRequirement)
  );

  if (exactMatch(resume.executive_summary.addresses_requirements)) {
    if (evidenceLooksDirectForRequirement(requirement, resume.executive_summary.content)) {
      return {
        text: resume.executive_summary.content,
        section: 'Executive Summary',
      };
    }
  }

  for (const accomplishment of resume.selected_accomplishments) {
    if (exactMatch(accomplishment.addresses_requirements)) {
      if (evidenceLooksDirectForRequirement(requirement, accomplishment.content)) {
        return {
          text: accomplishment.content,
          section: 'Selected Accomplishments',
        };
      }
    }
  }

  for (const exp of resume.professional_experience) {
    const section = `Professional Experience - ${exp.company}`;
    if (exactMatch(exp.scope_statement_addresses_requirements)) {
      if (evidenceLooksDirectForRequirement(requirement, exp.scope_statement)) {
        return { text: exp.scope_statement, section };
      }
    }
    for (const bullet of exp.bullets) {
      if (exactMatch(bullet.addresses_requirements)) {
        if (evidenceLooksDirectForRequirement(requirement, bullet.text)) {
          return { text: bullet.text, section };
        }
      }
    }
  }

  // Fallback: search for meaningful overlap across the actual resume sections,
  // but do not force the edit into a random first bullet when the match is weak.
  const reqWords = requirement.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const candidates: Array<{ text: string; section: string }> = [
    { text: resume.executive_summary.content, section: 'Executive Summary' },
  ];

  for (const accomplishment of resume.selected_accomplishments) {
    candidates.push({ text: accomplishment.content, section: 'Selected Accomplishments' });
  }

  for (const exp of resume.professional_experience) {
    const section = `Professional Experience - ${exp.company}`;
    candidates.push({ text: exp.scope_statement, section });
    for (const bullet of exp.bullets) {
      candidates.push({ text: bullet.text, section });
    }
  }

  const rankedCandidates = candidates
    .map((candidate) => {
      const textLower = candidate.text.toLowerCase();
      const overlapCount = reqWords.filter(w => textLower.includes(w)).length;
      return {
        ...candidate,
        overlapCount,
        score: overlapCount / Math.max(reqWords.length, 1),
      };
    })
    .filter((candidate) => (
      (candidate.overlapCount >= 2 || candidate.score >= 0.4)
      && evidenceLooksDirectForRequirement(requirement, candidate.text)
    ))
    .sort((left, right) => right.score - left.score);

  const bestMatch = rankedCandidates[0];
  return bestMatch ? { text: bestMatch.text, section: bestMatch.section } : null;
}

/** Build edit context from requirement data for intelligent edits */
export function buildEditContext(
  requirement: string,
  evidence: string[],
  strategyPositioning?: string,
  overrides?: Partial<EditContext>,
): EditContext {
  return {
    requirement,
    evidence: evidence.length > 0 ? evidence : undefined,
    strategy: strategyPositioning,
    ...overrides,
  };
}

/** Build a Map from normalized requirement → { card, index } for fast coaching lookup */
export function buildCoachingLookup(
  gapCoachingCards: GapCoachingCard[] | null,
): Map<string, { card: GapCoachingCard; index: number }> {
  const map = new Map<string, { card: GapCoachingCard; index: number }>();
  if (!gapCoachingCards) return map;
  gapCoachingCards.forEach((card, index) => {
    map.set(normalizeRequirement(card.requirement), { card, index });
  });
  return map;
}
