import { describe, expect, it } from 'vitest';

import {
  AI_PRECURSOR_FAMILIES,
  buildAIPrecursorSummary,
  detectAIPrecursors,
  hasTechContext,
  type AIPrecursorMatch,
} from '../contracts/ai-readiness-policy.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Shorthand: test whether a string matches a specific family's pattern */
function matchesFamily(family: string, text: string): boolean {
  const f = AI_PRECURSOR_FAMILIES.find((fam) => fam.family === family);
  if (!f) throw new Error(`Unknown family: ${family}`);
  return f.patterns.test(text);
}

// ─── 1. Individual family pattern tests ────────────────────────────────────

describe('AI_PRECURSOR_FAMILIES pattern matching', () => {
  describe('process_automation', () => {
    it.each([
      'Automated reporting process using Power BI',
      'Led automation of invoice processing workflow',
      'Automated data entry operations across 3 offices',
      'Digitized records and workflow across the enterprise',
    ])('matches: %s', (text) => {
      expect(matchesFamily('process_automation', text)).toBe(true);
    });

    it.each([
      'Streamlined hiring process',
      'Improved operational efficiency by 20%',
      'Led process improvement initiative across field offices',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('process_automation', text)).toBe(false);
    });
  });

  describe('data_driven_decisions', () => {
    it.each([
      'Built data-driven decision framework for executive team',
      'Deployed analytics platform for real-time KPI tracking',
      'Implemented business intelligence dashboards for C-suite',
      'Created dashboards with key analytics for operations',
    ])('matches: %s', (text) => {
      expect(matchesFamily('data_driven_decisions', text)).toBe(true);
    });

    it.each([
      'Updated office dashboard',
      'Made evidence-based decisions on staffing',
      'Reviewed quarterly performance reports',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('data_driven_decisions', text)).toBe(false);
    });
  });

  describe('technology_adoption', () => {
    it.each([
      'Implemented CRM system across the organization',
      'Deployed ERP platform for global operations',
      'Led CRM implementation for North American sales team',
      'Rolled out cloud-based tool for field operations',
    ])('matches: %s', (text) => {
      expect(matchesFamily('technology_adoption', text)).toBe(true);
    });

    it.each([
      'Implemented safety protocols across 5 drilling rigs',
      'Deployed 20-person field team',
      'Implemented new training curriculum',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('technology_adoption', text)).toBe(false);
    });
  });

  describe('digital_transformation', () => {
    it.each([
      'Led digital transformation of supply chain operations',
      'Spearheaded enterprise-wide digitalization initiative',
      'Developed digital strategy for customer engagement',
    ])('matches: %s', (text) => {
      expect(matchesFamily('digital_transformation', text)).toBe(true);
    });

    it.each([
      'Transformed organizational culture',
      'Led strategic transformation of sales team',
      'Digital marketing campaign for product launch',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('digital_transformation', text)).toBe(false);
    });
  });

  describe('change_management', () => {
    it.each([
      'Led change management for ERP implementation',
      'Managed change management for digital platform rollout',
      'Developed adoption strategy for enterprise CRM',
      'Oversaw organizational change for digital transformation',
    ])('matches: %s', (text) => {
      expect(matchesFamily('change_management', text)).toBe(true);
    });

    it.each([
      'Managed training program for 50+ field operators',
      'Led change management for office relocation',
      'Facilitated team transition during restructuring',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('change_management', text)).toBe(false);
    });
  });

  describe('vendor_evaluation', () => {
    it.each([
      'Led vendor selection for CRM replacement project',
      'Managed RFP process for technology platform procurement',
      'Conducted vendor evaluation for supply chain software',
      'Performed technology assessment for cloud migration',
    ])('matches: %s', (text) => {
      expect(matchesFamily('vendor_evaluation', text)).toBe(true);
    });

    it.each([
      'Negotiated vendor contracts for raw materials',
      'Managed supplier relationships across 12 vendors',
      'Led RFP for office furniture procurement',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('vendor_evaluation', text)).toBe(false);
    });
  });

  describe('cross_functional_tech', () => {
    it.each([
      'Established technology governance framework',
      'Led IT steering committee for enterprise initiatives',
      'Built cross-functional digital transformation team',
      'Defined technology roadmap for 3-year horizon',
    ])('matches: %s', (text) => {
      expect(matchesFamily('cross_functional_tech', text)).toBe(true);
    });

    it.each([
      'Led cross-functional team for product launch',
      'Chaired steering committee for budget planning',
      'Managed cross-functional collaboration on safety',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('cross_functional_tech', text)).toBe(false);
    });
  });

  describe('compliance_governance', () => {
    it.each([
      'Built data governance framework for enterprise',
      'Established IT compliance program',
      'Led compliance framework for technology systems',
      'Developed technology governance policies',
    ])('matches: %s', (text) => {
      expect(matchesFamily('compliance_governance', text)).toBe(true);
    });

    it.each([
      'Led risk management for $200M portfolio',
      'Managed regulatory compliance for financial operations',
      'Oversaw safety compliance across 3 regions',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('compliance_governance', text)).toBe(false);
    });
  });

  describe('infrastructure_modernization', () => {
    it.each([
      'Led cloud migration to AWS for core business applications',
      'Built knowledge management system for engineering team',
      'Executed platform migration from on-premise to SaaS',
      'Drove infrastructure modernization across data centers',
    ])('matches: %s', (text) => {
      expect(matchesFamily('infrastructure_modernization', text)).toBe(true);
    });

    it.each([
      'Upgraded warehouse infrastructure',
      'Modernized fleet of delivery vehicles',
      'Consolidated office locations from 5 to 2',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('infrastructure_modernization', text)).toBe(false);
    });
  });

  describe('scale_standardization', () => {
    it.each([
      'Centralized data systems across 12 business units',
      'Standardized technology platform across 8 offices',
      'Consolidated systems and digital infrastructure',
      'Scaled automation platform to serve 15 departments',
    ])('matches: %s', (text) => {
      expect(matchesFamily('scale_standardization', text)).toBe(true);
    });

    it.each([
      'Centralized procurement across 3 regions',
      'Standardized operating procedures across field offices',
      'Scaled team from 10 to 50 employees',
    ])('does not match: %s', (text) => {
      expect(matchesFamily('scale_standardization', text)).toBe(false);
    });
  });
});

