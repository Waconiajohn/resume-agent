/**
 * Session Status Service — pipeline status formatting helpers
 *
 * Extracted from routes/sessions.ts so the formatting logic can be
 * tested independently and reused across routes.
 */

// ─── Stage and gate label formatters ─────────────────────────────────────────

export function formatPipelineStageLabel(stage: unknown): string {
  if (typeof stage !== 'string' || !stage.trim()) return 'processing';
  const labels: Record<string, string> = {
    intake: 'Step 1: Resume Intake',
    research: 'Step 2: Research & Benchmark',
    positioning: 'Step 3: Why Me Positioning',
    gap_analysis: 'Step 4: Gap Map & Evidence Fill',
    architect: 'Step 5: Resume Blueprint',
    architect_review: 'Step 5: Blueprint Review',
    section_writing: 'Step 6: Section Writing',
    section_review: 'Step 6: Section Review',
    revision: 'Step 6: Revisions',
    quality_review: 'Step 7: Quality Review & Export',
    complete: 'Step 7: Complete',
  };
  return labels[stage] ?? stage.replace(/_/g, ' ');
}

export function formatPendingGateLabel(gate: unknown): string | null {
  if (typeof gate !== 'string' || !gate.trim()) return null;
  if (gate === 'positioning_profile_choice') {
    return 'positioning profile choice (reuse, update, or start fresh)';
  }
  if (gate.startsWith('questionnaire_')) {
    return 'questionnaire in the center workspace';
  }
  if (gate.startsWith('section_review_')) {
    return 'section review in the center workspace';
  }
  if (gate === 'architect_review') {
    return 'blueprint review in the center workspace';
  }
  if (gate.startsWith('positioning_q_')) {
    return 'positioning interview question in the center workspace';
  }
  return gate.replace(/_/g, ' ');
}

// ─── Grounded workflow explanation / suggestion ───────────────────────────────

export function buildGroundedWorkflowExplanation(
  stage: string | null,
  pendingGate: string | null,
  pipelineStatus: string | null,
): string | null {
  if (pendingGate === 'positioning_profile_choice') {
    return 'Workflow explanation: A saved positioning profile was found for Step 3. Choose whether to reuse it, update it, or start fresh in the center workspace.';
  }
  if (pendingGate?.startsWith('positioning_q_')) {
    return 'Workflow explanation: Step 3 (Why Me Positioning) is waiting for a response to a positioning question in the center workspace.';
  }
  if (pendingGate?.startsWith('questionnaire_')) {
    return 'Workflow explanation: A structured questionnaire is open in the center workspace. Completing or skipping questions will move the workflow forward.';
  }
  if (pendingGate === 'architect_review') {
    return 'Workflow explanation: Step 5 (Resume Blueprint) is ready for review. Approving or revising the blueprint controls how sections are written next.';
  }
  if (pendingGate?.startsWith('section_review_')) {
    return 'Workflow explanation: Step 6 (Section Writing & Review) has a draft ready in the center workspace and is waiting for review or approval.';
  }

  if (pipelineStatus === 'complete') {
    return 'Workflow explanation: The pipeline run is complete. Review the final resume, quality outputs, and export options in the workspace.';
  }

  switch (stage) {
    case 'intake':
      return 'Workflow explanation: Step 1 is parsing and structuring the resume so later steps can benchmark and rewrite accurately.';
    case 'research':
      return 'Workflow explanation: Step 2 is analyzing the job description, company signals, and benchmark candidate profile. This can be one of the slower stages.';
    case 'positioning':
      return 'Workflow explanation: Step 3 is building your Why Me positioning profile and evidence library before gap mapping.';
    case 'gap_analysis':
      return 'Workflow explanation: Step 4 is comparing your resume + evidence against the job requirements and benchmark profile.';
    case 'architect':
    case 'architect_review':
      return 'Workflow explanation: Step 5 is designing the resume blueprint that controls section strategy, keyword targets, and positioning choices.';
    case 'section_writing':
    case 'section_review':
    case 'revision':
      return 'Workflow explanation: Step 6 is writing and reviewing resume sections using the approved benchmark, gap map, and blueprint.';
    case 'quality_review':
      return 'Workflow explanation: Step 7 is running quality checks, ATS checks, and final refinements before export.';
    default:
      return pipelineStatus === 'running'
        ? 'Workflow explanation: The pipeline is still processing the current workflow step and will update the workspace when the next action is ready.'
        : null;
  }
}

