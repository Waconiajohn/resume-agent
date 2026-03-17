import type { AssessmentSummary, ClientProfile } from '../agents/onboarding/types.js';
import { getEmotionalBaseline, type EmotionalBaseline } from './emotional-baseline.js';
import {
  getLatestUserContext,
  getUserContext,
  getWhyMeContext,
  upsertUserContext,
  type WhyMeContext,
} from './platform-context.js';
import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

export type CareerProfileSignalLevel = 'green' | 'yellow' | 'red';
export type CareerProfileDashboardState = 'new-user' | 'refining' | 'strong';
export type CareerProfileCompletenessStatus = 'ready' | 'partial' | 'missing';

export interface CareerProfileV2 {
  version: 'career_profile_v2';
  source: 'career_profile' | 'legacy_migration';
  generated_at: string;
  targeting: {
    target_roles: string[];
    target_industries: string[];
    seniority: string;
    transition_type: string;
    preferred_company_environments: string[];
  };
  positioning: {
    core_strengths: string[];
    proof_themes: string[];
    differentiators: string[];
    adjacent_positioning: string[];
    positioning_statement: string;
    narrative_summary: string;
    leadership_scope: string;
    scope_of_responsibility: string;
  };
  narrative: {
    colleagues_came_for_what: string;
    known_for_what: string;
    why_not_me: string;
    story_snippet: string;
  };
  preferences: {
    must_haves: string[];
    constraints: string[];
    compensation_direction: string;
  };
  coaching: {
    financial_segment: string;
    emotional_state: string;
    coaching_tone: string;
    urgency_score: number;
    recommended_starting_point: string;
  };
  evidence_positioning_statements: string[];
  profile_signals: {
    clarity: CareerProfileSignalLevel;
    alignment: CareerProfileSignalLevel;
    differentiation: CareerProfileSignalLevel;
  };
  completeness: {
    overall_score: number;
    dashboard_state: CareerProfileDashboardState;
    sections: Array<{
      id: 'direction' | 'positioning' | 'narrative' | 'constraints';
      label: string;
      status: CareerProfileCompletenessStatus;
      score: number;
      summary: string;
    }>;
  };
  profile_summary: string;
  legacy_client_profile?: ClientProfile;
  assessment_summary?: AssessmentSummary;
}

export interface AgentContextBundleOptions {
  includeCareerProfile?: boolean;
  includePositioningStrategy?: boolean;
  includeEvidenceItems?: boolean;
  includeBenchmarkCandidate?: boolean;
  includeGapAnalysis?: boolean;
  includeCareerNarrative?: boolean;
  includeIndustryResearch?: boolean;
  includeWhyMeStory?: boolean;
  includeClientProfile?: boolean;
  includeTargetRole?: boolean;
  includeEmotionalBaseline?: boolean;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => (typeof item === 'string' ? item : null)));
}

function extractStringArray(record: Record<string, unknown> | null | undefined, keys: string[]): string[] {
  if (!record) return [];

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const next = asStringArray(value);
      if (next.length > 0) return next;
    }
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()];
    }
  }

  return [];
}

function extractFirstString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!record) return '';

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function signalFromText(text: string): CareerProfileSignalLevel {
  const trimmed = text.trim();
  if (!trimmed) return 'red';
  if (trimmed.length < 50) return 'yellow';
  return 'green';
}

function scoreForList(values: string[], desired = 2): number {
  if (values.length === 0) return 15;
  if (values.length < desired) return 65;
  return 100;
}

function scoreForText(value: string): number {
  const signal = signalFromText(value);
  if (signal === 'green') return 100;
  if (signal === 'yellow') return 65;
  return 15;
}

function summarizeSection(score: number, readyText: string, partialText: string, missingText: string): string {
  if (score >= 85) return readyText;
  if (score >= 45) return partialText;
  return missingText;
}

function buildEvidenceStatements(
  strengths: string[],
  proofThemes: string[],
  differentiators: string[],
  targetRoles: string[],
): string[] {
  const statements = [
    strengths[0] && targetRoles[0]
      ? `${strengths[0]} positioned against ${targetRoles[0]} requirements.`
      : null,
    proofThemes[0] ? `Proof theme: ${proofThemes[0]}.` : null,
    differentiators[0] ? `Differentiator: ${differentiators[0]}.` : null,
  ];

  return uniqueStrings(statements);
}

