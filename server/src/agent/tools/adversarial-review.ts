import { anthropic, MODEL } from '../../lib/anthropic.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { QUALITY_CHECKLIST } from '../resume-guide.js';

export async function executeAdversarialReview(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  overall_assessment: string;
  risk_flags: Array<{ flag: string; severity: string; recommendation: string }>;
  pass: boolean;
  age_bias_risks: string[];
  checklist_scores: Record<string, number>;
  checklist_total: number;
}> {
  const resumeContent = input.resume_content as string;
  const jobDescription = input.job_description as string;
  const requirements = input.requirements as string[];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are a skeptical hiring manager at a Fortune 500 company. You have 30 seconds to decide if this resume gets a phone screen. Find REAL weaknesses — be brutally honest.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeContent}

REQUIREMENTS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

QUALITY CHECKLIST — Score each item 1-5 (1=failing, 5=exceptional):
${QUALITY_CHECKLIST.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Also check for AGE BIAS RISKS:
- Graduation years from 20+ years ago visible
- "30 years of experience" or similar age-revealing language
- Obsolete technologies or methodologies referenced
- Objective statement instead of professional summary
- "References available upon request"
- Street address in header
- Outdated business terminology

Return ONLY valid JSON:
{
  "overall_assessment": "2-3 sentence brutally honest first impression from a 30-second scan",
  "risk_flags": [
    { "flag": "What concerns you", "severity": "low | medium | high", "recommendation": "What to do about it" }
  ],
  "pass": true | false,
  "missing_requirements": ["Requirements not adequately addressed"],
  "strongest_points": ["What would make you want to interview this person"],
  "age_bias_risks": ["Any age-bias signals detected in the resume"],
  "checklist_scores": { "1": 4, "2": 3, ... },
  "checklist_total": 38
}`,
      },
    ],
  });

  const firstBlock = response.content[0];
  const text = firstBlock?.type === 'text' ? firstBlock.text : '';

  let result = {
    overall_assessment: 'Unable to complete review',
    risk_flags: [] as Array<{ flag: string; severity: string; recommendation: string }>,
    pass: false,
    age_bias_risks: [] as string[],
    checklist_scores: {} as Record<string, number>,
    checklist_total: 0,
  };

  const parsed = repairJSON<Record<string, unknown>>(text);
  if (parsed) {
    result = {
      overall_assessment: (parsed.overall_assessment as string) ?? result.overall_assessment,
      risk_flags: (parsed.risk_flags as typeof result.risk_flags) ?? [],
      pass: (parsed.pass as boolean) ?? false,
      age_bias_risks: (parsed.age_bias_risks as string[]) ?? [],
      checklist_scores: (parsed.checklist_scores as Record<string, number>) ?? {},
      checklist_total: (parsed.checklist_total as number) ?? 0,
    };
  }

  ctx.adversarialReview = {
    overall_assessment: result.overall_assessment,
    risk_flags: result.risk_flags.map((f) => ({
      flag: f.flag,
      severity: f.severity as 'low' | 'medium' | 'high',
      recommendation: f.recommendation,
    })),
    pass: result.pass,
    age_bias_risks: result.age_bias_risks,
    checklist_scores: result.checklist_scores,
    checklist_total: result.checklist_total,
  };

  // Progressive quality dashboard emit
  ctx.qualityDashboardData = {
    ...ctx.qualityDashboardData,
    hiring_manager: {
      pass: result.pass,
      checklist_total: result.checklist_total,
      checklist_max: 50,
      checklist_scores: result.checklist_scores,
    },
    risk_flags: result.risk_flags,
    age_bias_risks: result.age_bias_risks,
    overall_assessment: result.overall_assessment,
  };
  emit({
    type: 'right_panel_update',
    panel_type: 'quality_dashboard',
    data: ctx.qualityDashboardData,
  });

  return result;
}
