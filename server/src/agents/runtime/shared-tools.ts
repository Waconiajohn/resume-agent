/**
 * Shared Tools — Reusable tool factories for the multi-agent system.
 *
 * These factories produce AgentTool instances that are domain-agnostic.
 * Each factory accepts optional configuration to allow per-agent customization
 * (e.g., a message prefix) while keeping behavior consistent across agents.
 *
 * Usage (in each agent's tools.ts):
 * ```ts
 * import { createEmitTransparency, createParseResumeInputs, createSelfReview } from '../runtime/shared-tools.js';
 * import type { MyState, MySSEEvent } from '../types.js';
 *
 * const emitTransparencyTool = createEmitTransparency<MyState, MySSEEvent>();
 * // Producer variant:
 * const emitTransparencyTool = createEmitTransparency<MyState, MySSEEvent>({ prefix: 'Producer: ' });
 *
 * // Resume parser — stores result in state.resume_data (or a custom key):
 * const parseInputsTool = createParseResumeInputs<MyState, MySSEEvent>();
 *
 * // Self-review with custom dimensions:
 * const selfReviewTool = createSelfReview<MyState, MySSEEvent>({
 *   name: 'self_review_section',
 *   description: 'Review the section quality.',
 *   contentField: 'section_draft',
 *   dimensions: ['Quantified impact', 'Action verbs', 'Relevance'],
 *   scoreScratchpadKey: 'review_scores',
 * });
 * ```
 */

import type { AgentTool, BaseState, BaseEvent, AgentContext } from './agent-protocol.js';
import { llm, MODEL_LIGHT, MODEL_MID } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';

// ─── Re-export base types for factory consumers ───────────────────────
export type { BaseState, BaseEvent, AgentContext };

// ─── emit_transparency factory ────────────────────────────────────────

/**
 * Configuration for the emit_transparency tool factory.
 */
export interface EmitTransparencyConfig {
  /**
   * Optional prefix added to every outgoing message.
   * Example: `"Producer: "` causes `"Reviewing ATS compliance..."` to be
   * emitted as `"Producer: Reviewing ATS compliance..."`.
   */
  prefix?: string;
}

/**
 * Create an `emit_transparency` tool for any agent.
 *
 * Domain-agnostic: works with any state/event types that expose a `current_stage`
 * field on state and accept a `{ type: 'transparency', message, stage }` event.
 *
 * Returns `{ success: false, reason }` on empty input (guard against LLM no-ops).
 * Returns `{ emitted: true, message }` on success.
 */
export function createEmitTransparency<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config?: EmitTransparencyConfig): AgentTool<TState, TEvent> {
  const prefix = config?.prefix ?? '';

  return {
    name: 'emit_transparency',
    description:
      'Emit a transparency SSE event to inform the user what the agent is currently doing. ' +
      'Call this before starting major operations so the user sees live progress.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Human-readable status message describing the current action.',
        },
      },
      required: ['message'],
    },
    model_tier: 'orchestrator',
    async execute(
      input: Record<string, unknown>,
      ctx: AgentContext<TState, TEvent>,
    ): Promise<unknown> {
      const raw = String(input.message ?? '');
      if (!raw.trim()) {
        return { success: false, reason: 'message is empty' };
      }

      const message = prefix ? `${prefix}${raw}` : raw;

      // Cast to Record to read current_stage without constraining TState shape.
      const state = ctx.getState() as Record<string, unknown>;

      ctx.emit({
        type: 'transparency',
        message,
        stage: state['current_stage'],
      } as unknown as TEvent);

      return { emitted: true, message };
    },
  };
}

// ─── createParseResumeInputs factory ─────────────────────────────────

/**
 * Parsed resume profile — the standard shape extracted from raw resume text.
 * Identical to the inline objects built in interview-prep, linkedin-optimizer,
 * and networking-outreach researcher tools.
 */
export interface ParsedResumeProfile {
  name: string;
  current_title: string;
  career_summary: string;
  key_skills: string[];
  key_achievements: string[];
  work_history: Array<{
    company: string;
    title: string;
    duration: string;
    highlights: string[];
  }>;
}

/**
 * Configuration for the createParseResumeInputs factory.
 */
export interface ParseResumeInputsConfig {
  /**
   * State key under which the parsed profile is stored via `updateState()`.
   * Defaults to `'resume_data'`.
   *
   * The factory calls `ctx.updateState({ [stateKey]: parsed })` so the result
   * is accessible to downstream tools via `ctx.getState()[stateKey]`.
   */
  stateKey?: string;

