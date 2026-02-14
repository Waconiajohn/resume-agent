import type { SessionContext } from './context.js';
import type { SSEEmitter } from './loop.js';
import { executeResearchCompany } from './tools/research-company.js';
import { executeAnalyzeJD } from './tools/analyze-jd.js';
import { executeClassifyFit } from './tools/classify-fit.js';
import { executeGenerateSection } from './tools/generate-section.js';
import { executeAdversarialReview } from './tools/adversarial-review.js';
import { executeSaveCheckpoint } from './tools/save-checkpoint.js';
import { executeUpdateMasterResume } from './tools/update-master-resume.js';
import { executeCreateMasterResume } from './tools/create-master-resume.js';
import { executeExportResume } from './tools/export-resume.js';
import { executeResearchIndustry } from './tools/research-industry.js';
import { executeBuildBenchmark } from './tools/build-benchmark.js';
import { executeUpdateRequirementStatus } from './tools/update-requirement-status.js';
import { executeEmitScore } from './tools/emit-score.js';
import { executeProposeSectionEdit } from './tools/propose-section-edit.js';
import { executeConfirmSection } from './tools/confirm-section.js';
import { executeHumanizeCheck } from './tools/humanize-check.js';
import { executeAtsCheck } from './tools/ats-check.js';
import { executeGenerateCoverLetterSection } from './tools/generate-cover-letter-section.js';
import { executeGenerateInterviewAnswer } from './tools/generate-interview-answer.js';

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<unknown> {
  switch (toolName) {
    case 'research_company':
      return executeResearchCompany(input, ctx);
    case 'analyze_jd':
      return executeAnalyzeJD(input, ctx);
    case 'classify_fit':
      return executeClassifyFit(input, ctx, emit);
    case 'generate_section':
      return executeGenerateSection(input, ctx, emit);
    case 'adversarial_review':
      return executeAdversarialReview(input, ctx);
    case 'save_checkpoint':
      return executeSaveCheckpoint(input, ctx);
    case 'update_master_resume':
      return executeUpdateMasterResume(input, ctx);
    case 'create_master_resume':
      return executeCreateMasterResume(input, ctx);
    case 'export_resume':
      return executeExportResume(input, ctx, emit);
    case 'research_industry':
      return executeResearchIndustry(input, ctx);
    case 'build_benchmark':
      return executeBuildBenchmark(input, ctx, emit);
    case 'update_requirement_status':
      return executeUpdateRequirementStatus(input, ctx, emit);
    case 'emit_score':
      return executeEmitScore(input, ctx, emit);
    case 'propose_section_edit':
      return executeProposeSectionEdit(input, ctx, emit);
    case 'confirm_section':
      return executeConfirmSection(input, ctx, emit);
    case 'humanize_check':
      return executeHumanizeCheck(input, ctx);
    case 'ats_check':
      return executeAtsCheck(input, ctx);
    case 'generate_cover_letter_section':
      return executeGenerateCoverLetterSection(input, ctx, emit);
    case 'generate_interview_answer':
      return executeGenerateInterviewAnswer(input, ctx, emit);
    case 'emit_transparency': {
      const { message, phase } = input as { message: string; phase: string };
      emit({ type: 'transparency', message, phase });
      return { success: true };
    }
    case 'update_right_panel': {
      const { panel_type, data } = input as { panel_type: string; data: Record<string, unknown> };
      emit({ type: 'right_panel_update', panel_type, data });

      // Persist design options so gate validation + section ordering can use them
      if (panel_type === 'design_options' && Array.isArray(data.options)) {
        ctx.designChoices = (data.options as Array<Record<string, unknown>>).map((opt) => ({
          id: (opt.id as string) ?? '',
          name: (opt.name as string) ?? '',
          description: (opt.description as string) ?? '',
          section_order: (opt.section_order as string[]) ?? [],
          selected: (opt.selected as boolean) ?? false,
        }));
        if (data.selected_id) {
          for (const choice of ctx.designChoices) {
            choice.selected = choice.id === data.selected_id;
          }
        }
      }

      return { success: true };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
