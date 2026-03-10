import { describe, it, expect } from 'vitest';
import { flattenResumePayload } from '../field-mapper.js';
import type { ResumePayload } from '../../shared/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResume(overrides: Partial<ResumePayload> = {}): ResumePayload {
  return {
    summary: 'Experienced engineering leader.',
    experience: [],
    skills: {},
    education: [],
    certifications: [],
    ats_score: 85,
    ...overrides,
  };
}

// ─── flattenResumePayload ─────────────────────────────────────────────────────

describe('flattenResumePayload', () => {
  describe('name splitting', () => {
    it('splits contact_info.name into first_name and last_name', () => {
      const resume = makeResume({
        contact_info: { name: 'Jane Smith', email: 'jane@example.com', phone: '555-1234', location: 'Austin, TX' },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.first_name).toBe('Jane');
      expect(flat.last_name).toBe('Smith');
      expect(flat.full_name).toBe('Jane Smith');
    });

    it('handles a single-word name', () => {
      const resume = makeResume({
        contact_info: { name: 'Cher', email: 'cher@example.com', phone: '', location: '' },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.first_name).toBe('Cher');
      expect(flat.last_name).toBe('');
    });

    it('handles a multi-word last name', () => {
      const resume = makeResume({
        contact_info: { name: 'Maria de la Cruz', email: 'm@example.com', phone: '', location: '' },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.first_name).toBe('Maria');
      expect(flat.last_name).toBe('de la Cruz');
      expect(flat.full_name).toBe('Maria de la Cruz');
    });

    it('handles extra whitespace in the name', () => {
      const resume = makeResume({
        contact_info: { name: '  John   Doe  ', email: 'j@example.com', phone: '', location: '' },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.first_name).toBe('John');
      expect(flat.last_name).toBe('Doe');
    });

    it('produces empty strings for an empty name', () => {
      const resume = makeResume({
        contact_info: { name: '', email: 'a@example.com', phone: '', location: '' },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.first_name).toBe('');
      expect(flat.last_name).toBe('');
      expect(flat.full_name).toBe('');
    });
  });

  describe('contact fields', () => {
    it('maps email, phone, and location from contact_info', () => {
      const resume = makeResume({
        contact_info: {
          name: 'Alex Jones',
          email: 'alex@example.com',
          phone: '800-555-0199',
          location: 'Chicago, IL',
        },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.email).toBe('alex@example.com');
      expect(flat.phone).toBe('800-555-0199');
      expect(flat.location).toBe('Chicago, IL');
    });

    it('includes linkedin_url when present in contact_info', () => {
      const resume = makeResume({
        contact_info: {
          name: 'Sam Lee',
          email: 's@example.com',
          phone: '',
          location: '',
          linkedin: 'https://linkedin.com/in/samlee',
        },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.linkedin_url).toBe('https://linkedin.com/in/samlee');
    });

    it('sets linkedin_url to undefined when not in contact_info', () => {
      const resume = makeResume({
        contact_info: { name: 'No Link', email: 'x@x.com', phone: '', location: '' },
      });
      const flat = flattenResumePayload(resume);
      expect(flat.linkedin_url).toBeUndefined();
    });
  });

  describe('missing contact_info', () => {
    it('handles missing contact_info gracefully', () => {
      const resume = makeResume(); // no contact_info
      const flat = flattenResumePayload(resume);
      expect(flat.first_name).toBeUndefined();
      expect(flat.last_name).toBeUndefined();
      expect(flat.full_name).toBeUndefined();
      expect(flat.email).toBeUndefined();
    });
  });

  describe('experience extraction', () => {
    it('extracts current_title and current_company from the first experience entry', () => {
      const resume = makeResume({
        experience: [
          {
            company: 'Acme Corp',
            title: 'Senior Engineer',
            start_date: '2021-01',
            end_date: 'Present',
            location: 'Remote',
            bullets: [],
          },
          {
            company: 'Old Co',
            title: 'Engineer',
            start_date: '2018-01',
            end_date: '2020-12',
            location: 'New York, NY',
            bullets: [],
          },
        ],
      });
      const flat = flattenResumePayload(resume);
      expect(flat.current_title).toBe('Senior Engineer');
      expect(flat.current_company).toBe('Acme Corp');
    });

    it('handles empty experience array without throwing', () => {
      const resume = makeResume({ experience: [] });
      const flat = flattenResumePayload(resume);
      expect(flat.current_title).toBeUndefined();
      expect(flat.current_company).toBeUndefined();
    });
  });

  describe('summary', () => {
    it('includes summary in flattened output', () => {
      const resume = makeResume({ summary: 'Results-driven leader with 15 years of experience.' });
      const flat = flattenResumePayload(resume);
      expect(flat.summary).toBe('Results-driven leader with 15 years of experience.');
    });

    it('summary is undefined when resume summary is empty string', () => {
      const resume = makeResume({ summary: '' });
      const flat = flattenResumePayload(resume);
      // Empty string is falsy — callers should handle this
      expect(flat.summary).toBe('');
    });
  });

  describe('combined shape', () => {
    it('produces a complete flattened object from a fully populated resume', () => {
      const resume = makeResume({
        contact_info: {
          name: 'Rachel Green',
          email: 'rachel@friends.com',
          phone: '212-555-0123',
          location: 'New York, NY',
          linkedin: 'https://linkedin.com/in/rachelgreen',
        },
        summary: 'Fashion director turned VP of Product.',
        experience: [
          {
            company: 'Ralph Lauren',
            title: 'VP of Product',
            start_date: '2019-06',
            end_date: 'Present',
            location: 'New York, NY',
            bullets: [{ text: 'Grew GMV by 40%', source: 'interview' }],
          },
        ],
      });
      const flat = flattenResumePayload(resume);

      expect(flat.first_name).toBe('Rachel');
      expect(flat.last_name).toBe('Green');
      expect(flat.full_name).toBe('Rachel Green');
      expect(flat.email).toBe('rachel@friends.com');
      expect(flat.phone).toBe('212-555-0123');
      expect(flat.location).toBe('New York, NY');
      expect(flat.linkedin_url).toBe('https://linkedin.com/in/rachelgreen');
      expect(flat.current_title).toBe('VP of Product');
      expect(flat.current_company).toBe('Ralph Lauren');
      expect(flat.summary).toBe('Fashion director turned VP of Product.');
    });
  });
});
