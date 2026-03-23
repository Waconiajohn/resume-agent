/**
 * LinkedIn Optimizer Analyzer — Tool definitions.
 *
 * 4 tools:
 * - parse_inputs: Extract structured data from resume + current LinkedIn profile
 * - analyze_current_profile: Assess headline, about, experience against optimization rules
 * - identify_keyword_gaps: Compare resume/strategy keywords vs LinkedIn profile keywords
 * - simulate_recruiter_search: LLM-powered recruiter search simulation with section weighting
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { LinkedInOptimizerState, LinkedInOptimizerSSEEvent } from '../types.js';
import { llm, MODEL_LIGHT, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

type LinkedInOptimizerTool = AgentTool<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>;

// ─── Tool: parse_inputs ─────────────────────────────────────────────

const parseInputsTool: LinkedInOptimizerTool = {
  name: 'parse_inputs',
  description:
    'Parse the candidate resume text and current LinkedIn profile into structured data. ' +
    'Extracts candidate name, title, skills, achievements, work history from resume, ' +
    'and current headline, about text, and experience text from the LinkedIn profile. ' +
    'Also extracts target role/industry/seniority context. ' +
    'Call this first before any other tools.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text to parse',
      },
      linkedin_headline: {
        type: 'string',
        description: 'Current LinkedIn headline text',
      },
      linkedin_about: {
        type: 'string',
        description: 'Current LinkedIn about/summary text',
      },
      linkedin_experience: {
        type: 'string',
        description: 'Current LinkedIn experience section text',
      },
      target_role: {
        type: 'string',
        description: 'Target role the user is seeking',
      },
      target_industry: {
        type: 'string',
        description: 'Target industry',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    const linkedinHeadline = String(input.linkedin_headline ?? '');
    const linkedinAbout = String(input.linkedin_about ?? '');
    const linkedinExperience = String(input.linkedin_experience ?? '');
    const targetRole = String(input.target_role ?? '');
    const targetIndustry = String(input.target_industry ?? '');

    ctx.emit({
      type: 'transparency',
      stage: 'parse_inputs',
      message: 'Parsing resume and LinkedIn profile...',
    });

    // Extract structured data from resume
    const resumeResponse = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 4096,
      system: 'You extract structured data from resumes. Return ONLY valid JSON, no comments, no markdown fencing.',
      messages: [{
        role: 'user',
        content: `Extract the following from this resume and return as JSON:
{
  "name": "Full Name",
  "current_title": "Most recent job title",
  "career_summary": "2-3 sentence career summary",
  "key_skills": ["skill1", "skill2", ...],
  "key_achievements": ["achievement with metrics if available", ...],
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
      }],
    });

    let resumeData;
    try {
      resumeData = JSON.parse(repairJSON(resumeResponse.text) ?? resumeResponse.text);
    } catch {
      resumeData = {
        name: 'Candidate',
        current_title: 'Professional',
        career_summary: '',
        key_skills: [],
        key_achievements: [],
        work_history: [],
      };
    }

    // Store parsed data in state
    const state = ctx.getState();
    state.resume_data = resumeData;

    // Store current LinkedIn profile if provided
    if (linkedinHeadline || linkedinAbout || linkedinExperience) {
      state.current_profile = {
        headline: linkedinHeadline,
        about: linkedinAbout,
        experience_text: linkedinExperience,
      };
    }

    // Store target context
    if (targetRole || targetIndustry) {
      state.target_context = {
        target_role: targetRole || resumeData.current_title || '',
        target_industry: targetIndustry || '',
        target_seniority: 'senior',
      };
    } else {
      // Derive from resume
      state.target_context = {
        target_role: resumeData.current_title || '',
        target_industry: '',
        target_seniority: 'senior',
      };
    }

    // Disclose seniority fallback — target_seniority always defaults to 'senior'
    // when no explicit target context is provided
    if (!targetRole && !targetIndustry) {
      ctx.emit({
        type: 'transparency',
        stage: 'parse_inputs',
        message: 'No target role specified — defaulting to "senior" seniority level. Provide target details for more accurate optimization.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'parse_inputs',
      message: `Parsed resume for ${resumeData.name} — ${resumeData.key_skills?.length ?? 0} skills, ${resumeData.work_history?.length ?? 0} roles`,
    });

    return JSON.stringify({
      success: true,
      candidate_name: resumeData.name,
      current_title: resumeData.current_title,
      skills_count: resumeData.key_skills?.length ?? 0,
      work_history_count: resumeData.work_history?.length ?? 0,
      has_current_profile: !!(linkedinHeadline || linkedinAbout || linkedinExperience),
    });
  },
};

// ─── Tool: analyze_current_profile ──────────────────────────────────

const analyzeCurrentProfileTool: LinkedInOptimizerTool = {
  name: 'analyze_current_profile',
  description:
    'Analyze the current LinkedIn profile against optimization best practices. ' +
    'Assesses the headline, about section, and identifies positioning gaps between ' +
    'the resume and LinkedIn profile. Call this after parse_inputs.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      focus_areas: {
        type: 'string',
        description: 'Specific areas to focus analysis on (optional)',
      },
    },
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Call parse_inputs first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analysis',
      message: 'Analyzing current LinkedIn profile against resume positioning...',
    });

    const currentProfile = state.current_profile;
    const resumeData = state.resume_data;
    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;
    const positioningSection = renderPositioningStrategySection({
      heading: 'POSITIONING STRATEGY',
      sharedStrategy: sharedContext?.positioningStrategy,
      legacyStrategy: platformContext?.positioning_strategy,
    }).join('\n');
    const narrativeLines = renderCareerNarrativeSection({
      heading: 'CAREER NARRATIVE',
      sharedNarrative: sharedContext?.careerNarrative,
    });
    const narrativeSection = (narrativeLines.length > 0
      ? narrativeLines
      : renderWhyMeStorySection({
          heading: 'WHY-ME STORY',
          legacyWhyMeStory: platformContext?.why_me_story,
        })).join('\n');
    const evidenceSection = renderEvidenceInventorySection({
      heading: 'EVIDENCE INVENTORY',
      sharedInventory: sharedContext?.evidenceInventory,
      legacyEvidence: platformContext?.evidence_items,
      maxItems: 8,
    }).join('\n');

    const analysisPrompt = `Analyze this LinkedIn profile against the candidate's resume and provide a detailed assessment.

CANDIDATE RESUME DATA:
- Name: ${resumeData.name}
- Current Title: ${resumeData.current_title}
- Career Summary: ${resumeData.career_summary}
- Key Skills: ${resumeData.key_skills?.join(', ') || 'None listed'}
- Key Achievements: ${resumeData.key_achievements?.join(' | ') || 'None listed'}
- Work History: ${resumeData.work_history?.map((w: { company: string; title: string; duration: string }) => `${w.title} at ${w.company} (${w.duration})`).join(', ') || 'None listed'}

${positioningSection}
${narrativeSection}
${evidenceSection}

CURRENT LINKEDIN PROFILE:
- Headline: ${currentProfile?.headline || '(not provided)'}
- About: ${currentProfile?.about || '(not provided)'}
- Experience: ${currentProfile?.experience_text || '(not provided)'}

Return your analysis as JSON:
{
  "headline_assessment": "Detailed assessment of current headline — what works, what doesn't, what's missing",
  "about_assessment": "Detailed assessment of current about section — length, narrative quality, keyword presence, hook strength",
  "positioning_gaps": ["gap 1 between resume positioning and LinkedIn", "gap 2", ...],
  "strengths": ["strength already reflected in profile", ...]
}

Be specific and actionable. Reference the optimization rules:
- Headline should be 220 chars max, lead with value proposition, include 2-3 keywords
- About should be 1,500-2,400 chars, first person, career identity hook in first 300 chars
- Profile should complement resume, not duplicate it
- Content should serve both recruiter search AND hiring manager evaluation`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: 'You are a LinkedIn profile optimization expert who analyzes profiles for mid-to-senior executives. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    let profileAnalysis;
    try {
      profileAnalysis = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      profileAnalysis = {
        headline_assessment: 'Unable to parse analysis — profile will be optimized from resume data.',
        about_assessment: 'Unable to parse analysis — about section will be written from scratch.',
        positioning_gaps: ['Full analysis unavailable — will optimize based on resume data'],
        strengths: [],
      };
    }

    state.profile_analysis = profileAnalysis;

    ctx.emit({
      type: 'stage_complete',
      stage: 'analysis',
      message: `Profile analysis complete — ${profileAnalysis.positioning_gaps?.length ?? 0} gaps identified, ${profileAnalysis.strengths?.length ?? 0} strengths noted`,
    });

    return JSON.stringify({
      success: true,
      gaps_count: profileAnalysis.positioning_gaps?.length ?? 0,
      strengths_count: profileAnalysis.strengths?.length ?? 0,
      has_headline: !!currentProfile?.headline,
      has_about: !!currentProfile?.about,
    });
  },
};

// ─── Tool: identify_keyword_gaps ────────────────────────────────────

const identifyKeywordGapsTool: LinkedInOptimizerTool = {
  name: 'identify_keyword_gaps',
  description:
    'Identify keyword gaps between the resume/positioning strategy and the current LinkedIn profile. ' +
    'Generates recommended keywords for the target role and scores current coverage. ' +
    'Call this after parse_inputs.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      target_role_override: {
        type: 'string',
        description: 'Override the target role for keyword analysis (optional)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Call parse_inputs first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'keywords',
      message: 'Analyzing keyword coverage and gaps...',
    });

    const resumeData = state.resume_data;
    const currentProfile = state.current_profile;
    const targetRole = String(input.target_role_override ?? state.target_context?.target_role ?? resumeData.current_title ?? '');
    const targetIndustry = state.target_context?.target_industry ?? '';

    const keywordPrompt = `Perform a keyword gap analysis for a LinkedIn profile optimization.

TARGET ROLE: ${targetRole}
TARGET INDUSTRY: ${targetIndustry || 'Not specified'}

RESUME DATA:
- Skills: ${resumeData.key_skills?.join(', ') || 'None listed'}
- Achievements: ${resumeData.key_achievements?.join(' | ') || 'None listed'}
- Work History Titles: ${resumeData.work_history?.map((w: { title: string }) => w.title).join(', ') || 'None listed'}

CURRENT LINKEDIN PROFILE TEXT:
${currentProfile ? `Headline: ${currentProfile.headline || '(empty)'}
About: ${currentProfile.about || '(empty)'}
Experience: ${currentProfile.experience_text || '(empty)'}` : '(no current profile provided)'}

Analyze and return as JSON:
{
  "missing_keywords": ["keywords found in resume/strategy but missing from LinkedIn profile"],
  "present_keywords": ["keywords already present in the LinkedIn profile"],
  "recommended_keywords": ["top 15-20 recruiter-facing keywords for this target role, including both full terms AND abbreviations where applicable"],
  "coverage_score": 0-100
}

Rules for keyword analysis:
- Include industry-specific tools, methodologies, and frameworks by name
- Include both full terms AND common abbreviations (e.g., "Supply Chain Management" AND "SCM")
- Recommended keywords should reflect what recruiters actually search for
- Coverage score: percentage of recommended keywords present in the current profile (0 if no profile provided)
- Missing keywords are high-value — they should appear in the optimized profile`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: 'You are a LinkedIn SEO and recruiter search expert. You know exactly what keywords recruiters use when searching for candidates. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: keywordPrompt }],
    });

    let keywordAnalysis;
    try {
      keywordAnalysis = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      keywordAnalysis = {
        missing_keywords: resumeData.key_skills?.slice(0, 10) ?? [],
        present_keywords: [],
        recommended_keywords: resumeData.key_skills ?? [],
        coverage_score: 0,
      };
    }

    state.keyword_analysis = keywordAnalysis;

    ctx.emit({
      type: 'stage_complete',
      stage: 'keywords',
      message: `Keyword analysis complete — ${keywordAnalysis.missing_keywords?.length ?? 0} missing, ${keywordAnalysis.coverage_score ?? 0}% coverage`,
    });

    return JSON.stringify({
      success: true,
      missing_count: keywordAnalysis.missing_keywords?.length ?? 0,
      present_count: keywordAnalysis.present_keywords?.length ?? 0,
      recommended_count: keywordAnalysis.recommended_keywords?.length ?? 0,
      coverage_score: keywordAnalysis.coverage_score ?? 0,
    });
  },
};

// ─── Tool: simulate_recruiter_search ────────────────────────────────

const simulateRecruiterSearchTool: LinkedInOptimizerTool = {
  name: 'simulate_recruiter_search',
  description:
    'Simulate how a recruiter would find this profile through LinkedIn Recruiter search. ' +
    'Uses LLM-powered analysis to evaluate keyword presence by section with weighted scoring. ' +
    'Section weights: headline (40%), about (25%), experience (25%), skills (10%). ' +
    'Returns overall score, section analysis, missing keywords, and placement recommendations.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      profile_text: {
        type: 'string',
        description: 'Full LinkedIn profile text (headline + about + experience combined)',
      },
      target_keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Keywords a recruiter would search for',
      },
      target_role: {
        type: 'string',
        description: 'The type of role being targeted',
      },
    },
    required: ['profile_text', 'target_keywords'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const profileText = String(input.profile_text ?? '');
    const targetKeywords = Array.isArray(input.target_keywords)
      ? (input.target_keywords as unknown[]).map(String)
      : [];
    const targetRole = String(input.target_role ?? state.target_context?.target_role ?? '');

    if (!profileText) {
      return JSON.stringify({
        success: false,
        error: 'profile_text is required. Provide the full LinkedIn profile text to analyze.',
      });
    }

    if (targetKeywords.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'target_keywords array is required. Provide at least 3 keywords recruiters would search for.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'recruiter_search',
      message: `Simulating recruiter search for ${targetKeywords.length} keywords...`,
    });

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are a LinkedIn Recruiter power user who knows exactly how recruiters filter and score candidates. ' +
        'You analyze profiles for keyword presence with surgical precision. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Simulate a LinkedIn Recruiter search for this profile.

## Target Keywords (what a recruiter is searching for)
${targetKeywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

## Target Role
${targetRole || 'Not specified'}

## Profile Text to Analyze
${profileText}

LinkedIn Recruiter weights keyword presence by section:
- Headline: 40% weight (most important — search algorithm prioritizes this heavily)
- About section: 25% weight
- Experience section: 25% weight
- Skills section: 10% weight

For each keyword, determine which section(s) it appears in. Score accordingly.

Return JSON:
{
  "overall_score": 0-100,
  "section_analysis": [
    {
      "section": "headline",
      "weight": 40,
      "keywords_found": ["keyword1", "keyword2"],
      "keywords_missing": ["keyword3"],
      "section_score": 0-100,
      "note": "Brief assessment of this section's keyword coverage"
    },
    {
      "section": "about",
      "weight": 25,
      "keywords_found": [],
      "keywords_missing": [],
      "section_score": 0-100,
      "note": "..."
    },
    {
      "section": "experience",
      "weight": 25,
      "keywords_found": [],
      "keywords_missing": [],
      "section_score": 0-100,
      "note": "..."
    },
    {
      "section": "skills",
      "weight": 10,
      "keywords_found": [],
      "keywords_missing": [],
      "section_score": 0-100,
      "note": "..."
    }
  ],
  "missing_keywords": ["keywords from target list not found anywhere in profile"],
  "recommendations": [
    "Specific, actionable placement recommendation with which section to add which keyword"
  ],
  "verdict": "One sentence summary of how a recruiter would rate this profile's searchability"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        overall_score: 0,
        section_analysis: [],
        missing_keywords: targetKeywords,
        recommendations: ['Unable to analyze profile — please ensure profile text is provided'],
        verdict: 'Analysis unavailable',
      };
    }

    state.recruiter_search_result = result;

    ctx.emit({
      type: 'stage_complete',
      stage: 'recruiter_search',
      message: `Recruiter search simulation complete — ${result.overall_score ?? 0}% searchability score`,
    });

    return JSON.stringify({
      success: true,
      overall_score: result.overall_score,
      missing_count: Array.isArray(result.missing_keywords) ? result.missing_keywords.length : 0,
      section_analysis: result.section_analysis,
      missing_keywords: result.missing_keywords,
      recommendations: result.recommendations,
      verdict: result.verdict,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const analyzerTools: LinkedInOptimizerTool[] = [
  parseInputsTool,
  analyzeCurrentProfileTool,
  identifyKeywordGapsTool,
  simulateRecruiterSearchTool,
];
