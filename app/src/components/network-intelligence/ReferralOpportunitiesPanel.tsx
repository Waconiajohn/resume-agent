import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE } from '@/lib/api';

interface ReferralConnection {
  first_name: string;
  last_name: string;
  position: string | null;
}

interface ReferralOpportunity {
  job_match_id: string;
  job_title: string;
  job_url: string | null;
  job_location: string | null;
  match_score: number | null;
  company_id: string;
  company_name: string;
  bonus_amount: string | null;
  bonus_currency: string | null;
  program_url: string | null;
  connections: ReferralConnection[];
  connection_count: number;
}

interface GenerateOutreachPayload {
  name: string;
  title: string;
  company: string;
  referralContext?: {
    company: string;
    bonus_amount: string;
    bonus_currency?: string;
    job_title?: string;
    contact_name?: string;
    contact_title?: string;
  };
}

interface ReferralOpportunitiesPanelProps {
  onGenerateOutreach?: (payload: GenerateOutreachPayload) => void;
}

export function ReferralOpportunitiesPanel({ onGenerateOutreach }: ReferralOpportunitiesPanelProps) {
  const { session } = useAuth();
  const [opportunities, setOpportunities] = useState<ReferralOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpportunities = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ni/referral-opportunities?limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const data = await res.json();
      setOpportunities(data.opportunities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchOpportunities(); }, [fetchOpportunities]);

  const handleGenerateOutreach = useCallback((opp: ReferralOpportunity) => {
    if (!onGenerateOutreach) return;

    // Use the first connection as the target if available
    const firstConn = opp.connections[0];
    const contactName = firstConn
      ? `${firstConn.first_name} ${firstConn.last_name}`.trim()
      : '';
    const contactTitle = firstConn?.position ?? '';

    onGenerateOutreach({
      name: contactName,
      title: contactTitle,
      company: opp.company_name,
      referralContext: opp.bonus_amount
        ? {
            company: opp.company_name,
            bonus_amount: opp.bonus_amount,
            bonus_currency: opp.bonus_currency ?? undefined,
            job_title: opp.job_title,
            contact_name: contactName || undefined,
            contact_title: contactTitle || undefined,
          }
        : undefined,
    });
  }, [onGenerateOutreach]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-[var(--text-soft)]">Loading referral opportunities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-sm text-red-400/80">{error}</p>
        <button
          type="button"
          onClick={fetchOpportunities}
          className="mt-3 text-xs text-[#98b3ff]/70 hover:text-[#98b3ff] transition-colors"
        >
          Try Again
        </button>
      </GlassCard>
    );
  }

  if (opportunities.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <div className="text-3xl mb-3" aria-hidden="true">🤝</div>
        <h3 className="text-base font-semibold text-[var(--text-muted)] mb-2">No Referral Opportunities Yet</h3>
        <p className="text-sm text-[var(--text-soft)] max-w-md mx-auto leading-relaxed">
          Referral opportunities appear when you have both job matches and connections at companies with referral bonus programs. To get started:
        </p>
        <ul className="mt-4 text-xs text-[var(--text-soft)] space-y-1.5 max-w-sm mx-auto text-left">
          <li>1. Import your LinkedIn connections (Import tab)</li>
          <li>2. Run a job scan on your target companies (Job Scan tab)</li>
          <li>3. Opportunities will appear here automatically</li>
        </ul>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[var(--text-soft)]">
          {opportunities.length} Referral {opportunities.length === 1 ? 'Opportunity' : 'Opportunities'}
        </h3>
        <button
          type="button"
          onClick={fetchOpportunities}
          className="text-xs text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
        >
          Refresh
        </button>
      </div>

      {opportunities.map((opp) => (
        <GlassCard key={opp.job_match_id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-[var(--text-strong)] truncate">{opp.job_title}</h4>
                {opp.match_score != null && (
                  <span className={cn(
                    'flex-shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]',
                    opp.match_score >= 80
                      ? 'bg-emerald-500/15 text-emerald-400/80 border-emerald-500/20'
                      : opp.match_score >= 60
                        ? 'bg-amber-500/15 text-amber-400/80 border-amber-500/20'
                        : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border-[var(--line-soft)]',
                  )}>
                    {opp.match_score}% match
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-soft)]">
                {opp.company_name}{opp.job_location ? ` · ${opp.job_location}` : ''}
              </p>
            </div>

            {opp.bonus_amount && (
              <div className="flex-shrink-0 text-right">
                <div className="text-xs font-medium text-emerald-400/80">
                  {opp.bonus_currency ?? 'USD'} {opp.bonus_amount}
                </div>
                <div className="text-[12px] text-[var(--text-soft)]">referral bonus</div>
              </div>
            )}
          </div>

          {/* Connections at this company */}
          <div className="mt-3 pt-3 border-t border-[var(--line-soft)]">
            <div className="text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Your Connections ({opp.connection_count})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {opp.connections.slice(0, 5).map((conn, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-soft)]"
                >
                  {conn.first_name} {conn.last_name}
                  {conn.position && <span className="text-[var(--text-soft)]">· {conn.position}</span>}
                </span>
              ))}
              {opp.connections.length > 5 && (
                <span className="inline-flex items-center rounded-md bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
                  +{opp.connections.length - 5} more
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            {onGenerateOutreach && (
              <button
                type="button"
                onClick={() => handleGenerateOutreach(opp)}
                className="rounded-lg bg-indigo-600/30 border border-indigo-400/20 px-3 py-1.5 text-xs font-medium text-indigo-300/80 hover:bg-indigo-600/40 hover:border-indigo-400/30 transition-all"
              >
                Generate Outreach
              </button>
            )}
            {opp.job_url && (
              <a
                href={opp.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] px-3 py-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-1)] transition-all"
              >
                View Job
              </a>
            )}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