  /**
   * Additional top-level fields to request from the LLM.
   * Each string becomes an extra `"fieldName": "description"` line in the
   * extraction prompt.  The factory makes a best-effort attempt but does not
   * validate these fields — callers should validate them after the tool runs.
   *
   * Example: `['industry', 'years_of_experience']`
   */
  additionalFields?: string[];
}

/**
 * The standard fallback returned when the LLM response cannot be parsed.
 */
const RESUME_PARSE_FALLBACK: ParsedResumeProfile = {
  name: 'Candidate',
  current_title: 'Professional',
  career_summary: '',
  key_skills: [],
  key_achievements: [],
  work_history: [],
};

/**
 * Create a `parse_resume_inputs` tool for any agent that needs to extract
 * structured candidate data from raw resume text.
 *
 * The same LLM prompt + repairJSON + fallback pattern was duplicated across
 * interview-prep, linkedin-optimizer, and networking-outreach.  This factory
 * centralises it so new agents get the behaviour for free.
 *
 * Model tier: `light` — text extraction does not require a large model.
 *
 * The tool:
 * 1. Calls MODEL_LIGHT to extract the standard candidate profile fields.
 * 2. Runs `repairJSON` on the response.
 * 3. On success, calls `ctx.updateState({ [stateKey]: parsed })` and emits
 *    a transparency event.
 * 4. On parse failure, stores and returns the typed fallback.
 *
 * Returns `{ success: true, candidate_name, skills_count, work_history_count }` or
 * `{ success: false, reason }` when resume_text is empty.
 */
export function createParseResumeInputs<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config?: ParseResumeInputsConfig): AgentTool<TState, TEvent> {
  const stateKey = config?.stateKey ?? 'resume_data';

  // Build the extra-fields block for the prompt (may be empty)
  const extraFieldLines =
    config?.additionalFields && config.additionalFields.length > 0
      ? config.additionalFields.map(f => `  "${f}": "extracted value for ${f}"`).join(',\n') + ','
      : '';

  return {
    name: 'parse_resume_inputs',
    description:
      'Parse raw resume text into structured candidate data. ' +
      'Extracts name, current title, career summary, key skills, key achievements, ' +
      'and work history. ' +
      'Call this first before tools that need structured resume data.',
    model_tier: 'light',
    input_schema: {
      type: 'object',
      properties: {
        resume_text: {
          type: 'string',
          description: 'Raw resume text to parse',
        },
      },
      required: ['resume_text'],
    },

    async execute(
      input: Record<string, unknown>,
      ctx: AgentContext<TState, TEvent>,
    ): Promise<unknown> {
      const resumeText = String(input.resume_text ?? '').trim();

      if (!resumeText) {
        return { success: false, reason: 'resume_text is empty — provide the raw resume text' };
      }

      // Emit transparency before the LLM call so the user sees progress
      const state = ctx.getState() as Record<string, unknown>;
      ctx.emit({
        type: 'transparency',
        stage: state['current_stage'],
        message: 'Parsing candidate resume...',
      } as unknown as TEvent);

      const promptLines = [
        'Extract the following from this resume and return as JSON:',
        '{',
        extraFieldLines,
        '  "name": "Full Name",',
        '  "current_title": "Most recent job title",',
        '  "career_summary": "2-3 sentence career summary",',
        '  "key_skills": ["skill1", "skill2"],',
        '  "key_achievements": ["achievement with metrics if available"],',
        '  "work_history": [',
        '    {',
        '      "company": "Company Name",',
        '      "title": "Job Title",',
        '      "duration": "Start - End",',
        '      "highlights": ["key accomplishment 1", "key accomplishment 2"]',
        '    }',
        '  ]',
        '}',
        '',
        'Resume:',
        resumeText,
      ].join('\n');

      const response = await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 4096,
        system:
          'You extract structured data from resumes. ' +
          'Return ONLY valid JSON, no comments, no markdown fencing.',
        messages: [{ role: 'user', content: promptLines }],
        signal: ctx.signal,
        session_id: ctx.sessionId,
      });

      let parsed: ParsedResumeProfile;
      const raw = repairJSON<Record<string, unknown>>(response.text ?? '');

      if (!raw) {
        logger.warn(
          { tool: 'parse_resume_inputs', sessionId: ctx.sessionId },
          'repairJSON returned null — using fallback resume profile',
        );
        parsed = { ...RESUME_PARSE_FALLBACK };
      } else {
        // Coerce to ParsedResumeProfile — callers trust the LLM but we ensure
        // arrays are always arrays so downstream tools don't crash on `.map()`.
        parsed = {
          name: typeof raw.name === 'string' ? raw.name : 'Candidate',
          current_title: typeof raw.current_title === 'string' ? raw.current_title : 'Professional',
          career_summary: typeof raw.career_summary === 'string' ? raw.career_summary : '',
          key_skills: Array.isArray(raw.key_skills) ? (raw.key_skills as string[]) : [],
          key_achievements: Array.isArray(raw.key_achievements) ? (raw.key_achievements as string[]) : [],
          work_history: Array.isArray(raw.work_history)
            ? (raw.work_history as ParsedResumeProfile['work_history'])
            : [],
          // Spread any extra fields requested by the caller so they appear in state
          ...Object.fromEntries(
            (config?.additionalFields ?? [])
              .filter(f => f in raw)
              .map(f => [f, raw[f]]),
          ),
        };
      }

      // Persist to state using the configured key
      ctx.updateState({ [stateKey]: parsed } as Partial<TState>);

      ctx.emit({
        type: 'transparency',
        stage: state['current_stage'],
        message: `Parsed resume for ${parsed.name} — ${parsed.key_skills.length} skills, ${parsed.work_history.length} roles`,
      } as unknown as TEvent);

      return {
        success: true,
        candidate_name: parsed.name,
        current_title: parsed.current_title,
        skills_count: parsed.key_skills.length,
        work_history_count: parsed.work_history.length,
      };
    },
  };
}

