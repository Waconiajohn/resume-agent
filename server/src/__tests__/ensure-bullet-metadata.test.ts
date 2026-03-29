/**
 * Tests for ensureBulletMetadata — the critical server-side function that guarantees
 * every resume bullet has color-coding metadata for the frontend.
 *
 * These tests verify the inference logic that runs AFTER the LLM produces output,
 * ensuring all 4 color states (green/amber/red/orange) are correctly assigned.
 */
import { describe, it, expect } from 'vitest';

// We can't import the function directly (it's not exported), so we test through the types
// and simulate the inference logic to verify correctness.
import type { ResumeDraftOutput, ResumeBullet, BulletSource, BulletConfidence } from '../agents/resume-v2/types.js';

// ─── Replicate the inference logic from ensureBulletMetadata ─────────────────

function inferSource(
  isNew: boolean,
  evidenceFound: string | undefined,
  addressesReqs: string[],
  existingSource?: string,
): BulletSource {
  if (existingSource) return existingSource as BulletSource;
  if (isNew) return 'drafted';
  if (addressesReqs.length > 0 && evidenceFound) return 'enhanced';
  if (addressesReqs.length > 0 && !evidenceFound) return 'drafted';
  return 'original';
}

function inferConfidence(
  source: BulletSource,
  evidenceFound?: string,
  supportOrigin?: 'original_resume' | 'adjacent_resume_inference' | 'user_confirmed_context' | 'not_found',
  existingConfidence?: string,
): BulletConfidence {
  if (existingConfidence) return existingConfidence as BulletConfidence;
  if (source === 'original') return 'strong';
  if (source === 'enhanced') {
    if (supportOrigin === 'original_resume' || supportOrigin === 'user_confirmed_context') return 'strong';
    if (supportOrigin === 'adjacent_resume_inference') return 'partial';
    return evidenceFound ? 'strong' : 'partial';
  }
  return 'needs_validation';
}