// ─── 2. detectAIPrecursors tests ───────────────────────────────────────────

describe('detectAIPrecursors', () => {
  it('returns matches with sourceRole when experienceEntries are provided', () => {
    const result = detectAIPrecursors('', [], [
      {
        company: 'Acme Corp',
        title: 'CTO',
        bullets: ['Led cloud migration to AWS for enterprise applications'],
      },
    ]);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const infraMatch = result.find((m) => m.family === 'infrastructure_modernization');
    expect(infraMatch).toBeDefined();
    expect(infraMatch!.sourceRole).toBe('CTO at Acme Corp');
  });

  it('returns matches without sourceRole for flat bullets', () => {
    const result = detectAIPrecursors(
      '',
      ['Automated reporting process across 5 offices'],
    );

    expect(result.length).toBeGreaterThanOrEqual(1);
    const autoMatch = result.find((m) => m.family === 'process_automation');
    expect(autoMatch).toBeDefined();
    expect(autoMatch!.sourceRole).toBeUndefined();
  });

  it('falls back to resume text scanning for remaining families', () => {
    const resumeText = 'Extensive experience in digital transformation and change management for technology implementations.';
    const result = detectAIPrecursors(resumeText, []);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const dtMatch = result.find((m) => m.family === 'digital_transformation');
    expect(dtMatch).toBeDefined();
    // Resume-text matches don't have sourceRole
    expect(dtMatch!.sourceRole).toBeUndefined();
    // Evidence is a snippet, not the full text
    expect(dtMatch!.evidence.length).toBeLessThanOrEqual(200);
  });

  it('deduplicates — same family only matched once even if found in multiple bullets', () => {
    const result = detectAIPrecursors(
      'Led digital transformation initiative company-wide.',
      ['Spearheaded digital transformation of supply chain'],
      [
        {
          company: 'A',
          title: 'VP',
          bullets: ['Executed digital transformation roadmap'],
        },
      ],
    );

    const dtMatches = result.filter((m) => m.family === 'digital_transformation');
    expect(dtMatches).toHaveLength(1);
    // First match comes from experienceEntries, so it should have sourceRole
    expect(dtMatches[0].sourceRole).toBe('VP at A');
  });

  it('returns empty array when no precursors are found', () => {
    const result = detectAIPrecursors(
      'Managed team of 25 sales representatives. Exceeded quarterly targets by 15%.',
      ['Trained new hires on company procedures', 'Organized team-building events'],
    );

    expect(result).toEqual([]);
  });

  it('truncates evidence longer than 200 characters', () => {
    const longBullet = 'Automated reporting process ' + 'and additional context '.repeat(15) + 'across global operations';
    expect(longBullet.length).toBeGreaterThan(200);

    const result = detectAIPrecursors('', [longBullet]);

    const autoMatch = result.find((m) => m.family === 'process_automation');
    expect(autoMatch).toBeDefined();
    expect(autoMatch!.evidence.length).toBeLessThanOrEqual(200);
    expect(autoMatch!.evidence).toMatch(/\.\.\.$/);
  });

  it('includes executiveFraming from the matched family', () => {
    const result = detectAIPrecursors(
      '',
      ['Led digital transformation of core operations'],
    );

    const dtMatch = result.find((m) => m.family === 'digital_transformation');
    expect(dtMatch).toBeDefined();
    expect(dtMatch!.executiveFraming).toBe('Drove digital transformation initiatives');
  });
});

// ─── 3. buildAIPrecursorSummary tests ──────────────────────────────────────

