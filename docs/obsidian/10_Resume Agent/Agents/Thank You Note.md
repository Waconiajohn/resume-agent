# Agent #18: Thank You Note Writer

**Type:** 1-agent pipeline
**Domain:** `thank-you-note`
**Feature Flag:** `FF_THANK_YOU_NOTE`
**Code:** `server/src/agents/thank-you-note/`
**Interactive:** No (autonomous)

## Sub-agents

### Writer
Interview context analysis and personalized thank-you note generation.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_interview_context` | MID | Analyze interview details and rapport |
| `write_thank_you_note` | PRIMARY | Draft thank-you note |
| `personalize_per_interviewer` | MID | Customize per interviewer role |
| `assemble_note_set` | No LLM | Compile all notes |

## Knowledge Rules

- Thank-you note etiquette
- Personalization per interviewer role
- Tone and formality standards
- 7 knowledge rules total

## Output

Personalized thank-you notes per interviewer in multiple formats:
- Email
- Handwritten
- LinkedIn message

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]

#agent/thank-you-note
