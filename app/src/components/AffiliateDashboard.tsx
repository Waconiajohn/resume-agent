import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, TrendingUp, Users, DollarSign, MousePointerClick, ArrowLeft } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';

interface ReferralEvent {
  id: string;
  affiliate_id: string;
  event_type: string;
  referred_user_id: string | null;
  subscription_id: string | null;
  revenue_amount: number | null;
  commission_amount: number | null;
  created_at: string;
}

interface AffiliateStats {
  total_clicks: number;
  total_signups: number;
  total_subscriptions: number;
  total_earnings: number;
  recent_events: ReferralEvent[];
}

interface AffiliateProfile {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  commission_rate: number;
  status: string;
  created_at: string;
}

interface AffiliateDashboardProps {
  accessToken: string | null;
  onNavigate?: (view: string) => void;
}

function StatCard({
  label,
  value,
  icon: Icon,
  valueClassName,
}: {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  valueClassName?: string;
}) {
  return (
    <GlassCard className="flex flex-col gap-2 p-5">
      <div className="flex items-center gap-2 text-white/50">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold text-white', valueClassName)}>{value}</div>
    </GlassCard>
  );
}

function formatEventType(type: string): string {
  const labels: Record<string, string> = {
    click: 'Link Click',
    signup: 'New Signup',
    subscription: 'Subscription',
    renewal: 'Renewal',
  };
  return labels[type] ?? type;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AffiliateDashboard({ accessToken, onNavigate }: AffiliateDashboardProps) {
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const referralLink = affiliate
    ? `${window.location.origin}/?ref=${affiliate.referral_code}`
    : null;

  const handleCopyLink = useCallback(() => {
    if (!referralLink) return;
    void navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [referralLink]);

  useEffect(() => {
    if (!accessToken) {
      setError('You must be signed in to view your affiliate dashboard.');
      setLoading(false);
      return;
    }

    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/affiliates/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 404) {
          setError('You are not registered as an affiliate. Contact us to join the affiliate program.');
          setLoading(false);
          return;
        }

        if (!response.ok) {
          const data = await response.json() as { error?: string };
          setError(data.error ?? 'Failed to load affiliate dashboard.');
          setLoading(false);
          return;
        }

        const data = await response.json() as { affiliate: AffiliateProfile; stats: AffiliateStats };
        setAffiliate(data.affiliate);
        setStats(data.stats);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboard();
  }, [accessToken]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
          <span className="text-sm text-white/50">Loading affiliate dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
        <GlassCard className="p-6">
          <p className="text-sm text-white/60">{error}</p>
          {onNavigate && (
            <GlassButton
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => onNavigate('landing')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </GlassButton>
          )}
        </GlassCard>
      </div>
    );
  }

  if (!affiliate || !stats) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Affiliate Dashboard</h1>
          <p className="mt-1 text-sm text-white/50">
            Welcome back, {affiliate.name}. Commission rate:{' '}
            <span className="text-emerald-400 font-semibold">
              {Math.round(affiliate.commission_rate * 100)}%
            </span>
          </p>
        </div>
        {onNavigate && (
          <GlassButton variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate('landing')}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </GlassButton>
        )}
      </div>

      {/* Referral link */}
      <GlassCard className="mb-6 p-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
          Your referral link
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="block truncate text-sm text-white/80 font-mono">{referralLink}</span>
          </div>
          <GlassButton
            variant={copied ? 'primary' : 'ghost'}
            className="flex-shrink-0 h-9 px-3"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </GlassButton>
        </div>
        <p className="mt-2 text-xs text-white/35">
          Share this link to earn {Math.round(affiliate.commission_rate * 100)}% commission on each
          subscription you refer.
        </p>
      </GlassCard>

      {/* Stats grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Clicks"
          value={stats.total_clicks.toLocaleString()}
          icon={MousePointerClick}
        />
        <StatCard
          label="Signups"
          value={stats.total_signups.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Conversions"
          value={stats.total_subscriptions.toLocaleString()}
          icon={TrendingUp}
        />
        <StatCard
          label="Total earnings"
          value={`$${stats.total_earnings.toFixed(2)}`}
          icon={DollarSign}
          valueClassName="text-emerald-400"
        />
      </div>

      {/* Recent events */}
      <GlassCard className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-white/80">Recent Activity</h2>
        {stats.recent_events.length === 0 ? (
          <p className="text-sm text-white/40">
            No activity yet. Share your referral link to get started.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {stats.recent_events.map((event) => (
              <div key={event.id} className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-white/80">{formatEventType(event.event_type)}</span>
                  <span className="text-xs text-white/35">{formatDate(event.created_at)}</span>
                </div>
                <div className="text-right">
                  {event.commission_amount != null && event.commission_amount > 0 ? (
                    <span className="text-sm font-semibold text-emerald-400">
                      +${event.commission_amount.toFixed(2)}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        event.event_type === 'click'
                          ? 'bg-white/5 text-white/40'
                          : 'bg-blue-500/10 text-blue-300',
                      )}
                    >
                      {formatEventType(event.event_type)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
