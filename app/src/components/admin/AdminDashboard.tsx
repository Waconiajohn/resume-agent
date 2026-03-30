/**
 * AdminDashboard — Internal platform analytics view.
 *
 * Shows pipeline stats, recent errors, and session list.
 * Only accessible when the user provides a valid ADMIN_API_KEY via the
 * Authorization Bearer header on admin API calls.
 *
 * Auth pattern: user enters their admin key once, it's stored in sessionStorage
 * for the duration of the browser session (never persisted to localStorage).
 */

import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineStats {
  completions_total: number;
  errors_total: number;
  success_rate_pct: number | null;
  avg_duration_ms: number;
  avg_cost_usd: number;
  total_cost_usd: number;
  completions_by_domain: Record<string, number>;
  errors_by_domain: Record<string, number>;
}

interface AdminStatsResponse {
  pipeline: PipelineStats;
  active_users_24h: number;
  active_sessions: number;
  generated_at: string;
}

interface ErrorRow {
  session_id: string;
  user_id: string;
  product_type: string | null;
  error_message: string | null;
  timestamp: string;
}

interface ErrorsResponse {
  errors: ErrorRow[];
  total: number;
  limit: number;
  offset: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  status: string;
  product_type: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionsResponse {
  sessions: SessionRow[];
  total: number;
  limit: number;
  offset: number;
}

interface ProductFunnelStep {
  id: string;
  label: string;
  event_names: string[];
  users: number;
  events: number;
}

interface ProductFunnelResponse {
  generated_at: string;
  days: number;
  total_events: number;
  active_users: number;
  event_counts: Record<string, number>;
  funnel_steps: ProductFunnelStep[];
  path_breakdown: {
    smart_referrals: Record<string, number>;
    shortlist_entry_points: Record<string, number>;
    boolean_copy_targets: Record<string, number>;
  };
}

type AdminTab = 'stats' | 'funnel' | 'errors' | 'sessions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green' | 'red' | 'blue' | 'default';
}) {
  const accentClass =
    accent === 'green'
      ? 'text-[#b5dec2]'
      : accent === 'red'
      ? 'text-[#f0a0a0]'
      : accent === 'blue'
      ? 'text-[#afc4ff]'
      : 'text-white';

  return (
    <GlassCard className="p-4">
      <p className="text-xs text-[var(--text-soft)] uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-semibold', accentClass)}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-soft)] mt-0.5">{sub}</p>}
    </GlassCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('admin_key') ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('stats');
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [funnel, setFunnel] = useState<ProductFunnelResponse | null>(null);
  const [errors, setErrors] = useState<ErrorsResponse | null>(null);
  const [sessions, setSessions] = useState<SessionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [sessionsPage, setSessionsPage] = useState(0);
  const [errorsPage, setErrorsPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchWithKey = useCallback(
    async (url: string, key: string) => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) throw new Error('unauthorized');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    [],
  );

  const authenticate = useCallback(
    async (key: string) => {
      setAuthError('');
      try {
        // Verify key by calling /api/admin/stats
        await fetchWithKey(`${API_BASE}/admin/stats`, key);
        sessionStorage.setItem('admin_key', key);
        setAdminKey(key);
        setIsAuthenticated(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          setAuthError('Invalid admin key.');
        } else {
          setAuthError(`Connection error: ${msg}`);
        }
      }
    },
    [fetchWithKey],
  );

  // Auto-authenticate if key was stored
  useEffect(() => {
    if (adminKey) {
      void authenticate(adminKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await fetchWithKey(`${API_BASE}/admin/stats`, adminKey) as AdminStatsResponse;
      setStats(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchWithKey, adminKey]);

  const loadFunnel = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await fetchWithKey(`${API_BASE}/admin/product-funnel?days=7`, adminKey) as ProductFunnelResponse;
      setFunnel(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchWithKey, adminKey]);

  const loadErrors = useCallback(async (offset: number) => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await fetchWithKey(
        `${API_BASE}/admin/errors?limit=${PAGE_SIZE}&offset=${offset}`,
        adminKey,
      ) as ErrorsResponse;
      setErrors(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchWithKey, adminKey]);

  const loadSessions = useCallback(async (offset: number) => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await fetchWithKey(
        `${API_BASE}/admin/sessions?limit=${PAGE_SIZE}&offset=${offset}`,
        adminKey,
      ) as SessionsResponse;
      setSessions(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchWithKey, adminKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'stats') void loadStats();
    if (activeTab === 'funnel') void loadFunnel();
    if (activeTab === 'errors') void loadErrors(errorsPage * PAGE_SIZE);
    if (activeTab === 'sessions') void loadSessions(sessionsPage * PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  // ─── Login screen ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <GlassCard className="p-8 max-w-sm w-full">
          <h1 className="text-xl font-semibold text-white mb-1">Admin Dashboard</h1>
          <p className="text-sm text-[var(--text-soft)] mb-6">Enter your admin API key to continue.</p>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              className="rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] text-white text-sm px-3 py-2.5 outline-none focus:border-[#afc4ff]/50 placeholder-[var(--text-soft)]"
              placeholder="Admin API key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && keyInput.trim()) {
                  void authenticate(keyInput.trim());
                }
              }}
              autoComplete="off"
            />
            {authError && <p className="text-xs text-[#f0a0a0]">{authError}</p>}
            <button
              type="button"
              onClick={() => { if (keyInput.trim()) void authenticate(keyInput.trim()); }}
              className="rounded-lg bg-[#afc4ff]/20 border border-[#afc4ff]/30 text-[#afc4ff] text-sm px-4 py-2.5 hover:bg-[#afc4ff]/30 transition-colors"
            >
              Authenticate
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ─── Stats tab ─────────────────────────────────────────────────────────────
  const renderStats = () => {
    if (!stats) return null;
    const p = stats.pipeline;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Pipelines"
            value={p.completions_total + p.errors_total}
          />
          <StatCard
            label="Success Rate"
            value={p.success_rate_pct !== null ? `${p.success_rate_pct}%` : '—'}
            accent={
              p.success_rate_pct === null
                ? 'default'
                : p.success_rate_pct >= 90
                ? 'green'
                : p.success_rate_pct >= 70
                ? 'default'
                : 'red'
            }
          />
          <StatCard
            label="Avg Duration"
            value={formatMs(p.avg_duration_ms)}
            accent="blue"
          />
          <StatCard
            label="Avg Cost"
            value={p.avg_cost_usd > 0 ? `$${p.avg_cost_usd.toFixed(4)}` : '—'}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Completions"
            value={p.completions_total}
            accent="green"
          />
          <StatCard
            label="Errors"
            value={p.errors_total}
            accent={p.errors_total > 0 ? 'red' : 'default'}
          />
          <StatCard
            label="Total Cost"
            value={`$${p.total_cost_usd.toFixed(4)}`}
          />
          <StatCard
            label="Active Sessions"
            value={stats.active_sessions}
            accent="blue"
          />
          <StatCard
            label="Active Users (24h)"
            value={stats.active_users_24h}
            accent="blue"
          />
        </div>

        {Object.keys(p.completions_by_domain).length > 0 && (
          <GlassCard className="p-4">
            <p className="text-xs text-[var(--text-soft)] uppercase tracking-wider mb-3">Completions by Domain</p>
            <div className="space-y-1.5">
              {Object.entries(p.completions_by_domain).map(([domain, count]) => (
                <div key={domain} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">{domain}</span>
                  <span className="text-[#b5dec2] font-medium">{count}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        <p className="text-xs text-[var(--text-soft)] text-right">
          Generated {formatDate(stats.generated_at)}
        </p>
      </div>
    );
  };

  // ─── Errors tab ────────────────────────────────────────────────────────────
  const renderErrors = () => {
    if (!errors) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-soft)]">
            {errors.total} total error sessions
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={errorsPage === 0}
              onClick={() => {
                const next = errorsPage - 1;
                setErrorsPage(next);
                void loadErrors(next * PAGE_SIZE);
              }}
              className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] disabled:opacity-30 px-2 py-1"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--text-soft)] px-2 py-1">
              Page {errorsPage + 1}
            </span>
            <button
              type="button"
              disabled={(errorsPage + 1) * PAGE_SIZE >= errors.total}
              onClick={() => {
                const next = errorsPage + 1;
                setErrorsPage(next);
                void loadErrors(next * PAGE_SIZE);
              }}
              className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] disabled:opacity-30 px-2 py-1"
            >
              Next
            </button>
          </div>
        </div>

        {errors.errors.length === 0 ? (
          <GlassCard className="p-6 text-center">
            <p className="text-[var(--text-soft)] text-sm">No errors found.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {errors.errors.map((row) => (
              <GlassCard key={row.session_id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-[#afc4ff] truncate">{row.session_id}</p>
                    <p className="text-xs text-[var(--text-soft)] mt-0.5">
                      {row.product_type ?? 'unknown product'} — user {row.user_id.slice(0, 8)}...
                    </p>
                    {row.error_message && (
                      <p className="text-xs text-[#f0a0a0] mt-1 truncate">{row.error_message}</p>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-soft)] whitespace-nowrap shrink-0">
                    {formatDate(row.timestamp)}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFunnel = () => {
    if (!funnel) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Active Users"
            value={funnel.active_users}
            accent="blue"
          />
          <StatCard
            label="Tracked Events"
            value={funnel.total_events}
          />
          <StatCard
            label="Job Searches"
            value={funnel.event_counts.job_board_search_run ?? 0}
            accent="green"
          />
          <StatCard
            label="Smart Referrals"
            value={funnel.event_counts.smart_referrals_path_selected ?? 0}
            accent="blue"
          />
        </div>

        <GlassCard className="p-4">
          <p className="text-xs text-[var(--text-soft)] uppercase tracking-wider mb-3">
            Core Funnel (Last {funnel.days} Days)
          </p>
          <div className="space-y-2">
            {funnel.funnel_steps.map((step) => (
              <div key={step.id} className="flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="text-[var(--text-muted)]">{step.label}</p>
                  <p className="text-xs text-[var(--text-soft)]">{step.event_names.join(', ')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white font-medium">{step.users} users</p>
                  <p className="text-xs text-[var(--text-soft)]">{step.events} events</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GlassCard className="p-4">
            <p className="text-xs text-[var(--text-soft)] uppercase tracking-wider mb-3">Smart Referrals Paths</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Network</span>
                <span className="text-white">{funnel.path_breakdown.smart_referrals.network ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Bonus</span>
                <span className="text-white">{funnel.path_breakdown.smart_referrals.bonus ?? 0}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-xs text-[var(--text-soft)] uppercase tracking-wider mb-3">Shortlist Entry</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Overview CTA</span>
                <span className="text-white">{funnel.path_breakdown.shortlist_entry_points.overview_cta ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Board Target</span>
                <span className="text-white">{funnel.path_breakdown.shortlist_entry_points.board_target ?? 0}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-xs text-[var(--text-soft)] uppercase tracking-wider mb-3">Boolean Copy Targets</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">LinkedIn</span>
                <span className="text-white">{funnel.path_breakdown.boolean_copy_targets.linkedin ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Indeed</span>
                <span className="text-white">{funnel.path_breakdown.boolean_copy_targets.indeed ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Titles</span>
                <span className="text-white">{funnel.path_breakdown.boolean_copy_targets.titles ?? 0}</span>
              </div>
            </div>
          </GlassCard>
        </div>

        <p className="text-xs text-[var(--text-soft)] text-right">
          Generated {formatDate(funnel.generated_at)}
        </p>
      </div>
    );
  };

  // ─── Sessions tab ──────────────────────────────────────────────────────────
  const STATUS_COLORS: Record<string, string> = {
    complete: 'text-[#b5dec2]',
    error: 'text-[#f0a0a0]',
    active: 'text-[#afc4ff]',
    processing: 'text-[#f0d99f]',
    pending: 'text-[var(--text-soft)]',
  };

  const renderSessions = () => {
    if (!sessions) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-soft)]">
            {sessions.total} total sessions
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={sessionsPage === 0}
              onClick={() => {
                const next = sessionsPage - 1;
                setSessionsPage(next);
                void loadSessions(next * PAGE_SIZE);
              }}
              className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] disabled:opacity-30 px-2 py-1"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--text-soft)] px-2 py-1">
              Page {sessionsPage + 1}
            </span>
            <button
              type="button"
              disabled={(sessionsPage + 1) * PAGE_SIZE >= sessions.total}
              onClick={() => {
                const next = sessionsPage + 1;
                setSessionsPage(next);
                void loadSessions(next * PAGE_SIZE);
              }}
              className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] disabled:opacity-30 px-2 py-1"
            >
              Next
            </button>
          </div>
        </div>

        {sessions.sessions.length === 0 ? (
          <GlassCard className="p-6 text-center">
            <p className="text-[var(--text-soft)] text-sm">No sessions found.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {sessions.sessions.map((row) => (
              <GlassCard key={row.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-[#afc4ff] truncate">{row.id}</p>
                    <p className="text-xs text-[var(--text-soft)] mt-0.5">
                      {row.product_type ?? 'unknown product'} — user {row.user_id.slice(0, 8)}...
                    </p>
                    {row.error_message && (
                      <p className="text-xs text-[#f0a0a0] mt-1 truncate">{row.error_message}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn('text-xs font-medium', STATUS_COLORS[row.status] ?? 'text-[var(--text-soft)]')}>
                      {row.status}
                    </span>
                    <span className="text-xs text-[var(--text-soft)]">
                      {formatDate(row.created_at)}
                    </span>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Full dashboard ────────────────────────────────────────────────────────
  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'stats', label: 'Stats' },
    { id: 'funnel', label: 'Funnel' },
    { id: 'errors', label: 'Errors' },
    { id: 'sessions', label: 'Sessions' },
  ];

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>
            <p className="text-sm text-[var(--text-soft)] mt-0.5">Platform analytics and session management</p>
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('admin_key');
              setIsAuthenticated(false);
              setAdminKey('');
              setKeyInput('');
            }}
            className="text-xs text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors px-3 py-1.5 rounded-lg border border-[var(--line-soft)]"
          >
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--line-soft)] pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-[#afc4ff] text-[#afc4ff]'
                  : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text-muted)]',
              )}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'stats') void loadStats();
              if (activeTab === 'funnel') void loadFunnel();
              if (activeTab === 'errors') void loadErrors(errorsPage * PAGE_SIZE);
              if (activeTab === 'sessions') void loadSessions(sessionsPage * PAGE_SIZE);
            }}
            className="ml-auto text-xs text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors px-3 py-2"
          >
            Refresh
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 motion-safe:animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[#afc4ff]" />
          </div>
        )}

        {fetchError && !loading && (
          <GlassCard className="p-4 border-[#f0a0a0]/20">
            <p className="text-sm text-[#f0a0a0]">Error: {fetchError}</p>
          </GlassCard>
        )}

        {!loading && !fetchError && activeTab === 'stats' && renderStats()}
        {!loading && !fetchError && activeTab === 'funnel' && renderFunnel()}
        {!loading && !fetchError && activeTab === 'errors' && renderErrors()}
        {!loading && !fetchError && activeTab === 'sessions' && renderSessions()}
      </div>
    </div>
  );
}
