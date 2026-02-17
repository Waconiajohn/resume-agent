# Resume Agent v2: Multi-Agent Architecture

## Overview

A pipeline of 7 specialized, stateless agents that replace the current monolithic agent loop.
Each agent receives structured JSON input, produces structured JSON output, and has no
awareness of the other agents. Context dies between agents — all data passes through
explicit interfaces.

**Token budget:** ~56-82K per session (down from ~1.1M in v1)
**Cost per session:** ~$0.15-0.25 at Z.AI pricing

---

## Pipeline Flow

```
User uploads resume + JD
        |
  [1. Intake Agent]          MODEL_LIGHT    ~3-5K tokens
        |
        v
  [2. Positioning Coach]     MODEL_PRIMARY   ~8-12K tokens
        |                    (skipped if saved profile exists + user opts to reuse)
        v
  [3. Research Agent]        MODEL_LIGHT     ~5-8K tokens
        |
        v
  [4. Gap Analyst]           MODEL_MID       ~4-6K tokens
        |
        v
  [5. Resume Architect]      MODEL_PRIMARY   ~12-18K tokens
        |                    >> USER REVIEWS BLUEPRINT <<
        v
  [6. Section Writer x5-6]   MODEL_PRIMARY   ~10-15K tokens
        |                    >> USER APPROVES EACH SECTION <<
        v
  [7. Quality Reviewer]      MODEL_MID       ~12-14K tokens
        |                    (auto-revision loop if needed, max 1 cycle)
        v
  Export (DOCX/PDF)
```

---

## Agent 1: Intake Agent

### Purpose
Parse raw resume into structured data. Extract contact info, experience entries,
skills, education, certifications. No strategic decisions — pure extraction.

### Model
MODEL_LIGHT (free tier)

### Input
```typescript
{
  raw_resume_text: string;        // pasted or extracted from upload
  job_description?: string;       // if provided at this stage
}
```

### Output
```typescript
{
  contact: {
    name: string;
    email: string;
    phone: string;
    location: string;            // city, state only — no street address
    linkedin?: string;
  };
  summary: string;               // existing summary text, verbatim
  experience: Array<{
    company: string;
    title: string;
    start_date: string;          // "2019" or "Jan 2019"
    end_date: string;            // "Present" or "2023"
    bullets: string[];
    inferred_scope?: {
      team_size?: string;
      budget?: string;
      geography?: string;
    };
  }>;
  skills: string[];
  education: Array<{
    degree: string;
    institution: string;
    year?: string;               // extracted if present
  }>;
  certifications: string[];
  career_span_years: number;     // calculated from earliest to latest date
  raw_text: string;              // preserved for downstream reference
}
```

### Notes
- This replaces the current `create_master_resume` tool
- No LLM creativity needed — structured extraction only
- Career span calculation feeds age-protection logic downstream

---

## Agent 2: Positioning Coach ("Why Me" Agent)

### Purpose
Conduct a guided conversation to extract the user's authentic positioning data.
Uses pre-populated suggestions from the parsed resume to reduce user effort.

### Model
MODEL_PRIMARY (needs coaching intelligence and pattern recognition)

### Persistence
The Positioning Coach output is **saved to the user's profile** and reused across sessions.
On subsequent sessions, the user sees:
> "I have your positioning profile from [date]. Would you like to:"
> - **Use it as-is** (skip to Research Agent)
> - **Update it** (review and edit specific sections)
> - **Start fresh** (full interview)

### Database Schema
```sql
CREATE TABLE user_positioning_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  positioning_data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)  -- one active profile per user
);

ALTER TABLE user_positioning_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own positioning profile"
  ON user_positioning_profiles
  FOR ALL USING (user_id = (select auth.uid()));
```

### The 6 Core Questions (with pre-populated suggestions)

**Q1: Career Arc**
- Agent analyzes resume experience sequence and proposes arc labels
- Multiple choice: Builder / Scaler / Fixer / Operator / Connector / Other
- Follow-up: "What about that pattern is intentional vs. what just happened?"

**Q2: Best Representative Win**
- Agent pulls 3-4 strongest resume bullets (ranked by specificity + metrics)
- User picks one or describes a better one
- Follow-ups: baseline, differentiating decision, defensible metric