// ─── createSelfReview factory ─────────────────────────────────────────

/**
 * The structured output produced by any self-review tool created via this factory.
 */
export interface SelfReviewResult {
  passed: boolean;
  score: number;
  issues: string[];
  dimension_scores: Record<string, number>;
}

/**
 * Configuration for the createSelfReview factory.
 */
export interface SelfReviewConfig {
  /**
   * Tool name — e.g. `'self_review_section'` or `'self_review_post'`.
   */
  name: string;

  /**
   * Human-readable tool description shown to the LLM.
   */
  description: string;

  /**
   * Scratchpad key that holds the content string to review.
   * The tool reads `String(ctx.scratchpad[contentField] ?? '')`.
   *
   * Example: `'post_draft'` for LinkedIn posts, `'section_summary'` for resume sections.
   */
  contentField: string;

  /**
   * Domain-specific quality dimensions to evaluate.
   * Each dimension becomes a numbered criterion in the review prompt.
   *
   * Example for resume sections:
   *   ['Quantified impact (metrics, numbers)', 'Strong action verbs', 'ATS keyword presence']
   *
   * Example for LinkedIn posts:
   *   ['Hook strength (stops the scroll)', 'Authentic voice (no buzzwords)', 'Clear CTA']
   */
  dimensions: string[];

  /**
   * Optional checklist items appended after the dimensions.
   * Useful for rule-based checks that sit alongside quality dimensions.
   *
   * Example: QUALITY_CHECKLIST from resume-guide.ts
   */
  checklist?: string[];

  /**
   * Scratchpad key where the SelfReviewResult is stored.
   * Downstream tools can read this to decide whether to revise.
   *
   * Example: `'review_result'`, `'section_review_scores'`
   */
  scoreScratchpadKey: string;

  /**
   * Score threshold for `passed = true`. Defaults to 7.
   * The tool also applies: `passed = passed && issues.length <= 2`.
   */
  passThreshold?: number;
}

/**
 * Create a self-review tool that evaluates content against domain-specific
 * quality dimensions and stores structured scores in the scratchpad.
 *
 * The same MODEL_MID + structured score output + scratchpad storage pattern was
 * duplicated in craftsman/tools.ts (`self_review_section`) and
 * linkedin-content/writer/tools.ts (`self_review_post`).  This factory
 * centralises the pattern so any new agent gets the same behaviour.
 *
 * Model tier: `mid` — quality evaluation benefits from a mid-tier model.
 *
 * The tool:
 * 1. Reads `ctx.scratchpad[contentField]` as the text to review.
 * 2. Calls MODEL_MID with a prompt built from `dimensions` and `checklist`.
 * 3. Parses the response into `{ passed, score, issues, dimension_scores }`.
 * 4. Stores the result at `ctx.scratchpad[scoreScratchpadKey]`.
 * 5. Returns the result directly.
 *
 * Returns `{ success: false, reason }` if the content field is empty.
 */
