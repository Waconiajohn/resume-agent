export const WORKFLOW_NODE_KEYS = [
  'overview', 'benchmark', 'gaps', 'questions',
  'blueprint', 'sections', 'quality', 'export',
] as const;

export type WorkflowNodeKey = (typeof WORKFLOW_NODE_KEYS)[number];
export type WorkflowNodeStatus = 'locked' | 'ready' | 'in_progress' | 'blocked' | 'complete' | 'stale';

export function isWorkflowNodeKey(value: string): value is WorkflowNodeKey {
  return (WORKFLOW_NODE_KEYS as readonly string[]).includes(value);
}

export function workflowNodeFromStage(stage: string): WorkflowNodeKey {
  switch (stage) {
    case 'intake': case 'onboarding': return 'overview';
    case 'research': return 'benchmark';
    case 'gap_analysis': return 'gaps';
    case 'positioning': case 'architect_review': return 'questions';
    case 'architect': case 'resume_design': return 'blueprint';
    case 'section_writing': case 'section_review': case 'section_craft': case 'revision': return 'sections';
    case 'quality_review': return 'quality';
    case 'complete': return 'export';
    default: return 'overview';
  }
}
