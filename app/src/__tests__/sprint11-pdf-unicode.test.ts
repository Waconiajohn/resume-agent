/**
 * Sprint 11 — Story 4: PDF Unicode sanitization tests
 *
 * Verifies that sanitizePdfText correctly preserves the WinAnsi-supported
 * smart quotes, dashes, and ellipsis characters, and that the NFKD fallback
 * decomposes characters that fall outside WinAnsi (e.g. fi ligature → "fi").
 */

import { describe, it, expect } from 'vitest';
import { sanitizePdfText } from '@/lib/export-pdf';

describe('sanitizePdfText — WinAnsi character preservation', () => {
  it('preserves left single quote (U+2018) unchanged', () => {
    expect(sanitizePdfText('it\u2018s')).toBe('it\u2018s');
  });

  it('preserves right single quote (U+2019) unchanged', () => {
    expect(sanitizePdfText("don\u2019t")).toBe("don\u2019t");
  });

  it('preserves left double quote (U+201C) unchanged', () => {
    expect(sanitizePdfText('\u201CHello')).toBe('\u201CHello');
  });

  it('preserves right double quote (U+201D) unchanged', () => {
    expect(sanitizePdfText('World\u201D')).toBe('World\u201D');
  });

  it('preserves ellipsis (U+2026) unchanged', () => {
    expect(sanitizePdfText('Loading\u2026')).toBe('Loading\u2026');
  });

  it('preserves em-dash (U+2014) unchanged', () => {
    expect(sanitizePdfText('Leader\u2014recognized for impact')).toBe(
      'Leader\u2014recognized for impact',
    );
  });

  it('preserves en-dash (U+2013) unchanged', () => {
    expect(sanitizePdfText('2020\u20132024')).toBe('2020\u20132024');
  });

  it('preserves all seven WinAnsi special characters together', () => {
    const input =
      '\u2018left\u2019 \u201Cdouble\u201D \u2026 \u2014 \u2013';
    expect(sanitizePdfText(input)).toBe(input.trim());
  });
});

describe('sanitizePdfText — NFKD fallback for non-WinAnsi characters', () => {
  it('decomposes fi ligature (U+FB01) to "fi"', () => {
    expect(sanitizePdfText('\uFB01nancial')).toBe('financial');
  });

  it('decomposes fl ligature (U+FB02) to "fl"', () => {
    expect(sanitizePdfText('\uFB02ow')).toBe('flow');
  });

  it('decomposes ffi ligature (U+FB03) to "ffi"', () => {
    expect(sanitizePdfText('\uFB03cient')).toBe('fficient');
  });

  it('strips characters that cannot be normalized into WinAnsi range', () => {
    // U+1F600 (emoji) cannot decompose to ASCII/Latin-1 — should be removed
    const result = sanitizePdfText('Great\uD83D\uDE00job');
    expect(result).not.toContain('\uD83D');
    expect(result).not.toContain('\uDE00');
    expect(result).toContain('Great');
    expect(result).toContain('job');
  });
});

describe('sanitizePdfText — existing behaviour unchanged', () => {
  it('normalises multiple whitespace to single space', () => {
    expect(sanitizePdfText('too   many   spaces')).toBe('too many spaces');
  });

  it('converts uncommon bullet variants to standard bullet U+2022', () => {
    // U+2023 triangular bullet → U+2022
    expect(sanitizePdfText('\u2023 item')).toBe('\u2022 item');
  });

  it('strips zero-width space (U+200B)', () => {
    expect(sanitizePdfText('No\u200Bwhere')).toBe('Nowhere');
  });

  it('strips BOM (U+FEFF)', () => {
    expect(sanitizePdfText('\uFEFFText')).toBe('Text');
  });

  it('preserves accented Latin-1 characters (é, ñ, ü)', () => {
    expect(sanitizePdfText('caf\u00E9')).toBe('caf\u00E9');
    expect(sanitizePdfText('ma\u00F1ana')).toBe('ma\u00F1ana');
    expect(sanitizePdfText('\u00FCber')).toBe('\u00FCber');
  });

  it('maps modifier apostrophe (U+02BC) to right single quote (U+2019)', () => {
    expect(sanitizePdfText("caf\u02BCe")).toBe('caf\u2019e');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizePdfText('  hello  ')).toBe('hello');
  });
});
