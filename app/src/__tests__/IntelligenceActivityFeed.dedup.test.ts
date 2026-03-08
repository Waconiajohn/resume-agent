import { describe, it, expect } from 'vitest';
import {
  deduplicateMessages,
  type ActivityMessage,
  type DedupedMessage,
} from '../components/IntelligenceActivityFeed';

// ─── Factories ────────────────────────────────────────────────────────────────

let _seq = 0;
function makeMsg(
  message: string,
  timestamp: number,
  overrides?: Partial<ActivityMessage>,
): ActivityMessage {
  _seq += 1;
  return { id: `msg-${_seq}`, message, timestamp, ...overrides };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deduplicateMessages', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateMessages([])).toEqual([]);
  });

  it('passes a single message through unchanged with count=1', () => {
    const msg = makeMsg('Researching the company...', 1000);
    const result = deduplicateMessages([msg]);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
    expect(result[0].message).toBe(msg.message);
    expect(result[0].id).toBe(msg.id);
  });

  it('collapses adjacent identical messages within 5-second window', () => {
    const t = 10_000;
    const a = makeMsg('Reviewing the draft...', t);
    const b = makeMsg('Reviewing the draft...', t + 2_000); // +2s — within window

    const result = deduplicateMessages([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });

  it('does NOT collapse adjacent identical messages more than 5s apart', () => {
    const t = 10_000;
    const a = makeMsg('Reviewing the draft...', t);
    const b = makeMsg('Reviewing the draft...', t + 5_001); // just over 5s

    const result = deduplicateMessages([a, b]);

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(1);
  });

  it('does NOT collapse non-adjacent identical messages (different message in between)', () => {
    const t = 10_000;
    const a = makeMsg('Researching the company...', t);
    const b = makeMsg('Reading your resume...', t + 1_000);
    const c = makeMsg('Researching the company...', t + 2_000);

    const result = deduplicateMessages([a, b, c]);

    expect(result).toHaveLength(3);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(1);
    expect(result[2].count).toBe(1);
  });

  it('collapsed message uses the last occurrence id and timestamp', () => {
    const t = 10_000;
    const a = makeMsg('Reviewing the draft...', t, { id: 'first' });
    const b = makeMsg('Reviewing the draft...', t + 1_500, { id: 'second' });
    const c = makeMsg('Reviewing the draft...', t + 3_000, { id: 'third' });

    const result = deduplicateMessages([a, b, c]);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].id).toBe('third');
    expect(result[0].timestamp).toBe(t + 3_000);
  });

  it('shows correct count for a run of identical messages', () => {
    const t = 0;
    const msgs = Array.from({ length: 5 }, (_, i) =>
      makeMsg('Writing your summary section...', t + i * 500),
    );

    const result = deduplicateMessages(msgs);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(5);
  });

  it('does not collapse isSummary messages even when adjacent and within 5s', () => {
    const t = 10_000;
    const a = makeMsg('Stage complete', t, { isSummary: true });
    const b = makeMsg('Stage complete', t + 1_000, { isSummary: true });

    const result = deduplicateMessages([a, b]);

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(1);
  });

  it('does not collapse a normal message into an adjacent isSummary with the same text', () => {
    const t = 10_000;
    const a = makeMsg('Checking compatibility...', t, { isSummary: true });
    const b = makeMsg('Checking compatibility...', t + 500); // not a summary

    const result = deduplicateMessages([a, b]);

    expect(result).toHaveLength(2);
  });

  it('does not collapse an isSummary message into an adjacent normal message with the same text', () => {
    const t = 10_000;
    const a = makeMsg('Checking compatibility...', t);
    const b = makeMsg('Checking compatibility...', t + 500, { isSummary: true });

    const result = deduplicateMessages([a, b]);

    expect(result).toHaveLength(2);
  });

  it('handles multiple separate duplicate runs correctly', () => {
    const t = 0;
    // Run 1: 3 identical within window
    const run1 = [
      makeMsg('Reading your resume...', t),
      makeMsg('Reading your resume...', t + 1_000),
      makeMsg('Reading your resume...', t + 2_000),
    ];
    // Separator
    const sep = makeMsg('Studying the job posting...', t + 3_000);
    // Run 2: 2 identical within window
    const run2 = [
      makeMsg('Researching the company...', t + 4_000),
      makeMsg('Researching the company...', t + 4_500),
    ];

    const result = deduplicateMessages([...run1, sep, ...run2]);

    expect(result).toHaveLength(3);
    expect(result[0].count).toBe(3);
    expect(result[0].message).toBe('Reading your resume...');
    expect(result[1].count).toBe(1);
    expect(result[1].message).toBe('Studying the job posting...');
    expect(result[2].count).toBe(2);
    expect(result[2].message).toBe('Researching the company...');
  });

  it('result entries satisfy the DedupedMessage shape', () => {
    const msg = makeMsg('Working...', 5000);
    const result: DedupedMessage[] = deduplicateMessages([msg]);

    // DedupedMessage extends ActivityMessage — all fields must be present
    expect(result[0]).toMatchObject({
      id: msg.id,
      message: msg.message,
      timestamp: msg.timestamp,
      count: 1,
    });
  });

  it('exactly-5s gap is within window and is collapsed', () => {
    const t = 10_000;
    const a = makeMsg('Researching the company...', t);
    const b = makeMsg('Researching the company...', t + 5_000); // exactly 5s

    const result = deduplicateMessages([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });
});
