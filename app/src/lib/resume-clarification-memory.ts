import type {
  ClarificationMemoryEntry,
  CoachingThreadSnapshot,
  GapChatMessage,
} from '@/types/resume-v2';

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/[.,;:!?]+$/u, '');
}

function hasMeaningfulAssistantState(message: GapChatMessage | null | undefined): boolean {
  return Boolean(
    message?.suggestedLanguage?.trim()
    || message?.currentQuestion?.trim()
    || message?.followUpQuestion?.trim()
    || message?.needsCandidateInput,
  );
}

function assistantRequestedInput(message: GapChatMessage | null | undefined): boolean {
  return Boolean(
    message?.currentQuestion?.trim()
    || message?.followUpQuestion?.trim()
    || message?.needsCandidateInput,
  );
}

function findNextAssistantMessage(
  messages: GapChatMessage[],
  startIndex: number,
): GapChatMessage | null {
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && typeof message.content === 'string' && message.content.trim()) {
      return message;
    }
  }
  return null;
}

function findPreviousAssistantMessage(
  messages: GapChatMessage[],
  startIndex: number,
): GapChatMessage | null {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && typeof message.content === 'string' && message.content.trim()) {
      return message;
    }
  }
  return null;
}

function findLatestCompletedExchange(
  item: CoachingThreadSnapshot['items'][string],
): {
  userMessage: GapChatMessage;
  assistantMessage: GapChatMessage | null;
} | null {
  const messages = item.messages ?? [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user' || typeof message.content !== 'string' || !message.content.trim()) {
      continue;
    }

    const nextAssistant = findNextAssistantMessage(messages, index);
    if (hasMeaningfulAssistantState(nextAssistant)) {
      return {
        userMessage: message,
        assistantMessage: nextAssistant,
      };
    }

    const previousAssistant = findPreviousAssistantMessage(messages, index);
    if (item.resolvedLanguage?.trim() && assistantRequestedInput(previousAssistant)) {
      return {
        userMessage: message,
        assistantMessage: previousAssistant,
      };
    }
  }

  return null;
}

function buildEntry(
  source: ClarificationMemoryEntry['source'],
  topic: string,
  item: CoachingThreadSnapshot['items'][string],
  currentResumeText: string,
  topicFamilies?: { primaryFamily?: string | null; families?: string[] },
): ClarificationMemoryEntry | null {
  const normalizedTopic = normalizeTopic(topic);
  if (!normalizedTopic) return null;

  const completedExchange = findLatestCompletedExchange(item);
  const userInput = completedExchange?.userMessage.content.trim();
  if (!userInput) return null;

  const assistantMessage = completedExchange?.assistantMessage;

  const suggestedLanguage = item.resolvedLanguage?.trim()
    || assistantMessage?.suggestedLanguage?.trim()
    || undefined;

  const hasCompletedExchange = Boolean(
    suggestedLanguage
    || hasMeaningfulAssistantState(assistantMessage),
  );

  if (!hasCompletedExchange) return null;

  const appliedLanguage = item.resolvedLanguage?.trim()
    || (suggestedLanguage && currentResumeText.includes(suggestedLanguage) ? suggestedLanguage : undefined);

  return {
    id: `${source}:${normalizedTopic}`,
    source,
    topic: topic.trim(),
    userInput,
    suggestedLanguage,
    appliedLanguage,
    primaryFamily: topicFamilies?.primaryFamily ?? null,
    families: topicFamilies?.families ?? [],
  };
}

export function mergeClarificationMemory(
  existing: ClarificationMemoryEntry[] | null | undefined,
  extracted: ClarificationMemoryEntry[] | null | undefined,
): ClarificationMemoryEntry[] {
  const merged = new Map<string, ClarificationMemoryEntry>();

  for (const entry of existing ?? []) {
    if (!entry?.id || !entry.topic.trim() || !entry.userInput.trim()) continue;
    merged.set(entry.id, entry);
  }

  for (const entry of extracted ?? []) {
    if (!entry?.id || !entry.topic.trim() || !entry.userInput.trim()) continue;
    merged.set(entry.id, entry);
  }

  return Array.from(merged.values()).sort((left, right) => (
    left.source.localeCompare(right.source) || left.topic.localeCompare(right.topic)
  ));
}

export function extractClarificationMemory({
  gapChatSnapshot,
  finalReviewChatSnapshot,
  currentResumeText,
  finalReviewConcernTopics,
  topicFamilies,
}: {
  gapChatSnapshot?: CoachingThreadSnapshot | null;
  finalReviewChatSnapshot?: CoachingThreadSnapshot | null;
  currentResumeText?: string | null;
  finalReviewConcernTopics?: Record<string, string>;
  topicFamilies?: Record<string, { primaryFamily?: string | null; families?: string[] }>;
}): ClarificationMemoryEntry[] {
  const nextEntries: ClarificationMemoryEntry[] = [];
  const resumeText = currentResumeText ?? '';

  for (const [topic, item] of Object.entries(gapChatSnapshot?.items ?? {})) {
    const entry = buildEntry('gap_chat', topic, item, resumeText, topicFamilies?.[normalizeTopic(topic)]);
    if (entry) nextEntries.push(entry);
  }

  for (const [concernId, item] of Object.entries(finalReviewChatSnapshot?.items ?? {})) {
    const topic = finalReviewConcernTopics?.[normalizeTopic(concernId)] ?? concernId;
    const entry = buildEntry('final_review', topic, item, resumeText, topicFamilies?.[normalizeTopic(topic)]);
    if (entry) nextEntries.push(entry);
  }

  return mergeClarificationMemory([], nextEntries);
}
