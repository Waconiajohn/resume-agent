/**
 * Products route — GET /api/products
 *
 * Returns the platform product catalog from the `products` table.
 * Public — no authentication required. The catalog is not sensitive.
 *
 * Response shape mirrors the static PRODUCT_CATALOG in app/src/types/platform.ts
 * so the frontend can swap between API data and static fallback transparently.
 *
 * Cache: 5-minute public cache for edge/CDN efficiency.
 */

import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

const products = new Hono();

const CACHE_TTL_SECONDS = 300; // 5 minutes

// ---------------------------------------------------------------------------
// GET /api/products
// ---------------------------------------------------------------------------
products.get('/', async (c) => {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, slug, name, description, icon, status, feature_flag, tier_required, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error({ err: error }, 'products: failed to fetch catalog');
    return c.json({ error: 'Failed to fetch product catalog' }, 500);
  }

  c.header('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);

  return c.json({
    products: data ?? [],
    total: (data ?? []).length,
  });
});

// ---------------------------------------------------------------------------
// GET /api/products/:slug
// ---------------------------------------------------------------------------
products.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, slug, name, description, icon, status, feature_flag, tier_required, sort_order')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, slug }, 'products: failed to fetch product');
    return c.json({ error: 'Failed to fetch product' }, 500);
  }

  if (!data) {
    return c.json({ error: 'Product not found' }, 404);
  }

  c.header('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  return c.json({ product: data });
});

export { products };
