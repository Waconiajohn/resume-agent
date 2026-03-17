import type { DashboardState, WhyMeSignals, WhyMeStory } from './useWhyMeStory';

export type CareerProfileNextRoom = 'career-profile' | 'resume' | 'jobs';

export interface CareerProfileSummary {
  readinessPercent: number;
  readinessLabel: string;
  statusLine: string;
  primaryStory: string;
  strengthSnapshot: string;
  differentiationSnapshot: string;
  highlightPoints: string[];
  focusAreas: string[];
  nextRecommendedRoom: CareerProfileNextRoom;
  nextRecommendedAction: string;
}

function signalWeight(level: WhyMeSignals[keyof WhyMeSignals]): number {
  return {
    green: 100,
    yellow: 65,
    red: 20,
  }[level];
}

function clipText(text: string, maxLength = 110): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildHighlightPoints(story: WhyMeStory): string[] {
  const candidates = [
    story.colleaguesCameForWhat,
    story.knownForWhat,
    story.whyNotMe,
  ]
    .map((value) => clipText(value, 88))
    .filter(Boolean);

  return candidates.slice(0, 3);
}

export function buildCareerProfileSummary(
  story: WhyMeStory,
  signals: WhyMeSignals,
  dashboardState: DashboardState,
): CareerProfileSummary {
  const readinessPercent = Math.round(
    (signalWeight(signals.clarity) + signalWeight(signals.alignment) + signalWeight(signals.differentiation)) / 3,
  );

  const focusAreas: string[] = [];
  if (signals.clarity !== 'green') {
    focusAreas.push('Clarify the work people come to you for.');
  }
  if (signals.alignment !== 'green') {
    focusAreas.push('Tighten the statement about what you want to be known for.');
  }
  if (signals.differentiation !== 'green') {
    focusAreas.push('Strengthen the proof of why you are a better-fit candidate.');
  }

  const readyForResume = dashboardState === 'strong';
  const primaryStory = clipText(
    story.knownForWhat
      || story.colleaguesCameForWhat
      || 'Define the core story you want every tool to use on your behalf.',
    140,
  );
  const strengthSnapshot = clipText(
    story.colleaguesCameForWhat
      || 'Add a short explanation of the work people already trust you to do.',
    120,
  );
  const differentiationSnapshot = clipText(
    story.whyNotMe
      || 'Capture the adjacent experience or edge that makes you competitive.',
    120,
  );

  return {
    readinessPercent,
    readinessLabel: readyForResume ? 'Platform-ready' : dashboardState === 'refining' ? 'Needs refinement' : 'Not started',
    statusLine: readyForResume
      ? 'This profile is strong enough to guide resume, job-search, LinkedIn, and interview work.'
      : dashboardState === 'refining'
        ? 'This profile is usable, but stronger detail here will make the rest of the platform sharper.'
        : 'This profile still needs a basic story before the rest of the platform can work at full strength.',
    primaryStory,
    strengthSnapshot,
    differentiationSnapshot,
    highlightPoints: buildHighlightPoints(story),
    focusAreas,
    nextRecommendedRoom: readyForResume ? 'resume' : 'career-profile',
    nextRecommendedAction: readyForResume ? 'Open Resume Builder' : 'Finish Career Profile',
  };
}
