/**
 * LinkedIn Content Agent — Knowledge Rules
 *
 * 6 rules (0-5) that govern LinkedIn post strategy, hook engineering,
 * evidence-based authority, and positioning alignment for executive-level
 * content creators. These rules are injected into the Strategist and Writer
 * agent system prompts.
 *
 * Rule design principles:
 * - Authenticity means rooting every post in real experience
 * - Thought leadership requires a perspective, not just information
 * - Content must reinforce the same positioning used in resume and other products
 * - Platform mechanics (algorithm, format) are a constraint to design within, not a goal
 */

// ─── Rule 0: Content Philosophy ─────────────────────────────────────

export const RULE_0_PHILOSOPHY = `## RULE 0 — CONTENT PHILOSOPHY

LinkedIn posts for executives position the author as a practitioner sharing hard-won insight — not a content creator chasing engagement. The distinction is fundamental. Content creators optimize for likes. Practitioners share what they actually know, and the audience responds because the insight is real.

Core principles:
1. **Authenticity means specificity** — Every post must be rooted in a real experience, decision, or observation from the executive's professional history. "I've seen this work" is weak. "When I was scaling the customer success function at Meridian from 3 people to 40, the thing that changed everything was..." is authentic. The evidence library is the source of truth.
2. **Practitioners, not performers** — The goal is not to build a personal brand through carefully crafted persona management. The goal is to let the genuine depth of the executive's expertise surface naturally. A post that would embarrass the executive if colleagues read it is the wrong post.
3. **Insight over information** — The internet has infinite information. What it lacks is genuine insight from people who have actually done the work. Every post should offer something the reader could not have Googled: a counterintuitive observation, a hard-earned lesson, a pattern recognized across multiple situations.
4. **One clear idea per post** — Trying to pack too much into a single post diffuses impact. Each post should make one clear point and prove it. If the draft tries to make three points, it should become three posts.
5. **The credibility test** — Read the post and ask: would a skeptical peer at the same level find this credible and useful? If it sounds like it was written by a social media consultant rather than a practitioner, rewrite it.

What this is NOT:
- Tips and tricks content that anyone could write
- Motivational content disconnected from specific professional experience
- Industry news summaries or reshared articles with generic commentary
- Persona-building content designed to project an image rather than share genuine expertise`;

// ─── Rule 1: Hook Engineering ────────────────────────────────────────

export const RULE_1_HOOK = `## RULE 1 — HOOK ENGINEERING

The first two lines of a LinkedIn post determine whether it gets read. LinkedIn shows roughly 150-200 characters before the "see more" break. Those two lines must stop the scroll.

Hook patterns that work for executive-level content:
1. **Specific number + counterintuitive claim** — "I've led 7 turnarounds. The most important hire every single time was not who you'd expect."
2. **Pattern-interrupt observation** — "Most leadership advice gets this backwards. The bigger the team, the less you should communicate strategy — and more often."
3. **Vulnerability opening** — "I made a decision in 2019 that I thought would end my career. Looking back, it was the best professional decision I ever made."
4. **Contrarian take** — "Data culture doesn't fail because companies don't buy the right tools. It fails for a completely different reason."
5. **Direct specificity** — "In 18 months, we reduced customer churn from 34% to 9%. Here's the one change that drove 80% of that result."

Hooks to avoid:
- "Here are 5 lessons I learned about [topic]..." — Listicle framing signals generic content
- "I've been thinking about [topic] lately..." — Vague setup, no reason to keep reading
- "This is a hot take, but..." — Signals you know it's weak
- "If you're in [industry], you need to read this..." — Clickbait framing that readers distrust
- "Unpopular opinion:" followed by something widely agreed upon

The hook's job is not to trick the reader into clicking — it is to signal that what follows is worth reading. Hooks that overpromise and underdeliver destroy credibility faster than any individual post.`;

// ─── Rule 2: Evidence-Based Authority ───────────────────────────────

