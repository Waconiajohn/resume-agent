// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BillingDashboard } from '@/components/BillingDashboard';

describe('BillingDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('falls back to the free plan when the billing payload is partial', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    render(<BillingDashboard accessToken="token-123" />);

    await waitFor(() => {
      expect(screen.getByText('Usage this month')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Free')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith('/api/billing/subscription', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });
});
