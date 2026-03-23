# Shared Context Contract

## Purpose

Define the canonical shared structured context model used across the application.

This contract exists so that Resume rewrite, LinkedIn, blogging, interview prep, job targeting, company targeting, networking, benchmark analysis, gap analysis, and artifact refinement all work from the same upstream context rather than rebuilding local assumptions in each room.

## Design Principles

1. One canonical structure for cross-room context.
2. Facts must be separated from inference.
3. Strategic framing must be separated from biography.
4. Benchmark recommendations must be separated from candidate history.
5. Missing information must remain explicitly unresolved until confirmed.
6. Provenance must be explicit.
7. Room adapters may subset the contract, but they must not redefine its meaning.

## Canonical Shared Context Object

Top-level sections:

- `candidateProfile`
- `targetRole`
- `targetCompany`
- `industryContext`
- `sourceArtifacts`
- `careerNarrative`
- `benchmarkCandidate`
- `gapAnalysis`
- `positioningStrategy`
- `artifactTarget`
- `evidenceInventory`
- `constraints`
- `provenance`
- `workflowState`

## Field Definitions

### candidateProfile

The candidate’s factual or explicitly user-confirmed background profile.

Do not place inferred strengths, benchmark guidance, or strategic framing here.

Suggested fields:

- `candidateId`
- `fullName`
- `headline`
- `location`
- `seniorityLevel`
- `yearsOfExperience`
- `coreFunctions`
- `industries`
- `leadershipScope`
- `education`
- `certifications`
- `employmentHistory`
- `authenticVoiceNotes`

### targetRole

The role the candidate is pursuing.

Suggested fields:

- `roleTitle`
- `roleFamily`
- `roleLevel`
- `employmentType`
- `jobDescriptionText`
- `jobRequirements`
- `mustHaveRequirements`
- `preferredRequirements`
- `responsibilities`
- `locationRequirements`
- `compensationSignals`

### targetCompany

Company-specific context.

Suggested fields:

- `companyName`
- `companyStage`
- `companySize`
- `ownershipModel`
- `businessModel`
- `marketPosition`
- `knownStrategicPriorities`
- `companyNarrativeNotes`

### industryContext

Industry-level context relevant to the role and target company.

Suggested fields:

- `primaryIndustry`
- `adjacentIndustries`
- `industryConstraints`
- `regulatoryContext`
- `commonSuccessSignals`
- `domainLanguage`

### sourceArtifacts

Artifacts supplied by the user or generated during the workflow.

Suggested fields:

- `resume`
- `jobDescription`
- `linkedinProfile`
- `coverLetter`
- `interviewNotes`
- `careerProfile`
- `savedDrafts`
- `uploadedDocuments`

Each artifact should carry its own provenance metadata.

### careerNarrative

Structured understanding of the candidate’s story.

This section may contain synthesized framing and interpreted themes, but it must remain distinguishable from factual candidate history.

Suggested fields:

- `careerArc`
- `signatureStrengths`
- `careerThemes`
- `operatingStyle`
- `leadershipIdentity`
- `differentiators`
- `authenticPhrases`
- `sensitiveNarrativeAreas`

### benchmarkCandidate

What an ideal candidate for the target role typically shows.

Suggested fields:

- `benchmarkSummary`
- `benchmarkRequirements`
- `benchmarkSignals`
- `benchmarkWins`
- `benchmarkGapsRelativeToCandidate`

This section is recommendation context, not candidate biography.

### gapAnalysis

Structured comparison of role expectations vs candidate evidence.

Suggested fields:

- `requirements`
- `mustHaveGaps`
- `preferredGaps`
- `benchmarkGaps`
- `coverageSummary`
- `criticalRisks`
- `nextBestActions`

### positioningStrategy

Strategic framing chosen for the target artifact.

Suggested fields:

- `positioningAngle`
- `supportingThemes`
- `narrativePriorities`
- `riskAreas`
- `approvedFraming`
- `framingStillRequiringConfirmation`

### artifactTarget

The specific output being worked on.

Suggested fields:

- `artifactType`
- `artifactSection`
- `artifactGoal`
- `targetAudience`
- `successCriteria`