export const RULE_2_EVIDENCE = `## RULE 2 — EVIDENCE-BASED AUTHORITY

Every post must reference a specific experience, project, or outcome from the executive's history. Vague authority signals borrowed expertise. Specific authority signals lived experience.

Evidence standards:
1. **Name the situation** — "When I led the $47M platform migration at Acme" establishes credibility in a way that "In my experience with large technology projects" never can. Company names, project scales, time periods, and team structures are all credibility signals.
2. **Specificity beats polish** — A slightly rough post grounded in a real experience outperforms a perfectly crafted post that reads like it could have been written by anyone. The goal is to sound like a practitioner, not a thought leadership consultant.
3. **The "I've seen this work" failure** — "I've seen this approach work at multiple companies" is the lowest-credibility evidence pattern. Name the company, name the challenge, name the outcome. If the executive cannot be specific, the evidence is too thin for a post.
4. **Metrics anchor credibility** — Whenever the evidence library contains a metric relevant to the post's point, use it. "$2.3M in annual savings" is more credible than "significant cost reduction." "Reduced time-to-hire from 67 days to 28" is more memorable than "improved recruiting efficiency."
5. **Acknowledge the team** — Solo-hero narratives ring false for executives. "I built this" when the executive led a team of 40 is a credibility problem. "We built this — and the thing I contributed that made the difference was..." is both accurate and positions the executive's specific value.
6. **Draw from the evidence library** — The source of truth for specific accomplishments, metrics, and experiences is the evidence library from the resume pipeline. Use it. Do not generalize what should be specific.`;

// ─── Rule 3: Thought Leadership vs Content Creation ──────────────────

export const RULE_3_THOUGHT_LEADERSHIP = `## RULE 3 — THOUGHT LEADERSHIP VS CONTENT CREATION

Thought leadership means having a perspective. Not everyone who shares professional content is a thought leader. The distinction is whether the author has a point of view that could be challenged — and whether they are willing to defend it.

Hierarchy of content value (low to high):
1. **Information sharing** — "Here's news about the industry." Anyone can do this. No authority required.
2. **Experience story** — "Here's what happened to me." Adds authenticity but not necessarily insight.
3. **Lesson extracted** — "Here's what I learned from what happened." Better, but still descriptive.
4. **Pattern recognized** — "Here's what I've noticed across multiple situations." This is where expertise begins.
5. **Perspective defended** — "Here's why everyone else is getting this wrong, and here's the better model." This is thought leadership.

Push toward 4 and 5 wherever the evidence supports it. The executive has spent decades in their domain. They have seen patterns others have not seen. They have been wrong about things that turned out to matter. That is the material for thought leadership — not industry trends, not productivity tips, not motivation.

Questions to escalate from content creation to thought leadership:
- "What does most conventional wisdom in this area get wrong?"
- "What is a pattern I have seen in 3 or more contexts that surprised me each time?"
- "What decision did I make that went against advice from people I respected — and what happened?"
- "What would I tell my 35-year-old self that contradicts what most people in this field believe?"

A post that hedges every claim, validates conventional wisdom, and offends no one is not thought leadership. It is expensive neutrality. Push for a perspective.`;

// ─── Rule 4: Platform-Specific Standards ────────────────────────────

export const RULE_4_PLATFORM = `## RULE 4 — PLATFORM-SPECIFIC STANDARDS

LinkedIn is a specific platform with specific mechanics. Ignoring those mechanics means content does not reach the people it is meant to reach. But platform mechanics are a constraint to design within — not the goal.

Format standards:
1. **Line breaks are mandatory** — Dense paragraph text on LinkedIn is not read. Every 1-3 sentences should have a line break. The visual cadence of the post signals readability before the reader even begins.
2. **1200-1500 characters is the sweet spot** — Long enough to develop an idea with evidence. Short enough to be read in a single sitting without losing the thread. Under 800 characters is usually too thin for executive-level insight. Over 2000 characters is too long for the format.
3. **Native content over links** — LinkedIn's algorithm suppresses posts with external links. If the executive wants to share an article, reference it in text ("HBR published research on this last year") rather than dropping the URL into the post body. Put links in comments if needed.
4. **No hashtag spam** — 3-5 relevant hashtags maximum. Hashtags in the middle of sentences are distracting. Place them at the end of the post. Generic hashtags (#leadership, #management, #success) add no value and signal unfamiliarity with the platform. Use specific, relevant ones.
5. **Personal stories outperform corporate messaging** — The LinkedIn algorithm rewards personal, authentic content. Posts that sound like press releases or corporate communications consistently underperform. First-person narratives outperform third-person authority statements.
6. **The call to action** — Posts that end with a genuine question to the audience drive higher engagement. The question must be genuine — not a manufactured engagement prompt. "What has your experience been with this?" works if the post actually invites disagreement. "What do you think?" after an obvious statement is filler.

What to avoid:
- Reposting content from other platforms without reformatting for LinkedIn
- Motivational quote graphics (disqualifying for executive-level positioning)
- Engagement bait ("Like if you agree!", "Tag someone who needs to see this!")
- More than 5 hashtags
- External links in the post body`;

// ─── Rule 5: Positioning Alignment ──────────────────────────────────