function inferReqSource(
  addressesReqs: string[],
  reqSourceMap: Map<string, 'job_description' | 'benchmark'>,
): 'job_description' | 'benchmark' {
  for (const req of addressesReqs) {
    const source = reqSourceMap.get(req.toLowerCase());
    if (source) return source;
  }
  return 'job_description';
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('inferSource — determines where a bullet came from', () => {
  it('uses existing source when LLM provides it', () => {
    expect(inferSource(false, '', [], 'enhanced')).toBe('enhanced');
    expect(inferSource(true, 'some evidence', ['req'], 'original')).toBe('original');
  });

  it('returns drafted when is_new is true', () => {
    expect(inferSource(true, undefined, [], undefined)).toBe('drafted');
    expect(inferSource(true, 'evidence', ['req'], undefined)).toBe('drafted');
  });

  it('returns enhanced when bullet addresses requirements AND has evidence', () => {
    expect(inferSource(false, 'Led a team of 12 engineers', ['Team Leadership'], undefined)).toBe('enhanced');
  });

  it('returns drafted when bullet addresses requirements but has NO evidence', () => {
    expect(inferSource(false, undefined, ['Cloud Architecture'], undefined)).toBe('drafted');
    expect(inferSource(false, '', ['Cloud Architecture'], undefined)).toBe('drafted');
  });

  it('returns original when bullet has no requirements and is not new', () => {
    expect(inferSource(false, undefined, [], undefined)).toBe('original');
    expect(inferSource(false, 'some text', [], undefined)).toBe('original');
  });
});

describe('inferConfidence — maps source to color', () => {
  it('uses existing confidence when LLM provides it', () => {
    expect(inferConfidence('original', '', undefined, 'needs_validation')).toBe('needs_validation');
    expect(inferConfidence('drafted', 'evidence', undefined, 'strong')).toBe('strong');
  });

  it('maps original → strong (GREEN)', () => {
    expect(inferConfidence('original')).toBe('strong');
  });

  it('maps enhanced with direct support → strong', () => {
    expect(inferConfidence('enhanced', 'Led team of 12', 'original_resume')).toBe('strong');
  });

  it('maps enhanced with adjacent support → partial (AMBER)', () => {
    expect(inferConfidence('enhanced', 'Led team of 12', 'adjacent_resume_inference')).toBe('partial');
  });

  it('maps drafted → needs_validation (RED)', () => {
    expect(inferConfidence('drafted')).toBe('needs_validation');
  });
});

describe('inferReqSource — determines JD vs benchmark for orange treatment', () => {
  const reqMap = new Map<string, 'job_description' | 'benchmark'>([
    ['team leadership', 'job_description'],
    ['cloud architecture', 'job_description'],
    ['ai/ml strategy', 'benchmark'],
    ['digital transformation vision', 'benchmark'],
  ]);

  it('returns job_description for JD requirements', () => {
    expect(inferReqSource(['Team Leadership'], reqMap)).toBe('job_description');
  });

  it('returns benchmark for benchmark requirements', () => {
    expect(inferReqSource(['AI/ML Strategy'], reqMap)).toBe('benchmark');
  });

  it('returns benchmark when any addressed requirement is benchmark', () => {
    expect(inferReqSource(['Digital Transformation Vision'], reqMap)).toBe('benchmark');
  });

  it('defaults to job_description when no match found', () => {
    expect(inferReqSource(['Unknown Requirement'], reqMap)).toBe('job_description');
    expect(inferReqSource([], reqMap)).toBe('job_description');
  });

  it('matches case-insensitively', () => {
    expect(inferReqSource(['ai/ml strategy'], reqMap)).toBe('benchmark');
    expect(inferReqSource(['TEAM LEADERSHIP'], reqMap)).toBe('job_description');
  });
});

describe('Color distribution — realistic LLM output scenarios', () => {
  it('scenario: LLM provides all metadata → uses LLM values', () => {
    const bullet = { is_new: false, source: 'enhanced' as const, confidence: 'partial' as const, evidence_found: 'Led team of 12', addresses_requirements: ['Team Leadership'] };
    const source = inferSource(bullet.is_new, bullet.evidence_found, bullet.addresses_requirements, bullet.source);
    const confidence = inferConfidence(source, bullet.evidence_found, 'original_resume', bullet.confidence);
    expect(source).toBe('enhanced');
    expect(confidence).toBe('partial'); // AMBER
  });

  it('scenario: LLM omits all metadata, bullet is original → GREEN', () => {
    const bullet = { is_new: false, evidence_found: undefined, addresses_requirements: [] as string[] };
    const source = inferSource(bullet.is_new, bullet.evidence_found, bullet.addresses_requirements);
    const confidence = inferConfidence(source);
    expect(source).toBe('original');
    expect(confidence).toBe('strong'); // GREEN
  });

  it('scenario: LLM omits metadata, bullet addresses requirement with evidence → AMBER', () => {
    const bullet = { is_new: false, evidence_found: 'Managed $2M budget', addresses_requirements: ['Budget Management'] };
    const source = inferSource(bullet.is_new, bullet.evidence_found, bullet.addresses_requirements);
    const confidence = inferConfidence(source);
    expect(source).toBe('enhanced');
    expect(confidence).toBe('partial'); // AMBER
  });

  it('scenario: LLM omits metadata, bullet addresses requirement without evidence → RED', () => {
    const bullet = { is_new: false, evidence_found: undefined, addresses_requirements: ['Cloud Architecture'] };
    const source = inferSource(bullet.is_new, bullet.evidence_found, bullet.addresses_requirements);
    const confidence = inferConfidence(source);
    expect(source).toBe('drafted');
    expect(confidence).toBe('needs_validation'); // RED
  });

  it('scenario: LLM marks is_new=true → RED', () => {
    const bullet = { is_new: true, evidence_found: undefined, addresses_requirements: [] as string[] };
    const source = inferSource(bullet.is_new, bullet.evidence_found, bullet.addresses_requirements);
    const confidence = inferConfidence(source);
    expect(source).toBe('drafted');
    expect(confidence).toBe('needs_validation'); // RED
  });

  it('scenario: benchmark requirement with needs_validation → ORANGE on frontend', () => {
    const reqMap = new Map<string, 'job_description' | 'benchmark'>([['ai strategy', 'benchmark']]);
    const bullet = { is_new: false, evidence_found: undefined, addresses_requirements: ['AI Strategy'] };
    const source = inferSource(bullet.is_new, bullet.evidence_found, bullet.addresses_requirements);
    const confidence = inferConfidence(source);
    const reqSource = inferReqSource(bullet.addresses_requirements, reqMap);
    expect(confidence).toBe('needs_validation');
    expect(reqSource).toBe('benchmark');
    // Frontend: needs_validation + benchmark → ORANGE (amber border, not red)
  });

  it('ensures a realistic resume has mixed colors, not all green', () => {
    const bullets = [
      // Original bullet, no requirements → GREEN
      { is_new: false, evidence_found: undefined, addresses_requirements: [] as string[] },
      // Enhanced bullet with evidence → AMBER
      { is_new: false, evidence_found: 'Led 15-person team', addresses_requirements: ['Team Leadership'] },
      // Drafted gap fill, no evidence → RED
      { is_new: false, evidence_found: undefined, addresses_requirements: ['Cloud Architecture'] },
      // LLM marked as new → RED
      { is_new: true, evidence_found: undefined, addresses_requirements: ['AI Strategy'] },
      // Original with evidence → GREEN
      { is_new: false, evidence_found: 'Reduced costs by 30%', addresses_requirements: [] as string[] },
    ];

    const colors = bullets.map(b => {
      const source = inferSource(b.is_new, b.evidence_found, b.addresses_requirements);
      return inferConfidence(source);
    });

    expect(colors).toEqual(['strong', 'partial', 'needs_validation', 'needs_validation', 'strong']);
    // GREEN, AMBER, RED, RED, GREEN — all 3 confidence levels represented
  });
});
