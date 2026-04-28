import {
  hasMeaningfulSharedValue,
  type SharedBenchmarkCandidate,
  type SharedCandidateProfile,
  type SharedCareerNarrative,
  type SharedContext,
  type SharedGapAnalysis,
  type SharedIndustryContext,
  type SharedPositioningStrategy,
} from './shared-context.js';
import type { EvidenceInventorySummary, EvidenceItem } from './shared-evidence.js';

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

  const next: string[] = [];
  const seen = new Set<string>();

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

function firstMeaningful(...values: unknown[]): string | null {
  for (const value of values) {
    const next = asString(value);
    if (next) return next;
  }
  return null;
}

function pushLine(lines: string[], label: string, value: string | null) {
  if (!value) return;
  lines.push(`- ${label}: ${value}`);
}

function pushListLine(lines: string[], label: string, values: string[], maxItems = 20) {
  if (!values.length) return;
  lines.push(`- ${label}: ${values.slice(0, maxItems).join(', ')}`);
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function section(heading: string, lines: string[]): string[] {
  const clean = lines
    .map((line) => line.trim())
    .filter(Boolean);

  if (!clean.length) return [];
  return [heading, ...clean, ''];
}

function summarizeLegacyEvidenceItem(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null;

  const record = asRecord(raw);
  if (!record) return null;

  const fragments = uniqueNonEmpty([
    asString(record.text),
    asString(record.statement),
    asString(record.claim),
    asString(record.situation),
    asString(record.action),
    asString(record.result),
    asString(record.achievement),
    asString(record.impact),
    asString(record.metric),
    asString(record.outcome),
  ]);

  return fragments.length ? fragments.join('; ') : null;
}

function formatEvidenceItem(item: EvidenceItem): string {
  const flags: string[] = [item.level];
  if (item.requiresConfirmation) flags.push('needs confirmation');
  if (!item.finalArtifactEligible) flags.push('not export-ready');

  return `- [${flags.join(' | ')}] ${item.statement}`;
}

export function renderTargetingSummaryLines(
  sharedContext?: SharedContext | null,
  legacyPositioningStrategy?: unknown,
): string[] {
  const legacy = asRecord(legacyPositioningStrategy);
  const lines: string[] = [];

  pushLine(
    lines,
    'Target role',
    firstMeaningful(sharedContext?.targetRole.roleTitle, legacy?.target_role),
  );
  pushLine(
    lines,
    'Role family',
    firstMeaningful(sharedContext?.targetRole.roleFamily, legacy?.role_family),
  );
  pushLine(
    lines,
    'Role level',
    firstMeaningful(sharedContext?.targetRole.roleLevel, legacy?.target_seniority, legacy?.target_level),
  );
  pushListLine(
    lines,
    'Target titles',
    uniqueNonEmpty(asStringArray(legacy?.target_titles)),
  );
  pushLine(
    lines,
    'Target industry',
    firstMeaningful(sharedContext?.industryContext.primaryIndustry, legacy?.target_industry),
  );
  pushLine(
    lines,
    'Target company',
    firstMeaningful(sharedContext?.targetCompany.companyName, legacy?.target_company),
  );

  return lines;
}

export function renderPositioningStrategySection(args: {
  heading: string;
  sharedStrategy?: SharedPositioningStrategy | null;
  legacyStrategy?: unknown;
}): string[] {
  const legacy = asRecord(args.legacyStrategy);
  const strategy = args.sharedStrategy;
  const lines: string[] = [];

  pushLine(
    lines,
    'Positioning angle',
    firstMeaningful(strategy?.positioningAngle, legacy?.angle, legacy?.positioning_statement, legacy?.theme),
  );
  pushLine(lines, 'Positioning focus', firstMeaningful(legacy?.focus));
  pushLine(lines, 'Target role', firstMeaningful(legacy?.target_role));
  pushListLine(lines, 'Target titles', asStringArray(legacy?.target_titles), 5);
  pushLine(
    lines,
    'Target level',
    firstMeaningful(legacy?.target_level, legacy?.target_seniority),
  );
  pushLine(lines, 'Target industry', firstMeaningful(legacy?.target_industry));
  pushListLine(
    lines,
    'Supporting themes',
    uniqueNonEmpty([
      ...strategy?.supportingThemes ?? [],
      ...asStringArray(legacy?.themes),
      ...asStringArray(legacy?.key_themes),
      ...asStringArray(legacy?.supporting_themes),
      ...asStringArray(legacy?.proof_themes),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Narrative priorities',
    uniqueNonEmpty([
      ...strategy?.narrativePriorities ?? [],
      ...asStringArray(legacy?.narrative_priorities),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Approved framing',
    uniqueNonEmpty([
      ...strategy?.approvedFraming ?? [],
      ...asStringArray(legacy?.approved_framing),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Risk areas',
    uniqueNonEmpty([
      ...strategy?.riskAreas ?? [],
      ...asStringArray(legacy?.risk_areas),
    ]),
    5,
  );
  pushListLine(
    lines,
    'Needs confirmation',
    uniqueNonEmpty([
      ...strategy?.framingStillRequiringConfirmation ?? [],
      ...asStringArray(legacy?.framing_still_requiring_confirmation),
    ]),
    4,
  );

  return section(args.heading, lines);
}

export function renderEvidenceInventorySection(args: {
  heading: string;
  sharedInventory?: EvidenceInventorySummary | null;
  legacyEvidence?: unknown[] | null;
  maxItems?: number;
}): string[] {
  const maxItems = typeof args.maxItems === 'number' ? Math.max(1, args.maxItems) : 20;
  const lines: string[] = [];

  if (args.sharedInventory?.evidenceItems?.length) {
    const items = args.sharedInventory.evidenceItems.slice(0, maxItems);
    for (const item of items) {
      lines.push(formatEvidenceItem(item));
    }
    if (args.sharedInventory.overreachRisks.length > 0) {
      lines.push(`- Overreach risks flagged: ${args.sharedInventory.overreachRisks.length}`);
    }
    return section(args.heading, lines);
  }

  if (Array.isArray(args.legacyEvidence) && args.legacyEvidence.length > 0) {
    const items = args.legacyEvidence
      .map((item) => summarizeLegacyEvidenceItem(item))
      .filter((item): item is string => !!item)
      .slice(0, maxItems)
      .map((item) => `- ${item}`);
    return section(args.heading, items);
  }

  return [];
}

export function renderCareerNarrativeSection(args: {
  heading: string;
  sharedNarrative?: SharedCareerNarrative | null;
  legacyNarrative?: unknown;
}): string[] {
  const legacy = asRecord(args.legacyNarrative);
  const narrative = args.sharedNarrative;
  const lines: string[] = [];

  pushLine(
    lines,
    'Career arc',
    firstMeaningful(narrative?.careerArc, legacy?.career_arc, legacy?.narrative_summary),
  );
  pushListLine(
    lines,
    'Signature strengths',
    uniqueNonEmpty([
      ...narrative?.signatureStrengths ?? [],
      ...asStringArray(legacy?.signature_strengths),
    ]),
    10,
  );
  pushListLine(
    lines,
    'Career themes',
    uniqueNonEmpty([
      ...narrative?.careerThemes ?? [],
      ...asStringArray(legacy?.career_themes),
    ]),
    10,
  );
  pushLine(
    lines,
    'Operating style',
    firstMeaningful(narrative?.operatingStyle, legacy?.operating_style),
  );
  pushLine(
    lines,
    'Leadership identity',
    firstMeaningful(narrative?.leadershipIdentity, legacy?.leadership_identity),
  );
  pushListLine(
    lines,
    'Differentiators',
    uniqueNonEmpty([
      ...narrative?.differentiators ?? [],
      ...asStringArray(legacy?.differentiators),
    ]),
    10,
  );
  pushListLine(
    lines,
    'Authentic phrases',
    uniqueNonEmpty([
      ...narrative?.authenticPhrases ?? [],
      ...asStringArray(legacy?.authentic_phrases),
    ]),
    10,
  );

  return section(args.heading, lines);
}

export function renderIndustryContextSection(args: {
  heading: string;
  sharedIndustry?: SharedIndustryContext | null;
  legacyIndustry?: unknown;
}): string[] {
  const legacy = asRecord(args.legacyIndustry);
  const industry = args.sharedIndustry;
  const lines: string[] = [];

  pushLine(
    lines,
    'Primary industry',
    firstMeaningful(industry?.primaryIndustry, legacy?.primary_industry),
  );
  pushListLine(
    lines,
    'Adjacent industries',
    uniqueNonEmpty([
      ...industry?.adjacentIndustries ?? [],
      ...asStringArray(legacy?.adjacent_industries),
    ]),
    4,
  );
  pushListLine(
    lines,
    'Common success signals',
    uniqueNonEmpty([
      ...industry?.commonSuccessSignals ?? [],
      ...asStringArray(legacy?.common_success_signals),
    ]),
    5,
  );
  pushListLine(
    lines,
    'Domain language',
    uniqueNonEmpty([
      ...industry?.domainLanguage ?? [],
      ...asStringArray(legacy?.domain_language),
    ]),
    12,
  );
  pushListLine(
    lines,
    'Industry constraints',
    uniqueNonEmpty([
      ...industry?.industryConstraints ?? [],
      ...asStringArray(legacy?.industry_constraints),
    ]),
    4,
  );
  pushListLine(
    lines,
    'Regulatory context',
    uniqueNonEmpty([
      ...industry?.regulatoryContext ?? [],
      ...asStringArray(legacy?.regulatory_context),
    ]),
    4,
  );

  return section(args.heading, lines);
}

export function renderBenchmarkCandidateSection(args: {
  heading: string;
  sharedBenchmark?: SharedBenchmarkCandidate | null;
  legacyBenchmark?: unknown;
}): string[] {
  const legacy = asRecord(args.legacyBenchmark);
  const benchmark = args.sharedBenchmark;
  const lines: string[] = [];

  pushLine(
    lines,
    'Benchmark summary',
    firstMeaningful(benchmark?.benchmarkSummary, legacy?.ideal_profile_summary),
  );
  pushListLine(
    lines,
    'Benchmark requirements',
    uniqueNonEmpty([
      ...benchmark?.benchmarkRequirements ?? [],
      ...asStringArray(legacy?.expected_industry_knowledge),
      ...asStringArray(legacy?.expected_technical_skills),
      ...asStringArray(legacy?.must_have_signals),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Benchmark signals',
    uniqueNonEmpty([
      ...benchmark?.benchmarkSignals ?? [],
      ...asStringArray(legacy?.benchmark_signals),
    ]),
    5,
  );
  pushListLine(
    lines,
    'Differentiators',
    uniqueNonEmpty([
      ...benchmark?.differentiators ?? [],
      ...asStringArray(legacy?.differentiators),
    ]),
    5,
  );
  pushListLine(
    lines,
    'Gaps relative to candidate',
    uniqueNonEmpty([
      ...benchmark?.benchmarkGapsRelativeToCandidate ?? [],
      ...asStringArray(legacy?.benchmark_gaps_relative_to_candidate),
    ]),
    10,
  );

  return section(args.heading, lines);
}

export function renderBenchmarkProfileDirectionSection(args: {
  heading: string;
  sharedContext?: SharedContext | null;
  maxApprovedFraming?: number;
  maxConfirmationItems?: number;
}): string[] {
  const sharedContext = args.sharedContext;
  if (!sharedContext) return [];

  const benchmark = sharedContext.benchmarkCandidate;
  const strategy = sharedContext.positioningStrategy;
  const narrative = sharedContext.careerNarrative;
  const maxApprovedFraming = typeof args.maxApprovedFraming === 'number'
    ? Math.max(1, args.maxApprovedFraming)
    : 8;
  const maxConfirmationItems = typeof args.maxConfirmationItems === 'number'
    ? Math.max(1, args.maxConfirmationItems)
    : 6;

  const lines: string[] = [
    '- Use this as the candidate brand source of truth. Prefer approved language when useful; use risk and confirmation items as softening notes, discovery questions, or gaps, not final claims.',
  ];

  pushLine(
    lines,
    'Benchmark identity',
    firstMeaningful(
      benchmark.benchmarkSummary,
      strategy.positioningAngle,
      narrative.leadershipIdentity,
      narrative.careerArc,
      sharedContext.candidateProfile.factualSummary,
    ),
  );
  pushListLine(
    lines,
    'Approved language to reuse or adapt',
    uniqueNonEmpty(strategy.approvedFraming),
    maxApprovedFraming,
  );
  pushListLine(
    lines,
    'Proof themes to reinforce',
    uniqueNonEmpty([
      ...benchmark.benchmarkWins,
      ...benchmark.differentiators,
      ...narrative.signatureStrengths,
      ...narrative.careerThemes,
    ]),
    10,
  );
  pushListLine(
    lines,
    'Recruiter and search signals',
    uniqueNonEmpty(benchmark.benchmarkSignals),
    10,
  );
  pushListLine(
    lines,
    'Risk areas to avoid overclaiming',
    uniqueNonEmpty([
      ...strategy.riskAreas,
      ...benchmark.benchmarkGapsRelativeToCandidate,
    ]),
    8,
  );
  pushListLine(
    lines,
    'Needs candidate confirmation before final claims',
    uniqueNonEmpty(strategy.framingStillRequiringConfirmation),
    maxConfirmationItems,
  );

  if (sharedContext.workflowState.pendingApprovals > 0 || sharedContext.workflowState.pendingQuestions > 0) {
    lines.push(`- Review state: ${sharedContext.workflowState.pendingApprovals} pending approvals, ${sharedContext.workflowState.pendingQuestions} pending discovery questions.`);
  }

  const meaningfulLines = lines.slice(1);
  if (meaningfulLines.length === 0 && !hasMeaningfulSharedValue(benchmark) && !hasMeaningfulSharedValue(strategy)) {
    return [];
  }

  return section(args.heading, lines);
}

export function renderGapAnalysisSection(args: {
  heading: string;
  sharedGapAnalysis?: SharedGapAnalysis | null;
  legacyGapAnalysis?: unknown;
}): string[] {
  const legacy = asRecord(args.legacyGapAnalysis);
  const gap = args.sharedGapAnalysis;
  const lines: string[] = [];

  const coverageSummary = firstMeaningful(gap?.coverageSummary, legacy?.strength_summary);
  if (coverageSummary) {
    lines.push(coverageSummary);
  }

  pushListLine(
    lines,
    'Requirements',
    uniqueNonEmpty([
      ...gap?.requirements ?? [],
      ...asStringArray(legacy?.requirements),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Must-have gaps',
    uniqueNonEmpty([
      ...gap?.mustHaveGaps ?? [],
      ...asStringArray(legacy?.must_have_gaps),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Preferred gaps',
    uniqueNonEmpty([
      ...gap?.preferredGaps ?? [],
      ...asStringArray(legacy?.preferred_gaps),
    ]),
    15,
  );
  pushListLine(
    lines,
    'Benchmark gaps',
    uniqueNonEmpty([
      ...gap?.benchmarkGaps ?? [],
      ...asStringArray(legacy?.benchmark_gaps),
    ]),
    10,
  );
  pushListLine(
    lines,
    'Critical risks',
    uniqueNonEmpty([
      ...gap?.criticalRisks ?? [],
      ...asStringArray(legacy?.critical_gaps),
    ]),
    10,
  );
  pushListLine(
    lines,
    'Next best actions',
    uniqueNonEmpty([
      ...gap?.nextBestActions ?? [],
      ...asStringArray(legacy?.next_best_actions),
    ]),
    10,
  );

  return section(args.heading, lines);
}

export function renderEvidenceSummaryLine(sharedContext?: SharedContext | null): string | null {
  if (!hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) return null;

  const evidenceCount = sharedContext?.evidenceInventory.evidenceItems.length ?? 0;
  const directProofCount = sharedContext?.evidenceInventory.directProof.length ?? 0;
  const adjacentCount = sharedContext?.evidenceInventory.adjacentProof.length ?? 0;

  return `Evidence available: ${evidenceCount} items (${directProofCount} direct, ${adjacentCount} adjacent).`;
}

export function renderCareerProfileSection(args: {
  heading: string;
  sharedContext?: SharedContext | null;
  legacyCareerProfile?: unknown;
}): string[] {
  const legacy = asRecord(args.legacyCareerProfile);
  const targeting = asRecord(legacy?.targeting);
  const positioning = asRecord(legacy?.positioning);
  const candidateProfile: SharedCandidateProfile | undefined = args.sharedContext?.candidateProfile;
  const lines: string[] = [];

  pushLine(
    lines,
    'Profile summary',
    firstMeaningful(
      asString(legacy?.profile_summary),
      candidateProfile?.factualSummary,
      candidateProfile?.headline,
    ),
  );
  pushListLine(
    lines,
    'Target roles',
    uniqueNonEmpty([
      ...asStringArray(targeting?.target_roles),
    ]),
    4,
  );
  pushListLine(
    lines,
    'Target industries',
    uniqueNonEmpty([
      ...asStringArray(targeting?.target_industries),
      ...(candidateProfile?.industries ?? []),
    ]),
    4,
  );
  pushLine(
    lines,
    'Target seniority',
    firstMeaningful(asString(targeting?.seniority), candidateProfile?.seniorityLevel),
  );
  pushLine(
    lines,
    'Positioning statement',
    firstMeaningful(asString(positioning?.positioning_statement)),
  );
  pushLine(
    lines,
    'Narrative summary',
    firstMeaningful(asString(positioning?.narrative_summary)),
  );
  pushListLine(
    lines,
    'Core strengths',
    uniqueNonEmpty([
      ...asStringArray(positioning?.core_strengths),
      ...(candidateProfile?.coreFunctions ?? []),
    ]),
    5,
  );
  pushListLine(
    lines,
    'Differentiators',
    uniqueNonEmpty(asStringArray(positioning?.differentiators)),
    5,
  );
  pushLine(
    lines,
    'Leadership scope',
    firstMeaningful(asString(positioning?.leadership_scope), candidateProfile?.leadershipScope.summary),
  );
  pushLine(
    lines,
    'Scope of responsibility',
    firstMeaningful(
      asString(positioning?.scope_of_responsibility),
      candidateProfile?.leadershipScope.scopeOfResponsibility,
    ),
  );

  return section(args.heading, lines);
}

export function renderWhyMeStorySection(args: {
  heading: string;
  legacyWhyMeStory?: unknown;
}): string[] {
  const raw = args.legacyWhyMeStory;
  if (typeof raw === 'string') {
    return section(args.heading, [raw]);
  }

  const story = asRecord(raw);
  if (!story) return [];

  const lines: string[] = [];
  pushLine(
    lines,
    'Colleagues came for',
    firstMeaningful(story.colleaguesCameForWhat, story.colleagues_came_for_what),
  );
  pushLine(
    lines,
    'Known for',
    firstMeaningful(story.knownForWhat, story.known_for_what),
  );
  pushLine(
    lines,
    'Why not me',
    firstMeaningful(story.whyNotMe, story.why_not_me),
  );
  pushLine(
    lines,
    'Story snippet',
    firstMeaningful(story.storySnippet, story.story_snippet),
  );

  return section(args.heading, lines);
}

export function renderClientProfileSection(args: {
  heading: string;
  legacyClientProfile?: unknown;
}): string[] {
  const profile = asRecord(args.legacyClientProfile);
  if (!profile) return [];

  const yearsExperience = typeof profile.years_experience === 'number'
    ? String(profile.years_experience)
    : asString(profile.years_experience);
  const urgencyScore = typeof profile.urgency_score === 'number'
    ? String(profile.urgency_score)
    : asString(profile.urgency_score);
  const lines: string[] = [];

  pushLine(lines, 'Career level', firstMeaningful(profile.career_level));
  pushLine(lines, 'Industry', firstMeaningful(profile.industry));
  pushLine(lines, 'Years of experience', yearsExperience);
  pushLine(lines, 'Financial segment', firstMeaningful(profile.financial_segment));
  pushLine(lines, 'Emotional state', firstMeaningful(profile.emotional_state));
  pushLine(lines, 'Transition type', firstMeaningful(profile.transition_type));
  pushListLine(lines, 'Goals', asStringArray(profile.goals), 5);
  pushListLine(lines, 'Constraints', asStringArray(profile.constraints), 5);
  pushListLine(lines, 'Self-reported strengths', asStringArray(profile.strengths_self_reported), 5);
  pushLine(lines, 'Urgency score', urgencyScore);
  pushLine(lines, 'Recommended starting point', firstMeaningful(profile.recommended_starting_point));
  pushLine(lines, 'Coaching tone', firstMeaningful(profile.coaching_tone));

  return section(args.heading, lines);
}

export function renderLinkedInAnalysisSection(args: {
  heading: string;
  legacyLinkedInAnalysis?: unknown;
}): string[] {
  const analysis = asRecord(args.legacyLinkedInAnalysis);
  if (!analysis) return [];

  const keywordAnalysis = asRecord(analysis.keyword_analysis);
  const profileAnalysis = asRecord(analysis.profile_analysis);
  const coverageScore = typeof keywordAnalysis?.coverage_score === 'number'
    ? `${keywordAnalysis.coverage_score}%`
    : asString(keywordAnalysis?.coverage_score);
  const lines: string[] = [];

  pushLine(lines, 'Coverage score', coverageScore);
  pushListLine(lines, 'Missing keywords', asStringArray(keywordAnalysis?.missing_keywords), 6);
  pushListLine(lines, 'Recommended keywords', asStringArray(keywordAnalysis?.recommended_keywords), 6);
  pushListLine(lines, 'Present keywords', asStringArray(keywordAnalysis?.present_keywords), 6);
  pushLine(lines, 'Headline assessment', firstMeaningful(profileAnalysis?.headline_assessment));
  pushLine(lines, 'About assessment', firstMeaningful(profileAnalysis?.about_assessment));
  pushListLine(lines, 'Positioning gaps', asStringArray(profileAnalysis?.positioning_gaps), 5);
  pushListLine(lines, 'Profile strengths', asStringArray(profileAnalysis?.strengths), 5);

  return section(args.heading, lines);
}
