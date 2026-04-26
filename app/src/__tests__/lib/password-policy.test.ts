/**
 * Tests for the password policy module.
 *
 * Covers:
 *   - synchronous policy: length, single-char repeat
 *   - HIBP k-anonymity check: parses range responses, finds matches by suffix,
 *     fails open on network error, ignores Add-Padding synthetic 0-count rows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy,
  checkPasswordBreached,
} from '@/lib/password-policy';

describe('validatePasswordPolicy', () => {
  it('rejects passwords shorter than the minimum', () => {
    const r = validatePasswordPolicy('short');
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(new RegExp(`at least ${MIN_PASSWORD_LENGTH}`));
  });

  it('rejects single-character repeats even if long enough', () => {
    const r = validatePasswordPolicy('aaaaaaaaaaaaa');
    expect(r.ok).toBe(false);
    expect(r.reasons.some((s) => /single character repeated/.test(s))).toBe(true);
  });

  it('accepts a long mixed password', () => {
    const r = validatePasswordPolicy('correct horse battery staple');
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('accepts exactly minimum-length when varied', () => {
    // 12 chars with multiple unique characters
    const r = validatePasswordPolicy('abcdefghijkl');
    expect(r.ok).toBe(true);
  });
});

describe('checkPasswordBreached', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  // Prefix: 5BAA6, Suffix: 1E4C9B93F3F0682250B6CF8331B7EE68FD8

  it('returns breached:true when suffix appears in HIBP range with positive count', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '0010000000000000000000000000000000000:0\r\n' +
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9876543\r\n' +
        '7C50376F0AED7AB9F39E1C70D3CA15F73C7:42',
    });
    const r = await checkPasswordBreached('password', { fetchImpl: fetchImpl as never });
    expect(r.breached).toBe(true);
    expect(r.count).toBe(9876543);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.pwnedpasswords.com/range/5BAA6',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'Add-Padding': 'true' }) }),
    );
  });

  it('returns breached:false when suffix not present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:2',
    });
    const r = await checkPasswordBreached('password', { fetchImpl: fetchImpl as never });
    expect(r.breached).toBe(false);
    expect(r.count).toBe(0);
  });

  it('treats Add-Padding zero-count rows as not-breached even when suffix matches', async () => {
    // The HIBP Add-Padding header pads the response with synthetic rows whose
    // count is 0. A naive "suffix matched" check would false-positive on these.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:0',
    });
    const r = await checkPasswordBreached('password', { fetchImpl: fetchImpl as never });
    expect(r.breached).toBe(false);
  });

  it('fails open when the network request errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const r = await checkPasswordBreached('correct horse battery staple', { fetchImpl: fetchImpl as never });
    expect(r.breached).toBe(false);
    expect(r.count).toBe(0);
  });

  it('fails open when the API returns a non-OK status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, text: async () => '' });
    const r = await checkPasswordBreached('correct horse battery staple', { fetchImpl: fetchImpl as never });
    expect(r.breached).toBe(false);
  });
});
