# V2 → V3 Output Shape Audit

**Date:** 2026-04-18
**Status:** ⚠ **HALTING cutover before Deliverable 2.** The gaps are not minor. Frontend work required to ship v3 cleanly. Full picture below with three options for John.

---

## TL;DR

v2 emits a rich `AssemblyOutput` wrapping a `ResumeDraftOutput` with per-bullet metadata, quality scores, hiring-manager scan, and ~15 SSE events streamed through the pipeline. v3 emits a lean `WrittenResume` structure focused on attribution discipline: summary string, accomplishments strings, competencies strings, positions with bullets. No scores, no hiring-manager scan, no per-bullet coaching metadata, and no streaming events.

An adapter can produce a v2-shaped `AssemblyOutput` from v3's inputs + outputs for structural compatibility. But it cannot synthesize the v2-only features the frontend currently renders as first-class UI:

- **Scoring Report** (ats_match / truth / tone numeric scores — v2-specific agents)
- **Hiring Manager Scan** (pass/fail + 4 sub-scores + red flags)
- **Per-bullet coaching metadata** (review_state="code_red", proof_level, framing_guardrail, next_best_action — all drive inline coaching UI)
- **SSE streaming** (15+ event types show incremental progress; v3 is single-shot)

This is the spec's defined halt condition: "HALT if multi-hour frontend work required."

---

## 1. v2 output shape (authoritative today)

Full types at `server/src/agents/resume-v2/types.ts:556-778`.

**`AssemblyOutput`** wraps everything the frontend renders:

```typescript
interface AssemblyOutput {
  final_resume: ResumeDraftOutput;
  scores: { ats_match: number; truth: number; tone: number };
  quick_wins: Array<{ description: string; impact: 'high' | 'medium' | 'low' }>;
  positioning_assessment?: PositioningAssessment;
  hiring_manager_scan?: HiringManagerScan;  // { pass, scan_score, header_impact, summary_clarity, ... }
}
```

**`ResumeDraftOutput`** (the final resume payload):

```typescript
interface ResumeDraftOutput {
  header: { name, phone, email, linkedin?, branded_title };
  executive_summary: {
    content: string;
    is_new: boolean;
    addresses_requirements?: string[];
    confidence?: 'strong' | 'partial' | 'needs_validation';
    review_state?: 'supported' | 'supported_rewrite' | 'strengthen' | 'confirm_fit' | 'code_red';
    proof_level?: 'direct' | 'adjacent' | 'inferable' | 'none';
    framing_guardrail?: 'exact' | 'reframe' | 'soft_inference' | 'blocked';
    next_best_action?: 'accept' | 'tighten' | 'quantify' | 'confirm' | 'answer' | 'remove';
    // + 4 more optional metadata fields
  };
  core_competencies: string[];
  selected_accomplishments: Array<{ content: string; /* + 15 metadata fields */ }>;
  professional_experience: Array<ResumeExperienceEntry>;  // positions with ResumeBullet[]
  earlier_career?: Array<{ company, title, dates }>;
  education: Array<{ degree, institution, year? }>;
  certifications: string[];
  custom_sections?: ResumeCustomSection[];
  technical_skills?: Array<{ category, skills }>;
  technologies?: string[];
  area_experience?: string;
}
```

**`ResumeBullet`** carries rich per-bullet metadata the frontend depends on:

```typescript
interface ResumeBullet {
  text: string;
  is_new: boolean;
  addresses_requirements: string[];
  primary_target_requirement?: string;
  source: 'original' | 'enhanced' | 'drafted';
  evidence_found: string;  // quote from source
  confidence: 'strong' | 'partial' | 'needs_validation';
  review_state?: 'supported' | 'supported_rewrite' | 'strengthen' | 'confirm_fit' | 'code_red';
  proof_level?: 'direct' | 'adjacent' | 'inferable' | 'none';
  framing_guardrail?: 'exact' | 'reframe' | 'soft_inference' | 'blocked';
  next_best_action?: 'accept' | 'tighten' | 'quantify' | 'confirm' | 'answer' | 'remove';
  work_item_id?: string;  // links bullet → gap-analysis requirement
  // + more
}
```