**Q3: Hidden Win**
- Agent identifies themes present on resume and asks what's missing
- Suggests gaps: "Your resume is light on [X] — is there a story there?"
- Follow-up: "What does that reveal about how you operate?"

**Q4: Unconscious Competence**
- Agent identifies recurring patterns across roles and presents them
- Multiple choice based on detected patterns + "None of these"
- Follow-ups: "What feels effortless to you?" / "What would break if you left?"

**Q5: Your Method** (optional — accept "I adapt" gracefully)
- Agent looks for process-related bullets or repeated approaches
- Options: formal framework / consistent approach / adaptive style
- Follow-up if they have one: "Did others adopt it? What did it improve?"

**Q6: Domain Insight**
- Agent infers domain from industry/role history
- Suggested starters based on their field
- Follow-up: "If a CEO asked you to fix that in 90 days, what's the first thing you'd do?"

### Smart Follow-up Triggers
- **Vague answer** → "What did you *do* in real terms?"
- **Team credit ("we did X")** → "What was YOUR part?"
- **No metrics** → "What changed in [time/cost/revenue/quality/adoption]?"
- **Overclaim risk** → "What's the version we can defend in an interview?"
- **Energy spike** → "That seems important — tell me more"

### Output
```typescript
{
  career_arc: {
    label: string;               // "Builder" | "Scaler" | "Fixer" | etc.
    evidence: string;
    user_description: string;
  };
  top_capabilities: Array<{
    capability: string;
    evidence: string[];
    source: string;              // "resume" | "interview" | "both"
  }>;
  evidence_library: Array<{
    situation: string;
    action: string;
    result: string;
    metrics_defensible: boolean;
    user_validated: boolean;
  }>;
  signature_method: {
    name: string | null;
    what_it_improves: string;
    adopted_by_others: boolean;
  } | null;
  unconscious_competence: string;
  domain_insight: string;
  authentic_phrases: string[];
  gaps_detected: string[];
}
```

---

## Agent 3: Research Agent

### Purpose
Analyze the job description, research the company/industry, and build a benchmark
candidate profile. Runs automatically — no user interaction.

### Model
MODEL_LIGHT for JD analysis + structured extraction
Perplexity API for company/industry research (with MODEL_LIGHT fallback)

### Input
```typescript
{
  job_description: string;
  company_name: string;
  parsed_resume: IntakeOutput;   // from Agent 1
}
```

### Output
```typescript
{
  jd_analysis: {
    role_title: string;
    company: string;
    seniority_level: string;     // "mid" | "senior" | "executive"
    must_haves: string[];
    nice_to_haves: string[];
    implicit_requirements: string[];
    language_keywords: string[];
  };
  company_research: {
    company_name: string;
    industry: string;
    size: string;
    culture_signals: string[];
  };
  benchmark_candidate: {
    ideal_profile: string;
    language_keywords: string[];
    section_expectations: Record<string, string>;
  };
}
```

### Notes
- Replaces current `analyze_jd`, `research_company`, `research_industry`, `build_benchmark` tools
- All four operations happen in one agent call (or parallel internal calls)
- Seniority detection feeds downstream question framing and section strategy

---

## Agent 4: Gap Analyst

### Purpose
Map every JD requirement against the user's evidence (from resume + Positioning Coach)
and classify each as strong / partial / gap. For partial matches, specify how to strengthen.
For gaps, propose reframe strategies or mark as unaddressable.

### Model
MODEL_MID (analytical comparison, not creative writing)

### Input
```typescript
{
  parsed_resume: IntakeOutput;
  positioning: PositioningCoachOutput;
  jd_analysis: ResearchOutput['jd_analysis'];
  benchmark: ResearchOutput['benchmark_candidate'];
}
```

### Output
```typescript
{
  requirements: Array<{
    requirement: string;
    classification: "strong" | "partial" | "gap";
    evidence: string[];
    resume_location?: string;
    positioning_source?: string;  // which Why Me answer provides evidence
    strengthen?: string;          // for partial: how to make it stronger
    mitigation?: string;          // for gap: reframe strategy
    unaddressable?: boolean;      // true if no evidence exists at all
  }>;
  coverage_score: number;         // 0-100
  critical_gaps: string[];
  addressable_gaps: string[];
  strength_summary: string;       // 2-3 sentences
}
```

