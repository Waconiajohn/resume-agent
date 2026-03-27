import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { supabaseAdmin } from '../src/lib/supabase.js';
import { loadCareerProfileContext } from '../src/lib/career-profile-context.js';
import { llm } from '../src/lib/llm.js';
import { setUsageTrackingContext, startUsageTracking, stopUsageTracking } from '../src/lib/llm-provider.js';
import { MODEL_PRIMARY } from '../src/lib/model-constants.js';
import { repairJSON } from '../src/lib/json-repair.js';
import { runV2Pipeline } from '../src/agents/resume-v2/orchestrator.js';
import { buildSourceResumeOutline } from '../src/agents/resume-v2/source-resume-outline.js';
import type {
  AssemblyOutput,
  BenchmarkCandidateOutput,
  JobIntelligenceOutput,
  ResumeDraftOutput,
} from '../src/agents/resume-v2/types.js';
import {
  buildFinalReviewPrompts,
  extractHardRequirementRisksFromGapAnalysis,
  extractMaterialJobFitRisksFromGapAnalysis,
  finalReviewResultSchema,
  getEffectiveHardRequirementRisks,
  stabilizeFinalReviewResult,
} from '../src/routes/resume-v2-pipeline-support.js';

type SessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  tailored_sections: {
    inputs?: {
      resume_text?: string;
      job_description?: string;
    };
  } | null;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

const DEFAULT_BATCH_LIMIT = 5;
const EXCLUDED_DEFAULT_QA_KEYWORDS = [
  'conocophillips',
  'drilling',
  'petroleum',
  'wellsite',
  'rig ',
  ' rig',
  'reservoir',
  'upstream',
  'bha ',
  ' bha',
  'permian',
  'oil and gas',
];

function parseSessionIds(): string[] {
  const raw = process.env.REAL_QA_SESSION_IDS?.trim();
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function buildResumeText(draft: ResumeDraftOutput): string {
  const lines: string[] = [];
  const headerParts = [draft.header.name, draft.header.email, draft.header.phone, draft.header.linkedin]
    .filter(Boolean)
    .join(' | ');

  if (draft.header.name) lines.push(draft.header.name.toUpperCase());
  if (draft.header.branded_title) lines.push(draft.header.branded_title);
  if (headerParts) lines.push(headerParts);
  lines.push('');

  if (draft.executive_summary.content.trim()) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(draft.executive_summary.content.trim());
    lines.push('');
  }

  if (draft.core_competencies.length > 0) {
    lines.push('CORE COMPETENCIES');
    lines.push(draft.core_competencies.join(', '));
    lines.push('');
  }

  if (draft.selected_accomplishments.length > 0) {
    lines.push('SELECTED ACCOMPLISHMENTS');
    draft.selected_accomplishments.forEach((item) => lines.push(`- ${item.content}`));
    lines.push('');
  }

  if (draft.professional_experience.length > 0) {
    lines.push('PROFESSIONAL EXPERIENCE');
    draft.professional_experience.forEach((experience) => {
      lines.push(`${experience.title}, ${experience.company}`);
      lines.push(`${experience.start_date} - ${experience.end_date}`);
      if (experience.scope_statement.trim()) {
        lines.push(experience.scope_statement.trim());
      }
      experience.bullets.forEach((bullet) => lines.push(`- ${bullet.text}`));
      lines.push('');
    });
  }

  if (draft.education.length > 0) {
    lines.push('EDUCATION');
    draft.education.forEach((item) => {
      const parts = [item.degree, item.institution, item.year].filter(Boolean);
      lines.push(parts.join(', '));
    });
    lines.push('');
  }

  if (draft.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    draft.certifications.forEach((item) => lines.push(item));
    lines.push('');
  }

  return lines.join('\n').trim();
}

function countDraftProfessionalBullets(draft: ResumeDraftOutput): number {
  return draft.professional_experience.reduce((sum, experience) => sum + experience.bullets.length, 0);
}

function collectDraftProfessionalBullets(draft: ResumeDraftOutput): string[] {
  return draft.professional_experience.flatMap((experience) => experience.bullets.map((bullet) => bullet.text));
}

function averageTextLength(values: string[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value.trim().length, 0);
  return Number((total / values.length).toFixed(1));
}

function countConcreteProofBullets(values: string[]): number {
  return values.filter((value) => /[%$]|\b\d/.test(value) || /\b[A-Z]{2,}(?:\/[A-Z]{2,})*\b/.test(value)).length;
}

