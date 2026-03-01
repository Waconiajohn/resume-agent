// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EvidenceLibraryTab } from '../EvidenceLibraryTab';
import type { MasterResume, MasterResumeListItem, MasterResumeEvidenceItem } from '@/types/resume';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../EvidenceItemCard', () => ({
  EvidenceItemCard: ({
    item,
    onDelete,
  }: {
    item: MasterResumeEvidenceItem;
    onDelete?: () => void;
  }) => (
    <div data-testid="evidence-item-card" data-source={item.source}>
      <span>{item.text}</span>
      {onDelete && <button onClick={onDelete} data-testid="delete-btn">Delete</button>}
    </div>
  ),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEvidenceItem(overrides: Partial<MasterResumeEvidenceItem> = {}): MasterResumeEvidenceItem {
  return {
    text: 'Led team of 45 engineers across 6 product teams',
    source: 'crafted',
    source_session_id: 'session-id-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeResume(overrides: Partial<MasterResume> = {}): MasterResume {
  return {
    id: 'resume-id-1',
    user_id: 'test-user-id',
    summary: 'Experienced VP',
    experience: [],
    skills: {},
    education: [],
    certifications: [],
    raw_text: '',
    version: 1,
    evidence_items: [
      makeEvidenceItem({ text: 'Crafted item 1', source: 'crafted' }),
      makeEvidenceItem({ text: 'Upgraded item 1', source: 'upgraded' }),
      makeEvidenceItem({ text: 'Interview item 1', source: 'interview' }),
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeListItem(): MasterResumeListItem {
  return {
    id: 'resume-id-1',
    summary: 'Experienced VP',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  const resume = makeResume();
  return {
    resumes: [makeListItem()],
    onGetDefaultResume: vi.fn().mockResolvedValue(resume),
    onGetResumeById: vi.fn().mockResolvedValue(resume),
    onUpdateMasterResume: vi.fn().mockResolvedValue(resume),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EvidenceLibraryTab', () => {
  it('renders evidence item cards after loading', async () => {
    render(<EvidenceLibraryTab {...makeProps()} />);
    await waitFor(() => {
      const cards = screen.getAllByTestId('evidence-item-card');
      expect(cards.length).toBe(3);
    });
  });

  it('shows loading skeleton while fetching resume', () => {
    // Make the promise never resolve so we stay in loading state
    const neverResolve = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <EvidenceLibraryTab {...makeProps({ onGetDefaultResume: neverResolve })} />,
    );
    const pulseElements = container.querySelectorAll('[class*="animate-pulse"]');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows empty state when no master resume found', async () => {
    render(<EvidenceLibraryTab {...makeProps({ onGetDefaultResume: vi.fn().mockResolvedValue(null) })} />);
    await waitFor(() => {
      expect(screen.getByText(/no master resume found/i)).toBeInTheDocument();
    });
  });

  it('shows empty filter state when no items match filter', async () => {
    const resume = makeResume({ evidence_items: [] });
    render(<EvidenceLibraryTab {...makeProps({ onGetDefaultResume: vi.fn().mockResolvedValue(resume) })} />);
    await waitFor(() => {
      expect(screen.getByText(/no evidence items match/i)).toBeInTheDocument();
    });
  });

  it('filters items by source type when filter is clicked', async () => {
    render(<EvidenceLibraryTab {...makeProps()} />);
    await waitFor(() => screen.getAllByTestId('evidence-item-card'));

    fireEvent.click(screen.getByRole('button', { name: /crafted/i }));

    await waitFor(() => {
      const cards = screen.getAllByTestId('evidence-item-card');
      expect(cards.length).toBe(1);
      expect(cards[0].dataset.source).toBe('crafted');
    });
  });

  it('filters items by text search', async () => {
    render(<EvidenceLibraryTab {...makeProps()} />);
    await waitFor(() => screen.getAllByTestId('evidence-item-card'));

    const searchInput = screen.getByPlaceholderText(/search evidence/i);
    fireEvent.change(searchInput, { target: { value: 'Upgraded' } });

    await waitFor(() => {
      const cards = screen.getAllByTestId('evidence-item-card');
      expect(cards.length).toBe(1);
      expect(screen.getByText('Upgraded item 1')).toBeInTheDocument();
    });
  });

  it('shows item count in header', async () => {
    render(<EvidenceLibraryTab {...makeProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/3 items/i)).toBeInTheDocument();
    });
  });

  it('shows source filter buttons', async () => {
    render(<EvidenceLibraryTab {...makeProps()} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /crafted/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upgraded/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /interview/i })).toBeInTheDocument();
    });
  });

  it('calls onUpdateMasterResume when evidence item is deleted', async () => {
    // Mock window.confirm to return true
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const updatedResume = makeResume({
      evidence_items: [
        makeEvidenceItem({ text: 'Upgraded item 1', source: 'upgraded' }),
        makeEvidenceItem({ text: 'Interview item 1', source: 'interview' }),
      ],
    });
    const onUpdateMasterResume = vi.fn().mockResolvedValue(updatedResume);

    render(<EvidenceLibraryTab {...makeProps({ onUpdateMasterResume })} />);
    await waitFor(() => screen.getAllByTestId('evidence-item-card'));

    const deleteButtons = screen.getAllByTestId('delete-btn');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(onUpdateMasterResume).toHaveBeenCalledOnce();
    });
  });
});
