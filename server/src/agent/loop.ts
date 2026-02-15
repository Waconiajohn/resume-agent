import Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, MAX_TOKENS } from '../lib/anthropic.js';
import { buildSystemPrompt } from './system-prompt.js';
import { getToolsForPhase } from './tools/index.js';
import { executeToolCall } from './tool-executor.js';
import { withRetry } from '../lib/retry.js';
import type { SessionContext, ContentBlock, CoachPhase } from './context.js';

type MessageParam = Anthropic.MessageParam;

const MAX_TOOL_ROUNDS = 20;
const LOOP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
  if (ctx.pendingToolCallId) {
    // Check if this was a phase gate confirmation — advance the phase
    if (ctx.pendingPhaseTransition) {
      const fromPhase = ctx.currentPhase;
      const nextPhase = ctx.pendingPhaseTransition as CoachPhase;
      console.log(`[agent-loop] phase_transition from=${fromPhase} to=${nextPhase}`);
      ctx.pendingPhaseTransition = null;
      ctx.setPhase(nextPhase);
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

  console.log(`[agent-loop] start phase=${ctx.currentPhase} messages=${ctx.messages.length}`);

  const loopBody = async () => {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[agent-loop] round=${round} phase=${ctx.currentPhase}`);
      const systemPrompt = buildSystemPrompt(ctx);
      const phaseTools = getToolsForPhase(ctx.currentPhase);

      const truncatedMessages = ctx.getApiMessages();
      const apiMessages: MessageParam[] = truncatedMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as Anthropic.MessageParam['content'],
      }));

      try {
        let fullText = '';
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        // Force tool calling on first round of phases that require research tools
        const forceToolUse = round === 0 && (
          ctx.currentPhase === 'deep_research' ||
          ctx.currentPhase === 'gap_analysis' ||
          ctx.currentPhase === 'quality_review'
        );

        const response = await withRetry(
          () => {
            fullText = '';
            toolUses.length = 0;
            const streamParams: Parameters<typeof anthropic.messages.stream>[0] = {
              model: MODEL,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              messages: apiMessages,
              tools: phaseTools as Parameters<typeof anthropic.messages.stream>[0]['tools'],
            };
            if (forceToolUse) {
              streamParams.tool_choice = { type: 'any' };
            }
            const s = anthropic.messages.stream(streamParams);
            s.on('text', (text: string) => {
              fullText += text;
              emit({ type: 'text_delta', content: text });
            });
            return s.finalMessage();
          },
          {
            onRetry: (attempt, error) => {
              console.log(`[agent-loop] retry attempt=${attempt} error=${error.message}`);
              emit({ type: 'transparency', message: `Retrying API call (attempt ${attempt + 1})...`, phase: ctx.currentPhase });
            },
          },
        );

        ctx.addTokens(
          (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        );

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
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
          console.log(`[agent-loop] complete phase=${ctx.currentPhase} rounds=${round + 1}`);
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
            const gateError = validatePhaseGate(gateInput.current_phase, gateInput.next_phase, ctx);
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

          console.log(`[agent-loop] tool=${tool.name}`);
          emit({ type: 'tool_start', tool_name: tool.name, description: getToolDescription(tool.name) });

          try {
            const result = await executeToolCall(tool.name, tool.input, ctx, emit);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: JSON.stringify(result),
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
        const message = error instanceof Error ? error.message : 'Agent loop error';
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

  // 2E: Timeout guard
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('Agent loop timed out after 5 minutes')), LOOP_TIMEOUT_MS),
  );

  try {
    await Promise.race([loopBody(), timeout]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent loop timeout';
    console.log(`[agent-loop] timeout phase=${ctx.currentPhase}`);
    emit({ type: 'error', message, recoverable: true, retry_action: 'continue_session' });
  }
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
    ats_check: 'Running ATS compatibility check...',
    generate_cover_letter_section: 'Drafting cover letter paragraph...',
    generate_interview_answer: 'Preparing interview answer framework...',
  };
  return descriptions[toolName] ?? `Running ${toolName}...`;
}

function validatePhaseGate(currentPhase: string, nextPhase: string, ctx: SessionContext): string | null {
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

  // section_craft → quality_review: check all sections confirmed
  if (currentPhase === 'section_craft' && nextPhase === 'quality_review') {
    const allConfirmed = ctx.sectionStatuses.length > 0 &&
      ctx.sectionStatuses.every(s => s.status === 'confirmed');
    if (!allConfirmed) {
      const unconfirmed = ctx.sectionStatuses
        .filter(s => s.status !== 'confirmed')
        .map(s => s.section);
      return `Cannot advance: ${unconfirmed.length} section(s) not yet confirmed: ${unconfirmed.join(', ')}. Use confirm_section for each.`;
    }
  }

  // quality_review → cover_letter: check quality thresholds
  if (currentPhase === 'quality_review' && nextPhase === 'cover_letter') {
    if (!ctx.adversarialReview.overall_assessment ||
        ctx.adversarialReview.overall_assessment === 'Unable to complete review') {
      return 'Cannot advance: adversarial_review has not been run. Run it before completing quality review.';
    }
    const total = ctx.adversarialReview.checklist_total ?? 0;
    if (total > 0 && total < 35) {
      return `Cannot advance: checklist total is ${total}/50 (minimum 35 required). Address quality issues before proceeding.`;
    }
    const biasRisks = ctx.adversarialReview.age_bias_risks ?? [];
    if (biasRisks.length > 0) {
      return `Cannot advance: ${biasRisks.length} unaddressed age-bias risk(s): ${biasRisks.join(', ')}. Fix these before proceeding.`;
    }
  }

  // cover_letter → interview_prep: soft gate — warn but allow
  if (currentPhase === 'cover_letter' && nextPhase === 'interview_prep') {
    const hasCoverContent = ctx.tailoredSections &&
      Object.values(ctx.tailoredSections).some(v => typeof v === 'string' && v.length > 0);
    if (!hasCoverContent) {
      console.warn('[agent-loop] Advancing cover_letter → interview_prep without cover letter content');
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
      const count = analysis?.must_haves?.length ?? 0;
      return `Found ${count} key requirements`;
    }
    case 'classify_fit': {
      const cls = r.classification as Record<string, number> | undefined;
      return `${cls?.strong_count ?? 0} strong, ${cls?.partial_count ?? 0} partial, ${cls?.gap_count ?? 0} gaps`;
    }
    case 'generate_section':
      return `Updated ${(r as Record<string, string>).section ?? 'section'}`;
    case 'adversarial_review':
      return (r as Record<string, boolean>).pass ? 'Resume passed review' : 'Issues found';
    case 'save_checkpoint':
      return 'Progress saved';
    case 'update_master_resume':
      return `Applied ${(r as Record<string, number>).changes_applied ?? 0} changes`;
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
      return `Requirement ${(r as Record<string, string>).new_classification ?? 'updated'}`;
    case 'emit_score':
      return `Score: ${(r as Record<string, number>).score ?? 0}`;
    case 'propose_section_edit':
      return `Proposed changes for ${(r as Record<string, string>).section ?? 'section'}`;
    case 'confirm_section':
      return `${(r as Record<string, string>).section ?? 'Section'} confirmed`;
    case 'humanize_check':
      return `Authenticity: ${(r as Record<string, number>).authenticity_score ?? 0}%`;
    case 'ats_check':
      return `ATS score: ${(r as Record<string, number>).ats_score ?? 0}%`;
    case 'generate_cover_letter_section':
      return `${(r as Record<string, string>).paragraph_type ?? 'Paragraph'} drafted`;
    case 'generate_interview_answer':
      return 'Answer framework ready';
    default:
      return 'Done';
  }
}