### evidenceInventory

Canonical evidence map for the candidate.

Suggested fields:

- `evidenceItems`
- `directProof`
- `adjacentProof`
- `unsupportedAreas`
- `overreachRisks`
- `artifactEligibleEvidence`

Each evidence item should align with the shared evidence contract.

### constraints

Constraints that govern output behavior.

Suggested fields:

- `mustRemainTruthful`
- `allowedInferenceLevel`
- `voiceConstraints`
- `exportConstraints`
- `regulatoryConstraints`
- `formatConstraints`
- `ageSensitivityGuidance`

### provenance

Cross-cutting provenance rules and references.

Suggested fields:

- `contextVersion`
- `artifactVersions`
- `sourceSummaries`
- `inferenceNotes`
- `benchmarkSources`
- `lastUpdatedBy`

### workflowState

Execution and review state, not business truth.

Suggested fields:

- `room`
- `stage`
- `activeTask`
- `reviewStatus`
- `pendingQuestions`
- `pendingApprovals`
- `stalenessFlags`

## Required vs Optional Fields

### Required for all major AI work

- `candidateProfile`
- `artifactTarget`
- `constraints`
- `provenance`
- `workflowState`

### Required when role-targeted work is happening

- `targetRole`

### Required when company-targeted work is happening

- `targetCompany`

### Required when evidence-based drafting or critique is happening

- `evidenceInventory`

### Optional but strongly recommended

- `industryContext`
- `careerNarrative`
- `benchmarkCandidate`
- `gapAnalysis`
- `positioningStrategy`
- `sourceArtifacts`

Optional does not mean meaningless. It means the room can operate without it, but will likely produce weaker results.

## Provenance Rules

1. Every inferred field must be distinguishable from factual candidate history.
2. Every benchmark-derived field must be distinguishable from candidate-owned proof.
3. Every generated strategic recommendation must be distinguishable from confirmed candidate reality.
4. Source artifact text must retain references to its originating artifact.
5. If the system does not know whether a fact is true, it must remain marked as unresolved.
6. `candidateProfile` must contain only factual or explicitly user-confirmed information.

## Cross-Room Usage Rules

1. Rooms may consume subsets of the shared context object.
2. Rooms must not redefine top-level section meaning.
3. If a room needs additional fields, extend the contract explicitly rather than creating a local shadow object.
4. Shared context updates should flow through typed adapters, not arbitrary UI state mutations.

## Mutation Rules

1. `candidateProfile` factual history must not be mutated by generated strategy text.
2. `benchmarkCandidate` must never be copied into `candidateProfile`.
3. `careerNarrative` and `positioningStrategy` may evolve, but must not silently overwrite factual evidence.
4. `workflowState` may change frequently; other sections should change only through explicit contract-aware updates.
5. User-confirmed information may promote unresolved context into factual context only when provenance is updated.

## Validation Rules

1. Top-level sections must remain present even when sparsely populated if the room depends on them.
2. Unknown data must be null/empty, not silently substituted with invented values.
3. Inferred fields must carry inference metadata or land in sections whose meaning already implies inference.
4. Persisted context must serialize cleanly and match typed interfaces across app and server.

## Anti-Patterns

Do not:

- treat benchmark text as candidate fact
- place inferred strengths or synthesized positioning inside `candidateProfile`
- flatten factual history and strategic framing into the same field
- let UI components invent local context schemas
- hide unresolved information inside polished artifact drafts
- let room-specific data models drift away from the canonical sections

## Example JSON

