// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CsvUploader } from '@/components/network-intelligence/CsvUploader';

vi.mock('@/lib/api', () => ({
  API_BASE: '/api',
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CsvUploader', () => {
  it('shows a protected loading state while auth is still settling', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(
      <CsvUploader
        accessToken={null}
        authLoading
        onUploadComplete={vi.fn()}
      />,
    );

    expect(screen.getByText(/Preparing secure upload/i)).toBeInTheDocument();

    fireEvent.drop(screen.getByLabelText(/Upload LinkedIn connections CSV/i), {
      dataTransfer: { files: [new File(['a,b'], 'connections.csv', { type: 'text/csv' })] },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uploads a dropped csv file and reports the parsed summary', async () => {
    const onUploadComplete = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        totalRows: 10,
        validRows: 8,
        skippedRows: 1,
        duplicatesRemoved: 1,
        uniqueCompanies: 4,
        errors: [],
      }),
    } as unknown as Response);

    render(
      <CsvUploader
        accessToken="test-token"
        onUploadComplete={onUploadComplete}
      />,
    );

    const file = new File(
      ['First Name,Last Name,Company\nJane,Smith,Acme'],
      'connections.csv',
      { type: 'text/csv' },
    );
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue('First Name,Last Name,Company\nJane,Smith,Acme'),
    });

    fireEvent.drop(screen.getByLabelText(/Upload LinkedIn connections CSV/i), {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith({
        totalRows: 10,
        validRows: 8,
        skippedRows: 1,
        duplicatesRemoved: 1,
        uniqueCompanies: 4,
        errors: [],
      });
    });

    expect(screen.getByText(/Upload complete/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/ni/csv/parse', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-token',
      }),
    }));
  });

  it('shows a sign-in message when there is no active token', () => {
    render(
      <CsvUploader
        accessToken={null}
        onUploadComplete={vi.fn()}
      />,
    );

    expect(screen.getByText(/Sign in required/i)).toBeInTheDocument();
  });
});
