/**
 * Tests for deterministicRequirementMatch — the final post-processing step
 * that assigns all 4 color states (green/amber/red/orange) without relying on LLM.
 *
 * These test the exported helper logic by replicating the algorithms.
 */
import { describe, it, expect } from 'vitest';

// ─── Replicate the algorithms from resume-writer/agent.ts ─────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(t => t.length >= 4);
}

function buildOriginalBulletIndex(experience: Array<{ company: string; bullets: string[] }>) {
  const exactLookup = new Set<string>();
  const byCompany = new Map<string, string[]>();
  for (const exp of experience) {
    const key = exp.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bullets: string[] = [];
    for (const bullet of exp.bullets) {
      exactLookup.add(bullet.toLowerCase().trim());
      bullets.push(bullet);
    }
    byCompany.set(key, [...(byCompany.get(key) ?? []), ...bullets]);
  }
  return { exactLookup, byCompany };
}

function buildRequirementIndex(requirements: Array<{ requirement: string; source: 'job_description' | 'benchmark' }>) {
  return requirements.map(r => ({
    requirement: r.requirement,
    source: r.source,
    keywords: tokenize(r.requirement),
  }));
}

function matchBulletToRequirements(
  bulletText: string,
  reqIndex: Array<{ requirement: string; source: 'job_description' | 'benchmark'; keywords: string[] }>,
) {
  const normalizedBullet = bulletText.toLowerCase();
  const matched: string[] = [];
  let hasBenchmark = false;

  for (const req of reqIndex) {
    let matchCount = 0;
    let hasLongMatch = false;
    for (const kw of req.keywords) {
      if (normalizedBullet.includes(kw)) {
        matchCount++;
        if (kw.length >= 6) hasLongMatch = true;
      }
    }
    if (hasLongMatch || matchCount >= 2) {
      matched.push(req.requirement);
      if (req.source === 'benchmark') hasBenchmark = true;
    }
  }

  return {
    matched: matched.slice(0, 3),
    bestSource: hasBenchmark ? 'benchmark' as const : 'job_description' as const,
  };
}

function classifyBulletOriginality(
  bulletText: string,
  companyOriginals: string[],
  allExactLookup: Set<string>,
): 'identical' | 'similar' | 'novel' {
  const normalized = bulletText.toLowerCase().trim();
  if (allExactLookup.has(normalized)) return 'identical';

  const newTokens = tokenize(bulletText);
  if (newTokens.length === 0) return 'novel';

  let bestOverlap = 0;
  for (const orig of companyOriginals) {
    const origTokens = tokenize(orig);
    if (origTokens.length === 0) continue;
    const origSet = new Set(origTokens);
    const shared = newTokens.filter(t => origSet.has(t)).length;
    const overlap = Math.max(shared / newTokens.length, shared / origTokens.length);
    bestOverlap = Math.max(bestOverlap, overlap);
  }

  return bestOverlap >= 0.35 ? 'similar' : 'novel';
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildOriginalBulletIndex', () => {
  it('indexes bullets from multiple companies', () => {
    const idx = buildOriginalBulletIndex([
      { company: 'Acme Corp', bullets: ['Led team of 12 engineers across 4 product lines'] },
      { company: 'Beta Inc', bullets: ['Reduced infrastructure costs by 30% through cloud migration'] },
    ]);
    expect(idx.exactLookup.size).toBe(2);
    expect(idx.exactLookup.has('led team of 12 engineers across 4 product lines')).toBe(true);
    expect(idx.byCompany.get('acmecorp')?.length).toBe(1);
    expect(idx.byCompany.get('betainc')?.length).toBe(1);
  });

  it('groups bullets by normalized company key', () => {
    const idx = buildOriginalBulletIndex([
      { company: 'Acme Corp', bullets: ['Bullet A', 'Bullet B'] },
      { company: 'acme-corp', bullets: ['Bullet C'] },
    ]);
    // Both normalize to 'acmecorp'
    expect(idx.byCompany.get('acmecorp')?.length).toBe(3);
  });

  it('handles empty experience', () => {
    const idx = buildOriginalBulletIndex([]);
    expect(idx.exactLookup.size).toBe(0);
    expect(idx.byCompany.size).toBe(0);
  });
});

