/**
 * Personal Brand Auditor — Tool definitions.
 *
 * 4 tools:
 * - analyze_resume_brand: Extract positioning, tone, value props from resume
 * - analyze_linkedin_brand: Analyze LinkedIn content for brand alignment
 * - analyze_bio_brand: Evaluate bio content for brand consistency
 * - score_consistency: Produce cross-source consistency scores and identify findings
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  PersonalBrandState,
  PersonalBrandSSEEvent,
  AuditFinding,
  FindingCategory,
  ConsistencyScores,
  BrandSource,
} from '../types.js';
import { PERSONAL_BRAND_RULES } from '../knowledge/rules.js';
import { llm, MODEL_MID, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type AuditorTool = AgentTool<PersonalBrandState, PersonalBrandSSEEvent>;

// ─── Helpers ──────────────────────────────────────────────────────────

function parseFindingCategory(val: unknown): FindingCategory {
  const s = String(val ?? '').toLowerCase();
  const valid: FindingCategory[] = [
    'messaging_inconsistency',
    'value_prop_gap',
    'tone_mismatch',
    'missing_element',
    'outdated_content',
    'audience_misalignment',
  ];
  return valid.includes(s as FindingCategory) ? (s as FindingCategory) : 'missing_element';
}

function parseSeverity(val: unknown): 'critical' | 'high' | 'medium' | 'low' {
  const s = String(val ?? '').toLowerCase();
  const valid = ['critical', 'high', 'medium', 'low'];
  return valid.includes(s) ? (s as 'critical' | 'high' | 'medium' | 'low') : 'medium';
}

function parseBrandSource(val: unknown): BrandSource {
  const s = String(val ?? '').toLowerCase();
  const valid: BrandSource[] = ['resume', 'linkedin', 'bio', 'website', 'portfolio'];
  return valid.includes(s as BrandSource) ? (s as BrandSource) : 'resume';
}

// ─── Tool: analyze_resume_brand ───────────────────────────────────

const analyzeResumeBrandTool: AuditorTool = {
  name: 'analyze_resume_brand',
  description:
    'Analyze the resume to extract positioning, tone, value propositions, and identify brand elements for cross-source comparison.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text of the candidate.',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const resumeText = String(input.resume_text ?? '');

    // ─── Parse resume structure first ────────────────────────────
    if (!state.resume_data && resumeText.length > 50) {
      ctx.emit({
        type: 'transparency',
        stage: 'analyze_resume_brand',
        message: 'Parsing candidate resume...',
      });

      const resumeResponse = await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 4096,
        system:
          'You extract structured data from resumes. Return ONLY valid JSON, no comments, no markdown fencing.',
        messages: [
          {
            role: 'user',
            content: `Extract the following from this resume and return as JSON:
{
  "name": "Full Name",
  "current_title": "Most recent job title",
  "career_summary": "2-3 sentence career summary",
  "key_skills": ["skill1", "skill2"],
  "key_achievements": ["achievement with metrics if available"],
  "work_history": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Start - End",
      "highlights": ["key accomplishment 1", "key accomplishment 2"]
    }
  ]
}

Resume:
${resumeText}`,
          },
        ],
      });

      try {
        state.resume_data = JSON.parse(repairJSON(resumeResponse.text) ?? resumeResponse.text);
      } catch {
        state.resume_data = {
          name: 'Candidate',
          current_title: 'Professional',
          career_summary: '',
          key_skills: [],
          key_achievements: [],
          work_history: [],
        };
      }
    }

    scratchpad.resume_data = state.resume_data;

    // ─── Extract brand elements from resume ──────────────────────
    ctx.emit({
      type: 'audit_progress',
      stage: 'analyze_resume_brand',
      message: `Analyzing resume brand elements for ${state.resume_data?.name ?? 'candidate'}...`,
      sources_analyzed: 1,
      total_sources: state.brand_sources.length,
    });

    const brandPrompt = `Analyze this resume for personal brand elements. Extract the positioning, tone, value propositions, and identify any brand-related issues.

${PERSONAL_BRAND_RULES}

CANDIDATE PROFILE:
- Name: ${state.resume_data?.name ?? 'Unknown'}
- Current Title: ${state.resume_data?.current_title ?? 'Unknown'}
- Career Summary: ${state.resume_data?.career_summary ?? 'Not available'}

RESUME TEXT:
${resumeText}

Return JSON:
{
  "positioning": "How the candidate positions themselves — their core identity statement",
  "value_proposition": "The main value proposition communicated in the resume",
  "tone": "Describe the tone (e.g., authoritative, conversational, technical, generic)",
  "key_themes": ["theme1", "theme2"],
  "authority_signals": ["signal1", "signal2"],
  "strengths": ["brand strength 1", "brand strength 2"],
  "findings": [
    {
      "id": "rf_1",
      "category": "value_prop_gap | tone_mismatch | missing_element | outdated_content | audience_misalignment",
      "severity": "critical | high | medium | low",
      "title": "Brief headline of the issue",
      "description": "Detailed description with specific evidence from the resume",
      "affected_elements": ["headline", "summary"],
      "recommendation": "What to do about it"
    }
  ]
}

Rules:
- Be specific — cite actual content from the resume when describing findings
- Evaluate positioning clarity: can a reader understand the value prop in 3 seconds?
- Check for executive-level authority signals (P&L, team size, strategic scope)
- Identify generic language that could apply to any candidate
- If the resume brand is strong, say so — do not manufacture problems`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are an executive brand analyst who evaluates personal brand elements in resumes. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: brandPrompt }],
    });

    interface RawFinding {
      id?: string;
      category?: string;
      severity?: string;
      title?: string;
      description?: string;
      affected_elements?: string[];
      recommendation?: string;
    }

    let brandAnalysis: Record<string, unknown>;
    try {
      brandAnalysis = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      brandAnalysis = {};
    }

    // Store brand analysis for cross-source comparison
    scratchpad.resume_brand = brandAnalysis;

    // Extract findings
    const rawFindings = Array.isArray(brandAnalysis.findings) ? brandAnalysis.findings : [];
    const findings: AuditFinding[] = rawFindings.map((f: RawFinding, idx: number) => ({
      id: String(f.id ?? `rf_${idx + 1}`),
      category: parseFindingCategory(f.category),
      severity: parseSeverity(f.severity),
      title: String(f.title ?? ''),
      description: String(f.description ?? ''),
      source: 'resume' as BrandSource,
      affected_elements: Array.isArray(f.affected_elements) ? f.affected_elements.map(String) : [],
      recommendation: String(f.recommendation ?? ''),
    }));

    if (!Array.isArray(scratchpad.all_findings)) {
      scratchpad.all_findings = [];
    }
    (scratchpad.all_findings as AuditFinding[]).push(...findings);

    // Emit findings
    for (const finding of findings) {
      ctx.emit({
        type: 'finding_identified',
        finding_id: finding.id,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_resume_brand',
      message: `Resume brand analysis complete — ${findings.length} findings identified`,
    });

    return JSON.stringify({
      success: true,
      positioning: brandAnalysis.positioning ?? '',
      tone: brandAnalysis.tone ?? '',
      finding_count: findings.length,
      strengths: Array.isArray(brandAnalysis.strengths) ? brandAnalysis.strengths : [],
    });
  },
};

// ─── Tool: analyze_linkedin_brand ─────────────────────────────────

const analyzeLinkedinBrandTool: AuditorTool = {
  name: 'analyze_linkedin_brand',
  description:
    'Analyze LinkedIn content for brand alignment, comparing against resume brand elements.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      linkedin_text: {
        type: 'string',
        description: 'LinkedIn profile text content.',
      },
    },
    required: ['linkedin_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const linkedinText = String(input.linkedin_text ?? '');
    if (!linkedinText || linkedinText.length < 20) {
      return JSON.stringify({ success: false, error: 'No LinkedIn content provided.' });
    }

    const resumeBrand = scratchpad.resume_brand as Record<string, unknown> | undefined;

    ctx.emit({
      type: 'audit_progress',
      stage: 'analyze_linkedin_brand',
      message: 'Analyzing LinkedIn brand elements and comparing with resume...',
      sources_analyzed: 2,
      total_sources: state.brand_sources.length,
    });

    const prompt = `Analyze this LinkedIn profile for personal brand elements. Compare against the resume brand analysis if available.

${PERSONAL_BRAND_RULES}

${resumeBrand ? `RESUME BRAND ANALYSIS (for cross-source comparison):
- Positioning: ${resumeBrand.positioning ?? 'Not available'}
- Value Proposition: ${resumeBrand.value_proposition ?? 'Not available'}
- Tone: ${resumeBrand.tone ?? 'Not available'}
- Key Themes: ${Array.isArray(resumeBrand.key_themes) ? (resumeBrand.key_themes as string[]).join(', ') : 'Not available'}` : 'No resume analysis available for comparison.'}

LINKEDIN CONTENT:
${linkedinText}

Return JSON:
{
  "positioning": "How the candidate positions themselves on LinkedIn",
  "value_proposition": "Value proposition communicated on LinkedIn",
  "tone": "Describe the tone",
  "key_themes": ["theme1", "theme2"],
  "consistency_with_resume": "How well LinkedIn aligns with resume brand (if available)",
  "findings": [
    {
      "id": "lf_1",
      "category": "messaging_inconsistency | value_prop_gap | tone_mismatch | missing_element | outdated_content | audience_misalignment",
      "severity": "critical | high | medium | low",
      "title": "Brief headline of the issue",
      "description": "Detailed description with specific evidence",
      "affected_elements": ["headline", "summary", "experience"],
      "recommendation": "What to do about it"
    }
  ]
}

Rules:
- Compare LinkedIn content against resume brand elements when available
- Flag any contradictions in positioning, tone, or claims between sources
- LinkedIn-specific checks: headline optimization, summary engagement, experience detail level
- Evaluate whether the LinkedIn profile serves its primary audience (recruiters, peers, industry contacts)`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are an executive brand analyst specializing in LinkedIn profile optimization. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    interface RawFinding {
      id?: string;
      category?: string;
      severity?: string;
      title?: string;
      description?: string;
      affected_elements?: string[];
      recommendation?: string;
    }

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      analysis = {};
    }

    scratchpad.linkedin_brand = analysis;

    const rawFindings = Array.isArray(analysis.findings) ? analysis.findings : [];
    const findings: AuditFinding[] = rawFindings.map((f: RawFinding, idx: number) => ({
      id: String(f.id ?? `lf_${idx + 1}`),
      category: parseFindingCategory(f.category),
      severity: parseSeverity(f.severity),
      title: String(f.title ?? ''),
      description: String(f.description ?? ''),
      source: 'linkedin' as BrandSource,
      affected_elements: Array.isArray(f.affected_elements) ? f.affected_elements.map(String) : [],
      recommendation: String(f.recommendation ?? ''),
    }));

    if (!Array.isArray(scratchpad.all_findings)) {
      scratchpad.all_findings = [];
    }
    (scratchpad.all_findings as AuditFinding[]).push(...findings);

    for (const finding of findings) {
      ctx.emit({
        type: 'finding_identified',
        finding_id: finding.id,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_linkedin_brand',
      message: `LinkedIn brand analysis complete — ${findings.length} findings identified`,
    });

    return JSON.stringify({
      success: true,
      positioning: analysis.positioning ?? '',
      tone: analysis.tone ?? '',
      finding_count: findings.length,
      consistency_with_resume: analysis.consistency_with_resume ?? '',
    });
  },
};

// ─── Tool: analyze_bio_brand ──────────────────────────────────────

const analyzeBioBrandTool: AuditorTool = {
  name: 'analyze_bio_brand',
  description:
    'Evaluate bio content for brand consistency with resume and LinkedIn.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      bio_text: {
        type: 'string',
        description: 'Professional bio text content.',
      },
    },
    required: ['bio_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const bioText = String(input.bio_text ?? '');
    if (!bioText || bioText.length < 20) {
      return JSON.stringify({ success: false, error: 'No bio content provided.' });
    }

    const resumeBrand = scratchpad.resume_brand as Record<string, unknown> | undefined;
    const linkedinBrand = scratchpad.linkedin_brand as Record<string, unknown> | undefined;

    ctx.emit({
      type: 'audit_progress',
      stage: 'analyze_bio_brand',
      message: 'Analyzing bio brand elements and comparing with other sources...',
      sources_analyzed: 3,
      total_sources: state.brand_sources.length,
    });

    const prompt = `Analyze this professional bio for personal brand elements. Compare against resume and LinkedIn brand analyses if available.

${PERSONAL_BRAND_RULES}

${resumeBrand ? `RESUME BRAND:
- Positioning: ${resumeBrand.positioning ?? 'N/A'}
- Value Proposition: ${resumeBrand.value_proposition ?? 'N/A'}
- Tone: ${resumeBrand.tone ?? 'N/A'}` : ''}

${linkedinBrand ? `LINKEDIN BRAND:
- Positioning: ${linkedinBrand.positioning ?? 'N/A'}
- Value Proposition: ${linkedinBrand.value_proposition ?? 'N/A'}
- Tone: ${linkedinBrand.tone ?? 'N/A'}` : ''}

BIO CONTENT:
${bioText}

Return JSON:
{
  "positioning": "How the candidate positions themselves in the bio",
  "value_proposition": "Value proposition communicated in the bio",
  "tone": "Describe the tone",
  "consistency_with_other_sources": "How well the bio aligns with resume and LinkedIn",
  "findings": [
    {
      "id": "bf_1",
      "category": "messaging_inconsistency | value_prop_gap | tone_mismatch | missing_element | outdated_content | audience_misalignment",
      "severity": "critical | high | medium | low",
      "title": "Brief headline of the issue",
      "description": "Detailed description with specific evidence",
      "affected_elements": ["opening", "body", "closing"],
      "recommendation": "What to do about it"
    }
  ]
}

Rules:
- Bios serve a different audience (event organizers, board members, clients) — evaluate accordingly
- Compare positioning, tone, and claims against other analyzed sources
- Bio-specific checks: opening hook, narrative flow, appropriate length, call-to-action
- Flag any contradictions with resume or LinkedIn content`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are an executive brand analyst specializing in professional bios. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    interface RawFinding {
      id?: string;
      category?: string;
      severity?: string;
      title?: string;
      description?: string;
      affected_elements?: string[];
      recommendation?: string;
    }

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      analysis = {};
    }

    scratchpad.bio_brand = analysis;

    const rawFindings = Array.isArray(analysis.findings) ? analysis.findings : [];
    const findings: AuditFinding[] = rawFindings.map((f: RawFinding, idx: number) => ({
      id: String(f.id ?? `bf_${idx + 1}`),
      category: parseFindingCategory(f.category),
      severity: parseSeverity(f.severity),
      title: String(f.title ?? ''),
      description: String(f.description ?? ''),
      source: 'bio' as BrandSource,
      affected_elements: Array.isArray(f.affected_elements) ? f.affected_elements.map(String) : [],
      recommendation: String(f.recommendation ?? ''),
    }));

    if (!Array.isArray(scratchpad.all_findings)) {
      scratchpad.all_findings = [];
    }
    (scratchpad.all_findings as AuditFinding[]).push(...findings);

    for (const finding of findings) {
      ctx.emit({
        type: 'finding_identified',
        finding_id: finding.id,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_bio_brand',
      message: `Bio brand analysis complete — ${findings.length} findings identified`,
    });

    return JSON.stringify({
      success: true,
      positioning: analysis.positioning ?? '',
      tone: analysis.tone ?? '',
      finding_count: findings.length,
      consistency_with_other_sources: analysis.consistency_with_other_sources ?? '',
    });
  },
};

// ─── Tool: score_consistency ──────────────────────────────────────

const scoreConsistencyTool: AuditorTool = {
  name: 'score_consistency',
  description:
    'Produce cross-source consistency scores and consolidate all audit findings. Call this after analyzing all available sources.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const allFindings = scratchpad.all_findings as AuditFinding[] | undefined;
    if (!allFindings || allFindings.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No findings available. Analyze at least one source first.',
      });
    }

    const resumeBrand = scratchpad.resume_brand as Record<string, unknown> | undefined;
    const linkedinBrand = scratchpad.linkedin_brand as Record<string, unknown> | undefined;
    const bioBrand = scratchpad.bio_brand as Record<string, unknown> | undefined;

    const analyzedSources: string[] = [];
    if (resumeBrand) analyzedSources.push('resume');
    if (linkedinBrand) analyzedSources.push('linkedin');
    if (bioBrand) analyzedSources.push('bio');

    ctx.emit({
      type: 'transparency',
      stage: 'score_consistency',
      message: `Scoring cross-source consistency across ${analyzedSources.length} sources...`,
    });

    const scorePrompt = `Score the cross-source consistency of this executive's personal brand based on the individual source analyses.

${PERSONAL_BRAND_RULES}

ANALYZED SOURCES: ${analyzedSources.join(', ')}

${resumeBrand ? `RESUME BRAND:
- Positioning: ${resumeBrand.positioning ?? 'N/A'}
- Value Proposition: ${resumeBrand.value_proposition ?? 'N/A'}
- Tone: ${resumeBrand.tone ?? 'N/A'}
- Key Themes: ${Array.isArray(resumeBrand.key_themes) ? (resumeBrand.key_themes as string[]).join(', ') : 'N/A'}
- Strengths: ${Array.isArray(resumeBrand.strengths) ? (resumeBrand.strengths as string[]).join(', ') : 'N/A'}` : ''}

${linkedinBrand ? `LINKEDIN BRAND:
- Positioning: ${linkedinBrand.positioning ?? 'N/A'}
- Value Proposition: ${linkedinBrand.value_proposition ?? 'N/A'}
- Tone: ${linkedinBrand.tone ?? 'N/A'}
- Consistency with Resume: ${linkedinBrand.consistency_with_resume ?? 'N/A'}` : ''}

${bioBrand ? `BIO BRAND:
- Positioning: ${bioBrand.positioning ?? 'N/A'}
- Value Proposition: ${bioBrand.value_proposition ?? 'N/A'}
- Tone: ${bioBrand.tone ?? 'N/A'}
- Consistency with Other Sources: ${bioBrand.consistency_with_other_sources ?? 'N/A'}` : ''}

EXISTING FINDINGS (${allFindings.length} total):
${allFindings.map((f) => `- [${f.severity}] ${f.title} (${f.source}, ${f.category})`).join('\n')}

${state.target_context ? `TARGET CONTEXT:
- Role: ${state.target_context.target_role}
- Industry: ${state.target_context.target_industry}` : ''}

Return JSON:
{
  "consistency_scores": {
    "overall": 75,
    "messaging": 80,
    "value_proposition": 70,
    "tone_voice": 85,
    "audience_alignment": 65,
    "visual_identity": 60
  },
  "score_rationale": {
    "overall": "Brief explanation for the overall score",
    "messaging": "Brief explanation",
    "value_proposition": "Brief explanation",
    "tone_voice": "Brief explanation",
    "audience_alignment": "Brief explanation",
    "visual_identity": "Brief explanation"
  },
  "cross_source_findings": [
    {
      "id": "cs_1",
      "category": "messaging_inconsistency | tone_mismatch",
      "severity": "critical | high | medium | low",
      "title": "Brief headline",
      "description": "Cross-source issue description",
      "source": "resume",
      "affected_elements": ["positioning", "headline"],
      "recommendation": "What to do"
    }
  ]
}

Rules:
- Scores are 0-100 where 100 is perfect consistency
- With only 1 source analyzed, score internal consistency and flag that cross-source comparison was limited
- visual_identity score should reflect consistency of professional presentation signals (not actual visual design)
- Cross-source findings are NEW findings discovered through comparison — do not duplicate existing findings
- Be honest — strong brands get high scores`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are a brand consistency analyst who scores cross-source alignment for executive personal brands. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: scorePrompt }],
    });

    interface RawCrossFinding {
      id?: string;
      category?: string;
      severity?: string;
      title?: string;
      description?: string;
      source?: string;
      affected_elements?: string[];
      recommendation?: string;
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {};
    }

    // Parse consistency scores
    const rawScores = result.consistency_scores as Record<string, unknown> | undefined;
    const scores: ConsistencyScores = {
      overall: Math.max(0, Math.min(100, Number(rawScores?.overall) || 50)),
      messaging: Math.max(0, Math.min(100, Number(rawScores?.messaging) || 50)),
      value_proposition: Math.max(0, Math.min(100, Number(rawScores?.value_proposition) || 50)),
      tone_voice: Math.max(0, Math.min(100, Number(rawScores?.tone_voice) || 50)),
      audience_alignment: Math.max(0, Math.min(100, Number(rawScores?.audience_alignment) || 50)),
      visual_identity: Math.max(0, Math.min(100, Number(rawScores?.visual_identity) || 50)),
    };

    // Parse cross-source findings
    const rawCrossFindings = Array.isArray(result.cross_source_findings)
      ? result.cross_source_findings
      : [];
    const crossFindings: AuditFinding[] = rawCrossFindings.map((f: RawCrossFinding, idx: number) => ({
      id: String(f.id ?? `cs_${idx + 1}`),
      category: parseFindingCategory(f.category),
      severity: parseSeverity(f.severity),
      title: String(f.title ?? ''),
      description: String(f.description ?? ''),
      source: parseBrandSource(f.source),
      affected_elements: Array.isArray(f.affected_elements) ? f.affected_elements.map(String) : [],
      recommendation: String(f.recommendation ?? ''),
    }));

    // Merge cross-source findings into all findings
    allFindings.push(...crossFindings);

    // Update state
    state.audit_findings = allFindings;
    state.consistency_scores = scores;

    // Emit cross-source findings
    for (const finding of crossFindings) {
      ctx.emit({
        type: 'finding_identified',
        finding_id: finding.id,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
      });
    }

    ctx.emit({
      type: 'audit_complete',
      finding_count: allFindings.length,
      consistency_scores: scores,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'score_consistency',
      message: `Consistency scoring complete — overall: ${scores.overall}/100, ${allFindings.length} total findings`,
    });

    return JSON.stringify({
      success: true,
      consistency_scores: scores,
      total_findings: allFindings.length,
      cross_source_findings: crossFindings.length,
      sources_analyzed: analyzedSources,
    });
  },
};

// ─── Exports ──────────────────────────────────────────────────────

export const auditorTools: AgentTool<PersonalBrandState, PersonalBrandSSEEvent>[] = [
  analyzeResumeBrandTool,
  analyzeLinkedinBrandTool,
  analyzeBioBrandTool,
  scoreConsistencyTool,
];
