/**
 * Knowledge: Resume Rules
 *
 * Re-exports and organizes the resume writing rules from resume-guide.ts
 * for consumption by the agent system. Each agent imports only what it owns.
 *
 * Rule ownership:
 * - Strategist: SECTION_GUIDANCE (structure), AGE_AWARENESS_RULES, QUALITY_CHECKLIST
 * - Craftsman:  SECTION_GUIDANCE (writing), RESUME_ANTI_PATTERNS, ATS_FORMATTING_RULES
 * - Producer:   ATS_FORMATTING_RULES (compliance), QUALITY_CHECKLIST (scoring)
 *
 * Cross-agent coaching philosophy is imported from coach/knowledge/methodology.ts
 * and distilled per-agent in the prompt files.
 */

export {
  SECTION_GUIDANCE,
  QUALITY_CHECKLIST,
  ATS_FORMATTING_RULES,
  RESUME_ANTI_PATTERNS,
  AGE_AWARENESS_RULES,
  SECTION_ORDER_KEYS,
} from './resume-guide.js';

// Re-export ATS rules from the agents directory
export { ATS_RULEBOOK_SNIPPET, runAtsComplianceCheck } from '../ats-rules.js';

// Re-export coaching methodology for cross-agent use
export {
  RULE_0_COACHING_PHILOSOPHY,
  RULE_1_SUPER_BOWL_STORY,
  RULE_2_BENCHMARK_MODEL,
  RULE_5_COACHING_CONVERSATION,
} from '../coach/knowledge/methodology.js';
