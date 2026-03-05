import type { PanelData, PanelType } from '@/types/panels';
import type { FinalResume } from '@/types/resume';

export type { UIMode } from '@/hooks/useUIMode';

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
    label: 'Your Resume',
    shortLabel: 'Resume',
    description: 'What we found in your resume',
  },
  {
    key: 'benchmark',
    label: 'The Role',
    shortLabel: 'Role',
    description: 'What this company is looking for',
  },
  {
    key: 'gaps',
    label: 'Your Fit',
    shortLabel: 'Fit',
    description: 'How your experience matches the role',
  },
  {
    key: 'questions',
    label: 'Your Story',
    shortLabel: 'Story',
    description: 'Questions to strengthen your positioning',
  },
  {
    key: 'blueprint',
    label: 'The Plan',
    shortLabel: 'Plan',
    description: 'How your resume will be structured',
  },
  {
    key: 'sections',
    label: 'Resume Sections',
    shortLabel: 'Sections',
    description: 'Review and approve each section',
  },
  {
    key: 'quality',
    label: 'Quality Check',
    shortLabel: 'Quality',
    description: 'Final quality and compatibility check',
  },
  {
    key: 'export',
    label: 'Download',
    shortLabel: 'Download',
    description: 'Download your finished resume',
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