describe('matchBulletToRequirements', () => {
  const reqIndex = buildRequirementIndex([
    { requirement: 'Team Leadership and Management', source: 'job_description' },
    { requirement: 'Cloud Architecture Experience', source: 'job_description' },
    { requirement: 'AI/ML Strategy Development', source: 'benchmark' },
    { requirement: 'Budget Management', source: 'job_description' },
  ]);

  it('matches bullet with long keyword (6+ chars) from requirement', () => {
    const result = matchBulletToRequirements(
      'Led a cross-functional team and provided leadership to 40 engineers',
      reqIndex,
    );
    expect(result.matched).toContain('Team Leadership and Management');
  });

  it('matches bullet with 2+ short keywords from same requirement', () => {
    const result = matchBulletToRequirements(
      'Managed team leadership across multiple departments',
      reqIndex,
    );
    expect(result.matched).toContain('Team Leadership and Management');
  });

  it('returns empty when no keywords match', () => {
    const result = matchBulletToRequirements(
      'Organized weekly office happy hours',
      reqIndex,
    );
    expect(result.matched).toEqual([]);
  });

  it('identifies benchmark source when matched requirement is benchmark', () => {
    const result = matchBulletToRequirements(
      'Developed comprehensive AI/ML strategy for enterprise adoption',
      reqIndex,
    );
    expect(result.matched.length).toBeGreaterThan(0);
    expect(result.bestSource).toBe('benchmark');
  });

  it('returns job_description when only JD requirements match', () => {
    const result = matchBulletToRequirements(
      'Designed cloud architecture for multi-region deployment',
      reqIndex,
    );
    expect(result.bestSource).toBe('job_description');
  });

  it('returns max 3 matches', () => {
    const manyReqs = buildRequirementIndex([
      { requirement: 'leadership skills required', source: 'job_description' },
      { requirement: 'leadership experience preferred', source: 'job_description' },
      { requirement: 'strong leadership background', source: 'job_description' },
      { requirement: 'leadership in technology', source: 'benchmark' },
    ]);
    const result = matchBulletToRequirements(
      'Demonstrated strong leadership in technology organizations',
      manyReqs,
    );
    expect(result.matched.length).toBeLessThanOrEqual(3);
  });
});

describe('classifyBulletOriginality', () => {
  const idx = buildOriginalBulletIndex([
    { company: 'Acme Corp', bullets: [
      'Led team of 12 engineers across 4 product lines',
      'Reduced infrastructure costs by 30% through cloud migration',
      'Managed $2.4M annual budget with zero overruns',
    ] },
  ]);
  const companyOriginals = idx.byCompany.get('acmecorp')!;

  it('returns identical for exact match (case insensitive)', () => {
    expect(classifyBulletOriginality(
      'Led team of 12 engineers across 4 product lines',
      companyOriginals,
      idx.exactLookup,
    )).toBe('identical');

    expect(classifyBulletOriginality(
      'LED TEAM OF 12 ENGINEERS ACROSS 4 PRODUCT LINES',
      companyOriginals,
      idx.exactLookup,
    )).toBe('identical');
  });

  it('returns similar when 35%+ bidirectional token overlap with a company bullet', () => {
    // Shares several tokens with "Led team of 12 engineers across 4 product lines"
    expect(classifyBulletOriginality(
      'Directed team of 12 engineers across 4 product verticals delivering cloud solutions',
      companyOriginals,
      idx.exactLookup,
    )).toBe('similar');
  });

  it('returns novel when less than 35% bidirectional overlap', () => {
    expect(classifyBulletOriginality(
      'Implemented zero-trust security framework across all production environments',
      companyOriginals,
      idx.exactLookup,
    )).toBe('novel');
  });

  it('handles empty bullet gracefully', () => {
    expect(classifyBulletOriginality('', companyOriginals, idx.exactLookup)).toBe('novel');
  });

  it('returns novel when comparing against wrong company originals', () => {
    // A bullet that matches Acme Corp originals should be novel against an empty company
    expect(classifyBulletOriginality(
      'Directed team of 12 engineers across 4 product verticals',
      [], // no originals from this company
      idx.exactLookup,
    )).toBe('novel');
  });
});

