import type { QuestionnaireQuestion, QuestionnaireOption, QuestionnaireResponse, QuestionnaireSubmission, PipelineSSEEvent } from '../agents/types.js';

// Helper to build a question with defaults
export function makeQuestion(
  id: string,
  text: string,
  input_type: QuestionnaireQuestion['input_type'],
  options: Array<{ id: string; label: string; description?: string; source?: QuestionnaireOption['source'] }>,
  config?: {
    context?: string;
    payoff_hint?: string;
    impact_tier?: QuestionnaireQuestion['impact_tier'];
    topic_keys?: QuestionnaireQuestion['topic_keys'];
    benchmark_edit_version?: QuestionnaireQuestion['benchmark_edit_version'];
    allow_custom?: boolean;
    allow_skip?: boolean;
    depends_on?: QuestionnaireQuestion['depends_on'];
  }
): QuestionnaireQuestion {
  return {
    id,
    question_text: text,
    context: config?.context,
    payoff_hint: config?.payoff_hint,
    impact_tier: config?.impact_tier,
    topic_keys: config?.topic_keys,
    benchmark_edit_version: config?.benchmark_edit_version,
    input_type,
    options: options.map(o => ({ id: o.id, label: o.label, description: o.description, source: o.source })),
    allow_custom: config?.allow_custom ?? false,
    allow_skip: config?.allow_skip ?? false,
    depends_on: config?.depends_on,
  };
}

// Build the SSE event payload for a questionnaire
export function buildQuestionnaireEvent(
  questionnaire_id: string,
  stage: string,
  title: string,
  questions: QuestionnaireQuestion[],
  subtitle?: string,
): PipelineSSEEvent {
  return {
    type: 'questionnaire',
    questionnaire_id,
    schema_version: 1,
    stage,
    title,
    subtitle,
    questions,
    current_index: 0,
  };
}

// Extract selected option labels from a response
export function getSelectedLabels(
  response: QuestionnaireResponse,
  question: QuestionnaireQuestion,
): string[] {
  if (!question.options) return [];
  return response.selected_option_ids
    .map(id => question.options!.find(o => o.id === id)?.label)
    .filter((label): label is string => label !== undefined);
}
