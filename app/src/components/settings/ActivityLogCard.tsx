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
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import { AUTH_EVENT_LABELS, type AuthEventType } from '@/types/auth-events';

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

export function ActivityLogCard() {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/auth/events?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Failed to load activity (${res.status})`);
        setLoading(false);
        return;
      }
      const body = await res.json() as { events: AuthEvent[] };
      setEvents(body.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
          disabled={loading}
          aria-label="Refresh activity"
          className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)] disabled:opacity-50"
        >
          {loading
            ? <Loader2 size={14} className="motion-safe:animate-spin" />
            : <RefreshCw size={14} />}
        </button>
      </div>
      <p className="text-[12px] text-[var(--text-muted)]">
        The last 50 sign-ins and account changes. If anything here looks unfamiliar, change your
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
        <ul className="mt-4 divide-y divide-[var(--line-soft)]">
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
    </GlassCard>
  );
}
