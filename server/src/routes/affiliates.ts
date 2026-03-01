import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { getAffiliateByUserId, getAffiliateStats } from '../lib/affiliates.js';
import logger from '../lib/logger.js';

const affiliates = new Hono();

// ---------------------------------------------------------------------------
// GET /api/affiliates/me — Affiliate profile + stats for the authenticated user
// Auth required. Returns 404 if the user is not an affiliate.
// ---------------------------------------------------------------------------
affiliates.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  try {
    const affiliate = await getAffiliateByUserId(user.id);
    if (!affiliate) {
      return c.json({ error: 'You are not registered as an affiliate' }, 404);
    }

    const stats = await getAffiliateStats(affiliate.id);
    return c.json({ affiliate, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId: user.id }, `Failed to fetch affiliate profile: ${message}`);
    return c.json({ error: 'Failed to fetch affiliate profile' }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/affiliates/me/events — Referral event history for the authenticated user
// Auth required. Returns 404 if the user is not an affiliate.
// ---------------------------------------------------------------------------
affiliates.get('/me/events', authMiddleware, async (c) => {
  const user = c.get('user');

  try {
    const affiliate = await getAffiliateByUserId(user.id);
    if (!affiliate) {
      return c.json({ error: 'You are not registered as an affiliate' }, 404);
    }

    const stats = await getAffiliateStats(affiliate.id);
    return c.json({ events: stats.recent_events });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId: user.id }, `Failed to fetch affiliate events: ${message}`);
    return c.json({ error: 'Failed to fetch affiliate events' }, 500);
  }
});

export { affiliates };
