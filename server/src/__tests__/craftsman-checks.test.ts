/**
 * Tests for craftsman check_keyword_coverage and check_anti_patterns tools.
 *
 * Both tools are pure logic — no LLM calls — which makes them ideal for
 * exhaustive unit testing. This file covers:
 *
 *  1. Anti-pattern regex validation — each STRUCTURAL_PATTERNS regex compiles and fires
 *  2. False positive prevention — legitimate phrases must not trigger anti-patterns
 *  3. Keyword threshold logic — coverage_pct calculation
 *  4. Stateful /g regex regression — re-running the same regex on new content stays clean
 *  5. Empty / null input handling
 *  6. Case sensitivity — keywords match case-insensitively
 *  7. Substring / partial-match behaviour — "cloud" in "cloudy" is intentionally accepted
 *     because the tool uses content.includes(), so we document and verify the actual behaviour
 *  8. Multiple occurrences — duplicate keyword counts as one found
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Module mocks (must come before any imports that trigger the module graph) ───

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }),
  },
}));

// We also need to mock section-writer to prevent it from pulling in real LLM calls
// when the craftsman tools module is imported.
vi.mock('../agents/section-writer.js', () => ({
  runSectionWriter: vi.fn(),
  runSectionRevision: vi.fn(),
}));

import { craftsmanTools } from '../agents/craftsman/tools.js';
import type { PipelineState, ResumeAgentContext } from '../agents/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Find a tool by name from the craftsman tools array */
function getTool(name: string) {
  const tool = craftsmanTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found in craftsmanTools`);
  return tool;
}

const checkKeywordCoverage = getTool('check_keyword_coverage');
const checkAntiPatterns = getTool('check_anti_patterns');

/** Minimal AgentContext — check_keyword_coverage and check_anti_patterns only use
 *  the _ctx argument for signals/session IDs (neither tool actually reads them),
 *  so a shell with the required shape is sufficient. */
function makeCtx(): ResumeAgentContext {
  const minimalState: PipelineState = {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'section_writing',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  };

  return {
    sessionId: 'test-session',
    userId: 'test-user',
    emit: vi.fn(),
    waitForUser: vi.fn(),
    getState: () => minimalState,
    updateState: vi.fn(),
    scratchpad: {},
    signal: new AbortController().signal,
    sendMessage: vi.fn(),
  };
}

// ─── check_keyword_coverage ───────────────────────────────────────────────────

describe('check_keyword_coverage', () => {
  let ctx: ResumeAgentContext;

  beforeEach(() => {
    ctx = makeCtx();
  });

  // ── Threshold / percentage calculation ──────────────────────────────────────

  it('returns 100% coverage when all keywords are present', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: 'Experienced engineering leader with cloud-native expertise and strong P&L ownership.',
        target_keywords: ['cloud-native', 'engineering', 'P&L'],
      },
      ctx,
    )) as { found: string[]; missing: string[]; coverage_pct: number };

    expect(result.coverage_pct).toBe(100);
    expect(result.found).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
  });

  it('returns 0% coverage when no keywords are present', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: 'Strategic leader who drives business value.',
        target_keywords: ['cloud-native', 'kubernetes', 'TypeScript'],
      },
      ctx,
    )) as { found: string[]; missing: string[]; coverage_pct: number };

    expect(result.coverage_pct).toBe(0);
    expect(result.found).toHaveLength(0);
    expect(result.missing).toHaveLength(3);
  });

  it('calculates partial coverage correctly — 2 of 4 keywords found = 50%', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'skills',
        content: 'Proficient in TypeScript and cloud architecture.',
        target_keywords: ['TypeScript', 'cloud', 'kubernetes', 'terraform'],
      },
      ctx,
    )) as { found: string[]; missing: string[]; coverage_pct: number };

    expect(result.coverage_pct).toBe(50);
    expect(result.found).toContain('TypeScript');
    expect(result.found).toContain('cloud');
    expect(result.missing).toContain('kubernetes');
    expect(result.missing).toContain('terraform');
  });

  it('rounds coverage percentage to a whole number', async () => {
    // 1 of 3 = 33.33… → should round to 33
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: 'Results-driven engineering leader.',
        target_keywords: ['engineering', 'cloud', 'kubernetes'],
      },
      ctx,
    )) as { coverage_pct: number };

    expect(Number.isInteger(result.coverage_pct)).toBe(true);
    expect(result.coverage_pct).toBe(33);
  });

  // ── Case sensitivity ────────────────────────────────────────────────────────

  it('matches keywords case-insensitively — uppercase keyword in lowercase content', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: 'deep expertise in cloud-native architecture and devops.',
        target_keywords: ['Cloud-Native', 'DevOps'],
      },
      ctx,
    )) as { found: string[]; missing: string[]; coverage_pct: number };

    expect(result.coverage_pct).toBe(100);
    expect(result.found).toContain('Cloud-Native');
    expect(result.found).toContain('DevOps');
  });

  it('matches keywords case-insensitively — mixed case in both content and keywords', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'skills',
        content: 'Expert in KUBERNETES orchestration and Terraform provisioning.',
        target_keywords: ['kubernetes', 'terraform'],
      },
      ctx,
    )) as { found: string[]; missing: string[]; coverage_pct: number };

    expect(result.coverage_pct).toBe(100);
  });

  // ── Empty / null inputs ─────────────────────────────────────────────────────

  it('returns 100% coverage when target_keywords is an empty array', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: 'Some resume content here.',
        target_keywords: [],
      },
      ctx,
    )) as { coverage_pct: number; found: string[]; missing: string[] };

    expect(result.coverage_pct).toBe(100);
    expect(result.found).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it('returns 0% coverage when content is an empty string', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: '',
        target_keywords: ['cloud', 'leadership'],
      },
      ctx,
    )) as { coverage_pct: number; found: string[]; missing: string[] };

    expect(result.coverage_pct).toBe(0);
    expect(result.missing).toContain('cloud');
    expect(result.missing).toContain('leadership');
  });

  // ── Multiple occurrences ────────────────────────────────────────────────────

  it('counts a keyword as found once even when it appears multiple times in content', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'experience',
        content: 'Cloud migration, cloud architecture, and cloud cost optimisation.',
        target_keywords: ['cloud'],
      },
      ctx,
    )) as { found: string[]; missing: string[]; coverage_pct: number };

    // "cloud" appears 3 times but should be in found exactly once
    expect(result.found).toHaveLength(1);
    expect(result.coverage_pct).toBe(100);
  });

  // ── Substring matching (documents actual tool behaviour) ───────────────────

  it('uses substring matching — "cloud" keyword is found inside the word "cloudless"', async () => {
    // The tool uses content.includes(kw.toLowerCase()) — this is intentional substring
    // matching. We document the behaviour here so any future change to whole-word matching
    // is a deliberate, visible decision.
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'summary',
        content: 'Delivered cloudless networking solutions at scale.',
        target_keywords: ['cloud'],
      },
      ctx,
    )) as { found: string[]; coverage_pct: number };

    // The current implementation DOES match "cloud" inside "cloudless"
    expect(result.found).toContain('cloud');
    expect(result.coverage_pct).toBe(100);
  });

  // ── Result shape ────────────────────────────────────────────────────────────

  it('returns found and missing arrays in the correct result shape', async () => {
    const result = (await checkKeywordCoverage.execute(
      {
        section: 'skills',
        content: 'Proficient in TypeScript.',
        target_keywords: ['TypeScript', 'Python'],
      },
      ctx,
    )) as Record<string, unknown>;

    expect(Array.isArray(result.found)).toBe(true);
    expect(Array.isArray(result.missing)).toBe(true);
    expect(typeof result.coverage_pct).toBe('number');
  });
});

// ─── check_anti_patterns ──────────────────────────────────────────────────────

describe('check_anti_patterns', () => {
  let ctx: ResumeAgentContext;

  beforeEach(() => {
    ctx = makeCtx();
  });

  // ── Result shape ────────────────────────────────────────────────────────────

  it('returns { found_patterns, clean } with correct types', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Led a 45-person engineering team through a full cloud migration.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(Array.isArray(result.found_patterns)).toBe(true);
    expect(typeof result.clean).toBe('boolean');
  });

  it('returns clean=true for professional content with no anti-patterns', async () => {
    const cleanContent = [
      'Directed a $12M digital transformation program, reducing infrastructure costs by 38%.',
      'Scaled engineering organisation from 8 to 45 engineers over 18 months.',
      'Architected cloud-native data platform now processing 4 billion events per day.',
    ].join('\n');

    const result = (await checkAntiPatterns.execute(
      { section: 'experience', content: cleanContent },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(true);
    expect(result.found_patterns).toHaveLength(0);
  });

  // ── Structural regex patterns ───────────────────────────────────────────────

  it('flags "responsible for" with a directive to replace with action verb', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'experience', content: 'Was responsible for managing the engineering budget.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    const messages = result.found_patterns.join(' ');
    expect(messages).toMatch(/responsible for/i);
  });

  it('flags "helped with" phrase', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'experience', content: 'Helped with the implementation of a new CI/CD pipeline.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /helped/i.test(p))).toBe(true);
  });

  it('flags "assisted in" phrase', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'experience', content: 'Assisted in the rollout of the new ERP system.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /assisted/i.test(p))).toBe(true);
  });

  it('flags "worked on" phrase', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'experience', content: 'Worked on improving team velocity and code quality.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /worked on/i.test(p))).toBe(true);
  });

  it('flags "passionate about" cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'I am passionate about building great software products.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /passionate/i.test(p))).toBe(true);
  });

  it('flags "synergy" corporate buzzword', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Focused on creating synergy across cross-functional teams.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /synerg/i.test(p))).toBe(true);
  });

  it('flags "proven track record" generic cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Executive with a proven track record of delivering results.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /proven track record/i.test(p))).toBe(true);
  });

  it('flags "results-oriented" generic cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Results-oriented leader with extensive management experience.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /results.oriented/i.test(p))).toBe(true);
  });

  it('flags "dynamic leader" empty adjective', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'A dynamic leader who inspires high-performing teams.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /dynamic leader/i.test(p))).toBe(true);
  });

  it('flags "seasoned professional" age-sensitive cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Seasoned professional with deep expertise in supply chain.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /seasoned professional/i.test(p))).toBe(true);
  });

  it('flags "team player" soft-skill cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'An energetic team player with excellent communication skills.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /team player/i.test(p))).toBe(true);
  });

  it('flags "self-starter" generic soft skill', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'A motivated self-starter who excels in ambiguous environments.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /self.starter/i.test(p))).toBe(true);
  });

  it('flags "detail-oriented" generic soft skill', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Detail-oriented manager with a focus on execution.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /detail.oriented/i.test(p))).toBe(true);
  });

  it('flags "think outside the box" cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Able to think outside the box to solve complex problems.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /outside the box/i.test(p))).toBe(true);
  });

  it('flags "strategic thinker" without supporting evidence', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'A strategic thinker who aligns teams with organisational goals.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /strategic thinker/i.test(p))).toBe(true);
  });

  it('flags "go-to person" informal cliché', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'The go-to person for all matters related to cloud infrastructure.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /go.to person/i.test(p))).toBe(true);
  });

  // ── Age-sensitive patterns ──────────────────────────────────────────────────

  it('flags "30 years experience" age-revealing quantifier', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Professional with 30 years experience in manufacturing.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /age.revealing/i.test(p) || /years/i.test(p))).toBe(true);
  });

  it('flags "25+ years of experience" age-revealing quantifier', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Leader with 25+ years of experience in financial services.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
  });

  it('flags "references available upon request" outdated convention', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'footer', content: 'References available upon request.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /references/i.test(p))).toBe(true);
  });

  it('flags vertical bar separator that creates ATS parse risk', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'header', content: 'VP Engineering | Acme Corp | San Francisco' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /vertical bar/i.test(p) || /\|/i.test(p))).toBe(true);
  });

  // ── False positive prevention ───────────────────────────────────────────────

  it('does NOT flag "responsible" when used as an adjective rather than "responsible for"', async () => {
    // "responsible" alone without "for" should not match \bresponsible for\b
    const result = (await checkAntiPatterns.execute(
      {
        section: 'experience',
        content: 'Held accountable and responsible; delivered $4.2M in annual savings.',
      },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    // "responsible" appears but NOT "responsible for"
    const hasResponsibleForFlag = result.found_patterns.some((p) =>
      p.toLowerCase().includes('responsible for'),
    );
    expect(hasResponsibleForFlag).toBe(false);
  });

  it('does NOT flag legitimate use of "help" as a noun or different verb form', async () => {
    // "help" and "helpful" are not the same as "helped with" or "helped to"
    const result = (await checkAntiPatterns.execute(
      {
        section: 'summary',
        content: 'Built internal tooling to help engineers ship faster and reduce deployment friction.',
      },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    // "help" alone should not trigger \bhelped (with|to)\b
    expect(result.found_patterns.some((p) => /helped with|helped to/i.test(p))).toBe(false);
  });

  it('does NOT flag "5 years experience" (only 20+/25+/30+ are flagged)', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Brings 5 years experience in product management.' },
      ctx,
    )) as { found_patterns: string[] };

    // The age pattern regex is /\b(30|25|20)\+?\s+years?\s+(of\s+)?experience\b/i
    // so "5 years" must not trigger it
    const hasAgeFlag = result.found_patterns.some((p) => /age.revealing/i.test(p));
    expect(hasAgeFlag).toBe(false);
  });

  it('does NOT flag "10 years experience" (only 20+/25+/30+ are flagged)', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: '10 years experience building enterprise software platforms.' },
      ctx,
    )) as { found_patterns: string[] };

    const hasAgeFlag = result.found_patterns.some((p) => /age.revealing/i.test(p));
    expect(hasAgeFlag).toBe(false);
  });

  it('does NOT flag "detail" when not combined with "-oriented"', async () => {
    const result = (await checkAntiPatterns.execute(
      {
        section: 'summary',
        content: 'Pays close attention to detail, catching issues before they reach production.',
      },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    const hasDetailFlag = result.found_patterns.some((p) =>
      /detail.oriented/i.test(p),
    );
    expect(hasDetailFlag).toBe(false);
  });

  // ── Stateful /g regex regression ───────────────────────────────────────────
  //
  // RegExp instances with the /g flag maintain a lastIndex cursor. If the same
  // RegExp object is reused across multiple .test() calls without resetting
  // lastIndex (e.g. by calling .test() on the same literal), every second call
  // on a matching string returns false. The tool avoids this by declaring each
  // pattern as a regex literal inside the STRUCTURAL_PATTERNS array initialised
  // at module load time — these do NOT use the /g flag — so multiple calls with
  // matching content must always return consistent results.

  it('returns the same result when called twice on the same matching content (no /g statefulness)', async () => {
    const content = 'Was responsible for overseeing the engineering department.';

    const resultA = (await checkAntiPatterns.execute(
      { section: 'experience', content },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    const resultB = (await checkAntiPatterns.execute(
      { section: 'experience', content },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(resultA.clean).toBe(false);
    expect(resultB.clean).toBe(false);
    expect(resultA.found_patterns).toEqual(resultB.found_patterns);
  });

  it('returns clean=true twice in a row on clean content (no /g false-negative regression)', async () => {
    const content = 'Directed a multi-region infrastructure modernisation programme, cutting costs by 32%.';

    const resultA = (await checkAntiPatterns.execute(
      { section: 'experience', content },
      ctx,
    )) as { clean: boolean };

    const resultB = (await checkAntiPatterns.execute(
      { section: 'experience', content },
      ctx,
    )) as { clean: boolean };

    expect(resultA.clean).toBe(true);
    expect(resultB.clean).toBe(true);
  });

  it('correctly alternates between clean and flagged content on successive calls', async () => {
    const flaggedContent = 'Responsible for managing the infrastructure budget.';
    const cleanContent = 'Directed the $4M infrastructure budget, delivering 18% savings.';

    for (let i = 0; i < 3; i++) {
      const flagged = (await checkAntiPatterns.execute(
        { section: 'experience', content: flaggedContent },
        ctx,
      )) as { clean: boolean };

      const clean = (await checkAntiPatterns.execute(
        { section: 'experience', content: cleanContent },
        ctx,
      )) as { clean: boolean };

      expect(flagged.clean).toBe(false);
      expect(clean.clean).toBe(true);
    }
  });

  // ── Empty content ───────────────────────────────────────────────────────────

  it('returns clean=true for an empty content string', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: '' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(true);
    expect(result.found_patterns).toHaveLength(0);
  });

  // ── Multiple patterns in a single content block ─────────────────────────────

  it('reports multiple distinct anti-patterns found in the same content', async () => {
    const content = [
      'Results-oriented team player responsible for driving synergy.',
      'A dynamic leader who is passionate about helping with strategic thinker initiatives.',
    ].join(' ');

    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    // Multiple distinct patterns should be reported
    expect(result.found_patterns.length).toBeGreaterThan(2);
  });

  // ── Case sensitivity of structural regex patterns ───────────────────────────

  it('flags "RESPONSIBLE FOR" in all-caps (regex is case-insensitive)', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'experience', content: 'RESPONSIBLE FOR all client-facing engineering decisions.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /responsible for/i.test(p))).toBe(true);
  });

  it('flags "Synergy" with capital S (regex is case-insensitive)', async () => {
    const result = (await checkAntiPatterns.execute(
      { section: 'summary', content: 'Focused on creating Synergy between product and engineering.' },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    expect(result.clean).toBe(false);
    expect(result.found_patterns.some((p) => /synerg/i.test(p))).toBe(true);
  });

  // ── Cliché phrase extraction from RESUME_ANTI_PATTERNS ─────────────────────

  it('flags cliché phrases extracted from RESUME_ANTI_PATTERNS that are not also STRUCTURAL_PATTERNS', async () => {
    // "leverage" as buzzword appears in RESUME_ANTI_PATTERNS cliché list but NOT in
    // STRUCTURAL_PATTERNS, so it should be caught via the CLICHE_PHRASES path
    const result = (await checkAntiPatterns.execute(
      {
        section: 'summary',
        content: 'We leverage best-in-class solutions to deliver competitive advantage.',
      },
      ctx,
    )) as { found_patterns: string[]; clean: boolean };

    // leverage is in the cliché phrases list — it should be flagged
    expect(result.clean).toBe(false);
  });
});
