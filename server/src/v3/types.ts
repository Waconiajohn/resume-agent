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
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
  website?: string | null;
}

export interface DateRange {
  start: string | null; // null when start date is unknown
  end: string | null;   // null means "present"
  raw: string;          // as printed in the source
}

export interface Bullet {
  text: string;
  // is_new distinguishes bullets written by the LLM (rewritten or net-new)
  // from bullets sourced verbatim from the original resume. Classify emits
  // is_new: false for every source bullet; Write emits is_new: true for
  // every rewritten bullet.
  is_new: boolean;
  // source is a reference to the original bullet the rewritten bullet is
  // based on. Populated by Write when is_new=true and a source bullet was
  // the basis for the rewrite. Format is a free-form locator such as
  // "positions[0].bullets[3]" or a short slice of the source bullet's text;
  // the field is consumed by Verify to check claim attribution, not parsed.
  source?: string | null;
  // evidence_found indicates whether the bullet's factual claims (metrics,
  // scope, named systems, outcomes) trace to source material. Classify
  // sets true for verbatim bullets; Write sets true when the rewrite's
  // claims are present in the source bullet(s) it rewrote from.
  evidence_found: boolean;
  confidence: number;
}

export interface Position {
  title: string;
  company: string;
  parentCompany?: string | null;   // when this position sits under a parent-company umbrella
  location?: string | null;
  dates: DateRange;
  scope?: string | null;           // one-line scope statement (headcount, budget, geography)
  bullets: Bullet[];
  confidence: number;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  location?: string | null;
  graduationYear?: string | null;
  notes?: string | null;
  confidence: number;
}

export interface Certification {
  name: string;
  issuer?: string | null;
  year?: string | null;
  confidence: number;
}

export interface CareerGapNote {
  description: string;
  dates?: DateRange | null;
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
  customSections: CustomSection[];     // non-standard executive-resume sections (see Rule 15)
  pronoun: PronounGuess;               // null = active voice downstream
  flags: AmbiguityFlag[];              // low-confidence items surfaced for review
  overallConfidence: number;
}

export interface CustomSectionEntry {
  text: string;
  source?: string | null;
  confidence: number;
}

export interface CustomSection {
  // Non-standard resume sections that classify identifies in the source —
  // Board Service, Speaking Engagements, Patents, Publications, Awards,
  // Volunteer Leadership, etc. v3 supports these as first-class capability
  // (see docs/v3-rebuild/04-Decision-Log.md 2026-04-18 entry on custom
  // sections). Write stage has a generic writer that handles them.
  title: string;                       // e.g. "Board Service", "Speaking Engagements"
  entries: CustomSectionEntry[];
  confidence: number;
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
// Stage 3b — Benchmark (v3 rebuild post-4.13, Phase D)
// -----------------------------------------------------------------------------
// Ideal-candidate reference for a role. Runs between classify and strategize.
// Gives strategize (and ultimately the user) an anti-calibration against
// poorly-written JDs: if we optimize purely to the JD text, we optimize to
// the recruiter's phrasing. The benchmark asks "what does a strong candidate
// for this ROLE actually look like?" so strategize positions the candidate
// toward both the JD and the benchmark.
//
// GPT-5.4-mini produces this; no external research tool (v2 used Perplexity).
// The model uses its training knowledge to reason about typical scope,
// metrics, and deliverables for the role in its industry.

export type BenchmarkStrength = 'strong' | 'partial';
export type BenchmarkGapSeverity = 'disqualifying' | 'manageable' | 'noise';

export interface BenchmarkDirectMatch {
  jdRequirement: string;            // specific JD requirement this matches
  candidateEvidence: string;        // specific candidate evidence that matches it
  strength: BenchmarkStrength;
}

export interface BenchmarkGap {
  gap: string;                      // the specific gap between candidate and benchmark
  severity: BenchmarkGapSeverity;
  bridgingStrategy: string;         // how strategize/write should position around it
}

export interface BenchmarkObjection {
  objection: string;                // specific fear a hiring manager would have
  neutralizationStrategy: string;   // how the resume can preempt it
}

export interface BenchmarkProfile {
  roleProblemHypothesis: string;    // what business problem is this role really solving?
  idealProfileSummary: string;      // 2-3 sentences: what a strong candidate looks like
  directMatches: BenchmarkDirectMatch[];
  gapAssessment: BenchmarkGap[];
  positioningFrame: string;         // single narrative frame that makes this candidate closest match
  hiringManagerObjections: BenchmarkObjection[];
}

// -----------------------------------------------------------------------------
// Stage 4 — Write
// -----------------------------------------------------------------------------

export interface WrittenPosition {
  positionIndex: number;
  title: string;                       // may be rewritten to match emphasis
  company: string;
  dates: DateRange;
  scope?: string | null;
  bullets: Bullet[];                   // expanded bullet shape with is_new/source/evidence_found
}

export interface WrittenCustomSectionEntry {
  text: string;
  // source reference to the corresponding StructuredResume.customSections
  // entry if the entry is based on a sourced item; omit for net-new.
  source?: string | null;
  is_new: boolean;
  evidence_found: boolean;
  confidence: number;
}

export interface WrittenCustomSection {
  title: string;
  entries: WrittenCustomSectionEntry[];
}

export interface WrittenResume {
  summary: string;
  selectedAccomplishments: string[];
  coreCompetencies: string[];
  positions: WrittenPosition[];
  customSections: WrittenCustomSection[];
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

/**
 * User-facing translation of a VerifyIssue. Produced by the post-verify
 * translation helper (server/src/v3/verify/translate.ts). The frontend
 * renders these in the Review panel when present, and falls back to the
 * raw issue text when absent or the translator failed.
 *
 * Key invariants:
 *  - `label` is a human section name like "Summary", "Key accomplishments",
 *    "Role at Acme" — never a raw path like "positions[2].bullets[4]".
 *  - `message` is plain English with no developer vocabulary
 *    (no "crossRoleHighlights", "WrittenResume", "mechanical attribution").
 *  - `shouldShow: false` = filter out (e.g. internal-QA false positives
 *    the system already resolved); the panel drops these entirely.
 */
export interface TranslatedIssue {
  shouldShow: boolean;
  severity: IssueSeverity;
  label: string;
  message: string;
  suggestion?: string;
}

export interface VerifyResult {
  passed: boolean;
  issues: VerifyIssue[];
  /**
   * Optional plain-English translations of `issues`, 1:1 index aligned
   * when present. Produced by a post-verify LLM call; absent when the
   * translator was skipped or errored. Frontend should fall back to
   * `issues` when this is undefined.
   */
  translated?: TranslatedIssue[];
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

export type Capability = 'strong-reasoning' | 'fast-writer' | 'deep-writer';

export interface LoadedPrompt {
  stage: string;
  version: string;
  /**
   * Capability requested by the prompt's YAML frontmatter. v3 Phase 3.5
   * replaced the legacy `model` field with `capability`; the factory
   * resolves the capability to a concrete model per environment.
   */
  capability: Capability;
  /**
   * For new prompts this mirrors `capability` (for telemetry) rather than a
   * concrete model name. The factory returns the actual model to use at
   * call time. Legacy prompts that still use `model: <name>` frontmatter
   * put the model string here and the loader infers `capability` from it.
   */
  model: string;
  temperature: number;
  lastEdited: string;
  lastEditor: string;
  notes: string;
  systemMessage: string;
  userMessageTemplate: string;
}
