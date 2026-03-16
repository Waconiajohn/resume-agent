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
      return { text: best.bullet_text, section: best.section };
    }
  }

  // Fallback: find first bullet in resume that mentions the requirement
  const reqWords = requirement.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let bestMatch: { text: string; section: string; score: number } | null = null;

  for (const exp of resume.professional_experience) {
    const section = `Professional Experience - ${exp.company}`;
    for (const bullet of exp.bullets) {
      const bulletLower = bullet.text.toLowerCase();
      const score = reqWords.filter(w => bulletLower.includes(w)).length / Math.max(reqWords.length, 1);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { text: bullet.text, section, score };
      }
    }
  }

  if (!bestMatch && resume.professional_experience.length > 0) {
    const first = resume.professional_experience[0];
    if (first.bullets.length > 0) {
      bestMatch = {
        text: first.bullets[0].text,
        section: `Professional Experience - ${first.company}`,
        score: 0,
      };
    }
  }

  return bestMatch ? { text: bestMatch.text, section: bestMatch.section } : null;
}

/** Build edit context from requirement data for intelligent edits */
export function buildEditContext(
  requirement: string,
  evidence: string[],
  strategyPositioning?: string,
): EditContext {
  return {
    requirement,
    evidence: evidence.length > 0 ? evidence : undefined,
    strategy: strategyPositioning,
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
