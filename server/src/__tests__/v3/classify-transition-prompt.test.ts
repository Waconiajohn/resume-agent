import { describe, expect, it } from 'vitest';
import { loadPrompt } from '../../v3/prompts/loader.js';

describe('classify prompt — transition notes', () => {
  it('preserves layoff/current-search notes as career context', () => {
    const prompt = loadPrompt('classify.v1');

    expect(prompt.version).toBe('1.6');
    expect(prompt.systemMessage.toLowerCase()).toContain('recently laid off');
    expect(prompt.systemMessage).toContain('currently seeking next VP Operations role');
    expect(prompt.systemMessage).toContain('positions[N].dates');
  });

  it('treats discovery answers as source evidence without turning them into positions', () => {
    const prompt = loadPrompt('classify.v1');

    expect(prompt.systemMessage).toContain('DISCOVERY ANSWERS PROVIDED BY CANDIDATE');
    expect(prompt.systemMessage).toContain('candidate-provided source evidence');
    expect(prompt.systemMessage).toContain('Do NOT create a new `positions` entry');
    expect(prompt.systemMessage).toContain('SAP implementation lead');
  });
});