function buildProfileSummary(
  targetRoles: string[],
  strengths: string[],
  positioningStatement: string,
  narrativeSummary: string,
): string {
  if (positioningStatement) return positioningStatement;
  if (narrativeSummary) return narrativeSummary;

  const role = targetRoles[0] ?? 'next target role';
  const strength = strengths[0] ?? 'transferable leadership and operating strengths';
  return `Positioning for ${role} with emphasis on ${strength}.`;
}

function normalizeCareerProfile(
  rawCareerProfile: Record<string, unknown> | null,
  clientProfile: ClientProfile | undefined,
  assessmentSummary: AssessmentSummary | undefined,
  whyMeContext: WhyMeContext | null,
  positioningStrategy: Record<string, unknown> | null,
  targetRole: Record<string, unknown> | null,
  baseline: EmotionalBaseline | null,
  fallbackTimestamp: string,
): CareerProfileV2 {
  const targetingRecord = rawCareerProfile && typeof rawCareerProfile.targeting === 'object'
    ? rawCareerProfile.targeting as Record<string, unknown>
    : rawCareerProfile;
  const positioningRecord = rawCareerProfile && typeof rawCareerProfile.positioning === 'object'
    ? rawCareerProfile.positioning as Record<string, unknown>
    : rawCareerProfile;
  const narrativeRecord = rawCareerProfile && typeof rawCareerProfile.narrative === 'object'
    ? rawCareerProfile.narrative as Record<string, unknown>
    : rawCareerProfile;
  const preferencesRecord = rawCareerProfile && typeof rawCareerProfile.preferences === 'object'
    ? rawCareerProfile.preferences as Record<string, unknown>
    : rawCareerProfile;
  const coachingRecord = rawCareerProfile && typeof rawCareerProfile.coaching === 'object'
    ? rawCareerProfile.coaching as Record<string, unknown>
    : rawCareerProfile;

  const targetRoles = uniqueStrings([
    ...extractStringArray(targetingRecord, ['target_roles', 'roles']),
    ...extractStringArray(positioningStrategy, ['target_titles', 'target_roles']),
    extractFirstString(positioningStrategy, ['target_role']),
    extractFirstString(targetRole, ['role_title', 'target_role']),
    ...(clientProfile?.goals ?? []),
  ]);

  const targetIndustries = uniqueStrings([
    ...extractStringArray(targetingRecord, ['target_industries', 'industries']),
    ...extractStringArray(positioningStrategy, ['target_industries']),
    extractFirstString(positioningStrategy, ['target_industry']),
    clientProfile?.industry,
  ]);

  const seniority = extractFirstString(targetingRecord, ['seniority'])
    || extractFirstString(positioningStrategy, ['target_seniority'])
    || clientProfile?.career_level
    || '';

  const transitionType = extractFirstString(targetingRecord, ['transition_type'])
    || clientProfile?.transition_type
    || '';

  const preferredCompanyEnvironments = uniqueStrings([
    ...extractStringArray(targetingRecord, ['preferred_company_environments', 'company_environments']),
    ...extractStringArray(positioningStrategy, ['preferred_company_environments']),
  ]);

  const coreStrengths = uniqueStrings([
    ...extractStringArray(positioningRecord, ['core_strengths', 'strengths']),
    ...(clientProfile?.strengths_self_reported ?? []),
  ]);

  const proofThemes = uniqueStrings([
    ...extractStringArray(positioningRecord, ['proof_themes', 'proof_points']),
    ...(assessmentSummary?.key_insights ?? []),
  ]);

  const differentiators = uniqueStrings([
    ...extractStringArray(positioningRecord, ['differentiators']),
    ...extractStringArray(positioningStrategy, ['unique_combination', 'differentiators']),
    whyMeContext?.whyNotMe,
  ]);

  const adjacentPositioning = uniqueStrings([
    ...extractStringArray(positioningRecord, ['adjacent_positioning']),
    whyMeContext?.whyNotMe,
  ]);

  const positioningStatement = extractFirstString(positioningRecord, ['positioning_statement'])
    || extractFirstString(positioningStrategy, ['angle', 'positioning_statement'])
    || asString(whyMeContext?.knownForWhat)
    || '';

  const narrativeSummary = extractFirstString(positioningRecord, ['narrative_summary'])
    || extractFirstString(narrativeRecord, ['story_snippet', 'narrative_summary'])
    || (assessmentSummary?.key_insights.length ? assessmentSummary.key_insights.slice(0, 2).join(' ') : '');

  const leadershipScope = extractFirstString(positioningRecord, ['leadership_scope'])
    || extractFirstString(positioningStrategy, ['leadership_scope'])
    || asString((rawCareerProfile as Record<string, unknown> | null)?.leadership_scope)
    || (clientProfile?.years_experience ? `${clientProfile.years_experience}+ years of experience` : '');

  const scopeOfResponsibility = extractFirstString(positioningRecord, ['scope_of_responsibility'])
    || extractFirstString(positioningStrategy, ['scope_of_responsibility'])
    || (clientProfile?.goals.length ? `Focused on ${clientProfile.goals[0]}` : '')
    || '';

  const colleaguesCameForWhat = extractFirstString(narrativeRecord, ['colleagues_came_for_what', 'colleaguesCameForWhat'])
    || whyMeContext?.colleaguesCameForWhat
    || coreStrengths[0]
    || '';
  const knownForWhat = extractFirstString(narrativeRecord, ['known_for_what', 'knownForWhat'])
    || whyMeContext?.knownForWhat
    || positioningStatement;
  const whyNotMe = extractFirstString(narrativeRecord, ['why_not_me', 'whyNotMe'])
    || whyMeContext?.whyNotMe
    || differentiators[0]
    || '';

  const mustHaves = uniqueStrings([
    ...extractStringArray(preferencesRecord, ['must_haves']),
    ...(clientProfile?.goals ?? []),
  ]);
  const constraints = uniqueStrings([
    ...extractStringArray(preferencesRecord, ['constraints']),
    ...(clientProfile?.constraints ?? []),
  ]);
  const compensationDirection = extractFirstString(preferencesRecord, ['compensation_direction']);

  const financialSegment = extractFirstString(coachingRecord, ['financial_segment'])
    || baseline?.financial_segment
    || clientProfile?.financial_segment
    || 'ideal';
  const emotionalState = extractFirstString(coachingRecord, ['emotional_state'])
    || baseline?.emotional_state
    || clientProfile?.emotional_state
    || 'acceptance';
  const coachingTone = extractFirstString(coachingRecord, ['coaching_tone'])
    || baseline?.coaching_tone
    || clientProfile?.coaching_tone
    || 'direct';
  const urgencyScore = typeof coachingRecord?.urgency_score === 'number'
    ? coachingRecord.urgency_score
    : baseline?.urgency_score ?? clientProfile?.urgency_score ?? 5;
  const recommendedStartingPoint = extractFirstString(coachingRecord, ['recommended_starting_point'])
    || clientProfile?.recommended_starting_point
    || 'resume';

  const signals = {
    clarity: signalFromText(colleaguesCameForWhat),
    alignment: signalFromText(knownForWhat),
    differentiation: signalFromText(whyNotMe),
  };

  const directionScore = Math.round((scoreForList(targetRoles, 1) + scoreForList(targetIndustries, 1) + scoreForText(seniority)) / 3);
  const positioningScore = Math.round((scoreForList(coreStrengths, 2) + scoreForList(proofThemes, 2) + scoreForText(positioningStatement || narrativeSummary)) / 3);
  const narrativeScore = Math.round((scoreForText(colleaguesCameForWhat) + scoreForText(knownForWhat) + scoreForText(whyNotMe)) / 3);
  const constraintsScore = Math.round((scoreForList(constraints, 1) + scoreForList(mustHaves, 1) + scoreForList(preferredCompanyEnvironments, 1)) / 3);

  const overallScore = Math.round((directionScore + positioningScore + narrativeScore + constraintsScore) / 4);
  const dashboardState: CareerProfileDashboardState = overallScore >= 75
    ? 'strong'
    : overallScore >= 30
      ? 'refining'
      : 'new-user';

  return {
    version: 'career_profile_v2',
    source: rawCareerProfile ? 'career_profile' : 'legacy_migration',
    generated_at: extractFirstString(rawCareerProfile, ['generated_at']) || fallbackTimestamp,
    targeting: {
      target_roles: targetRoles,
      target_industries: targetIndustries,
      seniority: seniority || 'not yet defined',
      transition_type: transitionType || 'not yet defined',
      preferred_company_environments: preferredCompanyEnvironments,
    },
    positioning: {
      core_strengths: coreStrengths,
      proof_themes: proofThemes,
      differentiators,
      adjacent_positioning: adjacentPositioning,
      positioning_statement: positioningStatement,
      narrative_summary: narrativeSummary,
      leadership_scope: leadershipScope,
      scope_of_responsibility: scopeOfResponsibility,
    },
    narrative: {
      colleagues_came_for_what: colleaguesCameForWhat,
      known_for_what: knownForWhat,
      why_not_me: whyNotMe,
      story_snippet: narrativeSummary || buildProfileSummary(targetRoles, coreStrengths, positioningStatement, ''),
    },
    preferences: {
      must_haves: mustHaves,
      constraints,
      compensation_direction: compensationDirection,
    },
    coaching: {
      financial_segment: financialSegment,
      emotional_state: emotionalState,
      coaching_tone: coachingTone,
      urgency_score: urgencyScore,
      recommended_starting_point: recommendedStartingPoint,
    },
    evidence_positioning_statements: buildEvidenceStatements(coreStrengths, proofThemes, differentiators, targetRoles),
    profile_signals: signals,
    completeness: {
      overall_score: overallScore,
      dashboard_state: dashboardState,
      sections: [
        {
          id: 'direction',
          label: 'Direction',
          status: directionScore >= 85 ? 'ready' : directionScore >= 45 ? 'partial' : 'missing',
          score: directionScore,
          summary: summarizeSection(
            directionScore,
            'Target roles and market direction are defined.',
            'Targeting is usable, but still needs sharper role or industry specificity.',
            'Target role direction still needs to be defined.',
          ),
        },
        {
          id: 'positioning',
          label: 'Positioning',
          status: positioningScore >= 85 ? 'ready' : positioningScore >= 45 ? 'partial' : 'missing',
          score: positioningScore,
          summary: summarizeSection(
            positioningScore,
            'Strengths and proof themes are clear enough to guide the agents.',
            'Positioning exists, but the proof themes still need stronger detail.',
            'Core strengths and proof themes are still too thin.',
          ),
        },
        {
          id: 'narrative',
          label: 'Narrative',
          status: narrativeScore >= 85 ? 'ready' : narrativeScore >= 45 ? 'partial' : 'missing',
          score: narrativeScore,
          summary: summarizeSection(
            narrativeScore,
            'The core story is clear enough to drive personalized writing.',
            'The story is partially defined, but still reads too generally.',
            'The core story still needs first-person detail and specificity.',
          ),
        },
        {
          id: 'constraints',
          label: 'Preferences',
          status: constraintsScore >= 85 ? 'ready' : constraintsScore >= 45 ? 'partial' : 'missing',
          score: constraintsScore,
          summary: summarizeSection(
            constraintsScore,
            'Constraints and preferences are defined well enough for targeting decisions.',
            'Some preferences are known, but the tradeoffs are still loose.',
            'Constraints, must-haves, and preferred environments still need definition.',
          ),
        },
      ],
    },
    profile_summary: buildProfileSummary(targetRoles, coreStrengths, positioningStatement, narrativeSummary),
    legacy_client_profile: clientProfile,
    assessment_summary: assessmentSummary,
  };
}

