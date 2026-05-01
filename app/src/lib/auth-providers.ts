import type { Provider } from '@supabase/supabase-js';

export type SocialAuthProvider = Extract<Provider, 'google' | 'azure' | 'linkedin_oidc'>;

export const SOCIAL_AUTH_PROVIDERS: Array<{
  id: SocialAuthProvider;
  label: string;
  providerName: string;
}> = [
  { id: 'google', label: 'Continue with Google', providerName: 'Google' },
  { id: 'azure', label: 'Continue with Microsoft', providerName: 'Microsoft' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn', providerName: 'LinkedIn' },
];
