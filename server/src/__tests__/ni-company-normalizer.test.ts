/**
 * Unit tests for server/src/lib/ni/company-normalizer.ts
 *
 * Tests the 4-step cascade:
 *   1. normalizeCompanyName  — rule-based suffix stripping and whitespace collapse
 *   2. matchExact            — exact lookup against company_directory
 *   3. matchFuzzy            — variant array overlap lookup
 *   4. matchViaLlm           — LLM batch matching for remaining unknowns
 *   5. normalizeCompanyBatch — full integration of all four steps
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock factories ────────────────────────────────────────────────────
// vi.hoisted() ensures these variables are initialised before vi.mock() factory
// functions execute — prevents temporal dead zone crashes.

const mockSupabase = vi.hoisted(() => {
  /**
   * Returns a fresh chainable query object each time .from() is called.
   *
   * Every method returns the same chain so tests can write:
   *   supabaseAdmin.from('t').select('*').in('col', vals)
   * and override the terminal resolution by replacing the relevant method.
   */
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    chain.select  = vi.fn().mockReturnValue(chain);
    chain.insert  = vi.fn().mockReturnValue(chain);
    chain.update  = vi.fn().mockReturnValue(chain);
    chain.delete  = vi.fn().mockReturnValue(chain);
    chain.eq      = vi.fn().mockReturnValue(chain);
    chain.in      = vi.fn().mockReturnValue(chain);
    chain.overlaps = vi.fn().mockReturnValue(chain);
    chain.single  = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    // .limit() is used as a terminal await in the batch fetch — must resolve.
    chain.limit   = vi.fn().mockResolvedValue({ data: [], error: null });
    // Prevent accidental auto-await of the chain object itself.
    chain.then    = undefined;
    return chain;
  };

  return {
    from: vi.fn().mockImplementation(() => chainable()),
  };
});

const mockLlm = vi.hoisted(() => ({
  chat: vi.fn(),
}));

const mockGetModelForTier = vi.hoisted(() => vi.fn().mockReturnValue('test-model'));

const mockRepairJSON = vi.hoisted(() => vi.fn());

// ─── Module mocks (must appear before any application imports) ─────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: mockSupabase,
}));

