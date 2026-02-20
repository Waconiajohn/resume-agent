import { describe, expect, it, vi } from 'vitest';
import { retryDelayMsFromHeaders } from './http-retry';

describe('retryDelayMsFromHeaders', () => {
  it('uses numeric Retry-After seconds', () => {
    const headers = new Headers([['Retry-After', '1.5']]);
    expect(retryDelayMsFromHeaders(headers, 300)).toBe(1500);
  });

  it('uses Retry-After HTTP date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T12:00:00Z'));
    const headers = new Headers([['Retry-After', 'Fri, 20 Feb 2026 12:00:02 GMT']]);
    expect(retryDelayMsFromHeaders(headers, 300)).toBe(2000);
    vi.useRealTimers();
  });

  it('falls back when header is missing or invalid', () => {
    expect(retryDelayMsFromHeaders(new Headers(), 250)).toBe(250);
    expect(retryDelayMsFromHeaders(new Headers([['Retry-After', 'not-a-value']]), 250)).toBe(250);
  });

  it('clamps extreme values', () => {
    expect(retryDelayMsFromHeaders(new Headers([['Retry-After', '0']]), 300)).toBe(100);
    expect(retryDelayMsFromHeaders(new Headers([['Retry-After', '999']]), 300)).toBe(5000);
  });
});
