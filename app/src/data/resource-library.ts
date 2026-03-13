/**
 * Resource Library — static content structure for the EI Layer resource library.
 *
 * Sprint EI1, Story EI1-3.
 * Categories drawn from coaching methodology: 8 topic areas covering the full
 * executive career transition journey.
 *
 * Each resource has a content_type: 'article' | 'checklist' | 'worksheet'.
 * The icon_name field maps to a lucide-react icon in the ResourceLibrary component.
 */

export type ResourceCategory =
  | 'Resume & Positioning'
  | 'Interview Mastery'
  | 'Networking'
  | 'LinkedIn'
  | 'Job Search Strategy'
  | 'Salary Negotiation'
  | 'Emotional Wellness'
  | 'Career Transition';

export type ContentType = 'article' | 'checklist' | 'worksheet';

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  content_type: ContentType;
  read_time: string;
  /** Maps to a lucide-react icon name in the rendering component */
  icon_name: string;
  content: string;
}

export const RESOURCE_LIBRARY: Resource[] = [
  // ─── Resume & Positioning ─────────────────────────────────────────────────
  {
    id: 'rp-1',
    title: 'The 1% Problem: Why Your Resume Misrepresents You',
    description: "Most executives' resumes capture only 1% of their professional experience. Learn how to identify the hidden 99% through structured self-reflection.",
    category: 'Resume & Positioning',
    content_type: 'article',
    read_time: '5 min',
    icon_name: 'FileText',
    content: "Your resume is not a career autobiography — it's a positioning document. The problem is that most executives write it as the former and wonder why it performs like the latter. For every role you've held, there are dozens of outcomes, decisions, relationships, and results that never made it to paper. This guide walks through a structured self-audit to surface the 99% you haven't written down yet.",
  },
  {
    id: 'rp-2',
    title: 'Building Your Benchmark Candidate Profile',
    description: "For every role you target, there's an ideal candidate profile. Learn how to reverse-engineer it and position yourself as that benchmark — the standard everyone else is measured against.",
    category: 'Resume & Positioning',
    content_type: 'article',
    read_time: '7 min',
    icon_name: 'Star',
    content: "Every job posting is a description of a problem the company needs solved. The benchmark candidate is the person who makes the hiring manager say 'this is exactly who we were imagining.' This guide teaches you to read between the lines of any job description to construct that benchmark profile — and then map your own experience to it point by point.",
  },
  {
    id: 'rp-3',
    title: 'Age as an Asset: Positioning Experience Correctly',
    description: "Traditional advice says hide your age. Better advice: position your 20+ years as exactly what makes you the benchmark candidate. Here's how to make experience work for you.",
    category: 'Resume & Positioning',
    content_type: 'article',
    read_time: '6 min',
    icon_name: 'Lightbulb',
    content: "The conventional wisdom — hide graduation years, limit your resume to 10 years, avoid dates — treats experience as a liability. It isn't. For the right roles, 20 years of domain expertise is the exact qualification they're looking for. The key is framing: lead with impact and currency, not tenure. This guide shows you the specific language patterns that position your depth as a competitive advantage.",
  },
  {
    id: 'rp-4',
    title: 'Resume Positioning Checklist',
    description: "12 criteria for evaluating whether your resume positions you as a benchmark candidate or just another applicant.",
    category: 'Resume & Positioning',
    content_type: 'checklist',
    read_time: '3 min',
    icon_name: 'CheckSquare',
    content: "Use this checklist before submitting any resume: (1) Does your headline describe your value, not your title? (2) Does your summary lead with the problem you solve, not your career history? (3) Are your bullets outcome-first? (4) Do you quantify scope (team size, budget, revenue) in every major role? (5) Is your most recent role your most detailed? (6) Have you removed all generic filler phrases? (7) Is the reading level executive? (8) Does every bullet pass the 'so what' test? (9) Is the formatting ATS-safe? (10) Does the document fit 2 pages maximum? (11) Is your contact information current? (12) Have you tailored the positioning to this specific role?",
  },

  // ─── Interview Mastery ────────────────────────────────────────────────────
  {
    id: 'im-1',
    title: 'The STAR Method for Executives: Upgrading Your Stories',
    description: "Basic STAR (Situation, Task, Action, Result) is a floor, not a ceiling. Discover how executives elevate their interview stories to demonstrate strategic thinking and leadership scale.",
    category: 'Interview Mastery',
    content_type: 'article',
    read_time: '6 min',
    icon_name: 'Mic',
    content: "STAR gives you structure. What it doesn't give you is impact. Executive interviews expect you to go beyond 'I did X and Y happened' to 'I made this decision in this context, here's how I built the coalition to execute it, here's what I learned, and here's how I'd approach it differently today.' This guide walks through the upgrade: from STAR to STAR-L (with explicit Leadership context) and the questions that separate VP candidates from director candidates.",
  },
  {
    id: 'im-2',
    title: 'Interview Preparation Worksheet',
    description: "Structured prep for any executive interview: 5 key stories, 3 probing questions to research, and your 'Why This Company' narrative.",
    category: 'Interview Mastery',
    content_type: 'worksheet',
    read_time: '10 min',
    icon_name: 'ClipboardList',
    content: "Complete this worksheet before every interview: Section 1 — Your 5 Core Stories (achievement story, failure/lesson story, leadership story, change management story, vision story). Section 2 — Company Research (what problem is this team solving, what does success look like at 6/12/24 months, who's in the room and what do they care about). Section 3 — Your 'Why This Company' narrative (connect your experience to their specific challenge). Section 4 — Questions you will ask (3 minimum, focused on the work not the logistics).",
  },
  {
    id: 'im-3',
    title: 'Handling Difficult Questions: Age, Gaps, and Transitions',
    description: "Direct, confident answers to the questions executives dread most — without being defensive or over-explaining.",
    category: 'Interview Mastery',
    content_type: 'article',
    read_time: '8 min',
    icon_name: 'Shield',
    content: "The questions you dread aren't tricks — they're opportunities if you have prepared answers. 'Why did you leave?' Answer: what you learned and what you're optimizing for next, not what went wrong. 'There's a gap in your resume' Answer: what you did during that time (even if it was reflection and recalibration) and why you're re-entering stronger. 'You're overqualified' Answer: redirect to fit, enthusiasm, and the specific problem you want to solve. Each of these has a confident, direct answer. This guide gives you the scripts.",
  },

  // ─── Networking ───────────────────────────────────────────────────────────
  {
    id: 'nw-1',
    title: 'The Warm Outreach Framework: 70% of Jobs Are Never Posted',
    description: "How to activate your network without feeling transactional, begging for favors, or sending mass requests.",
    category: 'Networking',
    content_type: 'article',
    read_time: '7 min',
    icon_name: 'Users',
    content: "Most jobs at the executive level are filled before they're posted. They go to people the hiring manager already knows or to referrals from trusted contacts. The warm outreach framework starts with genuine connection rather than requests: (1) Reconnect without an ask — check in on projects, comment on their work. (2) Offer value before asking — share an article, make an introduction. (3) Ask for a 20-minute conversation, not 'any openings.' (4) Follow up once, gracefully, if no response. This approach converts 40% of conversations into actual opportunities.",
  },
  {
    id: 'nw-2',
    title: 'Building a Target Company List That Actually Works',
    description: "Most executives target too many companies randomly. Learn the 4-criteria framework for building a focused list of 20-30 companies where you genuinely have a fit advantage.",
    category: 'Networking',
    content_type: 'worksheet',
    read_time: '8 min',
    icon_name: 'Target',
    content: "Your target list should be specific enough that you can name the right person to contact at each company. Use these 4 criteria: (1) Stage fit — are you a builder, scaler, or optimizer? Match to companies in the corresponding growth phase. (2) Domain fit — where does your specific sector expertise create unfair advantage? (3) Culture fit — based on your working style and values, not their website. (4) Mutual need — are they actively solving the problem you're best at? 20-30 companies that meet all 4 criteria is better than 200 companies you're spraying applications at.",
  },

  // ─── LinkedIn ──────────────────────────────────────────────────────────────
  {
    id: 'li-1',
    title: 'Your LinkedIn Headline Is Your Most Valuable Real Estate',
    description: "It appears in search results, connection requests, and every comment you leave. Replace your job title with your Why-Me statement — and watch engagement change.",
    category: 'LinkedIn',
    content_type: 'article',
    read_time: '4 min',
    icon_name: 'Linkedin',
    content: "When a recruiter searches LinkedIn for someone like you, the first thing they see is your name and your headline. Not your summary. Not your experience. Your 220-character headline. 'VP of Operations at Company X' tells them your old job title. 'I turn around underperforming supply chains | $500M+ cost reductions across 6 industries' tells them what you actually do and why they should click. This guide shows you the formula and gives you 5 examples from executives who rewrote their headlines and saw immediate results.",
  },
  {
    id: 'li-2',
    title: 'LinkedIn Content Strategy for Job Seekers',
    description: "What to post, how often, and why consistent visibility in your target community matters more than viral reach.",
    category: 'LinkedIn',
    content_type: 'article',
    read_time: '6 min',
    icon_name: 'PenSquare',
    content: "You don't need 10,000 followers. You need the right 200 people to see your expertise consistently. Executive LinkedIn content works when it's: specific (about your domain, not generic leadership tips), opinionated (a perspective, not a summary), and consistent (3x per week minimum for 90 days before expecting results). The algorithm rewards frequency over quality up to a point. Post short-form observations, share your take on industry news, and occasionally publish longer essays. The goal isn't likes — it's showing up in searches and inboxes of the right hiring managers.",
  },

  // ─── Job Search Strategy ──────────────────────────────────────────────────
  {
    id: 'js-1',
    title: 'Hidden Job Boards: Where 80% Don\'t Look',
    description: "Google Job Board aggregates every job site, LinkedIn hidden postings get 1/100th the applicants, and Facebook Groups connect you to local hiring managers. Here's how to use them.",
    category: 'Job Search Strategy',
    content_type: 'article',
    read_time: '4 min',
    icon_name: 'Search',
    content: "The most competitive job applications are on Indeed and LinkedIn's main feed — because that's where everyone applies. The less competitive channels: Google for Jobs (aggregates everything), LinkedIn jobs sorted by date posted (< 24 hours gets you first), Slack communities for your industry, private Facebook Groups for local executives, and directly on company career pages 2-3 weeks before the role hits the boards. Each of these channels has 10x less competition for the same roles.",
  },
  {
    id: 'js-2',
    title: 'The Multi-Channel Application Protocol',
    description: "Apply where found, apply on the company site, find the hiring manager on LinkedIn, connect with a personalized message. Four steps that quadruple your response rate.",
    category: 'Job Search Strategy',
    content_type: 'checklist',
    read_time: '3 min',
    icon_name: 'ListChecks',
    content: "For every job you apply to, do all four: (1) Apply where you found it AND directly on the company website. Two data points in their system is better than one. (2) Identify the hiring manager (usually the role's direct supervisor) on LinkedIn. (3) Send a personalized connection request: 'I just applied for the [Role] position and wanted to connect directly. I've [specific relevant experience] and would love to learn more about the team.' (4) Follow up once 7 days after applying if no response. This four-step protocol takes 15 extra minutes per application and produces 4x the interview rate.",
  },

  // ─── Salary Negotiation ───────────────────────────────────────────────────
  {
    id: 'sn-1',
    title: 'Salary Negotiation: Never Give a Number First',
    description: "Anchor around value delivery, not salary history. Total compensation matters more than base. Practice the uncomfortable silence. Three techniques that change the conversation.",
    category: 'Salary Negotiation',
    content_type: 'article',
    read_time: '5 min',
    icon_name: 'DollarSign',
    content: "The person who gives a number first loses negotiating leverage. When asked for your salary expectations, deflect with: 'I'm more interested in making sure this is the right fit — could you share the range budgeted for this role?' When they give a range, anchor to the top and ask what would be required to reach it. When they make an offer, the single most powerful negotiating move is to pause, say 'thank you,' and then ask for 48 hours to review. More offers are improved in that window than at any other point in the conversation.",
  },
  {
    id: 'sn-2',
    title: 'Total Compensation Worksheet',
    description: "Calculate the real value of any offer: base, bonus, equity, benefits, flexibility, and hidden perks that add up to 30% of stated salary.",
    category: 'Salary Negotiation',
    content_type: 'worksheet',
    read_time: '6 min',
    icon_name: 'Calculator',
    content: "Before you compare offers, calculate total compensation: Base salary + Annual bonus (% x base) + Equity value (shares x current/projected price / vesting years) + 401k match (max × match rate) + Health insurance value (compare to individual market rate) + PTO value (days × daily rate) + Remote work value (commute cost savings × 48 weeks) + Professional development budget + Signing bonus. Most executives undervalue their total comp by 20-30% because they only look at base. This worksheet makes the full picture visible so you can negotiate across all dimensions.",
  },

  // ─── Emotional Wellness ───────────────────────────────────────────────────
  {
    id: 'ew-1',
    title: 'The Five Emotional Phases of Career Transition',
    description: "From shock to acceptance: understanding the emotional arc of job loss and career change. Practical strategies for each phase based on 19 years of executive coaching.",
    category: 'Emotional Wellness',
    content_type: 'article',
    read_time: '6 min',
    icon_name: 'Heart',
    content: "Career transitions follow a predictable emotional arc: Shock (disbelief, numbness), Anger (blame, frustration), Bargaining (what if, if only), Depression (withdrawal, loss of identity), and Acceptance (clarity, forward motion). Most executives get stuck in bargaining or depression for months because they're treating it as a job search problem instead of an emotional transition. Understanding which phase you're in changes your strategy: in shock, stabilize; in anger, channel; in bargaining, get data; in depression, activate support systems; in acceptance, execute. This guide maps the phases and what works in each one.",
  },
  {
    id: 'ew-2',
    title: 'Building Resilience During the Search',
    description: "Evidence-based practices for maintaining energy, perspective, and forward momentum when the search extends longer than expected.",
    category: 'Emotional Wellness',
    content_type: 'article',
    read_time: '5 min',
    icon_name: 'Zap',
    content: "Long searches erode confidence not because you're unqualified but because rejection is cumulative. The three highest-leverage resilience practices: (1) Structure your day as if you're employed — start times, end times, lunch. Formlessness feeds depression. (2) Measure activity, not outcomes. You control applications sent and conversations initiated; you don't control response rates. Track what you control. (3) Maintain one non-job-search project — volunteer work, a course, a creative project. Identity stability outside the search prevents the spiral of 'the search is all I am.'",
  },

  // ─── Career Transition ────────────────────────────────────────────────────
  {
    id: 'ct-1',
    title: 'Navigating an Industry Pivot as a Senior Executive',
    description: "How to reframe 20 years of domain expertise as transferable — without starting over or accepting a step down.",
    category: 'Career Transition',
    content_type: 'article',
    read_time: '8 min',
    icon_name: 'Compass',
    content: "The fear of pivoting is that you'll have to start over. The reality is that senior executives who pivot correctly leverage their entire career as context for the new domain — they're not starting over, they're bringing outside perspective that insiders don't have. The pivot framework: (1) Identify skills that transfer regardless of industry (P&L management, team building, customer development, operational excellence). (2) Find the bridges — industries that share structural problems with your domain. (3) Target companies that are actively trying to import expertise from adjacent sectors. (4) Build your narrative as 'what I learned in X that will be 10x more valuable in Y.'",
  },
  {
    id: 'ct-2',
    title: 'The First 90 Days: Setting Up for Success Before Day One',
    description: "What to do before you start your new role to ensure the first 90 days position you as the decisive, effective leader they hired.",
    category: 'Career Transition',
    content_type: 'article',
    read_time: '7 min',
    icon_name: 'Calendar',
    content: "The 90-day plan starts before you walk in the door. In the weeks before your start date: (1) Request organizational charts, strategy documents, and the last board deck if possible. (2) Arrange informal coffee meetings with 3-5 stakeholders before day one — learn their agendas before you're officially on record. (3) Identify your quick wins — what can you do in week one that signals you understand the business? (4) Define what 'good' looks like at 30, 60, and 90 days, and confirm alignment with your manager before you start. The executives who struggle in the first 90 days almost always skipped this pre-work.",
  },
];

/** All unique categories in the library, in canonical order. */
export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'Resume & Positioning',
  'Interview Mastery',
  'Networking',
  'LinkedIn',
  'Job Search Strategy',
  'Salary Negotiation',
  'Emotional Wellness',
  'Career Transition',
];
