// Executive Resume Building Guide for Ages 45+
// Centralized knowledge base — each tool imports only what it needs.

/**
 * Section-specific guidance blocks.
 * Keys match the section enum used by generate_section / propose_section_edit.
 */
export const SECTION_GUIDANCE: Record<string, string> = {
  summary: `## Professional Summary (Executive Summary)

PURPOSE: This is the candidate's 30-second elevator pitch — a branding statement that positions them for the role. Think highlight reel showing strategic leadership and ROI.

STRUCTURE (3-5 sentences, 60-100 words):
1. Opening Identity Statement — Title + years of experience + scope/industry
2. Quantifiable Achievement #1 — Most impressive, relevant metric
3. Quantifiable Achievement #2-3 — Additional data-backed wins
4. Core Competency/Specialization — Areas of expertise aligned to target role

DO:
- Lead with the best metric aligned to the target role's primary objective
- Use 3-5 job-specific keywords from the JD naturally integrated
- Quantify everything — percentages, dollar amounts, team sizes, scope
- Focus on outcomes, not responsibilities — "drove 35% revenue growth" not "responsible for revenue"
- Tailor for each application — adjust keywords and metrics to match specific posting
- Write in first person without using "I" — start with action verbs or descriptive phrases
- Position forward-looking capability — signal readiness for future challenges
- Balance strategic vision with tangible results — board-level thinking with ground-level impact

DON'T:
- Use generic phrases: "results-oriented leader," "proven track record," "team player"
- Use objective statements ("Seeking a position where…")
- List soft skills without context (leadership, communication)
- Make vague statements anyone could claim
- Exceed 5 sentences (recruiters spend 6 seconds on initial scan)
- Lead with responsibilities instead of achievements
- Use outdated terms or technologies that date the candidate

AGE 45+ STRATEGIES:
- Strip age indicators: remove graduation years if 20+ years ago
- Emphasize adaptability: include AI, digital transformation, modern tech where truthful
- Show currency: reference recent achievements (last 3-5 years) prominently
- Avoid dating yourself: don't mention "30 years of experience" — focus on impact timeframes
- Signal innovation: show forward-thinking, not stuck in old methodologies`,

  selected_accomplishments: `## Selected Accomplishments (Career Highlights)

PURPOSE: A "greatest hits" snapshot that can be scanned in 10 seconds. Front-loads ROI proof before the work history. Highly recommended for executives.

STRUCTURE:
- Placement: between Skills Section and Work Experience
- Format: 3-6 bullet points of the most impressive, quantifiable achievements
- Selection criteria: choose accomplishments that directly address the top 3 needs in the target JD

DO:
- Lead with numbers — "$8.5M cost reduction," "42% revenue growth," "Managed 15 locations"
- Span career breadth — achievements from different roles/companies show consistent excellence
- Focus on business impact — revenue, profitability, efficiency, market share, customer satisfaction
- Use CAR framework implicitly — Challenge/Action/Result compressed into one powerful line
- Align to target role priorities — if applying for CFO, weight financial achievements; COO = operational
- Include transformational initiatives — turnarounds, integrations, launches, major implementations
- Show scale and scope — budget sizes, team sizes, geographic reach, customer base
- Mix strategic and tactical — board-level outcomes + ground-level execution

DON'T:
- Use task-oriented statements ("Responsible for managing…")
- Include achievements without metrics ("Improved team performance")
- Provide overly detailed explanations (save for interview)
- Include accomplishments older than 10-12 years unless truly exceptional
- Repeat exact bullets that appear in work experience below
- Include personal achievements unrelated to business value

BULLET CONSTRUCTION — CAR Method (Challenge-Action-Result) Compressed:
[Specific achievement with metric] + [through/by what method] + [resulting business impact]

WEAK: "Responsible for leading the sales team and improving performance."
STRONG: "Grew regional sales 47% ($8.2M to $12.1M) in 18 months by restructuring compensation model and implementing data-driven territory management across 25-person team."

AGE 45+ STRATEGIES:
- Highlight recent wins prominently — weight last 5 years more heavily
- Demonstrate adaptability — digital transformation, technology adoption, innovation examples
- Show leadership at scale — multi-site, global teams, large budgets
- Balance tenure with impact — "Led 12-year transformation" shows staying power AND results`,

  experience: `## Work History (Professional Experience)

PURPOSE: The heart of the resume. Must demonstrate leadership at scale, strategic thinking, and measurable business impact — NOT list duties. Use 3-4x more space for accomplishments than responsibilities.

STRUCTURE PER ROLE:
JOB TITLE (use industry-standard titles)
Company Name (with brief descriptor if not well-known), Location
Employment Dates (Month Year – Month Year OR Year – Year for older roles)
[Optional: 1-2 sentence company context if needed]
[Optional: 2-3 lines of scope/responsibilities in sentence form — NOT bullets]
• Achievement bullet 1 with metrics (4-8 bullets total per role)

DO:
- Follow reverse chronological order — most recent first
- Limit to last 10-12 years of detailed history (earlier roles can be summarized)
- Start responsibility sentences with action verbs — "Directed," "Spearheaded," "Architected"
- NEVER use "responsible for" — replace with strong verbs ("Managed $50M budget")
- Use CAR/STAR/RAS framework for bullets but keep compressed to 1-2 lines
- Front-load each bullet with result/metric when possible
- Quantify scope constantly — budget sizes, team sizes, revenue, locations, customers
- Include context for major achievements — what was the challenge/situation
- Show progression — demonstrate growth in scope and impact across roles
- Use present tense for current role — past tense for previous positions

DON'T:
- Write long paragraphs explaining responsibilities
- Include bullets without metrics or outcomes
- Use generic duties that could apply to anyone in the role
- Use more than 8 bullets per position (diminishing returns)
- Go back more than 15-20 years in detail
- Include month/year for roles older than 15 years
- Use passive voice and weak verbs ("Helped with," "Assisted in," "Worked on")

BULLET CONSTRUCTION FORMULAS:

1. RAS (Result-Action-Situation) — Front-loaded with impact:
[Quantified result/outcome] + [action you took] + [context/situation]
Example: "Increased customer retention 32% (from 68% to 90%) by redesigning onboarding process and implementing predictive churn analytics across 50,000-customer base."

2. CAR (Challenge-Action-Result):
[Brief challenge/context] + [specific actions with verbs] + [measurable results]
Example: "Faced with declining market share (22% to 16% in 2 years), launched competitive intelligence program and repositioned product portfolio, recovering 8 points of share within 18 months."

3. STAR (Situation-Task-Action-Result) — More context, 2 lines max:
Example: "When acquired business unit struggled with 15% profit margins and $12M annual losses, restructured operations including 3 facility consolidations and renegotiated supplier contracts, achieving 24% margins and $8M profitability within 14 months."

BULLET CATEGORIES TO INCLUDE (mix across these):
- Financial Impact: revenue growth, cost reduction, profit improvement, ROI
- Operational Excellence: process improvement, efficiency gains, quality metrics
- Strategic Initiatives: M&A, market expansion, product launches, transformations
- People Leadership: team building, talent development, culture change, retention
- Technology/Innovation: system implementations, digital transformation, automation
- Customer/Market Focus: NPS, market share, retention, satisfaction

AGE 45+ STRATEGIES:
- Consolidate older roles — positions 15+ years ago as "Prior Experience" section
- Remove dates strategically — for oldest roles just list years (2005-2008) not months
- Emphasize recent impact — weight last 10 years with 80% of content
- Show continuous evolution — kept skills current, adopted new methodologies
- Address tenure concerns — if 15+ years at one company, show internal progression and expanding scope
- Handle shorter recent tenures — clearly mark contract/consulting roles`,

  skills: `## Professional Skills (Core Competencies / Areas of Expertise)

PURPOSE: Keyword repository for ATS optimization AND quick-scan section for human readers. Must balance technical competencies with leadership capabilities while staying laser-focused on relevance.

STRUCTURE:
- Location: directly below Professional Summary (prime ATS real estate)
- Format: 10-15 skills organized in 2-3 thematic categories OR simple comma-separated list
- Length: should fit in 3-6 lines maximum

DO:
- Extract keywords directly from job descriptions — use exact terminology (e.g., "Salesforce CRM" not just "CRM")
- Prioritize hard skills and technical competencies — these carry more ATS weight
- Group related skills under clear headings (Leadership & Management, Financial Acumen, Technical Skills)
- Use both acronyms AND full terms — "Project Management Professional (PMP)" covers both searches
- Include industry-specific terminology — regulations (SOX, HIPAA), methodologies (Agile, Six Sigma), systems
- Balance strategic and tactical — show capability for both high-level strategy and execution
- Update to reflect current tech landscape — AI, machine learning, cloud platforms, data analytics
- Match JD priority — if they list "strategic planning" first, weight it heavily
- Target 60-80% coverage of JD keywords (15-25 relevant keywords total)

DON'T:
- List soft skills as standalone items ("leadership," "communication," "team player")
- Include obvious/expected skills (Microsoft Office, Word, email)
- Include outdated technologies (MS-DOS, Flash, Silverlight, obsolete systems)
- Include low-level operational skills from early career
- List more than 20 skills (looks unfocused)
- List skills the candidate doesn't actually possess or can't discuss in depth
- Use generic management buzzwords without specificity

KEYWORD DENSITY TARGETS:
- Total: 15-25 relevant keywords per resume
- Professional Summary: 3-5 keywords
- Skills Section: 10-15 keywords
- Experience bullets: integrated naturally
- Natural integration: "Led Salesforce CRM implementation for 500+ users" beats keyword stuffing

AGE 45+ STRATEGIES:
- Modernize skill list — replace dated terms with current equivalents
- Include relevant emerging technologies — AI strategy, machine learning, cloud migration (if truthful)
- Show digital fluency — SaaS platforms, data visualization tools, modern PM software
- Avoid skills that date you — focus on tools/methodologies from last 5-7 years
- Balance foundational expertise with innovation — "P&L Management" paired with "Predictive Analytics"`,

  education: `## Education

STRUCTURE:
- Degree, Field of Study
- Institution Name
- Year (ONLY include if graduated within last 15-20 years)

DO:
- List highest degree first
- Include relevant honors, GPA only if 3.5+ and graduated within 10 years
- Include relevant coursework ONLY if directly applicable to target role and recent

DON'T:
- Include graduation year if 20+ years ago (age bias signal)
- Include high school education for executive-level candidates
- Over-emphasize education over experience for senior roles

AGE 45+ STRATEGIES:
- Remove graduation dates for degrees earned 20+ years ago
- Focus on continuing education and professional development to show currency
- Include executive education programs (Harvard Business School, Wharton, etc.) prominently
- List relevant recent certifications to demonstrate ongoing learning`,

  certifications: `## Certifications & Professional Development

STRUCTURE:
- Certification Name (Acronym) — Issuing Organization
- Year obtained (include if recent, omit if very old)

DO:
- List most relevant and current certifications first
- Include industry-standard certifications that appear in JD requirements
- Include ongoing professional development to show continuous learning
- Mention certification dates only when they show recency and currency

DON'T:
- List expired or obsolete certifications
- Include certifications for technologies no longer in use
- Overload with too many minor certifications — focus on impactful ones

AGE 45+ STRATEGIES:
- Lead with recent certifications to show currency and adaptability
- Include any modern/emerging technology certifications (cloud, AI, data analytics)
- Remove certifications for obsolete technologies
- Show a pattern of continuous learning`,

  title_adjustments: `## Title Adjustments

PURPOSE: Align job titles to industry standards and ATS expectations. The right title can make or break ATS matching.

DO:
- Use industry-standard titles that match what the target company and ATS expect
- Adjust internal-only titles to widely recognized equivalents (e.g., "People Champion" → "VP of Human Resources")
- Keep adjustments truthful — reflect actual scope and responsibility level
- Consider how titles appear when compared to the target role
- Use the candidate's most senior applicable title variant

DON'T:
- Inflate titles beyond what's truthful
- Use internal jargon or creative titles that ATS won't recognize
- Change titles so drastically they'd fail a reference check
- Downgrade titles unnecessarily

AGE 45+ STRATEGIES:
- Ensure titles reflect current market terminology
- Adjust legacy titles to modern equivalents where appropriate
- Show progression through title changes across career`,
};

