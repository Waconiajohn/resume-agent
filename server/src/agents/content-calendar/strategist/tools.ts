/**
 * Content Calendar Strategist — Tool definitions.
 *
 * 4 tools:
 * - analyze_expertise: Parse resume into structured expertise data
 * - identify_themes: Identify 5-7 content themes from expertise + positioning
 * - map_audience_interests: Map primary/secondary audiences and pain points
 * - plan_content_mix: Plan posting frequency, type distribution, and schedule
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { ContentCalendarState, ContentCalendarSSEEvent } from '../types.js';
import { llm, MODEL_LIGHT, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

type ContentCalendarTool = AgentTool<ContentCalendarState, ContentCalendarSSEEvent>;

// ─── Tool: analyze_expertise ────────────────────────────────────────

const analyzeExpertiseTool: ContentCalendarTool = {
  name: 'analyze_expertise',
  description:
    'Parse the candidate resume text into structured expertise data. ' +
    'Extracts candidate name, title, skills, achievements, work history, ' +
    'and derives target role/industry context. ' +
    'Call this first before any other tools.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text to parse',
      },
      target_role: {
        type: 'string',
        description: 'Target role the user is seeking (optional)',
      },
      target_industry: {
        type: 'string',
        description: 'Target industry (optional)',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    const targetRole = String(input.target_role ?? '');
    const targetIndustry = String(input.target_industry ?? '');

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_expertise',
      message: 'Parsing resume and extracting expertise data...',
    });

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

    // Store parsed resume data in state
    const state = ctx.getState();
    state.resume_data = resumeData;

    // Derive target context
    if (targetRole || targetIndustry) {
      state.target_context = {
        target_role: targetRole || resumeData.current_title || '',
        target_industry: targetIndustry || '',
        target_seniority: 'senior',
      };
    } else {
      state.target_context = {
        target_role: resumeData.current_title || '',
        target_industry: '',
        target_seniority: 'senior',
      };
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_expertise',
      message: `Parsed resume for ${resumeData.name} — ${resumeData.key_skills?.length ?? 0} skills, ${resumeData.work_history?.length ?? 0} roles identified`,
    });

    return JSON.stringify({
      success: true,
      candidate_name: resumeData.name,
      current_title: resumeData.current_title,
      skills_count: resumeData.key_skills?.length ?? 0,
      achievements_count: resumeData.key_achievements?.length ?? 0,
      work_history_count: resumeData.work_history?.length ?? 0,
    });
  },
};

// ─── Tool: identify_themes ──────────────────────────────────────────

const identifyThemesTool: ContentCalendarTool = {
  name: 'identify_themes',
  description:
    'Identify 5-7 content themes based on the candidate\'s expertise, positioning strategy, ' +
    'and Why-Me story. Each theme includes rationale, suggested content types, audience segment, ' +
    'and keywords. Call this after analyze_expertise.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      theme_count: {
        type: 'number',
        description: 'Number of themes to identify (default: 6)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Call analyze_expertise first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_themes',
      message: 'Identifying content themes from expertise and positioning...',
    });

    const resumeData = state.resume_data;
    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;
    const themeCount = Number(input.theme_count ?? 6);
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
      maxItems: 15,
    }).join('\n');

    const themePrompt = `Identify ${themeCount} content themes for a LinkedIn content calendar based on this executive's expertise.

CANDIDATE PROFILE:
- Name: ${resumeData.name}
- Current Title: ${resumeData.current_title}
- Career Summary: ${resumeData.career_summary}
- Key Skills: ${resumeData.key_skills?.join(', ') || 'None listed'}
- Key Achievements: ${resumeData.key_achievements?.join(' | ') || 'None listed'}
- Work History: ${resumeData.work_history?.map((w: { company: string; title: string; duration: string }) => `${w.title} at ${w.company} (${w.duration})`).join(', ') || 'None listed'}

${positioningSection ? `${positioningSection}\n` : ''}${narrativeSection ? `${narrativeSection}\n` : ''}${evidenceSection ? `${evidenceSection}\n` : ''}

Return as JSON array:
[
  {
    "id": "theme_1",
    "name": "Theme Name (e.g., Digital Transformation Leadership)",
    "rationale": "Why this theme matters for their positioning — 1-2 sentences",
    "suggested_types": ["thought_leadership", "case_study"],
    "audience_segment": "Who this theme targets (e.g., C-suite in manufacturing)",
    "keywords": ["keyword1", "keyword2", "keyword3"]
  }
]

Rules:
- Each theme must be grounded in REAL expertise from the resume — never fabricate themes
- suggested_types must use these values: thought_leadership, storytelling, engagement, industry_insight, how_to, case_study, career_lesson
- Each theme should target a slightly different audience segment for maximum reach
- Keywords should be terms recruiters and industry peers actually search for
- If a Why-Me story is available, at least one theme should leverage what they're "known for"
- Themes should be specific enough to generate multiple distinct posts, not generic`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: 'You are a LinkedIn content strategy expert who helps executives build thought leadership. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: themePrompt }],
    });

    let themes;
    try {
      themes = JSON.parse(repairJSON(response.text) ?? response.text);
      // Ensure it's an array
      if (!Array.isArray(themes)) {
        themes = themes.themes ?? themes.content_themes ?? [themes];
      }
    } catch {
      // Graceful fallback: derive basic themes from skills
      const skills = resumeData.key_skills ?? [];
      themes = skills.slice(0, themeCount).map((skill: string, i: number) => ({
        id: `theme_${i + 1}`,
        name: skill,
        rationale: `Core expertise area based on resume skills.`,
        suggested_types: ['thought_leadership', 'how_to'],
        audience_segment: 'Industry peers and hiring managers',
        keywords: [skill.toLowerCase()],
      }));
    }

    state.themes = themes;

    // Emit individual theme events
    for (const theme of themes) {
      ctx.emit({
        type: 'theme_identified',
        theme_name: theme.name,
        theme_count: themes.length,
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_themes',
      message: `Identified ${themes.length} content themes: ${themes.map((t: { name: string }) => t.name).join(', ')}`,
    });

    return JSON.stringify({
      success: true,
      theme_count: themes.length,
      themes: themes.map((t: { id: string; name: string; audience_segment: string }) => ({
        id: t.id,
        name: t.name,
        audience_segment: t.audience_segment,
      })),
    });
  },
};

// ─── Tool: map_audience_interests ───────────────────────────────────

const mapAudienceInterestsTool: ContentCalendarTool = {
  name: 'map_audience_interests',
  description:
    'Map the primary and secondary audiences for the candidate\'s LinkedIn content. ' +
    'Identifies audience interests, pain points, and what the candidate can uniquely address. ' +
    'Also produces an expertise analysis. Call this after analyze_expertise.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      focus_area: {
        type: 'string',
        description: 'Specific audience focus area to emphasize (optional)',
      },
    },
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Call analyze_expertise first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'map_audience',
      message: 'Mapping target audiences and their interests...',
    });

    const resumeData = state.resume_data;
    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;
    const targetContext = state.target_context;
    const positioningSection = renderPositioningStrategySection({
      heading: 'POSITIONING STRATEGY',
      sharedStrategy: sharedContext?.positioningStrategy,
      legacyStrategy: platformContext?.positioning_strategy,
    }).join('\n');
    const narrativeLines = renderCareerNarrativeSection({
      heading: 'WHY-ME / CAREER NARRATIVE',
      sharedNarrative: sharedContext?.careerNarrative,
    });
    const whyMeSection = (narrativeLines.length > 0
      ? narrativeLines
      : renderWhyMeStorySection({
          heading: 'WHY-ME STORY',
          legacyWhyMeStory: platformContext?.why_me_story,
        })).join('\n');

    const audiencePrompt = `Map the target audience for a LinkedIn content calendar for this executive.

CANDIDATE PROFILE:
- Name: ${resumeData.name}
- Current Title: ${resumeData.current_title}
- Career Summary: ${resumeData.career_summary}
- Key Skills: ${resumeData.key_skills?.join(', ') || 'None listed'}
- Key Achievements: ${resumeData.key_achievements?.join(' | ') || 'None listed'}
- Target Role: ${targetContext?.target_role || resumeData.current_title || 'Not specified'}
- Target Industry: ${targetContext?.target_industry || 'Not specified'}

${positioningSection ? `${positioningSection}\n` : ''}${whyMeSection ? `${whyMeSection}\n` : ''}

Return as JSON with TWO sections:

{
  "audience_mapping": {
    "primary_audience": "Primary audience description (e.g., C-suite executives in manufacturing seeking digital transformation)",
    "secondary_audience": "Secondary audience description (e.g., mid-level operations managers looking for leadership insights)",
    "audience_interests": ["interest 1", "interest 2", "interest 3", ...],
    "pain_points": ["pain point this candidate can address 1", "pain point 2", ...]
  },
  "expertise_analysis": {
    "core_expertise": ["expertise area 1", "expertise area 2", ...],
    "industries": ["industry 1", "industry 2"],
    "seniority": "Senior Executive / VP / Director / etc.",
    "differentiators": ["what sets them apart 1", "what sets them apart 2", ...],
    "post_worthy_achievements": ["achievement that would make a great LinkedIn post 1", ...]
  }
}

Rules:
- Primary audience should be the people this executive most wants to reach (hiring managers, peers, potential clients)
- Secondary audience should extend reach (aspiring professionals, adjacent industries)
- Pain points should be problems the candidate can credibly solve based on their experience
- Post-worthy achievements should be specific, quantified where possible, and make compelling narratives
- Differentiators should reflect genuine unique value — not generic platitudes`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: 'You are a LinkedIn audience strategy expert who helps executives identify and reach their ideal professional audience. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: audiencePrompt }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        audience_mapping: {
          primary_audience: `${resumeData.current_title || 'Executive'} peers and hiring managers`,
          secondary_audience: 'Aspiring professionals in the same field',
          audience_interests: resumeData.key_skills?.slice(0, 5) ?? [],
          pain_points: ['Leadership challenges', 'Industry disruption', 'Team performance'],
        },
        expertise_analysis: {
          core_expertise: resumeData.key_skills?.slice(0, 5) ?? [],
          industries: [],
          seniority: 'Senior',
          differentiators: [],
          post_worthy_achievements: resumeData.key_achievements?.slice(0, 5) ?? [],
        },
      };
    }

    state.audience_mapping = result.audience_mapping;
    state.expertise_analysis = result.expertise_analysis;

    ctx.emit({
      type: 'transparency',
      stage: 'map_audience',
      message: `Audience mapped — Primary: ${result.audience_mapping.primary_audience}, ${result.audience_mapping.pain_points?.length ?? 0} pain points identified`,
    });

    return JSON.stringify({
      success: true,
      primary_audience: result.audience_mapping.primary_audience,
      secondary_audience: result.audience_mapping.secondary_audience,
      interests_count: result.audience_mapping.audience_interests?.length ?? 0,
      pain_points_count: result.audience_mapping.pain_points?.length ?? 0,
      differentiators_count: result.expertise_analysis.differentiators?.length ?? 0,
    });
  },
};

// ─── Tool: plan_content_mix ─────────────────────────────────────────

const planContentMixTool: ContentCalendarTool = {
  name: 'plan_content_mix',
  description:
    'Plan the content mix for the 30-day calendar — posting frequency, content type distribution, ' +
    'and optimal posting days. Requires themes and audience mapping to be available. ' +
    'Call this after identify_themes and map_audience_interests.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      posts_per_week_override: {
        type: 'number',
        description: 'Override the recommended posts per week (optional, default: AI decides based on analysis)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();

    if (!state.themes) {
      return JSON.stringify({ success: false, error: 'No themes available. Call identify_themes first.' });
    }
    if (!state.audience_mapping) {
      return JSON.stringify({ success: false, error: 'No audience mapping available. Call map_audience_interests first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'plan_content_mix',
      message: 'Planning content mix and posting schedule...',
    });

    const themes = state.themes;
    const audienceMapping = state.audience_mapping;
    const expertiseAnalysis = state.expertise_analysis;
    const postsOverride = input.posts_per_week_override ? Number(input.posts_per_week_override) : null;

    const mixPrompt = `Plan the content mix for a 30-day LinkedIn content calendar.

THEMES (${themes.length} identified):
${themes.map((t: { name: string; suggested_types: string[]; audience_segment: string }) =>
  `- ${t.name}: targets ${t.audience_segment}, types: ${t.suggested_types.join(', ')}`
).join('\n')}

AUDIENCE:
- Primary: ${audienceMapping.primary_audience}
- Secondary: ${audienceMapping.secondary_audience}
- Key Interests: ${audienceMapping.audience_interests?.join(', ') || 'Not specified'}

${expertiseAnalysis ? `EXPERTISE:
- Core: ${expertiseAnalysis.core_expertise?.join(', ') || 'Not specified'}
- Seniority: ${expertiseAnalysis.seniority || 'Senior'}
- Post-worthy achievements: ${expertiseAnalysis.post_worthy_achievements?.length ?? 0} available` : ''}

${postsOverride ? `USER REQUESTED: ${postsOverride} posts per week` : ''}

Return as JSON:
{
  "posts_per_week": 3-5,
  "type_distribution": {
    "thought_leadership": 25,
    "storytelling": 20,
    "engagement": 15,
    "industry_insight": 15,
    "how_to": 10,
    "case_study": 10,
    "career_lesson": 5
  },
  "posting_days": ["tuesday", "wednesday", "thursday"],
  "rationale": "Why this mix and schedule — 2-3 sentences"
}

Rules:
- posts_per_week should be 3-5 for executives (quality over quantity)
- type_distribution percentages must sum to 100
- Only include content types that make sense for this candidate's expertise level
- posting_days should match LinkedIn's highest engagement windows (Tue-Thu are typically best)
- thought_leadership should be the largest or second-largest share for senior executives
- engagement posts (polls, questions, hot takes) should be included for algorithm visibility
- The rationale should explain WHY this specific mix serves the candidate's positioning goals`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: 'You are a LinkedIn content planning expert who optimizes posting schedules for executive thought leadership. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: mixPrompt }],
    });

    let contentMix;
    try {
      contentMix = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      contentMix = {
        posts_per_week: postsOverride ?? 3,
        type_distribution: {
          thought_leadership: 30,
          storytelling: 20,
          engagement: 15,
          industry_insight: 15,
          how_to: 10,
          case_study: 10,
        },
        posting_days: ['tuesday', 'wednesday', 'thursday'],
        rationale: 'Default balanced mix for senior executive positioning.',
      };
    }

    state.content_mix = contentMix;

    ctx.emit({
      type: 'transparency',
      stage: 'plan_content_mix',
      message: `Content mix planned — ${contentMix.posts_per_week} posts/week on ${contentMix.posting_days?.join(', ')}, led by ${Object.entries(contentMix.type_distribution ?? {}).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] ?? 'thought_leadership'}`,
    });

    return JSON.stringify({
      success: true,
      posts_per_week: contentMix.posts_per_week,
      posting_days: contentMix.posting_days,
      type_distribution: contentMix.type_distribution,
      total_posts_30_days: Math.round((contentMix.posts_per_week ?? 3) * 4.3),
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const strategistTools: ContentCalendarTool[] = [
  analyzeExpertiseTool,
  identifyThemesTool,
  mapAudienceInterestsTool,
  planContentMixTool,
];
