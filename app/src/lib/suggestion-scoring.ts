/**
 * Shared Suggestion Quality Scoring Engine
 *
 * Computes a multi-dimensional quality score for AI-generated resume suggestions.
 * Consumed by both the rewrite queue (sort ordering) and the coaching panel (display verdict).
 * Single source of truth — panel and queue never have separate opinions about quality.
 */

import type { SuggestionScore } from '@/types/resume-v2';

// Re-export so consumers can import from either location
export type { SuggestionScore };

// ─── Types ───────────────────────────────────────────────────────────

export type SuggestionScoreDimensions = SuggestionScore['dimensions'];

export interface SuggestionScoringContext {
  targetRequirements: string[];
  otherSectionTexts?: string[];
  brandedTitle?: string;
  importance?: 'must_have' | 'important' | 'nice_to_have';
}

// ─── Constants ───────────────────────────────────────────────────────

const CLICHE_PHRASES = [
  'results-driven', 'seasoned professional', 'proven track record',
  'dynamic leader', 'passionate about', 'team player', 'self-starter',
  'go-getter', 'thought leader', 'innovative thinker', 'detail-oriented',
  'hardworking', 'motivated professional', 'strategic thinker',
];

const VAGUE_VERB_PATTERNS = /\b(helped|assisted|supported|contributed to|participated in|was responsible for|was involved in|facilitated)\b/i;

const OWNERSHIP_VERBS = /\b(led|owned|architected|directed|oversaw|built|founded|championed|spearheaded|orchestrated|drove|established|transformed|pioneered)\b/i;

const PASSIVE_DOWNGRADES = /\b(was responsible for|assisted with|helped with|participated in|was involved in|contributed to)\b/i;