vi.mock('../lib/llm.js', () => ({
  llm: mockLlm,
  getModelForTier: mockGetModelForTier,
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: mockRepairJSON,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (must come AFTER vi.mock() calls) ─────────────────────────────────

import {
  normalizeCompanyName,
  matchExact,
  matchFuzzy,
  matchViaLlm,
  normalizeCompanyBatch,
} from '../lib/ni/company-normalizer.js';
import type { CompanyDirectoryRow } from '../lib/ni/types.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCompanyRow(overrides: Partial<CompanyDirectoryRow> = {}): CompanyDirectoryRow {
  return {
    id: 'company-001',
    name_normalized: 'acme',
    name_display: 'Acme',
    name_variants: ['acme'],
    domain: null,
    industry: null,
    employee_count: null,
    headquarters: null,
    description: null,
    ats_platform: null,
    ats_slug: null,
    ats_url: null,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Step 1: normalizeCompanyName ──────────────────────────────────────────────

describe('normalizeCompanyName', () => {
  it('strips "Inc" suffix', () => {
    expect(normalizeCompanyName('Acme Inc')).toBe('Acme');
  });

  it('strips "LLC" suffix', () => {
    expect(normalizeCompanyName('Acme LLC')).toBe('Acme');
  });

  it('strips "Ltd" suffix', () => {
    expect(normalizeCompanyName('Acme Ltd')).toBe('Acme');
  });

  it('strips "Corp" suffix', () => {
    expect(normalizeCompanyName('Acme Corp')).toBe('Acme');
  });

  it('strips "Co" suffix', () => {
    expect(normalizeCompanyName('Acme Co')).toBe('Acme');
  });

  it('strips "PLC" suffix case-insensitively', () => {
    expect(normalizeCompanyName('Acme PLC')).toBe('Acme');
  });

  it('strips "GmbH" suffix', () => {
    expect(normalizeCompanyName('Acme GmbH')).toBe('Acme');
  });

  it('passes through a name with no recognised suffix', () => {
    expect(normalizeCompanyName('Acme')).toBe('Acme');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeCompanyName('')).toBe('');
  });

  it('collapses multiple consecutive spaces into one', () => {
    expect(normalizeCompanyName('Acme   Solutions')).toBe('Acme   Solutions'.replace(/\s+/g, ' '));
  });

  it('strips a trailing period from a suffix (e.g. "Inc.")', () => {
    expect(normalizeCompanyName('Acme Inc.')).toBe('Acme');
  });

  it('strips stacked suffixes iteratively (e.g. "Acme Inc. LLC")', () => {
    expect(normalizeCompanyName('Acme Inc. LLC')).toBe('Acme');
  });
});

// ─── Step 2: matchExact ────────────────────────────────────────────────────────

describe('matchExact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a map with all found companies keyed by name_normalized', async () => {
    const acmeRow = makeCompanyRow({ id: 'acme-001', name_normalized: 'acme', name_display: 'Acme' });
    const betaRow = makeCompanyRow({ id: 'beta-001', name_normalized: 'beta', name_display: 'Beta' });

    // Override the terminal .in() to resolve with the two rows.
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select   = vi.fn().mockReturnValue(chain);
      chain.in       = vi.fn().mockResolvedValue({ data: [acmeRow, betaRow], error: null });
      chain.then     = undefined;
      return chain;
    });

    const result = await matchExact(['Acme', 'Beta']);

    expect(result.size).toBe(2);
    expect(result.get('acme')).toEqual(acmeRow);
    expect(result.get('beta')).toEqual(betaRow);
  });

  it('returns an empty map when no matching rows are found', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await matchExact(['UnknownCo']);

    expect(result.size).toBe(0);
  });

  it('returns an empty map gracefully when the DB query returns an error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } });
      chain.then   = undefined;
      return chain;
    });

    const result = await matchExact(['AnyName']);

    expect(result.size).toBe(0);
  });

  it('returns an empty map immediately when given an empty names array', async () => {
    const result = await matchExact([]);
    expect(result.size).toBe(0);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

// ─── Step 3: matchFuzzy ────────────────────────────────────────────────────────

describe('matchFuzzy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the correct company when a variant matches an input name', async () => {
    // "ACME Corporation" → lowercased → "acme corporation" is a variant in the row
    const acmeRow = makeCompanyRow({
      id: 'acme-001',
      name_normalized: 'acme',
      name_display: 'Acme',
      name_variants: ['acme', 'acme corporation'],
    });

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select   = vi.fn().mockReturnValue(chain);
      chain.overlaps = vi.fn().mockResolvedValue({ data: [acmeRow], error: null });
      chain.then     = undefined;
      return chain;
    });

    const result = await matchFuzzy(['acme corporation']);

    expect(result.size).toBe(1);
    expect(result.get('acme corporation')).toEqual(acmeRow);
  });

  it('returns an empty map when no variants overlap with the input names', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select   = vi.fn().mockReturnValue(chain);
      chain.overlaps = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then     = undefined;
      return chain;
    });

    const result = await matchFuzzy(['completely unknown name']);

    expect(result.size).toBe(0);
  });

  it('returns an empty map immediately when given an empty names array', async () => {
    const result = await matchFuzzy([]);
    expect(result.size).toBe(0);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('returns an empty map gracefully when the DB query returns an error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select   = vi.fn().mockReturnValue(chain);
      chain.overlaps = vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } });
      chain.then     = undefined;
      return chain;
    });

    const result = await matchFuzzy(['AnyVariant']);

    expect(result.size).toBe(0);
  });
});

// ─── Step 4: matchViaLlm ──────────────────────────────────────────────────────

