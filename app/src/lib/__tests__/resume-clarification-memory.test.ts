import { describe, expect, it } from 'vitest';
import { extractClarificationMemory, mergeClarificationMemory } from '../resume-clarification-memory';

describe('resume-clarification-memory', () => {
  it('extracts reusable clarification memory from coaching threads', () => {
    const memory = extractClarificationMemory({
      gapChatSnapshot: {
        items: {
          'Platform leadership': {
            messages: [
              { role: 'assistant', content: 'What was the scale?', currentQuestion: 'What was the scale?' },
              { role: 'user', content: 'I led platform modernization across four business units.' },
              { role: 'assistant', content: 'Great.', suggestedLanguage: 'Led platform modernization across 4 business units.' },
            ],
            resolvedLanguage: null,
            error: null,
          },
        },
      },
      finalReviewChatSnapshot: {
        items: {
          concern_scope: {
            messages: [
              { role: 'assistant', content: 'What size team?', followUpQuestion: 'What size team?' },
              { role: 'user', content: 'The org was about 45 engineers across 5 managers.' },
            ],
            resolvedLanguage: 'Led an organization of 45 engineers across 5 managers.',
            error: null,
          },
        },
      },
      currentResumeText: 'Led an organization of 45 engineers across 5 managers.',
      finalReviewConcernTopics: {
        concern_scope: 'Leadership scope needs to be more concrete.',
      },
    });

    expect(memory).toEqual([
      expect.objectContaining({
        id: 'final_review:leadership scope needs to be more concrete',
        source: 'final_review',
        topic: 'Leadership scope needs to be more concrete.',
        userInput: 'The org was about 45 engineers across 5 managers.',
        appliedLanguage: 'Led an organization of 45 engineers across 5 managers.',
      }),
      expect.objectContaining({
        id: 'gap_chat:platform leadership',
        source: 'gap_chat',
        topic: 'Platform leadership',
        userInput: 'I led platform modernization across four business units.',
        suggestedLanguage: 'Led platform modernization across 4 business units.',
      }),
    ]);
  });

  it('merges stored and freshly extracted clarification memory by id', () => {
    const merged = mergeClarificationMemory(
      [
        {
          id: 'gap_chat:platform leadership',
          source: 'gap_chat',
          topic: 'Platform leadership',
          userInput: 'Older wording',
        },
      ],
      [
        {
          id: 'gap_chat:platform leadership',
          source: 'gap_chat',
          topic: 'Platform leadership',
          userInput: 'Newer wording',
          suggestedLanguage: 'Led platform modernization across 4 business units.',
        },
      ],
    );

    expect(merged).toEqual([
      {
        id: 'gap_chat:platform leadership',
        source: 'gap_chat',
        topic: 'Platform leadership',
        userInput: 'Newer wording',
        suggestedLanguage: 'Led platform modernization across 4 business units.',
      },
    ]);
  });
});