export function buildGroundedWorkflowSuggestion(
  stage: string | null,
  pendingGate: string | null,
  pipelineStatus: string | null,
): string | null {
  if (pendingGate) {
    return 'Safe suggestion: Complete the highlighted action in the center workspace first. Use this chat to ask what any option means before you choose.';
  }
  if (pipelineStatus === 'running') {
    if (stage === 'research') {
      return 'Safe suggestion: Step 2 research can take a while. Watch the workspace/status banner for benchmark and requirement updates instead of waiting for chat text.';
    }
    return 'Safe suggestion: Let the pipeline continue. If progress appears stuck for several minutes, use Reconnect or Refresh State in the workspace.';
  }
  if (pipelineStatus === 'complete') {
    return 'Safe suggestion: Review the final resume and export, then save it as a reusable base resume if this version should become your new default.';
  }
  return 'Safe suggestion: Start or restart the pipeline from the workspace when you are ready to continue this resume run.';
}

// ─── Composite status reply ───────────────────────────────────────────────────

/**
 * Build a grounded, factual pipeline chat reply from a coach_sessions DB row.
 * Makes no claims about panel contents or progress the pipeline has not confirmed.
 */
export function buildGroundedPipelineChatReply(sessionRow: Record<string, unknown>): string {
  const pipelineStatus = typeof sessionRow.pipeline_status === 'string' ? sessionRow.pipeline_status : null;
  const pipelineStage = typeof sessionRow.pipeline_stage === 'string' ? sessionRow.pipeline_stage : null;
  const pendingGate = typeof sessionRow.pending_gate === 'string' ? sessionRow.pending_gate : null;
  const lastPanelType = typeof sessionRow.last_panel_type === 'string' ? sessionRow.last_panel_type : null;
  const updatedAt = typeof sessionRow.updated_at === 'string' ? sessionRow.updated_at : null;

  const statusLine = pipelineStatus === 'running'
    ? `The resume pipeline is currently running (${formatPipelineStageLabel(pipelineStage)}).`
    : (pipelineStatus === 'complete'
        ? 'The resume pipeline is complete for this session.'
        : `The pipeline is not currently running${pipelineStage ? ` (last stage: ${formatPipelineStageLabel(pipelineStage)})` : ''}.`);

  const gateLabel = formatPendingGateLabel(pendingGate);
  const gateLine = gateLabel
    ? `It is waiting on your input: ${gateLabel}.`
    : (pipelineStatus === 'running'
        ? 'It is still processing and has not emitted the next user action yet.'
        : null);

  const panelLine = lastPanelType
    ? `Last confirmed workspace panel: ${lastPanelType.replace(/_/g, ' ')}.`
    : null;
  const parsedDate = updatedAt ? new Date(updatedAt) : null;
  const updatedLine = parsedDate && !isNaN(parsedDate.getTime())
    ? `Last confirmed backend update: ${parsedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}.`
    : null;
  const explanationLine = buildGroundedWorkflowExplanation(pipelineStage, pendingGate, pipelineStatus);
  const suggestionLine = buildGroundedWorkflowSuggestion(pipelineStage, pendingGate, pipelineStatus);

  return [
    `Verified status: ${statusLine}`,
    gateLine ? `Verified next action: ${gateLine}` : null,
    panelLine ? `Verified workspace state: ${panelLine}` : null,
    updatedLine ? `Verified backend activity: ${updatedLine}` : null,
    explanationLine,
    suggestionLine,
    'I can explain the current step and what to do next, but I will not guess about panel contents or progress the pipeline has not confirmed.',
  ].filter(Boolean).join(' ');
}
