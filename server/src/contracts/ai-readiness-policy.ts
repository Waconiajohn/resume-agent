/**
 * AI Readiness Policy
 *
 * Detects AI precursor signals in executive resumes. These are NOT technical
 * AI skills — they are leadership indicators that demonstrate a candidate
 * could lead AI adoption: process automation, data-driven decisions,
 * technology adoption, digital transformation, etc.
 *
 * Used by Candidate Intelligence (Agent 2) as a deterministic fallback
 * and by Gap Analysis (Agent 4) to inject a synthetic AI readiness requirement.
 */

export interface AIPrecursorFamily {
  family: string;
  displayName: string;
  /** Regex patterns to match against resume text (case-insensitive) */
  patterns: RegExp;
  /** Executive-level framing for this signal */
  executiveFraming: string;
}

export interface AIPrecursorMatch {
  family: string;
  evidence: string;
  sourceRole?: string;
  executiveFraming: string;
}

export interface AIReadinessSummary {
  strength: 'strong' | 'moderate' | 'minimal' | 'none';
  signals: AIPrecursorMatch[];
  summary: string;
}

/**
 * Tech-context words used to qualify broad verbs like "implemented" or "standardized".
 * Without these nearby, the verb alone doesn't signal AI readiness —
 * "implemented safety protocols" is not the same as "implemented a CRM platform."
 */
const TECH_CONTEXT = /\b(system|platform|software|saas|crm|erp|database|cloud|digital|ai|automation|analytics|data|dashboard|portal|application|app|tool|infrastructure|api|integration|workflow engine|sap|salesforce|oracle|netsuite|hubspot|servicenow|jira|tableau|power bi)\b/i;

export const AI_PRECURSOR_FAMILIES: readonly AIPrecursorFamily[] = [
  {
    family: 'process_automation',
    displayName: 'Process Automation',
    // "automated" and "RPA" are strong enough alone; "streamlined" and "workflow"
    // need a tech-context word nearby to avoid matching "streamlined hiring process"
    patterns: /\b(automat(?:ed|ion|ing)\b.*\b(?:process|workflow|system|operation|report)|rpa|robotic process automation|digitiz(?:ed|ing)\b.*\b(?:process|record|workflow|operation))/i,
    executiveFraming: 'Led automation of operational workflows',
  },
  {
    family: 'data_driven_decisions',
    displayName: 'Data-Driven Decisions',
    patterns: /\b(analytics platform|business intelligence|(?<!\w)bi(?:\s+|-)?(?:tool|platform|system|dashboard)|dashboards?.{0,40}(?:analytics|data|kpis?|metrics?)|(?:analytics|data|kpis?|metrics?).{0,40}dashboards?|data[- ]driven|predictive analytics|data warehouse|data lake)\b/i,
    executiveFraming: 'Established data-driven decision frameworks',
  },
  {
    family: 'technology_adoption',
    displayName: 'Technology Adoption',
    // Broad verbs (implemented, deployed, migrated) require a tech object nearby.
    // Compound phrases like "technology adoption" and "system implementation" stand alone.
    patterns: /\b((?:implement(?:ed|ing|ation)|deploy(?:ed|ing|ment)|migrat(?:ed|ion|ing)|roll(?:ed)?\s*out)\b.{0,30}\b(?:system|platform|software|saas|crm|erp|database|cloud|tool|application|portal|integration|ai|automation)|technology adoption|system(?:s)? implementation|(?:erp|crm|saas|cloud)\s+(?:implementation|migration|deployment|rollout))\b/i,
    executiveFraming: 'Championed enterprise technology adoption',
  },
  {
    family: 'digital_transformation',
    displayName: 'Digital Transformation',
    patterns: /\b(digital transformation|digitalization|digital strategy|digital modernization)\b/i,
    executiveFraming: 'Drove digital transformation initiatives',
  },
  {
    family: 'change_management',
    displayName: 'Change Management',
    // "training program" alone is too broad — require a tech-adjacent context.
    // "change management" and "adoption strategy" are specific enough alone.
    patterns: /\b(change management\b.*\b(?:technology|system|platform|digital|software|implementation|migration)|(?:technology|system|platform|digital|software)\b.*\bchange management|adoption strategy|user adoption|rollout strategy|organizational change\b.*\b(?:technology|system|digital))\b/i,
    executiveFraming: 'Led change management for technology rollouts',
  },
  {
    family: 'vendor_evaluation',
    displayName: 'Vendor/Tool Evaluation',
    patterns: /\b(vendor selection|rfp\b.*\b(?:technology|system|platform|software)|platform selection|vendor evaluation|tool evaluation|technology assessment)\b/i,
    executiveFraming: 'Managed vendor evaluation and technology selection',
  },
  {
    family: 'cross_functional_tech',
    displayName: 'Cross-Functional Technology',
    patterns: /\b(tech(?:nology)? governance|it steering|cross[- ]functional\b.*\b(?:tech|digital|system)|technology roadmap)\b/i,
    executiveFraming: 'Built cross-functional technology governance',
  },
  {
    family: 'compliance_governance',
    displayName: 'Compliance/Governance',
    // "risk management" alone is too broad (financial, operational, safety).
    // Require a tech/data qualifier or use compound phrases that are specific.
    patterns: /\b(compliance framework\b.*\b(?:technology|data|digital|system|it)|(?:data|technology|it|digital|cyber)\s+(?:compliance|governance)|governance framework\b.*\b(?:technology|data|digital)|controls framework\b.*\b(?:technology|data|it)|regulatory technology|data governance)\b/i,
    executiveFraming: 'Oversaw compliance and governance for technology',
  },
  {
    family: 'infrastructure_modernization',
    displayName: 'Infrastructure Modernization',
    patterns: /\b(cloud migration|knowledge (?:base|management)|platform (?:migration|modernization)|(?:infrastructure|it|technology)\s+(?:upgrade|modernization)|system(?:s)? consolidation\b.*\b(?:platform|technology|it|digital|software))\b/i,
    executiveFraming: 'Built infrastructure enabling AI/automation readiness',
  },
  {
    family: 'scale_standardization',
    displayName: 'Scale & Standardization',
    // "centralized" and "standardized" alone are too broad.
    // Require tech objects or use compound phrases specific to tech ops.
    patterns: /\b((?:centralized|standardiz(?:ed|ation|ing)|consolidated)\b.{0,30}\b(?:system|platform|data|technology|it|digital|process(?:es)?.*(?:automation|system|digital))|process standardization\b.*\b(?:automation|system|technology|digital)|scaled\b.*\b(?:automation|system|platform|technology|infrastructure))\b/i,
    executiveFraming: 'Scaled and standardized operations for automation',
  },
] as const;

