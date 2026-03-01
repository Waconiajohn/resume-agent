import { useState } from 'react';
import { Check, Loader2, Zap, Shield, Star } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';

interface PricingPlan {
  id: string;
  name: string;
  monthly_price_cents: number;
  included_sessions: number;
  max_sessions_per_month: number | null;
  features: string[];
  highlighted: boolean;
  icon: React.ReactNode;
}

const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly_price_cents: 0,
    included_sessions: 3,
    max_sessions_per_month: 3,
    features: [
      '3 resume pipeline runs / month',
      'Full 3-agent workflow',
      'PDF & DOCX export',
      'ATS compliance check',
    ],
    highlighted: false,
    icon: <Shield className="h-5 w-5" />,
  },
  {
    id: 'starter',
    name: 'Starter',
    monthly_price_cents: 1999,
    included_sessions: 15,
    max_sessions_per_month: 50,
    features: [
      '15 pipeline runs / month',
      'Up to 50 total runs',
      'Full 3-agent workflow',
      'PDF & DOCX export',
      'ATS compliance check',
      'Priority queue',
    ],
    highlighted: true,
    icon: <Zap className="h-5 w-5" />,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly_price_cents: 4999,
    included_sessions: 50,
    max_sessions_per_month: 200,
    features: [
      '50 pipeline runs / month',
      'Up to 200 total runs',
      'Full 3-agent workflow',
      'PDF & DOCX export',
      'ATS compliance check',
      'Priority queue',
      'Early access to new features',
    ],
    highlighted: false,
    icon: <Star className="h-5 w-5" />,
  },
];

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}/mo`;
}

interface PricingPageProps {
  accessToken: string | null;
  currentPlanId?: string;
  onUpgradeSuccess?: () => void;
}

export function PricingPage({ accessToken, currentPlanId, onUpgradeSuccess }: PricingPageProps) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    if (planId === 'free') return;
    if (!accessToken) {
      setErrorMessage('You must be signed in to upgrade.');
      return;
    }

    setLoadingPlanId(planId);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      const data = await response.json() as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        setErrorMessage(data.error ?? 'Failed to start checkout. Please try again.');
        setLoadingPlanId(null);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
      onUpgradeSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setErrorMessage(message);
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 px-4 py-12">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">Choose your plan</h2>
        <p className="mt-3 text-base text-white/60">
          Every plan includes the full 3-agent workflow — strategy, writing, and quality review.
        </p>
      </div>

      {errorMessage && (
        <div className="w-full max-w-md rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === (currentPlanId ?? 'free');
          const isLoading = loadingPlanId === plan.id;

          return (
            <GlassCard
              key={plan.id}
              className={cn(
                'relative flex flex-col gap-6 p-6',
                plan.highlighted && 'border-[#9eb8ff]/40',
              )}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-[#9eb8ff]/40 bg-[linear-gradient(180deg,rgba(158,184,255,0.25),rgba(158,184,255,0.12))] px-3 py-0.5 text-xs font-semibold text-[#c5d8ff]">
                  Most popular
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70">
                  {plan.icon}
                </div>
                <div>
                  <div className="font-semibold text-white">{plan.name}</div>
                  <div className="text-xl font-bold text-white">{formatPrice(plan.monthly_price_cents)}</div>
                </div>
              </div>

              <ul className="flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {isCurrentPlan ? (
                  <div className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-white/50">
                    Current plan
                  </div>
                ) : plan.id === 'free' ? (
                  <div className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-white/40">
                    Free tier
                  </div>
                ) : (
                  <GlassButton
                    variant={plan.highlighted ? 'primary' : 'ghost'}
                    className="w-full"
                    loading={isLoading}
                    disabled={Boolean(loadingPlanId)}
                    onClick={() => void handleSelectPlan(plan.id)}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </GlassButton>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <p className="text-center text-xs text-white/30">
        Payments are processed securely by Stripe. Cancel anytime from your billing dashboard.
      </p>
    </div>
  );
}
