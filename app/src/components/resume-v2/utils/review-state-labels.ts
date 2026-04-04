import type { V2Stage, ResumeReviewState } from '@/types/resume-v2';

/**
 * User-facing display labels for resume review states.
 * Internal state values (code_red, confirm_fit, etc.) are NEVER changed —
 * only these display labels are shown to users.
 */
export const REVIEW_STATE_DISPLAY: Record<
  ResumeReviewState,
  {
    label: string;
    meaning: string;
    colorHex: string;
    cssModifier: string;
    priority: number;
  }
> = {
  code_red: {
    label: 'Needs proof',
    meaning:
      'We wrote this bullet but couldn\u2019t find proof in your resume. Add the real experience or remove it.',
    colorHex: '#dc2626',
    cssModifier: 'code-red',
    priority: 0,
  },
  confirm_fit: {
    label: 'Verify fit',
    meaning:
      'This comes from the benchmark for this role. Confirm it honestly describes your background.',
    colorHex: '#0ea5e9',
    cssModifier: 'benchmark',
    priority: 1,
  },
  strengthen: {
    label: 'Can be sharper',
    meaning:
      'You have real experience here, but the bullet could land harder. Click to improve it.',
    colorHex: '#6366f1',
    cssModifier: 'partial',
    priority: 2,
  },
  supported: {
    label: 'Good to go',
    meaning: 'This bullet is solid. No action needed.',
    colorHex: 'var(--bullet-strengthen)',
    cssModifier: 'neutral',
    priority: 3,
  },
  supported_rewrite: {
    label: 'Good to go',
    meaning: 'This bullet is solid. No action needed.',
    colorHex: 'var(--bullet-strengthen)',
    cssModifier: 'neutral',
    priority: 3,
  },
};

/**
 * Pipeline stage labels for the 5-step user-facing progress indicator.
 */
export const PIPELINE_STAGE_LABELS = [
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'benchmark', label: 'Researching Benchmark' },
  { key: 'writing', label: 'Writing' },
  { key: 'verifying', label: 'Verifying' },
  { key: 'finishing', label: 'Finishing' },
] as const;

/** Map internal V2Stage to the 0-based index in the 5-step progress indicator. */
export function stageToProgressIndex(stage: V2Stage, isComplete: boolean): number {
  if (isComplete) return 4;
  switch (stage) {
    case 'intake':
    case 'analysis':
      return 0;
    case 'strategy':
      return 1;
    case 'writing':
      return 2;
    case 'verification':
      return 3;
    case 'assembly':
    case 'complete':
      return 4;
  }
}

/** Plain-English status message for each progress step. */
export function stageStatusMessage(stage: V2Stage, isComplete: boolean): string {
  if (isComplete) return 'Your resume is ready.';
  switch (stage) {
    case 'intake':
    case 'analysis':
      return 'Reading your resume and the role\u2026';
    case 'strategy':
      return 'Researching what the ideal candidate looks like\u2026';
    case 'writing':
      return 'Writing your resume now\u2026';
    case 'verification':
      return 'Checking every claim and polishing the tone\u2026';
    case 'assembly':
      return 'Putting the finishing touches on\u2026';
    case 'complete':
      return 'Your resume is ready.';
  }
}
