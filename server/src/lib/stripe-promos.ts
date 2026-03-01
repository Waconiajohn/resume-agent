import type Stripe from 'stripe';
import { stripe } from './stripe.js';
import logger from './logger.js';

/**
 * Create a Stripe Coupon + Promotion Code pair.
 *
 * @param params.code             Human-readable code (e.g., 'FRIEND50')
 * @param params.percentOff       Discount percentage (1-100)
 * @param params.duration         'once', 'repeating', or 'forever'
 * @param params.durationInMonths Required when duration is 'repeating'
 * @param params.maxRedemptions   Optional max uses for the promotion code
 * @param params.name             Display name for the coupon (defaults to code)
 */
export async function createPromoCode(params: {
  code: string;
  percentOff: number;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number;
  maxRedemptions?: number;
  name?: string;
}): Promise<{ coupon: Stripe.Coupon; promotionCode: Stripe.PromotionCode } | null> {
  if (!stripe) {
    logger.warn('Cannot create promo code — Stripe not configured');
    return null;
  }

  try {
    const couponParams: Stripe.CouponCreateParams = {
      percent_off: params.percentOff,
      duration: params.duration,
      name: params.name ?? params.code,
    };

    if (params.duration === 'repeating' && params.durationInMonths) {
      couponParams.duration_in_months = params.durationInMonths;
    }

    const coupon = await stripe.coupons.create(couponParams);

    const promoParams: Stripe.PromotionCodeCreateParams = {
      promotion: { type: 'coupon', coupon: coupon.id },
      code: params.code.toUpperCase(),
    };

    if (params.maxRedemptions) {
      promoParams.max_redemptions = params.maxRedemptions;
    }

    const promotionCode = await stripe.promotionCodes.create(promoParams);

    logger.info({ code: promotionCode.code, couponId: coupon.id }, 'Promo code created');
    return { coupon, promotionCode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, code: params.code }, `Failed to create promo code: ${message}`);
    throw err;
  }
}

/**
 * List active promotion codes with coupon data expanded.
 */
export async function listPromoCodes(limit = 25): Promise<Stripe.PromotionCode[]> {
  if (!stripe) return [];

  try {
    const result = await stripe.promotionCodes.list({
      active: true,
      limit,
      expand: ['data.promotion.coupon'],
    });
    return result.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, `Failed to list promo codes: ${message}`);
    return [];
  }
}