/**
 * 10-point quality checklist. Used by adversarial_review and quality_review phase.
 */
export const QUALITY_CHECKLIST = [
  'Is this quantified? (Numbers, percentages, dollar amounts)',
  'Is this achievement-focused? (Not task/duty-focused)',
  'Does this show business impact? (Revenue, cost, efficiency, quality, retention)',
  'Are keywords naturally integrated? (From target job description)',
  'Is this recent and relevant? (Weight last 10 years heavily)',
  'Does this show leadership at scale? (Scope, budget, team size)',
  'Is language strong and active? (No "responsible for," "helped with")',
  'Would this impress a board member? (Strategic thinking evident)',
  'Is this ATS-friendly? (Standard formatting, clear structure)',
  'Does this position the candidate forward? (Ready for next challenge, not just retrospective)',
] as const;

/**
 * ATS formatting rules. Injected into ats-check.ts.
 */
export const ATS_FORMATTING_RULES = `## ATS Formatting Standards

SECTION HEADERS — Use only standard terms:
- "Professional Summary" or "Executive Summary" (NOT "About Me" or "Profile")
- "Professional Experience" or "Work Experience" (NOT "Where I've Made My Mark")
- "Core Competencies" or "Skills" or "Areas of Expertise"
- "Education" (NOT "Academic Background")
- "Certifications" or "Certifications & Professional Development"
- "Selected Accomplishments" or "Career Highlights" or "Key Achievements"

LAYOUT & FORMAT:
- Single-column layout only (no tables, text boxes, columns)
- Standard fonts (Arial, Calibri, Georgia, Times New Roman)
- Simple bullet points (• or -), avoid fancy symbols
- DOCX format preferred over PDF (unless specified)
- No headers/footers with critical info (ATS often can't read them)
- No images, graphics, charts, logos
- No text boxes or floating elements
- Consistent date formatting throughout

KEYWORD PLACEMENT TARGETS:
- Professional Summary: 3-5 most critical keywords
- Skills Section: 10-15 keywords organized clearly
- Work Experience bullets: integrated naturally with context
- Target 60-80% overall keyword coverage of JD requirements

KEYWORD RULES:
- Use exact JD terminology (e.g., "Salesforce CRM" not just "CRM")
- Use both acronyms AND full terms for important keywords
- Natural integration beats keyword stuffing — "Led Salesforce CRM implementation for 500+ users" is better than listing "Salesforce CRM" standalone
- Include industry-specific regulations, methodologies, and systems by name`;

