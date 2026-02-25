import type { PanelData, PanelType } from '@/types/panels';
import type { FinalResume } from '@/types/resume';

export type WorkflowNodeKey =
  | 'overview'
  | 'benchmark'
  | 'gaps'
  | 'questions'
  | 'blueprint'
  | 'sections'
  | 'quality'
  | 'export';

export type WorkflowNodeStatus =
  | 'locked'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'complete'
  | 'stale';

export interface WorkflowNodeDefinition {
  key: WorkflowNodeKey;
  label: string;
  shortLabel: string;
  description: string;
}

export const WORKFLOW_NODES: WorkflowNodeDefinition[] = [
  {
    key: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    description: 'Step 1: Resume intake and parsed snapshot check',
  },
  {
    key: 'benchmark',
    label: 'Benchmark',
    shortLabel: 'Benchmark',
    description: 'Step 2: Job research and benchmark candidate profile',
  },
  {
    key: 'gaps',
    label: 'Gap Map',
    shortLabel: 'Gaps',
    description: 'Step 4: Requirement coverage and evidence gaps',
  },
  {
    key: 'questions',
    label: 'Questions',
    shortLabel: 'Questions',
    description: 'Steps 3-4: Why Me interview and targeted follow-up questions',
  },
  {
    key: 'blueprint',
    label: 'Blueprint',
    shortLabel: 'Blueprint',
    description: 'Step 5: Resume blueprint and structure plan',
  },
  {
    key: 'sections',
    label: 'Sections',
    shortLabel: 'Sections',
    description: 'Step 6: Section drafting and review',
  },
  {
    key: 'quality',
    label: 'Quality',
    shortLabel: 'Quality',
    description: 'Step 7: Quality checks and final improvements',
  },
  {
    key: 'export',
    label: 'Export',
    shortLabel: 'Export',
    description: 'Step 7: Export and save reusable base resume',
  },
];

export interface WorkspaceNodeSnapshot {
  nodeKey: WorkflowNodeKey;
  panelType: PanelType | null;
  panelData: PanelData | null;
  resume: FinalResume | null;
  capturedAt: string;
  currentPhase: string;
  isGateActive: boolean;
}

export function panelTypeToWorkflowNode(panelType: PanelType | null): WorkflowNodeKey | null {
  if (!panelType) return null;
  switch (panelType) {
    case 'onboarding_summary':
      return 'overview';
    case 'research_dashboard':
      return 'benchmark';
    case 'gap_analysis':
      return 'gaps';
    case 'questionnaire':
    case 'positioning_interview':
      return 'questions';
    case 'blueprint_review':
    case 'design_options':
      return 'blueprint';
    case 'section_review':
    case 'live_resume':
      return 'sections';
    case 'quality_dashboard':
      return 'quality';
    case 'completion':
      return 'export';
    default:
      console.warn(`panelTypeToWorkflowNode: unhandled panel type "${panelType}"`);
      return null;
  }
}

export function phaseToWorkflowNode(phase: string | null | undefined): WorkflowNodeKey {
  switch (phase) {
    case 'intake':
    case 'onboarding':
      return 'overview';
    case 'research':
      return 'benchmark';
    case 'gap_analysis':
      return 'gaps';
    case 'positioning':
    case 'positioning_profile_choice':
      return 'questions';
    case 'architect':
    case 'architect_review':
    case 'resume_design':
      return 'blueprint';
    case 'section_writing':
    case 'section_review':
    case 'section_craft':
    case 'revision':
      return 'sections';
    case 'quality_review':
      return 'quality';
    case 'complete':
      return 'export';
    default:
      return 'overview';
  }
}

export function panelDataToWorkflowNode(panelData: PanelData | null): WorkflowNodeKey | null {
  return panelTypeToWorkflowNode(panelData?.type ?? null);
}

export function workflowNodeIndex(node: WorkflowNodeKey): number {
  return WORKFLOW_NODES.findIndex((n) => n.key === node);
}
