# Agent #3: Interview Prep

**Type:** 2-agent pipeline
**Domain:** `interview-prep`
**Feature Flag:** `FF_INTERVIEW_PREP`
**Code:** `server/src/agents/interview-prep/`
**Interactive:** No (autonomous)

## Sub-agents

### Researcher
Resume parsing, JD analysis, company research, interview question sourcing.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `parse_inputs` | No LLM | Parse resume and JD |
| `research_company` | LIGHT/Perplexity | Company background research |
| `find_interview_questions` | LIGHT/Perplexity | Source likely interview questions |

### Writer
Interview prep report writing, career story building, section assembly.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_section` | PRIMARY | Write report sections |
| `self_review_section` | MID | Quality check |
| `build_career_story` | PRIMARY | Craft narrative from experience |
| `assemble_report` | PRIMARY | Compile final report |

## Knowledge Rules

- 11+ rules covering audience, structure, quality, STAR method
- 9 mandatory report sections: company research, elevator pitch, role fit, technical Q&A, behavioral Q&A, 3-2-1 strategy, why-me story, 30-60-90 plan, final tips

## Mock Interview Simulation Sub-Product

**Code:** `server/src/agents/interview-prep/simulation/`
**Domain:** `mock-interview`

An interactive simulation product built alongside Interview Prep. The Interviewer agent presents questions one at a time, pauses for user answers (one gate per question), evaluates each answer against the STAR framework, and delivers a performance summary.

### Modes
- `full` — 6 questions, full STAR evaluation per answer
- `practice` — 1 question, for quick skill practice

### Pipeline
Single agent (`interviewer`) with gate-per-question pattern. State is preserved across gates via `MockInterviewState`.

### Interviewer Tools

| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `generate_question` | MID | Generate the next interview question tailored to the resume, JD, company, and platform context. Types: behavioral/technical/situational. |
| `evaluate_answer` | MID | Evaluate the user's answer against STAR framework. Scores: star_completeness (0-100), relevance (0-100), impact (0-100), specificity (0-100). Returns overall_score, strengths[], improvements[], model_answer_hint?. |
| `build_summary` | MID | Compile final performance summary across all questions. Returns overall_score, strengths[], areas_for_improvement[], recommendation. |

### SSE Events (Simulation)

| Event | Fields |
|-------|--------|
| `question_presented` | question: InterviewQuestion |
| `answer_evaluated` | evaluation: AnswerEvaluation |
| `simulation_complete` | session_id, summary: MockInterviewState['final_summary'] |

### Cross-Product Context
Reads `positioning_strategy`, `why_me_story`, and `evidence_items` from platform context to generate JD-targeted questions that draw on the user's proven experience.

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[Salary Negotiation]] — counter-offer simulation follows the same gate-per-round pattern

#agent/interview-prep #status/done
