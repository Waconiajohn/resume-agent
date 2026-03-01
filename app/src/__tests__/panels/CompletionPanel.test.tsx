// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CompletionPanel } from '../../components/panels/CompletionPanel';
import type { CompletionData } from '../../types/panels';
import type { FinalResume } from '../../types/resume';

// ---------------------------------------------------------------------------
// Mocks — prevent real export libraries from running in tests
// ---------------------------------------------------------------------------

vi.mock('@/lib/export-docx', () => ({
  exportDocx: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/export-pdf', () => ({
  exportPdf: vi.fn().mockReturnValue({ success: true }),
}));

vi.mock('@/lib/export', () => ({
  resumeToText: vi.fn().mockReturnValue('resume text'),
  downloadAsText: vi.fn(),
}));

vi.mock('@/lib/export-filename', () => ({
  buildResumeFilename: vi.fn().mockReturnValue('resume.docx'),
}));

vi.mock('@/lib/export-positioning-summary', () => ({
  buildPositioningSummaryText: vi.fn().mockReturnValue('positioning summary'),
}));

vi.mock('@/lib/export-validation', () => ({
  validateResumeForExport: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/export-diagnostics', () => ({
  buildExportDiagnosticsReport: vi.fn().mockReturnValue('report'),
  recordExportDiagnostic: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<CompletionData>): CompletionData {
  return {
    ats_score: 88,
    requirements_addressed: 14,
    sections_rewritten: 5,
    ...overrides,
  };
}

function makeResume(overrides?: Partial<FinalResume>): FinalResume {
  return {
    summary: 'Experienced VP of Engineering with 15 years of experience.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP of Engineering',
        start_date: 'Jan 2018',
        end_date: 'Present',
        location: 'San Francisco, CA',
        bullets: [{ text: 'Led team of 45 engineers.', source: 'crafted' }],
      },
    ],
    skills: { 'Technical Leadership': ['Architecture', 'System Design'] },
    education: [],
    certifications: [],
    ats_score: 88,
    contact_info: {
      name: 'Jane Smith',
      email: 'jane@example.com',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompletionPanel', () => {
  afterEach(() => cleanup());

  // 1. Panel header renders
  it('renders the Session Complete header', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByText('Session Complete')).toBeInTheDocument();
  });

  // 2. Statistics render
  it('renders ATS score stat badge', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('ATS Score')).toBeInTheDocument();
  });

  it('renders requirements addressed stat badge', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Reqs Met')).toBeInTheDocument();
  });

  it('renders sections rewritten stat badge', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
  });

  // 3. Export buttons are present when resume is available
  it('renders Download Word button when resume is provided', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByRole('button', { name: /download word/i })).toBeInTheDocument();
  });

  it('renders Download PDF button when resume is provided', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
  });

  it('renders Download Text button when resume is provided', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByRole('button', { name: /download text/i })).toBeInTheDocument();
  });

  // 4. Shows unavailable message when resume is null
  it('shows resume unavailable message when resume is null', () => {
    render(<CompletionPanel data={makeData()} resume={null} />);
    expect(screen.getByText(/resume data not available/i)).toBeInTheDocument();
  });

  // 5. Save as base resume section renders when handler provided
  it('renders Save As Base Resume section when onSaveCurrentResumeAsBase is provided', () => {
    render(
      <CompletionPanel
        data={makeData()}
        resume={makeResume()}
        onSaveCurrentResumeAsBase={vi.fn()}
      />,
    );
    expect(screen.getByText('Save As Base Resume')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as new default base/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as alternate/i })).toBeInTheDocument();
  });

  // 6. Save as base resume section hidden when handler not provided
  it('does not render Save As Base Resume section when onSaveCurrentResumeAsBase is not provided', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.queryByText('Save As Base Resume')).not.toBeInTheDocument();
  });

  // 7. Positioning Summary section renders
  it('renders the Positioning Summary download section', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByText('Positioning Summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download positioning summary/i })).toBeInTheDocument();
  });

  // 8. Ready to export status when no issues
  it('shows "Ready to export" status when no validation issues exist', () => {
    render(<CompletionPanel data={makeData()} resume={makeResume()} />);
    expect(screen.getByText('Ready to export')).toBeInTheDocument();
  });
});
