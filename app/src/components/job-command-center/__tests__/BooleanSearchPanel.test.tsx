// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { BooleanSearchPanel } from '../BooleanSearchPanel';

vi.mock('lucide-react', () => ({
  Copy: () => <span data-testid="icon-copy" />,
  Check: () => <span data-testid="icon-check" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Search: () => <span data-testid="icon-search" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

vi.mock('@/lib/api', () => ({
  API_BASE: '/api',
}));

const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: {
    writeText: clipboardWriteText,
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('BooleanSearchPanel', () => {
  it('shows master-resume guidance when no resume text is available', () => {
    render(
      <BooleanSearchPanel
        accessToken="token"
        resumeText=""
        loadingResume={false}
      />,
    );

    expect(screen.getByText(/Save a master resume first/i)).toBeInTheDocument();
  });

  it('calls the boolean-search route and renders copy-ready strings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'bs_123',
          linkedin: '("VP Operations" OR "COO")',
          indeed: 'title:("VP Operations" OR "COO")',
          google: 'site:linkedin.com/jobs ("VP Operations" OR "COO")',
          recommendedTitles: ['VP Operations', 'COO'],
          extractedTerms: { skills: [], titles: ['VP Operations', 'COO'], industries: [] },
          generatedAt: '2026-03-29T00:00:00.000Z',
        }),
      }),
    );

    render(
      <BooleanSearchPanel
        accessToken="token"
        resumeText="VP Operations with 15 years of manufacturing leadership"
        loadingResume={false}
      />,
    );

    fireEvent.click(screen.getByText(/Generate Search Strings/i));

    await waitFor(() => {
      expect(screen.getByDisplayValue('("VP Operations" OR "COO")')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('title:("VP Operations" OR "COO")')).toBeInTheDocument();
    expect(screen.getByText('VP Operations')).toBeInTheDocument();
    expect(screen.getByText('COO')).toBeInTheDocument();
  });

  it('copies generated output to the clipboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'bs_123',
          linkedin: '("VP Operations" OR "COO")',
          indeed: 'title:("VP Operations" OR "COO")',
          google: 'site:linkedin.com/jobs ("VP Operations" OR "COO")',
          recommendedTitles: ['VP Operations', 'COO'],
          extractedTerms: { skills: [], titles: ['VP Operations', 'COO'], industries: [] },
          generatedAt: '2026-03-29T00:00:00.000Z',
        }),
      }),
    );

    render(
      <BooleanSearchPanel
        accessToken="token"
        resumeText="VP Operations with 15 years of manufacturing leadership"
        loadingResume={false}
      />,
    );

    fireEvent.click(screen.getByText(/Generate Search Strings/i));

    await waitFor(() => {
      expect(screen.getAllByText('Copy').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Copy')[0]);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('("VP Operations" OR "COO")');
    });
  });

  it('shows the optional extra-suggestions button when requested', () => {
    const onShowAiSuggestions = vi.fn();
    render(
      <BooleanSearchPanel
        accessToken="token"
        resumeText="VP Operations with 15 years of manufacturing leadership"
        loadingResume={false}
        onShowAiSuggestions={onShowAiSuggestions}
      />,
    );

    fireEvent.click(screen.getByText('Show More Suggestions'));

    expect(onShowAiSuggestions).toHaveBeenCalledOnce();
  });
});
