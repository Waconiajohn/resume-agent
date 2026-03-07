/**
 * Salary Negotiation Market Researcher — Tool definitions.
 *
 * 4 tools:
 * - research_compensation: Research market compensation benchmarks for the target role
 * - analyze_market_position: Compare candidate comp against market benchmarks
 * - identify_leverage_points: Identify negotiation leverage from experience and market
 * - assess_total_comp: Synthesize research into total compensation assessment
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  SalaryNegotiationState,
  SalaryNegotiationSSEEvent,
  MarketResearch,
  LeveragePoint,
  TotalCompBreakdown,
  CompComponent,
} from '../types.js';
import { SALARY_NEGOTIATION_RULES } from '../knowledge/rules.js';
import { llm, MODEL_MID, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type SalaryNegotiationTool = AgentTool<SalaryNegotiationState, SalaryNegotiationSSEEvent>;

// ─── Tool: research_compensation ────────────────────────────────────

const researchCompensationTool: SalaryNegotiationTool = {
  name: 'research_compensation',
  description:
    'Research compensation benchmarks for the target role, considering industry, geography, ' +
    'and company size. Parse the resume to understand candidate seniority.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text of the candidate.',
      },
      target_role: {
        type: 'string',
        description: 'The target role or title to research compensation for.',
      },
      target_industry: {
        type: 'string',
        description: 'The industry vertical for compensation benchmarking.',
      },
      geography: {
        type: 'string',
        description: 'Geographic market — city, region, or "remote".',
      },
      company_size: {
        type: 'string',
        description: 'Company size category (e.g. "startup", "mid-market", "enterprise").',
      },
    },
    required: ['resume_text', 'target_role', 'target_industry', 'geography', 'company_size'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    const resumeText = String(input.resume_text ?? '');
    const targetRole = String(input.target_role ?? '');
    const targetIndustry = String(input.target_industry ?? '');
    const geography = String(input.geography ?? '');
    const companySize = String(input.company_size ?? '');

    // ─── Parse resume if needed ──────────────────────────────────
    if (!state.resume_data && resumeText.length > 50) {
      ctx.emit({
        type: 'transparency',
        stage: 'research_compensation',
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

      if (state.resume_data) {
        ctx.emit({
          type: 'transparency',
          stage: 'research_compensation',
          message: `Parsed resume for ${state.resume_data.name} — ${state.resume_data.key_skills?.length ?? 0} skills identified`,
        });
      }
    }

    scratchpad.resume_data = state.resume_data;

    // ─── Research market compensation ────────────────────────────
    ctx.emit({
      type: 'transparency',
      stage: 'research_compensation',
      message: `Researching compensation benchmarks for ${targetRole} in ${targetIndustry} (${geography})...`,
    });

    const researchPrompt = `Research market compensation data for this role and return structured benchmark data.

${SALARY_NEGOTIATION_RULES}

TARGET ROLE: ${targetRole}
INDUSTRY: ${targetIndustry}
GEOGRAPHY: ${geography}
COMPANY SIZE: ${companySize}

CANDIDATE CONTEXT:
- Name: ${state.resume_data?.name ?? 'Unknown'}
- Current Title: ${state.resume_data?.current_title ?? 'Unknown'}
- Career Summary: ${state.resume_data?.career_summary ?? 'Not available'}
- Key Skills: ${state.resume_data?.key_skills?.join(', ') || 'None listed'}
- Years of Experience (estimated from work history): ${state.resume_data?.work_history?.length ?? 0} roles

Return JSON:
{
  "role": "${targetRole}",
  "industry": "${targetIndustry}",
  "geography": "${geography}",
  "company_size": "${companySize}",
  "salary_range": {
    "p25": number,
    "p50": number,
    "p75": number,
    "p90": number
  },
  "total_comp_estimate": {
    "low": number,
    "mid": number,
    "high": number
  },
  "market_context": "2-4 sentences about current market conditions, demand trends, and factors affecting comp for this role/industry/geo",
  "data_confidence": "low" | "medium" | "high"
}

Rules:
- All salary/comp numbers should be annual USD amounts
- Base salary_range covers base salary only (not total comp)
- total_comp_estimate includes base + bonus + equity + benefits
- data_confidence: "high" if this is a well-defined role in a major market, "medium" for niche roles or smaller markets, "low" for highly specialized or emerging roles
- Be realistic — use current market data calibrated for ${new Date().getFullYear()}
- For executive-level roles, account for the full compensation structure including equity and long-term incentives`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are a compensation research analyst who provides accurate market benchmarks for executive-level roles. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: researchPrompt }],
    });

    let marketResearch: MarketResearch;
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      marketResearch = {
        role: String(parsed.role ?? targetRole),
        industry: String(parsed.industry ?? targetIndustry),
        geography: String(parsed.geography ?? geography),
        company_size: String(parsed.company_size ?? companySize),
        salary_range: {
          p25: Number(parsed.salary_range?.p25) || 0,
          p50: Number(parsed.salary_range?.p50) || 0,
          p75: Number(parsed.salary_range?.p75) || 0,
          p90: Number(parsed.salary_range?.p90) || 0,
        },
        total_comp_estimate: {
          low: Number(parsed.total_comp_estimate?.low) || 0,
          mid: Number(parsed.total_comp_estimate?.mid) || 0,
          high: Number(parsed.total_comp_estimate?.high) || 0,
        },
        market_context: String(parsed.market_context ?? ''),
        data_confidence: parseDataConfidence(parsed.data_confidence),
      };
    } catch {
      marketResearch = {
        role: targetRole,
        industry: targetIndustry,
        geography,
        company_size: companySize,
        salary_range: { p25: 0, p50: 0, p75: 0, p90: 0 },
        total_comp_estimate: { low: 0, mid: 0, high: 0 },
        market_context: 'Unable to parse market research data.',
        data_confidence: 'low',
      };
    }

    state.market_research = marketResearch;
    scratchpad.market_research = marketResearch;

    ctx.emit({
      type: 'transparency',
      stage: 'research_compensation',
      message: `Market research complete — P50 base: $${marketResearch.salary_range.p50.toLocaleString()}, confidence: ${marketResearch.data_confidence}`,
    });

    return JSON.stringify({
      success: true,
      role: marketResearch.role,
      p50_base: marketResearch.salary_range.p50,
      total_comp_mid: marketResearch.total_comp_estimate.mid,
      data_confidence: marketResearch.data_confidence,
    });
  },
};

// ─── Tool: analyze_market_position ──────────────────────────────────

const analyzeMarketPositionTool: SalaryNegotiationTool = {
  name: 'analyze_market_position',
  description:
    'Analyze how the candidate\'s current and offered compensation compare to market ' +
    'benchmarks across all comp components.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      current_compensation: {
        type: 'object',
        description: 'The candidate\'s current compensation package.',
        properties: {
          base_salary: { type: 'number', description: 'Current base salary.' },
          total_comp: { type: 'number', description: 'Current total compensation.' },
          equity: { type: 'number', description: 'Current equity value (annual).' },
        },
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    if (!state.market_research) {
      return JSON.stringify({
        success: false,
        error: 'No market research available. Call research_compensation first.',
      });
    }

    // Merge any provided current compensation into state
    const currentComp = input.current_compensation as Record<string, unknown> | undefined;
    if (currentComp) {
      state.current_compensation = {
        base_salary: currentComp.base_salary != null ? Number(currentComp.base_salary) : state.current_compensation?.base_salary,
        total_comp: currentComp.total_comp != null ? Number(currentComp.total_comp) : state.current_compensation?.total_comp,
        equity: currentComp.equity != null ? String(currentComp.equity) : state.current_compensation?.equity,
      };
    }

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_market_position',
      message: 'Analyzing compensation position against market benchmarks...',
    });

    const mr = state.market_research;
    const cc = state.current_compensation;
    const od = state.offer_details;

    const analysisPrompt = `Analyze the candidate's compensation position against market benchmarks and produce a component-by-component breakdown.

${SALARY_NEGOTIATION_RULES}

MARKET RESEARCH:
- Role: ${mr.role}
- Industry: ${mr.industry}
- Geography: ${mr.geography}
- Base salary range: P25=$${mr.salary_range.p25.toLocaleString()}, P50=$${mr.salary_range.p50.toLocaleString()}, P75=$${mr.salary_range.p75.toLocaleString()}, P90=$${mr.salary_range.p90.toLocaleString()}
- Total comp estimate: Low=$${mr.total_comp_estimate.low.toLocaleString()}, Mid=$${mr.total_comp_estimate.mid.toLocaleString()}, High=$${mr.total_comp_estimate.high.toLocaleString()}
- Market context: ${mr.market_context}

CURRENT COMPENSATION:
- Base salary: ${cc?.base_salary ? `$${cc.base_salary.toLocaleString()}` : 'Not provided'}
- Total comp: ${cc?.total_comp ? `$${cc.total_comp.toLocaleString()}` : 'Not provided'}
- Equity: ${cc?.equity ?? 'Not provided'}

OFFER DETAILS:
- Company: ${od.company}
- Role: ${od.role}
- Base salary: ${od.base_salary ? `$${od.base_salary.toLocaleString()}` : 'Not provided'}
- Total comp: ${od.total_comp ? `$${od.total_comp.toLocaleString()}` : 'Not provided'}
- Equity: ${od.equity_details ?? 'Not provided'}
- Other: ${od.other_details ?? 'None'}

Return JSON array — one object per compensation component:
[
  {
    "component": "base_salary" | "bonus" | "equity" | "benefits" | "signing_bonus" | "relocation",
    "current_value": number | null,
    "market_value": number,
    "negotiable": true | false,
    "notes": "Context about this component and negotiation opportunity"
  }
]

Rules:
- Include ALL 6 components even if current_value is null
- market_value should reflect the midpoint for this role/industry/geography
- negotiable: base_salary, equity, signing_bonus are typically negotiable; benefits less so
- notes: include specific observations about gaps, opportunities, and positioning
- Be honest about where the candidate is above or below market`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are a total compensation analyst who evaluates exec-level packages against market data. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    let breakdown: TotalCompBreakdown[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      breakdown = items.map((item: Record<string, unknown>) => ({
        component: parseCompComponent(item.component),
        current_value: item.current_value != null ? Number(item.current_value) : null,
        market_value: Number(item.market_value) || 0,
        negotiable: Boolean(item.negotiable),
        notes: String(item.notes ?? ''),
      }));
    } catch {
      // Fallback: minimal breakdown from available data
      breakdown = [
        {
          component: 'base_salary',
          current_value: cc?.base_salary ?? null,
          market_value: mr.salary_range.p50,
          negotiable: true,
          notes: 'Unable to parse detailed breakdown.',
        },
      ];
    }

    state.total_comp_breakdown = breakdown;
    scratchpad.total_comp_breakdown = breakdown;

    const negotiableCount = breakdown.filter((b) => b.negotiable).length;

    ctx.emit({
      type: 'transparency',
      stage: 'analyze_market_position',
      message: `Comp breakdown complete — ${breakdown.length} components analyzed, ${negotiableCount} negotiable`,
    });

    return JSON.stringify({
      success: true,
      components_analyzed: breakdown.length,
      negotiable_components: negotiableCount,
      base_vs_market: state.offer_details.base_salary
        ? `Offer $${state.offer_details.base_salary.toLocaleString()} vs market P50 $${mr.salary_range.p50.toLocaleString()}`
        : 'Base salary not provided in offer',
    });
  },
};

// ─── Tool: identify_leverage_points ─────────────────────────────────

const identifyLeveragePointsTool: SalaryNegotiationTool = {
  name: 'identify_leverage_points',
  description:
    'Identify the candidate\'s strongest negotiation leverage points based on their ' +
    'experience, market position, competing factors, and unique value proposition.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      offer_details: {
        type: 'object',
        description: 'Details of the offer being negotiated.',
        properties: {
          company: { type: 'string', description: 'Company extending the offer.' },
          role: { type: 'string', description: 'Role/title for the offer.' },
          base_salary: { type: 'number', description: 'Base salary offered.' },
          total_comp: { type: 'number', description: 'Total compensation offered.' },
          equity_details: { type: 'string', description: 'Equity details (options, RSUs, vesting).' },
        },
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    if (!state.market_research) {
      return JSON.stringify({
        success: false,
        error: 'No market research available. Call research_compensation first.',
      });
    }

    // Merge any provided offer details into state
    const offerInput = input.offer_details as Record<string, unknown> | undefined;
    if (offerInput) {
      if (offerInput.company) state.offer_details.company = String(offerInput.company);
      if (offerInput.role) state.offer_details.role = String(offerInput.role);
      if (offerInput.base_salary != null) state.offer_details.base_salary = Number(offerInput.base_salary);
      if (offerInput.total_comp != null) state.offer_details.total_comp = Number(offerInput.total_comp);
      if (offerInput.equity_details) state.offer_details.equity_details = String(offerInput.equity_details);
    }

    ctx.emit({
      type: 'transparency',
      stage: 'identify_leverage_points',
      message: 'Identifying negotiation leverage points...',
    });

    const mr = state.market_research;
    const rd = state.resume_data;
    const od = state.offer_details;
    const breakdown = state.total_comp_breakdown;

    const leveragePrompt = `Identify the candidate's strongest negotiation leverage points for this offer.

${SALARY_NEGOTIATION_RULES}

CANDIDATE PROFILE:
- Name: ${rd?.name ?? 'Unknown'}
- Current Title: ${rd?.current_title ?? 'Unknown'}
- Key Skills: ${rd?.key_skills?.join(', ') || 'None listed'}
- Key Achievements: ${rd?.key_achievements?.slice(0, 5).join(' | ') || 'None listed'}
- Work History: ${rd?.work_history?.map((w) => `${w.title} at ${w.company} (${w.duration})`).join('; ') || 'Not available'}

MARKET POSITION:
- Role: ${mr.role} in ${mr.industry}
- Market P50 base: $${mr.salary_range.p50.toLocaleString()}, P75: $${mr.salary_range.p75.toLocaleString()}
- Market context: ${mr.market_context}
- Data confidence: ${mr.data_confidence}

OFFER:
- Company: ${od.company}
- Role: ${od.role}
- Base salary: ${od.base_salary ? `$${od.base_salary.toLocaleString()}` : 'Not provided'}
- Total comp: ${od.total_comp ? `$${od.total_comp.toLocaleString()}` : 'Not provided'}
- Equity: ${od.equity_details ?? 'Not provided'}

COMP BREAKDOWN:
${breakdown?.map((b) => `- ${b.component}: current=${b.current_value ?? 'N/A'}, market=${b.market_value}, negotiable=${b.negotiable}`).join('\n') || 'Not yet analyzed'}

${state.platform_context?.positioning_strategy ? `POSITIONING STRATEGY:\n${JSON.stringify(state.platform_context.positioning_strategy)}` : ''}
${state.platform_context?.why_me_story ? `WHY-ME NARRATIVE:\n${state.platform_context.why_me_story}` : ''}

Return JSON array of leverage points (aim for 4-8):
[
  {
    "category": "competing offers" | "unique skills" | "market demand" | "tenure/experience" | "industry expertise" | "cost of vacancy" | "performance track record" | "relocation/logistics",
    "description": "What this leverage point is and why it matters",
    "strength": "weak" | "moderate" | "strong",
    "talking_point": "Ready-to-use language the candidate can use in the negotiation conversation"
  }
]

Rules:
- Focus on genuine leverage — never fabricate or inflate
- "strong" leverage: competing offers, rare skills in high-demand market, proven track record with metrics
- "moderate" leverage: relevant experience, industry knowledge, geographic flexibility
- "weak" leverage: general qualifications, cultural fit (real but not differentiating)
- talking_points should be conversational and confident, never aggressive or entitled
- Consider the gap between offer and market — if below P50, that IS leverage
- If the candidate has a positioning strategy from the platform, use it to identify additional leverage`;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system:
        'You are an executive career negotiation coach who identifies genuine leverage points. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: leveragePrompt }],
    });

    let leveragePoints: LeveragePoint[];
    try {
      const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      leveragePoints = items.map((item: Record<string, unknown>) => ({
        category: String(item.category ?? 'general'),
        description: String(item.description ?? ''),
        strength: parseLeverageStrength(item.strength),
        talking_point: String(item.talking_point ?? ''),
      }));
    } catch {
      leveragePoints = [
        {
          category: 'market demand',
          description: 'Unable to parse leverage points from analysis.',
          strength: 'moderate',
          talking_point: 'Based on my research, the market rate for this role supports a higher compensation package.',
        },
      ];
    }

    state.leverage_points = leveragePoints;
    scratchpad.leverage_points = leveragePoints;

    const strongCount = leveragePoints.filter((lp) => lp.strength === 'strong').length;
    const moderateCount = leveragePoints.filter((lp) => lp.strength === 'moderate').length;

    ctx.emit({
      type: 'transparency',
      stage: 'identify_leverage_points',
      message: `Identified ${leveragePoints.length} leverage points — ${strongCount} strong, ${moderateCount} moderate`,
    });

    return JSON.stringify({
      success: true,
      total_leverage_points: leveragePoints.length,
      strong: strongCount,
      moderate: moderateCount,
      weak: leveragePoints.length - strongCount - moderateCount,
      top_category: leveragePoints.find((lp) => lp.strength === 'strong')?.category ?? leveragePoints[0]?.category ?? 'none',
    });
  },
};

// ─── Tool: assess_total_comp ────────────────────────────────────────

const assessTotalCompTool: SalaryNegotiationTool = {
  name: 'assess_total_comp',
  description:
    'Synthesize all research into a total compensation assessment and emit the research_complete event.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    if (!state.market_research) {
      return JSON.stringify({
        success: false,
        error: 'No market research available. Call research_compensation first.',
      });
    }
    if (!state.total_comp_breakdown || state.total_comp_breakdown.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No compensation breakdown available. Call analyze_market_position first.',
      });
    }
    if (!state.leverage_points || state.leverage_points.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'No leverage points identified. Call identify_leverage_points first.',
      });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assess_total_comp',
      message: 'Synthesizing research into total compensation assessment...',
    });

    const mr = state.market_research;
    const breakdown = state.total_comp_breakdown;
    const leveragePoints = state.leverage_points;

    const assessmentPrompt = `Synthesize the following compensation research into a brief executive summary (3-5 sentences).

${SALARY_NEGOTIATION_RULES}

MARKET RESEARCH:
- Role: ${mr.role} in ${mr.industry} (${mr.geography})
- Base salary P50: $${mr.salary_range.p50.toLocaleString()}, P75: $${mr.salary_range.p75.toLocaleString()}
- Total comp mid: $${mr.total_comp_estimate.mid.toLocaleString()}, high: $${mr.total_comp_estimate.high.toLocaleString()}
- Data confidence: ${mr.data_confidence}
- Market context: ${mr.market_context}

OFFER VS MARKET:
${breakdown.map((b) => `- ${b.component}: offer/current=${b.current_value ?? 'N/A'}, market=${b.market_value}, negotiable=${b.negotiable} — ${b.notes}`).join('\n')}

LEVERAGE POINTS (${leveragePoints.length} total, ${leveragePoints.filter((lp) => lp.strength === 'strong').length} strong):
${leveragePoints.map((lp) => `- [${lp.strength}] ${lp.category}: ${lp.description}`).join('\n')}

Write a concise assessment that covers:
1. How the offer compares to market (above, at, or below which percentile)
2. Which components have the most negotiation room
3. Overall negotiation position strength
4. One key recommendation

Be direct and data-driven. This is for an executive — no fluff.`;

    const response = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 1024,
      system:
        'You are an executive compensation strategist providing a research synthesis. Be direct and data-driven.',
      messages: [{ role: 'user', content: assessmentPrompt }],
    });

    scratchpad.assessment_summary = response.text.trim();

    // Emit the research_complete SSE event
    ctx.emit({
      type: 'research_complete',
      market_p50: mr.salary_range.p50,
      market_p75: mr.salary_range.p75,
      data_confidence: mr.data_confidence,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'assess_total_comp',
      message: `Research synthesis complete — market P50 $${mr.salary_range.p50.toLocaleString()}, ${leveragePoints.length} leverage points, confidence: ${mr.data_confidence}`,
    });

    return JSON.stringify({
      success: true,
      market_p50: mr.salary_range.p50,
      market_p75: mr.salary_range.p75,
      total_comp_mid: mr.total_comp_estimate.mid,
      data_confidence: mr.data_confidence,
      leverage_points_count: leveragePoints.length,
      strong_leverage: leveragePoints.filter((lp) => lp.strength === 'strong').length,
      assessment_preview: response.text.trim().slice(0, 150),
    });
  },
};

// ─── Helpers ───────────────────────────────────────────────────────

function parseDataConfidence(val: unknown): 'low' | 'medium' | 'high' {
  const s = String(val ?? '').toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
}

function parseLeverageStrength(val: unknown): 'weak' | 'moderate' | 'strong' {
  const s = String(val ?? '').toLowerCase();
  if (s === 'strong') return 'strong';
  if (s === 'moderate') return 'moderate';
  return 'weak';
}

function parseCompComponent(val: unknown): CompComponent {
  const s = String(val ?? '').toLowerCase();
  const valid: CompComponent[] = [
    'base_salary',
    'bonus',
    'equity',
    'benefits',
    'signing_bonus',
    'relocation',
  ];
  return valid.includes(s as CompComponent) ? (s as CompComponent) : 'base_salary';
}

// ─── Exports ───────────────────────────────────────────────────────

export const researcherTools: AgentTool<SalaryNegotiationState, SalaryNegotiationSSEEvent>[] = [
  researchCompensationTool,
  analyzeMarketPositionTool,
  identifyLeveragePointsTool,
  assessTotalCompTool,
];
