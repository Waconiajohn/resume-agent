import type { Provider } from '@supabase/supabase-js';

export type SocialAuthProvider = Extract<Provider, 'google' | 'azure' | 'linkedin_oidc'>;

interface SocialAuthProviderEntry {
  id: SocialAuthProvider;
  label: string;
  providerName: string;
}

const ALL_SOCIAL_AUTH_PROVIDERS: SocialAuthProviderEntry[] = [
  { id: 'google', label: 'Continue with Google', providerName: 'Google' },
  { id: 'azure', label: 'Continue with Microsoft', providerName: 'Microsoft' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn', providerName: 'LinkedIn' },
];

// VITE_SOCIAL_PROVIDERS lets us hide buttons whose Supabase provider isn't
// configured yet (e.g. Azure during the launch window). Comma-separated list
// of provider ids. Unset = show all (defensive default; the AuthGate already
// surfaces a graceful "provider not enabled" toast if a button is clicked
// before Supabase is configured).
const ENABLED_PROVIDERS_ENV = import.meta.env.VITE_SOCIAL_PROVIDERS as string | undefined;

const ENABLED_PROVIDERS = ENABLED_PROVIDERS_ENV
  ? new Set(
      ENABLED_PROVIDERS_ENV
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
  : null;

export const SOCIAL_AUTH_PROVIDERS: SocialAuthProviderEntry[] = ENABLED_PROVIDERS
  ? ALL_SOCIAL_AUTH_PROVIDERS.filter((entry) => ENABLED_PROVIDERS.has(entry.id))
  : ALL_SOCIAL_AUTH_PROVIDERS;
