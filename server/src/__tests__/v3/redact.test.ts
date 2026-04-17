// Redaction utility tests — purely mechanical, no LLM.

import { describe, expect, it } from 'vitest';
import { redactFixture } from '../../v3/test-fixtures/redact.js';

describe('redactFixture', () => {
  describe('email', () => {
    it('redacts every email in the input', () => {
      const input = 'Contact me at jane.doe@example.com or jdoe@co.net';
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Jane Doe',
      });
      expect(redacted).not.toMatch(/jane\.doe@example\.com/);
      expect(redacted).not.toMatch(/jdoe@co\.net/);
      expect(redacted.match(/\[REDACTED EMAIL\]/g)).toHaveLength(2);
      const emailCount = redactions.find((r) => r.kind === 'email')?.count ?? 0;
      expect(emailCount).toBe(2);
    });
  });

  describe('phone', () => {
    it('redacts many US phone formats', () => {
      const input = [
        'Call (415) 555-1234.',
        'or 415-555-1234',
        'or 415.555.1234',
        'or +1 415 555-1234',
      ].join('\n');
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Alex Rivers',
      });
      expect(redacted.match(/\[REDACTED PHONE\]/g)).toHaveLength(4);
      const phoneCount = redactions.find((r) => r.kind === 'phone')?.count ?? 0;
      expect(phoneCount).toBe(4);
    });

    it('does not match 4-digit numbers inside content', () => {
      const input = 'Managed a team of 1234 across 5678 projects';
      const { redacted } = redactFixture(input, { candidateName: 'Alex Rivers' });
      expect(redacted).not.toMatch(/\[REDACTED PHONE\]/);
    });
  });

  describe('LinkedIn', () => {
    it('redacts linkedin.com/in/<handle> URLs in common forms', () => {
      const input = [
        'linkedin.com/in/janedoe',
        'https://www.linkedin.com/in/jane-doe-123',
        '[linkedin.com/in/janedoe](https://www.linkedin.com/in/janedoe)',
      ].join('\n');
      const { redacted } = redactFixture(input, { candidateName: 'Jane Doe' });
      expect(redacted).not.toMatch(/linkedin\.com\/in\//i);
    });
  });

  describe('GitHub', () => {
    it('redacts github.com URLs', () => {
      const input = 'https://github.com/alice or github.com/alice';
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Alice Example',
      });
      expect(redacted).not.toMatch(/github\.com\//i);
      const c = redactions.find((r) => r.kind === 'github_url')?.count ?? 0;
      expect(c).toBe(2);
    });
  });

  describe('name', () => {
    it('redacts the full name anywhere in the text', () => {
      const input = 'Jane Doe is a senior engineer. — Jane Doe';
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Jane Doe',
      });
      expect(redacted).not.toMatch(/Jane Doe/);
      const full = redactions.find((r) => r.kind === 'full_name')?.count ?? 0;
      expect(full).toBe(2);
    });

    it('redacts first-name and last-name tokens independently', () => {
      const input = 'Jane leads the team. Later, Doe led quality.';
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Jane Doe',
      });
      expect(redacted).not.toMatch(/\bJane\b/);
      expect(redacted).not.toMatch(/\bDoe\b/);
      const tokenHits = redactions.filter((r) => r.kind === 'name_token');
      expect(tokenHits.length).toBeGreaterThan(0);
    });

    it('redacts names wrapped in markdown emphasis like __Diana Downs__', () => {
      // \b treats `_` as a word char, so the naive approach failed here.
      // Letter-only boundaries handle this.
      const input = '__Diana Downs__\n__Diana Downs   __';
      const { redacted } = redactFixture(input, {
        candidateName: 'Diana Downs',
      });
      expect(redacted).not.toMatch(/Diana/);
      expect(redacted).not.toMatch(/Downs/);
      // The `__` markers survive — only the name goes.
      expect(redacted).toContain('__');
    });

    it('redacts names wrapped in bold-asterisks like **Paul Manzione**', () => {
      const input = '**Paul Manzione**';
      const { redacted } = redactFixture(input, {
        candidateName: 'Paul Manzione',
      });
      expect(redacted).not.toMatch(/Paul/);
      expect(redacted).not.toMatch(/Manzione/);
    });

    it('does not match tokens embedded inside larger words', () => {
      // "Ben" must not redact "Benjamin" or "Bensonhurst".
      const input = 'Worked at Benjamin Franklin Partners in Bensonhurst.';
      const { redacted } = redactFixture(input, {
        candidateName: 'Ben Wedewer',
      });
      expect(redacted).toMatch(/Benjamin/);
      expect(redacted).toMatch(/Bensonhurst/);
    });

    it('skips initials and credential tokens', () => {
      // "R." and "PhD" in name should not generate token redactions.
      const input = 'The candidate, R. David Chicks, PhD, is an engineer.';
      const { redacted } = redactFixture(input, {
        candidateName: 'R. David Chicks',
      });
      // "David" and "Chicks" get redacted; "R." and "PhD" are untouched.
      expect(redacted).toMatch(/\[REDACTED NAME\]/);
      expect(redacted).toMatch(/PhD/);
    });

    it('honors redactSkipTokens for per-fixture overrides', () => {
      // If "David" is a company name we want to keep, opt out.
      const input = 'David Chicks worked at David\'s Cookies.';
      const { redacted } = redactFixture(input, {
        candidateName: 'David Chicks',
        redactSkipTokens: ['david'],
      });
      // Full-name "David Chicks" still redacted; lone "David" preserved.
      expect(redacted).toMatch(/\[REDACTED NAME\]/);
      expect(redacted).toMatch(/David's Cookies/);
    });
  });

  describe('personal sites', () => {
    it('redacts a portfolio domain that contains a name token', () => {
      const input = 'Portfolio: pmanzione.design (password: Schrute-Bucks)';
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Paul Manzione',
      });
      expect(redacted).toMatch(/\[REDACTED URL\]/);
      expect(redacted).not.toMatch(/pmanzione\.design/i);
      const c = redactions.find((r) => r.kind === 'personal_site')?.count ?? 0;
      expect(c).toBeGreaterThan(0);
    });

    it('leaves unrelated domains alone', () => {
      const input = 'Company site: acme.com | Employer: stripe.com';
      const { redacted } = redactFixture(input, {
        candidateName: 'Paul Manzione',
      });
      expect(redacted).toContain('acme.com');
      expect(redacted).toContain('stripe.com');
    });
  });

  describe('References section', () => {
    it('truncates everything from the References header to end of file', () => {
      const input = [
        'Jane Doe',
        'Engineer',
        'Experience at BigCo',
        '',
        '__*References*__',
        '',
        'Alice Smith - alice@example.com',
        'Bob Jones - bob@example.com',
      ].join('\n');
      const { redacted, redactions } = redactFixture(input, {
        candidateName: 'Jane Doe',
      });
      expect(redacted).toContain('Engineer');
      expect(redacted).not.toMatch(/References/i);
      expect(redacted).not.toMatch(/Alice Smith/);
      expect(redacted).not.toMatch(/Bob Jones/);
      // Emails inside references are gone because the whole section went.
      expect(redactions.some((r) => r.kind === 'references_section')).toBe(true);
    });

    it('matches References heading with markdown decoration', () => {
      const input = 'content\n\n## References\n\nAlice, alice@example.com';
      const { redacted } = redactFixture(input, { candidateName: 'Alex' });
      expect(redacted).not.toMatch(/Alice/);
    });
  });

  describe('residual warnings', () => {
    it('returns no warnings when every match was handled', () => {
      const input = 'Jane Doe jane@example.com 415-555-1234';
      const { residualWarnings } = redactFixture(input, {
        candidateName: 'Jane Doe',
      });
      expect(residualWarnings).toEqual([]);
    });
  });

  describe('street address', () => {
    it('redacts numeric-prefixed mailing addresses', () => {
      const input = '13235 Patriotic Way\nFishers, IN 46037';
      const { redacted } = redactFixture(input, {
        candidateName: 'Some Person',
      });
      expect(redacted).not.toMatch(/13235 Patriotic Way/);
      // City/state and ZIP preserved (ZIP is out of scope for this redactor).
      expect(redacted).toContain('Fishers, IN 46037');
    });
  });
});
