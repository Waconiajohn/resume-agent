// Prompt loader tests.
// Covers the contract described in OPERATING-MANUAL.md "No silent fallbacks"
// and docs/v3-rebuild/03-Prompt-Library-Structure.md (file format).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPrompt } from '../../v3/prompts/loader.js';
import { PromptLoadError } from '../../v3/errors.js';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'v3-prompts-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function stage(name: string, body: string): string {
  const path = join(root, `${name}.md`);
  writeFileSync(path, body);
  return path;
}

describe('loadPrompt', () => {
  it('parses frontmatter and splits system/user message on "# User message template"', () => {
    stage(
      'classify.v1',
      [
        '---',
        'stage: classify',
        'version: "1.0"',
        'model: claude-opus-4-7',
        'temperature: 0.2',
        'last_edited: 2026-04-17',
        'last_editor: john',
        'notes: initial version',
        '---',
        '',
        '# System',
        '',
        'You are a resume parser.',
        '',
        '# User message template',
        '',
        'Resume:',
        '{{resume_text}}',
      ].join('\n'),
    );

    const loaded = loadPrompt('classify.v1', { root });
    expect(loaded.stage).toBe('classify');
    expect(loaded.version).toBe('1.0');
    expect(loaded.model).toBe('claude-opus-4-7');
    expect(loaded.temperature).toBe(0.2);
    expect(loaded.lastEdited).toBe('2026-04-17');
    expect(loaded.lastEditor).toBe('john');
    expect(loaded.notes).toBe('initial version');
    expect(loaded.systemMessage).toContain('You are a resume parser.');
    expect(loaded.systemMessage).not.toContain('{{resume_text}}');
    expect(loaded.userMessageTemplate).toContain('{{resume_text}}');
  });

  it('throws a loud PromptLoadError when the "# User message template" header is absent', () => {
    stage(
      'no-template.v1',
      [
        '---',
        'stage: verify',
        'version: "1.0"',
        'model: claude-opus-4-7',
        'temperature: 0.1',
        '---',
        '',
        'You check the resume for errors.',
      ].join('\n'),
    );
    expect(() => loadPrompt('no-template.v1', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('no-template.v1', { root })).toThrow(
      /User message template/,
    );
  });

  it('throws a loud PromptLoadError when the user-template section is empty', () => {
    stage(
      'empty-template.v1',
      [
        '---',
        'stage: verify',
        'version: "1.0"',
        'model: claude-opus-4-7',
        'temperature: 0.1',
        '---',
        '',
        'You check the resume for errors.',
        '',
        '# User message template',
        '',
      ].join('\n'),
    );
    expect(() => loadPrompt('empty-template.v1', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('empty-template.v1', { root })).toThrow(
      /empty|cannot feed/,
    );
  });

  it('throws a loud PromptLoadError when the file is missing', () => {
    expect(() => loadPrompt('does-not-exist', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('does-not-exist', { root })).toThrow(/not found or unreadable/);
  });

  it('throws a loud PromptLoadError when required frontmatter fields are missing', () => {
    stage(
      'broken.v1',
      [
        '---',
        'stage: broken',
        'version: "1.0"',
        '# missing model and temperature',
        '---',
        '',
        'body',
      ].join('\n'),
    );
    expect(() => loadPrompt('broken.v1', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('broken.v1', { root })).toThrow(/model/);
  });

  it('throws a loud PromptLoadError when version is not a quoted string', () => {
    stage(
      'numeric-version.v1',
      [
        '---',
        'stage: classify',
        'version: 1.0',
        'model: claude-opus-4-7',
        'temperature: 0.2',
        '---',
        '',
        'body',
      ].join('\n'),
    );
    expect(() => loadPrompt('numeric-version.v1', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('numeric-version.v1', { root })).toThrow(/quoted string/);
  });

  it('throws a loud PromptLoadError when temperature is not a number', () => {
    stage(
      'bad-temp.v1',
      [
        '---',
        'stage: bad',
        'version: "1.0"',
        'model: claude-opus-4-7',
        'temperature: hot',
        '---',
        '',
        'body',
      ].join('\n'),
    );
    expect(() => loadPrompt('bad-temp.v1', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('bad-temp.v1', { root })).toThrow(/temperature/);
  });

  it('throws a loud PromptLoadError when the YAML frontmatter is malformed', () => {
    stage(
      'malformed.v1',
      ['---', 'stage: malformed', 'version: 1.0', 'model: [unterminated', '---', 'body'].join('\n'),
    );
    expect(() => loadPrompt('malformed.v1', { root })).toThrow(PromptLoadError);
  });

  it('throws a loud PromptLoadError when the system message is empty before the user-template header', () => {
    stage(
      'empty-system.v1',
      [
        '---',
        'stage: empty',
        'version: "1.0"',
        'model: claude-opus-4-7',
        'temperature: 0.2',
        '---',
        '',
        '# User message template',
        '',
        'template body',
      ].join('\n'),
    );
    expect(() => loadPrompt('empty-system.v1', { root })).toThrow(PromptLoadError);
    expect(() => loadPrompt('empty-system.v1', { root })).toThrow(/system message/);
  });
});
