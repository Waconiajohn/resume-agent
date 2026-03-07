# Model Routing

> Canonical source: `server/src/lib/llm.ts`

## Tier System

All tools route to cost-appropriate models via `getModelForTool()` in `llm.ts`. Agent loops always use MODEL_ORCHESTRATOR.

### Groq (Primary -- `LLM_PROVIDER=groq`)

| Tier | Model | Cost (in/out per M) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | llama-3.3-70b-versatile | $0.59/$0.79 | Section writing, adversarial review, synthesis |
| MID | llama-4-scout-17b-16e-instruct | $0.11/$0.34 | Self-review, benchmarking, gap analysis |
| ORCHESTRATOR | llama-3.3-70b-versatile | $0.59/$0.79 | Agent loop reasoning (all agents) |
| LIGHT | llama-3.1-8b-instant | $0.05/$0.08 | Text extraction, JD analysis |

Estimated pipeline cost: ~$0.08/pipeline. Pipeline time: ~1m42s.

### Z.AI (Fallback -- `LLM_PROVIDER=zai`)

| Tier | Model | Cost (in/out per M) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | glm-4.7 | $0.60/$2.20 | Section writing, adversarial review |
| MID | glm-4.5-air | $0.20/$1.10 | Benchmarking, classify_fit |
| ORCHESTRATOR | glm-4.7-flashx | $0.07/$0.40 | Agent loop reasoning |
| LIGHT | glm-4.7-flash | FREE | JD analysis, research |

Estimated pipeline cost: ~$0.26/pipeline. Pipeline time: 15-30 min.

## Tool-to-Tier Mapping

Most tools follow this pattern:
- **Writing/synthesis tools** -> MODEL_PRIMARY (highest quality)
- **Analysis/scoring tools** -> MODEL_MID (good balance)
- **Extraction/parsing tools** -> MODEL_LIGHT (fast, cheap)
- **No-LLM tools** (check_keyword_coverage, check_anti_patterns, present_to_user, assemble_*) -> no model call

## Related

- [[Architecture Overview]]
- [[Project Hub]]

#type/spec
