export const QUESTIONNAIRE_FLAGS = {
  intake_quiz: true,
  research_validation: true,
  gap_analysis_quiz: true,
  quality_review_approval: true,
} as const;

export type QuestionnaireStage = keyof typeof QUESTIONNAIRE_FLAGS;

export function isQuestionnaireEnabled(stage: QuestionnaireStage): boolean {
  return QUESTIONNAIRE_FLAGS[stage];
}
