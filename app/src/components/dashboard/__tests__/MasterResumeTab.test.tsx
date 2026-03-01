// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MasterResumeTab } from '../MasterResumeTab';
import type { MasterResume, MasterResumeListItem } from '@/types/resume';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Stub out child components to isolate MasterResumeTab logic
vi.mock('../ExperienceCard', () => ({
  ExperienceCard: ({ role }: { role: { title: string } }) => (
    <div data-testid="experience-card">{role.title}</div>
  ),
}));

vi.mock('../SkillsCategoryCard', () => ({
  SkillsCategoryCard: ({ category }: { category: string }) => (
    <div data-testid="skills-card">{category}</div>
  ),
}));

vi.mock('../EditableField', () => ({
  EditableField: ({
    value,
    onSave,
    isEditing,
    placeholder,
  }: {
    value: string;
    onSave: (v: string) => void;
    isEditing: boolean;
    placeholder: string;
  }) => (
    <div>
      {isEditing ? (
        <input
          data-testid={`editable-${placeholder}`}
          defaultValue={value}
          onChange={(e) => onSave(e.target.value)}
        />
      ) : (
        <span data-testid={`display-${placeholder}`}>{value || placeholder}</span>
      )}
    </div>
  ),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeResume(overrides: Partial<MasterResume> = {}): MasterResume {
  return {
    id: 'resume-id-1',
    user_id: 'test-user-id',
    summary: 'Experienced VP of Engineering',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        location: 'SF, CA',
        bullets: [{ text: 'Led team of 45', source: 'crafted' }],
      },
    ],
    skills: { Leadership: ['Team building', 'Strategy'] },
    education: [{ degree: 'BS', field: 'CS', institution: 'MIT', year: '2005' }],
    certifications: [],
    contact_info: { name: 'Jane Doe', email: 'jane@example.com' },
    raw_text: 'Experienced VP',
    version: 3,
    is_default: true,
    evidence_items: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

function makeResumeListItem(overrides: Partial<MasterResumeListItem> = {}): MasterResumeListItem {
  return {
    id: 'resume-id-1',
    summary: 'Experienced VP',
    version: 3,
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  const resume = makeResume();
  return {
    resumes: [makeResumeListItem()],
    loading: false,
    onLoadResumes: vi.fn(),
    onGetDefaultResume: vi.fn().mockResolvedValue(resume),
    onGetResumeById: vi.fn().mockResolvedValue(resume),
    onUpdateMasterResume: vi.fn().mockResolvedValue(resume),
    onSetDefaultResume: vi.fn().mockResolvedValue(true),
    onDeleteResume: vi.fn().mockResolvedValue(true),
    onGetResumeHistory: vi.fn().mockResolvedValue([
      { id: 'h1', changes_summary: 'Updated summary', created_at: '2026-01-10T00:00:00Z' },
    ]),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MasterResumeTab', () => {
  it('shows loading skeleton when loading is true and no resume yet', () => {
    const { container } = render(
      <MasterResumeTab {...makeProps({ loading: true, onGetDefaultResume: vi.fn().mockResolvedValue(null) })} />,
    );
    const pulseElements = container.querySelectorAll('[class*="animate-pulse"]');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows empty state when no resume found', async () => {
    render(
      <MasterResumeTab
        {...makeProps({
          loading: false,
          onGetDefaultResume: vi.fn().mockResolvedValue(null),
          onGetResumeHistory: vi.fn().mockResolvedValue([]),
        })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/no master resume found/i)).toBeInTheDocument();
    });
  });

  it('renders resume sections when resume is loaded', async () => {
    render(<MasterResumeTab {...makeProps()} />);
    await waitFor(() => {
      // "Summary" heading appears as a section label
      const matches = screen.getAllByText(/summary/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('shows Edit button in view mode', async () => {
    render(<MasterResumeTab {...makeProps()} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });
  });

  it('enters edit mode when Edit button is clicked', async () => {
    render(<MasterResumeTab {...makeProps()} />);
    await waitFor(() => screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  it('calls onUpdateMasterResume when Save Changes is clicked', async () => {
    const onUpdateMasterResume = vi.fn().mockResolvedValue(makeResume());
    render(<MasterResumeTab {...makeProps({ onUpdateMasterResume })} />);
    await waitFor(() => screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByRole('button', { name: /save changes/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(onUpdateMasterResume).toHaveBeenCalledOnce();
    });
  });

  it('cancels edit mode and resets draft when Cancel is clicked', async () => {
    render(<MasterResumeTab {...makeProps()} />);
    await waitFor(() => screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });
  });

  it('shows experience cards for each role', async () => {
    render(<MasterResumeTab {...makeProps()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId('experience-card').length).toBeGreaterThan(0);
    });
  });

  it('shows skills category cards', async () => {
    render(<MasterResumeTab {...makeProps()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId('skills-card').length).toBeGreaterThan(0);
    });
  });

  it('calls onLoadResumes on mount', async () => {
    const onLoadResumes = vi.fn();
    render(<MasterResumeTab {...makeProps({ onLoadResumes })} />);
    await waitFor(() => {
      expect(onLoadResumes).toHaveBeenCalledOnce();
    });
  });
});
