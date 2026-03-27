// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { BonusSearchPanel } from '../BonusSearchPanel';

describe('BonusSearchPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders scan-ready bonus companies above the threshold', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                company_id: 'company-1',
                company_name: 'Acme Corp',
                domain: 'acme.com',
                headquarters: 'Chicago, IL',
                industry: 'Manufacturing',
                bonus_display: '$5,000-$15,000',
                bonus_currency: 'USD',
                bonus_amount_min: 5000,
                bonus_amount_max: 15000,
                confidence: 'high',
                program_url: 'https://example.com/acme',
              },
            ],
            min_bonus: 1000,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            titles: [{ id: 'title-1', title: 'VP Operations', priority: 1 }],
          }),
          { status: 200 },
        ),
      );

    render(<BonusSearchPanel accessToken="test-token" />);

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('$5,000-$15,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan Bonus Companies/i })).toBeEnabled();
  });
});
