# Shared Evidence Contract

## Purpose

Define the evidence system for all AI-generated work in the application.

This contract governs what kinds of candidate support may appear in:

- resume bullets
- LinkedIn sections
- thought-leadership content
- interview answers
- outreach drafts
- benchmark and gap-analysis coaching
- review and critique systems

## Why Evidence Discipline Matters

This product serves executives who need strong, credible positioning.

If the system overreaches, it damages:

- user trust
- recruiter trust
- interview defensibility
- artifact quality
- legal and reputational safety

The system must help users present themselves strongly without turning gaps, requirements, or benchmark expectations into fabricated accomplishments.

## Evidence Levels

### DirectProof

- Definition:
  - explicit support from the candidate’s actual artifacts or confirmed user input
- Allowed uses:
  - final resume bullets
  - LinkedIn About and experience sections
  - interview answer drafts
  - outreach and cover-letter statements
- Prohibited uses:
  - none beyond ordinary truth constraints
- Can appear in final artifact copy:
  - yes
- Requires labeling or user confirmation:
  - no additional confirmation if provenance is already factual

### StrongAdjacentProof

- Definition:
  - candidate evidence that is clearly related and supportable but does not directly satisfy the target requirement as written
- Allowed uses:
  - coaching
  - gap explanation
  - cautious draft seeding
  - interview preparation with explicit framing
- Prohibited uses:
  - converting adjacent relevance into a direct factual claim without user confirmation
- Can appear in final artifact copy:
  - only if rewritten to remain faithful to what the evidence actually proves
- Requires labeling or user confirmation:
  - usually yes before stronger final-claim wording

### SupportableInference

- Definition:
  - a reasonable inference from known facts that is directionally safe but not explicitly stated in the candidate’s history
- Allowed uses:
  - coaching
  - follow-up question generation
  - suggested framing that is clearly marked as a draft pending confirmation
- Prohibited uses:
  - direct export to final factual artifact language without confirmation
- Can appear in final artifact copy:
  - not as an asserted factual claim unless confirmed
- Requires labeling or user confirmation:
  - yes

### BenchmarkInformedGap

- Definition:
  - a benchmark or ideal-candidate expectation that highlights what strong candidates often show
- Allowed uses:
  - gap analysis
  - prioritization
  - coaching
  - benchmark comparison
- Prohibited uses:
  - implying the candidate already has that accomplishment
- Can appear in final artifact copy:
  - no, not as candidate biography
- Requires labeling or user confirmation:
  - must remain labeled as benchmark-derived guidance

### UserUnconfirmedClaim

- Definition:
  - a candidate-relevant statement that might be true but still needs explicit user confirmation
- Allowed uses:
  - clarifying questions
  - draft suggestions clearly marked for review
- Prohibited uses:
  - final exportable artifact copy without confirmation
- Can appear in final artifact copy:
  - no
- Requires labeling or user confirmation:
  - yes

### Unsupported

- Definition:
  - a statement with no credible backing in candidate artifacts, confirmed input, or safe inference
- Allowed uses:
  - none in output beyond internal rejection or QA flags
- Prohibited uses:
  - all user-facing artifact generation
- Can appear in final artifact copy:
  - no
- Requires labeling or user confirmation:
  - cannot be promoted without new evidence

### HighOverreachRisk

- Definition:
  - a statement that would materially exaggerate scope, seniority, metrics, credentialing, or domain fit
- Allowed uses:
  - warnings
  - QA flags
  - review controls
- Prohibited uses:
  - any exportable candidate-facing artifact copy
- Can appear in final artifact copy:
  - no
- Requires labeling or user confirmation:
  - user confirmation alone is not enough without real support

## Evidence Object Schema

Each evidence item should include at least:

- `id`
- `level`
- `statement`
- `sourceType`
- `sourceArtifactId`
- `sourceExcerpt`
- `supports`
- `limitations`
- `requiresConfirmation`
- `finalArtifactEligible`
- `riskLabel`
- `provenance`

Suggested JSON shape:

```json
{
  "id": "ev_erp_01",
  "level": "StrongAdjacentProof",
  "statement": "Supported rollout of an enterprise production planning system across three plants.",
  "sourceType": "resume_bullet",
  "sourceArtifactId": "resume_2026_03_22",
  "sourceExcerpt": "Partnered with IT and plant leaders on enterprise production-planning rollout across 3 facilities.",
  "supports": [
    "ERP systems familiarity",
    "cross-functional systems implementation"
  ],
  "limitations": [
    "does not explicitly prove ownership of SAP or Oracle administration"
  ],
  "requiresConfirmation": true,
  "finalArtifactEligible": true,
  "riskLabel": "Moderate",
  "provenance": {
    "artifactType": "resume",
    "capturedAt": "2026-03-22T16:00:00Z"
  }
}
```

## Allowed Transformations

Allowed transformations include:

- tightening weak wording while preserving the same factual claim
- extracting clearer structure from factual source text
- reframing adjacent evidence as adjacent evidence
- asking for missing detail to upgrade adjacent proof into direct proof
- using benchmark gaps to prioritize what to ask next
- using supportable inference to draft a review-only suggestion that requires confirmation

## Disallowed Transformations

Explicitly forbidden:

- turning missing metrics into invented metrics
- turning benchmark expectations into candidate accomplishments
- turning role requirements into implied experience
- turning inference into factual biography
- exporting unsupported claims into resume bullets or LinkedIn About sections
- upgrading adjacent proof into direct proof without confirmation
- turning a company’s desired scale into the candidate’s actual scale
- turning a required credential into an implied credential

## Artifact Usage Rules

### Resume

- final bullets must be grounded in `DirectProof` or confirmed safe rewrites of `StrongAdjacentProof`
- `SupportableInference` may seed a draft but not export directly

### LinkedIn Profile

- About sections and experience sections follow the same export rule as resumes
- strategic polish is allowed; factual inflation is not

### Blogging / Thought Leadership

- benchmark or industry insight may shape themes
- candidate biography inside content must still remain evidence-grounded

### Interview Prep

- answer framing can use `StrongAdjacentProof` and `SupportableInference` if clearly positioned as talking points to verify
- final “tell it as your experience” phrasing must stay truthful

### Job / Company Targeting

- fit analysis may use `BenchmarkInformedGap`
- fit summaries must not imply the candidate already clears a gap without real support

### Networking / Outreach

- outreach may emphasize alignment and relevance
- outreach must not assert unsupported expertise or relationships

## Room-Specific Guidance

### Resume Rewrite

- highest evidence discipline
- exportable artifact
- lowest tolerance for unsupported inference

### LinkedIn Rewrite

- similar evidence discipline to resume
- slightly more flexible narrative polish, but not factual inflation

### Interview Prep

- can tolerate exploratory draft language if clearly marked as practice or clarification-seeking

### Blogging / Thought Leadership

- can generalize perspective, but not candidate accomplishments

### Company Targeting

- must distinguish company-fit hypothesis from proven company-relevant experience

## Confidence and Risk Labels

Suggested confidence labels:

- `High`
- `Moderate`
- `Low`

Suggested risk labels:

- `Low`
- `Moderate`
- `High`
- `Critical`

Guidance:

- `DirectProof` should usually be `High confidence / Low risk`
- `StrongAdjacentProof` is usually `Moderate confidence / Moderate risk`
- `SupportableInference` is usually `Moderate or Low confidence / Moderate or High risk`
- `Unsupported` and `HighOverreachRisk` must never be treated as export-safe

## Example JSON

