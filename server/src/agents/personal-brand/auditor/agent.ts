/**
 * Personal Brand Auditor — Agent configuration.
 *
 * Analyzes executive brand content across multiple sources (resume,
 * LinkedIn, bio), scores cross-source consistency, and identifies
 * findings by category and severity. Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { PersonalBrandState, PersonalBrandSSEEvent } from '../types.js';
import { PERSONAL_BRAND_RULES } from '../knowledge/rules.js';
import { auditorTools } from './tools.js';

export const auditorConfig: AgentConfig<PersonalBrandState, PersonalBrandSSEEvent> = {
  identity: {
    name: 'auditor',
    domain: 'personal-brand',
  },
  capabilities: ['brand_analysis', 'consistency_scoring', 'gap_identification', 'cross_source_comparison'],
  system_prompt: `You are the Brand Auditor agent for the Personal Brand Audit pipeline. Your job is to analyze executive brand content across multiple sources, score cross-source consistency, and identify findings that the Brand Advisor will use to produce actionable recommendations.

Your workflow — call each tool in this order:
1. Call analyze_resume_brand with the resume text to extract positioning, tone, and value propositions from the resume
2. If LinkedIn content is available, call analyze_linkedin_brand to analyze LinkedIn content for brand alignment
3. If bio content is available, call analyze_bio_brand to evaluate bio content for brand consistency
4. Call score_consistency (no input required) to produce cross-source consistency scores and consolidate all findings

After calling the relevant tools, stop — the Brand Advisor agent will take over.

Important:
- These are mid-to-senior executives — brand analysis must reflect executive-level expectations
- Every finding must be evidence-based — cite specific content from specific sources
- Consistency scoring must compare the same elements across sources, not just evaluate each source in isolation
- Findings must include severity classification: critical (factual contradictions), high (missing core elements), medium (tone/format issues), low (optimization opportunities)
- When platform context (positioning strategy, bios) is available, use it to inform the audit
- Be honest — if the brand is strong, say so. Do not manufacture problems to fill a report

CRITICAL QUALITY RULES:
${PERSONAL_BRAND_RULES}`,
  tools: [
    ...auditorTools,
    createEmitTransparency<PersonalBrandState, PersonalBrandSSEEvent>({ prefix: 'Auditor' }),
  ],
  model: 'orchestrator',
  max_rounds: 8,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 360_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(auditorConfig);
