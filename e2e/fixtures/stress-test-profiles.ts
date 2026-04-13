/**
 * Stress test profiles for the resume pipeline gap analysis engine.
 * 15 mid-to-senior executive profiles (45+, 15-25 years experience).
 * Each candidate is 70-85% qualified for the target role — genuine gaps included.
 * Company names, metrics, and contact details are entirely fictional.
 */

export interface StressTestProfile {
  id: string;
  label: string;
  resumeText: string;
  jobDescription: string;
}

export const STRESS_TEST_PROFILES: StressTestProfile[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. VP Operations → COO (Manufacturing)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-ops-to-coo',
    label: 'VP Ops → COO',
    resumeText: `DAVID HARRINGTON
Vice President of Operations
Cincinnati, OH | d.harrington@gmail.com | (513) 555-0214 | linkedin.com/in/davidharrington

PROFESSIONAL SUMMARY
Operations executive with 20 years of experience leading manufacturing and supply chain functions in mid-size industrial companies. Deep expertise in Lean Manufacturing, Six Sigma, and continuous improvement initiatives that have delivered measurable cost reductions and quality gains. Proven ability to build and develop high-performing ops teams, standardize processes across facilities, and drive operational discipline in complex production environments. Known for translating shop-floor insight into executive-level strategy.

EXPERIENCE

Vice President of Operations | Meridian Industrial Group | Cincinnati, OH | 2017 – Present
- Lead end-to-end operations for three manufacturing facilities employing 1,100 people and producing precision-machined components for the HVAC and commercial refrigeration sectors
- Directed Lean transformation program across all sites, eliminating $18M in annualized waste over four years through value stream mapping, 5S standardization, and kaizen event cycles
- Reduced manufacturing defect rate from 4.2% to 0.9% through Six Sigma DMAIC projects; certified internal Black Belt cohort of 11 engineers
- Oversaw $47M capital expenditure program to modernize CNC machining capacity, delivering 22% throughput improvement ahead of schedule and $2.1M under budget
- Managed relationships with 40+ Tier 1 and Tier 2 suppliers, negotiating $6M in annual cost reductions while improving on-time delivery from 81% to 96%
- Collaborated with VP Finance on annual operating budget of $210M; accountable for cost-per-unit targets but not ultimate P&L sign-off
- Built and mentored a team of 7 direct reports including plant managers, quality director, and logistics manager

Director of Manufacturing Operations | Fortis Components LLC | Dayton, OH | 2011 – 2017
- Managed daily operations across two stamping and assembly plants with combined workforce of 620
- Launched TPM (Total Productive Maintenance) program, increasing Overall Equipment Effectiveness from 67% to 84%
- Redesigned production scheduling system, reducing WIP inventory by 31% and freeing $4.8M in working capital
- Led ISO 9001:2015 recertification effort and introduced statistical process control on 14 critical product lines
- Partnered with Sales to develop make-to-order capacity model that reduced customer lead time from 18 to 11 days

Operations Manager | TriState Fabricators | Columbus, OH | 2007 – 2011
- Supervised 240-person workforce across fabrication, welding, and finishing departments
- Implemented pull scheduling that cut finished-goods inventory by 24%
- Coordinated facility expansion project adding 40,000 sq ft of production space on time and on budget

Manufacturing Engineer | TriState Fabricators | Columbus, OH | 2004 – 2007
- Designed tooling and fixtures for new product lines; conducted time studies and labor standards development
- Supported plant manager in shift supervisory role during startup of third production shift

EDUCATION
B.S. Mechanical Engineering | University of Cincinnati | 2004

CERTIFICATIONS
- Lean Six Sigma Master Black Belt — Villanova University, 2013
- Certified in Production and Inventory Management (CPIM) — APICS, 2009

BOARD & COMMUNITY
- Advisory Board Member, Cincinnati Manufacturing Consortium, 2020 – Present
- Volunteer mentor, Cincinnati State Technical and Community College co-op program`,

    jobDescription: `Chief Operating Officer — Coventry Industrial Holdings
Cincinnati, OH | Full-Time | $375,000–$450,000 base + equity + bonus

About Coventry Industrial Holdings
Coventry is a private equity-backed industrial manufacturer with revenues of $480M across four operating divisions — precision machined components, specialty coatings, engineered plastics, and contract assembly. Our PE sponsor acquired Coventry 18 months ago and is executing a value-creation plan that requires a COO to unify the operating model, own the P&L for manufacturing and supply chain, and position the business for a recapitalization event in 3–4 years.

The Role
The COO will report directly to the CEO and be accountable for the full manufacturing and supply chain P&L across all four divisions. This is an operating role with budget authority, not a coordination role. The right candidate has sat in a true P&L seat before, can hold their own in board-level conversations about EBITDA bridge and capital allocation, and has the operational depth to drive continuous improvement without delegating it away.

Key Responsibilities
- Own the consolidated P&L for manufacturing and supply chain (~$310M in COGS and operating costs)
- Lead cross-divisional integration of operating standards, ERP systems, and procurement contracts
- Represent operations to the Board and PE sponsor in quarterly reviews; build the operating data room for recapitalization
- Drive enterprise-wide Lean/continuous improvement program targeting $25M in savings over 24 months
- Oversee capital allocation for $60M equipment and facility modernization program
- Build and develop the divisional ops leadership team; hold VPs of Manufacturing accountable to results
- Partner with CFO on working capital optimization, especially inventory and AP/AR cycles
- Lead executive team through strategic planning and annual operating plan development

Requirements
- 15+ years in manufacturing operations with at least 3 years in a true P&L-ownership role (VP/SVP/COO level)
- Demonstrated experience presenting operational and financial results to a board or PE sponsor
- Lean/Six Sigma credentials and hands-on transformation track record
- Experience managing multiple facilities or business units concurrently
- Bachelor's degree in Engineering, Operations, or Business; MBA strongly preferred

Preferred Qualifications
- PE-backed company experience or familiarity with value-creation mandates
- Experience leading cross-divisional integration after M&A
- Exposure to board governance and equity participation conversations

Compensation
Base salary $375,000–$450,000 | Annual bonus target 50% of base | Equity participation in recapitalization upside | Full benefits + executive perquisites`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Director of Engineering → VP Engineering (SaaS)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'dir-eng-to-vp-eng',
    label: 'Director of Engineering → VP Engineering',
    resumeText: `PRIYA ANAND
Director of Engineering
Austin, TX | priya.anand@protonmail.com | (512) 555-0388 | linkedin.com/in/priyanand-eng

PROFESSIONAL SUMMARY
Engineering leader with 18 years building, scaling, and shipping software in B2B SaaS environments. Experienced in growing engineering organizations from seed-stage scrappiness to enterprise reliability, managing teams of 50+ engineers across backend, frontend, platform, and data disciplines. Strong technical foundation in distributed systems and cloud architecture. Recognized for creating engineering cultures where senior talent stays, velocity accelerates, and quality is non-negotiable. Consistently shipped products that moved revenue metrics.

EXPERIENCE

Director of Engineering | Luminara Technologies | Austin, TX | 2019 – Present
- Lead 54 engineers across five squads: Core Platform, API & Integrations, Data Engineering, Mobile, and Developer Experience
- Partnered with CPO to define and execute a product roadmap that grew ARR from $28M to $91M over four years
- Designed and implemented a microservices migration from a six-year-old Rails monolith, improving deployment frequency from monthly to daily and reducing production incidents by 58%
- Established engineering metrics program (DORA metrics, cycle time, bug escape rate) adopted across all squads; presented quarterly results to CEO and CFO
- Built Engineering Manager career ladder and IC individual contributor track; promoted 9 engineers from senior to staff/principal level
- Managed $11.2M annual engineering budget including headcount, tooling, and cloud infrastructure
- Drove SOC 2 Type II certification effort coordinating with InfoSec and Legal; achieved certification in 14 months
- All customers are mid-market and enterprise B2B (HR tech, financial services, and professional services verticals)

Senior Engineering Manager | Veralink Solutions | Austin, TX | 2015 – 2019
- Managed three teams totaling 28 engineers: backend services, data pipeline, and QA automation
- Led rewrite of core data ingestion pipeline handling 2B+ events/month, reducing processing latency from 4 hours to 11 minutes
- Championed shift-left testing strategy; reduced QA cycle time by 40% and cut regression defects per release by 67%
- Grew team from 14 to 28 through two rounds of engineering hiring; partnered with recruiting on technical assessment design
- Delivered integrations with Salesforce, HubSpot, Workday, and SAP that unlocked three enterprise deals worth $4.2M combined

Engineering Manager | Stackwise Inc. | Dallas, TX | 2011 – 2015
- Managed backend engineering team of 8 building REST APIs and internal tooling for a B2B workflow platform
- Introduced code review standards, on-call rotation, and incident retrospective process
- Contributed to 3 major product releases including a self-service onboarding flow that reduced time-to-value from 21 days to 4 days

Software Engineer | Stackwise Inc. | Dallas, TX | 2007 – 2011
- Full-stack engineer on core workflow product (Ruby on Rails, PostgreSQL, React)

EDUCATION
B.S. Computer Science | University of Texas at Austin | 2006

CERTIFICATIONS
- AWS Solutions Architect — Associate, 2021
- Certified Scrum Master (CSM), 2013

PROFESSIONAL DEVELOPMENT
- Reforge Engineering Leadership program, 2022
- Attended LeadDev conferences annually since 2016`,

    jobDescription: `Vice President of Engineering — Stratum Analytics
Austin, TX | Full-Time | $280,000–$340,000 total compensation

About Stratum Analytics
Stratum is a Series D B2B SaaS analytics platform serving 600+ enterprise customers in financial services, healthcare, and retail. We went public 18 months ago on Nasdaq (ticker: STRM) and are operating in a post-IPO environment that demands engineering excellence across compliance, scale, and delivery velocity. Our engineering team is 110 people today; we expect to reach 160 within 18 months.

The Role
We are searching for a VP of Engineering who can lead a 110-person organization in a public company environment. This means SOX compliance awareness, audit-ready engineering processes, board-level reporting on engineering KPIs, and the discipline to operate under heightened regulatory and investor scrutiny. The VP of Engineering will report to the CTO and will manage five directors.

Key Responsibilities
- Own engineering execution across all product lines — backend, data platform, frontend, infrastructure, and security
- Build and maintain a world-class engineering culture that attracts senior talent and minimizes attrition in a competitive market
- Partner with the CTO on technology strategy and architecture; represent engineering in executive team meetings
- Drive SOX-compliant engineering processes including change management, access controls, and audit trail requirements
- Present engineering health metrics to the Board of Directors quarterly; own the investor narrative on technology investment and engineering velocity
- Own the $18M+ engineering budget including headcount planning, compensation benchmarking, and vendor contracts
- Lead the director-level team; establish accountability frameworks and develop succession depth

Requirements
- 12+ years in software engineering with 5+ years in engineering leadership (Director or above)
- Public company experience — demonstrated knowledge of SOX, financial controls, and audit processes in an engineering context
- Proven ability to lead organizations of 80+ engineers
- Experience presenting to a Board of Directors or audit committee
- B2B SaaS background with complex enterprise customer requirements

Preferred Qualifications
- Experience leading engineering through an IPO or post-IPO scaling phase
- Background in data-intensive platforms (analytics, data warehousing, ML pipelines)
- Consumer product exposure (mobile apps, self-serve product-led growth)

Compensation
$280,000–$340,000 base | Equity (RSUs, 4-year vest) | Annual bonus | Full benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. CFO → CFO (Mid-Market Healthcare, coming from Retail)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cfo-retail-to-cfo-healthcare',
    label: 'CFO (Retail) → CFO (Healthcare)',
    resumeText: `MARGARET CALLAHAN, CPA
Chief Financial Officer
Denver, CO | mcallahan@outlook.com | (720) 555-0091 | linkedin.com/in/margaretcallahan-cfo

PROFESSIONAL SUMMARY
Finance executive with 22 years of progressive experience in financial leadership, capital markets, M&A, and operational finance across retail and consumer products industries. CPA with deep expertise in multi-entity financial consolidation, debt structure optimization, private equity reporting, and building finance teams that support rapid growth. Recognized for translating complex financial data into strategic insight that drives board-level decisions. Led two successful sale processes and one recapitalization. No healthcare industry experience — actively building that knowledge base through coursework and industry engagement.

EXPERIENCE

Chief Financial Officer | Cascade Retail Group | Denver, CO | 2018 – Present
- CFO for a PE-backed specialty retail chain operating 142 store locations and a growing e-commerce channel; annual revenues of $380M
- Led $120M senior secured credit facility refinancing, reducing blended interest rate by 190bps and extending maturity to 2027
- Oversaw financial due diligence and integration for two tuck-in acquisitions totaling $58M in enterprise value
- Implemented zero-based budgeting process across all cost centers; identified and eliminated $14M in non-value-added spend over 18 months
- Built 13-person finance team from scratch following spin-off from parent company; established treasury, FP&A, accounting, and internal audit functions
- Developed KPI dashboard used by CEO and board to monitor store-level contribution margin, inventory turn, and customer acquisition costs
- Managed relationship with private equity sponsor; prepared quarterly board packages, annual budgets, and lender reporting
- Led company through COVID-19 liquidity crisis: negotiated covenant waivers, drew down revolver, reduced capex by 60%, and preserved 2,400 jobs

Vice President of Finance | Redwood Consumer Brands | Phoenix, AZ | 2013 – 2018
- Led FP&A and financial operations for $195M CPG company with brands sold through national retail chains (Target, Walmart, Kroger)
- Drove annual budget cycle and rolling forecast process for 8 business units; presented results monthly to CEO and PE board
- Managed trade spend analytics program that identified $7.2M in promotional over-investment; reallocated to digital and in-store activation
- Led financial modeling for new product launches; developed ROI framework adopted company-wide
- Oversaw AP/AR operations with $45M average working capital balance; reduced DSO from 52 to 39 days

Director of Finance | Redwood Consumer Brands | Phoenix, AZ | 2010 – 2013
- Managed financial reporting, budgeting, and variance analysis for the West Coast distribution division
- Implemented NetSuite ERP across 3 business units; project finished 6 weeks ahead of schedule

Controller | Mesa Merchandising Inc. | Tempe, AZ | 2006 – 2010
- Maintained general ledger, prepared consolidated financial statements under US GAAP, and managed annual audit
- Supervised team of 6 accountants; implemented month-end close checklist reducing close cycle from 12 days to 7 days

Senior Accountant | Deloitte LLP | Phoenix, AZ | 2003 – 2006
- Audit staff and senior on retail and consumer products client engagements

EDUCATION
B.S. Accounting | Arizona State University, W.P. Carey School of Business | 2003

CERTIFICATIONS & LICENSURE
- Certified Public Accountant (CPA) — Colorado, active license
- Member, AICPA and Colorado Society of CPAs

INDUSTRY ENGAGEMENT
- Enrolled in Healthcare Financial Management Association (HFMA) Certificate Program, 2024
- Attending HFMA Annual Conference, 2025
- Advisory relationship with former CFO of Banner Health (informal mentoring)`,

    jobDescription: `Chief Financial Officer — Northgate Health Systems
Denver, CO | Full-Time | $310,000–$380,000 base + incentive

About Northgate Health Systems
Northgate is a physician-owned, multi-specialty healthcare group operating 18 clinic locations across Colorado and Wyoming with annual net revenues of $290M. We serve 240,000 patients annually across primary care, orthopedics, oncology, cardiology, and behavioral health. We are preparing for a significant growth phase — a potential hospital partnership, expansion of our value-based care contracts, and a possible PE transaction within 3–5 years. We need a CFO who can lead us through this complexity.

The Role
The CFO will own all financial functions for Northgate including revenue cycle management, payer contract negotiation support, cost accounting, treasury, and compliance. This is a critically important role because healthcare finance is fundamentally different from general corporate finance — payer mix, revenue recognition under healthcare-specific rules, risk contracts, HIPAA intersections with financial systems, and the physician compensation model all require specific expertise or a very steep learning curve.

Key Responsibilities
- Lead all financial operations including revenue cycle, billing, coding compliance, and payer relations
- Manage payer contract portfolio ($210M+ in net revenue from commercial, Medicare, and Medicaid contracts)
- Oversee value-based care financial modeling — capitation, shared savings, quality incentive calculations
- Drive the annual budget and long-range financial plan for the physician board and management committee
- Lead financial due diligence preparation for potential PE transaction or health system partnership
- Implement cost accounting at the service line level; establish contribution margin analysis by specialty and location
- Manage banking relationships, debt covenants ($45M term loan, $15M revolver), and treasury operations
- Ensure compliance with healthcare-specific financial regulations including Stark Law and Anti-Kickback Statute financial implications

Requirements
- 15+ years of finance experience with at least 5 years as CFO or Deputy CFO
- Healthcare industry experience required — physician group, health system, or multi-site ambulatory preferred
- Demonstrated experience with value-based care financial models and payer contract management
- CPA license strongly preferred
- Experience leading finance teams of 10+ people

Preferred Qualifications
- Transaction experience (PE process, health system partnership, or merger)
- Revenue cycle management oversight experience
- HFMA membership or FHFMA certification

Compensation
Base salary $310,000–$380,000 | Annual incentive 25–40% | Partnership track consideration for right candidate | Full benefits + executive allowance`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. VP Marketing → CMO (Consumer Brand, B2B2C → DTC)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-marketing-to-cmo',
    label: 'VP Marketing → CMO',
    resumeText: `JENNIFER ROSARIO
Vice President of Marketing
Chicago, IL | jrosario@icloud.com | (312) 555-0175 | linkedin.com/in/jenniferrosario-mktg

PROFESSIONAL SUMMARY
Marketing executive with 17 years of experience leading brand, demand generation, and digital marketing across B2B2C channels. Expert in building cohesive brand stories that resonate with both trade partners and end consumers, managing multi-million dollar media budgets, and deploying data-driven strategies that shorten sales cycles and grow market share. Led digital transformation of traditional marketing operations at two companies, deploying analytics infrastructure, marketing automation, and performance marketing capabilities. Known for building marketing teams that punch above their weight.

EXPERIENCE

Vice President of Marketing | Harwood Nutrition Co. | Chicago, IL | 2019 – Present
- Lead all marketing functions for a $215M better-for-you nutrition brand sold through grocery, mass, and natural channel retailers (Whole Foods, Kroger, Target, Sprouts)
- Manage $22M annual marketing budget across brand advertising, digital, shopper marketing, and trade
- Launched brand refresh and new packaging system that increased shelf pickup by 18% and drove 11% incremental volume in the first year of rollout
- Built performance marketing capability from zero: hired team of 5, deployed paid social/search stack, generated $4.1M in attributed direct-to-retail revenue in year one
- Developed retailer co-op marketing programs with 12 national accounts, generating $3.8M in incremental promotional funding
- Led marketing integration for acquisition of Clearfield Snacks ($68M deal); merged brands and achieved full portfolio alignment within 9 months
- Grew social media following from 180K to 720K across platforms and increased email list from 140K to 410K subscribers
- All revenue flows through retail channel partners — company has no DTC e-commerce capability

Vice President of Demand Generation | Apex B2B Software | Chicago, IL | 2015 – 2019
- Led B2B demand generation and digital marketing for $95M SaaS platform serving food & beverage manufacturers
- Managed $8M annual budget across paid digital, content marketing, events, and partner marketing
- Built ABM program targeting 200 enterprise accounts; contributed to $14M pipeline annually
- Led website redesign and SEO overhaul that grew organic traffic by 220% and reduced CAC by 34%
- Deployed Marketo and Salesforce integration; built lead scoring model that improved MQL-to-SQL conversion from 8% to 19%

Marketing Director | Greenfield Foods Inc. | Naperville, IL | 2011 – 2015
- Managed brand marketing for three product lines in the organic snack category
- Executed national TV campaign ($6M budget) for product launch achieving 88% unaided brand awareness in target demo
- Led transition from traditional media to digital-first strategy over three years

Marketing Manager | Greenfield Foods Inc. | Naperville, IL | 2007 – 2011
- Managed trade show and event calendar; built retailer sell-in presentations and category management materials
- Supported national sales team with market data analysis and competitive intelligence

EDUCATION
B.S. Marketing | DePaul University | 2007
MBA | Northwestern University, Kellogg School of Management | 2011

PROFESSIONAL ORGANIZATIONS
- Member, Consumer Brands Association (CBA) Marketing Committee
- Chicago AMA Board Member, 2020–2022`,

    jobDescription: `Chief Marketing Officer — Solstice Body Care
Chicago, IL | Full-Time | $280,000–$350,000 base + equity

About Solstice Body Care
Solstice is a premium personal care brand with $85M in revenue, growing at 40% annually. We sell directly to consumers through our own e-commerce site (65% of revenue), Amazon (20%), and a small but growing specialty retail footprint (15%). We raised a $30M Series C 12 months ago specifically to scale marketing and customer acquisition. Our CMO will be the architect of the brand at scale — responsible for taking us from $85M to $250M in revenue over the next 4 years.

The Role
This is a pure DTC-first CMO role. The majority of our revenue — and the majority of our growth opportunity — lives in owned digital channels: our website, email, SMS, and social. We are looking for someone who has operated in a high-velocity DTC environment before. Understanding contribution margin, LTV:CAC ratios, channel payback periods, and the economics of paid acquisition at scale is non-negotiable. Brand-only marketers need not apply.

Key Responsibilities
- Own all marketing P&L: paid acquisition budget ($18M), retention/CRM, influencer, brand, and creative
- Drive customer acquisition strategy across paid social (Meta/TikTok), paid search, affiliate, and emerging channels
- Own the customer data platform strategy — CDP selection, audience segmentation, and lifecycle orchestration
- Build and maintain brand identity that supports premium pricing and earns earned media attention
- Lead a 22-person marketing team including performance, retention, creative, and brand
- Partner with CEO on retail expansion strategy — evaluate when and how to expand brick-and-mortar presence
- Establish and report on full-funnel KPIs to the board: CAC, LTV, payback period, blended ROAS, NPS

Requirements
- 12+ years in marketing with at least 3 years as CMO or VP Marketing in a DTC brand
- Proven DTC experience — must have owned paid acquisition budget of $10M+ with demonstrated ROAS accountability
- Deep knowledge of Meta/TikTok advertising, lifecycle marketing, and retention strategies
- Experience scaling a consumer brand from $50M to $200M+ in revenue
- Data-driven mindset: comfortable with cohort analysis and attribution modeling

Preferred Qualifications
- Beauty, personal care, or wellness category experience
- Amazon Marketplace expertise (Vendor Central or Seller Central)
- Experience with influencer/creator-led marketing at scale

Compensation
$280,000–$350,000 base | Performance bonus (up to 30%) | Equity (Series C options) | Benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Director Supply Chain → VP Supply Chain (Global Logistics)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'dir-supply-chain-to-vp',
    label: 'Director Supply Chain → VP Supply Chain',
    resumeText: `CARLOS MENDOZA
Director of Supply Chain
Houston, TX | carlos.mendoza@gmail.com | (713) 555-0342 | linkedin.com/in/carlosmendoza-scm

PROFESSIONAL SUMMARY
Supply chain executive with 19 years of experience in procurement, logistics, demand planning, and supplier relationship management in the energy equipment and industrial manufacturing sectors. Managed $500M+ in annual spend, led supply base consolidation programs, and built demand-driven planning processes that significantly reduced inventory carrying costs. Strong analytical background with expertise in SAP APO/IBP, supply chain modeling, and should-cost analysis. All career experience has been in domestic US operations; international supply chain exposure is limited to domestic-side import management.

EXPERIENCE

Director of Supply Chain | Strata Energy Equipment | Houston, TX | 2018 – Present
- Lead supply chain organization of 38 people covering procurement, logistics, demand planning, and inventory management for a $640M manufacturer of oil and gas wellhead equipment
- Manage $515M annual procurement spend across 180 active suppliers; led supplier rationalization program that reduced supply base from 310 to 180 while improving quality metrics
- Negotiated 3-year master supply agreements with 12 strategic partners yielding $31M in cumulative savings
- Built S&OP process from scratch; improved forecast accuracy from 58% to 79% over two years, reducing inventory write-offs by $8.4M annually
- Led response to COVID-19 supply disruptions: dual-sourced 24 critical components, built 45-day safety stock on 80 A-items, avoided any customer delivery failures
- Deployed SAP IBP demand sensing module; reduced emergency freight spend by $3.2M in first year
- Responsible for domestic carrier management and 3PL relationships for US distribution network (no international freight management)

Senior Supply Chain Manager | Meridian Industrial Group | San Antonio, TX | 2013 – 2018
- Managed procurement of $180M in raw materials, components, and MRO supplies for two manufacturing facilities
- Led lean supply chain initiative — VMI programs with 8 key suppliers, reducing reorder cycle and cutting on-hand inventory by 22%
- Implemented supplier scorecard system; improved on-time delivery from 77% to 91% across supply base
- Coordinated with logistics team on inbound freight; negotiated LTL consolidation program saving $1.1M annually

Supply Chain Analyst | Meridian Industrial Group | San Antonio, TX | 2009 – 2013
- Built demand forecasting models and capacity planning tools in Excel/SAP; supported S&OP process
- Conducted should-cost analyses for RFQ processes; identified $4.2M in negotiation opportunities

Procurement Specialist | Hallmark Energy Services | Houston, TX | 2005 – 2009
- Managed supplier qualification process, RFQ issuance, and purchase order management for indirect spend categories

EDUCATION
B.S. Industrial Engineering | Texas A&M University | 2005
MBA | University of Houston, Bauer College of Business | 2011

CERTIFICATIONS
- APICS Certified Supply Chain Professional (CSCP), 2012
- APICS Certified in Production and Inventory Management (CPIM), 2009

PROFESSIONAL AFFILIATIONS
- Member, Institute for Supply Management (ISM)
- Houston Chapter ISM Board Member, 2021–2023`,

    jobDescription: `Vice President of Supply Chain — Meridian Global Logistics Partners
Houston, TX | Full-Time | $240,000–$295,000 base + annual incentive

About Meridian Global Logistics Partners
Meridian Global is a $1.4B third-party logistics and supply chain services company operating across North America, Europe, and Southeast Asia. We serve industrial, energy, and manufacturing customers who require integrated supply chain solutions including freight forwarding, customs brokerage, contract warehousing, and managed procurement. We are expanding our managed supply chain offering and need a VP of Supply Chain who can lead the practice globally.

The Role
The VP of Supply Chain will own the design, delivery, and P&L of Meridian Global's managed supply chain services for enterprise clients. This person will lead a team of 120 supply chain professionals across 8 countries and be accountable for $850M in managed client spend. The right candidate has managed international supply chains — not just domestic operations — and is comfortable navigating customs, duty management, cross-border freight modes, and foreign supplier relationships.

Key Responsibilities
- Lead the global managed supply chain practice: client relationships, delivery excellence, and practice P&L
- Oversee international freight management across ocean, air, and cross-border road transport
- Build and maintain relationships with international carrier partners, freight forwarders, and customs brokers
- Develop global supplier management capability for clients — international RFQs, supplier audits, cross-border contracts
- Own talent development for 120-person global team across 8 countries
- Lead digital transformation of supply chain analytics platform: customer-facing dashboards, predictive analytics, supply disruption alerting
- Represent Meridian Global at industry events; lead thought leadership content strategy for supply chain practice

Requirements
- 15+ years in supply chain with at least 5 years in an international supply chain role
- Demonstrated experience managing international freight (ocean/air) and customs compliance
- Experience managing teams across multiple countries and time zones
- Familiarity with international trade regulations, INCOTERMS, and import/export compliance
- Track record managing $300M+ in annual spend

Preferred Qualifications
- Experience in 3PL or logistics services environment (not just corporate supply chain)
- CSCMP membership and conference presence
- Language capability (Spanish or Mandarin a plus)

Compensation
Base $240,000–$295,000 | Annual incentive 20–30% of base | Full benefits + international travel allowance`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. VP Sales → SVP Sales (Fintech, no SaaS/recurring revenue experience)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-sales-to-svp-fintech',
    label: 'VP Sales → SVP Sales (Fintech)',
    resumeText: `THOMAS WHITFIELD
Vice President of Sales — Financial Services
New York, NY | twhitfield@gmail.com | (212) 555-0629 | linkedin.com/in/thomaswhitfield-sales

PROFESSIONAL SUMMARY
Sales executive with 21 years of experience building and leading high-performance sales organizations in financial services. Consistent record of exceeding quota, building enterprise relationships at the C-suite level, and scaling sales teams during periods of rapid growth. Expert in complex, consultative, multi-stakeholder enterprise sales cycles that span 9–18 months. Deep relationships across asset management, wealth management, insurance, and banking. All experience is in transactional or project-based revenue models; transitioning into recurring revenue SaaS environments is a deliberate focus.

EXPERIENCE

Vice President of Sales | Axiom Capital Analytics | New York, NY | 2018 – Present
- Lead enterprise sales team of 22 AEs selling data analytics and reporting solutions to institutional asset managers, hedge funds, and family offices
- Managed team that exceeded quota for 5 consecutive years; personal quota $18M annually, team quota $68M
- Closed 9 transactions over $2M individually, including largest deal in company history ($11.4M single-year engagement with a top-10 global asset manager)
- Built and maintained C-suite relationships at 45+ institutional clients across North America and Europe
- Revenue model is predominantly project/engagement-based with annual renewal components; ARR component represents approximately 30% of total revenue
- Partnered with marketing on ABM campaigns targeting 150 top-priority accounts; contributed to 40% of pipeline
- Rebuilt compensation plan and quota methodology after company restructuring; reduced voluntary attrition from 34% to 14%
- Managed 3 regional sales directors and drove territory expansion into Canada and UK

Senior Regional Sales Director | Pinnacle Investment Technology | New York, NY | 2013 – 2018
- Led regional sales team of 12 AEs covering Northeast and Mid-Atlantic for investment operations software
- Grew regional revenue from $24M to $47M over five years through net new logo acquisition and expansion
- Top-producing region in company for 3 of 5 years
- Deals structured as multi-year license agreements with implementation fees; ACV ranged $400K–$2.5M

Director of Sales | Eastern Capital Partners | New York, NY | 2009 – 2013
- Managed sales team of 8 for a boutique investment consulting firm; targeted UHNW and family office clients
- Built referral network with estate attorneys and tax advisors generating 30% of new business
- Grew AUM under sales influence from $1.1B to $2.8B over four years

Sales Associate → Regional Vice President | Fidelity Investments | Boston, MA | 2003 – 2009
- Institutional sales in fixed income and equity products to plan sponsors and endowments; promoted to RVP in 2006

EDUCATION
B.A. Economics | Boston College | 2003

CERTIFICATIONS
- Series 7 and Series 63 licenses (active)
- Chartered Alternative Investment Analyst (CAIA) Level 1, 2012

INDUSTRY RECOGNITION
- Axiom Capital Sales President's Club, 2019–2023
- FISD Sales Executive of the Year finalist, 2021`,

    jobDescription: `Senior Vice President of Sales — NovaPay Financial Technology
New York, NY | Full-Time | $350,000–$425,000 OTE

About NovaPay Financial Technology
NovaPay is a Series E fintech company with $180M ARR and 130% net revenue retention among our top 100 accounts. We provide embedded payments infrastructure and treasury automation to mid-market and enterprise companies in financial services. We've grown ARR 60% YoY for three consecutive years and are preparing for a public listing. Our sales motion is pure land-and-expand SaaS: small initial contracts grow significantly over 24 months as customers expand usage of our API platform.

The Role
The SVP of Sales will own a $220M ARR growth target for fiscal year 2026 and lead a 65-person sales organization including 4 VPs, 40 AEs, and 12 SEs. This is an execution role for someone who lives and breathes SaaS metrics — ARR, NRR, CAC payback, expansion revenue, churn — and has led land-and-expand motions at scale. The fintech domain knowledge is a strong plus; the SaaS operating model is non-negotiable.

Key Responsibilities
- Own the ARR target of $220M for fiscal 2026 ($85M new logo + $135M expansion)
- Lead and develop 4 VP Sales direct reports; hold each accountable to regional ARR and NRR metrics
- Build and maintain C-suite relationships with the top 50 accounts (average ACV $1.2M, potential $5M+)
- Partner with Revenue Operations on forecasting methodology, pipeline hygiene, and CRM discipline (Salesforce)
- Drive product-led growth strategy — identify where self-serve motion can complement field sales
- Build compensation framework that incentivizes both new logo acquisition and multi-year expansion
- Represent sales in board meetings and investor calls; own the go-to-market narrative for investor materials
- Partner with marketing on demand gen; own pipeline coverage ratio (target 4x quota)

Requirements
- 15+ years in sales with at least 5 years as VP Sales or above at a SaaS company
- Proven track record owning $100M+ ARR target in a recurring revenue model
- Deep understanding of SaaS metrics: ARR, NRR, CAC, LTV, expansion revenue, churn cohort analysis
- Experience leading enterprise sales teams of 40+ people
- Financial services domain expertise strongly preferred

Preferred Qualifications
- Experience at a fintech company (payments, treasury, lending tech)
- Background leading sales through a pre-IPO or IPO process
- PLG (product-led growth) strategy experience

Compensation
$175,000–$200,000 base | OTE $350,000–$425,000 | RSU equity package | Benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Director HR → VP People & Culture (Tech, no tech industry experience)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'dir-hr-to-vp-people',
    label: 'Director HR → VP People & Culture',
    resumeText: `SANDRA KOWALSKI
Director of Human Resources
Minneapolis, MN | skowalski@gmail.com | (612) 555-0517 | linkedin.com/in/sandrakowalski-hr

PROFESSIONAL SUMMARY
Human resources leader with 16 years of experience building people functions in complex, multi-site organizations across healthcare and professional services. M&A integration specialist — led workforce integration for four acquisitions totaling over 3,200 employees. Expert in organizational design, total rewards architecture, executive compensation, labor relations, and HRBP partnership models. Known for building HR functions that serve as genuine business partners, not compliance gatekeepers. No technology industry experience to date; actively expanding knowledge of tech talent markets and engineering org dynamics.

EXPERIENCE

Director of Human Resources | NorthernLight Healthcare | Minneapolis, MN | 2016 – Present
- Lead HR function for a 4,800-employee regional health system operating 9 hospitals and 41 clinics across Minnesota and Wisconsin
- Managed HR team of 42 including HRBPs, compensation, benefits, talent acquisition, L&D, and employee relations
- Led workforce integration for three hospital acquisitions (820, 640, and 310 employees respectively); achieved full integration within 9–12 months each with less than 8% involuntary attrition
- Redesigned total rewards structure covering clinical and administrative workforce; implemented market-based pay bands that reduced pay equity complaints by 70% and supported retention of nursing staff through labor market shortage
- Launched leadership development program; 68% of director-level openings filled through internal promotion since 2019
- Negotiated labor agreements with two SEIU locals representing 1,200 employees; reached agreements without work stoppage
- Partnered with CEO on executive succession planning; built bench assessments for all C-suite roles
- Drove DEI strategy: increased leadership diversity from 22% to 41% underrepresented groups over 4 years
- Implemented Workday HCM (16-month rollout); went live on time and under budget

Senior HR Manager | Lakeland Professional Services | St. Paul, MN | 2011 – 2016
- HR generalist leader for a 1,200-person management consulting and staffing firm
- Led merger integration of 400-person acquired firm; unified compensation, benefits, and HR systems within 6 months
- Built HRBP model from scratch; transitioned HR team from transactional to advisory focus
- Managed talent acquisition for 200+ annual hires including partners, principals, and senior consultants

HR Manager | Lakeland Professional Services | St. Paul, MN | 2008 – 2011
- Managed full employee lifecycle for 3 business units: onboarding, performance, compensation, and exits

EDUCATION
B.A. Psychology | University of Minnesota | 2007
M.S. Human Resources Management | University of St. Thomas | 2010

CERTIFICATIONS
- SHRM-SCP (Senior Certified Professional), active
- Professional in Human Resources (PHR), 2012
- Prosci Change Management Certification, 2018

BOARD & COMMUNITY
- SHRM Minnesota Chapter, President, 2022–2024
- Board Member, Volunteers of America — Upper Midwest, 2021–Present`,

    jobDescription: `Vice President of People & Culture — Lodestar Software
Minneapolis, MN | Full-Time | $220,000–$270,000 base + equity

About Lodestar Software
Lodestar is a 650-person B2B SaaS company delivering workforce management solutions to mid-market employers. We've grown from 180 to 650 employees in 3 years (Series D, $95M raised). Our engineering team (220 people) is the engine of the company. We have a strong product culture but our people infrastructure has not scaled with our growth — we need a VP of People who can build what we need for the next stage without over-processing a culture that is still entrepreneurial.

The Role
This is a builder role, not a maintainer role. Our People function today is 8 people (3 recruiters, 2 HRBPs, 2 benefits/ops, 1 L&D). We need someone who has scaled a People function in a tech company before — understands the unique dynamics of engineering talent, knows what good looks like for engineering compensation, and can build the infrastructure (performance framework, career ladders, manager development, DEI) for a company going from 650 to 1,200+ people. Tech industry experience is a must-have, not a nice-to-have.

Key Responsibilities
- Lead and scale the People function from 8 to 15 people over 18 months
- Design and implement engineering and product career ladders and compensation bands benchmarked to tech industry standards (Radford, Levels.fyi, Carta)
- Build manager development program tailored to engineering managers and product leads
- Partner with the executive team on org design as the company scales through Series E
- Lead employer branding for tech talent in a competitive Minneapolis/hybrid market
- Own DEI strategy and accountability reporting to the board
- Prepare People function for potential M&A activity (we are actively evaluating 2 acquisitions)

Requirements
- 12+ years in HR with at least 3 years in a VP or equivalent People leadership role at a tech company
- Technology industry experience required — must have experience setting compensation for software engineers, managing engineering org dynamics, and navigating the unique culture of a product-led company
- Experience scaling a People function from fewer than 15 to 25+ people
- Familiarity with tech compensation benchmarking tools (Radford, Levels.fyi, Carta, Pave)
- M&A integration experience strongly preferred

Preferred Qualifications
- SHRM-SCP or SPHR certification
- Experience at a company that scaled through Series C–E
- B2B SaaS product company background

Compensation
$220,000–$270,000 base | Equity (Series D options) | Annual bonus | Full benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. VP Product → CPO (Enterprise Software, no consumer/AI/ML)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-product-to-cpo',
    label: 'VP Product Management → CPO',
    resumeText: `ANDREW FLETCHER
Vice President of Product Management
Boston, MA | afletcher@email.com | (617) 555-0283 | linkedin.com/in/andrewfletcher-product

PROFESSIONAL SUMMARY
Product executive with 15 years building and scaling enterprise software products in highly regulated industries. Launched 12 products from concept to revenue, built product organizations from 3 to 28 people, and developed deep expertise in complex enterprise sales cycles, compliance-driven product requirements, and long-duration customer relationships. Strong track record of working within constraints — regulatory, technical, and organizational — to create products that customers renew and expand. No consumer product experience or AI/ML product background; focused on B2B enterprise throughout career.

EXPERIENCE

Vice President of Product Management | Argus Compliance Software | Boston, MA | 2019 – Present
- Lead product strategy, roadmap, and execution for a $140M ARR enterprise compliance and risk management platform serving financial services and insurance clients
- Manage product team of 28: 12 product managers, 8 product designers, 5 business analysts, 3 data analysts
- Own product P&L — pricing, packaging, and commercial terms for new features and modules; contributed to growing ACV from $85K to $140K over 4 years
- Launched 4 major product modules (Regulatory Change Management, Third-Party Risk, Audit Management, Policy Lifecycle) generating combined $28M in new ARR
- Defined product strategy for AI-assisted compliance — positioned roadmap but have not personally shipped ML-powered features; ML work owned by a separate AI team
- Built relationship with 40 enterprise design partners; run annual customer advisory board
- Drove product-market fit research for expansion into EMEA market; led product localization for UK/EU regulatory frameworks
- Zero consumer product experience — all products are sold to compliance officers, risk managers, and general counsel

Vice President of Product | ClearPath Risk Solutions | Cambridge, MA | 2015 – 2019
- Led product for a 3-product enterprise risk platform suite; managed team of 14 PMs and designers
- Shipped 8 product releases achieving NPS of 52 (industry benchmark 31)
- Defined and executed platform consolidation strategy, merging 3 legacy products into a unified UI/UX — reduced churn by 18% post-consolidation
- Established quarterly business reviews with top 50 accounts; reduced at-risk accounts from 23 to 7

Senior Product Manager | Nexus Analytics Corp | Waltham, MA | 2011 – 2015
- PM for data reporting and analytics module; owned roadmap, wrote PRDs, coordinated with engineering and design
- Led discovery for 3 new feature areas; 2 of 3 shipped and became top-10 most-used features

Product Manager | Nexus Analytics Corp | Waltham, MA | 2009 – 2011

EDUCATION
B.S. Computer Science | Northeastern University | 2009
MBA | MIT Sloan School of Management | 2014

PROFESSIONAL ORGANIZATIONS
- Product Development and Management Association (PDMA) member
- Boston Product Alliance founding member`,

    jobDescription: `Chief Product Officer — Horizon Intelligence
Boston, MA | Full-Time | $310,000–$390,000 base + equity

About Horizon Intelligence
Horizon Intelligence is an AI-native analytics company with $60M ARR, growing 80% YoY, serving enterprise customers and a rapidly growing self-serve mid-market segment. Our platform combines machine learning-powered insights, natural language querying, and workflow automation for business intelligence use cases. We've raised $120M Series C and are building toward an IPO in 24–30 months. We need a CPO who can lead product across both enterprise and consumer-adjacent self-serve motions simultaneously.

The Role
The CPO owns the entire product surface at Horizon — enterprise, self-serve, and mobile. This is a notably broad product scope: 40% of our revenue today is enterprise (complex deals, deep customization, sales-assisted) and 60% is growing from a self-serve motion we launched 14 months ago. The CPO must be fluent in both worlds. We are also an AI-first company — our differentiation is ML-powered — and the CPO needs to understand AI/ML product development well enough to make roadmap tradeoffs and communicate our ML strategy to customers and investors.

Key Responsibilities
- Own the product vision, strategy, and roadmap for all product surfaces
- Lead product organization of 45 (PMs, designers, researchers, data scientists embedded in product)
- Define and drive the AI product roadmap — work closely with ML engineering to translate model capabilities into product features
- Own the self-serve product motion: onboarding, activation, conversion, and expansion metrics
- Build consumer-quality UX for self-serve users while maintaining enterprise-grade configurability
- Partner with CEO on investor narrative for Series D and eventual IPO
- Establish product operations, prioritization frameworks, and delivery cadence across 6 product teams

Requirements
- 12+ years in product with at least 3 years as CPO or VP of Product at a scaling company
- AI/ML product experience — must have shipped ML-powered features and understand the product implications of model behavior, confidence, and explainability
- Consumer or self-serve product experience — must understand activation funnels, onboarding, and PLG metrics
- Experience leading product organizations of 35+ people
- Track record of building products that serve both enterprise and SMB/self-serve segments

Preferred Qualifications
- IPO or pre-IPO product leadership experience
- B2B analytics or BI platform experience
- Experience with NLP/LLM-powered product features

Compensation
$310,000–$390,000 base | Equity (Series C, refreshes) | Annual bonus | Benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Director IT → CIO (Regional Bank, no cloud migration at scale)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'dir-it-to-cio-bank',
    label: 'Director IT → CIO (Regional Bank)',
    resumeText: `ROBERT CALLAWAY
Director of Information Technology
Charlotte, NC | robert.callaway@gmail.com | (704) 555-0461 | linkedin.com/in/robertcallaway-it

PROFESSIONAL SUMMARY
Technology executive with 20 years in IT leadership within the banking and financial services sector. Expertise in infrastructure modernization, cybersecurity program management, core banking system maintenance, and regulatory technology compliance. Deep knowledge of OCC, FDIC, and state banking examiner requirements. Known for managing aging technology portfolios with limited budgets while maintaining operational stability and exam readiness. Leading a cloud migration strategy now but have not yet executed a full-scale migration — that is the next chapter.

EXPERIENCE

Director of Information Technology | First Southern Community Bank | Charlotte, NC | 2017 – Present
- Lead IT organization of 34 for a $4.8B community bank operating 48 branches across the Carolinas
- Manage $22M annual IT budget including infrastructure, software licensing, vendor contracts, and IT staffing
- Oversaw upgrade and stabilization of Jack Henry Silverlake core banking system (2019–2021); zero critical incidents during conversion
- Built and maintain cybersecurity program that has achieved clean OCC examination findings for 6 consecutive years; no material control deficiencies
- Implemented SIEM platform (IBM QRadar) and 24/7 SOC vendor arrangement, responding to 3 attempted ransomware attacks without customer data compromise
- Launched digital banking platform modernization: replaced 11-year-old online banking system with FIS Online Banking; 140,000 customers migrated with 99.7% satisfaction score
- Developing cloud migration strategy for non-core workloads (currently in design phase, not yet executing); existing infrastructure is 95% on-premise
- Manage 22 vendor relationships including IBM, Jack Henry, FIS, and regional telco providers

Senior IT Manager | Piedmont Federal Savings | Charlotte, NC | 2012 – 2017
- Managed infrastructure and operations team of 14; responsible for servers, networking, end-user computing, and help desk
- Led conversion of disaster recovery environment from tape-based to disk-based replication; achieved RPO of 15 minutes (from 24 hours)
- Coordinated four bank branch openings and one acquisition integration from IT perspective
- Managed annual regulatory examination process; prepared IT exam documentation and presented to OCC and state examiners

IT Infrastructure Manager | Bankers First Group | Raleigh, NC | 2008 – 2012
- Managed server, storage, and networking infrastructure for $1.2B community bank
- Led migration from Novell to Microsoft Active Directory environment across 12 locations

Network Administrator → IT Supervisor | Carolinas Commerce Bank | Durham, NC | 2004 – 2008
- Network administration and help desk management for a 6-branch community bank

EDUCATION
B.S. Information Technology | NC State University | 2004

CERTIFICATIONS
- Certified Information Systems Security Professional (CISSP), active
- CISM — Certified Information Security Manager, active
- ITIL v4 Foundation, 2020

PROFESSIONAL AFFILIATIONS
- CBANC Network member
- Charlotte ISACA Chapter, Board Member 2021–2023`,

    jobDescription: `Chief Information Officer — Appalachian Regional Bancshares
Asheville, NC | Full-Time | $270,000–$340,000 base + bonus

About Appalachian Regional Bancshares
Appalachian Regional is a $7.2B community and regional bank operating 72 branches across North Carolina, Tennessee, and Virginia. We are executing a strategic technology transformation — moving from an aging on-premise infrastructure to a hybrid cloud model, modernizing our digital banking channels, and building the data capabilities to compete with money-center banks in the markets we serve. We need a CIO who can execute this transformation, not just plan it.

The Role
The CIO will lead a 58-person IT organization and a $41M IT budget. The immediate priority is executing a multi-year cloud migration that has been planned but not started — moving 60%+ of non-core workloads to AWS over 36 months while maintaining the operational stability that a federally regulated bank requires. This requires someone who has done this before. Planning a cloud migration is not sufficient experience for this role.

Key Responsibilities
- Lead the cloud migration execution: 60%+ of non-core workloads to AWS over 36 months
- Own all IT infrastructure, cybersecurity, digital banking channels, and data engineering
- Manage $41M IT budget; present annual IT investment plan to CEO and board
- Maintain exam-ready cybersecurity and IT risk management program; lead FDIC, OCC, and Fed examinations
- Build a data architecture that enables business intelligence and personalization capabilities
- Partner with business lines on technology-enabled product development
- Evaluate and select core banking replacement (FY2027 planning horizon)

Requirements
- 15+ years in IT with at least 5 years as CIO, Deputy CIO, or VP of IT at a bank or financial institution
- Demonstrated cloud migration execution experience — must have led a material cloud migration (not just strategy)
- Deep understanding of banking regulatory environment (OCC, FDIC, Fed, state regulators)
- CISSP or equivalent security credential preferred
- Experience managing IT organizations of 40+ people

Preferred Qualifications
- AWS or Azure certifications
- Experience with Jack Henry, Fiserv, or FIS core banking platforms
- Digital banking transformation experience (online/mobile)

Compensation
$270,000–$340,000 base | Annual bonus 20–35% | Full benefits + relocation assistance if needed`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. VP Quality → VP Manufacturing Excellence (Aerospace → Automotive)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-quality-to-vp-mfg-excellence',
    label: 'VP Quality (Aerospace) → VP Manufacturing Excellence (Auto)',
    resumeText: `KATHLEEN MCBRIDE
Vice President of Quality & Operational Excellence
Wichita, KS | kmcbride@outlook.com | (316) 555-0733 | linkedin.com/in/kathleenmcbride-quality

PROFESSIONAL SUMMARY
Quality and operational excellence executive with 23 years in aerospace manufacturing. Led AS9100, NADCAP, and FAA/EASA regulatory compliance programs for Tier 1 and Tier 2 aerospace suppliers. Expert in quality management systems, supplier quality development, failure analysis, and continuous improvement. Built quality organizations that are respected by Boeing, Airbus, and government defense customers. Deep Six Sigma and APQP experience in aerospace context. Lean manufacturing background is primarily from aerospace — have not operated in the automotive production system or applied PPAP/AIAG standards in an automotive context.

EXPERIENCE

Vice President of Quality & Operational Excellence | Celestia Aerospace Components | Wichita, KS | 2018 – Present
- Lead quality and operational excellence for a $520M Tier 1 aerospace supplier manufacturing structural components and assemblies for Boeing, Airbus, Spirit AeroSystems, and defense OEMs
- Direct quality team of 68 across 4 sites in Kansas, Texas, and Mexico
- Maintained AS9100 Rev D and NADCAP Heat Treatment/NDT certifications across all sites; zero major findings in last 3 external audits
- Led corrective action program that reduced customer escapes by 73% over 5 years (from 48 to 13 annually)
- Implemented Digital Quality Management System (Greenlight Guru adaptation for aerospace) replacing paper-based NCR processes; reduced time-to-disposition from 22 days to 4 days
- Chaired supplier quality development program for 180-supplier base; disqualified 12 underperformers and elevated 8 suppliers to preferred status
- Led operational excellence program: value stream maps across 6 product families, kaizen events eliminating $11M in annual waste
- Zero automotive industry exposure — all quality system experience is ITAR-governed aerospace

Vice President of Quality | Meridian Aerostructures | Wichita, KS | 2012 – 2018
- Led quality organization of 44 for $290M composites manufacturer; primary customers were Boeing Commercial and Northrop Grumman
- Drove transition from MIL-Q-9858A to AS9100C then AS9100D quality management system
- Implemented first-article inspection processes and in-process hold/release gates that reduced rework costs by $4.2M annually
- Responded to a major Boeing supplier quality alert (Level 3 SCAR); led 8-week corrective action that resolved all findings and preserved the contract

Director of Quality | Skylark Precision Parts | Derby, KS | 2008 – 2012
- Managed quality for a Tier 2 precision machining shop supplying Spirit AeroSystems and TransDigm
- Achieved AS9100B certification in 11 months; reduced cost of poor quality from 6.1% to 2.4% of revenue

Quality Manager | Skylark Precision Parts | Derby, KS | 2003 – 2008

EDUCATION
B.S. Industrial Engineering | Kansas State University | 2001

CERTIFICATIONS
- Lean Six Sigma Black Belt — ASQ, 2007
- ASQ Certified Quality Engineer (CQE), active
- AS9100 Lead Auditor — RABQSA, 2010
- APQP/PPAP — completed 40-hour automotive course, 2024 (preparing for automotive transition)`,

    jobDescription: `Vice President of Manufacturing Excellence — Ridgeline Automotive Systems
Detroit, MI | Full-Time | $260,000–$310,000 base + annual bonus

About Ridgeline Automotive Systems
Ridgeline is a $1.1B Tier 1 automotive supplier manufacturing chassis, suspension, and powertrain components for Ford, GM, Stellantis, and BMW. We operate 8 plants across Michigan, Indiana, and Ohio. We are executing a Manufacturing Excellence program to drive IATF 16949 compliance, zero-defect production, and operational efficiency improvements across our plant network. We need a VP who can lead this program end-to-end.

The Role
The VP of Manufacturing Excellence will own quality systems, continuous improvement, and manufacturing engineering across all 8 plants. This person leads a team of 95 and is accountable for customer-facing quality metrics (PPM, warranty, 8D resolution time), IATF 16949 certification, and the $30M+ Manufacturing Excellence savings program. The right candidate has deep automotive quality experience — IATF 16949, APQP, PPAP, AIAG standards, and the supplier-OEM dynamic with Ford/GM/Stellantis specifically.

Key Responsibilities
- Own IATF 16949 certification program across all 8 plants; lead surveillance audits with AIAG-accredited registrars
- Drive zero-defect strategy: manage OEM scorecards (Ford Q1, GM Supplier Quality Excellence Award targets), lead 8D investigations on escapes
- Lead APQP/PPAP process for all new product launches; interface with OEM supplier quality engineers
- Run continuous improvement program targeting $30M in manufacturing cost reduction over 3 years using lean/Six Sigma
- Build Manufacturing Excellence capability in the plant manager organization
- Oversee supplier quality development for $280M external supply base

Requirements
- 15+ years in manufacturing quality with at least 5 years in automotive Tier 1 environment
- IATF 16949 expertise required — must have led certification programs
- Experience with Ford Q1, GM Supplier Quality programs, and OEM SCAR management
- APQP/PPAP process ownership experience
- Lean Six Sigma Black Belt or equivalent

Preferred Qualifications
- Multi-plant quality leadership experience
- Powertrain or chassis component manufacturing background
- ASQ CQE or CMQ/OE certification

Compensation
$260,000–$310,000 base | Annual bonus 20–30% | Relocation assistance | Full benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Director Business Dev → VP Strategic Partnerships (Media → Tech)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'dir-bizdev-to-vp-partnerships',
    label: 'Director Business Dev → VP Strategic Partnerships',
    resumeText: `MICHAEL BRENNAN
Director of Business Development & Strategic Partnerships
Los Angeles, CA | mbrennan@gmail.com | (213) 555-0819 | linkedin.com/in/michaelbrennan-bd

PROFESSIONAL SUMMARY
Business development executive with 18 years of experience structuring, negotiating, and managing strategic partnerships and content licensing deals in the media, entertainment, and advertising technology sectors. Built a $200M+ deal portfolio spanning content licensing, distribution partnerships, joint ventures, and platform integrations. Expert negotiator in complex, multi-party agreements with studios, publishers, networks, and advertising platforms. No technology sector (SaaS, cloud, API) partnership experience — all deals have been in media and advertising.

EXPERIENCE

Director of Business Development & Strategic Partnerships | Pacific Media Group | Los Angeles, CA | 2017 – Present
- Lead business development function for a $780M diversified media company operating digital news properties, streaming platforms, and branded content studios
- Closed $218M in partnership and licensing deals over 6 years, including content licensing agreements with Netflix, Apple TV+, and Amazon Studios
- Structured and closed a joint venture with a major European broadcaster worth 45M euros over 5 years — company's largest international deal
- Built and manage publisher network of 140+ digital properties reaching 180M monthly users; generates $34M annually in content syndication revenue
- Negotiated advertising technology partnerships with Google, The Trade Desk, and LiveRamp enabling programmatic revenue growth of 61%
- Manage team of 9 including 4 partnership managers, 2 deal counsel coordinators, and 3 research analysts
- Led company's entry into podcast distribution market through partnership with Spotify and iHeart; generated $12M in first-year revenue

Director of Content Partnerships | Sunridge Entertainment | Burbank, CA | 2012 – 2017
- Closed $75M in content licensing and co-production deals with domestic and international distributors
- Structured a 3-year output deal with a major streaming service for first-look rights on original content (deal value $38M)
- Built and managed relationships with 30+ international distribution partners across Europe, Latin America, and Asia-Pacific
- Led due diligence and negotiation for acquisition of two independent content studios

Senior Business Development Manager | Vantage Advertising Group | New York, NY | 2008 – 2012
- Developed agency partnerships for a digital advertising network; managed $28M in annual partner revenue
- Built programmatic advertising partnerships with early SSP and DSP platforms

Business Development Associate | NBCUniversal | New York, NY | 2006 – 2008
- Supported VP in affiliate relations and content distribution negotiations

EDUCATION
B.A. Communications | University of Southern California | 2005
MBA | UCLA Anderson School of Management | 2011

PROFESSIONAL ORGANIZATIONS
- International Academy of Television Arts & Sciences, member
- Digital Media Licensing Association (DMLA), board observer`,

    jobDescription: `Vice President of Strategic Partnerships — Nexus Cloud Infrastructure
San Francisco, CA | Full-Time | $280,000–$340,000 base + equity

About Nexus Cloud Infrastructure
Nexus is a $320M ARR cloud infrastructure company providing API-first storage, compute, and networking solutions to enterprise customers and independent software vendors (ISVs). We compete in the developer infrastructure space alongside AWS, Azure, and GCP. Our partnership ecosystem is a primary growth lever — technology integrations, reseller partnerships, and cloud marketplace presence drive 35% of our new ARR. We need a VP who can build this ecosystem to scale.

The Role
The VP of Strategic Partnerships will build and lead Nexus's partnership organization across three partnership types: technology integrations (ISVs and complementary platforms), cloud marketplace partnerships (AWS Marketplace, Azure Marketplace, GCP Marketplace), and channel/reseller partnerships (managed service providers, VARs). This person will own the partnership contribution to ARR ($45M in FY2025, target $90M in FY2026) and lead a team of 12 partner managers.

Key Responsibilities
- Own the partnership ARR target ($90M in FY2026); build a partnership portfolio that contributes 30%+ of total new ARR
- Lead the technology partnership program — identify, negotiate, and manage API/integration partnerships with complementary software platforms
- Build cloud marketplace presence: optimize listings, co-sell agreements, and AWS/Azure/GCP partner program participation
- Recruit and enable a reseller network of 60+ MSPs; build channel incentive programs and sales enablement
- Negotiate partnership frameworks: OEM agreements, revenue share, co-sell arrangements, and technology integration contracts
- Partner with product and engineering on technical integration requirements and partner API development
- Build partner enablement: training, certification, demo environments, and technical documentation

Requirements
- 12+ years in business development or partnerships with at least 5 years in technology sector partnerships
- Technology sector experience required — must have structured technology integration partnerships, OEM agreements, or API partnerships
- Cloud marketplace experience (AWS, Azure, or GCP marketplace programs) strongly preferred
- Experience owning a $30M+ partnership ARR target
- Understanding of SaaS and API business models, usage-based pricing, and technical integration requirements

Preferred Qualifications
- Experience at a cloud infrastructure or developer tools company
- Background in building channel/reseller programs from scratch
- Technical background (engineering or technical product management)

Compensation
$280,000–$340,000 base | Equity | Annual bonus | Benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. VP Finance → Controller (Public Company, lateral move)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-finance-to-controller',
    label: 'VP Finance → Controller (Public Co, lateral move)',
    resumeText: `DANIEL OSEI, CPA
Vice President of Finance
Atlanta, GA | dosei.finance@gmail.com | (404) 555-0264 | linkedin.com/in/danielosei-finance

PROFESSIONAL SUMMARY
Finance executive with 19 years of experience in financial reporting, SOX compliance, audit management, and FP&A at public companies in the technology and telecommunications sectors. CPA with deep expertise in SEC reporting, US GAAP technical accounting, and building finance functions that can withstand public company scrutiny. Career has been on the FP&A and strategic finance side of public company finance — have supported controllers and CFOs extensively but have never held the Controller title or directly owned the close and consolidation function. Seeking the Controller role as a deliberate step to own the accounting function end-to-end.

EXPERIENCE

Vice President of Finance | Meridian Telecom Holdings | Atlanta, GA | 2019 – Present
- Lead financial planning, analysis, and investor relations support for a $1.4B publicly traded telecom company (NYSE: MDTH)
- Own the 3-statement financial model, quarterly earnings guidance preparation, and board financial presentations
- Partner with the Controller and CFO on all SEC filings — reviewed and contributed to 10-K, 10-Q, and 8-K disclosures for 5 consecutive years
- Led financial due diligence for two acquisitions ($340M and $85M enterprise value); built integration financial models
- Managed investor relations materials; prepared investor day presentations and quarterly earnings call scripts
- Built FP&A team from 3 to 11 people; established forecast cadence, variance analysis, and business unit reporting
- Manage $120M corporate finance budget excluding direct COGS
- Close collaboration with Controller and Chief Accounting Officer but not personally accountable for the general ledger, close cycle, or audit management

Senior Finance Manager | Apex Technology Group | Atlanta, GA | 2014 – 2019
- Led FP&A and treasury operations for a $480M SaaS company (NASDAQ); reported to CFO
- Built revenue recognition model after ASC 606 adoption; worked closely with Controller on implementation
- Managed $200M revolving credit facility and intercompany loan structure
- Coordinated annual external audit with Deloitte — liaison between FP&A and accounting on audit inquiries
- Developed executive compensation modeling for proxy statement; supported Compensation Committee disclosures

Finance Manager | Apex Technology Group | Atlanta, GA | 2011 – 2014
- Financial reporting support, earnings model maintenance, and board package preparation

Senior Accountant | KPMG LLP | Atlanta, GA | 2006 – 2011
- Audit senior on public company technology and telecom client engagements; 5 years of public audit experience
- SEC review filings, internal control testing under AS2201, management representation letters

EDUCATION
B.S. Accounting | Georgia Tech | 2005
MBA | Emory University, Goizueta Business School | 2013

CERTIFICATIONS
- Certified Public Accountant (CPA) — Georgia, active license
- Member, AICPA

SOX/INTERNAL CONTROLS EXPERIENCE
- Led SOX 404 readiness assessments as VP at Meridian
- Participated in AS2201 external audit testing for 5 years at KPMG
- Designed entity-level and process-level controls documentation for Apex Technology Group`,

    jobDescription: `Corporate Controller — Vantage Data Technologies
Atlanta, GA | Full-Time | $240,000–$290,000 base + bonus + equity

About Vantage Data Technologies
Vantage Data is a $680M ARR public company (NASDAQ: VDTX) providing data management and integration software to enterprise clients. We've grown from $200M to $680M ARR in 4 years through both organic growth and 5 acquisitions. Our finance function needs to scale to match the business — we need a Controller who can own the accounting function with the rigor a rapidly growing public company demands.

The Role
The Corporate Controller will own all accounting operations for Vantage Data — the general ledger, close and consolidation, technical accounting, SEC reporting (10-K/10-Q/8-K), external audit relationship, and SOX program. This person will report to the CFO and have 3 direct reports (Senior Managers of GL Accounting, Revenue Accounting, and Technical/Reporting). The Controller is the accounting function — not a strategic finance role.

Key Responsibilities
- Own the monthly and quarterly close process (current target: 5 business days)
- Prepare and review the consolidated financial statements under US GAAP
- Lead all SEC filings (10-K, 10-Q, 8-K, proxy) — drafting, reviewing, and certifying
- Own the external audit relationship (currently Big 4); serve as primary contact for PwC engagement team
- Lead SOX 404 program — scoping, control documentation, internal testing, and coordination with external auditors
- Manage technical accounting — lead assessment of new standards adoption
- Lead accounting integration for acquired businesses; ensure purchase accounting and opening balance sheet accuracy
- Build and develop the 18-person accounting team

Requirements
- 12+ years in accounting with at least 3 years in a Controller role or Deputy Controller at a public company
- CPA required
- SEC reporting experience — must have owned or co-owned 10-K/10-Q preparation
- SOX 404 program ownership experience
- Public company audit experience (Big 4 or regional firm) strongly preferred

Preferred Qualifications
- Software/SaaS revenue recognition experience (ASC 606 in a high-volume, complex arrangement environment)
- M&A accounting experience (purchase accounting, business combination disclosures)
- Previous Controller title preferred — open to strong Deputy Controller if other criteria met

Compensation
$240,000–$290,000 base | Annual bonus 20–30% | RSU equity | Full benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Director Clinical Ops → VP Clinical (Pharma, no oncology experience)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'dir-clinical-to-vp-clinical',
    label: 'Director Clinical Ops → VP Clinical (Pharma)',
    resumeText: `LINDA PATTERSON, MBA, PMP
Director of Clinical Operations
San Diego, CA | lpatterson.clinical@gmail.com | (858) 555-0396 | linkedin.com/in/lindapatterson-clinical

PROFESSIONAL SUMMARY
Clinical operations executive with 17 years in the biopharmaceutical industry. Led Phase I through Phase III global clinical trials across immunology, cardiovascular, and neurology therapeutic areas. Expert in CRO oversight, site selection and management, regulatory submissions support, and building global clinical operations functions. Managed 50+ concurrent clinical trials across 4 continents. Strong track record of on-time, on-budget trial delivery in therapeutic areas I know well. No oncology experience — all trials have been in non-oncology indications.

EXPERIENCE

Director of Clinical Operations | Altiva Biopharma | San Diego, CA | 2018 – Present
- Lead global clinical operations for a $390M mid-size biopharmaceutical company with a pipeline of 8 active compounds in Phase I–III
- Manage team of 42 including clinical trial managers, clinical monitors, data managers, and regulatory coordinators across US, EU, and APAC
- Oversaw 14 concurrent Phase II–III trials with combined enrollment of 8,200 patients across 28 countries
- Reduced average Phase III trial startup time from 11 months to 7 months through site selection process redesign
- Led CRO oversight for $85M in outsourced clinical services; renegotiated master service agreements saving $9.2M over 3 years
- Implemented CTMS (Medidata Rave) across all active trials; improved real-time data availability and protocol deviation detection
- Led IND and NDA submission support for 3 compounds; one NDA approved by FDA in 2022 (immunology indication)
- Zero oncology program experience — all therapeutic areas are non-oncology; no experience with oncology-specific endpoints, RECIST criteria, or tumor measurement

Senior Clinical Trial Manager | BiogenesX Inc. | South San Francisco, CA | 2013 – 2018
- Led Phase II and Phase III trials in cardiovascular disease (6 trials, 3,400 patients across 18 countries)
- Managed CRO deliverables, site performance scorecards, and risk-based monitoring implementation
- Co-led NDA submission filing team for one approved cardiovascular product

Clinical Trial Manager | BiogenesX Inc. | South San Francisco, CA | 2010 – 2013
- Managed Phase I and Phase II trials in neurology and pain indications

Clinical Research Associate | ClinTech Inc. | San Diego, CA | 2007 – 2010
- On-site clinical monitor for Phase II and Phase III trials across multiple therapeutic areas

EDUCATION
B.S. Biology | UC San Diego | 2006
MBA | San Diego State University, Fowler School of Business | 2013

CERTIFICATIONS
- Project Management Professional (PMP), active
- ACRP Certified Clinical Research Professional (CCRP), active
- ICH-GCP training, current certification

REGULATORY KNOWLEDGE
- IND, NDA, MAA submissions experience
- 21 CFR Parts 11, 50, 54, 56, 312 familiarity
- EMA regulatory framework working knowledge`,

    jobDescription: `Vice President of Clinical Operations — Oncora Therapeutics
San Diego, CA | Full-Time | $290,000–$360,000 base + equity

About Oncora Therapeutics
Oncora is a clinical-stage oncology company with a portfolio of 6 novel compounds targeting solid tumors, hematologic malignancies, and immuno-oncology indications. We have 4 ongoing Phase I/II trials, 2 entering Phase III within 18 months, and a regulatory team building toward our first NDA submission in FY2027. We've raised $280M Series D and are building an institutional-grade clinical operations function to take us through to commercialization.

The Role
The VP of Clinical Operations will own the build-out and execution of our clinical operations function. This person will hire 30+ people over the next 24 months and oversee all clinical trial execution across our oncology pipeline. Deep oncology experience is essential — the VP must understand oncology-specific trial designs, endpoint selection (ORR, PFS, OS, DOR), RECIST criteria, bone marrow assessment protocols, and the unique regulatory path for oncology products including Breakthrough Therapy Designation and accelerated approval pathways.

Key Responsibilities
- Own clinical operations for all 6 active compounds across Phase I–III
- Build and lead clinical operations team from current 8-person team to 40+ by end of FY2026
- Define and implement CRO strategy — select and oversee 2–3 strategic CRO partners for oncology programs
- Manage clinical trial budgets totaling $120M across all active programs
- Lead regulatory submission support (IND amendments, annual reports, NDA modules)
- Partner with CMO on trial design, protocol development, and endpoint strategy
- Build site network of 150+ oncology sites globally; establish site performance management framework

Requirements
- 15+ years in clinical operations with at least 5 years in oncology therapeutic area
- Oncology-specific expertise required: RECIST, tumor measurement endpoints, oncology site management
- Experience with Breakthrough Therapy Designation and FDA oncology regulatory pathways
- Phase III trial execution experience with oncology endpoints (ORR, PFS, OS)
- NDA or BLA submission support experience in oncology

Preferred Qualifications
- Prior VP-level clinical operations title
- Hematology (AML, ALL, lymphoma) trial experience
- CAR-T or cell therapy clinical operations experience

Compensation
$290,000–$360,000 base | Equity (Series D, 4-year vest) | Annual bonus | Full benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 14. VP Customer Success → CCO (Enterprise SaaS, no PLG experience)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vp-cs-to-cco',
    label: 'VP Customer Success → Chief Customer Officer',
    resumeText: `RACHEL THORNTON
Vice President of Customer Success
San Francisco, CA | rthornton@gmail.com | (415) 555-0538 | linkedin.com/in/rachelthornton-cs

PROFESSIONAL SUMMARY
Customer success executive with 14 years of experience building CS organizations in enterprise B2B SaaS. Built the Customer Success function from zero to 40 people at two companies. Expert in high-touch enterprise CS — executive business reviews, adoption programs, renewal management, and expansion playbooks for complex, multi-stakeholder accounts. Strong track record of above-target GRR and NRR in enterprise segments. All experience is in high-touch, sales-assisted enterprise models. No experience with product-led growth (PLG) or self-serve customer segments.

EXPERIENCE

Vice President of Customer Success | Veridia Software | San Francisco, CA | 2019 – Present
- Lead CS organization of 40 across enterprise customer success management, professional services, and support for a $210M ARR HR analytics SaaS platform
- Manage a portfolio of 380 enterprise accounts with average ACV of $520K; portfolio GRR 94%, NRR 118%
- Built CS function from 6-person team to 40 in 4 years; created CSM career ladder, QBR framework, and health score methodology
- Led strategic account program for top 25 accounts (average ACV $1.8M); personally led EBRs with C-suite stakeholders at 12 accounts
- Designed and deployed adoption playbook reducing time-to-value from 180 days to 90 days post-launch
- Owns renewal forecasting: built 90-day rolling renewal forecast process with 93% accuracy
- Drove expansion revenue of $22M in FY2024 through upsell and cross-sell programs within existing accounts
- No self-serve or free-tier customers — all customers acquired through enterprise sales motion

Senior Customer Success Manager → Manager, CS | Luminate Analytics | San Jose, CA | 2015 – 2019
- Managed enterprise CS for $60M ARR B2B analytics platform; covered 45-account portfolio (avg ACV $280K)
- Promoted to Manager in 2017; managed team of 8 CSMs
- Drove NRR from 107% to 121% in managed portfolio through systematic expansion plays

Customer Success Manager | Wavefront Technologies | San Francisco, CA | 2012 – 2015
- CSM for infrastructure monitoring SaaS; managed SMB and mid-market accounts (ACV $25K–$80K)
- Achieved 96% renewal rate on managed portfolio; twice named CSM of the Quarter

Customer Support Specialist | Wavefront Technologies | San Francisco, CA | 2010 – 2012
- Technical support for SaaS infrastructure monitoring platform

EDUCATION
B.A. Business Administration | University of California, Santa Barbara | 2009

PROFESSIONAL ORGANIZATIONS
- Customer Success Collective, founding member
- Gainsight Pulse conference speaker, 2021 and 2023
- CS Angel investor and advisor to 3 early-stage CS-focused SaaS companies`,

    jobDescription: `Chief Customer Officer — Prism Workflow Automation
San Francisco, CA | Full-Time | $310,000–$380,000 base + equity

About Prism Workflow Automation
Prism is a $130M ARR workflow automation platform with 14,000 customers across three segments: Enterprise (800 accounts, ACV $80K+), Mid-Market (3,200 accounts, ACV $8K–$80K), and a rapidly growing self-serve free and paid base (10,000 accounts, ACV sub-$2K, 40% of our new customer volume). We are 18 months into a PLG transformation — free tier launched in Q2 2023 — and are navigating the dual motion of scaling high-touch enterprise CS while figuring out how to serve 10,000 self-serve customers efficiently.

The Role
The CCO will own the entire post-sale customer journey across all three segments. This requires expertise in both high-touch enterprise CS and low-touch digital/PLG customer management. The CCO will lead a 70-person organization (35 enterprise CSMs, 10 mid-market CSMs, 15 digital/scaled CS, 10 support). The enterprise side of this role maps well to our VP-level candidates. The PLG self-serve side is where most enterprise CS leaders struggle — it requires a fundamentally different playbook: in-app nudges, product analytics (Amplitude, Mixpanel), automated lifecycle emails, and community-led support.

Key Responsibilities
- Own overall GRR and NRR across all segments (combined GRR target: 91%, NRR target: 115%)
- Lead enterprise CS program for 800 accounts; partner with sales on renewal and expansion
- Build digital CS motion for 10,000 self-serve accounts — product-led onboarding, automated lifecycle, community
- Define the CCO function metrics and reporting: health scoring across segments, usage analytics, adoption milestones
- Partner with product on PLG strategy — identify in-app moments that drive conversion from free to paid
- Lead CS through potential IPO process (18–24 month horizon); own NRR narrative for investor materials

Requirements
- 12+ years in customer success with at least 3 years at CCO or VP level
- Demonstrated experience operating a PLG or self-serve CS motion — must have managed scaled/digital CS
- Enterprise CS depth (ACV $100K+, multi-stakeholder accounts, EBR programs)
- Experience with product analytics tools (Amplitude, Mixpanel, Pendo) in a PLG context
- Experience managing CS organizations of 50+ people

Preferred Qualifications
- Experience leading CS through IPO or pre-IPO preparation
- Background with freemium or free-tier customer acquisition models
- Community-led growth strategy experience

Compensation
$310,000–$380,000 base | Equity (Series C, 4-year vest) | Annual bonus | Benefits`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 15. Plant Manager → VP Manufacturing (Automotive, no multi-site oversight)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'plant-mgr-to-vp-manufacturing',
    label: 'Plant Manager → VP Manufacturing',
    resumeText: `JAMES KOWALCZYK
Plant Manager
Toledo, OH | jkowalczyk@outlook.com | (419) 555-0672 | linkedin.com/in/jameskowalczyk-mfg

PROFESSIONAL SUMMARY
Manufacturing executive with 24 years in automotive supplier operations, building from machinist and process engineer to running a $320M single-site manufacturing operation with 1,200 employees. Expert in high-volume precision machining, stamping, and assembly for powertrain and chassis applications. Strong lean manufacturing background applied in the Toyota Production System framework. Deep knowledge of OEM quality requirements, launch management, and production cost management. All career experience has been at a single facility — have never managed multiple plants simultaneously or carried multi-site P&L accountability.

EXPERIENCE

Plant Manager | Greystone Automotive Components | Toledo, OH | 2015 – Present
- Full operational accountability for a 1,200-employee precision machining and assembly plant manufacturing camshafts, crankshafts, and rocker arm assemblies for Ford, Honda, and Nissan powertrain programs
- Own plant P&L of $320M in annual revenue; accountable for cost, quality, delivery, safety, and morale
- Maintained IATF 16949 certification with zero major findings for 8 consecutive audits
- Launched 3 new customer programs totaling $115M in new business: led APQP teams, managed timing plans, achieved full PPAP approval on all 14 part numbers
- Reduced plant scrap rate from 2.9% to 0.8% through Six Sigma projects and incoming quality improvements
- Improved OEE from 71% to 88% over 6 years through TPM implementation and planned maintenance rigor
- Managed $28M annual capital budget; led $14M CNC machining cell modernization project 3 weeks ahead of schedule
- Led workforce reduction and restructuring during 2020 COVID downturn — reduced headcount from 1,200 to 820 while preserving core skills and rehiring to full staffing within 10 months
- Zero experience managing plant operations beyond this single facility

Production Superintendent | Greystone Automotive Components | Toledo, OH | 2010 – 2015
- Managed machining and assembly departments (380 people across 2 shifts); accountable for daily production targets, quality, and safety
- Led kaizen blitz program eliminating $3.1M in annual manufacturing waste
- Implemented shift handoff standardization that reduced shift-change downtime by 34%

Production Supervisor | Greystone Automotive Components | Toledo, OH | 2006 – 2010
- Supervised machining department (90 people, 1 shift); managed daily scheduling, quality, and operator development
- Became certified TPS (Toyota Production System) trainer in 2008; trained 45 supervisors and team leaders

Manufacturing Engineer | Allied Precision Machining | Findlay, OH | 2003 – 2006
- Process engineering for crankshaft grinding and honing operations; designed tooling and work instructions

CNC Machinist | Allied Precision Machining | Findlay, OH | 2000 – 2003
- Set up and operated CNC turning and machining centers; promoted to Lead Machinist in 2002

EDUCATION
A.A.S. Manufacturing Technology | Owens Community College | 2000
B.S. Manufacturing Engineering Technology | University of Toledo | 2006 (completed while working)

CERTIFICATIONS
- Lean Six Sigma Black Belt — University of Michigan, 2012
- IATF 16949 Internal Auditor, 2011
- Toyota Production System (TPS) Certified Trainer, 2008`,

    jobDescription: `Vice President of Manufacturing — Lakewood Drive Systems
Toledo, OH | Full-Time | $275,000–$330,000 base + annual incentive

About Lakewood Drive Systems
Lakewood Drive Systems is a $1.8B Tier 1 automotive supplier manufacturing driveshafts, axles, and transfer cases for GM, Ford, Stellantis, and Volvo across 6 plants in Ohio, Michigan, and Tennessee. We are executing a Manufacturing Excellence transformation — standardizing operating practices, driving lean adoption, and improving multi-plant cost and quality performance. We need a VP of Manufacturing who can lead the plant manager organization and drive network-level results.

The Role
The VP of Manufacturing will lead 6 plant managers and be accountable for the combined manufacturing P&L ($1.2B in COGS and operating costs across all plants), network-level quality metrics, delivery performance to OEMs, and the Manufacturing Excellence program. This person must have multi-site manufacturing leadership experience — the complexity of coordinating 6 plants across 3 states, managing customer programs across a distributed network, and holding 6 plant managers accountable is fundamentally different from running a single plant, no matter how excellently.

Key Responsibilities
- Lead 6 plant managers; hold each accountable to safety, quality, delivery, cost, and morale metrics
- Own the consolidated manufacturing P&L across all 6 sites ($1.2B)
- Drive network-wide lean/TPS transformation; standardize lean deployment across plants at different maturity levels
- Manage OEM relationships at the operations level — interface with Ford, GM, and Stellantis supply chain and quality teams on network-level performance
- Lead capacity allocation decisions across network — which plants take new programs, how to manage cross-plant workload balancing
- Partner with Business Development on new program quoting — manufacturing cost models and capacity commitments
- Drive capital allocation across 6 plants; prepare consolidated capital request for board approval

Requirements
- 15+ years in automotive manufacturing with at least 5 years managing multiple facilities (3+ plants) simultaneously
- Multi-site P&L accountability — must have owned a consolidated manufacturing P&L
- Toyota Production System / Lean manufacturing expertise
- IATF 16949 quality system oversight experience
- OEM relationship management experience (Tier 1 supplier environment)

Preferred Qualifications
- Driveline or powertrain component manufacturing background
- Labor relations experience (UAW or other union environment)
- Experience managing plants across multiple states

Compensation
$275,000–$330,000 base | Annual incentive 20–30% of base | Full benefits + relocation assistance`,
  },
];
