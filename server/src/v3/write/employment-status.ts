import type { Position, StructuredResume } from '../types.js';

const TRANSITION_SIGNAL =
  /\b(laid\s*off|role\s+eliminated|position\s+eliminated|restructured\s+out|impacted\s+by\s+consolidation|currently\s+seeking|seeking\s+(?:the\s+)?next|seeking\s+new|job\s+search|career\s+transition)\b/i;

const PRESENT_MARKER = /\b(present|current)\b/i;

/**
 * Classify preserves source dates literally, which is the right source-of-
 * truth behavior. Write needs one extra editorial guardrail: when the resume
 * says the latest role is "Present" but also says the candidate was laid off
 * or is currently seeking, do not emit a user-facing resume that implies
 * current employment.
 *
 * We avoid inventing a specific end month/year. "Recent" is sourced from the
 * transition note itself and gives write-position a non-null end marker so it
 * uses past tense.
 */
export function prepareResumeForWriting(resume: StructuredResume): StructuredResume {
  const transitionIndexes = findTransitionPresentRoleIndexes(resume);
  if (transitionIndexes.size === 0) return resume;

  return {
    ...resume,
    positions: resume.positions.map((position, index) =>
      transitionIndexes.has(index) ? normalizeTransitionPosition(position) : position,
    ),
  };
}

function findTransitionPresentRoleIndexes(resume: StructuredResume): Set<number> {
  const indexes = new Set<number>();
  const careerGaps = resume.careerGaps ?? [];
  const flags = resume.flags ?? [];
  const hasTransitionContext =
    careerGaps.some((gap) => TRANSITION_SIGNAL.test(gap.description)) ||
    flags.some((flag) => TRANSITION_SIGNAL.test(flag.reason));

  if (!hasTransitionContext) return indexes;

  for (const flag of flags) {
    if (!TRANSITION_SIGNAL.test(flag.reason)) continue;
    const match = /^positions\[(\d+)\]\.dates$/.exec(flag.field);
    if (!match) continue;
    const index = Number.parseInt(match[1]!, 10);
    if (isPresentPosition(resume.positions[index])) indexes.add(index);
  }

  if (indexes.size > 0) return indexes;

  const firstPresentIndex = resume.positions.findIndex(isPresentPosition);
  if (firstPresentIndex >= 0) indexes.add(firstPresentIndex);
  return indexes;
}

function isPresentPosition(position: Position | undefined): position is Position {
  if (!position) return false;
  return position.dates.end === null || PRESENT_MARKER.test(position.dates.raw);
}

function normalizeTransitionPosition(position: Position): Position {
  return {
    ...position,
    dates: {
      ...position.dates,
      end: 'recent',
      raw: normalizePresentRawDate(position.dates.raw, position.dates.start),
    },
  };
}

function normalizePresentRawDate(raw: string, start: string | null): string {
  const trimmed = raw.trim();
  if (PRESENT_MARKER.test(trimmed)) {
    return trimmed.replace(PRESENT_MARKER, 'Recent');
  }
  if (start) return `${start}-Recent`;
  return 'Recent';
}
