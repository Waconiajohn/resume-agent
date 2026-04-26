/**
 * Sprint A Wave 1 — production-build mock-auth guard.
 *
 * The mock-auth path in lib/supabase.ts replaces every supabase.auth.* method
 * with a hardcoded "you're signed in as the mock user" response. In dev that's
 * fine. In a production build, an attacker visiting the site with empty
 * localStorage gets to act as the mock user — the localStorage escape hatch
 * only opts OUT, it can't opt IN.
 *
 * The guard pattern:
 *   if (VITE_E2E_MOCK_AUTH === 'true' && import.meta.env.PROD) throw …
 *
 * This is the matching backend gate at server/src/middleware/auth.ts:16. If
 * either gate goes missing, the mock auth bypass returns. These tests pin
 * both the throw and the dev-build behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('supabase client — production mock-auth guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws when VITE_E2E_MOCK_AUTH=true in a production build', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_E2E_MOCK_AUTH', 'true');
    vi.stubEnv('PROD', true);
    vi.stubEnv('MODE', 'production');

    await expect(import('@/lib/supabase')).rejects.toThrow(
      /VITE_E2E_MOCK_AUTH=true is set in a production build/,
    );
  });

  it('does NOT throw in a dev build with mock-auth on', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_E2E_MOCK_AUTH', 'true');
    vi.stubEnv('PROD', false);
    vi.stubEnv('MODE', 'development');

    // Module load should succeed; mock auth activates without crashing dev.
    const mod = await import('@/lib/supabase');
    expect(mod.supabase).toBeDefined();
  });

  it('does NOT throw in a production build with mock-auth off', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_E2E_MOCK_AUTH', '');
    vi.stubEnv('PROD', true);
    vi.stubEnv('MODE', 'production');

    const mod = await import('@/lib/supabase');
    expect(mod.supabase).toBeDefined();
  });
});