function normalizeRoleKey(company: string, title: string): string {
  return `${company} ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeBulletText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function summarizeProofDensity(sourceOutline: ReturnType<typeof buildSourceResumeOutline>, draft: ResumeDraftOutput) {
  const sourcePositionsByKey = new Map(
    sourceOutline.positions.map((position) => [
      normalizeRoleKey(position.company, position.title),
      position,
    ]),
  );

  const draftBullets = collectDraftProfessionalBullets(draft);
  const sourceBullets = sourceOutline.positions.flatMap((position) => position.bullets);
  const roleSummaries = draft.professional_experience.map((experience) => {
    const sourcePosition = sourcePositionsByKey.get(normalizeRoleKey(experience.company, experience.title));
    const sourcePositionBullets = sourcePosition?.bullets ?? [];
    const sourceBulletSet = new Set(sourcePositionBullets.map((bullet) => normalizeBulletText(bullet)));
    const finalPositionBullets = experience.bullets.map((bullet) => bullet.text);
    const sourceAverageChars = averageTextLength(sourcePositionBullets);
    const finalAverageChars = averageTextLength(finalPositionBullets);

    return {
      company: experience.company,
      title: experience.title,
      source_bullets: sourcePositionBullets.length,
      final_bullets: finalPositionBullets.length,
      source_average_bullet_chars: sourceAverageChars,
      final_average_bullet_chars: finalAverageChars,
      bullet_char_ratio: sourceAverageChars > 0 ? Number((finalAverageChars / sourceAverageChars).toFixed(2)) : null,
      source_concrete_proof_bullets: countConcreteProofBullets(sourcePositionBullets),
      final_concrete_proof_bullets: countConcreteProofBullets(finalPositionBullets),
      exact_source_bullet_matches: finalPositionBullets.filter((bullet) => sourceBulletSet.has(normalizeBulletText(bullet))).length,
      original_proof_bullets: experience.bullets.filter((bullet) => bullet.source === 'original').length,
      enhanced_proof_bullets: experience.bullets.filter((bullet) => bullet.source === 'enhanced').length,
      drafted_proof_bullets: experience.bullets.filter((bullet) => bullet.source === 'drafted').length,
      below_density_floor: sourceAverageChars >= 80 && finalAverageChars < (sourceAverageChars * 0.7),
    };
  });

  return {
    source_average_bullet_chars: averageTextLength(sourceBullets),
    final_average_bullet_chars: averageTextLength(draftBullets),
    professional_bullet_char_ratio: sourceBullets.length > 0
      ? Number((averageTextLength(draftBullets) / averageTextLength(sourceBullets)).toFixed(2))
      : null,
    source_concrete_proof_bullets: countConcreteProofBullets(sourceBullets),
    final_concrete_proof_bullets: countConcreteProofBullets(draftBullets),
    original_proof_bullets: draft.professional_experience.reduce(
      (sum, experience) => sum + experience.bullets.filter((bullet) => bullet.source === 'original').length,
      0,
    ),
    enhanced_proof_bullets: draft.professional_experience.reduce(
      (sum, experience) => sum + experience.bullets.filter((bullet) => bullet.source === 'enhanced').length,
      0,
    ),
    drafted_proof_bullets: draft.professional_experience.reduce(
      (sum, experience) => sum + experience.bullets.filter((bullet) => bullet.source === 'drafted').length,
      0,
    ),
    roles_below_density_floor: roleSummaries.filter((role) => role.below_density_floor).map((role) => `${role.title} @ ${role.company}`),
    role_summaries: roleSummaries,
  };
}

function collectJobRequirements(job: JobIntelligenceOutput, gap: GapAnalysisOutput): string[] {
  const base = [
    ...job.core_competencies.map((item) => item.competency),
    ...job.strategic_responsibilities,
  ];

  const fromGap = gap.requirements
    .filter((item) => item.source === 'job_description')
    .map((item) => item.requirement);

  return Array.from(new Set([...base, ...fromGap].filter(Boolean)));
}

function collectBenchmarkRequirements(benchmark: BenchmarkCandidateOutput, gap: GapAnalysisOutput): string[] {
  const base = [
    ...benchmark.expected_technical_skills,
    ...benchmark.expected_certifications,
    ...benchmark.expected_industry_knowledge,
    ...benchmark.differentiators,
    ...benchmark.expected_achievements.map((item) => `${item.area}: ${item.description}`),
  ];

  const fromGap = gap.requirements
    .filter((item) => item.source === 'benchmark')
    .map((item) => item.requirement);

  return Array.from(new Set([...base, ...fromGap].filter(Boolean)));
}

async function loadSessions(sessionIds: string[]): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, created_at, tailored_sections')
    .in('id', sessionIds);

  if (error) {
    throw new Error(`Failed to load coach sessions: ${error.message}`);
  }

  return (data ?? []) as SessionRow[];
}

function normalizeSessionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSessionFingerprint(session: SessionRow): string {
  const inputs = session.tailored_sections?.inputs ?? {};
  const resumeText = typeof inputs.resume_text === 'string' ? inputs.resume_text : '';
  const jobDescription = typeof inputs.job_description === 'string' ? inputs.job_description : '';
  return `${normalizeSessionText(resumeText).slice(0, 300)}::${normalizeSessionText(jobDescription).slice(0, 300)}`;
}

function shouldExcludeFromDefaultQa(session: SessionRow): boolean {
  const inputs = session.tailored_sections?.inputs ?? {};
  const resumeText = typeof inputs.resume_text === 'string' ? inputs.resume_text : '';
  const jobDescription = typeof inputs.job_description === 'string' ? inputs.job_description : '';
  const haystack = normalizeSessionText(`${resumeText}\n${jobDescription}`);

  return EXCLUDED_DEFAULT_QA_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

async function loadDefaultSessions(limit = DEFAULT_BATCH_LIMIT): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, created_at, tailored_sections')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    throw new Error(`Failed to load default QA sessions: ${error.message}`);
  }

  const seenFingerprints = new Set<string>();
  const selected: SessionRow[] = [];

  for (const session of (data ?? []) as SessionRow[]) {
    const inputs = session.tailored_sections?.inputs ?? {};
    const resumeText = typeof inputs.resume_text === 'string' ? inputs.resume_text : '';
    const jobDescription = typeof inputs.job_description === 'string' ? inputs.job_description : '';
    if (resumeText.length < 50 || jobDescription.length < 50) continue;
    if (shouldExcludeFromDefaultQa(session)) continue;

    const fingerprint = buildSessionFingerprint(session);
    if (seenFingerprints.has(fingerprint)) continue;

    seenFingerprints.add(fingerprint);
    selected.push(session);

    if (selected.length >= limit) break;
  }

  return selected;
}

async function runRealSessionQa() {
  const sessionIds = parseSessionIds();
  const sessions = sessionIds.length > 0
    ? await loadSessions(sessionIds)
    : await loadDefaultSessions();

  if (sessions.length === 0) {
    throw new Error('No matching real QA sessions were found.');
  }

  const outDir = resolve(REPO_ROOT, 'test-results', 'real-session-quality');
  mkdirSync(outDir, { recursive: true });

  const summary: Array<Record<string, unknown>> = [];

  for (const [index, session] of sessions.entries()) {
    const inputs = session.tailored_sections?.inputs ?? {};
    const resumeText = typeof inputs.resume_text === 'string' ? inputs.resume_text : '';
    const jobDescription = typeof inputs.job_description === 'string' ? inputs.job_description : '';
    if (resumeText.length < 50 || jobDescription.length < 50) continue;

    const label = `real-pair-${index + 1}`;
    const startedAt = Date.now();
    const careerProfile = await loadCareerProfileContext(session.user_id);
    const pipelineState = await runV2Pipeline({
      resume_text: resumeText,
      job_description: jobDescription,
      session_id: `qa-${session.id}`,
      user_id: session.user_id,
      career_profile: careerProfile ?? undefined,
      emit: () => {},
    });
    const durationMs = Date.now() - startedAt;

    if (!pipelineState.job_intelligence || !pipelineState.benchmark_candidate || !pipelineState.gap_analysis || !pipelineState.final_resume) {
      throw new Error(`Pipeline returned incomplete state for session ${session.id}`);
    }

    const jobRequirements = collectJobRequirements(pipelineState.job_intelligence, pipelineState.gap_analysis);
    const benchmarkRequirements = collectBenchmarkRequirements(pipelineState.benchmark_candidate, pipelineState.gap_analysis);
    const finalDraft = (pipelineState.final_resume as AssemblyOutput).final_resume;
    const finalResumeText = buildResumeText(finalDraft);
    const sourceOutline = buildSourceResumeOutline(resumeText);
    const proofDensity = summarizeProofDensity(sourceOutline, finalDraft);
    const prompts = buildFinalReviewPrompts({
      companyName: pipelineState.job_intelligence.company_name || 'Target Company',
      roleTitle: pipelineState.job_intelligence.role_title || 'Target Role',
      resumeText: finalResumeText,
      jobDescription,
      jobRequirements,
      hiddenSignals: pipelineState.job_intelligence.hidden_hiring_signals,
      benchmarkProfileSummary: pipelineState.benchmark_candidate.ideal_profile_summary,
      benchmarkRequirements,
      careerProfile: careerProfile ?? null,
    });

    const reviewTrackingSessionId = `${pipelineState.session_id}:final-review`;
    startUsageTracking(reviewTrackingSessionId, session.user_id);
    setUsageTrackingContext(reviewTrackingSessionId);
    let reviewResponse: Awaited<ReturnType<typeof llm.chat>>;
    try {
      reviewResponse = await llm.chat({
        model: MODEL_PRIMARY,
        system: prompts.systemPrompt,
        messages: [{ role: 'user', content: prompts.userPrompt }],
        max_tokens: 1800,
      });
    } finally {
      stopUsageTracking(reviewTrackingSessionId);
    }

    const repaired = repairJSON<unknown>(reviewResponse.text);
    const parsedReview = finalReviewResultSchema.parse(repaired);
    const rawHardRisks = extractHardRequirementRisksFromGapAnalysis(pipelineState.gap_analysis);
    const materialJobFitRisks = extractMaterialJobFitRisksFromGapAnalysis(pipelineState.gap_analysis);
    const effectiveHardRisks = getEffectiveHardRequirementRisks(parsedReview, rawHardRisks, finalResumeText);
    const finalReview = stabilizeFinalReviewResult(parsedReview, {
      hardRequirementRisks: rawHardRisks,
      materialJobFitRisks,
      resumeText: finalResumeText,
    });

    const artifact = {
      label,
      source_session_id: session.id,
      created_at: session.created_at,
      duration_ms: durationMs,
      company_name: pipelineState.job_intelligence.company_name,
      role_title: pipelineState.job_intelligence.role_title,
      source_resume_positions: sourceOutline.positions.length,
      source_resume_bullets: sourceOutline.total_bullets,
      final_professional_positions: finalDraft.professional_experience.length,
      final_earlier_career_positions: finalDraft.earlier_career?.length ?? 0,
      final_selected_accomplishments: finalDraft.selected_accomplishments.length,
      final_professional_bullets: countDraftProfessionalBullets(finalDraft),
      final_resume_text_length: finalResumeText.length,
      final_resume_line_count: finalResumeText.split('\n').length,
      proof_density: proofDensity,
      job_requirement_count: jobRequirements.length,
      benchmark_requirement_count: benchmarkRequirements.length,
      hard_requirement_risks: effectiveHardRisks,
      gap_strength_summary: pipelineState.gap_analysis.strength_summary,
      critical_gaps: pipelineState.gap_analysis.critical_gaps,
      recruiter_scan: finalReview.six_second_scan,
      hiring_manager_verdict: finalReview.hiring_manager_verdict,
      fit_assessment: finalReview.fit_assessment,
      top_wins: finalReview.top_wins,
      concerns: finalReview.concerns,
      improvement_summary: finalReview.improvement_summary,
    };

    writeFileSync(resolve(outDir, `${label}.json`), `${JSON.stringify(artifact, null, 2)}\n`);

    summary.push({
      label,
      source_session_id: session.id,
      duration_minutes: Number((durationMs / 60_000).toFixed(2)),
      company_name: pipelineState.job_intelligence.company_name,
      role_title: pipelineState.job_intelligence.role_title,
      source_resume_positions: sourceOutline.positions.length,
      source_resume_bullets: sourceOutline.total_bullets,
      final_professional_positions: finalDraft.professional_experience.length,
      final_earlier_career_positions: finalDraft.earlier_career?.length ?? 0,
      final_selected_accomplishments: finalDraft.selected_accomplishments.length,
      final_professional_bullets: countDraftProfessionalBullets(finalDraft),
      final_resume_text_length: finalResumeText.length,
      final_resume_line_count: finalResumeText.split('\n').length,
      source_average_bullet_chars: proofDensity.source_average_bullet_chars,
      final_average_bullet_chars: proofDensity.final_average_bullet_chars,
      professional_bullet_char_ratio: proofDensity.professional_bullet_char_ratio,
      original_proof_bullets: proofDensity.original_proof_bullets,
      enhanced_proof_bullets: proofDensity.enhanced_proof_bullets,
      drafted_proof_bullets: proofDensity.drafted_proof_bullets,
      roles_below_density_floor: proofDensity.roles_below_density_floor,
      recruiter_decision: finalReview.six_second_scan.decision,
      verdict: finalReview.hiring_manager_verdict.rating,
      hard_requirement_risks: effectiveHardRisks.length,
      critical_concerns: finalReview.concerns.filter((item) => item.severity === 'critical').length,
      top_signal_preview: finalReview.six_second_scan.top_signals_seen[0]?.signal ?? null,
    });
  }

  writeFileSync(resolve(outDir, 'summary.json'), `${JSON.stringify({ generated_at: new Date().toISOString(), sessions: summary }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

runRealSessionQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
