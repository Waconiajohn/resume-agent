import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable. Check your .env file.');
}
if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY environment variable. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (import.meta.env.VITE_E2E_MOCK_AUTH === 'true') {
  let mockUser: User = {
    id: 'mock-e2e-user-id',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      full_name: 'E2E User',
      first_name: 'E2E',
      last_name: 'User',
    },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    email: 'e2e@example.com',
  } as User;

  let mockSession: Session = {
    access_token: 'mock-e2e-access-token',
    refresh_token: 'mock-e2e-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: mockUser,
  } as Session;

  const buildAuthResponse = <T>(payload: T) => ({ data: payload, error: null });

  Object.assign(supabase.auth, {
    getSession: async () => buildAuthResponse({ session: mockSession }),
    getUser: async () => buildAuthResponse({ user: mockUser }),
    onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
      queueMicrotask(() => callback('SIGNED_IN', mockSession));
      return {
        data: {
          subscription: {
            unsubscribe() {
              // no-op in e2e auth mode
            },
          },
        },
      };
    },
    signInWithPassword: async () => buildAuthResponse({ user: mockUser, session: mockSession }),
    signUp: async () => buildAuthResponse({ user: mockUser, session: mockSession }),
    signInWithOAuth: async () => buildAuthResponse({ provider: 'google', url: null }),
    signOut: async () => buildAuthResponse(undefined),
    updateUser: async ({ data }: { data?: Record<string, unknown> }) => {
      mockUser = {
        ...mockUser,
        user_metadata: {
          ...mockUser.user_metadata,
          ...(data ?? {}),
        },
      } as User;
      mockSession = {
        ...mockSession,
        user: mockUser,
      };
      return buildAuthResponse({ user: mockUser });
    },
  });
}
