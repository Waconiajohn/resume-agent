import type { FinalResume } from '@/types/resume';
import { buildResumeFilename } from '@/lib/export-filename';

export type ExportFormat = 'docx' | 'pdf' | 'txt';
export type ExportOutcome = 'attempt' | 'success' | 'failure';

interface ExportDiagnosticEvent {
  id: string;
  timestamp: string;
  outcome: ExportOutcome;
  format: ExportFormat;
  filename: string;
  has_name: boolean;
  has_email: boolean;
  has_phone: boolean;
  ats_score: number;
  error?: string;
}

const STORAGE_KEY = 'resume_agent_export_diagnostics_v1';
const MAX_EVENTS = 120;

function readEvents(): ExportDiagnosticEvent[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ExportDiagnosticEvent => {
      return (
        !!item &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'string' &&
        typeof (item as { timestamp?: unknown }).timestamp === 'string' &&
        typeof (item as { outcome?: unknown }).outcome === 'string' &&
        typeof (item as { format?: unknown }).format === 'string' &&
        typeof (item as { filename?: unknown }).filename === 'string'
      );
    });
  } catch {
    return [];
  }
}

function writeEvents(events: ExportDiagnosticEvent[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // best effort
  }
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordExportDiagnostic(
  resume: FinalResume,
  format: ExportFormat,
  outcome: ExportOutcome,
  error?: string,
): void {
  const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', format);
  const event: ExportDiagnosticEvent = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    outcome,
    format,
    filename,
    has_name: Boolean(resume.contact_info?.name?.trim()),
    has_email: Boolean(resume.contact_info?.email?.trim()),
    has_phone: Boolean(resume.contact_info?.phone?.trim()),
    ats_score: resume.ats_score ?? 0,
    error: error?.slice(0, 300),
  };

  const events = readEvents();
  events.push(event);
  writeEvents(events);
}

export function buildExportDiagnosticsReport(limit = 40): string {
  const rows = readEvents().slice(-limit);
  const lines: string[] = [];
  lines.push('Resume Agent Export Diagnostics');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Events: ${rows.length}`);
  lines.push('');
  for (const row of rows) {
    lines.push(
      `[${row.timestamp}] ${row.outcome.toUpperCase()} ${row.format.toUpperCase()} filename="${row.filename}" name=${row.has_name} email=${row.has_email} phone=${row.has_phone} ats=${row.ats_score}${row.error ? ` error="${row.error}"` : ''}`,
    );
  }
  if (rows.length === 0) {
    lines.push('No export diagnostic events found.');
  }
  return lines.join('\n');
}

