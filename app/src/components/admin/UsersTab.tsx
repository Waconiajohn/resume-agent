import { useCallback, useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AdminUserRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  plan_id: string;
  subscription_status: string;
  current_period_end: string | null;
  sessions_this_period: number;
  cost_this_period_usd: number;
}

interface UsersResponse {
  users: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
  query: string | null;
}

interface UsersTabProps {
  adminKey: string;
}

const PAGE_SIZE = 50;
const PLAN_OPTIONS: { value: 'free' | 'starter' | 'pro'; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function planBadgeClass(planId: string): string {
  if (planId === 'pro') return 'bg-[var(--badge-blue-bg)] text-[var(--link)]';
  if (planId === 'starter') return 'bg-[var(--badge-green-bg,rgba(34,197,94,0.12))] text-[var(--badge-green-text)]';
  return 'bg-[var(--accent-muted)] text-[var(--text-muted)]';
}

export function UsersTab({ adminKey }: UsersTabProps) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState<Record<string, string>>({});

  const load = useCallback(
    async (offset: number, query: string) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (query) qs.set('q', query);
        const res = await fetch(`${API_BASE}/admin/users?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${adminKey}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as UsersResponse;
        setUsers(data.users);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [adminKey],
  );

  useEffect(() => {
    void load(0, '');
  // Initial load only. Subsequent reloads are triggered by explicit user actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = () => {
    const q = searchInput.trim();
    setAppliedQuery(q);
    setPage(0);
    void load(0, q);
  };

  const clearSearch = () => {
    setSearchInput('');
    setAppliedQuery('');
    setPage(0);
    void load(0, '');
  };

  const sendReset = async (user: AdminUserRow) => {
    if (!user.email) return;
    if (!confirm(`Send password reset email to ${user.email}?`)) return;
    setActionState((s) => ({ ...s, [user.id]: 'Sending reset…' }));
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}/password-reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionState((s) => ({ ...s, [user.id]: 'Reset email sent.' }));
    } catch (err) {
      setActionState((s) => ({
        ...s,
        [user.id]: `Reset failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  };

  const changePlan = async (user: AdminUserRow, nextPlan: 'free' | 'starter' | 'pro') => {
    if (nextPlan === user.plan_id) return;
    if (!confirm(`Change ${user.email ?? 'user'} plan from ${user.plan_id} → ${nextPlan}?`)) return;
    setActionState((s) => ({ ...s, [user.id]: 'Updating plan…' }));
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}/plan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: nextPlan }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionState((s) => ({ ...s, [user.id]: `Plan set to ${nextPlan}.` }));
      void load(page * PAGE_SIZE, appliedQuery);
    } catch (err) {
      setActionState((s) => ({
        ...s,
        [user.id]: `Plan update failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[240px] flex gap-2">
          <input
            type="search"
            className="flex-1 rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] text-white text-sm px-3 py-2 outline-none focus:border-[var(--link)]/50 placeholder-[var(--text-soft)]"
            placeholder="Search by email (substring)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
          />
          <button
            type="button"
            onClick={runSearch}
            className="rounded-lg bg-[var(--badge-blue-bg)] border border-[var(--link)]/30 text-[var(--link)] text-sm px-3 py-2 hover:bg-[var(--link)]/20 transition-colors"
          >
            Search
          </button>
          {appliedQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-lg border border-[var(--line-soft)] text-[var(--text-soft)] text-sm px-3 py-2 hover:text-[var(--text-muted)] transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--text-soft)] ml-auto">
          {total} {total === 1 ? 'user' : 'users'}
          {appliedQuery && <> matching “{appliedQuery}”</>}
        </p>
      </div>

      {error && (
        <GlassCard className="p-4 border-[#f0a0a0]/20">
          <p className="text-sm text-[#f0a0a0]">Error: {error}</p>
        </GlassCard>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 motion-safe:animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--link)]" />
        </div>
      ) : users.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-[var(--text-soft)] text-sm">No users found.</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {users.map((user) => {
            const message = actionState[user.id];
            return (
              <GlassCard key={user.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white truncate">{user.email ?? '(no email)'}</p>
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          planBadgeClass(user.plan_id),
                        )}
                      >
                        {user.plan_id}
                      </span>
                      {user.subscription_status && user.subscription_status !== 'active' && (
                        <span className="text-xs text-[var(--badge-amber-text)]">{user.subscription_status}</span>
                      )}
                      {!user.email_confirmed_at && (
                        <span className="text-xs text-[var(--badge-amber-text)]">unconfirmed</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-soft)] mt-1 font-mono truncate">{user.id}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-soft)] mt-2">
                      <span>Joined {formatDate(user.created_at)}</span>
                      <span>Last sign-in {formatDate(user.last_sign_in_at)}</span>
                      <span>
                        <span className="text-[var(--text-muted)]">{user.sessions_this_period}</span> sessions this period
                      </span>
                      {user.cost_this_period_usd > 0 && (
                        <span>${user.cost_this_period_usd.toFixed(4)} spend</span>
                      )}
                    </div>
                    {message && (
                      <p className="text-xs text-[var(--text-muted)] mt-2">{message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={user.plan_id}
                      onChange={(e) =>
                        void changePlan(user, e.target.value as 'free' | 'starter' | 'pro')
                      }
                      className="rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] text-white text-xs px-2 py-1.5 outline-none focus:border-[var(--link)]/50"
                    >
                      {PLAN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void sendReset(user)}
                      disabled={!user.email}
                      className="rounded-lg border border-[var(--line-soft)] text-[var(--text-muted)] text-xs px-3 py-1.5 hover:text-white hover:border-[var(--link)]/40 disabled:opacity-30 transition-colors"
                    >
                      Reset password
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => {
            const next = page - 1;
            setPage(next);
            void load(next * PAGE_SIZE, appliedQuery);
          }}
          className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] disabled:opacity-30 px-2 py-1"
        >
          Previous
        </button>
        <span className="text-xs text-[var(--text-soft)] px-2 py-1">Page {page + 1}</span>
        <button
          type="button"
          disabled={(page + 1) * PAGE_SIZE >= total}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void load(next * PAGE_SIZE, appliedQuery);
          }}
          className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] disabled:opacity-30 px-2 py-1"
        >
          Next
        </button>
      </div>
    </div>
  );
}
