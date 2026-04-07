import type { V2PersistedDraftState, V2PipelineData, V2Stage } from '@/types/resume-v2';
import { normalizeAssemblyResult, normalizeResumeDraft } from '@/lib/normalize-resume-draft';

export type LoadableV2PipelineSnapshot = {
  stage?: V2Stage;
  jobIntelligence?: V2PipelineData['jobIntelligence'];
  candidateIntelligence?: V2PipelineData['candidateIntelligence'];
  benchmarkCandidate?: V2PipelineData['benchmarkCandidate'];
  gapAnalysis?: V2PipelineData['gapAnalysis'];
  requirementWorkItems?: V2PipelineData['requirementWorkItems'];
  gapCoachingCards?: V2PipelineData['gapCoachingCards'];
  gapQuestions?: V2PipelineData['gapQuestions'];
  preScores?: V2PipelineData['preScores'];
  narrativeStrategy?: V2PipelineData['narrativeStrategy'];
  resumeDraft?: V2PipelineData['resumeDraft'];
  assembly?: V2PipelineData['assembly'];
  hiringManagerScan?: V2PipelineData['hiringManagerScan'];
  error?: string | null;
  stageMessages?: V2PipelineData['stageMessages'];
};

export interface LoadSessionResponseBody {
  version?: string;
  status?: 'running' | 'complete' | 'error';
  pipeline_stage?: V2Stage;
  error_message?: string | null;
  pipeline_data?: LoadableV2PipelineSnapshot;
  draft_state?: V2PersistedDraftState | null;
  inputs?: { resume_text: string; job_description: string };
}

export interface HydratedV2SessionLoad {
  data: V2PipelineData;
  isComplete: boolean;
  shouldReconnect: boolean;
  inputs: { resume_text: string; job_description: string };
  draftState: V2PersistedDraftState | null;
}

export function hydrateV2SessionLoad(
  sessionId: string,
  body: LoadSessionResponseBody,
): HydratedV2SessionLoad | null {
  if (body.version !== 'v2' || !body.pipeline_data) return null;

  const status = body.status ?? 'complete';
  const pd = body.pipeline_data;
  const stage = status === 'complete'
    ? 'complete'
    : (pd.stage ?? body.pipeline_stage ?? 'intake');

  return {
    data: {
      sessionId,
      stage,
      jobIntelligence: pd.jobIntelligence ?? null,
      candidateIntelligence: pd.candidateIntelligence ?? null,
      benchmarkCandidate: pd.benchmarkCandidate ?? null,
      gapAnalysis: pd.gapAnalysis ?? null,
      requirementWorkItems: pd.requirementWorkItems ?? pd.gapAnalysis?.requirement_work_items ?? null,
      gapCoachingCards: pd.gapCoachingCards ?? null,
      gapQuestions: pd.gapQuestions ?? null,
      preScores: pd.preScores ?? null,
      narrativeStrategy: pd.narrativeStrategy ?? null,
      resumeDraft: normalizeResumeDraft(pd.resumeDraft ?? null),
      assembly: normalizeAssemblyResult(pd.assembly ?? null),
      hiringManagerScan: pd.hiringManagerScan ?? null,
      verificationDetail: null,
      error: pd.error ?? body.error_message ?? null,
      stageMessages: pd.stageMessages ?? [],
    },
    isComplete: status === 'complete',
    shouldReconnect: status === 'running',
    inputs: body.inputs ?? { resume_text: '', job_description: '' },
    draftState: body.draft_state
      ? {
          ...body.draft_state,
          editable_resume: normalizeResumeDraft(body.draft_state.editable_resume),
        }
      : null,
  };
}