export function createSelfReview<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config: SelfReviewConfig): AgentTool<TState, TEvent> {
  const passThreshold = config.passThreshold ?? 7;

  return {
    name: config.name,
    description: config.description,
    model_tier: 'mid',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The content to review. If not provided, the tool reads from the scratchpad ' +
            `field "${config.contentField}".`,
        },
      },
      required: [],
    },

    async execute(
      input: Record<string, unknown>,
      ctx: AgentContext<TState, TEvent>,
    ): Promise<unknown> {
      // Accept content from the LLM input OR fall back to scratchpad
      const content =
        typeof input.content === 'string' && input.content.trim()
          ? input.content
          : String(ctx.scratchpad[config.contentField] ?? '');

      if (!content.trim()) {
        return {
          success: false,
          reason: `No content to review — scratchpad["${config.contentField}"] is empty and no content was passed`,
        };
      }

      // Build dimension list for the prompt
      const dimensionLines = config.dimensions
        .map((d, i) => `${i + 1}. ${d}`)
        .join('\n');

      // Build optional checklist block
      const checklistBlock =
        config.checklist && config.checklist.length > 0
          ? '\n\nADDITIONAL CHECKLIST:\n' +
            config.checklist.map((c, i) => `${config.dimensions.length + i + 1}. ${c}`).join('\n')
          : '';

      const dimensionNames = config.dimensions.map((d, i) => `"dimension_${i + 1}"`).join(', ');

      const prompt = [
        'You are a quality reviewer. Evaluate the following content against the quality dimensions below.',
        '',
        '## CONTENT TO REVIEW',
        content,
        '',
        '## QUALITY DIMENSIONS',
        dimensionLines,
        checklistBlock,
        '',
        'For each dimension, score 0-10 (10 = fully meets the criterion).',
        'Then provide an overall score, a pass/fail verdict, and a list of specific actionable issues.',
        '',
        'Return ONLY valid JSON (no markdown fencing):',
        '{',
        `  "dimension_scores": { ${dimensionNames} },`,
        '  "score": 8,',
        '  "passed": true,',
        '  "issues": ["Specific actionable issue 1", "Specific actionable issue 2"]',
        '}',
        '',
        `Rules:`,
        `- passed = true only if score >= ${passThreshold} AND issues.length <= 2`,
        '- dimension_scores keys must use the format "dimension_1", "dimension_2", etc.',
        '- issues must be actionable revision instructions, not generic comments',
        '- Be strict — content with vague impact or passive language should score low',
      ].join('\n');

      const response = await llm.chat({
        model: MODEL_MID,
        max_tokens: 2048,
        system: 'You are a rigorous quality reviewer. Return only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        signal: ctx.signal,
        session_id: ctx.sessionId,
      });

      const raw = repairJSON<Record<string, unknown>>(response.text ?? '');

      // Build a typed fallback for parse failures
      const failFallback: SelfReviewResult = {
        passed: false,
        score: 0,
        issues: ['Quality review response could not be parsed — manual review recommended'],
        dimension_scores: {},
      };

      if (!raw) {
        logger.warn(
          { tool: config.name, sessionId: ctx.sessionId },
          'createSelfReview: repairJSON returned null — using fail fallback',
        );
        ctx.scratchpad[config.scoreScratchpadKey] = failFallback;
        return failFallback;
      }

      const rawScore = typeof raw.score === 'number' ? raw.score : Number(raw.score) || 0;
      const rawIssues = Array.isArray(raw.issues) ? (raw.issues as string[]) : [];
      const rawPassed =
        typeof raw.passed === 'boolean'
          ? raw.passed
          : rawScore >= passThreshold && rawIssues.length <= 2;

      // Coerce dimension_scores — keep whatever the LLM returned, fall back to {}
      const rawDimensionScores =
        raw.dimension_scores && typeof raw.dimension_scores === 'object' && !Array.isArray(raw.dimension_scores)
          ? (raw.dimension_scores as Record<string, number>)
          : {};

      const result: SelfReviewResult = {
        passed: rawPassed && rawIssues.length <= 2,
        score: rawScore,
        issues: rawIssues,
        dimension_scores: rawDimensionScores,
      };

      ctx.scratchpad[config.scoreScratchpadKey] = result;

      return result;
    },
  };
}

