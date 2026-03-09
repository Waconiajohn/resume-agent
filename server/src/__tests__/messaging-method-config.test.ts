/**
 * MESSAGING_METHOD_CONFIG — Unit tests.
 *
 * Sprint 63-6 — Three Messaging Methods (Story 63-1).
 *
 * Verifies the static configuration constant that defines the three supported
 * LinkedIn messaging methods: group_message, connection_request, and inmail.
 */

import { describe, it, expect } from 'vitest';
import {
  MESSAGING_METHOD_CONFIG,
  type MessagingMethod,
} from '../agents/networking-outreach/types.js';

// ─── Shape ────────────────────────────────────────────────────────────────────

describe('MESSAGING_METHOD_CONFIG — shape', () => {
  it('defines exactly 3 messaging methods', () => {
    const keys = Object.keys(MESSAGING_METHOD_CONFIG);
    expect(keys).toHaveLength(3);
  });

  it('includes group_message, connection_request, and inmail keys', () => {
    const keys = Object.keys(MESSAGING_METHOD_CONFIG) as MessagingMethod[];
    expect(keys).toContain('group_message');
    expect(keys).toContain('connection_request');
    expect(keys).toContain('inmail');
  });

  it('every method has a label field that is a non-empty string', () => {
    for (const [, config] of Object.entries(MESSAGING_METHOD_CONFIG)) {
      expect(typeof config.label).toBe('string');
      expect(config.label.length).toBeGreaterThan(0);
    }
  });

  it('every method has a maxChars field that is a positive integer', () => {
    for (const [, config] of Object.entries(MESSAGING_METHOD_CONFIG)) {
      expect(typeof config.maxChars).toBe('number');
      expect(Number.isInteger(config.maxChars)).toBe(true);
      expect(config.maxChars).toBeGreaterThan(0);
    }
  });

  it('every method has a coaching field that is a non-empty string', () => {
    for (const [, config] of Object.entries(MESSAGING_METHOD_CONFIG)) {
      expect(typeof config.coaching).toBe('string');
      expect(config.coaching.length).toBeGreaterThan(0);
    }
  });

  it('every method has a description field that is a non-empty string', () => {
    for (const [, config] of Object.entries(MESSAGING_METHOD_CONFIG)) {
      expect(typeof config.description).toBe('string');
      expect(config.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── Character limits ─────────────────────────────────────────────────────────

describe('MESSAGING_METHOD_CONFIG — character limits', () => {
  it('group_message has maxChars of 8000', () => {
    expect(MESSAGING_METHOD_CONFIG.group_message.maxChars).toBe(8000);
  });

  it('connection_request has maxChars of 300', () => {
    expect(MESSAGING_METHOD_CONFIG.connection_request.maxChars).toBe(300);
  });

  it('inmail has maxChars of 1900', () => {
    expect(MESSAGING_METHOD_CONFIG.inmail.maxChars).toBe(1900);
  });

  it('group_message has the highest character limit (free messaging advantage)', () => {
    const limits = Object.values(MESSAGING_METHOD_CONFIG).map((c) => c.maxChars);
    expect(MESSAGING_METHOD_CONFIG.group_message.maxChars).toBe(Math.max(...limits));
  });

  it('connection_request has the lowest character limit', () => {
    const limits = Object.values(MESSAGING_METHOD_CONFIG).map((c) => c.maxChars);
    expect(MESSAGING_METHOD_CONFIG.connection_request.maxChars).toBe(Math.min(...limits));
  });
});

// ─── Labels ───────────────────────────────────────────────────────────────────

describe('MESSAGING_METHOD_CONFIG — labels', () => {
  it('group_message label is "Group Message"', () => {
    expect(MESSAGING_METHOD_CONFIG.group_message.label).toBe('Group Message');
  });

  it('connection_request label is "Connection Request"', () => {
    expect(MESSAGING_METHOD_CONFIG.connection_request.label).toBe('Connection Request');
  });

  it('inmail label is "InMail"', () => {
    expect(MESSAGING_METHOD_CONFIG.inmail.label).toBe('InMail');
  });
});
