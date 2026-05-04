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
  /**
   * Sprint E3 — whether the user has a v3 Career Vault or any legacy
   * master resume. When true, we treat the "new-user" dashboard state
   * (empty positioning story) as "existing user who hasn't completed
   * positioning" rather than "brand-new signup." That avoids the audit
   * finding where returning users saw "Upload your resume" dominating
   * their dashboard even though they already had one.
   */
  hasMasterResume?: boolean;
}): WorkspaceHomeGuidance {
  const {
    dashboardState,
    hasResumeSessions,
    sessionCount,
    coachRecommendation = null,
    hasMasterResume = false,
  } = params;

  const coachRoom = normalizeCoachRoom(coachRecommendation);
  const coachCanLead =
    coachRoom &&
    coachRoom !== 'career-profile' &&
    coachRecommendation?.urgency !== 'when_ready';

  if (dashboardState === 'new-user') {
    if (hasMasterResume) {
      return {
        eyebrow: 'Next step',
        title: 'Sharpen why employers should pick you',
        description:
          'Your resume is loaded. Answer three positioning questions and every tool starts leaning on your strongest proof, not just your titles.',
        mobileInsight:
          'Your resume is loaded. Answer three questions to sharpen every tool.',
        primary: { label: 'Open Career Vault', room: 'career-profile' },
        secondary: { label: 'Tailor a resume', room: 'resume' },
      };
    }
    return {
      eyebrow: 'Start here',
        title: 'Complete your Career Assessment',
        description:
        'Upload your resume and LinkedIn profile, answer a few targeted questions, and we\'ll build the Career Vault every tool reads from.',
        mobileInsight:
        'Upload your resume and LinkedIn profile to build the Career Vault every tool reads from.',
      primary: { label: 'Start Career Assessment', room: 'career-profile', route: '/profile-setup' },
    };
  }

  if (!hasResumeSessions) {
    return {
      eyebrow: 'Next best move',
      title: 'Find the right jobs before you tailor the resume',
      description:
        'Your Career Vault is ready enough to aim the search. Find a real role first, then tailor the resume around that company, job description, and proof.',
      mobileInsight:
        'Find a real role first, then tailor the resume around that specific job.',
      primary: { label: 'Find Jobs', room: 'jobs' },
      secondary: { label: 'Tailor Resume', room: 'resume' },
      coachLine: coachRecommendation?.action ?? undefined,
    };
  }

  if (coachCanLead && coachRoom !== 'resume') {
    const labelByRoom: Record<CareerIQRoom, string> = {
      dashboard: 'Open Today',
      'career-profile': 'Open Career Vault',
      resume: 'Tailor Resume',
      linkedin: 'Open LinkedIn Growth',
      jobs: 'Find Jobs',
      networking: 'Open Network Job Search',
      interview: 'Open Interview & Offer',
      learning: 'Open Playbook',
      'live-webinars': 'Open Live Webinars',
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
      secondary: { label: 'Tailor Resume', room: 'resume' },
      coachLine: coachRecommendation?.action ?? undefined,
    };
  }

  return {
    eyebrow: 'Daily workspace',
    title: 'Work the active search first, then tailor as needed',
    description: `You already have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'}. Home should point you to the active search and applications first, with Tailor Resume available when a specific role needs tightening.`,
    mobileInsight:
      'Start with the active search and pipeline, then reopen resume assets only when a specific role needs work.',
    primary: { label: 'Find Jobs', room: 'jobs' },
    secondary: { label: 'Tailor Resume', room: 'resume' },
    coachLine: coachRecommendation?.action ?? undefined,
  };
}
