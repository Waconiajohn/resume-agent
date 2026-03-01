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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}/mo`;
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-300',
    trialing: 'border-blue-300/30 bg-blue-500/10 text-blue-300',
    past_due: 'border-amber-300/30 bg-amber-500/10 text-amber-300',
    cancelled: 'border-red-300/30 bg-red-500/10 text-red-300',
  };

  const label: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Past due',
    cancelled: 'Cancelled',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${classes[status] ?? 'border-white/10 bg-white/5 text-white/50'}`}
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

      const result = await response.json() as SubscriptionData;
      setData(result);
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
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
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
      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <CreditCard className="h-5 w-5 text-white/60" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{plan.name}</span>
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
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <BarChart2 className="h-4 w-4 text-white/50" />
          Usage this month
        </div>

        <div className="mt-4 flex items-end justify-between">
          <span className="text-2xl font-bold text-white">{usage.sessions_this_period}</span>
          <span className="text-sm text-white/40">
            of {plan.included_sessions} included runs
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${usagePercent >= 90 ? 'bg-red-400' : usagePercent >= 70 ? 'bg-amber-400' : 'bg-[#9eb8ff]'}`}
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
        <div className="rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
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