// ─── createAntiPatternCheck factory ──────────────────────────────────

/**
 * A single anti-pattern rule: a regex to test the content against, a
 * human-readable message to surface when the pattern matches, and a
 * penalty (in points out of 100) to deduct from the score.
 */
export interface AntiPattern {
  pattern: RegExp;
  message: string;
  /** Points to deduct from 100 when this pattern is found. */
  penalty: number;
}

/**
 * The output stored in the scratchpad and returned by the tool.
 */
export interface AntiPatternCheckResult {
  score: number;
  violations: Array<{ pattern: string; message: string }>;
  clean: boolean;
}

/**
 * Configuration for the createAntiPatternCheck factory.
 */
export interface AntiPatternCheckConfig {
  /**
   * Tool name — e.g. `'check_anti_patterns'` or `'check_outreach_quality'`.
   */
  name: string;

  /**
   * Human-readable tool description shown to the LLM.
   */
  description: string;

  /**
   * Ordered list of anti-pattern rules. Each pattern is tested against the
   * full content string. Penalties accumulate; the minimum score is 0.
   */
  patterns: AntiPattern[];

  /**
   * Scratchpad key from which the content string is read.
   * The tool reads `String(ctx.scratchpad[contentScratchpadKey] ?? '')`.
   *
   * Example: `'section_summary'` (resume) or `'post_draft'` (LinkedIn).
   */
  contentScratchpadKey: string;

  /**
   * Scratchpad key where the AntiPatternCheckResult is stored.
   * Downstream tools can read this to decide whether to revise.
   *
   * Example: `'anti_pattern_result'`, `'outreach_quality_result'`
   */
  scoreScratchpadKey: string;
}

/**
 * Create a tool that checks content against a list of regex anti-patterns.
 *
 * This factory centralises the penalty-based quality scoring that was duplicated
 * inline in the networking-outreach writer tools (inline regex checks on each
 * message body) and in craftsman/tools.ts (`check_anti_patterns`).  Any new
 * agent that needs fast, LLM-free content quality gating can use this factory.
 *
 * No LLM call — pure regex evaluation. Model tier: `orchestrator`
 * (tool decides whether to revise; the agent loop handles iteration).
 *
 * The tool:
 * 1. Reads `String(ctx.scratchpad[contentScratchpadKey] ?? '')`.
 * 2. Tests each `AntiPattern.pattern` against the content.
 * 3. Starts at 100 and subtracts each matching pattern's `penalty`.
 * 4. Clamps the final score to [0, 100].
 * 5. Stores `{ score, violations, clean }` at `ctx.scratchpad[scoreScratchpadKey]`.
 * 6. Returns the result directly.
 *
 * Returns `{ success: false, reason }` when the content key is empty.
 */
export function createAntiPatternCheck<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config: AntiPatternCheckConfig): AgentTool<TState, TEvent> {
  return {
    name: config.name,
    description: config.description,
    model_tier: 'orchestrator',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },

    async execute(
      _input: Record<string, unknown>,
      ctx: AgentContext<TState, TEvent>,
    ): Promise<unknown> {
      const content = String(ctx.scratchpad[config.contentScratchpadKey] ?? '').trim();

      if (!content) {
        return {
          success: false,
          reason:
            `No content to check — scratchpad["${config.contentScratchpadKey}"] is empty`,
        };
      }

      let score = 100;
      const violations: Array<{ pattern: string; message: string }> = [];

      for (const rule of config.patterns) {
        if (rule.pattern.test(content)) {
          score -= rule.penalty;
          violations.push({
            pattern: rule.pattern.toString(),
            message: rule.message,
          });
        }
      }

      score = Math.max(0, score);

      const result: AntiPatternCheckResult = {
        score,
        violations,
        clean: violations.length === 0,
      };

      ctx.scratchpad[config.scoreScratchpadKey] = result;

      return result;
    },
  };
}

// ─── createPresentForReview factory ──────────────────────────────────

/**
 * Configuration for the createPresentForReview factory.
 */
export interface PresentForReviewConfig<TState extends BaseState, TEvent extends BaseEvent> {
  /**
   * Tool name — e.g. `'present_to_user'` or `'present_post'`.
   */
  name: string;

