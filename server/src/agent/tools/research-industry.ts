import { queryPerplexity } from '../../lib/perplexity.js';
import type { SessionContext } from '../context.js';

export async function executeResearchIndustry(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ industry_research: string }> {
  const industry = input.industry as string;
  const roleType = input.role_type as string;
  const seniorityLevel = (input.seniority_level as string) || 'senior';

  const researchText = await queryPerplexity([
    {
      role: 'system',
      content: 'You are an industry research analyst specializing in career benchmarking. Provide specific, data-driven insights about what top candidates look like in a given industry and role.',
    },
    {
      role: 'user',
      content: `Research industry standards for a ${seniorityLevel} ${roleType} in ${industry}. I need:

1. **Typical Qualifications**: What education, certifications, and experience are standard?
2. **Salary Benchmarks**: What's the typical compensation range?
3. **Key Skills in Demand**: What skills are most valued right now?
4. **Career Progression**: What does a typical career path look like?
5. **Industry Trends**: What trends are shaping this role?
6. **Competitive Differentiators**: What makes a candidate stand out?
7. **Common Interview Topics**: What do companies typically assess?

Be specific with numbers and data where possible.`,
    },
  ]);

  return { industry_research: researchText };
}
