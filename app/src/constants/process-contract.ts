import type { WorkflowNodeKey } from '@/types/workflow';

export type ProcessStepKey =
  | 'intake'
  | 'research'
  | 'positioning'
  | 'gap_analysis'
  | 'architect'
  | 'section_writing'
  | 'quality_review';

export interface ProcessStepContract {
  key: ProcessStepKey;
  number: number;
  title: string;
  summary: string;
  systemDoes: string;
  userDoes: string;
  next: string;
  victoryMessage?: string;
}

export const PROCESS_STEP_CONTRACTS: Record<ProcessStepKey, ProcessStepContract> = {
  intake: {
    key: 'intake',
    number: 1,
    title: 'Reading Your Resume',
    summary: "We're reading your resume to understand your experience, skills, and strengths.",
    systemDoes: 'We read your resume and organize your experience, skills, and accomplishments.',
    userDoes: 'Take a quick look at what we found. Let us know if anything important is missing.',
    next: "Next, we'll study the job posting to understand what they're looking for.",
    victoryMessage: "Got it! We've read your resume and found some great material to work with.",
  },
  research: {
    key: 'research',
    number: 2,
    title: 'Studying the Role',
    summary: "We're studying the job posting and researching what this company is looking for.",
    systemDoes: 'We analyze the job description to understand the requirements, keywords, and what the ideal candidate looks like.',
    userDoes: "Take a look at what we found. If something seems off, let us know.",
    next: "Next, we'll ask you a few questions to strengthen your positioning.",
    victoryMessage: "We've studied the role. Now we know exactly what they're looking for.",
  },
  positioning: {
    key: 'positioning',
    number: 3,
    title: 'Strengthening Your Story',
    summary: "Let's capture your strongest achievements and experiences for this specific role.",
    systemDoes: 'We ask targeted questions to surface your most impressive accomplishments and leadership experience.',
    userDoes: 'Answer the questions with specific examples from your career. The suggestions are just a starting point.',
    next: "Next, we'll check how your experience matches what they need.",
    victoryMessage: "Wonderful. You've given us powerful material to work with.",
  },
  gap_analysis: {
    key: 'gap_analysis',
    number: 4,
    title: 'Matching Your Experience',
    summary: "We're comparing your experience to what the role requires to find the best positioning angles.",
    systemDoes: 'We compare your experience to the job requirements and identify your strongest matches.',
    userDoes: 'Answer a few follow-up questions if we need more detail in specific areas.',
    next: "Next, we'll plan the best structure for your resume.",
    victoryMessage: "We've mapped your experience to the role. You're a stronger fit than you might think.",
  },
  architect: {
    key: 'architect',
    number: 5,
    title: 'Planning Your Resume',
    summary: "We're designing the best structure and approach for your resume.",
    systemDoes: 'We plan which sections to include, how to order them, and the best positioning angle.',
    userDoes: 'Review the plan if prompted, then approve so we can start writing.',
    next: "Next, we'll write each section of your resume.",
    victoryMessage: "Great plan in place. Now let's bring it to life.",
  },
  section_writing: {
    key: 'section_writing',
    number: 6,
    title: 'Writing Your Resume',
    summary: "We're writing each section of your resume, starting with the most important ones.",
    systemDoes: 'We write each section and review it for quality before showing it to you.',
    userDoes: "Read each section. If it looks right, approve it. If you'd like changes, let us know.",
    next: "Once you've approved the key sections, we'll do a final quality check.",
    victoryMessage: 'Your resume is taking shape beautifully.',
  },
  quality_review: {
    key: 'quality_review',
    number: 7,
    title: 'Final Quality Check',
    summary: "We're doing a final check to make sure your resume is polished and ready.",
    systemDoes: 'We check for quality, keyword coverage, and compatibility with hiring systems.',
    userDoes: 'Download your resume and optionally save it for future applications.',
    next: 'Your resume is ready to download!',
    victoryMessage: 'Congratulations — your resume is polished, professional, and ready to make an impression.',
  },
};

export function processStepFromPhase(phase: string | null | undefined): ProcessStepKey {
  switch (phase) {
    case 'intake':
    case 'onboarding':
      return 'intake';
    case 'research':
      return 'research';
    case 'positioning':
    case 'positioning_profile_choice':
      return 'positioning';
    case 'gap_analysis':
      return 'gap_analysis';
    case 'architect':
    case 'architect_review':
    case 'resume_design':
      return 'architect';
    case 'section_writing':
    case 'section_review':
    case 'section_craft':
    case 'revision':
      return 'section_writing';
    case 'quality_review':
    case 'complete':
      return 'quality_review';
    default:
      return 'intake';
  }
}

export function processStepFromWorkflowNode(
  nodeKey: WorkflowNodeKey,
  options?: { currentPhase?: string | null },
): ProcessStepKey {
  if (nodeKey === 'questions') {
    return processStepFromPhase(options?.currentPhase);
  }
  switch (nodeKey) {
    case 'overview':
      return 'intake';
    case 'benchmark':
      return 'research';
    case 'gaps':
      return 'gap_analysis';
    case 'blueprint':
      return 'architect';
    case 'sections':
      return 'section_writing';
    case 'quality':
    case 'export':
      return 'quality_review';
    default:
      return 'positioning';
  }
}

export function processStepFromQuestionnaireStage(stage: string | null | undefined): ProcessStepKey {
  switch (stage) {
    case 'positioning':
      return 'positioning';
    case 'gap_analysis':
      return 'gap_analysis';
    case 'quality_fixes':
      return 'quality_review';
    default:
      return 'gap_analysis';
  }
}