export const RULE_5_POSITIONING = `## RULE 5 — POSITIONING ALIGNMENT

LinkedIn content must reinforce the same positioning strategy used in the resume and other products across the platform. The executive's LinkedIn presence should feel like a coherent extension of who they are positioning themselves to be — not a separate personality performing for a social audience.

Alignment standards:
1. **Content domain matches positioning strategy** — If the executive is positioned as a "digital transformation leader," their LinkedIn content should establish authority in digital transformation. Posts on unrelated topics dilute the positioning signal. Every post should ask: does this reinforce who I am positioning myself to be?
2. **Consistent voice and tone** — The executive's voice in LinkedIn posts should feel consistent with their bio, resume, and cover letter. If the resume voice is authoritative and data-driven, the LinkedIn posts should not be motivational and fluffy. Consistency across channels builds credibility.
3. **Surface the positioning proof points** — The evidence library contains the executive's most compelling proof points. LinkedIn content is an opportunity to surface those proof points in context — in stories, in lessons, in patterns. The content strategy should systematically draw on this evidence over time.
4. **Why Me narrative reinforcement** — The executive's Why Me story (their career identity and archetype) should be the invisible thread running through their LinkedIn content. If the Why Me is "I am a fixer who turns around struggling operations," then posts about turnarounds, organizational change, and operational discipline reinforce that identity naturally.
5. **Future-positioning alignment** — If the executive is positioning for a new role or industry, the LinkedIn content strategy should begin establishing authority in that domain before the job search becomes public. Content is a long game. Posts published 6 months before a job search lay the groundwork for conversations that happen 6 months later.
6. **Content calendar discipline** — Inconsistent posting undermines positioning. A burst of 10 posts followed by 3 months of silence signals disorganization, not authority. A realistic cadence (even 1-2 posts per week) maintained consistently is far more effective than irregular intensity.`;

// ─── Rule 6: 360Brew Algorithm Optimization ─────────────────────────

export const RULE_6_360BREW = `## RULE 6 — 360BREW ALGORITHM OPTIMIZATION

360Brew research identifies specific patterns that LinkedIn's algorithm rewards and penalizes. Apply these rules to every post:

**Hard prohibitions:**
1. **NO EXTERNAL LINKS in the post body** — LinkedIn suppresses reach on posts containing URLs. If a source must be referenced, name it in text ("MIT published research on this in 2023") and put the link in the first comment after posting. Never in the post body.
2. **NO ENGAGEMENT BAIT** — These phrases are flagged by the algorithm and destroy credibility with senior audiences:
   - "Like if you agree"
   - "Comment your thoughts below"
   - "Share this with someone who needs it"
   - "Tag a colleague"
   - "Drop a [emoji] if..."
   - "Repost to spread the word"
3. **NO AI FILLER PHRASES** — These phrases signal AI-generated content and are penalized:
   - "In today's rapidly evolving landscape"
   - "It's not about X, it's about Y"
   - "Here's why this matters"
   - "Let me break this down"
   - "The truth is..."
   - "Game-changer" / "game-changing"
   - "Thought leadership" (referring to the post itself)
   - "At the end of the day"
   - Any sentence opening with "As a [job title]..."

**Format optimization:**
4. **TEXT POST LENGTH: 1,000–1,300 characters** — This range is the 360Brew sweet spot for text posts. Under 800 characters delivers less reach. Over 1,500 characters shows diminishing returns. Count the characters and target this band.
5. **CAROUSEL DEPTH: 8–12 slides** — Document carousels in this range outperform shorter ones. Each slide must carry real insight, not filler. Under 8 slides and over 12 slides are both penalized in the algorithm's ranking.
6. **DEPTH OVER BREVITY** — A 1,100-character post with one well-developed idea outperforms a 200-character post every time. LinkedIn rewards time-on-post. Give readers something worth staying for.

**Topic consistency:**
7. **TOPIC DNA** — 360Brew's algorithm tracks topic consistency per profile. An executive who posts consistently about operations will rank higher for "operations" searches than one who varies topics every week. Every post should connect to the executive's core expertise domain. If they are an operations leader, posts about team culture, supply chain, or efficiency all connect. Posts about cryptocurrency do not.`;

// ─── Combined System Prompt Injection ────────────────────────────────

/**
 * All 7 rules concatenated for injection into the LinkedIn Content agent system prompts.
 */
export const LINKEDIN_CONTENT_RULES = [
  RULE_0_PHILOSOPHY,
  RULE_1_HOOK,
  RULE_2_EVIDENCE,
  RULE_3_THOUGHT_LEADERSHIP,
  RULE_4_PLATFORM,
  RULE_5_POSITIONING,
  RULE_6_360BREW,
].join('\n\n---\n\n');