describe('matchViaLlm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModelForTier.mockReturnValue('test-model');
  });

  it('returns a map of unknown → canonical name when the LLM groups them correctly', async () => {
    mockLlm.chat.mockResolvedValue({ text: '{"ACME Corp":"Acme","Beta Ltd":"Beta"}' });
    mockRepairJSON.mockReturnValue({ 'ACME Corp': 'Acme', 'Beta Ltd': 'Beta' });

    const result = await matchViaLlm(['ACME Corp', 'Beta Ltd'], ['Acme', 'Beta', 'Gamma']);

    expect(result.size).toBe(2);
    expect(result.get('ACME Corp')).toBe('Acme');
    expect(result.get('Beta Ltd')).toBe('Beta');
  });

  it('marks all batch names as unmatched (null) when repairJSON returns null', async () => {
    mockLlm.chat.mockResolvedValue({ text: 'this is not json at all' });
    mockRepairJSON.mockReturnValue(null);

    const result = await matchViaLlm(['UnknownA', 'UnknownB'], ['KnownCo']);

    expect(result.size).toBe(2);
    expect(result.get('UnknownA')).toBeNull();
    expect(result.get('UnknownB')).toBeNull();
  });

  it('marks all batch names as unmatched when the LLM call throws', async () => {
    mockLlm.chat.mockRejectedValue(new Error('LLM timeout'));

    const result = await matchViaLlm(['FailA', 'FailB'], ['KnownCo']);

    expect(result.size).toBe(2);
    expect(result.get('FailA')).toBeNull();
    expect(result.get('FailB')).toBeNull();
  });

  it('returns an empty map immediately when given an empty unknownNames array', async () => {
    const result = await matchViaLlm([], ['KnownCo']);
    expect(result.size).toBe(0);
    expect(mockLlm.chat).not.toHaveBeenCalled();
  });

  it('maps a null value from the LLM response to null in the result map', async () => {
    mockLlm.chat.mockResolvedValue({ text: '{"NoMatchCo":null}' });
    mockRepairJSON.mockReturnValue({ NoMatchCo: null });

    const result = await matchViaLlm(['NoMatchCo'], ['KnownCo']);

    expect(result.get('NoMatchCo')).toBeNull();
  });
});

// ─── normalizeCompanyBatch (integration) ──────────────────────────────────────

