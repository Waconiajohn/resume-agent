# Resume V2 Document-First Roadmap

## Purpose

Define the next implementation path for Resume V2 so the product behaves like a truthful executive resume rebuilding system, not a gap-analysis tool with a resume attached.

This roadmap is the controlling product direction for Resume V2 until explicitly replaced.

## Product Promise

For a qualified but under-documented executive, the product should:

1. show how weak the current resume is on paper
2. generate the strongest truthful tailored resume immediately
3. show exactly which lines are safe, inferred, or risky
4. let the user fix everything directly on the resume
5. run one last final review before export
6. preserve validated discoveries in the master resume for next time

## Primary Product Model

Resume V2 has one primary workflow:

1. intake
2. before score
3. ultimate resume generation
4. sentence-level proof review on the resume itself
5. after score
6. final review
7. inline final-review fixes on the same resume
8. rerun final review
9. export
10. promote validated discoveries to the master resume

This is the only primary work path.

## What Is No Longer the Primary Workspace

Gap analysis, benchmark analysis, and requirement reports are supporting layers only.

They may:

- explain why the score is low
- explain why a sentence is color-coded
- explain what the benchmark adds beyond the job description

They may not:

- become the main editing workspace
- ask the user to do work outside the resume canvas
- compete with the resume as the place where progress happens

## Core UX Rules

### Rule 1: The Resume Is the Only Work Surface

All user work must happen on the resume itself.

That includes:

- validating risky lines
- strengthening weak lines
- fixing ATS findings
- resolving hiring-manager concerns
- resolving humanization concerns

No separate report panel should become a second editing surface.

### Rule 2: Analysis Is Read-Only Support

Scoring reports and gap analysis are read-only support layers.

They can:

- explain
- reassure
- justify
- prioritize

They cannot become a second workflow.

### Rule 3: Show the Strongest Resume Early

The system should generate the strongest plausible tailored resume as early as possible.

Do not force the user through a long gap-analysis workflow before they can see the improved document.

### Rule 4: Keep Risk Visible

If a line helps the resume meet the role but is not yet supported, keep it visible on the working resume with an explicit risk state.

Do not hide the strongest version of the story in a side queue.

## Sentence-Level Proof States

The resume should carry sentence-level proof states that are visible to the user.

Initial working model:

- `DirectProof`
  - directly supported by the original resume or confirmed evidence
  - safe
- `RewrittenFromProof`
  - materially stronger wording built from direct proof
  - safe after verification
- `InferredFromAdjacentProof`
  - built from related but indirect evidence
  - needs review
- `CodeRedUnsubstantiated`
  - currently unsupported but included because it closes an important role or benchmark need
  - highest-risk working state

### Working Rules For Proof States

- `CodeRedUnsubstantiated` may appear on the working resume
- `CodeRedUnsubstantiated` must be visually unmistakable
- `CodeRedUnsubstantiated` must trigger export warning behavior
- unsupported lines must never silently become "final safe copy"
- final review should reduce red and amber states, not hide them

## Color Model

The product may refine the actual palette later, but the meaning must remain stable.

Current intent:

- Green: direct proof
- Blue: rewritten from proof
- Amber: adjacent proof or conservative inference
- Red: code red, currently unsubstantiated

The UI must explain the meaning once, clearly, and then use it consistently.

## Benchmark Rules

Benchmark candidate analysis exists because job descriptions are often incomplete or poorly written.

Benchmark output should be used to:

- identify executive signals strong candidates usually show
- discover adjacent candidate evidence that has been overlooked
- generate better positioning
- generate better discovery questions

Benchmark output must not:

- be converted into candidate accomplishments
- be treated as candidate biography
- be exported as factual resume language unless validated

## Final Review Model

Final review happens after the resume has already been rebuilt.

It includes:

- ATS review
- hiring manager review
- humanization review
- surfaced AI-readiness review when relevant

### Final Review UX Rules

- final review findings must point back to the live resume
- fixes must happen inline on the same resume canvas
- post-review changes must be visibly tracked on the resume
- the user should not be pushed into a separate correction workspace
- final review should be rerun before export when meaningful changes are made

