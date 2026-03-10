/**
 * Virtual Coach — Red Flag Detection Thresholds.
 * Defines when the coach should proactively reach out or adjust its approach.
 */

export interface RedFlagThreshold {
  type: string;
  days: number;
  priority: 'low' | 'medium' | 'high';
  coaching_response: string;
}

export const RED_FLAG_THRESHOLDS: RedFlagThreshold[] = [
  {
    type: 'no_login',
    days: 7,
    priority: 'medium',
    coaching_response: 'Reach out with encouragement. Ask what\'s blocking them. Offer a quick win to rebuild momentum.',
  },
  {
    type: 'stalled_pipeline',
    days: 3,
    priority: 'high',
    coaching_response: 'Check if the pipeline is stuck on a gate response. Help the client complete the pending action.',
  },
  {
    type: 'no_applications',
    days: 14,
    priority: 'medium',
    coaching_response: 'Once resume is ready, application velocity matters. 10-15 quality applications per week is the target.',
  },
  {
    type: 'no_interview_prep',
    days: 7,
    priority: 'high',
    coaching_response: 'If the client has active applications but no interview prep, they\'re unprepared. Mock interviews are urgent.',
  },
  {
    type: 'approaching_financial_deadline',
    days: 30,
    priority: 'high',
    coaching_response: 'Client in crisis or stressed segment with time pressure. Accelerate timeline, focus on highest-impact actions.',
  },
];