// Tech/platform patterns — common named entities in executive resumes
const NAMED_ENTITY_PATTERN = /\b(?:[A-Z][A-Za-z0-9.+#]*(?:\s+[A-Z][A-Za-z0-9.+#]*){0,2})\b/g;
const TECH_TERMS = /\b(AWS|Azure|GCP|SAP|Salesforce|Oracle|ServiceNow|Kubernetes|Docker|Terraform|Snowflake|Databricks|Tableau|Power\s*BI|Jira|Confluence|Workday|HubSpot|Marketo|Splunk|Datadog|Okta|CrowdStrike|Palo Alto|Fortinet|Jenkins|GitHub|GitLab|PostgreSQL|MongoDB|Redis|Kafka|Spark|Airflow|dbt|Looker|Figma|React|Angular|Node\.js|Python|Java|Go|Rust|TypeScript|JavaScript|\.NET|C\+\+|Swift|Kotlin|Ruby|PHP|Scala|R\b|MATLAB|SQL|NoSQL|GraphQL|REST|gRPC|CI\/CD|DevOps|MLOps|SRE|SOC\s*2|ISO\s*27001|HIPAA|SOX|GDPR|PCI|FedRAMP|NIST|CMMC|PMP|CPA|CFA|CISSP|CISM|CCSP|Six\s*Sigma|Lean|Agile|Scrum|Kanban|ITIL|TOGAF|COBIT)\b/gi;

const METRIC_PATTERN = /\d+[%$MKBk+]|\$\d+|\d+\s*(?:million|billion|thousand|percent|%)|(?:\d+\s*(?:to|→|->)\s*\d+)/gi;

// ─── Scoring Functions ──────────────────────────────────────────────

function extractNamedEntities(text: string): Set<string> {
  const entities = new Set<string>();
  const techMatches = text.match(TECH_TERMS) ?? [];
  for (const m of techMatches) entities.add(m.toLowerCase());
  const namedMatches = text.match(NAMED_ENTITY_PATTERN) ?? [];
  for (const m of namedMatches) {
    if (m.length > 2 && !/^(The|This|That|With|From|Into|Over|Under|About|After|Before|Their|These|Those|Which|Where|When|What|Being|Having|Would|Could|Should)$/i.test(m)) {
      entities.add(m.toLowerCase());
    }
  }
  return entities;
}

function scorePreservesSpecificity(current: string, suggestion: string): number {
  const currentEntities = extractNamedEntities(current);
  if (currentEntities.size === 0) return 8; // nothing to lose
  const suggestionLower = suggestion.toLowerCase();
  let preserved = 0;
  for (const entity of currentEntities) {
    if (suggestionLower.includes(entity)) preserved++;
  }
  const ratio = preserved / currentEntities.size;
  if (ratio >= 1) return 10;
  if (ratio >= 0.8) return 8;
  if (ratio >= 0.6) return 6;
  if (ratio >= 0.4) return 4;
  return 2;
}

function scorePreservesSeniority(current: string, suggestion: string): number {
  const currentHasOwnership = OWNERSHIP_VERBS.test(current);
  if (!currentHasOwnership) return 8; // no seniority language to preserve

  const suggestionHasOwnership = OWNERSHIP_VERBS.test(suggestion);
  const suggestionHasPassive = PASSIVE_DOWNGRADES.test(suggestion);

  if (suggestionHasOwnership && !suggestionHasPassive) return 10;
  if (suggestionHasOwnership && suggestionHasPassive) return 6;
  if (!suggestionHasOwnership && !suggestionHasPassive) return 5;
  return 3; // lost ownership, added passive
}

function scorePreservesOutcomes(current: string, suggestion: string): number {
  const currentMetrics = current.match(METRIC_PATTERN) ?? [];
  const suggestionMetrics = suggestion.match(METRIC_PATTERN) ?? [];

  if (currentMetrics.length === 0 && suggestionMetrics.length === 0) return 7; // neutral
  if (currentMetrics.length === 0 && suggestionMetrics.length > 0) return 10; // added metrics
  if (suggestionMetrics.length > currentMetrics.length) return 10;
  if (suggestionMetrics.length === currentMetrics.length) return 8;
  if (suggestionMetrics.length > 0) return 5; // fewer but still some
  return 1; // lost all metrics
}

function scoreRequirementAlignment(suggestion: string, requirements: string[]): number {
  if (requirements.length === 0) return 7; // no requirements to align to
  const suggestionLower = suggestion.toLowerCase();
  let matched = 0;
  for (const req of requirements) {
    const reqWords = req.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const hits = reqWords.filter(w => suggestionLower.includes(w)).length;
    if (hits >= Math.ceil(reqWords.length * 0.4)) matched++;
  }
  const ratio = matched / requirements.length;
  if (ratio >= 0.8) return 10;
  if (ratio >= 0.5) return 7;
  if (ratio >= 0.2) return 5;
  return 3;
}

function scoreAvoidsClicheVagueness(suggestion: string): number {
  const lower = suggestion.toLowerCase();
  let clicheCount = 0;
  for (const phrase of CLICHE_PHRASES) {
    if (lower.includes(phrase)) clicheCount++;
  }
  const hasVagueVerbs = VAGUE_VERB_PATTERNS.test(suggestion);

  if (clicheCount === 0 && !hasVagueVerbs) return 10;
  if (clicheCount === 0 && hasVagueVerbs) return 7;
  if (clicheCount === 1 && !hasVagueVerbs) return 6;
  if (clicheCount === 1) return 5;
  return 3; // 2+ cliches
}

function scoreAvoidsRedundancy(suggestion: string, otherTexts: string[]): number {
  if (otherTexts.length === 0) return 8; // can't check
  const suggestionWords = new Set(suggestion.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  if (suggestionWords.size === 0) return 8;

  let maxOverlap = 0;
  for (const text of otherTexts) {
    const textWords = new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    let overlap = 0;
    for (const word of suggestionWords) {
      if (textWords.has(word)) overlap++;
    }
    const ratio = overlap / suggestionWords.size;
    if (ratio > maxOverlap) maxOverlap = ratio;
  }

  if (maxOverlap < 0.15) return 10;
  if (maxOverlap < 0.3) return 7;
  if (maxOverlap < 0.5) return 5;
  return 2; // heavily duplicated
}

function scorePreservesBrandVoice(current: string, suggestion: string, brandedTitle?: string): number {
  // Check if the suggestion genericizes distinctive perspective
  const currentWords = current.toLowerCase().split(/\s+/).filter(w => w.length > 5);
  const distinctiveWords = currentWords.filter(w =>
    !/\b(experience|management|leadership|development|implementation|organization|professional|environment|responsible|performance)\b/i.test(w)
  );

  if (distinctiveWords.length === 0) return 8; // no distinctive voice to preserve

  const suggestionLower = suggestion.toLowerCase();
  let preserved = 0;
  for (const word of distinctiveWords) {
    if (suggestionLower.includes(word)) preserved++;
  }

  // Also check branded title alignment
  if (brandedTitle) {
    const titleWords = brandedTitle.toLowerCase().split(/[\s|,]+/).filter(w => w.length > 3);
    const titleHits = titleWords.filter(w => suggestionLower.includes(w)).length;
    if (titleHits > 0) preserved += 2; // bonus for brand alignment
  }

  const ratio = Math.min(1, preserved / Math.max(1, distinctiveWords.length));
  if (ratio >= 0.6) return 9;
  if (ratio >= 0.3) return 6;
  return 3;
}

function scoreEvidenceIntegrity(current: string, suggestion: string): number {
  // Extract all quantified claims from both texts
  const currentClaims = new Set(
    (current.match(METRIC_PATTERN) ?? []).map(m => m.toLowerCase().replace(/\s+/g, '')),
  );
  const suggestionClaims =
    (suggestion.match(METRIC_PATTERN) ?? []).map(m => m.toLowerCase().replace(/\s+/g, ''));

  if (suggestionClaims.length === 0) return 9; // no claims to fabricate

  // Check how many suggestion claims are new (not in current text)
  let newClaims = 0;
  for (const claim of suggestionClaims) {
    if (!currentClaims.has(claim)) {
      // Also check if the raw number appears anywhere in current text
      const digits = claim.replace(/[^0-9.]/g, '');
      if (digits && !current.includes(digits)) {
        newClaims++;
      }
    }
  }

  if (newClaims === 0) return 10; // all claims traceable to source
  if (newClaims === 1 && suggestionClaims.length >= 3) return 7; // one new claim among many existing
  if (newClaims === 1) return 5; // one new claim, potentially inferred
  return 2; // multiple unsupported claims — high fabrication risk
}

// ─── Gap-Fill Question Generation ────────────────────────────────────

function generateGapFillQuestion(
  currentText: string,
  targetRequirements: string[],
  importance?: string,
): string {
  const hasMetrics = METRIC_PATTERN.test(currentText);
  const hasTech = TECH_TERMS.test(currentText);
  const hasScale = /\b(team|teams|staff|reports?|direct|manage[ds]?\s+\d|headcount|\d+\s*(?:people|employees|engineers|members))\b/i.test(currentText);

  // Priority 1: Missing requirement coverage
  if (targetRequirements.length > 0 && importance === 'must_have') {
    return `Do you have experience with ${targetRequirements[0]}? Even adjacent or transferable experience counts.`;
  }

  // Priority 2: Missing scale
  if (!hasScale) {
    return 'What was the size of the team, budget, or scope you were responsible for?';
  }

  // Priority 3: Missing metrics
  if (!hasMetrics) {
    return 'What measurable result did this work produce? Revenue impact, cost savings, efficiency gains?';
  }

  // Priority 4: Missing technology specifics
  if (!hasTech) {
    return 'Which specific platforms, tools, or frameworks were involved in this work?';
  }

  // Fallback
  return 'Can you add a specific outcome or metric that shows the impact of this work?';
}

// ─── Main Scoring Function ──────────────────────────────────────────

const DIMENSION_WEIGHTS: Record<keyof SuggestionScoreDimensions, number> = {
  preservesSpecificity: 0.15,
  preservesSeniority: 0.13,
  preservesOutcomes: 0.15,
  requirementAlignment: 0.13,
  avoidsClicheVagueness: 0.10,
  avoidsRedundancy: 0.09,
  preservesBrandVoice: 0.10,
  evidenceIntegrity: 0.15,
};

export function scoreSuggestion(
  currentText: string,
  suggestion: string,
  context: SuggestionScoringContext,
): SuggestionScore {
  const dimensions: SuggestionScoreDimensions = {
    preservesSpecificity: scorePreservesSpecificity(currentText, suggestion),
    preservesSeniority: scorePreservesSeniority(currentText, suggestion),
    preservesOutcomes: scorePreservesOutcomes(currentText, suggestion),
    requirementAlignment: scoreRequirementAlignment(suggestion, context.targetRequirements),
    avoidsClicheVagueness: scoreAvoidsClicheVagueness(suggestion),
    avoidsRedundancy: scoreAvoidsRedundancy(suggestion, context.otherSectionTexts ?? []),
    preservesBrandVoice: scorePreservesBrandVoice(currentText, suggestion, context.brandedTitle),
    evidenceIntegrity: scoreEvidenceIntegrity(currentText, suggestion),
  };

  // Weighted composite
  let overall = 0;
  for (const [key, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    overall += dimensions[key as keyof SuggestionScoreDimensions] * weight;
  }
  overall = Math.round(overall * 10) / 10; // one decimal place

  // Verdict logic
  let verdict: SuggestionScore['verdict'];
  let reason: string;
  let suggestedQuestion: string | undefined;

  if (overall >= 6) {
    verdict = 'show';
    reason = 'Suggestion improves on the current text.';
  } else if (overall >= 4 && context.importance === 'must_have') {
    verdict = 'show';
    reason = 'This is a must-have requirement — showing suggestion despite moderate score.';
  } else if (overall < 4) {
    verdict = 'ask_question';
    suggestedQuestion = generateGapFillQuestion(currentText, context.targetRequirements, context.importance);
    reason = 'Suggestion would likely downgrade the current text. Asking for more context instead.';
  } else {
    verdict = 'collapse';
    reason = 'Current text is already strong for this requirement.';
  }

  return { overall, dimensions, verdict, reason, suggestedQuestion };
}
