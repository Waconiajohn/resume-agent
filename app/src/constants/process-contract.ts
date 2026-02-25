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
}

export const PROCESS_STEP_CONTRACTS: Record<ProcessStepKey, ProcessStepContract> = {
  intake: {
    key: 'intake',
    number: 1,
    title: 'Resume Intake',
    summary: 'Read and structure the uploaded resume so the system can work from accurate facts.',
    systemDoes: 'Parses the resume into experience, skills, dates, and baseline strengths.',
    userDoes: 'Quickly confirm the snapshot looks reasonable. If key experience is missing, re-upload or correct the source.',
    next: 'The system analyzes the job and builds a benchmark profile.',
  },
  research: {
    key: 'research',
    number: 2,
    title: 'Target Research & Benchmark',
    summary: 'Analyze the job description and build a benchmark candidate profile for this role.',
    systemDoes: 'Extracts JD requirements, company signals, keywords, and benchmark assumptions.',
    userDoes: 'Review benchmark assumptions and correct them if they are off.',
    next: 'The system starts the Why Me positioning interview and uses the benchmark as context.',
  },
  positioning: {
    key: 'positioning',
    number: 3,
    title: 'Why Me Positioning',
    summary: 'Capture the strongest evidence and positioning story for this specific target role.',
    systemDoes: 'Asks targeted questions to surface high-impact achievements and leadership evidence.',
    userDoes: 'Answer the questions with concrete examples. Use suggestions as a starting point, then add specifics.',
    next: 'The system compares your evidence to the JD and benchmark to identify gaps.',
  },
  gap_analysis: {
    key: 'gap_analysis',
    number: 4,
    title: 'Gap Map & Evidence Fill',
    summary: 'Compare your current evidence against the JD and benchmark to find strong matches, partials, and gaps.',
    systemDoes: 'Builds the gap map, scores coverage, and asks only targeted follow-up questions when needed.',
    userDoes: 'Review the classifications and answer high-impact follow-up questions if shown.',
    next: 'The system designs the resume blueprint using your evidence and the gap map.',
  },
  architect: {
    key: 'architect',
    number: 5,
    title: 'Resume Blueprint',
    summary: 'Design the resume strategy before writing sections.',
    systemDoes: 'Sets section order, positioning angle, keyword targets, and structure rules.',
    userDoes: 'Review the blueprint if prompted, then approve to start writing.',
    next: 'The system writes and iterates through resume sections.',
  },
  section_writing: {
    key: 'section_writing',
    number: 6,
    title: 'Write & Review Sections',
    summary: 'Draft resume sections and refine the most important ones first.',
    systemDoes: 'Writes sections, proposes improvements, and supports quick-fix or direct edits.',
    userDoes: 'Approve, edit, or request changes on review sections. Lower-impact sections may be auto-approved by mode.',
    next: 'The system runs final quality checks and applies improvements.',
  },
  quality_review: {
    key: 'quality_review',
    number: 7,
    title: 'Quality Review & Export',
    summary: 'Check hiring-manager impact, ATS alignment, authenticity, and prepare final exports.',
    systemDoes: 'Scores the resume, applies safe fixes, and prepares export-ready outputs.',
    userDoes: 'Review final quality flags if shown, then export and optionally save as a reusable base resume.',
    next: 'Session completes with export options and base-resume save options.',
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
