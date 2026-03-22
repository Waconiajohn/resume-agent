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
    title: 'Read Your Background',
    summary: "We're reading your resume to understand your experience, strengths, and raw material.",
    systemDoes: 'We read your resume, pull out your strongest evidence, and organize what you already bring to the table.',
    userDoes: 'Confirm the basics and flag anything important that should not be overlooked.',
    next: "Next, we'll study the target role so the rewrite is driven by the right priorities.",
    victoryMessage: "We've read your background and captured the evidence we can build from.",
  },
  research: {
    key: 'research',
    number: 2,
    title: 'Study the Target Role',
    summary: "We're studying the job description and benchmark expectations so weak postings do not produce weak resumes.",
    systemDoes: 'We analyze the target role, extract the true requirements, and compare them to a stronger benchmark candidate profile.',
    userDoes: "Look over the role analysis if needed and call out anything that feels off-target.",
    next: "Next, we'll map your evidence against the target requirements.",
    victoryMessage: "We understand the target role and what a competitive candidate should look like.",
  },
  positioning: {
    key: 'positioning',
    number: 3,
    title: 'Map Requirements',
    summary: "We're matching your background to the job and benchmark requirements so every important need is accounted for.",
    systemDoes: 'We build the requirement ledger, map evidence already present in the resume, and identify where more proof is needed.',
    userDoes: 'Review what is already covered and be ready to clarify anything that is only partly supported.',
    next: "Next, we'll work through the real gaps and strengthen weak evidence.",
    victoryMessage: "We have a clear map of what is covered, partial, and still missing.",
  },
  gap_analysis: {
    key: 'gap_analysis',
    number: 4,
    title: 'Close the Gaps',
    summary: "We're working through weak spots one requirement at a time and turning them into truthful, interview-worthy resume language.",
    systemDoes: 'We coach through each gap, ask one targeted question at a time, and propose edits that strengthen job-description fit first.',
    userDoes: 'Answer the clarifying questions, review the suggested language, and only accept edits that are true and supportable.',
    next: "Next, we'll build the strongest version of the resume with the accepted edits.",
    victoryMessage: "The main gaps are now addressed, reframed, or clearly marked as partial.",
  },
  architect: {
    key: 'architect',
    number: 5,
    title: 'Build the Resume',
    summary: "We're turning the accepted evidence and positioning into a coherent, high-impact resume draft.",
    systemDoes: 'We structure the resume so the strongest wins show up early and the most important requirements are clearly covered.',
    userDoes: 'Review the draft structure and focus on whether the strongest evidence is being shown in the right places.',
    next: "Next, we'll finish the draft and get it ready for a pressure test.",
    victoryMessage: "The resume structure is set and the draft is taking shape.",
  },
  section_writing: {
    key: 'section_writing',
    number: 6,
    title: 'Run Final Review',
    summary: "We're pressure-testing the draft with a recruiter skim and a hiring manager review before export.",
    systemDoes: 'We run the six-second scan, surface interview blockers, compare against the benchmark, and point to the highest-value fixes.',
    userDoes: 'Review the concerns, answer follow-up questions when needed, and approve only the fixes that truly strengthen the draft.',
    next: "After the final fixes land, we'll refresh tone, ATS readiness, and export status.",
    victoryMessage: 'The draft has been pressure-tested and the final fixes are in motion.',
  },
  quality_review: {
    key: 'quality_review',
    number: 7,
    title: 'Polish and Export',
    summary: "We're refreshing tone, ATS readiness, and final coverage so you know exactly what is ready before export.",
    systemDoes: 'We rerun tone and match checks after accepted fixes, summarize final readiness, and prepare export-safe files.',
    userDoes: 'Review any remaining warnings, decide what should be saved to your master resume, and export when satisfied.',
    next: 'Review the final warnings, then export when you are satisfied with the draft.',
    victoryMessage: 'Your resume is polished, pressure-tested, and ready for a final export decision.',
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
