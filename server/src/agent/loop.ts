/**
 * @deprecated Legacy monolithic agent loop used only by `routes/sessions.ts`
 * (the chat-based coaching route). The pipeline route (`routes/pipeline.ts`)
 * uses the 3-agent coordinator (`agents/coordinator.ts`) instead.
 *
 * Do not add new features here. Schedule removal once the chat route is
 * migrated to the coordinator-based pipeline.
 */
import { llm, getDefaultModel, getMaxTokens } from '../lib/llm.js';
import type { StreamEvent, ChatMessage } from '../lib/llm-provider.js';
import { buildSystemPrompt, getPromptFingerprint } from './system-prompt.js';
import { getToolsForPhase } from './tools/index.js';
import { executeToolCall } from './tool-executor.js';
import { withRetry } from '../lib/retry.js';
import type { SessionContext, ContentBlock, CoachPhase } from './context.js';
import { createSessionLogger } from '../lib/logger.js';

const MAX_TOOL_ROUNDS = 20;
const LOOP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ROUND_TIMEOUT_MS = 120 * 1000; // 120 seconds per round

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export type SSEEmitter = (event: SSEEvent) => void;

export async function runAgentLoop(
  ctx: SessionContext,
  userMessage: string,
  emit: SSEEmitter,
): Promise<void> {
  const log = createSessionLogger(ctx.sessionId, { userId: ctx.userId });

  if (ctx.pendingToolCallId) {
    // Check if this was a phase gate confirmation — advance the phase
    if (ctx.pendingPhaseTransition) {
      const fromPhase = ctx.currentPhase;
      const nextPhase = ctx.pendingPhaseTransition;
      log.info({ fromPhase, nextPhase }, 'Phase transition');
      ctx.pendingPhaseTransition = null;

      if (nextPhase === 'complete') {
        // Session complete — emit phase_change for frontend, then completion event
        ctx.pendingToolCallId = null;
        emit({
          type: 'phase_change',
          from_phase: fromPhase,
          to_phase: 'complete',
          summary: 'Session complete',
        });
        emit({ type: 'complete', session_id: ctx.sessionId });
        return;
      }

      if (VALID_PHASES.has(nextPhase)) {
        ctx.setPhase(nextPhase as CoachPhase);
        if (nextPhase === 'resume_design') {
          ctx.summarizeInterviewResponses();
        }
      }
      emit({
        type: 'phase_change',
        from_phase: fromPhase,
        to_phase: nextPhase,
        summary: `Moving to ${nextPhase.replace(/_/g, ' ')} phase`,
      });
    }

    ctx.messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: ctx.pendingToolCallId,
          content: userMessage,
        },
      ],
    });
    ctx.pendingToolCallId = null;
  } else {
    ctx.messages.push({
      role: 'user',
      content: userMessage,
    });
  }

  log.info({ phase: ctx.currentPhase, messageCount: ctx.messages.length }, 'Agent loop start');

  // AbortController for the entire loop — used by the timeout to actually kill streaming API calls
  const loopAbort = new AbortController();

  const loopBody = async () => {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (loopAbort.signal.aborted) {
        throw new Error('Agent loop timed out after 5 minutes');
      }

      log.debug({ round, phase: ctx.currentPhase }, 'Agent loop round');

      // Stamp or verify system prompt version/hash
      const fingerprint = getPromptFingerprint();
      if (ctx.systemPromptHash === null) {
        ctx.systemPromptVersion = fingerprint.version;
        ctx.systemPromptHash = fingerprint.hash;
        log.info({ version: fingerprint.version, hash: fingerprint.hash }, 'System prompt stamped');
      } else if (ctx.systemPromptHash !== fingerprint.hash) {
        log.warn({ sessionHash: ctx.systemPromptHash, currentHash: fingerprint.hash, version: fingerprint.version }, 'Prompt drift detected');
        ctx.systemPromptVersion = fingerprint.version;
        ctx.systemPromptHash = fingerprint.hash;
      }

      const systemPrompt = buildSystemPrompt(ctx);
      let phaseTools = getToolsForPhase(ctx.currentPhase);

      // When all sections are confirmed in section_craft, strip editing tools
      // to force the agent to call confirm_phase_complete
      if (ctx.currentPhase === 'section_craft' && ctx.areAllSectionsConfirmed()) {
        phaseTools = phaseTools.filter(t =>
          t.name === 'confirm_phase_complete' || t.name === 'emit_transparency' || t.name === 'save_checkpoint'
        );
        log.info('All sections confirmed — restricting tools to confirm_phase_complete only');
      }

      // Warn user when context is very large and will be aggressively trimmed
      if (ctx.lastInputTokens > 180_000) {
        emit({ type: 'transparency', message: 'Optimizing conversation context...', phase: ctx.currentPhase });
      }

      const apiMessages: ChatMessage[] = ctx.getApiMessages();

      try {
        let fullText = '';
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        // Force tool calling on first round of phases that require research tools
        const forceToolUse = round === 0 && (
          ctx.currentPhase === 'deep_research' ||
          ctx.currentPhase === 'gap_analysis' ||
          ctx.currentPhase === 'quality_review'
        );

        // Per-round timeout: abort if a single round takes too long
        const roundAbort = new AbortController();
        const roundTimer = setTimeout(() => {
          log.warn({ round, phase: ctx.currentPhase }, 'Round timeout — aborting after 120s');
          roundAbort.abort();
        }, ROUND_TIMEOUT_MS);

        try {
          await withRetry(
            async () => {
              fullText = '';
              toolUses.length = 0;
              const stream = llm.stream({
                model: getDefaultModel(),
                max_tokens: getMaxTokens(),
                system: systemPrompt,
                messages: apiMessages,
                tools: phaseTools,
                ...(forceToolUse && { tool_choice: { type: 'any' as const } }),
              });

              for await (const event of stream) {
                if (loopAbort.signal.aborted || roundAbort.signal.aborted) break;
                if (event.type === 'text') {
                  fullText += event.text;
                  emit({ type: 'text_delta', content: event.text });
                } else if (event.type === 'tool_call') {
                  toolUses.push({
                    id: event.id,
                    name: event.name,
                    input: event.input,
                  });
                } else if (event.type === 'done') {
                  ctx.lastInputTokens = event.usage.input_tokens;
                  ctx.lastOutputTokens = event.usage.output_tokens;
                  const model = getDefaultModel();
                  ctx.trackUsage(event.usage, model);
                  ctx.llmProvider = llm.name;
                  ctx.llmModel = model;
                }
              }

              // If round was aborted mid-stream, treat as error
              if (roundAbort.signal.aborted) {
                throw new Error('Round timed out after 120 seconds');
              }
            },
            {
              onRetry: (attempt, error) => {
                log.warn({ attempt, error: error.message }, 'API call retry');
                emit({ type: 'transparency', message: `Retrying API call (attempt ${attempt + 1})...`, phase: ctx.currentPhase });
              },
            },
          );
        } finally {
          clearTimeout(roundTimer);
        }

        if (fullText) {
          emit({ type: 'text_complete', content: fullText });
        }

        const assistantContent: ContentBlock[] = [];
        if (fullText) {
          assistantContent.push({ type: 'text', text: fullText });
        }
        for (const tool of toolUses) {
          assistantContent.push({
            type: 'tool_use',
            id: tool.id,
            name: tool.name,
            input: tool.input,
          });
        }
        ctx.messages.push({
          role: 'assistant',
          content: assistantContent,
        });

        if (toolUses.length === 0) {
          // Auto-complete guard: if quality_review loop ends with text-only (no tool calls),
          // the agent likely delivered its review as text without calling confirm_phase_complete.
          // Automatically transition to complete instead of leaving the session stuck.
          if (ctx.currentPhase === 'quality_review') {
            log.warn({ rounds: round + 1 }, 'quality_review ended without confirm_phase_complete — auto-completing');
            emit({
              type: 'phase_change',
              from_phase: 'quality_review',
              to_phase: 'complete',
              summary: 'Quality review complete',
            });
            emit({ type: 'complete', session_id: ctx.sessionId });
            return;
          }
          log.info({ phase: ctx.currentPhase, rounds: round + 1 }, 'Agent loop complete');
          return;
        }

        const toolResults: ContentBlock[] = [];

        for (const tool of toolUses) {
          if (tool.name === 'ask_user') {
            const askInput = tool.input as {
              question: string;
              context: string;
              input_type: 'text' | 'multiple_choice';
              choices?: Array<{ label: string; description?: string }>;
              skip_allowed?: boolean;
            };

            ctx.pendingToolCallId = tool.id;

            emit({
              type: 'ask_user',
              tool_call_id: tool.id,
              question: askInput.question,
              context: askInput.context,
              input_type: askInput.input_type,
              choices: askInput.choices,
              skip_allowed: askInput.skip_allowed ?? true,
            });

            ctx.addInterviewResponse(askInput.question, '[awaiting response]', askInput.context);
            return;
          }

          if (tool.name === 'confirm_phase_complete') {
            const gateInput = tool.input as {
              current_phase: string;
              next_phase: string;
              phase_summary: string;
              next_phase_preview: string;
            };

            // Quality gate validation — soft gates that tell the AI what to fix
            const gateError = validatePhaseGate(gateInput.current_phase, gateInput.next_phase, ctx, log, emit);
            if (gateError) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tool.id,
                content: JSON.stringify({ error: gateError }),
              });
              emit({ type: 'tool_complete', tool_name: tool.name, summary: `Gate blocked: ${gateError.substring(0, 80)}` });
              continue;
            }

            ctx.pendingToolCallId = tool.id;
            ctx.pendingPhaseTransition = gateInput.next_phase;

            emit({
              type: 'phase_gate',
              tool_call_id: tool.id,
              current_phase: gateInput.current_phase,
              next_phase: gateInput.next_phase,
              phase_summary: gateInput.phase_summary,
              next_phase_preview: gateInput.next_phase_preview,
            });

            return;
          }

          log.debug({ tool: tool.name }, 'Executing tool');
          emit({ type: 'tool_start', tool_name: tool.name, description: getToolDescription(tool.name) });

          try {
            const result = await executeToolCall(tool.name, tool.input, ctx, emit);
            let resultStr = JSON.stringify(result);
            if (resultStr.length > 2000) {
              resultStr = resultStr.substring(0, 2000) + '..."truncated"';
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: resultStr,
            });
            emit({ type: 'tool_complete', tool_name: tool.name, summary: summarizeToolResult(tool.name, result) });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: JSON.stringify({ error: errorMessage }),
            });
            emit({ type: 'tool_complete', tool_name: tool.name, summary: `Error: ${errorMessage}` });
          }
        }

        ctx.messages.push({
          role: 'user',
          content: toolResults,
        });
      } catch (error) {
        const message = cleanErrorMessage(error);
        emit({ type: 'error', message, recoverable: true, retry_action: 'resend_last_message' });
        return;
      }
    }

    emit({
      type: 'error',
      message: 'Agent reached maximum tool call rounds. Progress has been saved.',
      recoverable: true,
      retry_action: 'continue_session',
    });
  };

  // 2E: Timeout guard — uses AbortController to actually kill streaming API calls
  const timeoutId = setTimeout(() => {
    log.warn({ timeoutSec: LOOP_TIMEOUT_MS / 1000, phase: ctx.currentPhase }, 'Agent loop aborting — timeout');
    loopAbort.abort();
  }, LOOP_TIMEOUT_MS);

  try {
    await loopBody();
  } catch (error) {
    const message = cleanErrorMessage(error);
    log.error({ phase: ctx.currentPhase, error: message }, 'Agent loop error');
    emit({ type: 'error', message, recoverable: true, retry_action: 'continue_session' });
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      return parsed?.error?.message ?? parsed?.message ?? error.message;
    } catch {
      // Not JSON — check if the message itself looks like raw JSON
      if (error.message.startsWith('{')) {
        return 'Something went wrong processing your message. Please try again.';
      }
      return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

function getToolDescription(toolName: string): string {
  const descriptions: Record<string, string> = {
    research_company: 'Researching the company...',
    analyze_jd: 'Analyzing the job description...',
    classify_fit: 'Matching your experience to requirements...',
    generate_section: 'Writing resume content...',
    adversarial_review: 'Reviewing as a hiring manager...',
    save_checkpoint: 'Saving progress...',
    update_master_resume: 'Updating your master resume...',
    create_master_resume: 'Processing your resume...',
    export_resume: 'Preparing your resume for download...',
    emit_transparency: 'Sharing what I\'m working on...',
    update_right_panel: 'Updating your dashboard...',
    confirm_phase_complete: 'Checking in before moving forward...',
    research_industry: 'Researching industry benchmarks...',
    build_benchmark: 'Building ideal candidate profile...',
    update_requirement_status: 'Updating requirement status...',
    emit_score: 'Calculating your readiness score...',
    propose_section_edit: 'Preparing section changes for your review...',
    confirm_section: 'Confirming section...',
    humanize_check: 'Checking for natural, authentic language...',
  };
  return descriptions[toolName] ?? `Running ${toolName}...`;
}

const VALID_PHASES = new Set(['onboarding', 'deep_research', 'gap_analysis', 'resume_design', 'section_craft', 'quality_review', 'complete']);

function validatePhaseGate(currentPhase: string, nextPhase: string, ctx: SessionContext, log: ReturnType<typeof createSessionLogger>, emit: SSEEmitter): string | null {
  // Validate nextPhase is a known phase
  if (!VALID_PHASES.has(nextPhase)) {
    return `Cannot advance: "${nextPhase}" is not a valid phase. Valid phases: ${[...VALID_PHASES].join(', ')}`;
  }

  // onboarding → deep_research: check that resume + JD data exist
  if (currentPhase === 'onboarding' && nextPhase === 'deep_research') {
    if (!ctx.masterResumeData && !ctx.masterResumeId) {
      return 'Cannot advance: no master resume loaded. Ask the candidate to upload or paste their resume first.';
    }
  }

  // deep_research → gap_analysis: check that research has been done
  if (currentPhase === 'deep_research' && nextPhase === 'gap_analysis') {
    if (!ctx.companyResearch.company_name && !ctx.jdAnalysis.job_title) {
      return 'Cannot advance: company research and JD analysis have not been completed. Run research_company and analyze_jd first.';
    }
  }

  // gap_analysis → resume_design: check for unresolved critical gaps
  if (currentPhase === 'gap_analysis' && nextPhase === 'resume_design') {
    const reqs = ctx.fitClassification.requirements ?? [];
    const criticalGaps = reqs.filter(r => r.classification === 'gap' && r.importance === 'critical');
    if (criticalGaps.length > 0) {
      return `Cannot advance: ${criticalGaps.length} critical requirement(s) still have gaps: ${criticalGaps.map(r => r.requirement).join(', ')}. Address these first using ask_user.`;
    }
  }

  // resume_design → section_craft: check design options were presented and selected
  if (currentPhase === 'resume_design' && nextPhase === 'section_craft') {
    if (ctx.designChoices.length === 0) {
      return 'Cannot advance: no design options were presented. Use update_right_panel with panel_type "design_options" and ask_user to let the candidate choose a layout.';
    }
    if (!ctx.designChoices.some(d => d.selected)) {
      return 'Cannot advance: no design option selected. Use ask_user to let the candidate choose.';
    }
  }

  // section_craft → quality_review: check all sections from design choice are confirmed
  if (currentPhase === 'section_craft' && nextPhase === 'quality_review') {
    const selectedDesign = ctx.designChoices.find(d => d.selected);
    const requiredSections = selectedDesign?.section_order ?? [];

    if (requiredSections.length === 0) {
      return 'Cannot advance: no design choice selected or section_order is empty. Go back to resume_design and select a layout.';
    }

    const confirmedSections = new Set(
      ctx.sectionStatuses
        .filter(s => s.status === 'confirmed')
        .map(s => s.section),
    );

    const missingSections = requiredSections.filter(s => !confirmedSections.has(s));
    if (missingSections.length > 0) {
      return `Cannot advance: ${missingSections.length} required section(s) not yet confirmed: ${missingSections.join(', ')}. Use confirm_section for each.`;
    }
  }

  // quality_review → complete: check quality thresholds
  if (currentPhase === 'quality_review' && nextPhase === 'complete') {
    if (!ctx.adversarialReview.overall_assessment ||
        ctx.adversarialReview.overall_assessment === 'Unable to complete review') {
      return 'Cannot advance: adversarial_review has not been run. Run it before completing quality review.';
    }
    const total = ctx.adversarialReview.checklist_total ?? 0;
    if (total < 35) {
      return `Cannot advance: checklist total is ${total}/50 (minimum 35 required). Address quality issues before proceeding.`;
    }
    // Age-bias risks are advisory only — warn but allow advancement
    const biasRisks = ctx.adversarialReview.age_bias_risks ?? [];
    if (biasRisks.length > 0) {
      log.warn({ biasRisks, count: biasRisks.length }, 'Age-bias risks noted but allowing advancement');
      emit({
        type: 'transparency',
        message: `Note: ${biasRisks.length} potential age-bias indicator(s) detected in your resume. The agent has been advised to address these.`,
        phase: ctx.currentPhase,
      });
    }
  }

  return null;
}

function summarizeToolResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== 'object') return 'Done';

  const r = result as Record<string, unknown>;

  switch (toolName) {
    case 'research_company': {
      const research = r.research as Record<string, unknown> | undefined;
      return research?.company_name ? `Researched ${research.company_name}` : 'Research complete';
    }
    case 'analyze_jd': {
      const analysis = r.analysis as Record<string, unknown[]> | undefined;
      return `Found ${analysis?.must_haves?.length ?? 0} key requirements`;
    }
    case 'classify_fit': {
      const cls = r.classification as Record<string, number> | undefined;
      return `${cls?.strong_count ?? 0} strong, ${cls?.partial_count ?? 0} partial, ${cls?.gap_count ?? 0} gaps`;
    }
    case 'generate_section':
      return `Updated ${r.section ?? 'section'}`;
    case 'adversarial_review':
      return r.pass ? 'Resume passed review' : 'Issues found';
    case 'save_checkpoint':
      return 'Progress saved';
    case 'update_master_resume':
      return `Applied ${r.changes_applied ?? 0} changes`;
    case 'create_master_resume':
      return 'Resume created and loaded';
    case 'export_resume':
      return 'Resume ready for download';
    case 'emit_transparency':
      return 'Status shared';
    case 'update_right_panel':
      return 'Dashboard updated';
    case 'confirm_phase_complete':
      return 'Awaiting confirmation';
    case 'research_industry':
      return 'Industry research complete';
    case 'build_benchmark':
      return 'Benchmark candidate profile built';
    case 'update_requirement_status':
      return `Requirement ${r.new_classification ?? 'updated'}`;
    case 'emit_score':
      return `Score: ${r.score ?? 0}`;
    case 'propose_section_edit':
      return `Proposed changes for ${r.section ?? 'section'}`;
    case 'confirm_section':
      return `${r.section ?? 'Section'} confirmed`;
    case 'humanize_check':
      return `Authenticity: ${r.authenticity_score ?? 0}%`;
    default:
      return 'Done';
  }
}
