import { useCallback, useEffect, useState } from 'react';
import { GlassButton } from '@/components/GlassButton';
import { GlassCard } from '@/components/GlassCard';
import { GlassInput } from '@/components/GlassInput';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { BonusCompanySearchItem, TargetTitle } from '@/types/ni';
import { useNiScrapeRunner } from './useNiScrapeRunner';

interface BonusSearchPanelProps {
  accessToken: string | null;
}

function formatCurrencyAmount(value: number | null): string | null {
  if (value == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function BonusSearchPanel({ accessToken }: BonusSearchPanelProps) {
  const [minBonusInput, setMinBonusInput] = useState('1000');
  const [activeMinBonus, setActiveMinBonus] = useState(1000);
  const [companies, setCompanies] = useState<BonusCompanySearchItem[]>([]);
  const [titles, setTitles] = useState<TargetTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const {
    scrapeLogId,
    scrapeStatus,
    result,
    running,
    error,
    currentScanned,
    startScan,
  } = useNiScrapeRunner(accessToken);

  const loadPanelData = useCallback(async (minBonus: number) => {
    if (!accessToken) return;

    setLoading(true);
    setLoadingError(null);

    try {
      const [companiesRes, titlesRes] = await Promise.all([
        fetch(`${API_BASE}/ni/bonus-companies?min_bonus=${minBonus}&limit=50`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE}/ni/target-titles`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (!companiesRes.ok) {
        throw new Error(`Failed to load bonus companies (${companiesRes.status})`);
      }

      const companyData = await companiesRes.json();
      setCompanies(
        (companyData.companies ?? []).map((company: Record<string, unknown>) => ({
          companyId: company.company_id as string,
          companyName: company.company_name as string,
          domain: (company.domain as string) ?? null,
          headquarters: (company.headquarters as string) ?? null,
          industry: (company.industry as string) ?? null,
          bonusDisplay: (company.bonus_display as string) ?? null,
          bonusCurrency: (company.bonus_currency as string) ?? null,
          bonusAmountMin: (company.bonus_amount_min as number) ?? null,
          bonusAmountMax: (company.bonus_amount_max as number) ?? null,
          confidence: (company.confidence as 'high' | 'medium' | 'low' | null) ?? null,
          programUrl: (company.program_url as string) ?? null,
        })),
      );

      if (titlesRes.ok) {
        const titleData = await titlesRes.json();
        setTitles(
          (titleData.titles ?? []).map((t: Record<string, unknown>) => ({
            id: t.id as string,
            title: t.title as string,
            priority: t.priority as number,
            createdAt: t.created_at as string,
          })),
        );
      } else {
        setTitles([]);
      }
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : 'Failed to load bonus companies');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadPanelData(activeMinBonus);
  }, [accessToken, activeMinBonus, loadPanelData]);

  const handleRefresh = useCallback(() => {
    const parsed = Number.parseInt(minBonusInput.replace(/[^\d]/g, ''), 10);
    setActiveMinBonus(Number.isFinite(parsed) && parsed > 0 ? parsed : 1000);
  }, [minBonusInput]);

  const handleScan = useCallback(async () => {
    await startScan({
      companyIds: companies.map((company) => company.companyId).slice(0, 50),
      targetTitles: titles.map((title) => title.title),
      searchContext: 'bonus_search',
      emptyMessage: 'No bonus companies meet the current threshold yet.',
    });
  }, [companies, startScan, titles]);

  if (loading) {
    return (
      <GlassCard className="rounded-xl p-6">
        <div className="space-y-3">
          <div className="h-5 w-40 motion-safe:animate-pulse rounded-lg bg-[var(--accent-muted)]" />
          <div className="h-3 w-80 motion-safe:animate-pulse rounded bg-[var(--accent-muted)]" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 motion-safe:animate-pulse rounded-lg bg-[var(--accent-muted)]" />
            ))}
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="rounded-xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-strong)]">High-Bonus Company Search</h3>
              <p className="text-sm text-[var(--text-soft)]">
                Search companies with strong referral programs even when you do not already have a first-level connection there.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <GlassInput
                value={minBonusInput}
                onChange={(event) => setMinBonusInput(event.target.value)}
                placeholder="1000"
                inputMode="numeric"
                className="w-full sm:w-40"
              />
              <GlassButton variant="ghost" className="sm:shrink-0" onClick={handleRefresh}>
                Refresh List
              </GlassButton>
            </div>
            <p className="text-xs text-[var(--text-soft)]">
              Showing up to 50 companies with a best-known referral bonus of at least{' '}
              <span className="text-[var(--text-muted)]">{formatCurrencyAmount(activeMinBonus) ?? '$1,000'}</span>.
            </p>
          </div>

          <GlassButton
            onClick={() => void handleScan()}
            disabled={running || companies.length === 0}
            loading={running}
            className="shrink-0"
          >
            {running ? 'Scanning...' : 'Scan Bonus Companies'}
          </GlassButton>
        </div>

        {running && scrapeLogId && (
          <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-soft)]">
            Scanning {currentScanned} of {companies.length} bonus companies...
          </div>
        )}

        {error && !running && (
          <div className="mt-4 rounded-md border border-[#f87171]/20 bg-[#f87171]/5 px-4 py-3">
            <p className="text-sm text-[#f87171]/80">{error}</p>
          </div>
        )}

        {loadingError && (
          <div className="mt-4 rounded-md border border-[#f87171]/20 bg-[#f87171]/5 px-4 py-3">
            <p className="text-sm text-[#f87171]/80">{loadingError}</p>
          </div>
        )}

        {result && !running && (
          <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Companies', result.companiesScanned],
                ['Jobs Found', result.jobsFound],
                ['Matching', result.matchingJobs],
                ['Bonus Tagged', result.referralAvailable],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-center">
                  <div className="text-xl font-semibold text-[var(--text-strong)] tabular-nums">{value}</div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-[var(--text-soft)]">
              Scan complete. Review the results in <span className="text-[var(--text-muted)]">Job Matches</span>.
            </p>
          </div>
        )}
      </GlassCard>

      <GlassCard className="rounded-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-muted)]">
              {companies.length} bonus compan{companies.length === 1 ? 'y' : 'ies'} ready to scan
            </h4>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              We sort these by the strongest known referral bonus signal first.
            </p>
          </div>
          {titles.length > 0 && (
            <div className="text-xs text-[var(--text-soft)]">
              Using {titles.length} target title{titles.length !== 1 ? 's' : ''} for matching
            </div>
          )}
        </div>

        {companies.length === 0 ? (
          <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 text-sm text-[var(--text-soft)]">
            No companies meet the current bonus threshold yet.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {companies.map((company) => (
              <div
                key={company.companyId}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">{company.companyName}</div>
                    <div className="mt-1 text-xs text-[var(--text-soft)]">
                      {[company.industry, company.headquarters, company.domain].filter(Boolean).join(' · ') || 'Company profile available'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#57CDA4]/85">
                      {company.bonusDisplay ?? formatCurrencyAmount(company.bonusAmountMax) ?? 'Bonus listed'}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
                      {company.confidence ? `${company.confidence} confidence` : 'known bonus'}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-soft)]">
                  {company.bonusAmountMax !== null && (
                    <span
                      className={cn(
                        'rounded-md border px-2 py-1',
                        company.bonusAmountMax >= 5000
                          ? 'border-[#57CDA4]/20 bg-[#57CDA4]/10 text-[#57CDA4]/80'
                          : 'border-[var(--line-soft)] bg-[var(--surface-1)] text-[var(--text-soft)]',
                      )}
                    >
                      up to {formatCurrencyAmount(company.bonusAmountMax)}
                    </span>
                  )}
                  {company.programUrl && (
                    <a
                      href={company.programUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-1 text-[var(--text-soft)] hover:text-[var(--text-muted)]"
                    >
                      View program
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
