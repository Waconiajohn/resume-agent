import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

export interface AffiliateRecord {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  referral_code: string;
  commission_rate: number;
  status: string;
  created_at: string;
}

export interface ReferralEventRecord {
  id: string;
  affiliate_id: string;
  event_type: string;
  referred_user_id: string | null;
  subscription_id: string | null;
  revenue_amount: number | null;
  commission_amount: number | null;
  created_at: string;
}

export interface AffiliateStats {
  total_clicks: number;
  total_signups: number;
  total_subscriptions: number;
  total_earnings: number;
  recent_events: ReferralEventRecord[];
}

// ---------------------------------------------------------------------------
// resolveReferralCode — Look up an active affiliate by referral_code
// Returns the affiliate record or null if not found / inactive
// ---------------------------------------------------------------------------
export async function resolveReferralCode(code: string): Promise<AffiliateRecord | null> {
  if (!code || typeof code !== 'string') return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .select('id, user_id, name, email, referral_code, commission_rate, status, created_at')
      .eq('referral_code', code.trim().toUpperCase())
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, `Failed to resolve referral code: ${message}`);
      return null;
    }

    return data as AffiliateRecord | null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, `Unexpected error resolving referral code: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// trackReferralEvent — Record a referral event and compute commission
// ---------------------------------------------------------------------------
export async function trackReferralEvent(params: {
  affiliateId: string;
  eventType: 'click' | 'signup' | 'subscription' | 'renewal';
  referredUserId?: string;
  subscriptionId?: string;
  revenueAmount?: number;
}): Promise<ReferralEventRecord | null> {
  const { affiliateId, eventType, referredUserId, subscriptionId, revenueAmount } = params;

  try {
    // Fetch the affiliate's commission rate to calculate commission
    const { data: affiliate, error: affiliateError } = await supabaseAdmin
      .from('affiliates')
      .select('commission_rate')
      .eq('id', affiliateId)
      .maybeSingle();

    if (affiliateError) {
      const message = affiliateError instanceof Error ? affiliateError.message : String(affiliateError);
      logger.error({ err: affiliateError, affiliateId }, `Failed to fetch affiliate for commission: ${message}`);
      return null;
    }

    const commissionRate = (affiliate as { commission_rate: number } | null)?.commission_rate ?? 0.20;
    const commissionAmount = revenueAmount != null ? revenueAmount * commissionRate : null;

    const { data, error } = await supabaseAdmin
      .from('referral_events')
      .insert({
        affiliate_id: affiliateId,
        event_type: eventType,
        referred_user_id: referredUserId ?? null,
        subscription_id: subscriptionId ?? null,
        revenue_amount: revenueAmount ?? null,
        commission_amount: commissionAmount,
      })
      .select('id, affiliate_id, event_type, referred_user_id, subscription_id, revenue_amount, commission_amount, created_at')
      .single();

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, affiliateId, eventType }, `Failed to track referral event: ${message}`);
      return null;
    }

    logger.info({ affiliateId, eventType, revenueAmount, commissionAmount }, 'Referral event tracked');
    return data as ReferralEventRecord;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, affiliateId, eventType }, `Unexpected error tracking referral event: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getAffiliateByUserId — Look up affiliate by the linked auth user id
// ---------------------------------------------------------------------------
export async function getAffiliateByUserId(userId: string): Promise<AffiliateRecord | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .select('id, user_id, name, email, referral_code, commission_rate, status, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, userId }, `Failed to fetch affiliate by user id: ${message}`);
      return null;
    }

    return data as AffiliateRecord | null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId }, `Unexpected error fetching affiliate by user id: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getAffiliateStats — Return aggregated stats for an affiliate
// ---------------------------------------------------------------------------
export async function getAffiliateStats(affiliateId: string): Promise<AffiliateStats> {
  try {
    const { data: events, error } = await supabaseAdmin
      .from('referral_events')
      .select('id, affiliate_id, event_type, referred_user_id, subscription_id, revenue_amount, commission_amount, created_at')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, affiliateId }, `Failed to fetch affiliate stats: ${message}`);
      return { total_clicks: 0, total_signups: 0, total_subscriptions: 0, total_earnings: 0, recent_events: [] };
    }

    const typedEvents = (events ?? []) as ReferralEventRecord[];

    const total_clicks = typedEvents.filter((e) => e.event_type === 'click').length;
    const total_signups = typedEvents.filter((e) => e.event_type === 'signup').length;
    const total_subscriptions = typedEvents.filter((e) => e.event_type === 'subscription' || e.event_type === 'renewal').length;
    const total_earnings = typedEvents.reduce((sum, e) => sum + (e.commission_amount ?? 0), 0);
    const recent_events = typedEvents.slice(0, 20);

    return { total_clicks, total_signups, total_subscriptions, total_earnings, recent_events };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, affiliateId }, `Unexpected error fetching affiliate stats: ${message}`);
    return { total_clicks: 0, total_signups: 0, total_subscriptions: 0, total_earnings: 0, recent_events: [] };
  }
}
