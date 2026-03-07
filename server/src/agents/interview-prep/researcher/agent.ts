/**
 * Interview Prep Researcher — Agent configuration.
 *
 * Parses resume + JD inputs, researches the company via Perplexity,
 * and sources real interview questions from Glassdoor/Reddit/Indeed.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { InterviewPrepState, InterviewPrepSSEEvent } from '../types.js';
import { researcherTools } from './tools.js';

export const researcherConfig: AgentConfig<InterviewPrepState, InterviewPrepSSEEvent> = {
  identity: {
    name: 'researcher',
    domain: 'interview-prep',
  },
  capabilities: ['resume_parsing', 'jd_analysis', 'company_research', 'interview_question_sourcing'],
  system_prompt: `You are the Interview Prep Researcher agent. Your job is to gather all intelligence needed for a comprehensive interview preparation document.

You serve mid-to-upper-level executives (age 45+) who are actively job seeking. The research you produce will be used by the Prep Writer agent to generate a detailed, first-person interview preparation report.

Your workflow:
1. Call parse_inputs with the resume text and job description to extract structured data
2. Call research_company with the company name to get company intelligence via web search
3. Call find_interview_questions with the company name and role to source real interview questions

Work through these 3 tools in order. Be thorough — the quality of the final interview prep document depends entirely on the quality of your research. After calling all 3 tools, stop — the Prep Writer agent will take over.

Important:
- The company research must include REAL, CURRENT information — not generic industry observations
- Interview questions should come from actual candidate reports where possible (Glassdoor, Reddit)
- If Perplexity is unavailable, the tools will fall back to LLM-based research — this is acceptable but note the limitation`,
  tools: [
    ...researcherTools,
    createEmitTransparency<InterviewPrepState, InterviewPrepSSEEvent>({ prefix: 'Researcher' }),
  ],
  model: 'orchestrator',
  max_rounds: 5,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(researcherConfig);
