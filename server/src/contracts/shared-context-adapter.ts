import type { ClientProfile } from '../agents/onboarding/types.js';
import type { CareerProfileV2 } from '../lib/career-profile-context.js';
import type { EmotionalBaseline } from '../lib/emotional-baseline.js';
import type { PlatformContextRow } from '../lib/platform-context.js';
import {
  createBenchmarkGapEvidenceItem,
  mapLegacyPlatformEvidenceToEvidenceItem,
  summarizeEvidenceInventory,
  type EvidenceItem,
} from './shared-evidence.js';
import {
  createEmptySharedContext,
  type SharedArtifactReference,
  type SharedContext,
  type SharedContextOverride,
} from './shared-context.js';

type BundleSourceRows = {
  userId: string;
  careerProfile: CareerProfileV2 | null;
  clientProfileRow?: PlatformContextRow | null;
  positioningStrategyRow?: PlatformContextRow | null;
  benchmarkCandidateRow?: PlatformContextRow | null;
  gapAnalysisRow?: PlatformContextRow | null;
  careerNarrativeRow?: PlatformContextRow | null;
  industryResearchRow?: PlatformContextRow | null;
  linkedInProfileRow?: PlatformContextRow | null;
  targetRoleRow?: PlatformContextRow | null;
  evidenceRows?: PlatformContextRow[];
  emotionalBaseline?: EmotionalBaseline | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function pushUnique(target: string[], values: Array<string | null | undefined>) {
  const existing = new Set(target.map((value) => value.toLowerCase()));
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    target.push(trimmed);
  }
}

function makeArtifactRef(row: PlatformContextRow | null | undefined, artifactType: string): SharedArtifactReference | null {
  if (!row) return null;
  return {
    artifactId: row.id,
    artifactType,
    contextType: row.context_type,
    sourceProduct: row.source_product,
    sourceSessionId: row.source_session_id,
    updatedAt: row.updated_at,
    summary: `${row.context_type} from ${row.source_product}`,
  };
}

function collectBenchmarkRequirements(benchmark: Record<string, unknown> | null): string[] {
  if (!benchmark) return [];
  return [
    ...asStringArray(benchmark.expected_industry_knowledge),
    ...asStringArray(benchmark.expected_technical_skills),
    ...asStringArray(benchmark.expected_certifications),
    ...asStringArray(benchmark.differentiators),
    ...asStringArray(benchmark.must_have_signals),
  ];
}

function collectAnsweredDiscoveryQuestions(
  benchmarkProfile: CareerProfileV2['benchmark_profile'] | undefined,
): Array<{ id: string; question: string; answer: string; usedBy: string[] }> {
  if (!benchmarkProfile?.discovery_questions?.length) return [];

  return benchmarkProfile.discovery_questions
    .map((question) => ({
      id: question.id,
      question: question.question,
      answer: asString(question.answer) ?? '',
      usedBy: question.used_by,
    }))
    .filter((question) => question.answer.length > 0);
}