```json
[
  {
    "id": "ev_01",
    "level": "DirectProof",
    "statement": "Owned $175M P&L across four manufacturing sites.",
    "sourceType": "resume_bullet",
    "sourceArtifactId": "resume_2026_03_22",
    "sourceExcerpt": "Owned $175M P&L across 4 manufacturing sites while leading 420 employees.",
    "supports": ["multi-site leadership", "P&L accountability"],
    "limitations": [],
    "requiresConfirmation": false,
    "finalArtifactEligible": true,
    "riskLabel": "Low",
    "confidence": "High"
  },
  {
    "id": "ev_02",
    "level": "StrongAdjacentProof",
    "statement": "Partnered on enterprise systems rollout across three plants.",
    "sourceType": "resume_bullet",
    "sourceArtifactId": "resume_2026_03_22",
    "sourceExcerpt": "Partnered with IT and plant leaders on enterprise production-planning rollout across 3 facilities.",
    "supports": ["ERP systems familiarity"],
    "limitations": ["does not prove named ERP platform ownership"],
    "requiresConfirmation": true,
    "finalArtifactEligible": true,
    "riskLabel": "Moderate",
    "confidence": "Moderate"
  },
  {
    "id": "ev_03",
    "level": "BenchmarkInformedGap",
    "statement": "Ideal candidates often show PE-backed manufacturing operating experience.",
    "sourceType": "benchmark",
    "sourceArtifactId": "benchmark_2026_03_22",
    "sourceExcerpt": "Benchmark summary indicates PE-backed manufacturing exposure is a differentiator.",
    "supports": ["benchmark gap prioritization"],
    "limitations": ["not candidate proof"],
    "requiresConfirmation": false,
    "finalArtifactEligible": false,
    "riskLabel": "Low",
    "confidence": "High"
  },
  {
    "id": "ev_04",
    "level": "Unsupported",
    "statement": "Led SAP implementation across six plants.",
    "sourceType": "generated_claim",
    "sourceArtifactId": null,
    "sourceExcerpt": "",
    "supports": [],
    "limitations": ["no supporting evidence found"],
    "requiresConfirmation": true,
    "finalArtifactEligible": false,
    "riskLabel": "Critical",
    "confidence": "Low"
  }
]
```

## Enforcement Notes

1. Shared validators should enforce evidence level before exportable artifact generation.
2. UI should display when content is still inference, benchmark-derived, or awaiting confirmation.
3. Review systems should block unsupported or high-overreach content from final apply/export flows.
4. If a room needs additional evidence-level nuance, extend this contract explicitly instead of inventing local evidence labels.

## Appendix: Legacy-To-Canonical Mapping

Use this mapping to migrate existing evidence systems without losing compatibility.

| Legacy live shape | Canonical level or behavior | Notes |
| --- | --- | --- |
| truth verification `verified` | `DirectProof` | Eligible for final artifact use. |
| truth verification `plausible` | `StrongAdjacentProof` | May seed or support final wording only if the wording remains faithful and confirmation requirements are satisfied. |
| truth verification `unverified` | `UserUnconfirmedClaim` | Treat as candidate-relevant but not export-safe until confirmed. |
| truth verification `fabricated` | `HighOverreachRisk` | Block from exportable artifacts. |
| legacy `evidence_item` with source `crafted` | `DirectProof` by default | Preserve legacy behavior, but prefer richer provenance over time. |
| legacy `evidence_item` with source `interview` | `DirectProof` by default | Candidate-provided evidence can remain direct unless a later validator downgrades it. |
| legacy `evidence_item` with source `upgraded` | `StrongAdjacentProof` by default | Upgraded language may still be valid, but should not silently outrank direct source evidence. |
| `master_resumes.evidence_items[*]` | `EvidenceItem` via legacy evidence mapper | Preserve the current source/category/session metadata, then normalize into one canonical evidence shape. |
| benchmark candidate rows | `BenchmarkInformedGap` | Never export as candidate biography. |
| ad hoc “suggested rewrite” labels without proof | `Unsupported` | Must not reach exportable artifact copy. |

## Appendix: Implementation Checklist

1. Define one canonical `EvidenceItem` contract in code.
2. Add one mapper from truth-verification outputs into `EvidenceItem`.
3. Add one mapper from legacy `evidence_item` rows into `EvidenceItem`.
4. Centralize final-artifact eligibility checks from the shared evidence contract.
5. Use canonical evidence in new shared-context adapters first; preserve legacy evidence arrays as compatibility data only.
6. Do not let rooms create local evidence levels or room-specific export rules.
7. Keep truth-verification `claims[*].confidence` and legacy evidence arrays available until their consumers migrate, but derive canonical `EvidenceItem` objects from them in one place.