**SSE events** (from `orchestrator.ts:237-611`): `stage_start`, `stage_complete`, `job_intelligence`, `candidate_intelligence`, `benchmark_candidate`, `gap_analysis`, `requirement_work_items`, `gap_coaching`, `narrative_strategy`, `resume_draft`, `verification_complete`, `assembly_complete`, `hiring_manager_scan`, `pipeline_complete`. Consumed by `app/src/hooks/useV2Pipeline.ts` to show incremental progress.

## 2. v3 output shape

Full types at `server/src/v3/types.ts`.

**`WrittenResume`** (the final v3 output, stage 4):

```typescript
interface WrittenResume {
  summary: string;
  selectedAccomplishments: string[];
  coreCompetencies: string[];
  positions: WrittenPosition[];
  customSections: WrittenCustomSection[];
}

interface WrittenPosition {
  positionIndex: number;
  title: string;
  company: string;
  dates: DateRange;  // { start, end, raw }
  scope?: string | null;
  bullets: Bullet[];
}

interface Bullet {
  text: string;
  is_new: boolean;
  source?: string | null;     // e.g. "positions[0].bullets[3]"
  evidence_found: boolean;     // note: boolean, not string
  confidence: number;          // note: 0-1, not enum
}
```

**`StructuredResume`** (from v3 classify, stage 2) — also available for the adapter:

```typescript
interface StructuredResume {
  contact: { fullName, email?, phone?, location?, linkedin?, website? };
  discipline: string;
  positions: Position[];           // the original classified positions
  education: EducationEntry[];
  certifications: Certification[];
  skills: string[];
  customSections: CustomSection[];
  crossRoleHighlights: string[];
  careerGaps: CareerGapNote[];
  pronoun: 'she/her' | 'he/him' | 'they/them' | null;
}
```

**`VerifyResult`** (from v3 verify, stage 5):

```typescript
interface VerifyResult {
  passed: boolean;
  issues: Array<{ severity: 'error' | 'warning', section: string, message: string }>;
}
```

**No SSE events.** v3 is a single-shot async pipeline; current orchestration is backend-only. Frontend would see one 20-40 second wait with no progress updates.

## 3. Side-by-side gap

| Field | v2 (`AssemblyOutput`) | v3 source | Can an adapter produce it? |
|---|---|---|---|
| `header.name/phone/email/linkedin` | `ResumeDraftOutput.header.*` | `StructuredResume.contact.*` | ✓ Direct map |
| `header.branded_title` | `ResumeDraftOutput.header.branded_title` | **Not in v3** | ⚠ Synthesize from `Strategy.targetDisciplinePhrase` |
| `executive_summary.content` | `ResumeDraftOutput.executive_summary.content` | `WrittenResume.summary` | ✓ Direct map |
| `executive_summary` metadata (is_new, confidence enum, review_state, proof_level, framing_guardrail, next_best_action) | rich object | **Not in v3** | ⚠ Synthesize defaults; no coaching signal |
| `core_competencies` | `string[]` | `WrittenResume.coreCompetencies` | ✓ Identical |
| `selected_accomplishments[*].content` | rich object with `content` | `WrittenResume.selectedAccomplishments: string[]` | ⚠ Wrap in `{content, defaults…}` objects |
| `selected_accomplishments[*]` metadata (15 fields) | all there | **Not in v3** | ⚠ All synthetic defaults |
| `professional_experience[*].title/company/dates` | in `ResumeExperienceEntry` | `WrittenResume.positions[*].title/company/dates` | ✓ Direct map (dates: `raw` string) |
| `professional_experience[*].scope_statement` | separate field | `WrittenPosition.scope` (inline) | ✓ Direct rename |
| `professional_experience[*].bullets` | `ResumeBullet[]` with rich metadata | `Bullet[]` with slim metadata | ⚠ Text + is_new direct; rest synthesized |
| `ResumeBullet.confidence` enum | `'strong' \| 'partial' \| 'needs_validation'` | `number` 0-1 | ⚠ Map 0-1 → enum (0.7+→strong, 0.4-0.7→partial, <0.4→needs_validation) |
| `ResumeBullet.evidence_found` string | quote from source | `boolean` | ⚠ Adapter returns `""` if true, `""` if false — loses quote |
| `ResumeBullet.addresses_requirements` | `string[]` | **Not in v3** | ⚠ `[]` for every bullet — coaching UI goes blank |
| `ResumeBullet.review_state` | enum w/ `"code_red"` etc. | **Not in v3** | ⚠ undefined for every bullet — inline coaching overlays absent |
| `ResumeBullet.work_item_id` | links to gap-analysis | **Not in v3** | ⚠ undefined — requirement ↔ bullet linking gone |
| `ResumeBullet.proof_level`, `framing_guardrail`, `next_best_action` | enums | **Not in v3** | ⚠ undefined for all — bullet coaching panel blank |
| `education` | array | `StructuredResume.education` | ✓ Direct |
| `certifications` | `string[]` | `StructuredResume.certifications.map(c => c.name)` | ✓ Trivial |
| `custom_sections` | array | `WrittenResume.customSections` | ✓ Trivial transform |
| `technical_skills`, `technologies`, `area_experience` | various | **Not distinguished in v3** | ⚠ Synthetic: all from `StructuredResume.skills` |
| `scores: { ats_match, truth, tone }` | numerical quality scores | **v2-only agents** | ✗ No v3 equivalent — adapter returns `{0, 0, 0}` or maps `verify.passed` to a crude proxy |
| `quick_wins` | array of coaching items | **v2-only agent** | ✗ Returns `[]` |
| `positioning_assessment` | narrative assessment | **v2-only agent** | ✗ undefined |
| `hiring_manager_scan` | pass/fail + sub-scores + red flags | **v2-only agent** | ✗ undefined |
| **SSE stream** | 15+ event types, incremental | **v3 does not stream** | ✗ One 20-40s wait with no events; UI shows "Loading…" indefinitely |