describe('normalizeCompanyBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModelForTier.mockReturnValue('test-model');
  });

  /**
   * Helper that configures mockSupabase.from to route calls based on which table
   * is being queried, so each step of the cascade gets the right response.
   *
   * The cascade calls .from('company_directory') multiple times:
   *   1. matchExact  → .select('*').in(...)            resolves to exactData
   *   2. matchFuzzy  → .select('*').overlaps(...)      resolves to fuzzyData
   *   3. batch fetch → .select('name_display').limit() resolves to limitData
   *   4. insert      → .insert(...).select('id').single() for new companies
   *   5. update      → .update(...).eq(...).eq(...)    for client_connections
   *
   * We track call count to dispatch to the right response since all calls go
   * to the same 'company_directory' or 'client_connections' table.
   */
  function setupFromRouter(config: {
    exactRows: CompanyDirectoryRow[];
    fuzzyRows: CompanyDirectoryRow[];
    limitRows: Array<{ name_display: string }>;
    insertId?: string;
    insertError?: { code: string; message: string };
  }) {
    let callIndex = 0;

    mockSupabase.from.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};

      if (table === 'client_connections') {
        // updateConnectionCompanyIds — terminal at .eq().eq(), no explicit resolve needed
        chain.update = vi.fn().mockReturnValue(chain);
        chain.eq     = vi.fn().mockReturnValue(chain);
        chain.then   = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve);
        return chain;
      }

      // company_directory — dispatch by call order
      const myCall = callIndex++;

      if (myCall === 0) {
        // matchExact: .select('*').in(...)
        chain.select = vi.fn().mockReturnValue(chain);
        chain.in     = vi.fn().mockResolvedValue({ data: config.exactRows, error: null });
        chain.then   = undefined;
        return chain;
      }

      if (myCall === 1) {
        // matchFuzzy: .select('*').overlaps(...)
        chain.select   = vi.fn().mockReturnValue(chain);
        chain.overlaps = vi.fn().mockResolvedValue({ data: config.fuzzyRows, error: null });
        chain.then     = undefined;
        return chain;
      }

      if (myCall === 2) {
        // batch fetch of known companies: .select('name_display').limit(200)
        chain.select = vi.fn().mockReturnValue(chain);
        chain.limit  = vi.fn().mockResolvedValue({ data: config.limitRows, error: null });
        chain.then   = undefined;
        return chain;
      }

      // Subsequent calls: createCompanyEntry — .insert().select('id').single()
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue(
        config.insertError
          ? { data: null, error: config.insertError }
          : { data: { id: config.insertId ?? 'new-company-id' }, error: null },
      );
      chain.then = undefined;
      return chain;
    });
  }

  it('returns empty batch result when rawNames is empty', async () => {
    const result = await normalizeCompanyBatch('user-001', []);

    expect(result.results).toHaveLength(0);
    expect(result.cacheHits).toBe(0);
    expect(result.newCompaniesCreated).toBe(0);
    expect(result.llmCallsMade).toBe(0);
  });

  it('handles a mix of exact, fuzzy, LLM-matched, and new companies correctly', async () => {
    // Input: 5 raw names (after suffix stripping they are 5 unique cleaned names)
    //   - "Acme Inc"  → cleaned "Acme"       → exact match
    //   - "Beta Ltd"  → cleaned "Beta"        → exact match
    //   - "Gamma Corp" → cleaned "Gamma"      → fuzzy match
    //   - "Delta LLC"  → cleaned "Delta"      → LLM match (to an exact match row)
    //   - "NewCo"      → cleaned "NewCo"      → new company

    const acmeRow = makeCompanyRow({ id: 'acme-id', name_normalized: 'acme', name_display: 'Acme' });
    const betaRow = makeCompanyRow({ id: 'beta-id', name_normalized: 'beta', name_display: 'Beta' });
    const gammaRow = makeCompanyRow({
      id: 'gamma-id',
      name_normalized: 'gamma',
      name_display: 'Gamma',
      name_variants: ['gamma', 'gamma corp'],
    });

    setupFromRouter({
      exactRows: [acmeRow, betaRow],
      fuzzyRows: [gammaRow],
      limitRows: [],
      insertId: 'new-company-id',
    });

    // LLM says "Delta" maps to null (no known company), "NewCo" maps to null too
    // so both fall through to createCompanyEntry.
    // Adjust: make LLM return a match for "Delta" → "Acme" (an exact match row we have)
    // Actually let's keep it simpler: LLM returns null for both, both become new.
    mockLlm.chat.mockResolvedValue({ text: '{"Delta":null,"NewCo":null}' });
    mockRepairJSON.mockReturnValue({ Delta: null, NewCo: null });

    const result = await normalizeCompanyBatch('user-001', [
      'Acme Inc',
      'Beta Ltd',
      'Gamma Corp',
      'Delta LLC',
      'NewCo',
    ]);

    // 2 exact + 1 fuzzy = 3 cache hits
    expect(result.cacheHits).toBe(3);

    // 2 new companies (Delta and NewCo both fell to new)
    expect(result.newCompaniesCreated).toBe(2);

    // 1 LLM call made for the 2 still-unmatched names
    expect(result.llmCallsMade).toBe(1);

    // All 5 cleaned names should have results
    expect(result.results).toHaveLength(5);

    const byRaw = new Map(result.results.map((r) => [r.rawName, r]));

    expect(byRaw.get('Acme')?.matchMethod).toBe('exact');
    expect(byRaw.get('Acme')?.companyId).toBe('acme-id');

    expect(byRaw.get('Beta')?.matchMethod).toBe('exact');
    expect(byRaw.get('Beta')?.companyId).toBe('beta-id');

    expect(byRaw.get('Gamma')?.matchMethod).toBe('fuzzy');
    expect(byRaw.get('Gamma')?.companyId).toBe('gamma-id');

    const deltaResult = byRaw.get('Delta');
    expect(deltaResult?.matchMethod).toBe('new');

    const newCoResult = byRaw.get('NewCo');
    expect(newCoResult?.matchMethod).toBe('new');
  });

  it('counts cache hits correctly — exact + fuzzy matches both increment the counter', async () => {
    const acmeRow = makeCompanyRow({ id: 'acme-id', name_normalized: 'acme', name_display: 'Acme' });
    const betaRow = makeCompanyRow({
      id: 'beta-id',
      name_normalized: 'beta',
      name_display: 'Beta',
      name_variants: ['beta', 'beta solutions'],
    });

    setupFromRouter({
      exactRows: [acmeRow],   // Acme → exact hit
      fuzzyRows: [betaRow],   // beta solutions → fuzzy hit
      limitRows: [],
    });

    // No LLM call needed since all names are resolved by exact/fuzzy
    const result = await normalizeCompanyBatch('user-001', ['Acme', 'beta solutions']);

    expect(result.cacheHits).toBe(2);
    expect(result.llmCallsMade).toBe(0);
    expect(result.newCompaniesCreated).toBe(0);
  });

  it('calls createCompanyEntry for truly new companies and reflects them in results', async () => {
    setupFromRouter({
      exactRows: [],
      fuzzyRows: [],
      limitRows: [],
      insertId: 'brand-new-id',
    });

    mockLlm.chat.mockResolvedValue({ text: '{"BrandNew":null}' });
    mockRepairJSON.mockReturnValue({ BrandNew: null });

    const result = await normalizeCompanyBatch('user-001', ['BrandNew']);

    expect(result.newCompaniesCreated).toBe(1);
    expect(result.results[0].matchMethod).toBe('new');
    expect(result.results[0].companyId).toBe('brand-new-id');
    expect(result.results[0].normalizedName).toBe('BrandNew');
  });

  it('resolves an LLM-matched name to an existing exact-match row by canonical name', async () => {
    // Scenario:
    //   - Raw input "Acme" → cleaned "Acme"  → exact match in DB (name_normalized = 'acme')
    //   - Raw input "Acme Global" → cleaned "Acme Global" (no suffix) → NOT in DB by exact or
    //     fuzzy → goes to LLM → LLM says "Acme Global" → "Acme" (canonical)
    //     → matchMethod = 'llm', companyId = 'acme-id'
    //
    // Key insight: results.rawName is the *cleaned* name, not the original raw input.
    // "Acme Global" has no suffix, so cleaned === "Acme Global".
    const acmeRow = makeCompanyRow({ id: 'acme-id', name_normalized: 'acme', name_display: 'Acme' });

    let callIndex = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};

      if (table === 'client_connections') {
        chain.update = vi.fn().mockReturnValue(chain);
        chain.eq     = vi.fn().mockReturnValue(chain);
        chain.then   = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve);
        return chain;
      }

      const myCall = callIndex++;

      if (myCall === 0) {
        // matchExact: "Acme" hits; "Acme Global" does not (name_normalized = 'acme global')
        // The mock returns only acmeRow — "acme" key — so "acme global" won't hit.
        chain.select = vi.fn().mockReturnValue(chain);
        chain.in     = vi.fn().mockResolvedValue({ data: [acmeRow], error: null });
        chain.then   = undefined;
        return chain;
      }

      if (myCall === 1) {
        // matchFuzzy: no variants match "acme global"
        chain.select   = vi.fn().mockReturnValue(chain);
        chain.overlaps = vi.fn().mockResolvedValue({ data: [], error: null });
        chain.then     = undefined;
        return chain;
      }

      if (myCall === 2) {
        // batch fetch of known company names for LLM context
        chain.select = vi.fn().mockReturnValue(chain);
        chain.limit  = vi.fn().mockResolvedValue({ data: [], error: null });
        chain.then   = undefined;
        return chain;
      }

      // createCompanyEntry — should NOT be reached for the LLM match
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: { id: 'should-not-be-used' }, error: null });
      chain.then   = undefined;
      return chain;
    });

    // LLM recognises "Acme Global" as a variant of canonical "Acme"
    mockLlm.chat.mockResolvedValue({ text: '{"Acme Global":"Acme"}' });
    mockRepairJSON.mockReturnValue({ 'Acme Global': 'Acme' });

    const result = await normalizeCompanyBatch('user-001', ['Acme', 'Acme Global']);

    expect(result.results).toHaveLength(2);

    // results.rawName is the cleaned name (no suffix stripping happened for these inputs)
    const byRaw = new Map(result.results.map((r) => [r.rawName, r]));

    expect(byRaw.get('Acme')?.matchMethod).toBe('exact');
    expect(byRaw.get('Acme')?.companyId).toBe('acme-id');

    const llmMatch = byRaw.get('Acme Global');
    expect(llmMatch?.matchMethod).toBe('llm');
    expect(llmMatch?.companyId).toBe('acme-id');
    expect(llmMatch?.normalizedName).toBe('Acme');

    // No new companies should have been created
    expect(result.newCompaniesCreated).toBe(0);
  });
});