/**
 * Resume anti-patterns for the humanize-check tool.
 */
export const RESUME_ANTI_PATTERNS = `## Resume-Specific Anti-Patterns to Flag

CLICHE PHRASES (flag every occurrence):
- "results-oriented leader"
- "proven track record"
- "team player"
- "responsible for" (replace with strong action verbs)
- "helped with" / "assisted in" / "worked on"
- "dynamic leader"
- "seasoned professional"
- "go-to person"
- "think outside the box"
- "synergy" / "synergize"
- "leverage" (when used as a buzzword without specifics)
- "passionate about"
- "detail-oriented"
- "self-starter"
- "strategic thinker" (without evidence)

STRUCTURAL ANTI-PATTERNS:
- Every bullet starts with the same verb pattern
- All bullets are the same length (too uniform = AI-generated)
- No variation in sentence complexity
- Metrics feel fabricated (too round, too perfect)
- Corporate-speak without any personality or voice
- Too many quantified metrics in a row without narrative context
- Passive constructions throughout
- Job-description-copy language (reads like duty list, not achievement list)

AGE-SENSITIVE FLAGS (separate category):
- Mentions "30+ years of experience" or similar dating language
- Includes graduation years from 20+ years ago
- References obsolete technologies (Lotus Notes, BlackBerry, etc.)
- Uses outdated business terminology
- Objective statement instead of professional summary
- "References available upon request"
- Street address in header (phone + email + LinkedIn only)
- Hobbies/personal interests section
- Skills that date the candidate (early-career operational tasks)`;

