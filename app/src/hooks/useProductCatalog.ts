/**
 * useProductCatalog — Fetches the product catalog from the API with static fallback.
 *
 * Priority:
 *  1. API GET /api/products — DB-driven, always fresh
 *  2. PRODUCT_CATALOG static constant — immediate fallback if API fails
 *
 * The API shape is normalized to match ProductDefinition so callers are agnostic
 * to the data source. Only `slug`, `name`, `description`, `icon`, `status`,
 * and `tier_required` come from the API; display-only fields (longDescription,
 * route, features, ctaLabel) are merged from the static catalog.
 *
 * Cache: 5-minute in-memory cache so rapid component mounts don't hammer the API.
 */

import { useState, useEffect } from 'react';
import { PRODUCT_CATALOG } from '@/types/platform';
import type { ProductDefinition } from '@/types/platform';
import { API_BASE } from '@/lib/api';

// ─── API response types ───────────────────────────────────────────────────────

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'beta' | 'coming_soon';
  feature_flag: string | null;
  tier_required: 'free' | 'pro' | 'enterprise';
  sort_order: number;
}

interface ApiProductsResponse {
  products: ApiProduct[];
  total: number;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedProducts: ProductDefinition[] | null = null;
let cacheTimestamp = 0;

function isCacheValid(): boolean {
  return cachedProducts !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

/**
 * Merge an API product with the static catalog entry for the same slug.
 * The API wins for: name, description (as shortDescription), icon, status, tier_required.
 * The static catalog provides: longDescription, route, features, ctaLabel, category.
 */
function mergeWithStatic(api: ApiProduct): ProductDefinition {
  const staticEntry = PRODUCT_CATALOG.find(p => p.slug === api.slug);
  return {
    id: staticEntry?.id ?? api.slug,
    slug: api.slug,
    name: api.name,
    shortDescription: api.description,
    longDescription: staticEntry?.longDescription ?? api.description,
    icon: api.icon,
    status: api.status,
    route: staticEntry?.route ?? `/${api.slug}`,
    category: staticEntry?.category ?? 'career',
    features: staticEntry?.features ?? [],
    ctaLabel: staticEntry?.ctaLabel ?? 'Open',
    externalUrl: staticEntry?.externalUrl,
  };
}

/**
 * Build the merged catalog from the API response, preserving static sort order
 * for any products not returned by the API.
 */
function buildMergedCatalog(apiProducts: ApiProduct[]): ProductDefinition[] {
  const apiBySlug = new Map(apiProducts.map(p => [p.slug, p]));

  // Start with static catalog order, merging API data where available
  const merged = PRODUCT_CATALOG.map(staticEntry => {
    const api = apiBySlug.get(staticEntry.slug);
    if (api) {
      apiBySlug.delete(staticEntry.slug);
      return mergeWithStatic(api);
    }
    return staticEntry;
  });

  // Append any API products not present in the static catalog
  for (const api of apiBySlug.values()) {
    merged.push(mergeWithStatic(api));
  }

  return merged;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseProductCatalogResult {
  products: ProductDefinition[];
  loading: boolean;
  error: string | null;
  /** Whether products came from the static fallback (not the API) */
  isStaticFallback: boolean;
  /** Manually re-fetch from the API */
  refetch: () => void;
}

export function useProductCatalog(): UseProductCatalogResult {
  const [products, setProducts] = useState<ProductDefinition[]>(
    isCacheValid() ? (cachedProducts ?? PRODUCT_CATALOG) : PRODUCT_CATALOG,
  );
  const [loading, setLoading] = useState(!isCacheValid());
  const [error, setError] = useState<string | null>(null);
  const [isStaticFallback, setIsStaticFallback] = useState(true);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    if (isCacheValid() && fetchCount === 0) {
      setProducts(cachedProducts!);
      setIsStaticFallback(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/products`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as ApiProductsResponse;

        if (cancelled) return;

        const merged = buildMergedCatalog(data.products);
        cachedProducts = merged;
        cacheTimestamp = Date.now();

        setProducts(merged);
        setIsStaticFallback(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Keep static fallback on error
        setProducts(PRODUCT_CATALOG);
        setIsStaticFallback(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  // fetchCount is used to trigger re-fetches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCount]);

  const refetch = () => {
    cachedProducts = null;
    cacheTimestamp = 0;
    setFetchCount(c => c + 1);
  };

  return { products, loading, error, isStaticFallback, refetch };
}
