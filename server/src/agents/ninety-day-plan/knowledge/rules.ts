/**
 * 90-Day Plan Agent — Knowledge Rules
 *
 * 8 rules (0-7) that govern strategic onboarding plan creation,
 * stakeholder mapping, quick win identification, and phased plan
 * construction. These rules are injected into the 90-Day Plan
 * agent's system prompt.
 *
 * Rule design principles:
 * - Strategic onboarding, not task lists
 * - Listen before leading — earn trust, then drive change
 * - Every milestone must be observable and ideally quantifiable
 * - Plans must reflect the seniority level of the role
 */

// --- Rule 0: 90-Day Plan Philosophy ----------------------------------------

export const RULE_0_PHILOSOPHY = `## RULE 0 — 90-DAY PLAN PHILOSOPHY

A 90-day plan is a strategic onboarding document, not a task list. It answers: "How will I earn trust, demonstrate value, and position myself as the leader this organization needs — in 90 days?"

Core principles:
1. **Strategic, not tactical** — A great 90-day plan shows how the executive thinks, prioritizes, and leads. It is not a checklist of meetings to schedule or reports to read. Every activity must connect to a strategic objective.
2. **Earn before you drive** — New leaders who push change before understanding context fail. The plan must demonstrate patience in the first 30 days and progressively increase influence. Listen first, contribute second, lead third.
3. **Stakeholder-centric** — Success in a new role is 80% relationships. The plan must show deliberate, strategic relationship building with every key stakeholder. Map the political landscape before navigating it.
4. **Quick wins build credibility** — Identify 2-4 early wins that demonstrate competence without overstepping. Quick wins should align with organizational priorities, not personal preferences.
5. **Authenticity matters** — The plan must reflect the candidate's actual strengths and style, not a generic template. Draw from their real experience and transferable skills to create a plan only they could execute.`;

// --- Rule 1: Phase Structure -----------------------------------------------

export const RULE_1_PHASE_STRUCTURE = `## RULE 1 — PHASE STRUCTURE

Every 90-day plan follows three distinct phases. Each phase has a clear theme, objectives, and success criteria.

Phase structure:
1. **Days 1-30: Listen & Learn** — Absorb context, build relationships, understand the business. Map stakeholders, identify the real (not stated) priorities, and find quick wins. Resist the urge to change anything significant. Ask 10x more questions than you give answers. Deliverable: a clear assessment of the current state, documented stakeholder map, and 2-3 identified quick wins.
2. **Days 31-60: Contribute & Build** — Begin adding visible value. Execute quick wins, propose initial improvements, build your team's confidence in your leadership. Start shaping strategy but co-create with the team — don't impose. Deliverable: quick wins delivered, initial strategy framework presented to leadership, team alignment sessions completed.
3. **Days 61-90: Lead & Deliver** — Drive strategic initiatives. Present your 6-month vision, make organizational decisions, deliver measurable results. By day 90, you should be operating as the established leader, not the new hire. Deliverable: strategic plan presented, first measurable outcomes, team operating at improved velocity.

Each phase must build on the previous one. Activities in Phase 2 should reference insights from Phase 1. Phase 3 should demonstrate that Phase 1 and 2 laid the groundwork for leadership.`;

// --- Rule 2: Stakeholder Management ----------------------------------------

export const RULE_2_STAKEHOLDER_MANAGEMENT = `## RULE 2 — STAKEHOLDER MANAGEMENT

Stakeholder mapping is the foundation of a successful onboarding. Every significant relationship must be identified, categorized, and strategically managed.

Stakeholder principles:
1. **Map before you meet** — Identify all key stakeholders: superiors, peers, direct reports, cross-functional partners, and external relationships (board, clients, vendors). For each, determine their influence, priorities, and likely concerns about the new leader.
2. **Prioritize engagement** — Not all stakeholders are equal. Classify by priority: critical (meet in week 1), high (meet in weeks 1-2), medium (meet in weeks 2-4), low (meet as needed). Your manager and their peers are always critical.
3. **Earn trust before driving change** — Each stakeholder has concerns about the new leader. Address those concerns directly: "What do you need from me?" "What's working well that I should protect?" "What would you change if you could?" Listen more than you speak in every initial meeting.
4. **Document relationship strategies** — For each critical and high-priority stakeholder, define: what they care about, how to earn their trust, what value you can provide them, and how to maintain the relationship beyond the initial meeting.
5. **Political awareness** — Every organization has informal power structures. Identify who really influences decisions, who the cultural gatekeepers are, and where the political minefields lie. This intelligence gathering happens in Phase 1 and informs all subsequent actions.`;

