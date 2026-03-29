export type InterviewLabInitialFocus =
  | 'prep'
  | 'practice'
  | 'plan'
  | 'thank-you'
  | 'negotiation'
  | 'debrief'
  | 'follow-up-email';

export type InterviewLabViewMode = 'lab' | 'generating' | 'report' | 'debrief' | 'mock_interview';
export type InterviewLabSection = 'prep' | 'practice' | 'documents' | 'follow_up';
export type InterviewLabDocumentsView = 'overview' | 'ninety_day_plan';
export type InterviewLabFollowUpView = 'overview' | 'thank_you' | 'negotiation' | 'debrief' | 'follow_up_email';

interface InterviewLabRouteState {
  activeSection: InterviewLabSection;
  documentsView: InterviewLabDocumentsView;
  followUpView: InterviewLabFollowUpView;
}

interface InterviewLabSessionTargets {
  prepSessionId?: string;
  planSessionId?: string;
  thankYouSessionId?: string;
  negotiationSessionId?: string;
}

const DEFAULT_ROUTE_STATE: InterviewLabRouteState = {
  activeSection: 'prep',
  documentsView: 'overview',
  followUpView: 'overview',
};

export function resolveInterviewLabRouteState(initialFocus?: string): InterviewLabRouteState {
  switch (initialFocus) {
    case 'plan':
      return {
        activeSection: 'documents',
        documentsView: 'ninety_day_plan',
        followUpView: 'overview',
      };
    case 'thank-you':
      return {
        activeSection: 'follow_up',
        documentsView: 'overview',
        followUpView: 'thank_you',
      };
    case 'negotiation':
      return {
        activeSection: 'follow_up',
        documentsView: 'overview',
        followUpView: 'negotiation',
      };
    case 'debrief':
      return {
        activeSection: 'follow_up',
        documentsView: 'overview',
        followUpView: 'debrief',
      };
    case 'follow-up-email':
      return {
        activeSection: 'follow_up',
        documentsView: 'overview',
        followUpView: 'follow_up_email',
      };
    case 'practice':
      return {
        activeSection: 'practice',
        documentsView: 'overview',
        followUpView: 'overview',
      };
    case 'prep':
    default:
      return DEFAULT_ROUTE_STATE;
  }
}

export function resolveInterviewLabSessionTargets(
  initialFocus?: string,
  initialAssetSessionId?: string,
): InterviewLabSessionTargets {
  if (!initialAssetSessionId) {
    return {};
  }

  switch (initialFocus) {
    case 'prep':
      return { prepSessionId: initialAssetSessionId };
    case 'plan':
      return { planSessionId: initialAssetSessionId };
    case 'thank-you':
      return { thankYouSessionId: initialAssetSessionId };
    case 'negotiation':
      return { negotiationSessionId: initialAssetSessionId };
    default:
      return {};
  }
}