/** Helper: checks if text has tech-context words (exported for testing) */
export function hasTechContext(text: string): boolean {
  return TECH_CONTEXT.test(text);
}

/** The synthetic requirement text injected into gap analysis */
export const AI_READINESS_REQUIREMENT_TEXT = 'AI & Digital Transformation Readiness';

/**
 * Scans resume text and individual bullets for AI precursor signals.
 * Returns all matched families with evidence excerpts.
 */
export function detectAIPrecursors(
  resumeText: string,
  bullets: string[],
  experienceEntries?: Array<{ company: string; title: string; bullets: string[] }>,
): AIPrecursorMatch[] {
  const matches: AIPrecursorMatch[] = [];
  const seenFamilies = new Set<string>();

  // Scan individual bullets first (better evidence attribution)
  for (const entry of experienceEntries ?? []) {
    for (const bullet of entry.bullets) {
      for (const family of AI_PRECURSOR_FAMILIES) {
        if (seenFamilies.has(family.family)) continue;
        if (family.patterns.test(bullet)) {
          seenFamilies.add(family.family);
          matches.push({
            family: family.family,
            evidence: bullet.length > 200 ? `${bullet.slice(0, 197)}...` : bullet,
            sourceRole: `${entry.title} at ${entry.company}`,
            executiveFraming: family.executiveFraming,
          });
        }
      }
    }
  }

  // Scan flat bullets (hidden_accomplishments, etc.)
  for (const bullet of bullets) {
    for (const family of AI_PRECURSOR_FAMILIES) {
      if (seenFamilies.has(family.family)) continue;
      if (family.patterns.test(bullet)) {
        seenFamilies.add(family.family);
        matches.push({
          family: family.family,
          evidence: bullet.length > 200 ? `${bullet.slice(0, 197)}...` : bullet,
          executiveFraming: family.executiveFraming,
        });
      }
    }
  }

  // Scan full resume text for any remaining families
  for (const family of AI_PRECURSOR_FAMILIES) {
    if (seenFamilies.has(family.family)) continue;
    if (family.patterns.test(resumeText)) {
      seenFamilies.add(family.family);
      // Extract a snippet around the match
      const match = resumeText.match(family.patterns);
      if (match?.index !== undefined) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(resumeText.length, match.index + match[0].length + 60);
        const snippet = resumeText.slice(start, end).replace(/\n/g, ' ').trim();
        matches.push({
          family: family.family,
          evidence: snippet.length > 200 ? `${snippet.slice(0, 197)}...` : snippet,
          executiveFraming: family.executiveFraming,
        });
      }
    }
  }

  return matches;
}

/**
 * Aggregates precursor matches into a strength rating and summary.
 * Returns null only when no signals are detected.
 */
export function buildAIPrecursorSummary(
  matches: AIPrecursorMatch[],
): AIReadinessSummary {
  if (matches.length === 0) {
    return {
      strength: 'none',
      signals: [],
      summary: 'No AI precursor signals detected in resume.',
    };
  }

  const strength: AIReadinessSummary['strength'] =
    matches.length >= 4 ? 'strong'
      : matches.length >= 2 ? 'moderate'
        : 'minimal';

  const familyNames = matches.map((m) => {
    const family = AI_PRECURSOR_FAMILIES.find((f) => f.family === m.family);
    return family?.displayName ?? m.family;
  });

  const summary = strength === 'strong'
    ? `Strong AI readiness profile with ${matches.length} signal families: ${familyNames.join(', ')}. Candidate has demonstrated leadership across multiple technology-driven initiatives.`
    : strength === 'moderate'
      ? `Moderate AI readiness with ${matches.length} signal families: ${familyNames.join(', ')}. Candidate has relevant technology leadership experience that can be positioned for AI readiness.`
      : `Minimal AI readiness signal detected (${familyNames[0]}). Limited but present technology adoption evidence.`;

  return {
    strength,
    signals: matches,
    summary,
  };
}
