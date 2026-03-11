# Sprint A1: Agent Intelligence Enhancement

**Goal:** Inject coaching philosophy, emotional baseline awareness, Why Me throughline, and stronger analytical prompts across all agents.
**Started:** 2026-03-10
**Audit Reference:** Agent Intelligence Audit (Session 76)

## Stories This Sprint

### Story A1: Inject Coaching Philosophy Into Core Agents [LARGE]
- **As a** resume pipeline
- **I want to** have coaching methodology principles woven into Strategist, Craftsman, and Producer prompts
- **So that** agents understand The 1% Problem, Super Bowl Story, and Benchmark Model as their mission
- **Acceptance Criteria:**
  - [x] Strategist prompt includes RULE_0 (1% Problem) and RULE_1 (Super Bowl Story) as mission framing
  - [x] Craftsman prompt includes RULE_5 (client's language) and RULE_2 (benchmark positioning) as writing philosophy
  - [x] Producer prompt includes RULE_2 (benchmark test) as quality evaluation criteria
  - [x] knowledge/rules.ts exports coaching methodology rules for cross-agent use
  - [x] tsc clean
- **Status:** done

### Story A2: Activate Emotional Baseline in System Prompts [MEDIUM]
- **As a** pipeline agent
- **I want to** know how to USE the emotional baseline guidance appended to my messages
- **So that** I adapt interview depth, writing warmth, and feedback tone to the candidate's state
- **Acceptance Criteria:**
  - [x] Strategist prompt instructs agent to read and apply emotional baseline
  - [x] Craftsman prompt instructs agent to adapt language warmth
  - [x] Producer prompt instructs agent to calibrate feedback tone
  - [x] tsc clean
- **Status:** done

### Story A3: Make "Why Me" the Strategic Throughline [MEDIUM]
- **As a** candidate
- **I want to** have my Why Me narrative anchored throughout all outputs
- **So that** every product reinforces my authentic positioning story
- **Acceptance Criteria:**
  - [x] Strategist prompt explicitly goals surfacing the Why Me narrative
  - [x] Craftsman prompt directs anchoring authenticity in the Why Me story
  - [x] tsc clean
- **Status:** done

### Story A4: Formalize Rules for Underserved Agents [MEDIUM]
- **As a** cover letter and linkedin content agent
- **I want to** have formal rules files like other mature agents
- **So that** my outputs follow coaching philosophy and quality standards
- **Acceptance Criteria:**
  - [x] `cover-letter/knowledge/rules.ts` created with 6-8 rules
  - [x] `linkedin-content/knowledge/rules.ts` created with 6-8 rules
  - [x] `job-finder/knowledge/rules.ts` created with 5-7 rules
  - [x] AGE_AWARENESS_RULES extended to executive-bio, case-study, linkedin-optimizer, cover-letter agent prompts
  - [x] tsc clean
- **Status:** done

### Story A5: Strengthen Analytical Tool Prompts [SMALL]
- **As a** quality review tool
- **I want to** have specific evaluation criteria with examples
- **So that** analytical reviews are as strong as creative writing prompts
- **Acceptance Criteria:**
  - [x] adversarial_review (quality-reviewer.ts) prompt strengthened with specific evaluation criteria
  - [x] humanize_check prompt enhanced with AI-pattern examples
  - [x] self_review_section prompt enhanced with quality dimension rubric
  - [x] tsc clean
- **Status:** done

## Out of Scope (Explicitly)
- Inter-agent communication expansion (AgentBus bidirectional flows)
- Cross-product context sharing (needs platform context graph design)
- New agent creation
- Tool additions
