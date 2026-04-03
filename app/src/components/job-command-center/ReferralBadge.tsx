import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReferralBadgeProps {
  bonusAmount: string;
  confidence?: string | null;
}

/**
 * Displays a referral bonus badge on job cards.
 * Shows the bonus amount with a DollarSign icon in emerald/green styling,
 * consistent with the NetworkBadge pattern in RadarSection.
 */
export function ReferralBadge({ bonusAmount, confidence }: ReferralBadgeProps) {
  if (!bonusAmount) return null;

  const isLowConfidence = confidence === 'low';

  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1 rounded-md border px-2.5 py-1',
        'text-[12px] font-semibold uppercase tracking-[0.12em]',
        isLowConfidence
          ? 'border-[var(--badge-green-text)]/15 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]/50'
          : 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]/70',
      )}
      title={`Referral bonus: ${bonusAmount}${isLowConfidence ? ' (estimated)' : ''}`}
    >
      <DollarSign size={9} />
      {bonusAmount}
    </span>
  );
}

/**
 * Derives the display bonus amount from a ReferralBonusInfo object.
 * Prefers the generic bonus_amount, then falls back through seniority tiers.
 */
export function getBestBonusDisplay(bonus: {
  bonus_amount: string | null;
  bonus_entry: string | null;
  bonus_mid: string | null;
  bonus_senior: string | null;
  bonus_executive: string | null;
}): string | null {
  return (
    bonus.bonus_amount ??
    bonus.bonus_senior ??
    bonus.bonus_executive ??
    bonus.bonus_mid ??
    bonus.bonus_entry ??
    null
  );
}