### Notes
- Kept separate from Architect per user directive: "AI takes shortcuts when combined"
- The Gap Analyst only classifies — it does NOT decide how to use the information
- The Architect receives this and makes all strategic allocation decisions

---

## Agent 5: Resume Architect

### Purpose
Produce a complete resume blueprint — section order, evidence allocation, keyword
placement, age protection, gap reframes, tone guidance — so precise that the
Section Writer has zero strategic discretion.

### Model
MODEL_PRIMARY (most critical agent — quality of blueprint determines quality of resume)

### User Interaction
**Reviewable design step.** The Architect's output is surfaced in the right panel
as a structured blueprint the user can review and approve before writing begins.
This is the `resume_design` phase gate.

### Input
```typescript
{
  parsed_resume: IntakeOutput;
  positioning: PositioningCoachOutput;
  research: ResearchOutput;
  gap_analysis: GapAnalystOutput;
}
```

### The 7 Strategic Decisions

**Decision 1: Section Order & Inclusion**
- Which sections exist and in what order
- Whether to include Selected Accomplishments (yes if best evidence is scattered)
- Age-protection: 15-year detail window, "Earlier Career" one-liners for older roles

**Decision 2: Summary Positioning Strategy**
- Positioning angle (from career arc + top capabilities)
- Must-include elements (mapped from JD must-haves)
- Gap reframe instructions (how to address gaps without fabricating)
- Tone guidance (from authentic phrases and voice markers)
- Keywords to embed in summary
- Length constraint (3-4 sentences)

**Decision 3: Evidence Allocation**
- Maps every evidence item to exactly one resume location (no duplication)
- Every must-have requirement has evidence allocated somewhere
- Enhancement instructions (add scope, add metric, reframe verb)
- Unallocated requirements explicitly marked with rationale

**Decision 4: Skills Section Strategy**
- Categorized grouping (not a keyword dump)
- Category order based on JD emphasis
- Age-protection: remove dated technologies
- Missing keywords flagged (only add if user confirms familiarity)

**Decision 5: Experience Section Structure**
- Bullet count per role
- What each bullet covers (focus area + evidence source + instruction)
- Which existing bullets to keep, rewrite, or cut
- Title adjustments if warranted
- Earlier career handling (one-liner format for 15+ year old roles)

**Decision 6: Age-Protection Audit**
- Flag graduation years, "20+ years" language, obsolete tech, street addresses
- Specific removal/replacement action for each flag

**Decision 7: Keyword Integration Map**
- Where each JD keyword appears (target 3+ placements per keyword)
- Current count vs. target count
- Specific placement instructions

### Output
```typescript
{
  blueprint_version: string;
  target_role: string;
  positioning_angle: string;

  section_plan: {
    order: string[];
    rationale: string;
  };
  summary_blueprint: {
    positioning_angle: string;
    must_include: string[];
    gap_reframe: Record<string, string>;
    tone_guidance: string;
    keywords_to_embed: string[];
    authentic_phrases_to_echo: string[];
    length: string;
  };
  evidence_allocation: {
    selected_accomplishments?: Array<{
      evidence_id: string;
      achievement: string;
      maps_to_requirements: string[];
      enhancement: string;
    }>;
    experience_section: Record<string, {
      company: string;
      bullets_to_write: Array<{
        focus: string;
        maps_to: string;
        evidence_source: string;
        instruction: string;
        target_metric?: string;
      }>;
      bullets_to_keep: string[];
      bullets_to_cut: string[];
    }>;
    unallocated_requirements: Array<{
      requirement: string;
      resolution: string;
    }>;
  };
  skills_blueprint: {
    format: "categorized";
    categories: Array<{
      label: string;
      skills: string[];
      rationale: string;
    }>;
    keywords_still_missing: string[];
    age_protection_removals: string[];
  };
  experience_blueprint: {
    roles: Array<{
      company: string;
      title: string;
      dates: string;
      title_adjustment?: string;
      bullet_count: number;
    }>;
    earlier_career?: {
      include: boolean;
      roles: Array<{ title: string; company: string }>;
      format: string;
    };
  };
  age_protection: {
    flags: Array<{
      item: string;
      risk: string;
      action: string;
    }>;
    clean: boolean;
  };
  keyword_map: Record<string, {
    target_density: number;
    placements: string[];
    current_count: number;
    action: string;
  }>;
  global_rules: {
    voice: string;
    bullet_format: string;
    length_target: string;
    ats_rules: string;
  };
}
```

