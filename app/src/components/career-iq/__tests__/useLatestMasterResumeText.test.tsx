// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const {
  mockGetUser,
  mockOnAuthStateChange,
  mockSingle,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      }),
    }),
  },
}));

import { useLatestMasterResumeText } from '../useLatestMasterResumeText';

describe('useLatestMasterResumeText', () => {
  let authListener: ((event: string, session: { user?: { id: string } | null } | null) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    authListener = null;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    mockSingle.mockResolvedValue({ data: { raw_text: 'User A master resume' } });
    mockOnAuthStateChange.mockImplementation((callback) => {
      authListener = callback;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('clears the cached resume text when auth changes to signed out', async () => {
    const { result } = renderHook(() => useLatestMasterResumeText());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resumeText).toBe('User A master resume');

    act(() => {
      authListener?.('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.resumeText).toBe(''));
    expect(result.current.loading).toBe(false);
  });
});