describe('buildAIPrecursorSummary', () => {
  const makeMatch = (family: string): AIPrecursorMatch => ({
    family,
    evidence: `Evidence for ${family}`,
    executiveFraming: `Framing for ${family}`,
  });

  it('returns strength "none" for 0 matches', () => {
    const result = buildAIPrecursorSummary([]);

    expect(result.strength).toBe('none');
    expect(result.signals).toEqual([]);
    expect(result.summary).toBe('No AI precursor signals detected in resume.');
  });

  it('returns strength "minimal" for 1 match', () => {
    const result = buildAIPrecursorSummary([makeMatch('process_automation')]);

    expect(result.strength).toBe('minimal');
    expect(result.signals).toHaveLength(1);
    expect(result.summary).toContain('Minimal AI readiness');
    expect(result.summary).toContain('Process Automation');
  });

  it('returns strength "moderate" for 2 matches', () => {
    const result = buildAIPrecursorSummary([
      makeMatch('process_automation'),
      makeMatch('data_driven_decisions'),
    ]);

    expect(result.strength).toBe('moderate');
    expect(result.signals).toHaveLength(2);
    expect(result.summary).toContain('Moderate AI readiness');
    expect(result.summary).toContain('2 signal families');
  });

  it('returns strength "moderate" for 3 matches', () => {
    const result = buildAIPrecursorSummary([
      makeMatch('process_automation'),
      makeMatch('data_driven_decisions'),
      makeMatch('technology_adoption'),
    ]);

    expect(result.strength).toBe('moderate');
    expect(result.signals).toHaveLength(3);
  });

  it('returns strength "strong" for 4+ matches', () => {
    const result = buildAIPrecursorSummary([
      makeMatch('process_automation'),
      makeMatch('data_driven_decisions'),
      makeMatch('technology_adoption'),
      makeMatch('digital_transformation'),
    ]);

    expect(result.strength).toBe('strong');
    expect(result.signals).toHaveLength(4);
    expect(result.summary).toContain('Strong AI readiness');
    expect(result.summary).toContain('4 signal families');
  });

  it('summary text includes family display names', () => {
    const result = buildAIPrecursorSummary([
      makeMatch('infrastructure_modernization'),
      makeMatch('vendor_evaluation'),
    ]);

    expect(result.summary).toContain('Infrastructure Modernization');
    expect(result.summary).toContain('Vendor/Tool Evaluation');
  });

  it('returns correct structure shape', () => {
    const result = buildAIPrecursorSummary([makeMatch('process_automation')]);

    expect(result).toHaveProperty('strength');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('summary');
    expect(['strong', 'moderate', 'minimal', 'none']).toContain(result.strength);
    expect(Array.isArray(result.signals)).toBe(true);
    expect(typeof result.summary).toBe('string');
  });
});

// ─── 4. hasTechContext helper ──────────────────────────────────────────────

describe('hasTechContext', () => {
  it.each([
    'CRM platform',
    'cloud infrastructure',
    'ERP system',
    'Salesforce implementation',
    'Power BI dashboards',
    'API integration',
  ])('detects tech context in: %s', (text) => {
    expect(hasTechContext(text)).toBe(true);
  });

  it.each([
    'safety protocols',
    'hiring process',
    'team leadership',
    'budget management',
  ])('does not detect tech context in: %s', (text) => {
    expect(hasTechContext(text)).toBe(false);
  });
});

// ─── 5. Integration scenario: generic ops executive ────────────────────────

describe('integration scenario: generic ops executive', () => {
  const genericBullets = [
    'Implemented new safety protocols across 5 drilling rigs',
    'Streamlined reporting processes, reducing cycle time by 30%',
    'Standardized operating procedures across 3 field offices',
    'Led risk management for $200M portfolio',
    'Deployed 20-person field team',
    'Managed training program for 50+ field operators',
  ];

  it('produces strength "none" — no tech-adjacent signals', () => {
    const matches = detectAIPrecursors('', genericBullets);
    const summary = buildAIPrecursorSummary(matches);

    expect(summary.strength).toBe('none');
    expect(summary.signals).toHaveLength(0);
    expect(summary.summary).toContain('No AI precursor signals detected');
  });
});

// ─── 6. Integration scenario: tech-savvy executive ─────────────────────────

describe('integration scenario: tech-savvy executive', () => {
  const techBullets = [
    'Implemented Salesforce CRM platform across 5 regional offices',
    'Led cloud migration to AWS for core business applications',
    'Built data-driven decision framework for executive team',
    'Led digital transformation of supply chain operations',
    'Established IT compliance framework',
  ];

  it('produces strength "strong" — multiple tech signal families', () => {
    const matches = detectAIPrecursors('', techBullets);
    const summary = buildAIPrecursorSummary(matches);

    expect(summary.strength).toBe('strong');
    expect(matches.length).toBeGreaterThanOrEqual(4);

    // Verify expected families are present
    const families = matches.map((m) => m.family);
    expect(families).toContain('technology_adoption');
    expect(families).toContain('infrastructure_modernization');
    expect(families).toContain('data_driven_decisions');
    expect(families).toContain('digital_transformation');
  });
});
