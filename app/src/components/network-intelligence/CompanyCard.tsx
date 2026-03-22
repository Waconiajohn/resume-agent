import { useState, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import type { CompanySummary, ConnectionItem } from '@/types/ni';
import { API_BASE } from '@/lib/api';

export interface CompanyCardProps {
  company: CompanySummary;
  accessToken: string | null;
}

export function CompanyCard({ company, accessToken }: CompanyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const displayName = company.companyDisplayName ?? company.companyRaw;

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    if (connections.length > 0) return;
    if (!accessToken) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/ni/connections?limit=500`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.connections ?? [])
          .filter((c: Record<string, unknown>) => c.company_raw === company.companyRaw)
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            firstName: c.first_name as string,
            lastName: c.last_name as string,
            email: (c.email as string) ?? null,
            companyRaw: c.company_raw as string,
            companyNormalized: (c.company_display_name as string) ?? null,
            position: (c.position as string) ?? null,
            connectedOn: (c.connected_on as string) ?? null,
          }));
        setConnections(filtered);
      }
    } catch {
      // Silently fail — card still shows summary
    } finally {
      setLoading(false);
    }
  }, [expanded, connections.length, accessToken, company.companyRaw]);

  return (
    <GlassCard
      hover
      className={cn('cursor-pointer p-4 transition-all', expanded && 'ring-1 ring-white/[0.12]')}
      onClick={handleToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-white/90">{displayName}</h3>
          {company.topPositions.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-white/40">
              {company.topPositions.slice(0, 2).join(', ')}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-md bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          {company.connectionCount}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2].map((i) => (
                <div key={i} className="h-4 motion-safe:animate-pulse rounded bg-white/[0.05]" />
              ))}
            </div>
          ) : connections.length > 0 ? (
            <ul className="space-y-1.5">
              {connections.map((conn) => (
                <li key={conn.id} className="flex items-center justify-between text-xs">
                  <span className="text-white/70">
                    {conn.firstName} {conn.lastName}
                  </span>
                  {conn.position && (
                    <span className="truncate pl-2 text-white/40">{conn.position}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/30">No connection details available</p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