## 4. Frontend consumption sites that break

Files identified in the audit:

- **`app/src/components/resume-v2/V2StreamingDisplay.tsx`** — top-level pipeline UI. Reads `data.assembly.scores` (ScoringReport), `data.assembly.quick_wins`, `data.assembly.hiring_manager_scan`. If any is missing/zero, these sections render as empty or with zeros.
- **`app/src/components/resume-v2/ScoringReport.tsx`** — renders ats/truth/tone delta vs pre-scores. With v3 scores=0, shows a before→after chart of `85 → 0` etc. Visually wrong.
- **`app/src/components/resume-v2/scoring-report/HiringManagerScanSection.tsx`** — expects `hiring_manager_scan.header_impact/.summary_clarity/…`. No guard observed; likely renders blank or crashes on `.scan_score` access if undefined.
- **`BulletCoachingPanel`** (referenced in `V2StreamingDisplay`) — consumes 10+ per-bullet metadata fields. With v3 all undefined, the inline coaching hover cards render empty / show nothing actionable.
- **`useV2Pipeline.ts`** (hook) — subscribes to SSE events. With no events from v3, the hook's `stage` state never transitions past `idle` → pipeline UI shows a perpetual loading spinner until the single final response lands.

## 5. DB persistence constraint

v2 persists `AssemblyOutput` to `coach_sessions.tailored_sections.pipeline_data.assembly`. Any sessions created before cutover store v2's shape. If v3 writes a different shape to the same column, reading old sessions would break.

Mitigations:
- Option A: adapter produces v2-shaped row for forward compatibility (the current approach).
- Option B: clear existing sessions (safe since there are no users).
- Option C: new DB column for v3 output, frontend version-switch.

With zero current users and John's stated plan to validate personally, Option B is simplest.

---

## Options for John

### Option 1 — Adapter-only cutover (SHIPPABLE but DEGRADED)

**What ships:**
- v3 produces `WrittenResume`.
- New adapter in `server/src/v3/compat/v2-adapter.ts` maps `StructuredResume + Strategy + WrittenResume + VerifyResult → AssemblyOutput`.
- All v2-only features synthesized with defaults (scores = 0 or crude verify-based proxies; `hiring_manager_scan = undefined`; all bullet coaching metadata = undefined).
- Frontend compiles and renders without crashing.

**What user sees:**
- Resume content renders correctly (header, summary, competencies, experience bullets, education).
- Scoring Report shows 0/0/0 or constant 80/80/80 — visibly wrong.
- Hiring Manager Scan section renders empty or hidden.
- Bullet coaching hover overlays show nothing.
- 20-40s blank loading screen (no SSE events) before the final response lands.

**Backend effort:** ~2 hours (adapter + wiring + tests).
**Frontend effort:** 0 (frontend sees v2 shape).
**Total:** ~2 hours.

