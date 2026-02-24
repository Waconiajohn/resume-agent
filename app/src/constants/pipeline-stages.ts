export interface PipelineStageInfo {
  key: string;
  label: string;
  index: number;
  estimateMinutes: number;
  isInteractive: boolean;
}

export const PIPELINE_STAGES: PipelineStageInfo[] = [
  { key: 'intake',          label: 'Parsing Resume',      index: 1, estimateMinutes: 0.1, isInteractive: false },
  { key: 'research',        label: 'Researching Company', index: 2, estimateMinutes: 1.5, isInteractive: false },
  { key: 'positioning',     label: 'Why Me Interview',    index: 3, estimateMinutes: 10,  isInteractive: true },
  { key: 'gap_analysis',    label: 'Analyzing Gaps',      index: 4, estimateMinutes: 1.5, isInteractive: false },
  { key: 'architect',       label: 'Building Blueprint',  index: 5, estimateMinutes: 2,   isInteractive: false },
  { key: 'section_writing', label: 'Writing Sections',    index: 6, estimateMinutes: 12,  isInteractive: true },
  { key: 'quality_review',  label: 'Quality Review',      index: 7, estimateMinutes: 4,   isInteractive: false },
];

export const TOTAL_PIPELINE_STAGES = PIPELINE_STAGES.length;

const SUB_STAGE_MAP: Record<string, string> = {
  architect_review: 'architect',
  section_review: 'section_writing',
  revision: 'quality_review',
  intake_quiz: 'intake',
  research_validation: 'research',
  gap_analysis_quiz: 'gap_analysis',
};

export function getStageInfo(stageKey: string): PipelineStageInfo | null {
  const normalized = SUB_STAGE_MAP[stageKey] ?? stageKey;
  return PIPELINE_STAGES.find((s) => s.key === normalized) ?? null;
}

export function getCompletedCount(stageKey: string): number {
  const info = getStageInfo(stageKey);
  if (!info) return 0;
  return info.index - 1;
}
