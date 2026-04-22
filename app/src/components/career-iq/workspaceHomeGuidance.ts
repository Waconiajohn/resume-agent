import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { isExposedWorkspaceRoom } from './workspaceRoomAccess';
import type { CareerIQRoom } from './Sidebar';
import type { DashboardState } from './useWhyMeStory';

interface GuidanceAction {
  label: string;
  room: CareerIQRoom;
  route?: string;
}

export interface WorkspaceHomeGuidance {
  eyebrow: string;
  title: string;
  description: string;
  mobileInsight: string;
  primary: GuidanceAction;
  secondary?: GuidanceAction;
  coachLine?: string;
}

function normalizeCoachRoom(
  recommendation?: CoachRecommendation | null,
): CareerIQRoom | null {
  if (!recommendation?.room) return null;
  return isExposedWorkspaceRoom(recommendation.room) ? recommendation.room : null;
}

export function deriveWorkspaceHomeGuidance(params: {
  dashboardState: DashboardState;
  hasResumeSessions: boolean;
  sessionCount: number;
  coachRecommendation?: CoachRecommendation | null;
}): WorkspaceHomeGuidance {
  const {
    dashboardState,
    hasResumeSessions,
    sessionCount,
    coachRecommendation = null,
  } = params;

  const coachRoom = normalizeCoachRoom(coachRecommendation);
  const coachCanLead =
    coachRoom &&
    coachRoom !== 'career-profile' &&
    coachRecommendation?.urgency !== 'when_ready';

  if (dashboardState === 'new-user') {
    return {
      eyebrow: 'Start here',
      title: 'Complete your Career Assessment',
      description:
        'Upload your resume, answer 8 interview questions, and we\'ll build your complete career profile and master resume. Every tool in the workspace reads from this.',
      mobileInsight:
        'Upload your resume and answer 8 questions to build your career profile. Every tool reads from this.',
      primary: { label: 'Start Career Assessment', room: 'career-profile', route: '/profile-setup' },
    };
  }

  if (!hasResumeSessions) {
    return {
      eyebrow: 'Next best move',
      title: 'Build the first role-specific resume for a live role',
      description:
        'Your profile is ready enough to stop starting from scratch. Turn it into a job-specific resume you can reopen later by company, role, and date.',
      mobileInsight:
        'Use your profile to build the first role-specific resume for a live role instead of waiting for the perfect job.',
      primary: { label: 'Open Resume Builder', room: 'resume' },
      secondary: { label: 'Open Job Search', room: 'jobs' },
      coachLine: coachRecommendation?.action ?? undefined,
    };
  }

  if (coachCanLead && coachRoom !== 'resume') {
    const labelByRoom: Record<CareerIQRoom, string> = {
      dashboard: 'Open Workspace Home',
      'career-profile': 'Open Career Profile',
      resume: 'Open Resume Builder',
      linkedin: 'Open LinkedIn',
      jobs: 'Open Job Search',
      networking: 'Open Network Job Search',
      interview: 'Open Interview Prep',
      learning: 'Open Learning',
      'executive-bio': 'Open Executive Bio',
    };

    return {
      eyebrow: 'Coach-backed next move',
      title: 'Move the live search forward before you polish another asset',
      description:
        'You already have saved work. The highest-value move now is to act on the live search step that is closest to creating momentum, then reopen resume work only if that step exposes a real gap.',
      mobileInsight:
        'Use the next live-search move first, then reopen resume work only if that step exposes a real gap.',
      primary: { label: labelByRoom[coachRoom], room: coachRoom },
      secondary: { label: 'Open Resume Builder', room: 'resume' },
      coachLine: coachRecommendation?.action ?? undefined,
    };
  }

  return {
    eyebrow: 'Daily workspace',
    title: 'Work the active search first, then reopen resume assets as needed',
    description: `You already have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'}. Home should point you to the active search and pipeline first, with Resume Builder available when a specific role needs tightening.`,
    mobileInsight:
      'Start with the active search and pipeline, then reopen resume assets only when a specific role needs work.',
    primary: { label: 'Open Job Search', room: 'jobs' },
    secondary: { label: 'Open Resume Builder', room: 'resume' },
    coachLine: coachRecommendation?.action ?? undefined,
  };
}