export function buildSharedContextFromLegacyBundle(args: BundleSourceRows): SharedContext {
  const context = createEmptySharedContext();

  const clientProfile = asRecord(args.clientProfileRow?.content) as ClientProfile | null;
  const positioningStrategy = asRecord(args.positioningStrategyRow?.content);
  const benchmarkCandidate = asRecord(args.benchmarkCandidateRow?.content);
  const gapAnalysis = asRecord(args.gapAnalysisRow?.content);
  const careerNarrative = asRecord(args.careerNarrativeRow?.content);
  const industryResearch = asRecord(args.industryResearchRow?.content);
  const targetRole = asRecord(args.targetRoleRow?.content);
  const benchmarkProfile = args.careerProfile?.benchmark_profile;
  const answeredDiscoveryQuestions = collectAnsweredDiscoveryQuestions(benchmarkProfile);

  context.candidateProfile.candidateId = args.userId;
  context.candidateProfile.headline = args.careerProfile?.profile_summary ?? null;
  context.candidateProfile.seniorityLevel = clientProfile?.career_level ?? args.careerProfile?.targeting.seniority ?? null;
  context.candidateProfile.yearsOfExperience = typeof clientProfile?.years_experience === 'number'
    ? clientProfile.years_experience
    : null;
  context.candidateProfile.factualSummary = args.careerProfile?.profile_summary ?? null;
  context.candidateProfile.authenticVoiceNotes = [];
  pushUnique(context.candidateProfile.industries, [
    clientProfile?.industry ?? null,
    ...(args.careerProfile?.targeting.target_industries ?? []),
  ]);
  pushUnique(context.candidateProfile.coreFunctions, [
    ...(args.careerProfile?.positioning.core_strengths ?? []),
    ...(clientProfile?.goals ?? []),
  ]);
  context.candidateProfile.leadershipScope.summary = args.careerProfile?.positioning.leadership_scope ?? null;
  context.candidateProfile.leadershipScope.scopeOfResponsibility = args.careerProfile?.positioning.scope_of_responsibility ?? null;

  context.targetRole.roleTitle = asString(targetRole?.target_role)
    ?? asString(positioningStrategy?.target_role)
    ?? args.careerProfile?.targeting.target_roles[0]
    ?? null;
  context.targetRole.roleFamily = asString(targetRole?.role_family);
  context.targetRole.roleLevel = asString(targetRole?.target_seniority)
    ?? asString(positioningStrategy?.target_seniority)
    ?? args.careerProfile?.targeting.seniority
    ?? null;
  context.targetRole.jobDescriptionText = asString(targetRole?.job_description_text)
    ?? asString(targetRole?.job_description);
  pushUnique(context.targetRole.jobRequirements, [
    ...asStringArray(targetRole?.requirements),
    ...asStringArray(targetRole?.target_requirements),
  ]);
  context.targetRole.mustHaveRequirements = asStringArray(targetRole?.must_have_requirements);
  context.targetRole.preferredRequirements = asStringArray(targetRole?.preferred_requirements);
  context.targetRole.responsibilities = asStringArray(targetRole?.responsibilities);
  context.targetRole.locationRequirements = asStringArray(targetRole?.location_requirements);

  context.targetCompany.companyName = asString(targetRole?.company_name) ?? asString(targetRole?.target_company);
  context.targetCompany.ownershipModel = asString(industryResearch?.ownership_model);
  context.targetCompany.knownStrategicPriorities = asStringArray(industryResearch?.strategic_priorities);

  context.industryContext.primaryIndustry = asString(industryResearch?.primary_industry)
    ?? clientProfile?.industry
    ?? null;
  context.industryContext.adjacentIndustries = asStringArray(industryResearch?.adjacent_industries);
  context.industryContext.industryConstraints = asStringArray(industryResearch?.industry_constraints);
  context.industryContext.regulatoryContext = asStringArray(industryResearch?.regulatory_context);
  context.industryContext.commonSuccessSignals = asStringArray(industryResearch?.common_success_signals);
  context.industryContext.domainLanguage = asStringArray(industryResearch?.domain_language);

  context.sourceArtifacts.careerProfile = makeArtifactRef(
    args.careerProfile
      ? {
          id: 'career_profile_runtime',
          user_id: args.userId,
          context_type: 'career_profile',
          content: args.careerProfile as unknown as Record<string, unknown>,
          source_product: args.careerProfile.source,
          source_session_id: null,
          version: 1,
          created_at: args.careerProfile.generated_at,
          updated_at: args.careerProfile.generated_at,
        }
      : null,
    'career_profile',
  );
  context.sourceArtifacts.clientProfile = makeArtifactRef(args.clientProfileRow, 'client_profile');
  context.sourceArtifacts.targetRole = makeArtifactRef(args.targetRoleRow, 'target_role');
  context.sourceArtifacts.positioningStrategy = makeArtifactRef(args.positioningStrategyRow, 'positioning_strategy');
  context.sourceArtifacts.benchmarkCandidate = makeArtifactRef(args.benchmarkCandidateRow, 'benchmark_candidate');
  context.sourceArtifacts.gapAnalysis = makeArtifactRef(args.gapAnalysisRow, 'gap_analysis');
  context.sourceArtifacts.careerNarrative = makeArtifactRef(args.careerNarrativeRow, 'career_narrative');
  context.sourceArtifacts.industryContext = makeArtifactRef(args.industryResearchRow, 'industry_research');
  context.sourceArtifacts.linkedinProfile = makeArtifactRef(args.linkedInProfileRow, 'linkedin_profile');
  context.sourceArtifacts.evidenceItems = (args.evidenceRows ?? []).map((row) => ({
    artifactId: row.id,
    artifactType: 'evidence_item',
    contextType: row.context_type,
    sourceProduct: row.source_product,
    sourceSessionId: row.source_session_id,
    updatedAt: row.updated_at,
    summary: asString((row.content).text) ?? 'legacy evidence item',
  }));

  context.careerNarrative.careerArc = asString(careerNarrative?.career_arc)
    ?? asString(args.careerProfile?.positioning.narrative_summary)
    ?? null;
  pushUnique(context.careerNarrative.signatureStrengths, [
    ...(args.careerProfile?.positioning.core_strengths ?? []),
    ...asStringArray(careerNarrative?.signature_strengths),
  ]);
  pushUnique(context.careerNarrative.careerThemes, [
    ...(args.careerProfile?.evidence_positioning_statements ?? []),
    ...asStringArray(careerNarrative?.career_themes),
  ]);
  context.careerNarrative.operatingStyle = asString(careerNarrative?.operating_style);
  context.careerNarrative.leadershipIdentity = asString(careerNarrative?.leadership_identity);
  pushUnique(context.careerNarrative.differentiators, [
    ...(args.careerProfile?.positioning.differentiators ?? []),
    ...asStringArray(careerNarrative?.differentiators),
  ]);
  pushUnique(context.careerNarrative.authenticPhrases, [
    args.careerProfile?.narrative.colleagues_came_for_what ?? null,
    args.careerProfile?.narrative.known_for_what ?? null,
  ]);

  context.benchmarkCandidate.benchmarkSummary = asString(benchmarkCandidate?.ideal_profile_summary)
    ?? benchmarkProfile?.identity.benchmark_headline.statement
    ?? null;
  pushUnique(context.benchmarkCandidate.benchmarkRequirements, collectBenchmarkRequirements(benchmarkCandidate));
  pushUnique(context.benchmarkCandidate.benchmarkSignals, [
    ...asStringArray(benchmarkCandidate?.expected_industry_knowledge),
    ...asStringArray(benchmarkCandidate?.expected_technical_skills),
    ...(benchmarkProfile?.linkedin_brand.recruiter_keywords ?? []),
  ]);
  pushUnique(context.benchmarkCandidate.benchmarkWins, [
    ...asStringArray(benchmarkCandidate?.differentiators),
    ...(benchmarkProfile?.proof.signature_accomplishments.map((item) => item.statement) ?? []),
  ]);
  pushUnique(context.benchmarkCandidate.differentiators, [
    ...asStringArray(benchmarkCandidate?.differentiators),
    ...(benchmarkProfile?.proof.proof_themes.map((item) => item.statement) ?? []),
  ]);
  pushUnique(context.benchmarkCandidate.benchmarkGapsRelativeToCandidate, [
    ...asStringArray(gapAnalysis?.critical_gaps),
    ...(benchmarkProfile?.risk_and_gaps.objections.map((item) => item.statement) ?? []),
    ...(benchmarkProfile?.risk_and_gaps.adjacent_proof_needed.map((item) => item.statement) ?? []),
  ]);

  context.gapAnalysis.coverageSummary = asString(gapAnalysis?.strength_summary);
  pushUnique(context.gapAnalysis.requirements, Array.isArray(gapAnalysis?.requirements)
    ? (gapAnalysis?.requirements as Array<Record<string, unknown>>).map((req) => asString(req.requirement)).filter((value): value is string => !!value)
    : []);
  pushUnique(context.gapAnalysis.mustHaveGaps, asStringArray(gapAnalysis?.must_have_gaps));
  pushUnique(context.gapAnalysis.preferredGaps, asStringArray(gapAnalysis?.preferred_gaps));
  pushUnique(context.gapAnalysis.benchmarkGaps, asStringArray(gapAnalysis?.benchmark_gaps));
  pushUnique(context.gapAnalysis.criticalRisks, asStringArray(gapAnalysis?.critical_gaps));
  pushUnique(context.gapAnalysis.nextBestActions, asStringArray(gapAnalysis?.next_best_actions));

  context.positioningStrategy.positioningAngle = asString(positioningStrategy?.angle)
    ?? asString(positioningStrategy?.positioning_statement)
    ?? args.careerProfile?.positioning.positioning_statement
    ?? null;
  pushUnique(context.positioningStrategy.supportingThemes, [
    ...(args.careerProfile?.positioning.proof_themes ?? []),
    ...asStringArray(positioningStrategy?.supporting_themes),
  ]);
  pushUnique(context.positioningStrategy.narrativePriorities, asStringArray(positioningStrategy?.narrative_priorities));
  pushUnique(context.positioningStrategy.riskAreas, [
    ...asStringArray(positioningStrategy?.risk_areas),
    ...(benchmarkProfile?.risk_and_gaps.objections.map((item) => item.statement) ?? []),
    ...(benchmarkProfile?.risk_and_gaps.claims_to_soften.map((item) => item.statement) ?? []),
  ]);
  pushUnique(context.positioningStrategy.approvedFraming, [
    ...asStringArray(positioningStrategy?.approved_framing),
    benchmarkProfile?.approved_language.positioning_statement,
    benchmarkProfile?.approved_language.resume_summary_seed,
    benchmarkProfile?.approved_language.linkedin_opening,
    benchmarkProfile?.approved_language.networking_intro,
    benchmarkProfile?.approved_language.cover_letter_thesis,
    ...answeredDiscoveryQuestions.map((question) => `Candidate discovery answer: ${question.answer}`),
  ]);
  pushUnique(context.positioningStrategy.framingStillRequiringConfirmation, [
    ...asStringArray(positioningStrategy?.framing_still_requiring_confirmation),
    ...context.careerNarrative.missingConfirmation,
    ...(benchmarkProfile?.discovery_questions
      .filter((question) => !asString(question.answer))
      .map((question) => question.question) ?? []),
    ...(benchmarkProfile
      ? [
          benchmarkProfile.identity.benchmark_headline,
          benchmarkProfile.identity.why_me_story,
          benchmarkProfile.identity.why_not_me,
          benchmarkProfile.identity.operating_identity,
          ...benchmarkProfile.proof.signature_accomplishments,
          ...benchmarkProfile.proof.proof_themes,
          ...benchmarkProfile.risk_and_gaps.adjacent_proof_needed,
          ...benchmarkProfile.risk_and_gaps.claims_to_soften,
        ]
          .filter((item) => item.review_status !== 'approved')
          .map((item) => item.statement)
      : []),
  ]);

  const mappedEvidence: EvidenceItem[] = [];
  for (const row of args.evidenceRows ?? []) {
    const item = mapLegacyPlatformEvidenceToEvidenceItem(row.content, {
      sourceProduct: row.source_product,
      sourceContextType: row.context_type,
      sourceArtifactId: row.source_session_id,
      capturedAt: row.updated_at,
    });
    if (item) mappedEvidence.push(item);
  }

  for (const requirement of context.benchmarkCandidate.benchmarkRequirements) {
    mappedEvidence.push(
      createBenchmarkGapEvidenceItem({
        statement: requirement,
        supports: ['benchmark gap prioritization'],
        sourceArtifactId: args.benchmarkCandidateRow?.id ?? null,
        sourceExcerpt: context.benchmarkCandidate.benchmarkSummary,
        sourceProduct: args.benchmarkCandidateRow?.source_product ?? null,
        capturedAt: args.benchmarkCandidateRow?.updated_at ?? null,
      }),
    );
  }

  for (const question of answeredDiscoveryQuestions) {
    mappedEvidence.push({
      id: `ev_benchmark_discovery_${question.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      level: 'StrongAdjacentProof',
      statement: question.answer,
      sourceType: 'benchmark_profile_discovery_answer',
      sourceArtifactId: context.sourceArtifacts.careerProfile?.artifactId ?? null,
      sourceExcerpt: `Q: ${question.question}\nA: ${question.answer}`,
      supports: question.usedBy.length > 0 ? question.usedBy : ['benchmark profile discovery'],
      limitations: ['Candidate-provided discovery answer; preserve nuance and avoid adding unsupported metrics, tools, credentials, or scope.'],
      requiresConfirmation: false,
      finalArtifactEligible: true,
      riskLabel: 'Moderate',
      confidence: 'Moderate',
      provenance: {
        origin: 'platform_context',
        sourceProduct: args.careerProfile?.source ?? 'profile-setup',
        sourceSessionId: null,
        sourceContextType: 'career_profile',
        capturedAt: args.careerProfile?.generated_at ?? null,
        mapper: 'collectAnsweredDiscoveryQuestions',
      },
      metadata: {
        benchmark_profile_question_id: question.id,
        question: question.question,
      },
    });
  }

  context.evidenceInventory = summarizeEvidenceInventory(mappedEvidence);

  context.constraints.mustRemainTruthful = true;
  context.constraints.allowedInferenceLevel = 'supportable_inference';
  pushUnique(context.constraints.voiceConstraints, [
    ...(args.careerProfile?.preferences.constraints ?? []),
  ]);
  pushUnique(context.constraints.ageSensitivityGuidance, ['avoid age-coded language', 'prefer current, evidence-grounded executive framing']);

  const sourceProducts = new Set<string>();
  const sourceSummaries: Record<string, string> = {};
  const lastUpdatedValues: string[] = [];
  if (args.careerProfile) {
    sourceProducts.add(args.careerProfile.source);
    sourceSummaries.career_profile = `${args.careerProfile.source} @ ${args.careerProfile.generated_at}`;
    lastUpdatedValues.push(args.careerProfile.generated_at);
    context.provenance.legacyContextTypesLoaded.push('career_profile');
  }
  for (const row of [
    args.clientProfileRow,
    args.positioningStrategyRow,
    args.benchmarkCandidateRow,
    args.gapAnalysisRow,
    args.careerNarrativeRow,
    args.industryResearchRow,
    args.linkedInProfileRow,
    args.targetRoleRow,
    ...(args.evidenceRows ?? []),
  ]) {
    if (!row) continue;
    sourceProducts.add(row.source_product);
    sourceSummaries[row.context_type] = `${row.source_product} @ ${row.updated_at}`;
    lastUpdatedValues.push(row.updated_at);
    context.provenance.legacyContextTypesLoaded.push(row.context_type);
  }
  context.provenance.sourceProducts = [...sourceProducts];
  context.provenance.sourceSummaries = sourceSummaries;
  context.provenance.lastUpdatedAt = lastUpdatedValues.sort().at(-1) ?? args.careerProfile?.generated_at ?? null;
  context.provenance.lastUpdatedBy = 'compatibility_adapter';
  context.provenance.contextVersion = 1;
  pushUnique(context.provenance.inferenceNotes, [
    'SharedContext is currently built through compatibility adapters over legacy platform context rows.',
    benchmarkProfile ? 'Benchmark Profile v1 is available and mapped into shared positioning, proof, risk, and approved language.' : null,
  ]);
  pushUnique(context.provenance.benchmarkSources, [
    args.benchmarkCandidateRow ? `${args.benchmarkCandidateRow.source_product}:${args.benchmarkCandidateRow.id}` : null,
  ]);

  context.workflowState.room = 'cross_product_context';
  context.workflowState.stage = 'loaded';
  context.workflowState.activeTask = 'provide canonical shared context to downstream products';
  context.workflowState.reviewStatus = 'not_started';
  context.workflowState.pendingQuestions = benchmarkProfile
    ? benchmarkProfile.discovery_questions.filter((question) => !asString(question.answer)).length
    : 0;
  context.workflowState.pendingApprovals = benchmarkProfile
    ? [
        benchmarkProfile.identity.benchmark_headline,
        benchmarkProfile.identity.why_me_story,
        benchmarkProfile.identity.why_not_me,
        benchmarkProfile.identity.operating_identity,
        ...benchmarkProfile.proof.signature_accomplishments,
        ...benchmarkProfile.proof.proof_themes,
        ...benchmarkProfile.linkedin_brand.content_pillars,
        ...benchmarkProfile.risk_and_gaps.objections,
        ...benchmarkProfile.risk_and_gaps.adjacent_proof_needed,
        ...benchmarkProfile.risk_and_gaps.claims_to_soften,
      ].filter((item) => item.review_status !== 'approved').length
    : 0;

  return context;
}

export function applySharedContextOverride(
  context: SharedContext,
  override: SharedContextOverride,
): SharedContext {
  return {
    ...context,
    artifactTarget: {
      ...context.artifactTarget,
      ...(override.artifactTarget ?? {}),
    },
    workflowState: {
      ...context.workflowState,
      ...(override.workflowState ?? {}),
    },
  };
}
