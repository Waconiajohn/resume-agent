/**
 * Networking Outreach Researcher — Tool definitions.
 *
 * 4 tools:
 * - analyze_target: Build a profile of the target contact
 * - find_common_ground: Identify shared connections between user and target
 * - assess_connection_path: Determine connection degree and approach strategy
 * - plan_outreach_sequence: Design the outreach message sequence
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { NetworkingOutreachState, NetworkingOutreachSSEEvent } from '../types.js';
import { llm, MODEL_LIGHT, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

type NetworkingOutreachTool = AgentTool<NetworkingOutreachState, NetworkingOutreachSSEEvent>;

// ─── Tool: analyze_target ───────────────────────────────────────────

const analyzeTargetTool: NetworkingOutreachTool = {
  name: 'analyze_target',
  description:
    'Analyze a target contact to build a professional profile. ' +
    'Determines what they likely care about, their industry context, seniority, ' +
    'and recent activity. Call this first before any other tools.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      target_name: {
        type: 'string',
        description: 'Full name of the target contact',
      },
      target_title: {
        type: 'string',
        description: 'Current job title of the target contact',
      },
      target_company: {
        type: 'string',
        description: 'Current company of the target contact',
      },
      target_linkedin_url: {
        type: 'string',
        description: 'LinkedIn profile URL of the target (optional)',
      },
      context_notes: {
        type: 'string',
        description: 'Additional context about the target — recent posts, mutual connections, how you found them (optional)',
      },
      resume_text: {
        type: 'string',
        description: 'Raw resume text of the candidate (optional — used to parse resume data if not already loaded)',
      },
    },
    required: ['target_name', 'target_title', 'target_company'],
  },
  async execute(input, ctx) {
    const targetName = String(input.target_name ?? '');
    const targetTitle = String(input.target_title ?? '');
    const targetCompany = String(input.target_company ?? '');
    const targetLinkedinUrl = input.target_linkedin_url ? String(input.target_linkedin_url) : undefined;
    const contextNotes = input.context_notes ? String(input.context_notes) : undefined;

    // Store target input in state
    const state = ctx.getState();
    state.target_input = {
      target_name: targetName,
      target_title: targetTitle,
      target_company: targetCompany,
      target_linkedin_url: targetLinkedinUrl,
      context_notes: contextNotes,
    };

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_target',
      message: `Analyzing target contact: ${targetName}, ${targetTitle} at ${targetCompany}...`,
    });

    // ─── Parse resume data if not already loaded ──────────────────
    const resumeText = input.resume_text ? String(input.resume_text) : '';
    if (!state.resume_data && resumeText.length > 50) {
      ctx.emit({
        type: 'transparency',
        stage: 'analyze_target',
        message: 'Parsing candidate resume...',
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
        }],
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

      if (state.resume_data) {
        ctx.emit({
          type: 'transparency',
          stage: 'analyze_target',
          message: `Parsed resume for ${state.resume_data.name} — ${state.resume_data.key_skills?.length ?? 0} skills identified`,
        });
      }
    }

    // Emit transparency warning when no verified context is available
    if (!contextNotes) {
      ctx.emit({
        type: 'transparency',
        stage: 'analyze_target',
        message: 'No context provided for this contact — profile data is AI-inferred. Review carefully before sending.',
      });
    }

    const noContextInstructions = !contextNotes
      ? `- Prefix ALL items in professional_interests and recent_activity with '[AI-inferred] ' since no verified data is available.`
      : `- professional_interests should be realistic for someone in their role and industry
- If context_notes mention recent posts or achievements, incorporate them into recent_activity`;

    const analysisPrompt = `Analyze this target contact for a networking outreach campaign. Build a professional profile based on their title, company, and any additional context.

TARGET CONTACT:
- Name: ${targetName}
- Title: ${targetTitle}
- Company: ${targetCompany}
${targetLinkedinUrl ? `- LinkedIn: ${targetLinkedinUrl}` : ''}
${contextNotes ? `- Additional Context: ${contextNotes}` : ''}

Return as JSON:
{
  "target_name": "${targetName}",
  "target_title": "${targetTitle}",
  "target_company": "${targetCompany}",
  "professional_interests": ["what they likely care about professionally based on their role — 3-5 items"],
  "recent_activity": ["any notable recent activity or achievements inferred from context — or general industry trends for their role"],
  "industry": "Their primary industry",
  "seniority": "Their seniority level (e.g., C-Suite, VP, Director, Senior Manager, Manager)"
}

Rules:
${noContextInstructions}
- Be specific to their role — not generic business interests
- seniority should be inferred from the title`;

    const response = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 2048,
      system: 'You are a professional networking research analyst who builds contact profiles for executive outreach. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    let targetAnalysis;
    try {
      targetAnalysis = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      const inferredPrefix = !contextNotes ? '[AI-inferred] ' : '';
      targetAnalysis = {
        target_name: targetName,
        target_title: targetTitle,
        target_company: targetCompany,
        professional_interests: [
          `${inferredPrefix}Industry leadership`,
          `${inferredPrefix}Team development`,
          `${inferredPrefix}Strategic growth`,
        ],
        recent_activity: [],
        industry: 'General',
        seniority: 'Senior',
      };
    }

    state.target_analysis = targetAnalysis;

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_target',
      message: `Target analyzed — ${targetAnalysis.seniority} in ${targetAnalysis.industry}, ${targetAnalysis.professional_interests?.length ?? 0} professional interests identified`,
    });

    return JSON.stringify({
      success: true,
      target_name: targetAnalysis.target_name,
      target_title: targetAnalysis.target_title,
      target_company: targetAnalysis.target_company,
      industry: targetAnalysis.industry,
      seniority: targetAnalysis.seniority,
      interests_count: targetAnalysis.professional_interests?.length ?? 0,
    });
  },
};

// ─── Tool: find_common_ground ───────────────────────────────────────

const findCommonGroundTool: NetworkingOutreachTool = {
  name: 'find_common_ground',
  description:
    'Find shared connections between the user and the target contact. ' +
    'Identifies shared experiences, industry overlap, complementary expertise, ' +
    'and mutual interests. Recommends the best angle for approach. ' +
    'Call this after analyze_target.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Resume data must be loaded before finding common ground.' });
    }
    if (!state.target_analysis) {
      return JSON.stringify({ success: false, error: 'No target analysis available. Call analyze_target first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'find_common_ground',
      message: 'Identifying shared connections and common ground...',
    });

    const resumeData = state.resume_data;
    const targetAnalysis = state.target_analysis;
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
      maxItems: 15,
    }).join('\n');

    const commonGroundPrompt = `Find common ground between this user and their target contact for a networking outreach campaign.

USER PROFILE:
- Name: ${resumeData.name}
- Current Title: ${resumeData.current_title}
- Career Summary: ${resumeData.career_summary}
- Key Skills: ${resumeData.key_skills?.join(', ') || 'None listed'}
- Key Achievements: ${resumeData.key_achievements?.join(' | ') || 'None listed'}
- Work History: ${resumeData.work_history?.map((w) => `${w.title} at ${w.company} (${w.duration})`).join(', ') || 'None listed'}

${positioningSection}
${narrativeSection}
${evidenceSection}

TARGET CONTACT:
- Name: ${targetAnalysis.target_name}
- Title: ${targetAnalysis.target_title}
- Company: ${targetAnalysis.target_company}
- Industry: ${targetAnalysis.industry}
- Seniority: ${targetAnalysis.seniority}
- Professional Interests: ${targetAnalysis.professional_interests?.join(', ') || 'Unknown'}
- Recent Activity: ${targetAnalysis.recent_activity?.join(', ') || 'None known'}

Return as JSON:
{
  "shared_connections": ["shared experience, background, or connection — be specific"],
  "industry_overlap": ["industries, sectors, or markets they both operate in"],
  "complementary_expertise": ["where the user's expertise complements the target's needs or interests"],
  "mutual_interests": ["professional challenges or interests they likely share"],
  "recommended_angle": "The single best angle for the initial outreach — 1-2 sentences explaining WHY this angle will resonate"
}

Rules:
- shared_connections must be grounded in real data from both profiles — never fabricate shared history
- If no direct shared connections exist, focus on shared professional challenges or industry trends
- complementary_expertise should highlight what VALUE the user brings to the target (not just similarity)
- recommended_angle should be the most authentic, compelling hook for initiating contact
- If a Why-Me story is available, leverage what they're "known for" as a potential angle
- Be specific — "you both work in tech" is too generic; "you both drive digital transformation in manufacturing" is better`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 3072,
      system: 'You are a professional networking strategist who finds genuine connections between executives for authentic outreach. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: commonGroundPrompt }],
    });

    let commonGround;
    try {
      commonGround = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      commonGround = {
        shared_connections: [],
        industry_overlap: [targetAnalysis.industry || 'General business'],
        complementary_expertise: resumeData.key_skills?.slice(0, 3) ?? [],
        mutual_interests: ['Leadership challenges', 'Industry growth'],
        recommended_angle: `Shared interest in ${targetAnalysis.industry || 'their industry'} and complementary professional expertise.`,
      };
    }

    state.common_ground = commonGround;

    ctx.emit({
      type: 'transparency',
      stage: 'find_common_ground',
      message: `Common ground identified — ${commonGround.shared_connections?.length ?? 0} shared connections, recommended angle: "${commonGround.recommended_angle?.substring(0, 80)}..."`,
    });

    return JSON.stringify({
      success: true,
      shared_connections_count: commonGround.shared_connections?.length ?? 0,
      industry_overlap_count: commonGround.industry_overlap?.length ?? 0,
      complementary_expertise_count: commonGround.complementary_expertise?.length ?? 0,
      mutual_interests_count: commonGround.mutual_interests?.length ?? 0,
      recommended_angle: commonGround.recommended_angle,
    });
  },
};

// ─── Tool: assess_connection_path ───────────────────────────────────

const assessConnectionPathTool: NetworkingOutreachTool = {
  name: 'assess_connection_path',
  description:
    'Assess the connection path between the user and target. ' +
    'Determines connection degree (direct, 2nd-degree, or cold), approach strategy, ' +
    'value proposition, and risk level. ' +
    'Call this after find_common_ground.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.target_analysis) {
      return JSON.stringify({ success: false, error: 'No target analysis available. Call analyze_target first.' });
    }
    if (!state.common_ground) {
      return JSON.stringify({ success: false, error: 'No common ground available. Call find_common_ground first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assess_connection_path',
      message: 'Assessing connection path and approach strategy...',
    });

    const targetAnalysis = state.target_analysis;
    const commonGround = state.common_ground;
    const targetInput = state.target_input;

    const connectionPrompt = `Assess the connection path and approach strategy for reaching this target contact.

TARGET:
- Name: ${targetAnalysis.target_name}
- Title: ${targetAnalysis.target_title}
- Company: ${targetAnalysis.target_company}
- Industry: ${targetAnalysis.industry}
- Seniority: ${targetAnalysis.seniority}
${targetInput?.context_notes ? `- Context Notes: ${targetInput.context_notes}` : ''}

COMMON GROUND IDENTIFIED:
- Shared Connections: ${commonGround.shared_connections?.join(', ') || 'None'}
- Industry Overlap: ${commonGround.industry_overlap?.join(', ') || 'None'}
- Complementary Expertise: ${commonGround.complementary_expertise?.join(', ') || 'None'}
- Mutual Interests: ${commonGround.mutual_interests?.join(', ') || 'None'}
- Recommended Angle: ${commonGround.recommended_angle || 'Not determined'}

Return as JSON:
{
  "connection_degree": "direct" | "2nd_degree" | "cold",
  "approach_strategy": "Detailed approach strategy — how to initiate contact, what to lead with, and how to build rapport — 2-3 sentences",
  "connection_rationale": "Why this person is worth connecting with — what the relationship could lead to — 1-2 sentences",
  "value_proposition": "What specific value the user can offer this contact — not what they want FROM them — 1-2 sentences",
  "risk_level": "low" | "medium" | "high"
}

Rules:
- connection_degree: "direct" if shared connections or prior interaction exist, "2nd_degree" if they share industry/community but no direct link, "cold" if no shared context
- approach_strategy must be specific to THIS target — not generic networking advice
- connection_rationale should focus on mutual benefit, not just what the user wants
- value_proposition must articulate what the USER brings to the TARGET — executives respond to value, not asks
- risk_level: "low" if strong common ground exists, "medium" if some overlap but no direct connection, "high" if cold with significant seniority gap or no shared context`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: 'You are a professional networking strategist who assesses connection paths and designs approach strategies for executive outreach. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: connectionPrompt }],
    });

    let connectionPath;
    try {
      connectionPath = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      const hasSharedConnections = (commonGround.shared_connections?.length ?? 0) > 0;
      const hasIndustryOverlap = (commonGround.industry_overlap?.length ?? 0) > 0;
      connectionPath = {
        connection_degree: hasSharedConnections ? 'direct' : hasIndustryOverlap ? '2nd_degree' : 'cold',
        approach_strategy: `Lead with ${commonGround.recommended_angle || 'shared professional interests'} and offer genuine value.`,
        connection_rationale: 'Potential for mutually beneficial professional relationship.',
        value_proposition: 'Complementary expertise and industry perspective.',
        risk_level: hasSharedConnections ? 'low' : hasIndustryOverlap ? 'medium' : 'high',
      };
    }

    state.connection_path = connectionPath;

    ctx.emit({
      type: 'transparency',
      stage: 'assess_connection_path',
      message: `Connection path assessed — ${connectionPath.connection_degree} connection, ${connectionPath.risk_level} risk, strategy: "${connectionPath.approach_strategy?.substring(0, 80)}..."`,
    });

    return JSON.stringify({
      success: true,
      connection_degree: connectionPath.connection_degree,
      approach_strategy: connectionPath.approach_strategy,
      value_proposition: connectionPath.value_proposition,
      risk_level: connectionPath.risk_level,
    });
  },
};

// ─── Tool: plan_outreach_sequence ───────────────────────────────────

const planOutreachSequenceTool: NetworkingOutreachTool = {
  name: 'plan_outreach_sequence',
  description:
    'Plan the outreach message sequence — number of messages, types to include, ' +
    'overall tone, key themes, and goal. ' +
    'Call this after assess_connection_path.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.target_analysis) {
      return JSON.stringify({ success: false, error: 'No target analysis available. Call analyze_target first.' });
    }
    if (!state.common_ground) {
      return JSON.stringify({ success: false, error: 'No common ground available. Call find_common_ground first.' });
    }
    if (!state.connection_path) {
      return JSON.stringify({ success: false, error: 'No connection path available. Call assess_connection_path first.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'plan_outreach_sequence',
      message: 'Planning outreach message sequence...',
    });

    const targetAnalysis = state.target_analysis;
    const commonGround = state.common_ground;
    const connectionPath = state.connection_path;

    const planPrompt = `Plan an outreach message sequence for connecting with this target contact.

TARGET:
- Name: ${targetAnalysis.target_name}
- Title: ${targetAnalysis.target_title}
- Company: ${targetAnalysis.target_company}
- Industry: ${targetAnalysis.industry}
- Seniority: ${targetAnalysis.seniority}

COMMON GROUND:
- Recommended Angle: ${commonGround.recommended_angle || 'Not determined'}
- Shared Connections: ${commonGround.shared_connections?.join(', ') || 'None'}
- Mutual Interests: ${commonGround.mutual_interests?.join(', ') || 'None'}

CONNECTION PATH:
- Degree: ${connectionPath.connection_degree}
- Approach Strategy: ${connectionPath.approach_strategy}
- Value Proposition: ${connectionPath.value_proposition}
- Risk Level: ${connectionPath.risk_level}

Return as JSON:
{
  "sequence_length": 3-5,
  "message_types": ["connection_request", "follow_up_1", "follow_up_2", "value_offer", "meeting_request"],
  "tone": "professional" | "warm" | "direct" | "casual-professional",
  "themes": ["key theme to weave through the sequence — 2-4 themes"],
  "goal": "What success looks like — meeting, referral, information exchange, etc."
}

Rules:
- sequence_length should be 3-5 messages; shorter for direct connections, longer for cold outreach
- message_types must use these exact values: connection_request, follow_up_1, follow_up_2, value_offer, meeting_request
- Always start with connection_request
- For low-risk/direct connections: 3 messages (connection_request, follow_up_1, meeting_request)
- For medium-risk/2nd-degree: 4 messages (connection_request, follow_up_1, value_offer, meeting_request)
- For high-risk/cold: 5 messages (full sequence)
- tone should match the target's seniority and industry — formal for C-suite, warmer for peers
- themes should be specific hooks that build across the sequence, not generic
- goal should be realistic for the connection degree — cold outreach should aim for a conversation, not an immediate ask`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: 'You are a professional networking strategist who designs outreach sequences for executive relationship-building. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: planPrompt }],
    });

    let outreachPlan;
    try {
      outreachPlan = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      // Graceful fallback based on connection degree
      const degree = connectionPath.connection_degree;
      if (degree === 'direct') {
        outreachPlan = {
          sequence_length: 3,
          message_types: ['connection_request', 'follow_up_1', 'meeting_request'],
          tone: 'warm',
          themes: [commonGround.recommended_angle || 'Shared professional interests'],
          goal: 'Schedule a brief conversation to explore mutual interests.',
        };
      } else if (degree === '2nd_degree') {
        outreachPlan = {
          sequence_length: 4,
          message_types: ['connection_request', 'follow_up_1', 'value_offer', 'meeting_request'],
          tone: 'professional',
          themes: [commonGround.recommended_angle || 'Industry alignment', 'Complementary expertise'],
          goal: 'Build rapport and schedule an introductory conversation.',
        };
      } else {
        outreachPlan = {
          sequence_length: 5,
          message_types: ['connection_request', 'follow_up_1', 'follow_up_2', 'value_offer', 'meeting_request'],
          tone: 'professional',
          themes: [commonGround.recommended_angle || 'Industry insight', 'Value exchange', 'Relationship building'],
          goal: 'Establish credibility and earn a brief introductory conversation.',
        };
      }
    }

    state.outreach_plan = outreachPlan;

    ctx.emit({
      type: 'transparency',
      stage: 'plan_outreach_sequence',
      message: `Outreach sequence planned — ${outreachPlan.sequence_length} messages, ${outreachPlan.tone} tone, goal: "${outreachPlan.goal?.substring(0, 80)}"`,
    });

    return JSON.stringify({
      success: true,
      sequence_length: outreachPlan.sequence_length,
      message_types: outreachPlan.message_types,
      tone: outreachPlan.tone,
      themes: outreachPlan.themes,
      goal: outreachPlan.goal,
    });
  },
};

// ─── Tool: read_contact_history ──────────────────────────────────────

const readContactHistoryTool: NetworkingOutreachTool = {
  name: 'read_contact_history',
  description:
    'Read the contact\'s CRM record including relationship history, past interactions, and touchpoints to personalize outreach. ' +
    'Call this before writing outreach messages when a contact_id is available.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      contact_name: {
        type: 'string',
        description: 'Full name of the contact to look up in the CRM',
      },
      contact_company: {
        type: 'string',
        description: 'Company of the contact (optional, used to narrow the match)',
      },
    },
    required: ['contact_name'],
  },
  async execute(input, ctx) {
    const contactName = String(input.contact_name ?? '').trim();
    const contactCompany = input.contact_company ? String(input.contact_company).trim() : undefined;
    const state = ctx.getState();
    const userId = state.user_id;

    ctx.emit({
      type: 'transparency',
      stage: 'read_contact_history',
      message: `Looking up CRM record for ${contactName}${contactCompany ? ` at ${contactCompany}` : ''}...`,
    });

    try {
      let query = supabaseAdmin
        .from('networking_contacts')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${contactName}%`);

      if (contactCompany) {
        query = query.ilike('company', `%${contactCompany}%`);
      }

      const { data: contacts, error: contactError } = await query.limit(1);

      if (contactError) {
        logger.warn(
          { error: contactError.message, userId, contactName },
          'read_contact_history: contacts query failed',
        );
        return JSON.stringify({ found: false, reason: 'Database query failed' });
      }

      if (!contacts || contacts.length === 0) {
        ctx.emit({
          type: 'transparency',
          stage: 'read_contact_history',
          message: `No CRM record found for ${contactName} — proceeding with fresh outreach`,
        });
        return JSON.stringify({ found: false });
      }

      const contact = contacts[0] as Record<string, unknown>;
      const contactId = contact.id as string;

      const { data: touchpoints, error: touchpointError } = await supabaseAdmin
        .from('contact_touchpoints')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (touchpointError) {
        logger.warn(
          { error: touchpointError.message, contactId, userId },
          'read_contact_history: touchpoints query failed (non-fatal)',
        );
      }

      const recentTouchpoints = (touchpoints ?? []).map((t: Record<string, unknown>) => ({
        type: t.type,
        notes: t.notes,
        created_at: t.created_at,
      }));

      ctx.emit({
        type: 'transparency',
        stage: 'read_contact_history',
        message: `Found CRM record for ${contactName} — ${contact.relationship_type} (strength: ${contact.relationship_strength}/5), ${recentTouchpoints.length} past interactions`,
      });

      return JSON.stringify({
        found: true,
        contact_id: contactId,
        relationship_type: contact.relationship_type,
        relationship_strength: contact.relationship_strength,
        tags: contact.tags,
        notes: contact.notes,
        last_contact_date: contact.last_contact_date,
        next_followup_at: contact.next_followup_at,
        recent_touchpoints: recentTouchpoints,
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId, contactName },
        'read_contact_history: unexpected error',
      );
      return JSON.stringify({ found: false, reason: 'Unexpected error during lookup' });
    }
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const researcherTools: NetworkingOutreachTool[] = [
  analyzeTargetTool,
  findCommonGroundTool,
  assessConnectionPathTool,
  planOutreachSequenceTool,
  readContactHistoryTool,
];
