import { describe, it, expect } from 'vitest';
import { mergeMasterResume, type MergeableResumePayload } from '../agents/master-resume-merge.js';
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
    contact_info: { name: 'John Doe', email: 'john@example.com', phone: '555-0000', linkedin: 'linkedin.com/in/johndoe' },
    raw_text: 'John Doe resume raw text...',
    version: 2,
    ...overrides,
  };
}

function makeNewResume(): MergeableResumePayload & { ats_score?: number } {
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
      { text: 'New evidence item for testing', source: 'crafted', source_session_id: 's1', created_at: '2026-02-27T00:00:00Z' },
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

  it('merges contact info fields (existing as base)', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();

    const result = mergeMasterResume(existing, newResume, []);

    // New values should overwrite, but existing-only fields (linkedin) should be preserved
    expect(result.contact_info).toEqual({
      name: 'John Doe',
      email: 'john@newmail.com',
      phone: '555-1234',
      linkedin: 'linkedin.com/in/johndoe',
    });
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

  // ── New test scenarios (Story 12) ──

  it('does not mutate the existing input (mutation safety)', () => {
    const existing = makeExisting();
    const originalBulletCount = existing.experience[0].bullets.length;
    const originalSkillCount = existing.skills['Leadership'].length;
    const newResume = makeNewResume();

    mergeMasterResume(existing, newResume, []);

    // Caller's existing object must remain unmodified
    expect(existing.experience[0].bullets).toHaveLength(originalBulletCount);
    expect(existing.skills['Leadership']).toHaveLength(originalSkillCount);
  });

  it('preserves existing contact_info fields when new has partial data', () => {
    const existing = makeExisting();
    const newResume = makeNewResume();
    // New resume only has email, no phone/linkedin
    newResume.contact_info = { email: 'new@example.com' };

    const result = mergeMasterResume(existing, newResume, []);

    expect(result.contact_info?.email).toBe('new@example.com');
    expect(result.contact_info?.phone).toBe('555-0000');
    expect(result.contact_info?.linkedin).toBe('linkedin.com/in/johndoe');
    expect(result.contact_info?.name).toBe('John Doe');
  });

  it('handles empty skills array without crashing or polluting', () => {
    const existing = makeExisting({ skills: { 'Technical': [] } });
    const newResume = makeNewResume();
    newResume.skills = { 'Technical': ['AWS'], 'Leadership': ['Agile'] };

    const result = mergeMasterResume(existing, newResume, []);

    expect(result.skills['Technical']).toEqual(['AWS']);
    expect(result.skills['Leadership']).toEqual(['Agile']);
  });

  it('skips empty category names in skills', () => {
    const existing = makeExisting({ skills: {} });
    const newResume = makeNewResume();
    newResume.skills = { '': ['orphan-skill'], 'Technical': ['AWS'] };

    const result = mergeMasterResume(existing, newResume, []);

    expect(result.skills['']).toBeUndefined();
    expect(result.skills['Technical']).toEqual(['AWS']);
  });

  it('skips whitespace-only evidence items', () => {
    const existing = makeExisting({ evidence_items: [] });
    const newResume = makeNewResume();
    const newEvidence: MasterResumeEvidenceItem[] = [
      { text: '   ', source: 'crafted', source_session_id: 's1', created_at: '2026-02-27T00:00:00Z' },
      { text: 'short', source: 'crafted', source_session_id: 's1', created_at: '2026-02-27T00:00:00Z' },
      { text: 'This is a real evidence item that passes the length check', source: 'crafted', source_session_id: 's1', created_at: '2026-02-27T00:00:00Z' },
    ];

    const result = mergeMasterResume(existing, newResume, newEvidence);

    // Whitespace-only and too-short items should be skipped
    expect(result.evidence_items).toHaveLength(1);
    expect(result.evidence_items[0].text).toContain('real evidence item');
  });

  it('enforces evidence cap at 200 items', () => {
    const existingEvidence: MasterResumeEvidenceItem[] = Array.from({ length: 190 }, (_, i) => ({
      text: `Existing evidence item number ${i + 1} with enough length`,
      source: 'crafted' as const,
      source_session_id: 'old-session',
      created_at: '2026-01-01T00:00:00Z',
    }));
    const existing = makeExisting({ evidence_items: existingEvidence });
    const newResume = makeNewResume();
    const newEvidence: MasterResumeEvidenceItem[] = Array.from({ length: 30 }, (_, i) => ({
      text: `Brand new evidence item number ${i + 1} with enough length`,
      source: 'interview' as const,
      source_session_id: 'new-session',
      created_at: '2026-02-27T00:00:00Z',
    }));

    const result = mergeMasterResume(existing, newResume, newEvidence);

    // 190 existing + 30 new = 220, capped to 200 (keeping newest = last 200)
    expect(result.evidence_items).toHaveLength(200);
    // Newest items (the new evidence) should all be present
    const newTexts = result.evidence_items.filter(e => e.source_session_id === 'new-session');
    expect(newTexts).toHaveLength(30);
  });

  it('handles null-like company/title values without crashing', () => {
    const existing = makeExisting({
      experience: [
        {
          company: null as unknown as string,
          title: undefined as unknown as string,
          start_date: '2020',
          end_date: 'Present',
          location: '',
          bullets: [{ text: 'Some bullet', source: 'resume' }],
        },
      ],
    });
    const newResume = makeNewResume();

    // Should not throw
    const result = mergeMasterResume(existing, newResume, []);
    expect(result.experience.length).toBeGreaterThanOrEqual(2);
  });
});