```json
{
  "candidateProfile": {
    "candidateId": "cand_017",
    "fullName": "Dana Mitchell",
    "headline": "Vice President of Operations",
    "location": "Minneapolis, MN",
    "seniorityLevel": "executive",
    "yearsOfExperience": 18,
    "coreFunctions": ["operations leadership", "multi-site manufacturing", "continuous improvement"],
    "industries": ["industrial manufacturing", "automotive"],
    "leadershipScope": {
      "largestTeam": 420,
      "siteCount": 4,
      "budgetScope": "$175M P&L"
    },
    "education": [
      {
        "degree": "B.S. Industrial Engineering",
        "institution": "Iowa State University"
      }
    ],
    "certifications": ["Lean Six Sigma Black Belt", "APICS CSCP"],
    "authenticVoiceNotes": ["direct", "plainspoken", "metric-aware", "not corporate-jargony"]
  },
  "targetRole": {
    "roleTitle": "Vice President of Operations",
    "roleFamily": "operations",
    "roleLevel": "vp",
    "jobDescriptionText": "Lead multi-site manufacturing operations with P&L accountability, ERP fluency, and Industry 4.0 transformation leadership.",
    "mustHaveRequirements": [
      "15+ years of progressive operations/manufacturing leadership",
      "Experience managing multi-site operations",
      "P&L responsibility for $100M+ operations",
      "Experience with ERP systems (SAP, Oracle, or similar)"
    ],
    "preferredRequirements": [
      "Experience in PE-backed manufacturing environments",
      "Background in post-acquisition operational integration"
    ]
  },
  "targetCompany": {
    "companyName": "Atlas Manufacturing Group",
    "companyStage": "established",
    "companySize": "mid-market",
    "ownershipModel": "private equity-backed",
    "businessModel": "industrial manufacturing",
    "knownStrategicPriorities": ["operational efficiency", "multi-site consistency", "digital modernization"]
  },
  "industryContext": {
    "primaryIndustry": "manufacturing",
    "adjacentIndustries": ["automotive", "aerospace"],
    "regulatoryContext": ["ISO 9001", "AS9100"],
    "commonSuccessSignals": ["multi-site operations", "ERP fluency", "throughput gains", "talent pipeline strength"]
  },
  "sourceArtifacts": {
    "resume": {
      "artifactId": "resume_2026_03_22",
      "type": "resume",
      "status": "uploaded"
    },
    "jobDescription": {
      "artifactId": "jd_2026_03_22",
      "type": "job_description",
      "status": "uploaded"
    }
  },
  "careerNarrative": {
    "careerArc": "operations scaler and turnaround leader",
    "signatureStrengths": ["multi-site execution", "lean transformation", "leadership development"],
    "careerThemes": ["operational turnaround", "throughput improvement", "leadership development"],
    "operatingStyle": "hands-on operator who scales systems and people together",
    "differentiators": ["bridges plant-floor detail with executive accountability"]
  },
  "benchmarkCandidate": {
    "benchmarkSummary": "Ideal candidates usually show PE-backed manufacturing exposure, ERP depth, and explicit Industry 4.0 transformation wins.",
    "benchmarkRequirements": [
      "PE-backed environment experience",
      "Industry 4.0 initiative leadership",
      "ERP transformation exposure"
    ],
    "benchmarkSignals": ["managed 500+ employees", "owned $100M+ OpEx", "led digital manufacturing rollout"]
  },
  "gapAnalysis": {
    "mustHaveGaps": [
      "ERP systems proof is thin",
      "P&L scope needs clearer direct proof"
    ],
    "preferredGaps": [
      "PE-backed environment experience is not explicit"
    ],
    "criticalRisks": [],
    "nextBestActions": [
      "Clarify ERP system ownership",
      "Clarify P&L scope and operating result"
    ]
  },
  "positioningStrategy": {
    "positioningAngle": "transformational operations leader who improves throughput, cost, and team strength across complex manufacturing networks",
    "supportingThemes": ["multi-site leadership", "operational excellence", "leadership pipeline"],
    "framingStillRequiringConfirmation": [
      "PE-backed environment relevance",
      "Industry 4.0 initiative detail"
    ]
  },
  "artifactTarget": {
    "artifactType": "targeted_resume",
    "artifactSection": "professional_experience",
    "artifactGoal": "increase direct proof against Atlas VP Operations requirements",
    "targetAudience": "recruiter and hiring manager"
  },
  "evidenceInventory": {
    "directProof": [
      "18 years of progressive operations/manufacturing leadership",
      "$175M P&L responsibility",
      "4-site manufacturing oversight"
    ],
    "adjacentProof": [
      "digital modernization of plant reporting",
      "enterprise systems rollout support"
    ],
    "unsupportedAreas": [
      "explicit PE-backed manufacturing environment proof"
    ]
  },
  "constraints": {
    "mustRemainTruthful": true,
    "allowedInferenceLevel": "supportable_inference",
    "voiceConstraints": ["executive", "direct", "not inflated"],
    "ageSensitivityGuidance": ["avoid dated language", "focus on current impact"]
  },
  "provenance": {
    "contextVersion": 3,
    "sourceSummaries": {
      "resume": "uploaded 2026-03-22",
      "jobDescription": "uploaded 2026-03-22",
      "benchmark": "generated from role and industry context"
    },
    "inferenceNotes": [
      "ERP depth inferred as adjacent, not direct",
      "PE-backed environment remains unresolved"
    ]
  },
  "workflowState": {
    "room": "resume_builder",
    "stage": "guided_editing",
    "activeTask": "strengthen ERP requirement proof",
    "reviewStatus": "needs_user_input",
    "pendingQuestions": 1,
    "stalenessFlags": []
  }
}
```

