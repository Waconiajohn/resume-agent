/**
 * SessionsCard — Settings → Active sessions.
 *
 * Sprint B (auth hardening). Lists the user's Supabase auth sessions
 * (one per signed-in browser/device) with browser/OS, IP, last seen,
 * and a per-row Revoke button. The current session is marked and
 * cannot be revoked from here — that's what Sign out does.
 *
 * "Sign out everywhere else" revokes every other session in one call.
 */

import { useEffect, useState } from 'react';
import { Loader2, Monitor, Power, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

interface SessionRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  created_at: string;
  updated_at: string | null;
  not_after: string | null;
  current: boolean;
}

function shortenUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = ua.match(/(Chrome|Safari|Firefox|Edge|Opera)\/[\d.]+/)?.[1] ?? null;
  const os = ua.match(/(Mac OS X [\d_.]+|Windows NT [\d.]+|Linux|iPhone|iPad|Android [\d.]+)/)?.[1]?.replace(/_/g, '.') ?? null;
  if (browser && os) return `${browser} on ${os}`;
  if (os) return os;
  if (browser) return browser;
  return ua.slice(0, 40);
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SessionsCard() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const authedFetch = async (path: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    return res;
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/auth/sessions');
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Failed to load sessions (${res.status})`);
        return;
      }
      const body = await res.json() as { sessions: SessionRow[] };
      setRows(body.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setStatusMessage(null);
    setError(null);
    try {
      const res = await authedFetch(`/auth/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Failed to revoke (${res.status})`);
        return;
      }
      setStatusMessage('Session revoked.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleSignOutOthers = async () => {
    setBulkLoading(true);
    setStatusMessage(null);
    setError(null);
    try {
      const res = await authedFetch('/auth/sessions/sign-out-others', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Failed to sign out other sessions (${res.status})`);
        return;
      }
      const body = await res.json() as { revoked?: number };
      setStatusMessage(
        typeof body.revoked === 'number' && body.revoked > 0
          ? `Signed out of ${body.revoked} other session${body.revoked === 1 ? '' : 's'}.`
          : 'No other sessions to sign out.',
      );
      setBulkConfirm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out other sessions');
    } finally {
      setBulkLoading(false);
    }
  };

  const otherCount = rows.filter((r) => !r.current).length;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <Monitor size={18} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Active sessions</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh sessions"
          className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)] disabled:opacity-50"
        >
          {loading
            ? <Loader2 size={14} className="motion-safe:animate-spin" />
            : <RefreshCw size={14} />}
        </button>
      </div>

      <p className="text-[12px] text-[var(--text-muted)]">
        Each row is a signed-in browser or device. Revoke any you don't recognize. Your current
        session is marked — to sign it out, use the Sign out button at the bottom of Settings.
      </p>

      {error && (
        <p className="mt-3 text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>
      )}
      {statusMessage && (
        <p className="mt-3 text-xs text-[var(--badge-green-text)]" role="status">{statusMessage}</p>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-4 text-[12px] text-[var(--text-muted)]">No active sessions.</p>
      )}

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--line-soft)]" data-testid="sessions-list">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[var(--text-strong)]">
                  <span>{shortenUserAgent(s.user_agent)}</span>
                  {s.current && (
                    <span
                      className="rounded-md border border-[var(--badge-green-text)]/30 bg-[var(--badge-green-text)]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-[var(--badge-green-text)]"
                      data-testid="sessions-current-badge"
                    >
                      This device
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {s.ip ?? 'unknown ip'} · last seen {formatLastSeen(s.updated_at ?? s.created_at)}
                </div>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => void handleRevoke(s.id)}
                  disabled={revokingId === s.id || bulkLoading}
                  data-testid="session-revoke-button"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-strong)] hover:border-[var(--badge-red-text)]/40 hover:text-[var(--badge-red-text)] disabled:opacity-50"
                >
                  {revokingId === s.id
                    ? <Loader2 size={12} className="motion-safe:animate-spin" />
                    : <Power size={12} />}
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {otherCount > 0 && (
        <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
          {!bulkConfirm ? (
            <GlassButton
              variant="ghost"
              onClick={() => setBulkConfirm(true)}
              data-testid="sessions-sign-out-others-button"
              disabled={bulkLoading}
            >
              <Power size={13} className="mr-1.5" />
              Sign out everywhere else
            </GlassButton>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--text-soft)]">
                Sign out of {otherCount} other session{otherCount === 1 ? '' : 's'}?
              </span>
              <button
                type="button"
                onClick={() => void handleSignOutOthers()}
                disabled={bulkLoading}
                data-testid="sessions-confirm-sign-out-others"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--badge-red-text)]/40 bg-[var(--badge-red-text)]/10 px-2.5 py-1 text-[12px] font-medium text-[var(--badge-red-text)] disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 size={12} className="motion-safe:animate-spin" /> : <Power size={12} />}
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setBulkConfirm(false)}
                disabled={bulkLoading}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-strong)] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
