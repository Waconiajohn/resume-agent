function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

export const QUESTIONNAIRE_FLAGS = {
  positioning_batch: envBool('FF_POSITIONING_BATCH', true),
  intake_quiz: envBool('FF_INTAKE_QUIZ', false),
  research_validation: envBool('FF_RESEARCH_VALIDATION', false),
  gap_analysis_quiz: envBool('FF_GAP_ANALYSIS_QUIZ', true),
  quality_review_approval: envBool('FF_QUALITY_REVIEW_APPROVAL', true),
};

export type QuestionnaireStage = keyof typeof QUESTIONNAIRE_FLAGS;

export function isQuestionnaireEnabled(stage: QuestionnaireStage): boolean {
  return QUESTIONNAIRE_FLAGS[stage];
}

export const GUIDED_SUGGESTIONS_ENABLED = envBool('FF_GUIDED_SUGGESTIONS', true);
