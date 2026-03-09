/**
 * Billing Service — Business logic extracted from routes/billing.ts
 *
 * Contains the four Stripe webhook event handlers extracted from the route file.
 * The route file validates the signature and dispatches to these functions.
 */

import type Stripe from 'stripe';
import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';
import { trackReferralEvent } from './affiliates.js';

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id;
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!userId || !planId || !stripeCustomerId || !stripeSubscriptionId) {
    logger.warn({ sessionId: session.id, metadata: session.metadata }, 'checkout.session.completed missing required metadata');
    return;
  }

  // Extract promotion code / discount info from the first applied discount (if any)
  const firstDiscount = session.discounts?.[0] ?? null;
  let promoCodeStr: string | null = null;
  let couponIdStr: string | null = null;
  if (firstDiscount) {
    couponIdStr = typeof firstDiscount.coupon === 'string'
      ? firstDiscount.coupon
      : (firstDiscount.coupon?.id ?? null);
    if (firstDiscount.promotion_code) {
      promoCodeStr = typeof firstDiscount.promotion_code === 'string'
        ? firstDiscount.promotion_code
        : ((firstDiscount.promotion_code as Stripe.PromotionCode).code ?? null);
    }
  }

  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        promotion_code: promoCodeStr,
        coupon_id: couponIdStr,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    logger.error({ err: error, userId, planId }, 'Failed to upsert subscription after checkout');
    throw new Error(`DB upsert failed: ${error.message}`);
  }

  logger.info({ userId, planId, stripeSubscriptionId }, 'Subscription activated after checkout');

  // Track referral event if checkout was attributed to an affiliate
  const affiliateId = session.metadata?.affiliate_id;
  if (affiliateId) {
    const amountTotal = session.amount_total;
    const revenueAmount = amountTotal != null ? amountTotal / 100 : undefined;
    await trackReferralEvent({
      affiliateId,
      eventType: 'subscription',
      referredUserId: userId,
      subscriptionId: stripeSubscriptionId,
      revenueAmount,
    });
  }
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const { data: existingSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (!existingSub?.user_id) {
    logger.warn({ stripeCustomerId, subscriptionId: subscription.id }, 'customer.subscription.updated: no matching user found');
    return;
  }

  const stripePriceId = subscription.items.data[0]?.price?.id;

  // Look up plan by stripe_price_id
  let planId: string | null = null;
  if (stripePriceId) {
    const { data: plan } = await supabaseAdmin
      .from('pricing_plans')
      .select('id')
      .eq('stripe_price_id', stripePriceId)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  // Derive billing period from billing_cycle_anchor (a Unix timestamp in seconds).
  // current_period_start and current_period_end are not in Stripe v20 types
  // but may still be present in webhook payloads depending on the API version
  // used when the webhook was registered. We compute from billing_cycle_anchor
  // as the typed fallback.
  const anchorSecs = subscription.billing_cycle_anchor;
  const anchorDate = new Date(anchorSecs * 1000);
  const now = new Date();
  // Clamp anchor to the same day-of-month in the current month
  const periodStart = new Date(now.getFullYear(), now.getMonth(), anchorDate.getDate());
  if (periodStart > now) periodStart.setMonth(periodStart.getMonth() - 1);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, anchorDate.getDate());

  const updatePayload: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    status: subscription.status === 'active' ? 'active' : subscription.status,
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (planId) {
    updatePayload.plan_id = planId;
  }

  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .update(updatePayload)
    .eq('user_id', existingSub.user_id);

  if (error) {
    logger.error({ err: error, userId: existingSub.user_id }, 'Failed to update subscription');
    throw new Error(`DB update failed: ${error.message}`);
  }

  logger.info({ userId: existingSub.user_id, status: subscription.status }, 'Subscription updated');
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const { data: existingSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (!existingSub?.user_id) {
    logger.warn({ stripeCustomerId, subscriptionId: subscription.id }, 'customer.subscription.deleted: no matching user found');
    return;
  }

  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .update({
      plan_id: 'free',
      status: 'cancelled',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', existingSub.user_id);

  if (error) {
    logger.error({ err: error, userId: existingSub.user_id }, 'Failed to downgrade subscription after deletion');
    throw new Error(`DB update failed: ${error.message}`);
  }

  logger.info({ userId: existingSub.user_id }, 'Subscription cancelled — downgraded to free');
}

export async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!stripeCustomerId) {
    logger.warn({ invoiceId: invoice.id }, 'invoice.payment_failed: no customer id');
    return;
  }

  const { data: existingSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (!existingSub?.user_id) {
    logger.warn({ stripeCustomerId, invoiceId: invoice.id }, 'invoice.payment_failed: no matching user found');
    return;
  }

  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', existingSub.user_id);

  if (error) {
    logger.error({ err: error, userId: existingSub.user_id }, 'Failed to set subscription to past_due');
    throw new Error(`DB update failed: ${error.message}`);
  }

  logger.warn({ userId: existingSub.user_id }, 'Payment failed — subscription status set to past_due');
}
