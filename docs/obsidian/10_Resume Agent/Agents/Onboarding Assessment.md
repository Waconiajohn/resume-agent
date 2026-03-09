# Agent: Onboarding Assessment

**Type:** 1-agent pipeline (with user gate)
**Domain:** `onboarding`
**Feature Flag:** `FF_ONBOARDING`
**Code:** `server/src/agents/onboarding/`
**Interactive:** Yes (gate-based: questions -> user responds -> profile built)
**Phase:** 1A of CareerIQ Master Build Plan

## Sub-agents

### Assessor
Conducts a 3-5 question assessment, detects financial segment from indirect signals, maps emotional state to grief cycle, and builds a Client Profile that flows to every downstream agent.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `generate_questions` | MID | Create personalized assessment questions |
| `evaluate_responses` | MID | Analyze answers for career and emotional signals |
| `detect_financial_segment` | LIGHT | Classify financial segment from indirect cues |
| `build_client_profile` | MID | Synthesize all data into Client Profile |

## Knowledge Rules

7 rules governing assessment philosophy, question design, financial detection (indirect only), emotional baseline mapping (grief cycle), client profile construction, coaching tone selection, and self-review standards.

Key constraints:
- 3-5 questions maximum
- Financial segment inferred, never asked directly
- Emotional state stored internally, never shown to user
- Default to 'ideal' financial segment when ambiguous
- Minimum 2 signals required for non-ideal segments

## Gate Protocol

1. Agent generates questions -> emits `questions_ready` SSE event
2. Pipeline pauses at `onboarding_assessment` gate
3. User answers questions in frontend
4. Frontend responds via POST `/api/onboarding/respond` with `Record<string, string>`
5. Agent resumes: evaluates responses -> detects segment -> builds profile

## Output

**Client Profile** (stored in `user_platform_context` as `client_profile` type):
- Career level, industry, years of experience
- Financial segment (crisis/stressed/ideal/comfortable)
- Emotional state (grief cycle mapping)
- Transition type (involuntary/voluntary/preemptive)
- Goals, constraints, self-reported strengths
- Urgency score (1-10)
- Recommended starting point (resume/linkedin/networking/interview_prep/career_exploration)
- Coaching tone (supportive/direct/motivational)

## Cross-Product Impact

The Client Profile is the foundation for all downstream agents. Every agent's `buildAgentMessage` should read `client_profile` from platform context and adapt:
- **Coaching tone**: supportive for crisis/stressed, direct for ideal, motivational for growth
- **Pacing**: faster for high-urgency, more exploratory for low-urgency
- **Starting point**: determines which product to recommend first

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[Platform Blueprint]]
- [[Coaching Methodology]]

#agent/onboarding #status/done #sprint/37
