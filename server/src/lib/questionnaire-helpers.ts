import type { QuestionnaireQuestion, QuestionnaireOption, QuestionnaireResponse, QuestionnaireSubmission, PipelineSSEEvent, PositioningQuestion } from '../agents/types.js';

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

// ─── Positioning ↔ Questionnaire Converters ──────────────────────────

const IMPACT_BY_CATEGORY: Record<string, QuestionnaireQuestion['impact_tier']> = {
  requirement_mapped: 'high',
  scale_and_scope: 'high',
  hidden_accomplishments: 'medium',
  career_narrative: 'medium',
  currency_and_adaptability: 'low',
};

/**
 * Convert an array of Strategist-generated PositioningQuestions into
 * QuestionnaireQuestion[] suitable for the QuestionnairePanel.
 */
export function positioningToQuestionnaire(
  questions: PositioningQuestion[],
): QuestionnaireQuestion[] {
  return questions.map((pq) => {
    const options: QuestionnaireOption[] = (pq.suggestions ?? []).map((s, i) => ({
      id: `${pq.id}_opt_${i}`,
      label: s.label,
      description: s.description,
      source: s.source === 'resume' ? 'resume'
        : s.source === 'jd' ? 'jd'
        : 'inferred',
    }));

    return {
      id: pq.id,
      question_text: pq.question_text,
      context: pq.context,
      impact_tier: IMPACT_BY_CATEGORY[pq.category ?? 'requirement_mapped'] ?? 'medium',
      input_type: options.length > 0 ? 'single_choice' : 'free_text',
      options,
      allow_custom: true,
      allow_skip: pq.optional ?? false,
    };
  });
}

/**
 * Extract interview answers from a QuestionnaireSubmission, returning
 * records compatible with the strategist scratchpad's interview_answers format.
 */
export function extractInterviewAnswers(
  submission: QuestionnaireSubmission,
  originals: PositioningQuestion[],
): Array<{
  question_id: string;
  question_text: string;
  category: string;
  answer: string;
  timestamp: string;
}> {
  const questionMap = new Map(originals.map(q => [q.id, q]));

  return submission.responses
    .filter(r => !r.skipped)
    .map(r => {
      const original = questionMap.get(r.question_id);
      if (!original) return null;

      // Build answer text from selected options + custom text.
      // Users may click a pre-made option, type custom text, or do both.
      const parts: string[] = [];

      if (r.selected_option_ids.length > 0) {
        const suggestions = original.suggestions ?? [];
        const selectedLabels = r.selected_option_ids
          .map(id => {
            // Primary lookup: match by the `${questionId}_opt_${index}` pattern
            const byIndex = suggestions.find(
              (_, i) => `${original.id}_opt_${i}` === id,
            );
            if (byIndex) return byIndex.label;
            // Fallback: extract index from option ID suffix (handles reordered options)
            const indexMatch = id.match(/_opt_(\d+)$/);
            if (indexMatch) {
              const idx = parseInt(indexMatch[1], 10);
              if (idx >= 0 && idx < suggestions.length) return suggestions[idx].label;
            }
            return undefined;
          })
          .filter((l): l is string => !!l);
        if (selectedLabels.length > 0) {
          parts.push(selectedLabels.join('; '));
        }
      }

      if (r.custom_text?.trim()) {
        parts.push(r.custom_text.trim());
      }

      // Join selected option labels and custom text with separator.
      // If only an option was selected, the label IS the answer.
      // If both, format as "Selected answer — Additional detail from user".
      const answer = parts.join(' — ') || '(skipped)';

      return {
        question_id: original.id,
        question_text: original.question_text,
        category: original.category ?? 'requirement_mapped',
        answer,
        timestamp: submission.submitted_at,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