/**
 * Age-awareness rules injected into the system prompt BASE_PROMPT.
 */
export const AGE_AWARENESS_RULES = `## Age 45+ Awareness (Active in All Phases)

You are coaching professionals aged 45+ who may face unconscious age bias in hiring. Apply these principles throughout:

POSITIONING:
- Frame experience as strategic advantage, never as "long tenure"
- Emphasize recent impact (last 5-10 years) over career span
- Show adaptability and continuous evolution — modern tools, current methodologies
- Signal innovation and forward-thinking, not legacy expertise
- Use language that conveys energy and relevance

REMOVE OR AVOID:
- Graduation years for degrees earned 20+ years ago
- "30 years of experience" or similar age-revealing quantifiers
- Objective statements (outdated format signal)
- "References available upon request" (dated convention)
- Street addresses (phone + email + LinkedIn only)
- Obsolete technologies and methodologies
- Hobbies or personal interests sections

EMPHASIZE:
- Modern skills: AI, cloud, data analytics, digital transformation (where truthful)
- Recent achievements weighted prominently
- Adaptability and transformation examples
- Strategic thinking and vision
- Executive presence through scope and scale
- Continuous learning and professional development
- LinkedIn profile URL (signals professional digital presence)

LANGUAGE:
- Use present-tense, forward-looking framing
- "Currently leading…" beats "Have spent 25 years…"
- Describe evolution, not duration
- Frame career longevity as depth of impact, not length of service`;

/**
 * Recommended section order for the section_craft phase.
 */
export const SECTION_ORDER = [
  'Summary',
  'Core Competencies / Skills',
  'Selected Accomplishments',
  'Experience (each role)',
  'Education',
  'Certifications',
  'Title Adjustments',
] as const;

export const SECTION_ORDER_KEYS = [
  'summary', 'skills', 'selected_accomplishments',
  'experience', 'education', 'certifications', 'title_adjustments',
] as const;
