/**
 * LMS Course Configurations — All 8 courses
 *
 * Each lesson declares injection slots that pull from real agent output.
 * The lesson content is placeholder text — final copy fills these later.
 * The slot definitions are the load-bearing part: they define what data
 * each lesson needs and where it lives in the agent output.
 */

import type { CourseConfig, LessonConfig } from '@/types/lms';

// ─── Course 1: Understanding the System ─────────────────────────────────────

const COURSE_1_LESSONS: LessonConfig[] = [
  {
    id: 'c1-l1',
    courseId: 'course-1',
    courseTitle: 'Understanding the System',
    lessonNumber: 1,
    title: 'Your Career Arc and Where You Really Stand',
    description: 'Most executives have far more career capital than their resume shows. This lesson reveals the gap.',
    content: `## The Gap Between Who You Are and What Your Resume Says

Most executives' professional lives are only about 1% reflected on their resume. The other 99% — the decisions made under pressure, the teams built from scratch, the crises navigated — lives in your memory and your colleagues' minds.

This lesson helps you see that gap clearly. Your career arc tells the story of your trajectory. Your trophy count vs. your resume bullet count reveals how much capital you've left on the table.

**The insight:** You're better suited for far more roles than you currently believe. The evidence is there. We just need to surface it.`,
    slots: [
      {
        key: 'career_arc_label',
        label: 'Your Career Arc',
        agentSource: 'positioning',
        dataPath: 'positioning.positioning_statement',
        format: 'text',
      },
      {
        key: 'trophy_count',
        label: 'Evidence Items in Your Library',
        agentSource: 'resume-v2',
        dataPath: 'candidateIntelligence.quantified_outcomes',
        format: 'number',
      },
      {
        key: 'career_themes',
        label: 'Your Career Themes',
        agentSource: 'resume-v2',
        dataPath: 'candidateIntelligence.career_themes',
        format: 'list',
      },
    ],
    linkedAgent: 'career-profile',
    linkedAgentLabel: 'Build Your Career Profile',
  },
  {
    id: 'c1-l2',
    courseId: 'course-1',
    courseTitle: 'Understanding the System',
    lessonNumber: 2,
    title: 'How ATS Systems Read Your Resume',
    description: 'What automated screening actually does — and the 5 keywords standing between you and a human reader.',
    content: `## What Happens Before a Human Sees Your Resume

Roughly 75% of resumes are filtered by ATS systems before a recruiter reads them. But the problem isn't the technology — it's that most executives write resumes for humans, not for the software that sees it first.

ATS systems scan for keyword matches, formatting compatibility, and structural signals. A resume can be excellent and still score 42% because the right language isn't present.

**The fix is simpler than you think.** It's not about gaming the system — it's about speaking the language of the job description you're targeting.`,
    slots: [
      {
        key: 'ats_score',
        label: 'Your Current ATS Match Score',
        agentSource: 'resume-v2',
        dataPath: 'assembly.scores.ats_match',
        format: 'percentage',
      },
      {
        key: 'top_missing_keywords',
        label: 'Top 5 Missing Keywords',
        agentSource: 'resume-v2',
        dataPath: 'verificationDetail.ats.keywords_missing',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Run My ATS Score',
  },
  {
    id: 'c1-l3',
    courseId: 'course-1',
    courseTitle: 'Understanding the System',
    lessonNumber: 3,
    title: 'The Benchmark Candidate — Who You\'re Being Compared To',
    description: 'Every hiring manager has a mental model of the ideal candidate. This is yours.',
    content: `## You Are Being Measured Against an Invisible Standard

When a hiring manager reads your resume, they're comparing you to the benchmark — the ideal candidate profile they've built in their head from reading dozens of resumes and knowing their business.

Understanding what that benchmark looks like for your target role is one of the highest-leverage things you can do. It tells you exactly what to emphasize, what to surface, and what gaps to address.

**The good news:** Most executives already have the experience that meets benchmark expectations. They just haven't framed it that way.`,
    slots: [
      {
        key: 'benchmark_profile',
        label: 'Your Benchmark Candidate Profile',
        agentSource: 'resume-v2',
        dataPath: 'benchmarkCandidate.ideal_profile_summary',
        format: 'text',
      },
      {
        key: 'top_gaps',
        label: 'Top 3 Gap Classifications',
        agentSource: 'gap-analysis',
        dataPath: 'gapAnalysis.critical_gaps',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Build My Benchmark Profile',
  },
  {
    id: 'c1-l4',
    courseId: 'course-1',
    courseTitle: 'Understanding the System',
    lessonNumber: 4,
    title: 'The First Three Lines — Your Resume\'s Most Expensive Real Estate',
    description: 'Recruiters decide in 6 seconds. Here\'s what your opening lines are currently communicating.',
    content: `## Six Seconds

That's the average time a recruiter spends on initial resume review before deciding to continue or discard. And those six seconds are almost entirely spent on the top third of the page.

Your summary, header, and first visible experience line are doing enormous work. If they don't immediately signal relevance to the target role, the rest of the resume never gets read — no matter how strong it is.

**This lesson shows you what your opening says right now, and what it should say instead.**`,
    slots: [
      {
        key: 'current_summary_opening',
        label: 'Your Current Summary Opening',
        agentSource: 'resume-v2',
        dataPath: 'assembly.final_resume.executive_summary.content',
        format: 'text',
      },
      {
        key: 'recommended_opening',
        label: 'Recommended Opening Angle',
        agentSource: 'positioning',
        dataPath: 'positioning.narrative_summary',
        format: 'text',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Rewrite My Summary',
  },
  {
    id: 'c1-l5',
    courseId: 'course-1',
    courseTitle: 'Understanding the System',
    lessonNumber: 5,
    title: 'The Gauntlet — Two Reasons You\'ll Be Eliminated',
    description: 'The hiring manager\'s skeptical eye finds these two things first. Know them before they do.',
    content: `## The Gauntlet

Every resume goes through an unofficial evaluation by a skeptical hiring manager asking: "What's wrong with this person? Why would I NOT hire them?"

This isn't cynicism — it's pattern recognition. Experienced hiring managers have seen thousands of resumes and know exactly where the weak points hide: unexplained gaps, missing metrics, vague scope claims, industry mismatches.

**Your job is to see your resume through that lens before they do — and address the two most likely elimination points before they're flagged.**`,
    slots: [
      {
        key: 'gauntlet_risks',
        label: 'Top 2 Elimination Risks',
        agentSource: 'resume-v2',
        dataPath: 'hiringManagerScan.red_flags',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Run My Gauntlet Review',
  },
];

// ─── Course 2: Super Bowl Story ──────────────────────────────────────────────

const COURSE_2_LESSONS: LessonConfig[] = [
  {
    id: 'c2-l1',
    courseId: 'course-2',
    courseTitle: 'The Super Bowl Story',
    lessonNumber: 1,
    title: 'Your Career Arc Label and Top Capability',
    description: 'The narrative frame that positions everything else. What your career is actually about.',
    content: `## What Is Your Career Arc?

Your career arc is the through-line — the thing that connects every role, every accomplishment, every decision into a coherent story. Most executives can't articulate this clearly, which means their resume reads as a list of jobs rather than a career narrative.

The hiring manager who sees a clear arc — "this person builds operational capability in high-growth environments" — knows exactly why they're looking at this candidate and what they'd bring.

**This lesson identifies your arc and your top capability claim so everything else in your resume can support them.**`,
    slots: [
      {
        key: 'career_arc_label',
        label: 'Your Career Arc Label',
        agentSource: 'positioning',
        dataPath: 'positioning.positioning_statement',
        format: 'text',
      },
      {
        key: 'top_capability',
        label: 'Your Top Capabilities',
        agentSource: 'positioning',
        dataPath: 'positioning.core_strengths',
        format: 'list',
      },
      {
        key: 'branded_title',
        label: 'Your Branded Title',
        agentSource: 'resume-v2',
        dataPath: 'narrativeStrategy.branded_title',
        format: 'text',
      },
    ],
    linkedAgent: 'career-profile',
    linkedAgentLabel: 'Define My Arc',
  },
  {
    id: 'c2-l2',
    courseId: 'course-2',
    courseTitle: 'The Super Bowl Story',
    lessonNumber: 2,
    title: 'Why Me / Why Not Me',
    description: 'The honest reckoning: why you\'re the right hire, and what objections will come up.',
    content: `## The Honest Dual Framing

Great positioning starts with honesty. Not just "why me" — the easy half — but also "why not me" — the objections a hiring manager will raise about your fit.

Executives who can answer both questions clearly are the ones who get hired. They've already processed the concern and have a reframe ready. They don't get blindsided in interviews.

**Your Why Me is your headline. Your Why Not Me is your preparation.**`,
    slots: [
      {
        key: 'why_me_story',
        label: 'Your Why Me Story',
        agentSource: 'positioning',
        dataPath: 'narrative.colleagues_came_for_what',
        format: 'text',
      },
      {
        key: 'why_me_narrative',
        label: 'Your Why Me — Full Narrative',
        agentSource: 'resume-v2',
        dataPath: 'narrativeStrategy.why_me_story',
        format: 'text',
      },
      {
        key: 'why_not_me',
        label: 'Why Not Me — Top Objection',
        agentSource: 'positioning',
        dataPath: 'narrative.why_not_me',
        format: 'text',
      },
    ],
    linkedAgent: 'career-profile',
    linkedAgentLabel: 'Explore My Why Me',
  },
  {
    id: 'c2-l3',
    courseId: 'course-2',
    courseTitle: 'The Super Bowl Story',
    lessonNumber: 3,
    title: 'Your Trophy Cabinet — Surface Your Buried Accomplishments',
    description: 'The results most executives forget to include. These are your trophies.',
    content: `## The 99% You\'re Leaving Out

Most executives can recall the headline accomplishments — the big P&L win, the major reorg, the product launch. But the career library runs much deeper: the team they rescued from attrition, the process change that freed up 40% of the finance team's time, the vendor relationship that saved a division.

These are your trophies. The AI has surfaced what it found in your resume. Now let's see what's buried.

**Your strongest interview stories are often your most overlooked resume bullets.**`,
    slots: [
      {
        key: 'top_trophies',
        label: 'Top 3 Trophies from Your Evidence Library',
        agentSource: 'resume-v2',
        dataPath: 'candidateIntelligence.quantified_outcomes',
        format: 'list',
      },
      {
        key: 'buried_trophies',
        label: '2 Trophies That Aren\'t on Your Resume',
        agentSource: 'resume-v2',
        dataPath: 'candidateIntelligence.hidden_accomplishments',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Surface My Trophies',
  },
  {
    id: 'c2-l4',
    courseId: 'course-2',
    courseTitle: 'The Super Bowl Story',
    lessonNumber: 4,
    title: 'Your Benchmark Map — Green, Yellow, Red',
    description: 'Where you stand against the ideal hire for your target role, dimension by dimension.',
    content: `## The Benchmark Gap Map

The benchmark candidate is the imaginary ideal hire — the person the job description was written for. Mapping yourself against that benchmark reveals exactly where you're strong, where you can reframe, and where you have genuine gaps.

Green means you meet or exceed the benchmark. Yellow means you have the experience but need better positioning. Red means there's a real gap you should address head-on.

**Most executives are surprised: far more green than red. The problem is usually positioning, not capability.**`,
    slots: [
      {
        key: 'coverage_score',
        label: 'Your Benchmark Match Score',
        agentSource: 'gap-analysis',
        dataPath: 'gapAnalysis.coverage_score',
        format: 'score-badge',
      },
      {
        key: 'benchmark_gaps',
        label: 'Your Gap Map',
        agentSource: 'gap-analysis',
        dataPath: 'gapAnalysis.critical_gaps',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Build My Gap Map',
  },
  {
    id: 'c2-l5',
    courseId: 'course-2',
    courseTitle: 'The Super Bowl Story',
    lessonNumber: 5,
    title: 'Your Positioning Statement, Headlines, and 10-Second Intro',
    description: 'The four things you need to have memorized before you talk to anyone.',
    content: `## Four Deliverables That Open Every Door

These four pieces of language are the output of your Super Bowl Story work. Each has a specific job:

**Positioning Statement** — The precise sentence that defines who you are and what problem you solve for employers.

**Resume Headline** — The branded title in your resume header that frames everything below it.

**LinkedIn Headline** — 220 characters that make the right people want to read your profile.

**10-Second Intro** — What you say when someone asks "so what do you do?" at a networking event.

Get these four right and every other piece of your job search gets easier.`,
    slots: [
      {
        key: 'positioning_statement',
        label: 'Your Positioning Statement',
        agentSource: 'positioning',
        dataPath: 'positioning.positioning_statement',
        format: 'text',
      },
      {
        key: 'resume_headline',
        label: 'Your Resume Headline',
        agentSource: 'resume-v2',
        dataPath: 'narrativeStrategy.branded_title',
        format: 'text',
      },
      {
        key: 'why_me_concise',
        label: 'Your 10-Second Intro',
        agentSource: 'positioning',
        dataPath: 'narrative.story_snippet',
        format: 'text',
      },
      {
        key: 'unique_differentiators',
        label: 'What Sets You Apart',
        agentSource: 'resume-v2',
        dataPath: 'narrativeStrategy.unique_differentiators',
        format: 'list',
      },
    ],
    linkedAgent: 'career-profile',
    linkedAgentLabel: 'Finalize My Positioning',
  },
];

// ─── Course 3: Resume Mastery ────────────────────────────────────────────────

const COURSE_3_LESSONS: LessonConfig[] = [
  {
    id: 'c3-l1',
    courseId: 'course-3',
    courseTitle: 'Resume Mastery',
    lessonNumber: 1,
    title: 'The 5-Second Pass/Fail and the 15-Second Score',
    description: 'Two thresholds stand between your resume and a phone screen. Here\'s how yours performs.',
    content: `## Two Readings That Decide Your Fate

Before any human judgment kicks in, your resume passes through two quick filters.

The **5-second pass/fail**: Does this resume look like it belongs in the pile? Visual noise, formatting chaos, or a confusing header triggers an immediate discard — often without conscious thought.

The **15-second score**: If it passes the first filter, the recruiter skims for role relevance, seniority signals, and company-name credibility. This is where keywords and positioning language matter.

**Most executive resumes fail the 15-second score not because the content is weak, but because the right content isn't visible in the right place.**`,
    slots: [
      {
        key: 'six_second_decision',
        label: '5-Second Decision',
        agentSource: 'resume-v2',
        dataPath: 'hiringManagerScan.scan_score',
        format: 'score-badge',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Run My Resume Scan',
  },
  {
    id: 'c3-l2',
    courseId: 'course-3',
    courseTitle: 'Resume Mastery',
    lessonNumber: 2,
    title: 'ATS Compliance — Formatting, Keywords, and Parsing',
    description: 'The technical requirements that determine whether a human ever reads your resume.',
    content: `## The Technical Layer Under Your Resume

ATS compliance isn't about writing differently — it's about structuring your document so the software can read it. Tables, text boxes, headers and footers, and non-standard section names all cause parsing errors that can make your resume invisible.

Beyond formatting, keyword context matters more than keyword frequency. The ATS that serves enterprise companies doesn't just count keywords — it checks whether they appear in meaningful contexts: job titles, scope statements, achievement bullets.

**Your score below reflects both dimensions — formatting and keyword context.**`,
    slots: [
      {
        key: 'ats_score',
        label: 'Your ATS Score',
        agentSource: 'resume-v2',
        dataPath: 'assembly.scores.ats_match',
        format: 'percentage',
      },
      {
        key: 'keywords_found',
        label: 'Keywords Matched',
        agentSource: 'resume-v2',
        dataPath: 'verificationDetail.ats.keywords_found',
        format: 'list',
      },
      {
        key: 'keywords_missing',
        label: 'Keywords Missing',
        agentSource: 'resume-v2',
        dataPath: 'verificationDetail.ats.keywords_missing',
        format: 'list',
      },
      {
        key: 'ats_parsing_issues',
        label: 'Formatting Issues Found',
        agentSource: 'resume-v2',
        dataPath: 'verificationDetail.ats.formatting_issues',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Check ATS Compliance',
  },
  {
    id: 'c3-l3',
    courseId: 'course-3',
    courseTitle: 'Resume Mastery',
    lessonNumber: 3,
    title: 'The Job-Specific Workflow — 8 Steps from JD to Submission',
    description: 'Every application deserves a tailored resume. This is the repeatable process.',
    content: `## The 8-Step Application Workflow

Generic resumes get generic results. The executives who consistently land interviews are the ones who tailor their resume to each role — not by rewriting everything, but by following a disciplined 8-step process that takes less than 90 minutes.

1. Run the JD through the AI to extract benchmark requirements
2. Compare against your master resume
3. Surface the gaps and decide which to address
4. Adjust your summary to match the role's primary concern
5. Reorder your competencies to lead with what matters most
6. Pull the most relevant accomplishments forward
7. Check ATS score against the job's specific language
8. Final gauntlet review before submission

**Your saved job below is ready for this workflow.**`,
    slots: [
      {
        key: 'saved_job',
        label: 'Your Most Recent Saved Opportunity',
        agentSource: 'job-finder',
        dataPath: 'topMatch.title',
        format: 'text',
      },
    ],
    linkedAgent: 'jobs',
    linkedAgentLabel: 'Open Job Command Center',
  },
  {
    id: 'c3-l4',
    courseId: 'course-3',
    courseTitle: 'Resume Mastery',
    lessonNumber: 4,
    title: 'The Gauntlet Review — 4 Things the Hiring Manager Will Question',
    description: 'The adversarial read of your resume. See it before they do.',
    content: `## Reading Your Resume Like a Skeptic

The gauntlet review imagines a hiring manager who has 10 seconds and wants to find a reason not to interview you. They're looking for:

- Scope claims without evidence (managed a "large" team — how large?)
- Impact claims without metrics ("improved efficiency" — by how much?)
- Gaps in the timeline that aren't explained
- Role descriptions that don't match the seniority level claimed

The goal isn't to be defensive about these — it's to see them clearly and decide which to address directly in the resume and which to address in the cover letter or interview.

**Your gauntlet findings are below.**`,
    slots: [
      {
        key: 'gauntlet_top_findings',
        label: 'Top 4 Gauntlet Findings',
        agentSource: 'resume-v2',
        dataPath: 'hiringManagerScan.red_flags',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Run My Gauntlet',
  },
  {
    id: 'c3-l5',
    courseId: 'course-3',
    courseTitle: 'Resume Mastery',
    lessonNumber: 5,
    title: '7 Mistakes Executive Resumes Make',
    description: 'The most common patterns that reduce strong executives to borderline candidates.',
    content: `## The 7 Mistakes That Sink Executive Resumes

After reviewing thousands of executive resumes, these seven patterns appear again and again:

1. **The responsible-for trap** — "Responsible for X" instead of "Delivered X"
2. **The missing scope** — No indication of team size, budget, or geographic reach
3. **The buried lead** — The strongest accomplishment is the 4th bullet, not the 1st
4. **The outdated summary** — Written for the last job, not the next one
5. **The skills section fallacy** — A list of 30 soft skills that adds no information
6. **The reverse-chronology error** — Putting education or certifications before recent experience when seniority is the story
7. **The AI tell** — Phrases that scream "ChatGPT wrote this" to any experienced reader

**Your resume has been checked for these patterns. The findings are below.**`,
    slots: [
      {
        key: 'tone_issues',
        label: 'Patterns Found in Your Resume',
        agentSource: 'resume-v2',
        dataPath: 'verificationDetail.tone.findings',
        format: 'list',
      },
      {
        key: 'banned_phrases',
        label: 'AI Phrases Detected',
        agentSource: 'resume-v2',
        dataPath: 'verificationDetail.tone.banned_phrases_found',
        format: 'list',
      },
      {
        key: 'truth_score',
        label: 'Your Truth Verification Score',
        agentSource: 'resume-v2',
        dataPath: 'assembly.scores.truth',
        format: 'score-badge',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Check My Resume Patterns',
  },
];

// ─── Course 4: LinkedIn Mastery ──────────────────────────────────────────────

const COURSE_4_LESSONS: LessonConfig[] = [
  {
    id: 'c4-l1',
    courseId: 'course-4',
    courseTitle: 'LinkedIn Mastery',
    lessonNumber: 1,
    title: 'How Hiring Managers Search LinkedIn',
    description: 'The Boolean searches that determine whether you show up.',
    content: `## You Are Being Searched Right Now

Senior hiring managers and executive recruiters run Boolean searches on LinkedIn every day. They search by title, function, geography, industry, and specific skills or keywords.

If your profile doesn't contain the right language in the right fields, you simply don't appear in their results — no matter how qualified you are.

**This lesson shows you what searches you should be appearing in, and whether you currently appear in them.**`,
    slots: [
      {
        key: 'linkedin_headline',
        label: 'Your Current LinkedIn Headline',
        agentSource: 'linkedin',
        dataPath: 'profile.headline',
        format: 'text',
      },
    ],
    linkedAgent: 'linkedin',
    linkedAgentLabel: 'Analyze My LinkedIn Profile',
  },
  {
    id: 'c4-l2',
    courseId: 'course-4',
    courseTitle: 'LinkedIn Mastery',
    lessonNumber: 2,
    title: 'The About Section — Your 2,600-Character Positioning Statement',
    description: 'The most underused real estate on LinkedIn. Yours is either working hard or sitting empty.',
    content: `## 2,600 Characters and Most People Write 200

The LinkedIn About section gives you 2,600 characters to tell your story. Most executives write a paragraph that sounds like a job description or leave it blank entirely.

This section should do four things: establish your positioning clearly, name your top three accomplishment areas, signal the problems you solve for employers, and end with a specific invitation (your contact preference for the right opportunities).

**The AI has analyzed what your About section currently says and what it should say instead.**`,
    slots: [
      {
        key: 'linkedin_about_score',
        label: 'Your About Section Strength',
        agentSource: 'linkedin',
        dataPath: 'analysis.about_score',
        format: 'score-badge',
      },
    ],
    linkedAgent: 'linkedin',
    linkedAgentLabel: 'Rewrite My About Section',
  },
  {
    id: 'c4-l3',
    courseId: 'course-4',
    courseTitle: 'LinkedIn Mastery',
    lessonNumber: 3,
    title: 'Content That Reaches Hiring Managers',
    description: 'The 360Brew algorithm rewards depth and expertise. Here\'s how to play it.',
    content: `## LinkedIn Content Isn\'t About Going Viral

Most executives who "do LinkedIn" are playing the wrong game. The goal isn't likes or follower count — it's reaching the right 50 people: hiring managers, board members, and senior recruiters in your target function and industry.

The 360Brew algorithm surfaces content to relevant professionals based on topic DNA consistency and expertise signals. A post that demonstrates genuine insight about a specific operational challenge reaches that audience reliably.

**Your content strategy below is built around your positioning, not generic advice.**`,
    slots: [
      {
        key: 'content_topic_dna',
        label: 'Your Content Topic DNA',
        agentSource: 'linkedin',
        dataPath: 'contentStrategy.topic_dna',
        format: 'list',
      },
    ],
    linkedAgent: 'linkedin',
    linkedAgentLabel: 'Build My Content Strategy',
  },
  {
    id: 'c4-l4',
    courseId: 'course-4',
    courseTitle: 'LinkedIn Mastery',
    lessonNumber: 4,
    title: 'The Network Effect — First Connections as Referral Paths',
    description: 'Your network is more valuable than you think. Here\'s the map.',
    content: `## Every Job Is a Referral Opportunity

Studies consistently show that 70-80% of executive-level jobs are filled through relationships, not applications. Your first-level LinkedIn connections are the bridge to companies you can't reach through cold applications.

The question is: do you know which of your connections work at the companies you're targeting? And have you mapped which ones are senior enough to make a meaningful referral?

**Your network map below shows where your strongest referral paths run.**`,
    slots: [
      {
        key: 'referral_opportunities',
        label: 'First-Connection Referral Opportunities',
        agentSource: 'networking',
        dataPath: 'referral_count',
        format: 'number',
      },
    ],
    linkedAgent: 'networking',
    linkedAgentLabel: 'Map My Network',
  },
  {
    id: 'c4-l5',
    courseId: 'course-4',
    courseTitle: 'LinkedIn Mastery',
    lessonNumber: 5,
    title: 'Engagement That Creates Inbound Opportunities',
    description: 'Comment strategy, connection requests, and the 30-minute weekly routine.',
    content: `## The Compound Interest of Consistent Presence

LinkedIn presence isn't about big moves — it's about consistent small ones. A thoughtful comment on a senior leader's post. A congratulations message that opens a conversation. A connection request with a specific shared context.

Done consistently, these micro-interactions compound into inbound opportunities. Hiring managers start to recognize your name. Recruiters see you as active and engaged. Your career story becomes familiar to the people who need to know it.

**The 30-minute weekly routine below is designed around your specific positioning and target audience.**`,
    slots: [
      {
        key: 'engagement_targets',
        label: 'Your Suggested Engagement Targets',
        agentSource: 'networking',
        dataPath: 'target_companies',
        format: 'list',
      },
    ],
    linkedAgent: 'linkedin',
    linkedAgentLabel: 'Build My Engagement Plan',
  },
];

// ─── Course 5: Job Search Mastery ────────────────────────────────────────────

const COURSE_5_LESSONS: LessonConfig[] = [
  {
    id: 'c5-l1',
    courseId: 'course-5',
    courseTitle: 'Job Search Mastery',
    lessonNumber: 1,
    title: 'Building a Target Company List That Actually Works',
    description: 'Most job searches are too broad. This lesson narrows the focus to where you have the best odds.',
    content: `## The Quality-Over-Quantity Trap

Most job seekers apply to 50+ roles and wonder why nothing happens. Senior-level candidates who apply to 15 precisely targeted roles and follow through with referral outreach consistently outperform the spray-and-pray approach.

Target company selection starts with understanding where your arc is valued — which industries, company stages, and ownership structures need exactly what you offer.

**Your target company list below is built from your positioning, not from a keyword search.**`,
    slots: [
      {
        key: 'top_job_matches',
        label: 'Your Top Job Matches',
        agentSource: 'job-finder',
        dataPath: 'topMatches',
        format: 'list',
      },
    ],
    linkedAgent: 'jobs',
    linkedAgentLabel: 'Open Job Command Center',
  },
  {
    id: 'c5-l2',
    courseId: 'course-5',
    courseTitle: 'Job Search Mastery',
    lessonNumber: 2,
    title: 'The Hidden Job Market — Roles That Never Get Posted',
    description: 'Approximately 70% of executive roles are filled before they\'re advertised. Here\'s how to access them.',
    content: `## The Jobs You Won\'t Find on LinkedIn

For executive roles, the posted job market is the slow lane. Most senior hires happen through search firm relationships, board referrals, direct outreach, and executive networks — all before a requisition is ever opened.

Getting access to the hidden market requires being known, not just being available. It requires your positioning to be visible in the right places, your network to be active enough to trigger referrals, and your reputation to be documented enough to make executive search meaningful.

**This lesson maps the pathways from your current position into the hidden market for your target roles.**`,
    slots: [
      {
        key: 'pipeline_stage_counts',
        label: 'Your Application Pipeline',
        agentSource: 'job-finder',
        dataPath: 'pipeline_stage_counts',
        format: 'text',
      },
    ],
    linkedAgent: 'jobs',
    linkedAgentLabel: 'View My Pipeline',
  },
  {
    id: 'c5-l3',
    courseId: 'course-5',
    courseTitle: 'Job Search Mastery',
    lessonNumber: 3,
    title: 'Reading a Job Description Like a Strategist',
    description: 'What\'s written and what\'s meant are often different. Here\'s how to decode both.',
    content: `## The Job Description Is a Clue, Not a Specification

Every job description is written by someone with constraints — legal, HR, political. What ends up on the page is a compromise between what the business actually needs, what HR thinks they can get, and what legal will approve.

Reading a JD strategically means extracting the underlying problem the company is trying to solve, identifying the three things that will actually matter in the first 90 days, and understanding the political dynamics signaled by how certain requirements are phrased.

**The AI has decoded your target JDs. Here\'s what they\'re really saying.**`,
    slots: [
      {
        key: 'jd_hidden_signals',
        label: 'Hidden Signals in Your Target JD',
        agentSource: 'resume-v2',
        dataPath: 'jobIntelligence.hidden_hiring_signals',
        format: 'list',
      },
      {
        key: 'business_problems',
        label: 'Business Problems This Role Solves',
        agentSource: 'resume-v2',
        dataPath: 'jobIntelligence.business_problems',
        format: 'list',
      },
      {
        key: 'cultural_signals',
        label: 'Cultural Signals in the JD',
        agentSource: 'resume-v2',
        dataPath: 'jobIntelligence.cultural_signals',
        format: 'list',
      },
    ],
    linkedAgent: 'resume',
    linkedAgentLabel: 'Analyze a Job Description',
  },
  {
    id: 'c5-l4',
    courseId: 'course-5',
    courseTitle: 'Job Search Mastery',
    lessonNumber: 4,
    title: 'Managing the Pipeline — Velocity, Timing, and Parallel Tracking',
    description: 'Job search is a pipeline management problem. Here\'s how to optimize the flow.',
    content: `## The Pipeline That Never Gets Stale

The most common mistake in executive job search is sequential thinking: finish with one company before starting with the next. This creates timing mismatches, negotiation disadvantages, and the psychological pressure of having "one shot."

Parallel pipeline management — tracking 8-12 opportunities simultaneously at different stages — creates the conditions for multiple offers, real leverage, and better decision-making.

**Your current pipeline stage distribution is below. Healthy pipelines have 3-4 active opportunities at each stage.**`,
    slots: [
      {
        key: 'active_opportunities',
        label: 'Active Opportunities in Your Pipeline',
        agentSource: 'job-finder',
        dataPath: 'active_count',
        format: 'number',
      },
    ],
    linkedAgent: 'jobs',
    linkedAgentLabel: 'Manage My Pipeline',
  },
  {
    id: 'c5-l5',
    courseId: 'course-5',
    courseTitle: 'Job Search Mastery',
    lessonNumber: 5,
    title: 'The Application-to-Interview Conversion Playbook',
    description: 'Why most applications fail and the five levers that move the odds.',
    content: `## The Conversion Problem

Average executive job application-to-phone-screen conversion rates are 3-5%. Best-in-class executives who follow a deliberate process convert 15-25% of applications into first conversations.

The difference is in five levers:
1. Targeted resume (not generic) aligned to the specific JD
2. Referral or warm introduction to the hiring manager or their team
3. Timing the application early in the posting window
4. Cover letter or LinkedIn message that names the specific business problem
5. Follow-up strategy that signals genuine interest without desperation

**Your conversion rate data is below. We\'ll work on each lever together.**`,
    slots: [
      {
        key: 'conversion_data',
        label: 'Your Application Conversion Data',
        agentSource: 'job-finder',
        dataPath: 'conversion_rate',
        format: 'percentage',
      },
    ],
    linkedAgent: 'jobs',
    linkedAgentLabel: 'Analyze My Applications',
  },
];

// ─── Course 6: Networking Strategy ──────────────────────────────────────────

const COURSE_6_LESSONS: LessonConfig[] = [
  {
    id: 'c6-l1',
    courseId: 'course-6',
    courseTitle: 'Networking Strategy',
    lessonNumber: 1,
    title: 'The Rule of Four — Your Four Most Important Conversations',
    description: 'The compound effect of four sustained relationships in your target market.',
    content: `## Why Four Is the Number

Research on executive job searches shows that having four active, sustained relationships with people inside your target companies or function dramatically increases your odds of a successful search.

Not 40. Not 400. Four: deep, two-way, genuinely helpful relationships where you're known by name and known for something specific.

**The Rule of Four is the foundation of your networking strategy. Your current four are identified below.**`,
    slots: [
      {
        key: 'rule_of_four',
        label: 'Your Current Rule of Four Contacts',
        agentSource: 'networking',
        dataPath: 'rule_of_four',
        format: 'list',
      },
    ],
    linkedAgent: 'networking',
    linkedAgentLabel: 'Build My Rule of Four',
  },
  {
    id: 'c6-l2',
    courseId: 'course-6',
    courseTitle: 'Networking Strategy',
    lessonNumber: 2,
    title: 'Warm Outreach That Actually Gets Responses',
    description: 'The five-sentence message format with a 40%+ response rate.',
    content: `## The Message Nobody Ignores

Most networking messages fail for one of three reasons: too long, too transactional ("I\'d love to pick your brain"), or too cold (no shared context to justify the ask).

The five-sentence format works because it does exactly one thing well: it makes it easy for the recipient to say yes to a single, specific, low-commitment ask.

**Your outreach templates below are personalized to your positioning and the specific people you\'re targeting.**`,
    slots: [
      {
        key: 'outreach_templates',
        label: 'Your Saved Outreach Templates',
        agentSource: 'networking',
        dataPath: 'outreach_drafts',
        format: 'number',
      },
    ],
    linkedAgent: 'networking',
    linkedAgentLabel: 'Draft My Outreach',
  },
  {
    id: 'c6-l3',
    courseId: 'course-6',
    courseTitle: 'Networking Strategy',
    lessonNumber: 3,
    title: 'The Informational Interview — What to Ask and What to Listen For',
    description: 'The 45-minute conversation structure that turns contacts into advocates.',
    content: `## The Conversation That Changes the Search

A well-run informational interview does four things: it establishes you as a serious candidate in their mental model, it reveals intelligence about the role/company that no job description contains, it creates a relationship where they want to advocate for you, and it often surfaces an opportunity before it's posted.

Most executives are too generic in these conversations. The best ones are specific: specific about what they've accomplished, specific about the problem they're trying to solve next, specific in their questions about the company's current challenges.

**Your interview prep materials below include questions tailored to your target companies.**`,
    slots: [
      {
        key: 'target_companies_count',
        label: 'Companies in Your Radar',
        agentSource: 'job-finder',
        dataPath: 'watchlist_count',
        format: 'number',
      },
    ],
    linkedAgent: 'networking',
    linkedAgentLabel: 'Prep My Next Conversation',
  },
  {
    id: 'c6-l4',
    courseId: 'course-6',
    courseTitle: 'Networking Strategy',
    lessonNumber: 4,
    title: 'Board and Executive Search Relationships',
    description: 'How to get on the shortlist of firms that fill 70% of executive roles.',
    content: `## The Executive Search Ecosystem

For roles above $250K, executive search firms are the primary channel. Most executives don't know how to get on their radar — or they try at the wrong time (when they need a job, instead of when they're employed and successful).

The right approach: build relationships with 3-5 firms before you need them, be visible enough that they think of you for unadvertised searches, and be the person who helps them do their job better by making strong referrals.

**Your positioning document below is designed to be sent to executive search firms.**`,
    slots: [
      {
        key: 'positioning_statement',
        label: 'Your Positioning for Search Firms',
        agentSource: 'positioning',
        dataPath: 'positioning.positioning_statement',
        format: 'text',
      },
      {
        key: 'differentiators',
        label: 'Your Differentiators',
        agentSource: 'positioning',
        dataPath: 'positioning.differentiators',
        format: 'list',
      },
    ],
    linkedAgent: 'career-profile',
    linkedAgentLabel: 'Prepare My Search Firm Package',
  },
  {
    id: 'c6-l5',
    courseId: 'course-6',
    courseTitle: 'Networking Strategy',
    lessonNumber: 5,
    title: 'Maintaining Relationships Through the Transition',
    description: 'The weekly routine that keeps your network warm without feeling transactional.',
    content: `## Relationships Don\'t Maintain Themselves

The biggest mistake executives make is treating networking as a job-search activity rather than a career-long practice. Relationships go cold when the only communication is "I need something."

The weekly networking routine — 30 minutes, five specific touchpoints — keeps relationships warm without feeling like work. It's designed around your natural communication style and the specific relationships that matter most for your search.

**Your weekly touchpoint schedule is below.**`,
    slots: [
      {
        key: 'networking_activity',
        label: 'Your Networking Activity This Week',
        agentSource: 'networking',
        dataPath: 'recent_activity_count',
        format: 'number',
      },
    ],
    linkedAgent: 'networking',
    linkedAgentLabel: 'View My Networking Activity',
  },
];

// ─── Course 7: Interview Excellence ─────────────────────────────────────────

const COURSE_7_LESSONS: LessonConfig[] = [
  {
    id: 'c7-l1',
    courseId: 'course-7',
    courseTitle: 'Interview Excellence',
    lessonNumber: 1,
    title: 'The Hiring Manager\'s Actual Decision Framework',
    description: 'What\'s really being evaluated in the first 20 minutes — it\'s not your qualifications.',
    content: `## The Interview Is Not a Competency Assessment

The first 20 minutes of an executive interview are not spent evaluating your qualifications. The hiring manager already believes you can do the job — otherwise they wouldn't have invited you. They're evaluating three things:

1. **Pattern recognition** — Does this person think like we do? Do they see problems the way we see them?
2. **Confidence calibration** — Is this person confident without being arrogant? Humble without being passive?
3. **Chemistry fit** — Would I want to work through a hard problem with this person?

Your qualifications get you in the door. These three things get you the offer.

**Your positioning prep below is built around demonstrating all three.**`,
    slots: [
      {
        key: 'interview_prep_status',
        label: 'Your Interview Prep Status',
        agentSource: 'interview-prep',
        dataPath: 'prep_completeness',
        format: 'score-badge',
      },
      {
        key: 'interview_talking_points',
        label: 'Your Key Talking Points',
        agentSource: 'resume-v2',
        dataPath: 'narrativeStrategy.interview_talking_points',
        format: 'list',
      },
    ],
    linkedAgent: 'interview',
    linkedAgentLabel: 'Start Interview Prep',
  },
  {
    id: 'c7-l2',
    courseId: 'course-7',
    courseTitle: 'Interview Excellence',
    lessonNumber: 2,
    title: 'Building STAR Stories That Win Offers',
    description: 'The structure that turns your experiences into compelling evidence.',
    content: `## Why Most Executive Answers Don\'t Land

Experienced executives often give the worst interview answers. They've been in so many conversations that they answer questions automatically — summarizing, abstracting, giving conclusions without the evidence that makes them credible.

The STAR format (Situation, Task, Action, Result) forces specificity. Not because interviewers need every detail, but because the specific details are what create credibility and memorability. The "what" isn't interesting. The "how I decided to do it that way" is.

**Your trophy library below contains the raw material for your best STAR stories.**`,
    slots: [
      {
        key: 'star_stories',
        label: 'Your STAR Story Bank',
        agentSource: 'interview-prep',
        dataPath: 'prepared_stories',
        format: 'number',
      },
    ],
    linkedAgent: 'interview',
    linkedAgentLabel: 'Build My Story Bank',
  },
  {
    id: 'c7-l3',
    courseId: 'course-7',
    courseTitle: 'Interview Excellence',
    lessonNumber: 3,
    title: 'The Company Research Deep Dive',
    description: 'The intelligence a hiring manager expects you to have — and the intelligence that will surprise them.',
    content: `## Three Levels of Company Research

**Level 1** (what everyone does): Website, about page, recent news, LinkedIn.

**Level 2** (what good candidates do): 10-K or investor relations, glassdoor, leadership team backgrounds, competitive landscape.

**Level 3** (what exceptional candidates do): Primary research — talking to customers, recent employees, or industry contacts. Understanding the political dynamics of the specific team. Knowing the business problem they're trying to solve right now, not just the role description.

Level 3 research turns a good interview into an unforgettable one.

**Your company research below is ready for the interview.**`,
    slots: [
      {
        key: 'company_research',
        label: 'Company Intelligence Available',
        agentSource: 'interview-prep',
        dataPath: 'company_research.company_name',
        format: 'text',
      },
    ],
    linkedAgent: 'interview',
    linkedAgentLabel: 'Research My Target Company',
  },
  {
    id: 'c7-l4',
    courseId: 'course-7',
    courseTitle: 'Interview Excellence',
    lessonNumber: 4,
    title: 'Salary Negotiation — The Four Moves That Add $30K',
    description: 'When to negotiate, what to say, and the four tactics that consistently improve outcomes.',
    content: `## Negotiation Is Expected

Hiring managers expect executives to negotiate. A candidate who accepts the first offer leaves money on the table and signals lower market awareness — neither of which is the impression you want to make entering a new role.

The four moves that consistently work:
1. Don't name a number first — ask about the total compensation range
2. Express genuine enthusiasm before discussing specifics
3. Use competing offers or current market data, not personal financial needs
4. Negotiate the total package, not just base salary

**Your negotiation strategy below is built around your specific situation.**`,
    slots: [
      {
        key: 'negotiation_research',
        label: 'Your Market Compensation Data',
        agentSource: 'interview-prep',
        dataPath: 'salary_research.market_range',
        format: 'text',
      },
    ],
    linkedAgent: 'interview',
    linkedAgentLabel: 'Prepare My Negotiation Strategy',
  },
  {
    id: 'c7-l5',
    courseId: 'course-7',
    courseTitle: 'Interview Excellence',
    lessonNumber: 5,
    title: 'The Follow-Up That Keeps You First',
    description: 'What to do in the 24 hours after an interview to stay top of mind.',
    content: `## The Interview Continues After You Leave the Room

Most candidates treat the thank-you note as a formality. The candidates who get offers treat it as the third act of the interview.

An effective post-interview follow-up does three things: reinforces your top answer (or recovers from a weak one), demonstrates that you listened (reference something specific from the conversation), and gives them a new reason to think about you beyond what you discussed.

The 24 hours after an interview are when you can still influence the decision. Don't waste them on a generic "Thanks for your time."

**Your follow-up template below is personalized to your recent interview.**`,
    slots: [
      {
        key: 'recent_interview_company',
        label: 'Your Most Recent Interview',
        agentSource: 'interview-prep',
        dataPath: 'recent_session.company',
        format: 'text',
      },
    ],
    linkedAgent: 'interview',
    linkedAgentLabel: 'Draft My Follow-Up',
  },
];

// ─── Course 8: Financial Resilience ─────────────────────────────────────────

const COURSE_8_LESSONS: LessonConfig[] = [
  {
    id: 'c8-l1',
    courseId: 'course-8',
    courseTitle: 'Financial Resilience',
    lessonNumber: 1,
    title: 'Your Retirement Bridge — Protecting the Long Term During Transition',
    description: 'What displaced executives need to know about their 401(k), benefits, and runway.',
    content: `## The Financial Reality of Executive Transition

Most executive transitions take 3-9 months. Most executives are financially prepared for 3. This mismatch is the most common source of poor decisions during a job search: accepting the wrong offer, failing to negotiate properly, making decisions from scarcity rather than strategy.

Understanding your actual runway — not your estimated runway — and making proactive decisions about healthcare, retirement contributions, and COBRA before the urgency sets in gives you the strategic advantage you need.

**Your retirement readiness score is below.**`,
    slots: [
      {
        key: 'retirement_readiness',
        label: 'Your Retirement Readiness Score',
        agentSource: 'positioning',
        dataPath: 'coaching.urgency_score',
        format: 'score-badge',
      },
    ],
    linkedAgent: 'financial',
    linkedAgentLabel: 'Run My Retirement Assessment',
  },
  {
    id: 'c8-l2',
    courseId: 'course-8',
    courseTitle: 'Financial Resilience',
    lessonNumber: 2,
    title: 'COBRA vs. ACA Marketplace — The Real Numbers',
    description: 'The decision most displaced executives get wrong, and what it costs them.',
    content: `## Healthcare Is the Most Expensive Transition Decision

COBRA lets you keep your existing coverage. The ACA Marketplace may give you significantly better coverage for less. But the comparison isn't straightforward — it depends on your income, family situation, and how long you expect the transition to take.

Most executives assume COBRA is the safe choice and pay 2-3x what they need to. Some who should use COBRA end up underinsured through the marketplace and face large out-of-pocket costs.

This lesson walks through the actual decision framework and shows you which option makes sense for your situation.`,
    slots: [
      {
        key: 'financial_segment',
        label: 'Your Financial Situation Profile',
        agentSource: 'positioning',
        dataPath: 'coaching.financial_segment',
        format: 'text',
      },
    ],
    linkedAgent: 'financial',
    linkedAgentLabel: 'Run My Financial Assessment',
  },
  {
    id: 'c8-l3',
    courseId: 'course-8',
    courseTitle: 'Financial Resilience',
    lessonNumber: 3,
    title: 'The 401(k) Decision — When to Touch It and When Not To',
    description: 'The four decision scenarios and the framework for thinking through each one.',
    content: `## The $1.1 Trillion Mistake

Americans make $1.1 trillion in early 401(k) withdrawals annually, often during job transitions. The 10% penalty plus ordinary income tax can cost $30-50K on a $100K withdrawal — and permanently reduces the compounding base.

But sometimes, touching retirement assets is the right decision. The framework is: only when the alternative is high-interest debt, only when you've exhausted every other option, and only the minimum required.

This lesson walks through the four scenarios where it makes sense — and the six where it doesn't.`,
    slots: [],
    linkedAgent: 'financial',
    linkedAgentLabel: 'Connect With a Fiduciary Planner',
  },
  {
    id: 'c8-l4',
    courseId: 'course-8',
    courseTitle: 'Financial Resilience',
    lessonNumber: 4,
    title: 'Compensation Negotiation for the Total Package',
    description: 'Base salary is only part of the number. The rest is where the real leverage is.',
    content: `## The Number Is Bigger Than the Salary

For executive roles, base salary typically represents 40-60% of total compensation. The rest — equity, bonus structure, benefits, severance terms, non-compete scope — often has more long-term value and more negotiating room.

Most candidates optimize for base salary and leave the rest on the table. The most important pieces to negotiate:

- **Severance** — Executive-level severance at 6-12 months minimum is standard; get it in writing before you start
- **Equity vesting** — Cliff period, acceleration on change of control, refresh grants
- **Bonus structure** — Target vs. maximum, discretionary vs. formula-based

**Your compensation benchmarks by role and industry are below.**`,
    slots: [
      {
        key: 'compensation_benchmark',
        label: 'Your Compensation Benchmark',
        agentSource: 'interview-prep',
        dataPath: 'salary_research.market_range',
        format: 'text',
      },
    ],
    linkedAgent: 'interview',
    linkedAgentLabel: 'Run My Salary Research',
  },
  {
    id: 'c8-l5',
    courseId: 'course-8',
    courseTitle: 'Financial Resilience',
    lessonNumber: 5,
    title: 'Planning the Next 90 Days of Your Search',
    description: 'The financial and strategic plan that keeps your search focused and your options open.',
    content: `## The 90-Day Plan That Reduces Anxiety

Most job search anxiety comes from uncertainty about time: how long will this take, and will the money last? The 90-day plan addresses both by making the timeline concrete and the financial picture explicit.

The plan has three components:
1. **Financial baseline** — Exact monthly burn rate, runway in months, decision points
2. **Activity targets** — Weekly outreach goals, application targets, networking touchpoints
3. **Decision gates** — At what point do you expand your target criteria? At what point do you consider consulting or bridge roles?

**Clarity about the plan reduces the anxiety that causes poor decisions.**`,
    slots: [
      {
        key: 'urgency_score',
        label: 'Your Search Urgency Score',
        agentSource: 'positioning',
        dataPath: 'coaching.urgency_score',
        format: 'number',
      },
    ],
    linkedAgent: 'financial',
    linkedAgentLabel: 'Build My 90-Day Plan',
  },
];

// ─── Course Configs ──────────────────────────────────────────────────────────

export const COURSE_CONFIGS: CourseConfig[] = [
  {
    id: 'course-1',
    title: 'Understanding the System',
    description: 'How hiring decisions are actually made — and what it means for your search.',
    lessonCount: 5,
    category: 'foundation',
    lessons: COURSE_1_LESSONS,
  },
  {
    id: 'course-2',
    title: 'The Super Bowl Story',
    description: 'Building your positioning, trophies, and the four things you need memorized.',
    lessonCount: 5,
    category: 'foundation',
    lessons: COURSE_2_LESSONS,
  },
  {
    id: 'course-3',
    title: 'Resume Mastery',
    description: 'The technical and strategic craft of building a resume that opens doors.',
    lessonCount: 5,
    category: 'resume',
    lessons: COURSE_3_LESSONS,
  },
  {
    id: 'course-4',
    title: 'LinkedIn Mastery',
    description: 'Profile, content, and engagement strategy for executive-level visibility.',
    lessonCount: 5,
    category: 'linkedin',
    lessons: COURSE_4_LESSONS,
  },
  {
    id: 'course-5',
    title: 'Job Search Mastery',
    description: 'Target company selection, pipeline management, and application-to-interview conversion.',
    lessonCount: 5,
    category: 'job-search',
    lessons: COURSE_5_LESSONS,
  },
  {
    id: 'course-6',
    title: 'Networking Strategy',
    description: 'The Rule of Four, warm outreach, and relationships that generate inbound opportunities.',
    lessonCount: 5,
    category: 'networking',
    lessons: COURSE_6_LESSONS,
  },
  {
    id: 'course-7',
    title: 'Interview Excellence',
    description: 'STAR stories, company research, and the post-interview follow-up that keeps you first.',
    lessonCount: 5,
    category: 'interview',
    lessons: COURSE_7_LESSONS,
  },
  {
    id: 'course-8',
    title: 'Financial Resilience',
    description: 'Retirement bridge, healthcare decisions, and the 90-day search plan.',
    lessonCount: 5,
    category: 'financial',
    lessons: COURSE_8_LESSONS,
  },
];

export const LESSON_MAP: Map<string, LessonConfig> = new Map(
  COURSE_CONFIGS.flatMap((course) => course.lessons.map((lesson) => [lesson.id, lesson])),
);
