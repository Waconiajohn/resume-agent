# Quality Framework

> Source: Google Drive — `quality-assurance-framework.docx`, `prompt-engineering-playbook.docx`

## Quality Standard

"Would a senior career coach with 19 years of experience approve this output for delivery to a paying client?"

## Three Quality Gates

1. **Rules Compliance (Automated)** -- Binary pass/block. Rules loaded, context available, required inputs present.
2. **Self-Review (Agent-Internal)** -- Post-generation review against 5 dimensions. Adds 15-20% token usage. Already implemented in Resume Craftsman.
3. **Hiring Manager Gauntlet (Resume/LinkedIn only)** -- Adversarial reviewer persona with 300 resumes, looking for reasons to reject.

## Five Quality Dimensions

| Dimension | Score 1 (Fail) | Score 3 (Acceptable) | Score 5 (Excellent) |
|-----------|---------------|---------------------|---------------------|
| Accuracy | Fabrication | All facts correct | Surgically precise |
| Strategic Quality | Wrong positioning | Sound strategy | Benchmark-level |
| Voice Compliance | Generic AI voice | Consistent | Indistinguishable from founder |
| Completeness | Major gaps | Complete | Exceeds expectations |
| Actionability | No next step | Clear next step | Action with why + how |

**Thresholds:** Any dimension at 1 = automatic fail. Average below 3.0 = immediate prompt revision. Production target: 4.0+.

## Golden Test Cases

- 50-100 per agent, expert-rated
- Founder approves every test case and every update
- Must cover: 20+ year careers, career changers, employment gaps, imposter syndrome, international experience, C-suite targeting
- Minimum cases: Resume 20, LinkedIn 12, Interview Prep 15, Networking 10, Financial Wellness 8, Job Search 10

## Eight Failure Modes

1. **Hallucination/Fabrication** -- Cross-reference output against input
2. **Generic Output** -- Min 3 user-specific references per 100 words
3. **Voice Drift** -- Mid-conversation voice reinforcement
4. **Toxic Positivity** -- Match user's emotional register
5. **Over-Promising** -- Keyword scan for guarantee language
6. **Scope Creep** -- Cross-domain boundary monitoring
7. **Context Amnesia** -- Context utilization rate tracking (flag below 80%)
8. **Analysis Paralysis** -- End with single clear recommended action

## Production Monitoring

- Error rate > 2%/hour triggers alert
- Response time > 30s triggers alert
- Daily: 10 random interactions per agent, auto-scored
- Weekly: cohort analysis by career level, industry, unemployment length, tier

## Agent Quality Thresholds (Operations)

| Metric | Target | Alert |
|--------|--------|-------|
| Session completion rate | 85%+ | Below 80% |
| User edit rate | Below 30% | Above 40% |
| Regeneration rate | Below 15% | Above 20% |

## Prompt Engineering (8-Section Template)

Every agent system prompt follows this architecture:

1. **Identity and Role** (200-400 tokens)
2. **Voice and Personality** (300-500 tokens)
3. **Methodology Foundation** (500-1,500 tokens)
4. **Rules Document** (2,000-8,000 tokens) -- the heart
5. **Input Processing** (300-600 tokens)
6. **Output Format** (200-500 tokens)
7. **Quality Self-Review** (300-500 tokens)
8. **Constraints and Guardrails** (400-800 tokens)

Total: 4,000-12,000 tokens. Resume Agent (most complex): 10,000-12,000.

## Pre-Deployment Testing (6 phases)

1. Smoke Test: 100% completion on 10 inputs
2. Golden Test Regression: all cases 3.0+ avg
3. Voice Compliance Scan: zero blacklisted terms
4. Edge Case Battery: graceful handling
5. Founder Review: 8 outputs approved
6. Cost Validation: $0.05-$0.25/session

## Related

- [[Voice Guide]]
- [[Coaching Methodology]]
- [[Model Routing]]
- Google Drive: `quality-assurance-framework.docx`, `prompt-engineering-playbook.docx`

#type/spec #status/done
