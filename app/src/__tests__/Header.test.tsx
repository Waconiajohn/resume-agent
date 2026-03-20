// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Header } from '@/components/Header';

describe('Header', () => {
  afterEach(() => {
    cleanup();
  });

  it('saves the edited display name through onUpdateProfile', async () => {
    const onUpdateProfile = vi.fn(async () => ({ error: null }));

    render(
      <Header
        email="e2e@example.com"
        displayName="E2E User"
        onSignOut={() => {}}
        onUpdateProfile={onUpdateProfile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /E2E User/i }));

    const firstInput = screen.getByPlaceholderText('First');
    const lastInput = screen.getByPlaceholderText('Last');

    fireEvent.change(firstInput, { target: { value: 'Jordan' } });
    fireEvent.change(lastInput, { target: { value: 'Taylor' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(onUpdateProfile).toHaveBeenCalledWith({
        firstName: 'Jordan',
        lastName: 'Taylor',
      });
    });
  });

  it('sign out button calls onSignOut', () => {
    const onSignOut = vi.fn();

    render(
      <Header
        email="e2e@example.com"
        displayName="E2E User"
        onSignOut={onSignOut}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sign out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
