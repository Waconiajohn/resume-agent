import { describe, it, expect } from 'vitest';
import { mergeMasterResume } from '../agents/master-resume-merge.js';
import type { MasterResumeData, MasterResumeEvidenceItem } from '../agents/types.js';

function makeExisting(overrides?: Partial<MasterResumeData>): MasterResumeData {
  return {
    id: 'mr-1',
    summary: 'Experienced engineering leader.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2020',
        end_date: 'Present',
        location: 'San Francisco, CA',
        bullets: [
          { text: 'Led team of 50 engineers across 3 offices', source: 'resume' },
          { text: 'Increased deployment frequency by 300%', source: 'crafted' },
        ],
      },
    ],
    skills: { 'Leadership': ['Team Building', 'Strategic Planning'] },
    education: [{ institution: 'MIT', degree: 'BS Computer Science', field: 'CS', year: '2005' }],
    certifications: [{ name: 'PMP', issuer: 'PMI', year: '2015' }],
    evidence_items: [
      {
        text: 'Managed $10M annual budget',
        source: 'interview',
        category: 'scale_and_scope',
        source_session_id: 'session-old',
        created_at: '2026-02-01T00:00:00Z',
      },
    ],
    contact_info: { name: 'John Doe', email: 'john@example.com' },
    raw_text: 'John Doe resume raw text...',
    version: 2,
    ...overrides,
  };
}

function makeNewResume() {
  return {
    summary: 'Senior engineering executive with P&L ownership.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2020',
        end_date: 'Present',
        location: 'San Francisco, CA',
        bullets: [
          { text: 'Increased deployment frequency by 300%', source: 'crafted' }, // duplicate
          { text: 'Drove $5M cost reduction through cloud migration', source: 'crafted' }, // new
        ],
      },
      {
        company: 'StartupXYZ',
        title: 'CTO',
        start_date: '2017',
        end_date: '2020',
        location: 'Remote',
        bullets: [
          { text: 'Built engineering team from 0 to 25', source: 'crafted' },
        ],
      },
    ],
    skills: { 'Leadership': ['Team Building', 'Agile'], 'Technical': ['AWS', 'Kubernetes'] },
    education: [
      { institution: 'MIT', degree: 'BS Computer Science', field: 'CS', year: '2005' }, // duplicate
      { institution: 'Stanford', degree: 'MBA', field: 'Business', year: '2012' }, // new
    ],
    certifications: [
      { name: 'PMP', issuer: 'PMI', year: '2015' }, // duplicate
      { name: 'AWS Solutions Architect', issuer: 'AWS', year: '2023' }, // new
    ],
    ats_score: 92,
    contact_info: { name: 'John Doe', email: 'john@newmail.com', phone: '555-1234' },
  };
}

describe('mergeMasterResume', () => {
  it('merges experience bullets without duplicates', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();

    const result = mergeMasterResume(existing, newResume, []);

    // Acme Corp role should have 3 bullets (2 original + 1 new), not 4
    const acmeRole = result.experience.find(r => r.company === 'Acme Corp');
    expect(acmeRole).toBeDefined();
    expect(acmeRole!.bullets).toHaveLength(3);
    expect(acmeRole!.bullets.map(b => b.text)).toContain('Drove $5M cost reduction through cloud migration');
    expect(acmeRole!.bullets.map(b => b.text)).toContain('Led team of 50 engineers across 3 offices');
    expect(acmeRole!.bullets.map(b => b.text)).toContain('Increased deployment frequency by 300%');
  });

  it('appends new roles that do not match existing ones', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();

    const result = mergeMasterResume(existing, newResume, []);

    expect(result.experience).toHaveLength(2);
    const startupRole = result.experience.find(r => r.company === 'StartupXYZ');
    expect(startupRole).toBeDefined();
    expect(startupRole!.title).toBe('CTO');
  });

  it('deduplicates evidence items by exact text match', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();
    const newEvidence: MasterResumeEvidenceItem[] = [
      {
        text: 'Managed $10M annual budget', // duplicate
        source: 'interview',
        category: 'scale_and_scope',
        source_session_id: 'session-new',
        created_at: '2026-02-27T00:00:00Z',
      },
      {
        text: 'Implemented CI/CD pipeline reducing release time by 80%',
        source: 'crafted',
        source_session_id: 'session-new',
        created_at: '2026-02-27T00:00:00Z',
      },
    ];

    const result = mergeMasterResume(existing, newResume, newEvidence);

    // Should have 2 evidence items (1 existing + 1 new), not 3
    expect(result.evidence_items).toHaveLength(2);
    expect(result.evidence_items.map(e => e.text)).toContain('Implemented CI/CD pipeline reducing release time by 80%');
    expect(result.evidence_items.map(e => e.text)).toContain('Managed $10M annual budget');
  });

  it('performs case-insensitive skill union', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();

    const result = mergeMasterResume(existing, newResume, []);

    // Leadership should have 3 skills: Team Building (deduped), Strategic Planning, Agile
    expect(result.skills['Leadership']).toHaveLength(3);
    expect(result.skills['Leadership']).toContain('Team Building');
    expect(result.skills['Leadership']).toContain('Strategic Planning');
    expect(result.skills['Leadership']).toContain('Agile');

    // Technical is a new category
    expect(result.skills['Technical']).toEqual(['AWS', 'Kubernetes']);
  });

  it('handles first-time save (empty existing)', () => {
    const existing = makeExisting({
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      evidence_items: [],
      summary: '',
    });
    const newResume = makeNewResume();
    const evidence: MasterResumeEvidenceItem[] = [
      { text: 'New evidence', source: 'crafted', source_session_id: 's1', created_at: '2026-02-27T00:00:00Z' },
    ];

    const result = mergeMasterResume(existing, newResume, evidence);

    expect(result.experience).toHaveLength(2);
    expect(result.evidence_items).toHaveLength(1);
    expect(result.summary).toBe('Senior engineering executive with P&L ownership.');
  });

  it('deduplicates education and certifications', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();

    const result = mergeMasterResume(existing, newResume, []);

    // Education: MIT (deduped) + Stanford (new)
    expect(result.education).toHaveLength(2);
    expect(result.education.map(e => e.institution)).toContain('Stanford');

    // Certifications: PMP (deduped) + AWS (new)
    expect(result.certifications).toHaveLength(2);
    expect(result.certifications.map(c => c.name)).toContain('AWS Solutions Architect');
  });

  it('uses latest contact info', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();

    const result = mergeMasterResume(existing, newResume, []);

    expect(result.contact_info).toEqual({ name: 'John Doe', email: 'john@newmail.com', phone: '555-1234' });
  });

  it('matches roles case-insensitively', () => {
    const existing = makeExisting();
    // Override with different casing
    const newResume = makeNewResume();
    newResume.experience[0].company = 'ACME CORP';
    newResume.experience[0].title = 'vp engineering';

    const result = mergeMasterResume(existing, newResume, []);

    // Should still merge into the same role, not create a duplicate
    expect(result.experience).toHaveLength(2); // Acme + StartupXYZ
    const acmeRole = result.experience.find(r => r.company === 'Acme Corp');
    expect(acmeRole).toBeDefined();
    expect(acmeRole!.bullets).toHaveLength(3);
  });
});
