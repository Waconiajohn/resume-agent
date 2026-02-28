import { describe, it, expect } from 'vitest';
import { repairJSON } from '../lib/json-repair.js';

describe('repairJSON — size guard and basic functionality', () => {
  it('returns null for large inputs that exceed the 50KB threshold', () => {
    // Build a string that is > 50_000 chars and contains invalid JSON
    // so earlier parse steps all fail before hitting the size check.
    // We construct an unclosed object so JSON.parse fails, then pad it
    // well beyond 50KB.
    const invalid = '{' + 'x'.repeat(60_000);

    const result = repairJSON(invalid);

    expect(result).toBeNull();
  });

  it('parses valid JSON of normal size without modification', () => {
    const input = '{"key": "value", "count": 42}';

    const result = repairJSON<{ key: string; count: number }>(input);

    expect(result).toEqual({ key: 'value', count: 42 });
  });

  it('repairs a trailing comma inside an object', () => {
    const input = '{"key": "value",}';

    const result = repairJSON<{ key: string }>(input);

    expect(result).toEqual({ key: 'value' });
  });

  it('repairs a trailing comma inside an array', () => {
    const input = '["a", "b", "c",]';

    const result = repairJSON<string[]>(input);

    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('strips markdown json fences before parsing', () => {
    const input = '```json\n{"answer": true}\n```';

    const result = repairJSON<{ answer: boolean }>(input);

    expect(result).toEqual({ answer: true });
  });

  it('returns null for input that cannot be repaired', () => {
    // Deliberately unrecoverable — not JSON at all and small enough to reach all steps
    const result = repairJSON('this is just plain text with no JSON');

    expect(result).toBeNull();
  });
});
