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
      return executeClassifyFit(input, ctx);
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
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
