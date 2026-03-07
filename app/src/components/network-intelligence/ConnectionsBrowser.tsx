import { useState, useEffect, useMemo } from 'react';
import { CompanyCard } from '@/components/network-intelligence/CompanyCard';
import type { CompanySummary } from '@/types/ni';
import { API_BASE } from '@/lib/api';

export interface ConnectionsBrowserProps {
  accessToken: string | null;
}

export function ConnectionsBrowser({ accessToken }: ConnectionsBrowserProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/ni/connections/companies`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCompanies(data.companies ?? []);
        }
      } catch {
        // Silently fail — empty state will show
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [accessToken]);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        c.companyRaw.toLowerCase().includes(q) ||
        (c.companyDisplayName?.toLowerCase().includes(q) ?? false),
    );
  }, [companies, search]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-full motion-safe:animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 motion-safe:animate-pulse rounded-[18px] bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] p-8 text-center">
        <p className="text-sm text-white/40">No connections found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search companies..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs text-white/80 placeholder:text-white/30 outline-none focus:border-white/[0.2]"
      />

      <p className="text-xs text-white/40">
        {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
        {search && ` matching "${search}"`}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((company) => (
          <CompanyCard
            key={company.companyRaw}
            company={company}
            accessToken={accessToken}
          />
        ))}
      </div>
    </div>
  );
}
