import type { EvidenceLadderLevel } from '../types.js';

export interface DiscoveryAnswer {
  requirement: string;
  question: string;
  answer: string;
  level?: EvidenceLadderLevel;
  risk?: 'low' | 'medium' | 'high';
  recommendedFraming?: string;
  sourceSignal?: string;
}

/**
 * Discovery answers are user-provided evidence gathered after the first
 * strategy pass. Appending them to the source text lets classify/benchmark/
 * strategize/write/verify all see the same truth source on the rerun.
 */
export function appendDiscoveryAnswersToResumeText(
  resumeText: string,
  answers: ReadonlyArray<DiscoveryAnswer> | undefined,
): string {
  const cleaned = normalizeDiscoveryAnswers(answers);
  if (cleaned.length === 0) return resumeText;

  return [
    resumeText.trimEnd(),
    '',
    '---',
    'DISCOVERY ANSWERS PROVIDED BY CANDIDATE FOR THIS TAILORING RUN',
    'These notes are candidate-provided source evidence. Use only the facts stated in the answers; do not infer certifications, employers, dates, metrics, or regulated-industry experience beyond what the answer explicitly says.',
    '',
    ...cleaned.map(formatDiscoveryAnswer),
  ].join('\n');
}

function normalizeDiscoveryAnswers(
  answers: ReadonlyArray<DiscoveryAnswer> | undefined,
): DiscoveryAnswer[] {
  return (answers ?? [])
    .map((answer) => ({
      ...answer,
      requirement: answer.requirement.trim(),
      question: answer.question.trim(),
      answer: answer.answer.trim(),
      recommendedFraming: answer.recommendedFraming?.trim(),
      sourceSignal: answer.sourceSignal?.trim(),
    }))
    .filter((answer) => answer.requirement.length > 0 && answer.answer.length > 0);
}

function formatDiscoveryAnswer(answer: DiscoveryAnswer, index: number): string {
  const lines = [
    `Discovery answer ${index + 1}`,
    `Requirement: ${answer.requirement}`,
    `Question: ${answer.question || 'Candidate-provided clarification'}`,
    `Answer: ${answer.answer}`,
  ];
  if (answer.level) lines.push(`Evidence level before answer: ${answer.level}`);
  if (answer.risk) lines.push(`Original risk: ${answer.risk}`);
  if (answer.sourceSignal) lines.push(`Original source signal: ${answer.sourceSignal}`);
  if (answer.recommendedFraming) lines.push(`Original recommended framing: ${answer.recommendedFraming}`);
  lines.push('');
  return lines.join('\n');
}