// --- Rule 3: Quick Wins ----------------------------------------------------

export const RULE_3_QUICK_WINS = `## RULE 3 — QUICK WINS

Quick wins demonstrate value early without overstepping. They build the credibility capital needed to drive larger changes later.

Quick win principles:
1. **Align with org priorities** — Quick wins must solve problems the organization already recognizes. Fixing something nobody cares about earns no credibility. Ask stakeholders: "What's the one thing that would make the biggest difference right now?"
2. **Low effort, high visibility** — The best quick wins are things that are obvious to insiders but require fresh-eye perspective. Process improvements, communication clarity, removing bottlenecks, resolving long-standing small irritations.
3. **Don't overreach** — Quick wins should be achievable within 2-4 weeks. If it requires organizational change, new budget, or team restructuring, it's not a quick win — it's a strategic initiative for Phase 3.
4. **Benefit stakeholders** — Every quick win should directly benefit at least one key stakeholder. This creates allies. "I noticed [problem], and I've implemented [solution]" is a powerful trust-building move.
5. **Document and communicate** — Quick wins only build credibility if people know about them. Share results with your manager and relevant stakeholders. Not self-promotion — just transparent progress reporting.`;

// --- Rule 4: Measurability -------------------------------------------------

export const RULE_4_MEASURABILITY = `## RULE 4 — MEASURABILITY

Every milestone must be observable and ideally quantifiable. Vague goals like "build relationships" are not milestones — they are aspirations.

Measurability principles:
1. **Observable outcomes** — Each milestone must describe something that can be verified by a third party. "Met with all 8 direct reports" is observable. "Understood the team dynamics" is not. "Presented 90-day assessment to CEO" is observable. "Got a feel for the culture" is not.
2. **Quantify where possible** — Use specific numbers: meetings held, processes documented, quick wins delivered, team members onboarded, stakeholder feedback scores. Numbers create accountability and demonstrate rigor.
3. **Timeline precision** — "By end of Week 2" is better than "early in Phase 1." Assign each milestone a specific week range (e.g., "Weeks 3-4") so progress can be tracked.
4. **Outcome over output** — "Reduced meeting cycle time from 2 hours to 45 minutes" is better than "streamlined meetings." Whenever possible, frame milestones as outcomes (what changed) rather than outputs (what was produced).
5. **Realistic but ambitious** — Milestones should stretch the executive without being impossible. Account for the learning curve — a new leader cannot operate at full speed in the first 30 days, and the plan should reflect that honestly.`;

// --- Rule 5: Realistic Pacing ----------------------------------------------

export const RULE_5_REALISTIC_PACING = `## RULE 5 — REALISTIC PACING

A credible 90-day plan acknowledges the learning curve and avoids overcommitment. An overloaded plan signals naivety, not ambition.

Pacing principles:
1. **Learning curve is real** — Even experienced executives need time to understand a new organization's culture, processes, systems, and people. Phase 1 should be 70% learning, 30% action. Phase 2 should be 50/50. Phase 3 should be 30% learning, 70% action.
2. **Buffer for surprises** — Every onboarding encounters unexpected challenges: organizational crises, departing team members, budget changes, inherited problems. Leave 20% unscheduled capacity in every phase.
3. **Avoid the common trap** — New leaders often overcommit in the first 30 days to prove themselves. This leads to shallow engagement, missed context, and burned political capital. The plan should explicitly guard against this by limiting Phase 1 initiatives.
4. **Progressive acceleration** — Each phase should have more delivery-oriented activities than the previous one. The plan should show a clear trajectory from observer to contributor to leader.
5. **Sustainable pace** — The 90-day plan is the beginning, not the end. Don't front-load everything into 90 days. The plan should set up the executive for long-term success, not short-term exhaustion.`;

