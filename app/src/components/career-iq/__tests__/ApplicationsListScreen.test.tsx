// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationsListScreen } from '@/components/career-iq/ApplicationsListScreen';

const mockUseJobApplications = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useJobApplications', () => ({
  useJobApplications: () => mockUseJobApplications(),
}));

function renderPipeline() {
  return render(
    <MemoryRouter initialEntries={['/workspace/applications?view=pipeline']}>
      <ApplicationsListScreen />
    </MemoryRouter>,
  );
}

describe('ApplicationsListScreen', () => {
  beforeEach(() => {
    mockUseJobApplications.mockReturnValue({
      applications: [],
      groupedByStage: {},
      dueActions: [],
      loading: false,
      error: 'Could not load applications.',
      createApplication: vi.fn(),
      updateApplication: vi.fn(),
      moveToStage: vi.fn(),
      deleteApplication: vi.fn(),
      archiveApplication: vi.fn(),
      restoreApplication: vi.fn(),
      fetchApplications: vi.fn(),
      fetchDueActions: vi.fn(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('surfaces pipeline load failures instead of rendering the empty state', () => {
    renderPipeline();

    expect(screen.getByText('Could not load applications.')).toBeInTheDocument();
    expect(screen.queryByText('No applications yet')).not.toBeInTheDocument();
  });
});
