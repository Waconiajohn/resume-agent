/**
 * Knowledge: Resume Formatting Guide
 *
 * Loads and exposes the 756-line resume-formatting-guide.md as structured
 * knowledge for the Producer agent. The full guide is the single source
 * of truth for document production.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the formatting guide once at module init
const FORMATTING_GUIDE_PATH = resolve(__dirname, '../../agent/resume-formatting-guide.md');

let _formattingGuide: string | null = null;

/** Get the full formatting guide text (lazy-loaded, cached) */
export function getFormattingGuide(): string {
  if (_formattingGuide === null) {
    _formattingGuide = readFileSync(FORMATTING_GUIDE_PATH, 'utf-8');
  }
  return _formattingGuide;
}

// ─── Structured Extracts ─────────────────────────────────────────────
// Pre-extracted constants so agents don't need to parse markdown.

/** ATS-safe font families */
export const ATS_SAFE_FONTS = [
  'Calibri',
  'Arial',
  'Cambria',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Times New Roman',
] as const;

/** Typography hierarchy (pt sizes) */
export const TYPOGRAPHY = {
  name: { min: 18, max: 24 },
  section_heading: { min: 12, max: 14 },
  body: { min: 10, max: 11 },
  contact_info: { min: 9, max: 10 },
} as const;

/** Margin specs (inches) */
export const MARGINS = {
  default: 1.0,
  minimum: 0.5,
  recommended_min: 0.75,
} as const;

/** Line spacing */
export const LINE_SPACING = {
  body: { min: 1.0, max: 1.15 },
  after_bullet_pt: { min: 3, max: 6 },
  between_sections_pt: { min: 12, max: 24 },
} as const;

/** The 5 executive resume templates */
export const EXECUTIVE_TEMPLATES = [
  {
    id: 'executive-classic',
    name: 'Executive Classic',
    best_for: 'Traditional industries, C-suite, board presentations',
    font: 'Cambria',
    accent: 'Navy (#1B365D)',
  },
  {
    id: 'modern-executive',
    name: 'Modern Executive',
    best_for: 'Technology, innovation-driven roles, startups',
    font: 'Calibri',
    accent: 'Steel Blue (#4682B4)',
  },
  {
    id: 'strategic-leader',
    name: 'Strategic Leader',
    best_for: 'Operations, finance, consulting, PE/VC',
    font: 'Arial',
    accent: 'Charcoal (#36454F)',
  },
  {
    id: 'industry-expert',
    name: 'Industry Expert',
    best_for: 'Healthcare, manufacturing, engineering, regulated industries',
    font: 'Georgia',
    accent: 'Forest (#2C5F2D)',
  },
  {
    id: 'transformation-agent',
    name: 'Transformation Agent',
    best_for: 'Turnaround specialists, change management, digital transformation',
    font: 'Calibri',
    accent: 'Burgundy (#800020)',
  },
] as const;

/** ATS major systems to validate against */
export const ATS_SYSTEMS = [
  'iCIMS',
  'Workday',
  'Greenhouse',
  'Lever',
  'Taleo',
] as const;