// --- Rule 6: Executive Context ---------------------------------------------

export const RULE_6_EXECUTIVE_CONTEXT = `## RULE 6 — EXECUTIVE CONTEXT

Plans must reflect the seniority level of the role. A VP's 90-day plan looks fundamentally different from a director's plan.

Seniority considerations:
1. **C-suite plans** — Focus on board relationships, investor communication, enterprise strategy, and organizational design. Quick wins are often strategic clarity, not operational improvements. Phase 1 includes understanding the board dynamics and shareholder expectations.
2. **VP-level plans** — Focus on functional strategy, cross-functional influence, and team leadership. Quick wins involve process improvements and talent decisions. Phase 1 includes understanding the function's reputation within the organization.
3. **Director-level plans** — Focus on team execution, process optimization, and stakeholder management. Quick wins are often tactical improvements with measurable impact. Phase 1 includes understanding team capabilities and backlog.
4. **Scope calibration** — The plan's scope must match the role's scope. A VP of Engineering should not be writing code in their 90-day plan. A Director of Sales should not be designing company-wide strategy. Match the altitude of activities to the role's altitude.
5. **Language and framing** — Use language appropriate to the seniority level. C-suite plans reference "enterprise value" and "strategic positioning." Director plans reference "team velocity" and "process efficiency." The plan's language signals the executive's understanding of their level.`;

// --- Rule 7: Self-Review Checklist -----------------------------------------

export const RULE_7_SELF_REVIEW = `## RULE 7 — SELF-REVIEW CHECKLIST

Before finalizing the 90-day plan, verify every element against this checklist. A weak plan damages the candidate's positioning.

Verification criteria:
1. **Three distinct phases** — Each phase has a clear theme, specific objectives, concrete activities, measurable milestones, and identified risks. No phase is a copy of another with different dates.
2. **Stakeholder coverage** — Every critical and high-priority stakeholder has a documented engagement strategy. The stakeholder map includes superiors, peers, direct reports, and cross-functional partners.
3. **Quick wins are actionable** — Each quick win has a clear description, realistic timeline (2-4 weeks), identified stakeholder benefit, and does not require organizational change or new budget.
4. **Milestones are measurable** — Every milestone can be verified by a third party. Vague milestones like "build rapport" are replaced with observable outcomes like "completed 1:1 meetings with all 12 direct reports."
5. **Pacing is realistic** — Phase 1 is learning-heavy. Phase 2 balances learning and contribution. Phase 3 is delivery-heavy. No phase has more than 8-10 key activities. Buffer time exists for unexpected challenges.
6. **Seniority-appropriate** — Activities, language, and scope match the target role's level. A VP plan doesn't include individual contributor tasks. A director plan doesn't include board-level strategy.
7. **Connected to candidate strengths** — The plan leverages the candidate's specific experience, skills, and achievements. Generic activities are replaced with personalized ones that draw on transferable expertise.
8. **Risk awareness** — Each phase identifies 2-3 risks with specific mitigation strategies. Risks are realistic (not just "might fail") and mitigations are actionable.`;

// --- Combined System Prompt Injection --------------------------------------

/**
 * All 8 rules concatenated for injection into the 90-Day Plan agent's system prompt.
 */
export const NINETY_DAY_PLAN_RULES = [
  RULE_0_PHILOSOPHY,
  RULE_1_PHASE_STRUCTURE,
  RULE_2_STAKEHOLDER_MANAGEMENT,
  RULE_3_QUICK_WINS,
  RULE_4_MEASURABILITY,
  RULE_5_REALISTIC_PACING,
  RULE_6_EXECUTIVE_CONTEXT,
  RULE_7_SELF_REVIEW,
].join('\n\n---\n\n');
