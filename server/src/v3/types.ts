// v3 data shapes that flow between stages.
// Implements: docs/v3-rebuild/01-Architecture-Vision.md (the five stages) and
// docs/v3-rebuild/kickoffs/phase-1-kickoff.md §3 (types).
//
// No imports from server/src/agents/resume-v2/. See OPERATING-MANUAL.md
// "v3 never imports from v2."

// -----------------------------------------------------------------------------
// Stage 1 — Extract
// -----------------------------------------------------------------------------

export type ExtractFormat = 'docx' | 'pdf' | 'text';

export interface ExtractResult {
  plaintext: string;
  format: ExtractFormat;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// Stage 2 — Classify (StructuredResume)
// -----------------------------------------------------------------------------

export interface ContactInfo {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
}

export interface DateRange {
  start: string;        // ISO-like or free-form ("2018", "2018-03", "2018-Present")
  end: string | null;   // null means "present"
  raw: string;          // as printed in the source
}

export interface Bullet {
  text: string;
  confidence: number;
}

export interface Position {
  title: string;
  company: string;
  parentCompany?: string;   // when this position sits under a parent-company umbrella
  location?: string;
  dates: DateRange;
  scope?: string;           // one-line scope statement (headcount, budget, geography)
  bullets: Bullet[];
  confidence: number;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  location?: string;
  graduationYear?: string;
  notes?: string;
  confidence: number;
}

export interface Certification {
  name: string;
  issuer?: string;
  year?: string;
  confidence: number;
}

export interface CareerGapNote {
  description: string;
  dates?: DateRange;
  confidence: number;
}

export type PronounGuess = 'she/her' | 'he/him' | 'they/them' | null;

export interface StructuredResume {
  contact: ContactInfo;
  discipline: string;                  // natural-language primary discipline
  positions: Position[];
  education: EducationEntry[];
  certifications: Certification[];
  skills: string[];
  careerGaps: CareerGapNote[];
  crossRoleHighlights: CrossRoleHighlight[];  // span-multiple-roles accomplishments (see Rule 13)
  pronoun: PronounGuess;               // null = active voice downstream
  flags: AmbiguityFlag[];              // low-confidence items surfaced for review
  overallConfidence: number;
}

export interface CrossRoleHighlight {
  // Accomplishments or summary statements that span multiple positions or
  // cannot be attributed to a single role. Classify v1.2+ preserves these
  // instead of dropping them (see classify.v1.md Rule 13). Stage 3
  // (Strategize) reads from this array when selecting emphasized
  // accomplishments; it does not re-derive them from raw resume text.
  text: string;
  sourceContext: string;               // brief quote or paraphrase of where it appeared in source
  confidence: number;
}

export interface AmbiguityFlag {
  field: string;                       // dotted path, e.g. "positions[2].dates"
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

// -----------------------------------------------------------------------------
// Stage 3 — Strategize
// -----------------------------------------------------------------------------

export interface JobDescription {
  title?: string;
  company?: string;
  text: string;
}

export interface EmphasizedAccomplishment {
  positionIndex: number | null;        // null = cross-role accomplishment (summary-level)
  summary: string;
  rationale: string;
}

export interface Objection {
  objection: string;                   // e.g. "no direct biotech experience"
  rebuttal: string;                    // how the resume preempts it
}

export interface PositionEmphasis {
  positionIndex: number;
  weight: 'primary' | 'secondary' | 'brief';
  rationale: string;
}

export interface Strategy {
  positioningFrame: string;            // e.g. "consolidator", "builder", "turnaround leader"
  targetDisciplinePhrase: string;      // branded-title phrase for the summary
  emphasizedAccomplishments: EmphasizedAccomplishment[];
  objections: Objection[];
  positionEmphasis: PositionEmphasis[];
  notes?: string;
}

// -----------------------------------------------------------------------------
// Stage 4 — Write
// -----------------------------------------------------------------------------

export interface WrittenPosition {
  positionIndex: number;
  title: string;                       // may be rewritten to match emphasis
  company: string;
  dates: DateRange;
  scope?: string;
  bullets: string[];
}

export interface WrittenResume {
  summary: string;
  selectedAccomplishments: string[];
  coreCompetencies: string[];
  positions: WrittenPosition[];
}

// -----------------------------------------------------------------------------
// Stage 5 — Verify
// -----------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';

export interface VerifyIssue {
  severity: IssueSeverity;
  section: string;                     // e.g. "summary", "positions[2].bullets[4]"
  message: string;
}

export interface VerifyResult {
  passed: boolean;
  issues: VerifyIssue[];
}

// -----------------------------------------------------------------------------
// Pipeline
// -----------------------------------------------------------------------------

export interface PipelineInput {
  resume: {
    buffer?: Buffer;                   // for docx/pdf
    text?: string;                     // for pasted text / .txt / .md
    filename?: string;                 // disambiguates format when buffer is provided
  };
  jobDescription: JobDescription;
}

export interface PipelineResult {
  extract: ExtractResult;
  classify: StructuredResume;
  strategy: Strategy;
  written: WrittenResume;
  verify: VerifyResult;
  timings: {
    extractMs: number;
    classifyMs: number;
    strategizeMs: number;
    writeMs: number;
    verifyMs: number;
    totalMs: number;
  };
}

// -----------------------------------------------------------------------------
// Prompt loader
// -----------------------------------------------------------------------------

export interface LoadedPrompt {
  stage: string;
  version: string;
  model: string;
  temperature: number;
  lastEdited: string;
  lastEditor: string;
  notes: string;
  systemMessage: string;
  userMessageTemplate: string;
}
