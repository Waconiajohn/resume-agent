import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { getBonusSearchCompanies } from '../lib/ni/bonus-company-search.js';

describe('getBonusSearchCompanies', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('filters and sorts companies by the strongest known bonus amount', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'referral_bonus_programs') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                company_id: 'company-1',
                bonus_amount: '$800',
                bonus_currency: 'USD',
                bonus_entry: null,
                bonus_mid: null,
                bonus_senior: null,
                bonus_executive: null,
                confidence: 'medium',
                program_url: null,
              },
              {
                company_id: 'company-2',
                bonus_amount: '$2,000-$5,000',
                bonus_currency: 'USD',
                bonus_entry: null,
                bonus_mid: null,
                bonus_senior: null,
                bonus_executive: '$7,500',
                confidence: 'high',
                program_url: 'https://example.com/acme',
              },
              {
                company_id: 'company-3',
                bonus_amount: null,
                bonus_currency: 'USD',
                bonus_entry: '$1,200',
                bonus_mid: null,
                bonus_senior: '$4,500',
                bonus_executive: null,
                confidence: 'high',
                program_url: null,
              },
            ],
            error: null,
          }),
        };
      }

      if (table === 'company_directory') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'company-2',
                  name_display: 'Acme Corp',
                  domain: 'acme.com',
                  headquarters: 'Chicago, IL',
                  industry: 'Manufacturing',
                },
                {
                  id: 'company-3',
                  name_display: 'Northwind',
                  domain: 'northwind.com',
                  headquarters: 'Dallas, TX',
                  industry: 'Logistics',
                },
              ],
              error: null,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const companies = await getBonusSearchCompanies({ minBonus: 1_000, limit: 10 });

    expect(companies).toHaveLength(2);
    expect(companies[0]).toMatchObject({
      company_id: 'company-2',
      company_name: 'Acme Corp',
      bonus_display: '$7,500',
      bonus_amount_max: 7500,
    });
    expect(companies[1]).toMatchObject({
      company_id: 'company-3',
      company_name: 'Northwind',
      bonus_display: '$4,500',
      bonus_amount_max: 4500,
    });
  });
});
