# Agent #2: Cover Letter

**Type:** 2-agent pipeline
**Domain:** `cover-letter`
**Code:** `server/src/agents/cover-letter/`
**Interactive:** No (autonomous)

## Sub-agents

### Analyst
Analyzes resume and job description to identify key positioning angles for the cover letter.

### Writer
Writes the cover letter using analyst findings and platform context.

## Notes

- First non-resume product built as POC to validate the ProductConfig abstraction
- Validates that the generic runtime works for products beyond resume
- Loads platform context from resume pipeline (positioning strategy, evidence)

## Related

- [[Project Hub]]
- [[Platform Blueprint]]

#agent/cover-letter
