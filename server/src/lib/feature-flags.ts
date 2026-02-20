function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

export const QUESTIONNAIRE_FLAGS = {
  intake_quiz: envBool('FF_INTAKE_QUIZ', true),
  research_validation: envBool('FF_RESEARCH_VALIDATION', true),
  gap_analysis_quiz: envBool('FF_GAP_ANALYSIS_QUIZ', true),
  quality_review_approval: envBool('FF_QUALITY_REVIEW_APPROVAL', true),
};

export type QuestionnaireStage = keyof typeof QUESTIONNAIRE_FLAGS;

export function isQuestionnaireEnabled(stage: QuestionnaireStage): boolean {
  return QUESTIONNAIRE_FLAGS[stage];
}

export const FEATURE_FLAGS = {
  positioning_v2: envBool('FF_POSITIONING_V2', true),
};

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag];
}
