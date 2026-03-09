import { describe, it, expect } from 'vitest';
import { safeString, safeStringArray, safeNumber } from '@/lib/safe-cast';

describe('safeString', () => {
  it('passes through a string value unchanged', () => {
    expect(safeString('hello')).toBe('hello');
  });

  it('passes through an empty string unchanged', () => {
    expect(safeString('')).toBe('');
  });

  it('returns the default fallback for null', () => {
    expect(safeString(null)).toBe('');
  });

  it('returns the default fallback for undefined', () => {
    expect(safeString(undefined)).toBe('');
  });

  it('returns a custom fallback for null', () => {
    expect(safeString(null, 'fallback')).toBe('fallback');
  });

  it('converts a number to its string representation', () => {
    expect(safeString(42)).toBe('42');
  });

  it('converts zero to its string representation', () => {
    expect(safeString(0)).toBe('0');
  });

  it('converts a boolean to its string representation', () => {
    expect(safeString(true)).toBe('true');
  });
});

describe('safeStringArray', () => {
  it('passes through a string array unchanged', () => {
    expect(safeStringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('passes through an empty array unchanged', () => {
    expect(safeStringArray([])).toEqual([]);
  });

  it('filters out non-string items from a mixed array', () => {
    expect(safeStringArray(['a', 1, null, 'b', undefined, true])).toEqual(['a', 'b']);
  });

  it('returns an empty array for a non-array value', () => {
    expect(safeStringArray('not an array')).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(safeStringArray(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(safeStringArray(undefined)).toEqual([]);
  });

  it('returns an empty array for an object', () => {
    expect(safeStringArray({ key: 'value' })).toEqual([]);
  });
});

describe('safeNumber', () => {
  it('passes through a valid number unchanged', () => {
    expect(safeNumber(42)).toBe(42);
  });

  it('passes through zero unchanged', () => {
    expect(safeNumber(0)).toBe(0);
  });

  it('passes through a negative number unchanged', () => {
    expect(safeNumber(-5)).toBe(-5);
  });

  it('returns the default fallback for NaN', () => {
    expect(safeNumber(NaN)).toBe(0);
  });

  it('parses a numeric string', () => {
    expect(safeNumber('42')).toBe(42);
  });

  it('parses a decimal string', () => {
    expect(safeNumber('3.14')).toBe(3.14);
  });

  it('returns the default fallback for a non-numeric string', () => {
    expect(safeNumber('hello')).toBe(0);
  });

  it('returns the default fallback for null', () => {
    expect(safeNumber(null)).toBe(0);
  });

  it('returns the default fallback for undefined', () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it('returns a custom fallback when the value is invalid', () => {
    expect(safeNumber('bad', -1)).toBe(-1);
  });
});