async function loadLatestOnboardingAssessment(userId: string): Promise<{
  client_profile?: ClientProfile;
  assessment_summary?: AssessmentSummary;
  created_at?: string;
} | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('onboarding_assessments')
      .select('client_profile, assessment_summary, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn({ userId, error: error.message }, 'Failed to load onboarding assessment for career profile');
      return null;
    }

    return data ?? null;
  } catch (error) {
    logger.warn(
      { userId, error: error instanceof Error ? error.message : String(error) },
      'Unexpected onboarding assessment lookup failure for career profile',
    );
    return null;
  }
}

export async function loadCareerProfileContext(userId: string): Promise<CareerProfileV2 | null> {
  try {
    const [
      storedCareerProfileRow,
      clientProfileRow,
      positioningStrategyRow,
      targetRoleRow,
      whyMeContext,
      onboardingAssessment,
      baseline,
    ] = await Promise.all([
      getLatestUserContext(userId, 'career_profile'),
      getLatestUserContext(userId, 'client_profile'),
      getLatestUserContext(userId, 'positioning_strategy'),
      getLatestUserContext(userId, 'target_role'),
      getWhyMeContext(userId),
      loadLatestOnboardingAssessment(userId),
      getEmotionalBaseline(userId),
    ]);

    const clientProfile = (clientProfileRow?.content as ClientProfile | undefined)
      ?? onboardingAssessment?.client_profile;
    const assessmentSummary = onboardingAssessment?.assessment_summary;
    const fallbackTimestamp = onboardingAssessment?.created_at ?? new Date().toISOString();

    const hasLegacyData = !!(
      storedCareerProfileRow
      || clientProfile
      || positioningStrategyRow
      || targetRoleRow
      || whyMeContext
    );

    if (!hasLegacyData) return null;

    const normalized = normalizeCareerProfile(
      storedCareerProfileRow?.content as Record<string, unknown> | null,
      clientProfile,
      assessmentSummary,
      whyMeContext,
      positioningStrategyRow?.content as Record<string, unknown> | null,
      targetRoleRow?.content as Record<string, unknown> | null,
      baseline,
      fallbackTimestamp,
    );

    if (!storedCareerProfileRow) {
      void upsertUserContext(
        userId,
        'career_profile',
        normalized as unknown as Record<string, unknown>,
        'career-profile-migration',
      ).catch((error) => {
        logger.warn(
          { userId, error: error instanceof Error ? error.message : String(error) },
          'Failed to auto-migrate normalized career profile',
        );
      });
    }

    return normalized;
  } catch (error) {
    logger.warn(
      { userId, error: error instanceof Error ? error.message : String(error) },
      'Failed to load normalized career profile',
    );
    return null;
  }
}

