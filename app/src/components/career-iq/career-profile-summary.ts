import type {
  CareerProfileDashboardState,
  CareerProfileSignalLevel,
  CareerProfileV2,
} from '@/types/career-profile';

export interface CareerProfileStory {
  colleaguesCameForWhat: string;
  knownForWhat: string;
  whyNotMe: string;
}

export interface CareerProfileSignals {
  clarity: CareerProfileSignalLevel;
  alignment: CareerProfileSignalLevel;
  differentiation: CareerProfileSignalLevel;
}

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

function clipText(text: string, maxLength = 110): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function deriveCareerProfileStory(profile: CareerProfileV2 | null): CareerProfileStory {
  return {
    colleaguesCameForWhat: profile?.narrative.colleagues_came_for_what ?? '',
    knownForWhat: profile?.narrative.known_for_what ?? '',
    whyNotMe: profile?.narrative.why_not_me ?? '',
  };
}

export function deriveCareerProfileSignals(profile: CareerProfileV2 | null): CareerProfileSignals {
  return {
    clarity: profile?.profile_signals.clarity ?? 'red',
    alignment: profile?.profile_signals.alignment ?? 'red',
    differentiation: profile?.profile_signals.differentiation ?? 'red',
  };
}

export function deriveCareerProfileDashboardState(profile: CareerProfileV2 | null): CareerProfileDashboardState {
  return profile?.completeness.dashboard_state ?? 'new-user';
}

export function buildCareerProfileSummary(profile: CareerProfileV2 | null): CareerProfileSummary {
  const story = deriveCareerProfileStory(profile);
  const dashboardState = deriveCareerProfileDashboardState(profile);
  const readinessPercent = profile?.completeness.overall_score ?? 0;

  const focusAreas = profile?.completeness.sections
    .filter((section) => section.status !== 'ready')
    .map((section) => section.summary) ?? [];

  const primaryStory = clipText(
    story.knownForWhat
      || profile?.positioning.positioning_statement
      || profile?.profile_summary
      || 'Define the core story you want every tool to use on your behalf.',
    140,
  );

  const strengthSnapshot = clipText(
    story.colleaguesCameForWhat
      || profile?.positioning.core_strengths[0]
      || 'Add a short explanation of the work people already trust you to do.',
    120,
  );

  const differentiationSnapshot = clipText(
    story.whyNotMe
      || profile?.positioning.differentiators[0]
      || profile?.positioning.adjacent_positioning[0]
      || 'Capture the adjacent experience or edge that makes you competitive.',
    120,
  );

  const highlightPoints = [
    ...profile?.evidence_positioning_statements ?? [],
    story.colleaguesCameForWhat,
    story.knownForWhat,
    story.whyNotMe,
  ]
    .map((value) => clipText(value, 88))
    .filter(Boolean)
    .slice(0, 3);

  const readyForSearch = dashboardState === 'strong';

  return {
    readinessPercent,
    readinessLabel: readyForSearch
      ? 'Platform-ready'
      : dashboardState === 'refining'
        ? 'Needs refinement'
        : 'Not started',
    statusLine: readyForSearch
      ? 'This profile is strong enough to guide resume, job-search, LinkedIn, and interview work.'
      : dashboardState === 'refining'
        ? 'This profile is usable, but stronger detail here will make the rest of the platform sharper.'
        : 'This profile still needs a basic story before the rest of the platform can work at full strength.',
    primaryStory,
    strengthSnapshot,
    differentiationSnapshot,
    highlightPoints,
    focusAreas,
    nextRecommendedRoom: readyForSearch ? 'jobs' : 'career-profile',
    nextRecommendedAction: readyForSearch ? 'Find Jobs' : 'Finish Benchmark Profile',
  };
}