**Risk:** John uses the product for the first time and the "polish" panels look broken. Decides v3 "isn't ready" based on UI chrome, not the rewrite quality (which is actually 19/19).

### Option 2 — Adapter + keep v2 scoring/scan agents as post-v3 evaluators

**What ships:**
- v3 produces `WrittenResume`.
- Adapter maps v3 output to v2's `ResumeDraftOutput` shape.
- **Keep** v2's `ats-scoring`, `truth-verification`, `tone-scoring`, `hiring-manager-scan` agents (don't delete them). Run them against the adapted `ResumeDraftOutput` as a post-processing step. Populate `AssemblyOutput.scores` and `AssemblyOutput.hiring_manager_scan` with real values.
- **Drop** v2's rewrite/benchmark/gap-analysis agents (delete them — they're replaced by v3).
- Synthetic per-bullet metadata remains (coaching panels still blank).
- Still no SSE streaming.

**What user sees:**
- Scoring Report shows real numbers again.
- Hiring Manager Scan renders with real scores.
- Bullet coaching metadata still missing (acceptable if not blocking the coaching workflow for now).
- Still 20-40s blank wait.

**Backend effort:** ~6 hours (adapter + wire up scoring agents + tests).
**Frontend effort:** 0.
**Total:** ~6 hours.

**Risk:** Scoring agents were designed to run on v2's `ResumeDraftOutput`; adapter produces that shape so they *should* work, but there may be minor compatibility issues. Manageable.

### Option 3 — Full frontend rebuild for v3 native shape

**What ships:**
- New `V3ResumeScreen` consuming `WrittenResume` + `VerifyResult` directly.
- Frontend redesigns ScoringReport/HiringManagerScan panels (or removes them) to reflect v3's attribution-discipline paradigm.
- New SSE events emitted from v3 (stage_start/stage_complete for extract/classify/strategize/write/verify at minimum).
- Backend adapter unnecessary; both shapes supported.
- v2 deleted entirely.

**Backend effort:** ~8 hours (SSE streaming layer + tests).
**Frontend effort:** ~3 days (redesign panels; build V3ResumeScreen; rewrite useV2Pipeline → useV3Pipeline; test).
**Total:** ~4-5 days.

**Risk:** High — frontend work is the largest unknown. If the new screen doesn't feel right, iteration could extend it to a week.

### Option 4 — Defer cutover; keep v2 as primary

**What ships:** Nothing. v3 stays available for fixture validation only. Continue using v2 for real user flows. v3 is the "next-gen" pipeline behind the shadow infrastructure from Phase 5 Week 0.

**Effort:** 0.
**Risk:** v3's quality wins stay on the shelf. John tests v3 only via fixtures, not real resumes.

---

## Recommendation

**Option 2** is the most pragmatic ship path. It:

1. Delivers v3's 19/19 attribution quality to real resumes.
2. Preserves the high-signal v2 UI features (scores, hiring manager scan) that users associate with the product's "polish."
3. Is ~1 day of work, not 4-5.
4. Deletes most of v2 (the rewrite-path agents) without losing the scoring infrastructure.
5. Is reversible — the scoring agents can be deleted in a follow-on cleanup sprint once v3 native scoring exists.

**Open question for John:** does the frontend need per-bullet coaching metadata (`review_state`, `addresses_requirements`, `proof_level` etc.) for the inline coaching workflow, or is that acceptable to lose for now? If it's core to the coaching UX, that expands Option 2 scope (need new v3-native coaching agents or accept degraded UX).

---

## Halt rationale

Per the cutover spec: "If the audit reveals that shapes are genuinely incompatible in a way that requires multi-hour frontend work, HALT here and report to John before proceeding."

The gaps in Options 1-3 above exceed the "multi-hour" threshold in different ways:

- Option 1 is technically "minimal hours" but produces a UI regression John will see immediately.
- Option 2 is multi-hour but in the backend, not frontend — arguably within the adapter path.
- Option 3 is explicitly multi-day.

I'm halting to surface the decision to John rather than assume Option 1 is what "shape adapter" meant. If John confirms Option 2 is the intended path, cutover resumes with that scope. If Option 1 is preferred ("ship it ugly, I'll evaluate the content"), that's also viable and I'll proceed quickly.
