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
  contact_info: { min: 10, max: 11 },
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

// ─── Condensed Formatting Guide for LLM Injection ────────────────────
// Only the sections the Producer LLM needs for quality decisions.
// Typography specs, DOCX code, ATS rules (in resume-guide.ts), and age
// rules (in resume-guide.ts) are excluded — they're either in code
// constants above or enforced by tools.

let _producerGuide: string | null = null;

/** Condensed formatting guide for Producer system prompt (~2,800 tokens vs 6,600) */
export function getProducerFormattingGuide(): string {
  if (_producerGuide !== null) return _producerGuide;

  _producerGuide = `## Page Length & Structure

| Experience | Ideal Length |
|-----------|-------------|
| 10-15 years | 2 pages |
| 15-25+ years / C-Suite | 2-3 pages |
| Never <1.5 pages | Appears sparse |
| Never >4 pages | Poor prioritization |

Page 1 Strategy — treat as standalone "branded calling card":
- MUST include: Name & Contact, Professional Summary, Core Competencies, and either Selected Accomplishments or start of Experience
- Assume recruiter may not read beyond page 1

Page breaks: NEVER break within a job entry. NEVER strand a single bullet on a new page. Break between job entries or between major sections. If final page has <1/3 content, edit down.

## Section Inventory

Required: (1) Header/Contact, (2) Professional Summary, (3) Professional Experience, (4) Education
Highly Recommended: (5) Core Competencies/Skills, (6) Certifications (if applicable)
Optional: Selected Accomplishments, Technical Proficiencies, Awards, Publications, Patents, Professional Affiliations, Languages, Earlier Career
Emerging: AI Tools & Technologies, Working Knowledge Of

Never include: Objective Statement, "References Available Upon Request", personal info (age, photo, SSN), hobbies (unless business-relevant), high school (if college degree), salary history

Clarifications: Board positions belong in Experience. Speaking engagements combine with Publications if 3+ major items. Digital transformation = bullet points in Experience, not sections.

## Template Selection Matrix

| Condition | Template |
|-----------|----------|
| Finance, legal, healthcare, manufacturing, insurance | 1: Classic Achievement-Focused |
| Technology, startups, consulting, digital, fast-growth | 2: Modern Skills-First |
| C-Suite or seeking board positions | 3: Executive Strategic Hybrid |
| CTO, CIO, VP Engineering, VP Product, R&D | 4: Specialized/Technical |
| Turnaround, transformation, restructuring, change mgmt | 5: Transformation/Change Leader |
| Default when uncertain | 1: Classic Achievement-Focused |

### Template 1: Classic Achievement-Focused
Best for: Traditional industries, 45+ executives, conservative environments. Font: Times New Roman/Georgia.
Section order: Header → Summary → Competencies → Accomplishments → Experience → Education & Certs → Affiliations → Awards → Publications

### Template 2: Modern Skills-First
Best for: Technology, digital transformation, career changers. Font: Calibri/Arial.
Section order: Header → Summary → Competencies (3 categories) → AI Tools → Experience → Accomplishments → Education & Certs → Working Knowledge → Affiliations

### Template 3: Executive Strategic Hybrid
Best for: C-suite, board-seeking, governance. Font: Times New Roman/Garamond/Georgia.
Section order: Header → Executive Profile → Areas of Expertise → Leadership Achievements → Executive Experience → Education & Credentials → Affiliations → Publications → Awards → Earlier Career

### Template 4: Specialized/Technical Executive
Best for: CTO, CIO, VP Engineering, R&D. Font: Arial/Calibri/Helvetica.
Section order: Header → Summary → Competencies → Accomplishments → Experience → AI Tools → Technical Proficiencies → Patents → Education & Certs → Publications → Affiliations

### Template 5: Transformation/Change Leader
Best for: Turnaround, restructuring, M&A, change management. Font: Calibri/Arial.
Section order: Header → Summary → Competencies → Transformation Highlights (before/after metrics mandatory) → Experience → Education & Certs → Affiliations → Awards

## Section Formatting Specs

Header: Name (18-24pt Bold centered) + single contact line (10-11pt centered, semicolons between elements). City/State only — no street address. LinkedIn as full visible URL. Horizontal rule after.

Summary: 3-5 sentences (60-100 words), single flowing paragraph (no bullets). Heading: "PROFESSIONAL SUMMARY" or "EXECUTIVE SUMMARY".

Skills: Flowing text with bullet separators (middle dot, comma, or semicolon). 10-15 skills typical. Categorized variant for Templates 2/3/4. Never use tables or multi-column layout.

Accomplishments: 4-6 bullets, 1-2 lines each. Standard round bullets. Heading: "SELECTED ACCOMPLISHMENTS" or "CAREER HIGHLIGHTS".

Experience: Job Title (11-12pt Bold) + Company/Location (10-11pt) + Dates. Optional 1-2 sentence scope paragraph (not bulleted). Achievement bullets (10-11pt). Bullets per role: current 6-8, 2-5yr ago 4-6, 5-10yr 3-5, 10-15yr 1-3. 12-18pt between job entries.

Education: Degree + Field, Institution, Year (only if <20 years ago). Reverse chronological. Can combine with Certifications.

Certifications: Name (Acronym) — Issuing Org, Year. Current/active only. Most relevant first.

Earlier Career (15-20+ years): Brief entries with title, company, location, years. 1-2 bullet maximum or list format (no bullets).`;

  return _producerGuide;
}