describe('Color assignment matrix — end-to-end scenarios', () => {
  const idx = buildOriginalBulletIndex([
    { company: 'Acme Corp', bullets: [
      'Led team of 12 engineers across 4 product lines',
      'Reduced infrastructure costs by 30% through cloud migration',
    ] },
  ]);
  const companyOriginals = idx.byCompany.get('acmecorp')!;

  const reqIndex = buildRequirementIndex([
    { requirement: 'Team Leadership and Management', source: 'job_description' },
    { requirement: 'Cloud Architecture Experience', source: 'job_description' },
    { requirement: 'AI/ML Strategy Development', source: 'benchmark' },
  ]);

  function assignColor(bulletText: string, originals: string[] = companyOriginals) {
    const originality = classifyBulletOriginality(bulletText, originals, idx.exactLookup);
    const { matched, bestSource } = matchBulletToRequirements(bulletText, reqIndex);
    const hasMatch = matched.length > 0;

    let source: string, confidence: string;
    if (originality === 'identical') {
      source = 'original'; confidence = 'strong';
    } else if (originality === 'similar' && hasMatch) {
      source = 'enhanced'; confidence = 'partial';
    } else if (originality === 'similar' && !hasMatch) {
      source = 'original'; confidence = 'strong';
    } else if (originality === 'novel' && hasMatch) {
      source = 'drafted'; confidence = 'needs_validation';
    } else {
      source = 'drafted'; confidence = 'needs_validation';
    }

    const reqSource = hasMatch ? bestSource : 'job_description';
    return { source, confidence, reqSource, matched };
  }

  it('GREEN: identical bullet (verbatim from original)', () => {
    const result = assignColor('Led team of 12 engineers across 4 product lines');
    expect(result.source).toBe('original');
    expect(result.confidence).toBe('strong');
  });

  it('GREEN: similar bullet that does NOT match any requirement', () => {
    // High keyword overlap with original "Led team of 12 engineers across 4 product lines"
    // but doesn't match any requirement keywords (leadership, management, cloud, architecture, etc.)
    const result = assignColor('Led team of 12 engineers across 4 product lines delivering excellence');
    expect(result.confidence).toBe('strong');
  });

  it('AMBER: similar bullet that matches a JD requirement (enhanced)', () => {
    // Shares many tokens with original "Led team of 12 engineers across 4 product lines"
    // AND matches "Team Leadership and Management" requirement via "leadership" (10 chars >= 6)
    const result = assignColor('Led team of 12 engineers providing leadership across product lines');
    expect(result.source).toBe('enhanced');
    expect(result.confidence).toBe('partial');
    expect(result.reqSource).toBe('job_description');
  });

  it('RED: novel bullet that matches a JD requirement (drafted)', () => {
    const result = assignColor('Architected cloud-native infrastructure serving 2M daily active users with 99.99% uptime SLA');
    expect(result.source).toBe('drafted');
    expect(result.confidence).toBe('needs_validation');
    expect(result.reqSource).toBe('job_description');
  });

  it('ORANGE: novel bullet that matches a benchmark requirement', () => {
    const result = assignColor('Developed comprehensive AI/ML strategy for enterprise digital transformation');
    expect(result.source).toBe('drafted');
    expect(result.confidence).toBe('needs_validation');
    expect(result.reqSource).toBe('benchmark');
    // Frontend: needs_validation + benchmark → ORANGE (amber border, not red)
  });

  it('RED: completely novel bullet with no requirement match', () => {
    const result = assignColor('Implemented zero-trust security framework across all production environments');
    expect(result.source).toBe('drafted');
    expect(result.confidence).toBe('needs_validation');
  });

  it('mixed resume produces all 4 color states', () => {
    const bullets = [
      'Led team of 12 engineers across 4 product lines',                        // GREEN (identical)
      'Led team of 12 engineers providing leadership across product lines',       // AMBER (similar + JD match)
      'Architected cloud-native infrastructure with 99.99% uptime SLA',          // RED (novel + JD match)
      'Developed AI/ML strategy for enterprise digital transformation',           // ORANGE (novel + benchmark match)
    ];

    const results = bullets.map(b => assignColor(b));
    const confidences = new Set(results.map(r => r.confidence));
    const sources = new Set(results.map(r => r.source));

    expect(confidences).toContain('strong');          // GREEN
    expect(confidences).toContain('partial');          // AMBER
    expect(confidences).toContain('needs_validation'); // RED or ORANGE
    expect(sources).toContain('original');
    expect(sources).toContain('enhanced');
    expect(sources).toContain('drafted');

    // Verify ORANGE specifically
    const orangeCandidate = results[3];
    expect(orangeCandidate.confidence).toBe('needs_validation');
    expect(orangeCandidate.reqSource).toBe('benchmark');
  });
});