  /**
   * Human-readable tool description shown to the LLM.
   */
  description: string;

  /**
   * Scratchpad key from which the content to present is read.
   * The tool reads `ctx.scratchpad[contentScratchpadKey]`.
   *
   * Example: `'section_summary'` (resume) or `'post_draft'` (LinkedIn).
   */
  contentScratchpadKey: string;

  /**
   * Prefix used to form the `waitForUser` gate name.
   * The gate will be named `${gateNamePrefix}_review` for a fixed gate,
   * or the caller can suffix with a dynamic segment by using the optional
   * `gateKeySuffix` field in `buildEventPayload`.
   *
   * Example: `'section'` → gate `'section_review'`
   * Example: `'post'`    → gate `'post_review'`
   */
  gateNamePrefix: string;

  /**
   * SSE event type to emit (e.g. `'section_draft'`, `'post_draft_ready'`).
   * The event body is built by `buildEventPayload`.
   */
  eventType: string;

  /**
   * Build the full SSE event payload from the scratchpad content and
   * the current agent context.  The result is spread-merged with
   * `{ type: eventType }` before being emitted.
   *
   * The `content` argument is `ctx.scratchpad[contentScratchpadKey]` as-is
   * (not stringified) so the builder can handle any stored shape.
   *
   * If the builder needs a dynamic gate key suffix (e.g. section name),
   * it should return `{ __gate_suffix: 'mysuffix', ... }` — the factory
   * strips the `__gate_suffix` field before emitting and appends it to the
   * gate name.
   */
  buildEventPayload: (
    content: unknown,
    ctx: AgentContext<TState, TEvent>,
  ) => Record<string, unknown>;
}

/**
 * Create a tool that presents content to the user via SSE, then pauses the
 * agent loop until the user responds via a `waitForUser` gate.
 *
 * The same "emit SSE → waitForUser → return response" pattern was duplicated in:
 * - craftsman/tools.ts (`present_to_user`)
 * - linkedin-content/writer/tools.ts (`present_post` — emit only, no gate)
 *
 * This factory centralises the pattern for any agent that needs interactive
 * review.  New agents get the correct emit + gate behaviour for free.
 *
 * No LLM call — purely SSE emission + gate. Model tier: `orchestrator`.
 *
 * The tool:
 * 1. Reads `ctx.scratchpad[contentScratchpadKey]`.
 * 2. Calls `buildEventPayload(content, ctx)` to build the SSE payload.
 * 3. Emits `{ type: eventType, ...payload }` (strips internal `__gate_suffix`).
 * 4. Calls `ctx.waitForUser(gateName)` where `gateName` is
 *    `${gateNamePrefix}_review[_${suffix}]` (suffix from `__gate_suffix`).
 * 5. Returns the raw user response (approved / feedback / edited content).
 *
 * Returns `{ success: false, reason }` if the content key is empty.
 */
export function createPresentForReview<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config: PresentForReviewConfig<TState, TEvent>): AgentTool<TState, TEvent> {
  return {
    name: config.name,
    description: config.description,
    model_tier: 'orchestrator',
    isInteractive: true,
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },

    async execute(
      _input: Record<string, unknown>,
      ctx: AgentContext<TState, TEvent>,
    ): Promise<unknown> {
      const content = ctx.scratchpad[config.contentScratchpadKey];

      if (content === undefined || content === null || String(content).trim() === '') {
        return {
          success: false,
          reason:
            `No content to present — scratchpad["${config.contentScratchpadKey}"] is empty`,
        };
      }

      // Build payload — may contain internal __gate_suffix directive
      const rawPayload = config.buildEventPayload(content, ctx);

      // Extract optional gate suffix before emitting
      const gateSuffix =
        typeof rawPayload.__gate_suffix === 'string' ? rawPayload.__gate_suffix : undefined;

      // Build the SSE payload without the internal directive
      const { __gate_suffix: _stripped, ...eventPayload } = rawPayload;

      // Emit the SSE event
      ctx.emit({
        type: config.eventType,
        ...eventPayload,
      } as unknown as TEvent);

      // Build the gate name
      const gateName = gateSuffix
        ? `${config.gateNamePrefix}_review_${gateSuffix}`
        : `${config.gateNamePrefix}_review`;

      // Pause the agent loop until the user responds
      const userResponse = await ctx.waitForUser<unknown>(gateName);

      return userResponse;
    },
  };
}
