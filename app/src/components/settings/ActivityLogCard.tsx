/**
 * ActivityLogCard — Sprint B (auth hardening).
 *
 * Reads the caller's last ~50 entries from /api/auth/events and renders
 * them as a compact list of recent sign-ins, sign-outs, password
 * resets, and profile updates with timestamp + IP + user-agent. Lets
 * the user spot a sign-in from an unfamiliar device.
 */

import { useEffect, useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import { AUTH_EVENT_LABELS, type AuthEventType } from '@/types/auth-events';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';

interface AuthEvent {
  id: string;
  event_type: AuthEventType | string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

function labelFor(type: string): string {
  if (type in AUTH_EVENT_LABELS) {
    return AUTH_EVENT_LABELS[type as AuthEventType];
  }
  return type;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shortenUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  // Keep it short — first browser/OS hint is enough for at-a-glance scanning.
  const m = ua.match(/(Chrome|Safari|Firefox|Edge|Opera)\/[\d.]+/);
  const browser = m?.[1] ?? null;
  const osMatch = ua.match(/(Mac OS X [\d_.]+|Windows NT [\d.]+|Linux|iPhone|iPad|Android [\d.]+)/);
  const os = osMatch?.[1]?.replace(/_/g, '.') ?? null;
  if (browser && os) return `${browser} on ${os}`;
  if (os) return os;
  if (browser) return browser;
  return ua.slice(0, 40);
}

const PAGE_SIZE = 50;

export function ActivityLogCard() {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // `mode='refresh'` resets the list (initial load + manual refresh + focus
  // refresh); `mode='more'` appends the next page using nextCursor.
  const fetchPage = async (mode: 'refresh' | 'more'): Promise<void> => {
    if (mode === 'refresh') {
      setLoading(true);
    } else {
      if (!nextCursor) return;
      setLoadingMore(true);
    }
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Not authenticated');
        return;
      }
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (mode === 'more' && nextCursor) params.set('before', nextCursor);
      const res = await fetch(`${API_BASE}/auth/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Failed to load activity (${res.status})`);
        return;
      }
      const body = await res.json() as { events: AuthEvent[]; nextCursor: string | null };
      const fetched = body.events ?? [];
      setEvents((prev) => (mode === 'more' ? [...prev, ...fetched] : fetched));
      setNextCursor(body.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      if (mode === 'refresh') setLoading(false);
      else setLoadingMore(false);
    }
  };

  const load = () => fetchPage('refresh');
  const loadMore = () => fetchPage('more');

  useEffect(() => {
    void load();
  }, []);

  // Sprint B.3 — refresh on tab focus so a sign-in or password change made
  // in another tab surfaces here instead of the user having to manually
  // hit Refresh.
  useRefreshOnFocus(load);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Recent activity</h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || loadingMore}
          aria-label="Refresh activity"
          className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)] disabled:opacity-50"
        >
          {loading
            ? <Loader2 size={14} className="motion-safe:animate-spin" />
            : <RefreshCw size={14} />}
        </button>
      </div>
      <p className="text-[12px] text-[var(--text-muted)]">
        Recent sign-ins and account changes. If anything here looks unfamiliar, change your
        password right away.
      </p>

      {error && (
        <p className="mt-3 text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="mt-4 text-[12px] text-[var(--text-muted)]">
          No activity recorded yet. Events will appear here on your next sign-in.
        </p>
      )}

      {events.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--line-soft)]" data-testid="activity-log-list">
          {events.map((e) => {
            const label = labelFor(e.event_type);
            const ua = shortenUserAgent(e.user_agent);
            return (
              <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <span className="text-[var(--text-strong)]">{label}</span>
                  {(ua || e.ip_address) && (
                    <span className="ml-2 text-[var(--text-muted)]">
                      · {ua ?? ''}{ua && e.ip_address ? ' · ' : ''}{e.ip_address ?? ''}
                    </span>
                  )}
                </div>
                <time dateTime={e.occurred_at} className="flex-shrink-0 text-[12px] text-[var(--text-muted)]">
                  {formatWhen(e.occurred_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <GlassButton
            variant="ghost"
            onClick={() => void loadMore()}
            disabled={loading || loadingMore}
            data-testid="activity-log-load-more"
          >
            {loadingMore
              ? <Loader2 size={13} className="mr-1.5 motion-safe:animate-spin" />
              : null}
            Load more
          </GlassButton>
        </div>
      )}
    </GlassCard>
  );
}
