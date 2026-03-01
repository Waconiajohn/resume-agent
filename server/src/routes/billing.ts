import { Hono } from 'hono';
import type Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../lib/stripe.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { resolveReferralCode, trackReferralEvent } from '../lib/affiliates.js';

const billing = new Hono();

// ---------------------------------------------------------------------------
// POST /api/billing/checkout — Create a Stripe Checkout session
// Auth required. Body: { plan_id: string }
// ---------------------------------------------------------------------------
billing.post('/checkout', authMiddleware, async (c) => {
  if (!stripe) {
    return c.json({ error: 'Billing is not configured' }, 503);
  }

  const user = c.get('user');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Request body must be an object' }, 400);
  }

  const planId = (body as Record<string, unknown>).plan_id;
  if (typeof planId !== 'string' || !planId.trim()) {
    return c.json({ error: 'plan_id is required' }, 400);
  }

  // Look up the plan in the database
  const { data: plan, error: planError } = await supabaseAdmin
    .from('pricing_plans')
    .select('id, name, monthly_price_cents, stripe_price_id')
    .eq('id', planId.trim())
    .single();

  if (planError || !plan) {
    return c.json({ error: 'Plan not found' }, 404);
  }

  if (plan.monthly_price_cents === 0) {
    return c.json({ error: 'Free plan does not require checkout' }, 400);
  }

  if (!plan.stripe_price_id) {
    return c.json({ error: 'This plan is not yet available for purchase' }, 400);
  }

  // Look up or create Stripe customer
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let stripeCustomerId: string | undefined = subscription?.stripe_customer_id ?? undefined;

  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, userId: user.id }, `Failed to create Stripe customer: ${message}`);
      return c.json({ error: 'Failed to initiate checkout' }, 500);
    }
  }

  // Optional referral code — silently ignored if invalid
  const rawReferralCode = (body as Record<string, unknown>).referral_code;
  const referralCodeInput = typeof rawReferralCode === 'string' ? rawReferralCode.trim() : null;
  let resolvedAffiliateId: string | null = null;
  if (referralCodeInput) {
    const affiliate = await resolveReferralCode(referralCodeInput);
    if (affiliate) {
      resolvedAffiliateId = affiliate.id;
    }
  }

  const origin = c.req.header('origin') ?? 'http://localhost:5173';

  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_id: planId.trim(),
        ...(resolvedAffiliateId ? { affiliate_id: resolvedAffiliateId } : {}),
      },
    });

    return c.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId: user.id, planId }, `Failed to create checkout session: ${message}`);
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/billing/validate-promo?code=XXXXX — Validate a promotion code
// Auth required.
// ---------------------------------------------------------------------------
billing.get('/validate-promo', authMiddleware, async (c) => {
  if (!stripe) {
    return c.json({ error: 'Billing is not configured' }, 503);
  }

  const code = c.req.query('code');
  if (!code?.trim()) {
    return c.json({ error: 'code query parameter is required' }, 400);
  }

  try {
    const promotionCodes = await stripe.promotionCodes.list({
      code: code.trim(),
      active: true,
      limit: 1,
      expand: ['data.promotion.coupon'],
    });

    if (promotionCodes.data.length === 0) {
      return c.json({ valid: false, message: 'Invalid or expired promo code' });
    }

    const promo = promotionCodes.data[0];
    // promotion.coupon may be a string ID or an expanded Coupon object
    const couponRaw = promo.promotion.coupon;
    const coupon = typeof couponRaw === 'object' && couponRaw !== null ? couponRaw as Stripe.Coupon : null;

    return c.json({
      valid: true,
      code: promo.code,
      discount: {
        percent_off: coupon?.percent_off ?? null,
        amount_off: coupon?.amount_off ?? null,
        duration: coupon?.duration ?? null,
        duration_in_months: coupon?.duration_in_months ?? null,
        name: coupon?.name ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, code: code.trim() }, `Failed to validate promo code: ${message}`);
    return c.json({ error: 'Failed to validate promo code' }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/webhook — Stripe webhook handler
// NO auth — Stripe signs requests with STRIPE_WEBHOOK_SECRET
// ---------------------------------------------------------------------------
billing.post('/webhook', async (c) => {
  if (!stripe) {
    return c.json({ error: 'Billing is not configured' }, 503);
  }

  const signature = c.req.header('stripe-signature');
  if (!signature) {
    logger.warn('Stripe webhook received without signature');
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
    return c.json({ error: 'Webhook secret not configured' }, 500);
  }

  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, `Failed to read webhook body: ${message}`);
    return c.json({ error: 'Failed to read request body' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, `Webhook signature verification failed: ${message}`);
    return c.json({ error: 'Webhook signature verification failed' }, 400);
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, eventType: event.type, eventId: event.id }, `Webhook handler error: ${message}`);
    // Return 200 to prevent Stripe from retrying a server-side error
    return c.json({ received: true, error: 'Handler error — logged' }, 200);
  }

  return c.json({ received: true });
});

// ---------------------------------------------------------------------------
// GET /api/billing/subscription — Get current user's subscription + usage
// Auth required.
// ---------------------------------------------------------------------------
billing.get('/subscription', authMiddleware, async (c) => {
  const user = c.get('user');

  const { data: subscription, error: subError } = await supabaseAdmin
    .from('user_subscriptions')
    .select('id, plan_id, status, current_period_start, current_period_end, stripe_subscription_id, stripe_customer_id, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subError) {
    logger.error({ err: subError, userId: user.id }, 'Failed to fetch subscription');
    return c.json({ error: 'Failed to fetch subscription' }, 500);
  }

  // Fetch plan details
  const planId = subscription?.plan_id ?? 'free';
  const { data: plan } = await supabaseAdmin
    .from('pricing_plans')
    .select('id, name, monthly_price_cents, included_sessions, max_sessions_per_month')
    .eq('id', planId)
    .maybeSingle();

  // Fetch current period usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: usage } = await supabaseAdmin
    .from('user_usage')
    .select('sessions_count, total_cost_usd')
    .eq('user_id', user.id)
    .gte('period_start', periodStart)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  return c.json({
    subscription: subscription ?? null,
    plan: plan ?? { id: 'free', name: 'Free', monthly_price_cents: 0, included_sessions: 3, max_sessions_per_month: 3 },
    usage: {
      sessions_this_period: usage?.sessions_count ?? 0,
      cost_usd_this_period: usage?.total_cost_usd ?? 0,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/billing/portal — Create Stripe Customer Portal session
// Auth required. For managing subscription (upgrade, cancel, update payment).
// ---------------------------------------------------------------------------
billing.post('/portal', authMiddleware, async (c) => {
  if (!stripe) {
    return c.json({ error: 'Billing is not configured' }, 503);
  }

  const user = c.get('user');

  const { data: subscription, error: subError } = await supabaseAdmin
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subError) {
    logger.error({ err: subError, userId: user.id }, 'Failed to fetch subscription for portal');
    return c.json({ error: 'Failed to fetch subscription' }, 500);
  }

  if (!subscription?.stripe_customer_id) {
    return c.json({ error: 'No active subscription found' }, 404);
  }

  const origin = c.req.header('origin') ?? 'http://localhost:5173';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/`,
    });

    return c.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId: user.id }, `Failed to create portal session: ${message}`);
    return c.json({ error: 'Failed to create portal session' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Internal: Stripe event handler
// ---------------------------------------------------------------------------
async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(subscription);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
    default:
      logger.debug({ eventType: event.type }, 'Unhandled Stripe event type');
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
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

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
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

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
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

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
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

export { billing };