export async function loadAgentContextBundle(
  userId: string,
  options: AgentContextBundleOptions = {},
): Promise<{
  platformContext: Record<string, unknown>;
  emotionalBaseline: EmotionalBaseline | null;
  careerProfile: CareerProfileV2 | null;
}> {
  const includeCareerProfile = options.includeCareerProfile ?? true;
  const includeEmotionalBaseline = options.includeEmotionalBaseline ?? true;

  const [
    careerProfile,
    baseline,
    positioningStrategyRow,
    benchmarkCandidateRow,
    gapAnalysisRow,
    careerNarrativeRow,
    industryResearchRow,
    targetRoleRow,
    clientProfileRow,
    whyMeContext,
    evidenceRows,
  ] = await Promise.all([
    includeCareerProfile ? loadCareerProfileContext(userId) : Promise.resolve(null),
    includeEmotionalBaseline ? getEmotionalBaseline(userId) : Promise.resolve(null),
    options.includePositioningStrategy ? getLatestUserContext(userId, 'positioning_strategy') : Promise.resolve(null),
    options.includeBenchmarkCandidate ? getLatestUserContext(userId, 'benchmark_candidate') : Promise.resolve(null),
    options.includeGapAnalysis ? getLatestUserContext(userId, 'gap_analysis') : Promise.resolve(null),
    options.includeCareerNarrative ? getLatestUserContext(userId, 'career_narrative') : Promise.resolve(null),
    options.includeIndustryResearch ? getLatestUserContext(userId, 'industry_research') : Promise.resolve(null),
    options.includeTargetRole ? getLatestUserContext(userId, 'target_role') : Promise.resolve(null),
    options.includeClientProfile ? getLatestUserContext(userId, 'client_profile') : Promise.resolve(null),
    options.includeWhyMeStory ? getWhyMeContext(userId) : Promise.resolve(null),
    options.includeEvidenceItems ? getUserContext(userId, 'evidence_item') : Promise.resolve([]),
  ]);

  const platformContext: Record<string, unknown> = {};

  if (careerProfile) {
    platformContext.career_profile = careerProfile;
  }
  if (positioningStrategyRow?.content) {
    platformContext.positioning_strategy = positioningStrategyRow.content;
  }
  if (benchmarkCandidateRow?.content) {
    platformContext.benchmark_candidate = benchmarkCandidateRow.content;
  }
  if (gapAnalysisRow?.content) {
    platformContext.gap_analysis = gapAnalysisRow.content;
  }
  if (careerNarrativeRow?.content) {
    platformContext.career_narrative = careerNarrativeRow.content;
  }
  if (industryResearchRow?.content) {
    platformContext.industry_research = industryResearchRow.content;
  }
  if (targetRoleRow?.content) {
    platformContext.target_role = targetRoleRow.content;
  }
  if (clientProfileRow?.content) {
    platformContext.client_profile = clientProfileRow.content;
  } else if (careerProfile?.legacy_client_profile) {
    platformContext.client_profile = careerProfile.legacy_client_profile as unknown as Record<string, unknown>;
  }
  if (whyMeContext) {
    platformContext.why_me_story = {
      colleaguesCameForWhat: whyMeContext.colleaguesCameForWhat,
      knownForWhat: whyMeContext.knownForWhat,
      whyNotMe: whyMeContext.whyNotMe,
    };
  } else if (careerProfile) {
    platformContext.why_me_story = {
      colleaguesCameForWhat: careerProfile.narrative.colleagues_came_for_what,
      knownForWhat: careerProfile.narrative.known_for_what,
      whyNotMe: careerProfile.narrative.why_not_me,
    };
  }
  if (evidenceRows.length > 0) {
    platformContext.evidence_items = evidenceRows.map((row) => row.content);
  }

  return {
    platformContext,
    emotionalBaseline: baseline,
    careerProfile,
  };
}
