import { describe, expect, it } from 'vitest';
import { loadPrompt } from '../../v3/prompts/loader.js';

describe('write-position prompt — transition-ended roles', () => {
  it('treats non-null recent markers as ended roles', () => {
    const prompt = loadPrompt('write-position.v1');

    expect(prompt.version).toBe('1.7');
    expect(prompt.systemMessage).toContain('transition marker like `"recent"`');
    expect(prompt.systemMessage).toContain('transition-ended role, end="recent"');
    expect(prompt.systemMessage).toContain('keep `"Recent"`');
  });

  it('forbids moving metrics onto unsupported accomplishments', () => {
    const prompt = loadPrompt('write-position.v1');

    expect(prompt.version).toBe('1.7');
    expect(prompt.systemMessage).toContain('Numeric claims must stay linked');
    expect(prompt.systemMessage).toContain('$4.5M facility expansion');
    expect(prompt.systemMessage).toContain('Do not move metrics across source bullets');
  });
});
