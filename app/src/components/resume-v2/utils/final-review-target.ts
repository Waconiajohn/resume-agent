import type {
  FinalReviewConcern,
  PositioningAssessment,
  ResumeDraft,
} from '@/types/resume-v2';
import { findBulletForRequirement, tokenize } from './coaching-actions';

export interface FinalReviewTargetMatch {
  text: string;
  section: string;
  selector: string;
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
  return best ? { text: best.text, section: best.section, selector: best.selector } : null;
}

function experienceCandidates(
  resume: ResumeDraft,
  sectionHint: string,
): CandidateMatch[] {
  const normalizedSectionHint = sectionHint.trim().toLowerCase();
  const matchingExperiences = resume.professional_experience.filter((experience) => (
    normalizedSectionHint.includes(experience.company.toLowerCase())
      || normalizedSectionHint.includes(experience.title.toLowerCase())
  ));
  const experiences = matchingExperiences.length > 0 ? matchingExperiences : resume.professional_experience;

  return experiences.flatMap((experience) => {
    const experienceIndex = resume.professional_experience.indexOf(experience);
    const section = `Professional Experience - ${experience.company}`;
    const candidates: CandidateMatch[] = [];
    if (experience.scope_statement?.trim()) {
      candidates.push({
        text: experience.scope_statement,
        section,
        selector: `[data-scope-id="professional_experience-${experienceIndex}-scope"]`,
        signals: experience.scope_statement_addresses_requirements,
      });
    }
    for (const [bulletPosition, bullet] of experience.bullets.entries()) {
      if (bullet.text?.trim()) {
        const bulletIndex = experienceIndex * 100 + bulletPosition;
        candidates.push({
          text: bullet.text,
          section,
          selector: `[data-bullet-id="professional_experience-${bulletIndex}"]`,
          signals: bullet.addresses_requirements,
        });
      }
    }
    return candidates;
  });
}

function allResumeCandidates(resume: ResumeDraft): CandidateMatch[] {
  const candidates: CandidateMatch[] = [];
  const selectedAccomplishments = Array.isArray(resume.selected_accomplishments)
    ? resume.selected_accomplishments
    : [];
  const professionalExperience = Array.isArray(resume.professional_experience)
    ? resume.professional_experience
    : [];
  const coreCompetencies = Array.isArray(resume.core_competencies)
    ? resume.core_competencies
    : [];
  const earlierCareer = Array.isArray(resume.earlier_career)
    ? resume.earlier_career
    : [];
  const education = Array.isArray(resume.education)
    ? resume.education
    : [];
  const certifications = Array.isArray(resume.certifications)
    ? resume.certifications
    : [];

  if (resume.executive_summary?.content?.trim()) {
    candidates.push({
      text: resume.executive_summary.content,
      section: 'Executive Summary',
      selector: '[data-section="executive_summary"]',
      signals: resume.executive_summary.addresses_requirements,
    });
  }

  selectedAccomplishments.forEach((accomplishment, index) => {
    if (accomplishment.content?.trim()) {
      candidates.push({
        text: accomplishment.content,
        section: 'Selected Accomplishments',
        selector: `[data-bullet-id="selected_accomplishments-${index}"]`,
        signals: accomplishment.addresses_requirements,
      });
    }
  });

  candidates.push(...experienceCandidates({
    ...resume,
    professional_experience: professionalExperience,
  }, ''));

  if (coreCompetencies.length > 0) {
    candidates.push({
      text: coreCompetencies.join(', '),
      section: 'Core Competencies',
      selector: '[data-section="core_competencies"]',
    });
  }

  if (earlierCareer.length > 0) {
    candidates.push({
      text: earlierCareer.map((entry) => `${entry.title} - ${entry.company}`).join('; '),
      section: 'Earlier Career',
      selector: '[data-section="earlier_career"]',
    });
  }

  if (education.length > 0) {
    candidates.push({
      text: education.map((entry) => `${entry.degree} - ${entry.institution}`).join('; '),
      section: 'Education',
      selector: '[data-section="education"]',
    });
  }

  if (certifications.length > 0) {
    candidates.push({
      text: certifications.join(', '),
      section: 'Certifications',
      selector: '[data-section="certifications"]',
    });
  }

  return candidates;
}

function findCandidateByTextAndSection(
  resume: ResumeDraft,
  target: { text: string; section: string },
): FinalReviewTargetMatch | null {
  const match = allResumeCandidates(resume).find((candidate) => (
    candidate.section === target.section && candidate.text === target.text
  ));
  return match
    ? {
      text: match.text,
      section: match.section,
      selector: match.selector,
    }
    : null;
}

export function findResumeTargetForFinalReviewConcern(
  resume: ResumeDraft,
  concern: FinalReviewConcern,
  positioningAssessment?: PositioningAssessment | null,
): FinalReviewTargetMatch | null {
  const requirement = concern.related_requirement?.trim();
  if (requirement) {
    const mapped = findBulletForRequirement(requirement, positioningAssessment, resume);
    if (mapped) {
      const candidate = findCandidateByTextAndSection(resume, mapped);
      if (candidate) return candidate;
    }
  }

  const sectionHint = concern.target_section?.toLowerCase() ?? '';

  if (sectionHint.includes('summary')) {
    const summary = resume.executive_summary?.content?.trim();
    if (summary) {
      return {
        text: summary,
        section: 'Executive Summary',
        selector: '[data-section="executive_summary"]',
      };
    }
  }

  if (sectionHint.includes('competenc')) {
    const competencies = resume.core_competencies.join(', ').trim();
    if (competencies) {
      return {
        text: competencies,
        section: 'Core Competencies',
        selector: '[data-section="core_competencies"]',
      };
    }
  }

  if (sectionHint.includes('accomplishment')) {
    const accomplishments = resume.selected_accomplishments
      .filter((item) => item.content?.trim())
      .map((item, index) => ({
        text: item.content,
        section: 'Selected Accomplishments',
        selector: `[data-bullet-id="selected_accomplishments-${index}"]`,
        signals: item.addresses_requirements,
      }));
    const match = chooseBestCandidate(accomplishments, concern);
    if (match) return match;
  }

  if (sectionHint.includes('experience') || sectionHint) {
    const match = chooseBestCandidate(experienceCandidates(resume, sectionHint), concern);
    if (match) return match;
  }

  return chooseBestCandidate(allResumeCandidates(resume), concern);
}
