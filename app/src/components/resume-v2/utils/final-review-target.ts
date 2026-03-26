import type {
  FinalReviewConcern,
  PositioningAssessment,
  ResumeDraft,
} from '@/types/resume-v2';
import { findBulletForRequirement, tokenize } from './coaching-actions';

export interface FinalReviewTargetMatch {
  text: string;
  section: string;
}

interface CandidateMatch extends FinalReviewTargetMatch {
  signals?: string[];
}

const NON_SIGNAL_TOKENS = new Set([
  'about',
  'after',
  'before',
  'detail',
  'enough',
  'explicit',
  'final',
  'for',
  'from',
  'into',
  'more',
  'needs',
  'not',
  'review',
  'resume',
  'section',
  'still',
  'that',
  'the',
  'this',
  'what',
  'with',
  'your',
  'experience',
]);

function buildConcernTokens(concern: FinalReviewConcern): string[] {
  const unique = new Set<string>();
  for (const source of [concern.related_requirement, concern.observation]) {
    if (!source) continue;
    for (const token of tokenize(source)) {
      if (token.length >= 3 && !NON_SIGNAL_TOKENS.has(token)) unique.add(token);
    }
  }
  return [...unique];
}

function scoreCandidate(candidate: CandidateMatch, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const sectionHaystack = candidate.section.toLowerCase();
  const contentHaystack = `${candidate.text} ${(candidate.signals ?? []).join(' ')}`.toLowerCase();
  return tokens.reduce((score, token) => {
    if (contentHaystack.includes(token)) return score + 2;
    if (sectionHaystack.includes(token)) return score + 1;
    return score;
  }, 0);
}

function chooseBestCandidate(
  candidates: CandidateMatch[],
  concern: FinalReviewConcern,
): FinalReviewTargetMatch | null {
  if (candidates.length === 0) return null;

  const tokens = buildConcernTokens(concern);
  if (tokens.length === 0) return candidates[0] ?? null;

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, tokens),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.score > 0 ? ranked[0].candidate : candidates[0];
  return best ? { text: best.text, section: best.section } : null;
}

function experienceCandidates(
  resume: ResumeDraft,
  sectionHint: string,
): CandidateMatch[] {
  const matchingExperiences = resume.professional_experience.filter((experience) => (
    sectionHint.includes(experience.company.toLowerCase())
      || sectionHint.includes(experience.title.toLowerCase())
  ));
  const experiences = matchingExperiences.length > 0 ? matchingExperiences : resume.professional_experience;

  return experiences.flatMap((experience) => {
    const section = `Professional Experience - ${experience.company}`;
    const candidates: CandidateMatch[] = [];
    if (experience.scope_statement?.trim()) {
      candidates.push({
        text: experience.scope_statement,
        section,
        signals: experience.scope_statement_addresses_requirements,
      });
    }
    for (const bullet of experience.bullets) {
      if (bullet.text?.trim()) {
        candidates.push({
          text: bullet.text,
          section,
          signals: bullet.addresses_requirements,
        });
      }
    }
    return candidates;
  });
}

export function findResumeTargetForFinalReviewConcern(
  resume: ResumeDraft,
  concern: FinalReviewConcern,
  positioningAssessment?: PositioningAssessment | null,
): FinalReviewTargetMatch | null {
  const requirement = concern.related_requirement?.trim();
  if (requirement) {
    const mapped = findBulletForRequirement(requirement, positioningAssessment, resume);
    if (mapped) return mapped;
  }

  const sectionHint = concern.target_section?.toLowerCase() ?? '';

  if (sectionHint.includes('summary')) {
    const summary = resume.executive_summary?.content?.trim();
    if (summary) {
      return { text: summary, section: 'Executive Summary' };
    }
  }

  if (sectionHint.includes('competenc')) {
    const competencies = resume.core_competencies.join(', ').trim();
    if (competencies) {
      return { text: competencies, section: 'Core Competencies' };
    }
  }

  if (sectionHint.includes('accomplishment')) {
    const accomplishments = resume.selected_accomplishments
      .filter((item) => item.content?.trim())
      .map((item) => ({
        text: item.content,
        section: 'Selected Accomplishments',
        signals: item.addresses_requirements,
      }));
    const match = chooseBestCandidate(accomplishments, concern);
    if (match) return match;
  }

  if (sectionHint.includes('experience') || sectionHint) {
    const match = chooseBestCandidate(experienceCandidates(resume, sectionHint), concern);
    if (match) return match;
  }

  const allCandidates: CandidateMatch[] = [];
  if (resume.executive_summary?.content?.trim()) {
    allCandidates.push({
      text: resume.executive_summary.content,
      section: 'Executive Summary',
      signals: resume.executive_summary.addresses_requirements,
    });
  }
  for (const accomplishment of resume.selected_accomplishments) {
    if (accomplishment.content?.trim()) {
      allCandidates.push({ text: accomplishment.content, section: 'Selected Accomplishments' });
    }
  }
  allCandidates.push(...experienceCandidates(resume, ''));

  return chooseBestCandidate(allCandidates, concern);
}
