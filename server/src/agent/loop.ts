import Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, MAX_TOKENS } from '../lib/anthropic.js';
import { buildSystemPrompt } from './system-prompt.js';
import { toolDefinitions } from './tools/index.js';
import { executeToolCall } from './tool-executor.js';
import type { SessionContext, ContentBlock } from './context.js';

type MessageParam = Anthropic.MessageParam;

const MAX_TOOL_ROUNDS = 20;

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

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const systemPrompt = buildSystemPrompt(ctx);

    const apiMessages: MessageParam[] = ctx.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: msg.content as any,
    }));

    try {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: apiMessages,
        tools: toolDefinitions as Parameters<typeof anthropic.messages.stream>[0]['tools'],
      });

      let fullText = '';
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      stream.on('text', (text) => {
        fullText += text;
        emit({ type: 'text_delta', content: text });
      });

      const response = await stream.finalMessage();

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
  };
  return descriptions[toolName] ?? `Running ${toolName}...`;
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
    default:
      return 'Done';
  }
}
