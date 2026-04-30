import { useState, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import type { CompanySummary, ConnectionItem } from '@/types/ni';
import { API_BASE } from '@/lib/api';
import { readApiError } from '@/lib/api-errors';

export interface CompanyCardProps {
  company: CompanySummary;
  accessToken: string | null;
}

export function CompanyCard({ company, accessToken }: CompanyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [connections, setConnections] = useState<ConnectionItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = company.companyDisplayName ?? company.companyRaw;

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    if (connections !== null) return;
    if (!accessToken) {
      setError('Sign in to view connection details.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/ni/connections/by-company?company_raw=${encodeURIComponent(company.companyRaw)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data = await res.json();
        const mapped = ((data.connections ?? []) as Array<Record<string, unknown>>).map(
          (c) => ({
            id: c.id as string,
            firstName: c.first_name as string,
            lastName: c.last_name as string,
            email: null,
            companyRaw: company.companyRaw,
            companyNormalized: company.companyDisplayName,
            position: (c.position as string) ?? null,
            connectedOn: null,
            linkedinUrl: (c.linkedin_url as string) ?? null,
          }),
        );
        setConnections(mapped);
      } else {
        setError(await readApiError(res, `Unable to load connection details (${res.status}).`));
      }
    } catch (err) {
      setError(err instanceof Error && err.message
        ? err.message
        : 'Unable to load connection details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [expanded, connections, accessToken, company.companyRaw, company.companyDisplayName]);

  return (
    <GlassCard
      hover
      className={cn('cursor-pointer p-4 transition-all', expanded && 'ring-1 ring-[var(--line-strong)]')}
      onClick={handleToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-[var(--text-strong)]">{displayName}</h3>
        </div>
        <span className="shrink-0 rounded-md bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
          {company.connectionCount}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-[var(--line-soft)] pt-3">
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2].map((i) => (
                <div key={i} className="h-4 motion-safe:animate-pulse rounded bg-[var(--accent-muted)]" />
              ))}
            </div>
          ) : error ? (
            <p className="text-xs text-[var(--badge-red-text)]/80">{error}</p>
          ) : connections && connections.length > 0 ? (
            <ul className="space-y-1.5">
              {connections.map((conn) => {
                const linkedInUrl = conn.linkedinUrl
                  ?? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${conn.firstName} ${conn.lastName} ${company.companyDisplayName ?? company.companyRaw}`)}`;
                return (
                  <li key={conn.id} className="flex items-center justify-between text-xs">
                    <a
                      href={linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                    >
                      {conn.firstName} {conn.lastName}
                    </a>
                    {conn.position && (
                      <span className="truncate pl-2 text-[var(--text-muted)]">{conn.position}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-soft)]">No connection details available</p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