---

## Agent 6: Section Writer

### Purpose
Write one resume section per call. Receives only the slice of the blueprint
relevant to that section. Has zero strategic discretion — executes the
Architect's brief precisely.

### Model
MODEL_PRIMARY (quality writing)

### User Interaction
Each section is presented for user approval ("Looks Good" / "Request Changes").
This is the `section_craft` phase.

### Input (per call)
```typescript
{
  section: string;                    // "summary" | "selected_accomplishments" | "experience_role_0" | etc.
  blueprint_slice: object;            // only the relevant portion of the Architect's blueprint
  evidence_sources: object;           // relevant evidence from positioning + resume
  global_rules: ArchitectOutput['global_rules'];
}
```

### Output (per call)
```typescript
{
  section: string;
  content: string;                    // the written section text
  keywords_used: string[];
  requirements_addressed: string[];
  evidence_ids_used: string[];        // for Quality Reviewer to trace
}
```

### Notes
- Called 5-6 times per session (summary, selected_accomplishments, experience x2-3, skills, education)
- Each call is small (~1-2K input, ~500-800 output)
- The Section Writer NEVER sees the full blueprint — only its section assignment
- Skills and education sections may not need MODEL_PRIMARY — could use MODEL_MID
  (they're more structural than creative). Optimize after v1.

---

## Agent 7: Quality Reviewer

### Purpose
Final gate before export. Evaluates the assembled resume across 6 quality
dimensions and produces a pass/revise/redesign verdict.

### Model
MODEL_MID (analytical evaluation, not creative writing)

### Input
```typescript
{
  assembled_resume: {
    sections: Record<string, string>;  // all Section Writer outputs
    full_text: string;                 // concatenated for ATS simulation
  };
  architect_blueprint: ArchitectOutput;
  jd_analysis: ResearchOutput['jd_analysis'];
  evidence_library: PositioningCoachOutput['evidence_library'];
}
```

### The 6 Quality Dimensions

**Dimension 1: Hiring Manager Impact (score 1-5, pass: 4+)**
- 30-second scan test: does the summary signal relevance?
- Are first 2-3 bullets of recent role compelling?
- Clear "so what" for every claim?

**Dimension 2: Requirement Coverage (score 0-100%, pass: 80%+)**
- Every must-have addressed, reframed, or explicitly marked unaddressable
- No critical requirement buried below page 2
- Gap reframes executed and effective

**Dimension 3: ATS Compliance (score 0-100, pass: 80+)**
- Keyword coverage: 60-80% of JD keywords present
- Keyword placement: 3-5 in summary, 10-15 in skills, natural in experience
- Section headers: standard ATS-parsable names only
- No formatting hazards (tables, columns, text boxes, special chars)

**Dimension 4: Authenticity (score 0-100, pass: 75+)**
- Sentence structure variety (no repetitive patterns)
- Buzzword density (flag "leveraged," "spearheaded," etc.)
- Authentic phrase usage (did writer incorporate user's natural language?)
- Voice consistency across sections

**Dimension 5: Evidence Integrity (score 0-100, pass: 90+)**
- Every quantified claim traceable to evidence library
- No inflated metrics (Section Writer hallucination check)
- Scope descriptors match evidence (team size, budget, geography)
- Action verbs accurately reflect user's actual role

**Dimension 6: Blueprint Compliance (score 0-100, pass: 85+)**
- Section order matches blueprint
- All "must_include" elements present in summary
- Age-protection actions applied
- Keyword placements match targets

### Verdict
```typescript
{
  decision: "approve" | "revise" | "redesign";
  scores: {
    hiring_manager_impact: number;     // 1-5
    requirement_coverage: number;      // 0-100
    ats_score: number;                 // 0-100
    authenticity: number;              // 0-100
    evidence_integrity: number;        // 0-100
    blueprint_compliance: number;      // 0-100
  };
  overall_pass: boolean;
  revision_instructions?: Array<{
    target_section: string;
    issue: string;
    instruction: string;
    priority: "high" | "medium" | "low";
  }>;
  redesign_reason?: string;
}
```

### Revision Loop
- **Revise:** Flagged sections sent back to Section Writer with specific fix instructions.
  Max 1 revision cycle. If still below threshold after revision, approve with user note.
- **Redesign:** Feedback sent back to Architect. Max 1 redesign cycle. If still failing,
  surface both versions to user.
- **Typical path:** Approve on first pass (~70% of sessions if Architect is good).

---

## Why Me Persistence & Reuse

### Flow for returning users

```
User logs in → System checks for existing positioning profile
  |
  ├─ No profile exists → Full Positioning Coach interview (6 questions)
  |                       → Save output to user_positioning_profiles
  |
  └─ Profile exists → Present options:
                       ├─ "Use as-is" → Skip to Research Agent
                       ├─ "Update" → Show current profile, edit inline
                       └─ "Start fresh" → Full interview, replace old profile
```

### Profile versioning
- Only one active profile per user (UNIQUE on user_id)
- Version number increments on update
- Previous versions are overwritten (not archived — keep it simple for v1)
- `updated_at` timestamp shown to user so they know how fresh it is

### Profile editing
- User can view their positioning profile from a dashboard/settings view
- Each field is editable: career arc, top capabilities, evidence library, etc.
- Edits trigger a version increment and updated_at refresh
- No re-interview needed for small edits

### What gets saved
The complete PositioningCoachOutput JSON (see Agent 2 output spec above).
Stored as JSONB in Supabase for flexible querying and partial updates.

---

## Database Changes

### New tables

```sql
-- Why Me positioning profile (persistent across sessions)
CREATE TABLE user_positioning_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  positioning_data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE user_positioning_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own positioning profile"
  ON user_positioning_profiles FOR ALL
  USING (user_id = (select auth.uid()));

-- Usage tracking
CREATE TABLE user_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  sessions_count integer DEFAULT 0,
  total_input_tokens bigint DEFAULT 0,
  total_output_tokens bigint DEFAULT 0,
  total_cost_usd numeric(10,6) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start)
);
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own usage"
  ON user_usage FOR SELECT
  USING (user_id = (select auth.uid()));

-- Pricing plans
CREATE TABLE pricing_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  monthly_price_cents integer NOT NULL,
  included_sessions integer NOT NULL,
  overage_price_cents integer NOT NULL,
  max_sessions_per_month integer,
  created_at timestamptz DEFAULT now()
);
INSERT INTO pricing_plans VALUES
  ('free', 'Free', 0, 3, 0, 3),
  ('starter', 'Starter', 1999, 15, 150, 50),
  ('pro', 'Pro', 4999, 50, 100, 200);

-- User subscriptions
CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  plan_id text NOT NULL REFERENCES pricing_plans(id) DEFAULT 'free',
  stripe_subscription_id text,
  stripe_customer_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  current_period_end timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscription"
  ON user_subscriptions FOR SELECT
  USING (user_id = (select auth.uid()));
```

### Session table additions

```sql
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS input_tokens_used integer DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS output_tokens_used integer DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(10,6) DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS llm_provider text DEFAULT 'zai';
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS positioning_profile_id uuid
  REFERENCES user_positioning_profiles(id);
```

---

## Model Routing

| Agent | Model | Z.AI Model ID | Cost (in/out per 1M) |
|-------|-------|--------------|----------------------|
| Intake | MODEL_LIGHT | glm-4.7-flash | FREE |
| Positioning Coach | MODEL_PRIMARY | glm-4.7 | $0.60 / $2.20 |
| Research (JD analysis) | MODEL_LIGHT | glm-4.7-flash | FREE |
| Research (Perplexity) | Perplexity API | — | per-query |
| Gap Analyst | MODEL_MID | glm-4.5-air | $0.20 / $1.10 |
| Resume Architect | MODEL_PRIMARY | glm-4.7 | $0.60 / $2.20 |
| Section Writer | MODEL_PRIMARY | glm-4.7 | $0.60 / $2.20 |
| Quality Reviewer | MODEL_MID | glm-4.5-air | $0.20 / $1.10 |

---

## Implementation Phases

### Phase 1: Foundation
- [ ] LLM provider abstraction (ZAIProvider + AnthropicProvider) — already partially complete
- [ ] Update llm.ts with model constants and routing
- [ ] Database migrations (positioning profiles, usage, pricing)

### Phase 2: Feature Cuts
- [ ] Remove cover letter phase entirely
- [ ] Merge ATS check into adversarial review (already done)
- [ ] Trim context summary (remove benchmark block, company tone)

### Phase 3: Agent Pipeline
- [ ] Refactor Intake Agent (from create_master_resume)
- [ ] Build Positioning Coach (new — 6 questions with pre-populated suggestions)
- [ ] Positioning profile persistence (save/load/edit)
- [ ] Refactor Research Agent (consolidate 4 tools into 1 agent)
- [ ] Refactor Gap Analyst (from classify_fit)
- [ ] Build Resume Architect (new — 7 strategic decisions)
- [ ] Refactor Section Writer (from generate_section / propose_section_edit)
- [ ] Refactor Quality Reviewer (from adversarial_review + humanize_check)

### Phase 4: Pipeline Orchestration
- [ ] New pipeline controller (replaces loop.ts agent loop)
- [ ] Agent-to-agent data passing
- [ ] SSE events for each pipeline stage
- [ ] Phase gates at Architect review and section approval steps
- [ ] Revision loop (Quality Reviewer → Section Writer)

### Phase 5: Frontend
- [ ] Update phase flow UI (7 phases → 7 pipeline stages)
- [ ] Positioning profile management (view/edit/reuse)
- [ ] Blueprint review panel (Architect output visualization)
- [ ] Updated Quality Dashboard (6 dimensions)

### Phase 6: Cost & Pricing
- [ ] Token tracking per agent call
- [ ] Session cost accumulation
- [ ] Usage tracking (user_usage table)
- [ ] Session gate check (plan limits)
- [ ] Pricing page / upgrade flow (Stripe integration — future)

---

## Files Affected

### New files
- `server/src/agents/intake.ts`
- `server/src/agents/positioning-coach.ts`
- `server/src/agents/research.ts`
- `server/src/agents/gap-analyst.ts`
- `server/src/agents/architect.ts`
- `server/src/agents/section-writer.ts`
- `server/src/agents/quality-reviewer.ts`
- `server/src/agents/pipeline.ts` (orchestrator)
- `server/src/agents/types.ts` (shared interfaces)

### Modified files
- `server/src/lib/llm-provider.ts` (already exists, may need updates)
- `server/src/lib/llm.ts` (already exists, may need updates)
- `server/src/routes/coach.ts` (new pipeline entry point)
- `app/src/components/RightPanel.tsx` (new panel types)
- `app/src/hooks/useAgent.ts` (new SSE event types)

### Deprecated (remove after v2 stable)
- `server/src/agent/loop.ts` (replaced by pipeline.ts)
- `server/src/agent/tool-executor.ts` (tools become agents)
- `server/src/agent/tool-schemas.ts` (agents have typed interfaces)
- `server/src/agent/system-prompt.ts` (each agent has its own prompt)
- `server/src/agent/tools/*.ts` (10+ tool files → 7 agent files)

---

## Key Design Principles

1. **Agents are stateless.** JSON in, JSON out. No shared memory, no conversation history between agents.
2. **The Architect is the brain.** It makes ALL strategic decisions. Every other agent either extracts data (upstream) or executes instructions (downstream).
3. **Evidence integrity is non-negotiable.** No metric in the final resume should exist without a traceable source in the evidence library.
4. **User reviews at two gates:** Architect blueprint (strategy) and Section Writer output (execution). Everything else is automatic.
5. **Why Me data is persistent.** The most valuable extraction (positioning profile) survives across sessions and is user-editable.
6. **Seniority-adaptive.** Question framing, section strategy, and quality criteria adjust based on detected seniority level.
7. **Age-protective by default.** Every agent in the pipeline considers age-bias signals. The Architect makes explicit age-protection decisions. The Quality Reviewer verifies they were applied.
