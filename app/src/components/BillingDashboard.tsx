import { useState, useEffect, useCallback } from 'react';
import { CreditCard, BarChart2, ArrowUpRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';

interface SubscriptionData {
  subscription: {
    id: string;
    plan_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    updated_at: string;
  } | null;
  plan: {
    id: string;
    name: string;
    monthly_price_cents: number;
    included_sessions: number;
    max_sessions_per_month: number | null;
  };
  usage: {
    sessions_this_period: number;
    cost_usd_this_period: number;
  };
}

interface BillingDashboardProps {
  accessToken: string | null;
}

const DEFAULT_PLAN: SubscriptionData['plan'] = {
  id: 'free',
  name: 'Free',
  monthly_price_cents: 0,
  included_sessions: 3,
  max_sessions_per_month: 3,
};

const DEFAULT_USAGE: SubscriptionData['usage'] = {
  sessions_this_period: 0,
  cost_usd_this_period: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeSubscriptionData(value: unknown): SubscriptionData | null {
  if (!isRecord(value)) return null;

  const rawPlan = isRecord(value.plan) ? value.plan : {};
  const rawUsage = isRecord(value.usage) ? value.usage : {};
  const rawSubscription = isRecord(value.subscription) ? value.subscription : null;

  return {
    subscription: rawSubscription
      ? {
          id: readString(rawSubscription.id, ''),
          plan_id: readString(rawSubscription.plan_id, DEFAULT_PLAN.id),
          status: readString(rawSubscription.status, 'active'),
          current_period_start: readString(rawSubscription.current_period_start, ''),
          current_period_end: readString(rawSubscription.current_period_end, ''),
          stripe_subscription_id: readNullableString(rawSubscription.stripe_subscription_id),
          stripe_customer_id: readNullableString(rawSubscription.stripe_customer_id),
          updated_at: readString(rawSubscription.updated_at, ''),
        }
      : null,
    plan: {
      id: readString(rawPlan.id, DEFAULT_PLAN.id),
      name: readString(rawPlan.name, DEFAULT_PLAN.name),
      monthly_price_cents: readNumber(rawPlan.monthly_price_cents, DEFAULT_PLAN.monthly_price_cents),
      included_sessions: readNumber(rawPlan.included_sessions, DEFAULT_PLAN.included_sessions),
      max_sessions_per_month: rawPlan.max_sessions_per_month === null
        ? null
        : readNumber(rawPlan.max_sessions_per_month, DEFAULT_PLAN.max_sessions_per_month ?? 0),
    },
    usage: {
      sessions_this_period: readNumber(rawUsage.sessions_this_period, DEFAULT_USAGE.sessions_this_period),
      cost_usd_this_period: readNumber(rawUsage.cost_usd_this_period, DEFAULT_USAGE.cost_usd_this_period),
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}/mo`;
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: 'border-[#b5dec2]/30 bg-[#b5dec2]/10 text-[#b5dec2]',
    trialing: 'border-[#afc4ff]/30 bg-[#afc4ff]/10 text-[#afc4ff]',
    past_due: 'border-[#f0d99f]/30 bg-[#f0d99f]/10 text-[#f0d99f]',
    cancelled: 'border-[#f0b8b8]/30 bg-[#f0b8b8]/10 text-[#f0b8b8]/80',
  };

  const label: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Past due',
    cancelled: 'Cancelled',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${classes[status] ?? 'border-white/10 bg-white/5 text-white/50'}`}
    >
      {label[status] ?? status}
    </span>
  );
}

export function BillingDashboard({ accessToken }: BillingDashboardProps) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!accessToken) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/subscription', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const result = await response.json() as { error?: string };
        setError(result.error ?? 'Failed to load billing information');
        setLoading(false);
        return;
      }

      const result = await response.json() as unknown;
      const normalized = normalizeSubscriptionData(result);

      if (!normalized) {
        setError('Failed to load billing information');
        return;
      }

      setData(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  const handleOpenPortal = async () => {
    if (!accessToken) return;

    setPortalLoading(true);
    setActionError(null);

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json() as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        setActionError(result.error ?? 'Failed to open billing portal');
        setPortalLoading(false);
        return;
      }

      window.location.href = result.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setActionError(message);
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    if (!accessToken) return;

    setUpgradeLoading(true);
    setActionError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      const result = await response.json() as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        setActionError(result.error ?? 'Failed to start checkout');
        setUpgradeLoading(false);
        return;
      }

      window.location.href = result.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setActionError(message);
      setUpgradeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 motion-safe:animate-spin text-white/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-[#f0b8b8]" />
        <p className="text-sm text-white/60">{error}</p>
        <GlassButton variant="ghost" onClick={() => void fetchSubscription()}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </GlassButton>
      </div>
    );
  }

  if (!data) return null;

  const { subscription, plan, usage } = data;
  const isFreePlan = plan.id === 'free';
  const isPaidActive = subscription !== null && (subscription.status === 'active' || subscription.status === 'trialing');
  const usagePercent = plan.included_sessions > 0
    ? Math.min(100, Math.round((usage.sessions_this_period / plan.included_sessions) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-5 p-1">
      {/* Current plan */}
      <GlassCard className="space-y-4 p-5">
        <div className="room-meta-strip">
          <div className="room-meta-item">
            <span className="eyebrow-label">Billing</span>
            <span className="text-sm text-white/60">Plan status, billing controls, and account usage in one place.</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5">
              <CreditCard className="h-5 w-5 text-white/60" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tracking-tight text-white">{plan.name}</span>
                <StatusBadge status={subscription?.status ?? 'active'} />
              </div>
              <div className="text-sm text-white/50">{formatPrice(plan.monthly_price_cents)}</div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {isPaidActive && subscription?.stripe_customer_id && (
              <GlassButton
                variant="ghost"
                className="h-8 px-3 text-xs"
                loading={portalLoading}
                onClick={() => void handleOpenPortal()}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Manage
              </GlassButton>
            )}
            {isFreePlan && (
              <GlassButton
                variant="primary"
                className="h-8 px-3 text-xs"
                loading={upgradeLoading}
                onClick={() => void handleUpgrade('starter')}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Upgrade
              </GlassButton>
            )}
          </div>
        </div>

        {subscription?.current_period_end && !isFreePlan && (
          <div className="mt-4 border-t border-white/[0.06] pt-4 text-sm text-white/50">
            Next billing date: {formatDate(subscription.current_period_end)}
          </div>
        )}
      </GlassCard>

      {/* Usage this period */}
      <GlassCard className="space-y-4 p-5">
        <div className="room-meta-strip">
          <BarChart2 className="h-4 w-4 text-white/50" />
          <span className="eyebrow-label">Usage this month</span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <span className="text-2xl font-bold text-white">{usage.sessions_this_period}</span>
          <span className="text-sm text-white/40">
            of {plan.included_sessions} included runs
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden bg-white/10">
          <div
            className={`h-full transition-all duration-500 ${usagePercent >= 90 ? 'bg-[#f0b8b8]' : usagePercent >= 70 ? 'bg-[#f0d99f]' : 'bg-[#9eb8ff]'}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        {plan.max_sessions_per_month && (
          <div className="mt-2 text-xs text-white/30">
            Max {plan.max_sessions_per_month} runs / month on this plan
          </div>
        )}
      </GlassCard>

      {actionError && (
        <div className="support-callout border-[#f0b8b8]/30 bg-[#f0b8b8]/10 px-4 py-3 text-sm text-[#f0b8b8]/70">
          {actionError}
        </div>
      )}

      <GlassButton
        variant="ghost"
        className="self-start"
        onClick={() => void fetchSubscription()}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh
      </GlassButton>
    </div>
  );
}
