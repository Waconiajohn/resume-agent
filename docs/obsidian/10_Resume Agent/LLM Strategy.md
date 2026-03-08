# LLM Strategy

> Source: Google Drive — `llm-strategy-cost-optimization.docx`, `platform-intelligence-architecture.docx`

## Core Thesis

"Intelligence lives in the rules, not the model." Investing 20-40 hours per agent in rules documents enables cheap models to match frontier quality, achieving 90%+ gross margins.

**Cost impact:** Without rules engineering: $0.50-$2.00/session. With: $0.05-$0.25/session. At 100K users, that's $960K/month saved.

## Provider Strategy

| Priority | Provider | Role |
|----------|----------|------|
| Primary | Groq | LPU inference, lowest latency |
| Secondary | Z.AI | Multi-model, discounted rates |
| Tertiary | Anthropic | Claude for complex tasks |
| Failover | OpenAI | Redundancy |
| Emerging | Open-source (Llama, Mistral) | Cost reduction via fine-tuning |

Health check every 60 seconds, automatic failover.

## Four-Tier Model Routing

| Tier | Use Cases | Target Cost |
|------|-----------|-------------|
| PRIMARY | Section writing, positioning, adversarial review | Highest |
| MID | Gap analysis, benchmarking, structured generation | Mid |
| ORCHESTRATOR | Pipeline routing, agent loop reasoning | Low |
| LIGHT | Classification, scoring, extraction | Lowest |

Each tier downgrade reduces per-stage cost by 10-20x.

## Five Cost Optimization Techniques

1. **Rules Engineering (80-90% reduction)** — 20-40 hours per agent, one-time
2. **RAG-Based Context Reduction (30-50% token savings)** — retrieve only relevant rules per task
3. **Response Caching (15-25% reduction)** — boolean expansions, company research, templates
4. **Prompt Compression (10-15% token savings)** — remove redundancy, optimize formatting
5. **Batch Processing** — non-urgent tasks during off-peak hours

## Cost Projections

| Users | Sessions/Mo | LLM Cost/Mo | Revenue/Mo | LLM % of Revenue |
|-------|-------------|-------------|------------|-----------------|
| 100 | 2,000 | $200-500 | $7,900 | 3-6% |
| 1,000 | 20,000 | $2K-5K | $79,000 | 3-6% |
| 10,000 | 200,000 | $20K-50K | $790,000 | 3-6% |
| 50,000 | 1,000,000 | $100K-250K | $3,950,000 | 3-6% |

Consistent 3-6% LLM-cost-to-revenue ratio at all scale points.

## Three-Tier RAG Architecture

1. **Naive RAG (now)** — Supabase pgvector, chunk rules documents, 30-50% token reduction
2. **Graph RAG (Phase 2)** — Neo4j or Postgres graph layer, cross-agent intelligence
3. **Agentic RAG (Phase 3)** — Autonomous retrieval agent reasons about what's needed

## Rules Engineering Methodology (7 steps)

1. Perplexity deep research (4-8 hours)
2. Multi-source compilation (2-3 hours)
3. AI distillation via Claude/ChatGPT (2-4 hours)
4. Proprietary methodology overlay (3-6 hours)
5. Machine-optimized structuring with priority levels (2-4 hours)
6. Validation testing against golden test sets (4-8 hours)
7. Quarterly refresh (3-6 hours per cycle)

## Fine-Tuning Roadmap

- Months 1-6: Data collection (every session produces training data)
- Months 6-9: Quality curation (10,000+ examples per agent)
- Months 9-12: Fine-tuning experiments (Llama, Mistral on curated data)
- Estimate: additional 50-70% cost reduction beyond rules engineering

## Related

- [[Model Routing]]
- [[Quality Framework]]
- Google Drive: `llm-strategy-cost-optimization.docx`

#type/spec #status/done
