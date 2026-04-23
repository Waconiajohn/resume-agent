// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '@/components/Header';

// Header depends on useLocation() for the Help button's active-state logic,
// so tests must render inside a Router.
const renderHeader = (ui: ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Header', () => {
  afterEach(() => {
    cleanup();
  });

  it('saves the edited display name through onUpdateProfile', async () => {
    const onUpdateProfile = vi.fn(async () => ({ error: null }));

    renderHeader(
      <Header
        email="e2e@example.com"
        displayName="E2E User"
        onSignOut={() => {}}
        onUpdateProfile={onUpdateProfile}
      />,
    );

    // Open the user dropdown by clicking the display name button
    fireEvent.click(screen.getByRole('button', { name: /E2E User/i }));

    // Click "Edit name" inside the dropdown to reveal the name inputs
    fireEvent.click(screen.getByText('Edit name'));

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

    renderHeader(
      <Header
        email="e2e@example.com"
        displayName="E2E User"
        onSignOut={onSignOut}
      />,
    );

    // Open the user dropdown first, then click "Sign out" inside it
    fireEvent.click(screen.getByRole('button', { name: /E2E User/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