## Implementation Notes

1. Define shared app/server types from this shape.
2. Keep room adapters thin.
3. Persist only fields that have stable meaning; do not persist ad hoc UI-only derivations into canonical context.
4. Enforce provenance and evidence validation before content reaches exportable artifacts.

## Appendix: Legacy-To-Canonical Mapping

Use this mapping during migration. Do not invent a new local schema when a legacy field already maps here.

| Legacy live shape | Canonical section | Notes |
| --- | --- | --- |
| `career_profile` | `candidateProfile`, `careerNarrative`, `positioningStrategy`, `constraints` | `career_profile` is a mixed legacy object. Factual/profile signals should map to `candidateProfile`; synthesized narrative belongs in `careerNarrative`; positioning belongs in `positioningStrategy`. |
| `client_profile` | `candidateProfile`, `constraints` | Career level, industry, years experience, goals, constraints, and transition state feed candidate profile and constraints. |
| `positioning_strategy` | `positioningStrategy`, `targetRole`, `industryContext` | Do not leave this as a free-form blob in downstream rooms. |
| `benchmark_candidate` | `benchmarkCandidate` | Must remain benchmark-derived, never candidate biography. |
| `gap_analysis` | `gapAnalysis` | Requirement coverage, risks, and next-best-actions belong here. |
| `career_narrative` | `careerNarrative` | Treat as strategic framing, not factual profile data. |
| `industry_research` | `industryContext` | Domain, regulatory, and market context should map here. |
| `target_role` | `targetRole`, `targetCompany` | Role-specific and company-specific details should be split instead of remaining one object forever. |
| `evidence_item` rows | `evidenceInventory` | Evidence rows must be normalized through the shared evidence contract before use in exportable artifacts. |
| `coach_sessions.pipeline_status`, `pipeline_stage`, `pending_gate`, `pending_gate_data` | `workflowState` | These are execution-state fields only. Keep them out of factual cross-room context. |
| resume-v2 `pipeline_data` | `workflowState`, `artifactTarget`, room adapters | Stage and analysis payloads are execution state plus room outputs, not the canonical cross-room contract itself. |
| ad hoc `platform_context` payloads | `SharedContext` | `platform_context` remains a compatibility transport only during migration. |

## Appendix: Implementation Checklist

1. Define one canonical `SharedContext` type in code.
2. Add adapters from `career_profile`, `client_profile`, `positioning_strategy`, `benchmark_candidate`, `gap_analysis`, `career_narrative`, `industry_research`, `target_role`, and `evidence_item`.
3. Return canonical context alongside legacy `platform_context` during migration.
4. Update a small number of high-leverage consumers to prefer canonical context and fall back to legacy fields.
5. Keep `platform_context` as a compatibility layer until enough consumers have migrated.
6. Do not remove legacy fields until the typed adapters and consuming rooms have been updated and verified.
7. Map `coach_sessions.pipeline_status`, `pipeline_stage`, `pending_gate`, and `pending_gate_data` into canonical `workflowState` via room adapters instead of teaching each room its own local workflow schema.