## Master Resume Promotion

Master resume promotion happens at the end of the tailored-resume flow.

It is a separate completion step, not the main editing model.

The product should surface:

- new validated accomplishments
- stronger framing that the user confirmed
- newly documented experiences that were discovered during the rebuild

The product should not promote:

- unresolved `CodeRedUnsubstantiated` lines
- unresolved final-review concerns
- unsupported candidate claims

## Current Code Mapping

### Keep And Reframe

- [V2ResumeScreen.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/V2ResumeScreen.tsx)
  - keep as the screen shell and state owner
  - make it drive a single document-first journey
- [V2StreamingDisplay.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/V2StreamingDisplay.tsx)
  - keep as the main display coordinator
  - simplify around one resume canvas, one rail, one supporting analysis layer
- [ScoringReport.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/ScoringReport.tsx)
  - keep for before and after reporting
  - do not let it become a workspace
- [ResumeWorkspaceRail.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/ResumeWorkspaceRail.tsx)
  - keep as stage guidance and final-review status
  - not as a second analysis/report area

### Demote From Primary To Supporting

- [GapQuestionFlow.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/GapQuestionFlow.tsx)
  - no longer the main work path
  - repurpose into targeted validation for risky resume lines
- [GapAnalysisReportPanel.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/panels/GapAnalysisReportPanel.tsx)
  - keep as read-only explanation
  - never as the place where editing work happens
- [UnifiedGapAnalysisCard.tsx](/Users/johnschrup/resume-agent/app/src/components/resume-v2/cards/UnifiedGapAnalysisCard.tsx)
  - same rule: explain, do not become the main work surface

## Required Contract Changes

The current contracts are not yet enough to fully support this model.

### 1. Resume Line Proof-State Contract

Add typed metadata for each generated line or bullet:

- proof state
- strongest evidence source
- whether candidate confirmation is required
- whether export is blocked or warned
- whether benchmark contributed to the suggestion

### 2. Final Review Anchor Contract

Final review concerns need stable links back to:

- section
- bullet or line id
- issue type
- suggested fix
- current proof state

### 3. Master Promotion Contract

Promotion items need to distinguish:

- validated discovery
- reframed existing proof
- still-unresolved risk

## Phased Rollout

### Phase 1: Lock The Product Model

Goal:

- the resume becomes the only work surface
- gap analysis becomes supporting explanation

Implementation focus:

- simplify Resume V2 navigation and messaging
- make the main resume visible earlier
- make analysis/report sections clearly secondary

### Phase 2: Add Proof-State Rendering To The Resume

Goal:

- every generated sentence carries an explicit proof state

Implementation focus:

- typed proof-state metadata
- sentence or bullet highlighting
- legend and explanation
- export warnings for unresolved red states

### Phase 3: Convert Gap Flow Into Resume Validation

Goal:

- risky items are fixed on the resume, not in a separate question flow

Implementation focus:

- convert gap prompts into inline resume actions
- use AI assist to strengthen selected lines in place
- keep analysis read-only

### Phase 4: Final Review Inline Loop

Goal:

- final review becomes a highlight-and-fix loop on the same document

Implementation focus:

- click concern
- jump to line
- propose fix
- apply in place
- rerun final review

### Phase 5: Master Resume Promotion

Goal:

- retain validated discoveries for future tailoring

Implementation focus:

- end-of-flow promotion tray
- clear selection model
- no promotion of unresolved red lines

## Non-Goals For This Roadmap

- replacing the full runtime
- redesigning every room in the app
- broad visual polish detached from workflow simplification
- turning the product into a rigid wizard

## Success Criteria

The roadmap is successful when:

- users see a stronger resume quickly
- users do all real work on the resume itself
- users understand what AI changed and why it is risky or safe
- final review issues are fixed inline on the document
- the after score demonstrates visible improvement
- master resume promotion captures newly validated material without promoting unsupported claims

## Decision Summary

Resume V2 should be a document-first rebuilding workflow with one work surface, visible proof states, and inline final-review repair. Analysis exists to support the resume, not compete with it.
