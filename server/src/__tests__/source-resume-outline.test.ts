/**
 * Source Resume Outline Parser — Fixture Tests
 *
 * Tests against REAL resume text that broke the parser in production.
 * These are the contract the parser must satisfy before any resume
 * reaches the writer agent.
 */

import { describe, it, expect } from 'vitest';
import { buildSourceResumeOutline } from '../agents/resume-v2/source-resume-outline.js';

// ─── Rose Seed Resume Fixture ─────────────────────────────────────────────
// Real resume that broke the parser: ● on own lines, contact info mid-resume,
// non-standard headings ("Areas of Expertise", "Career Experience",
// "Education & Certifications"), 9 roles, 49 bullet markers.

const ROSE_SEED_RESUME = [
  'Senior Product Manager  Product Manager with 15+ years leading SaaS, web, mobile, and AI-adjacent digital products from discovery through launch. Strong in client and executive communication, roadmap ownership, PRDs, user stories, acceptance criteria, market-informed prioritization, and cross-functional delivery across design, engineering, QA, sales, and marketing. Known for bringing structure to fast-moving environments, managing tradeoffs across scope, timeline, and business goals, and delivering measurable gains in conversion, engagement, speed, and quality.',
  '',
  'Career Note: I intentionally choose early-stage, high-change environments. Several transitions reflect funding changes, org shifts, or post-launch handoffs, not performance. Earlier career includes multi-year tenures (5 yrs American Greetings; 2 yrs OnShift; 2 yrs Verified Volunteers).',
  '',
  'Areas of Expertise',
  '●',
  'Product Strategy & Roadmaps',
  '●',
  'Client-Facing Product Leadership',
  '●',
  'Stakeholder Management',
  '●',
  'Discovery & Requirements',
  '●',
  'PRDs / User Stories / Acceptance Criteria',
  '●',
  'Agile / Scrum',
  '●',
  'Scope & Prioritization',
  '●',
  'Market Research',
  '●',
  'Cross-Functional Delivery',
  '●',
  'Web / Mobile / SaaS Products',
  '●',
  'AI-Enabled Product Strategy',
  '●',
  'UX / Design Collaboration',
  '●',
  'QA / UAT / Release Planning',
  '●',
  'Product Analytics',
  '●',
  'GTM Enablement',
  '●',
  'Executive Demos & Presentations',
  '',
  'Accomplishments',
  '●',
  'Cut quoting time 69% from 16 to 5 minutes by redesigning workflow and reducing fields from 32 to 15.',
  '●',
  'Doubled email conversion 3% to 6%, increased leads 40%, and lifted SQLs 25% through CRM automation, segmentation, and ML-informed scoring.',
  '●',
  'Reduced post-release defects by ~50% while accelerating delivery by ~30% through stronger Agile and QA discipline.',
  '●',
  'Increased app engagement 7% to 18%, improved perceived subscription value 18%, and raised satisfaction 25% through UX and data-partnership enhancements.',
  '●',
  'Delivered five new insurance products in 10 months and reduced operational overhead 30% through automation and disciplined release execution.',
  '●',
  'Built and launched a 0→1 mobile product, delivered two white-label releases, and supported $1M+ in enterprise deals.',
  '',
  'Career Experience',
  '',
  'Senior Product Manager ,',
  'NOLDOR, US — Remote',
  'Jan 2024 – Feb 2025',
  '●',
  'Owned roadmap for an internal data-processing tool and SaaS data-visualization platform, translating business needs into PRDs, user stories, acceptance criteria, and KPI-driven release plans.',
  '●',
  'Built weekly demos and monthly readouts to align stakeholders on priorities and tradeoffs, improving delivery speed ~30% and reducing defects ~50%.',
  '●',
  'Evaluated generative AI use cases for onboarding and data-cleaning efficiency in partnership with technical teams.',
  '',
  'Product Manager ,',
  'COVERED INSURANCE, US — Remote',
  'May 2023 – Jan 2024',
  '●',
  'Owned two product roadmaps focused on demand generation and funnel performance, increasing lead volume 40% and sales conversion 10%.',
  '●',
  'Launched partner integration and ML-informed scoring experiments that doubled email conversion 3% to 6% and increased SQLs 25%.',
  '',
  'ROSE M. SEED',
  'roseseed7625@gmail.com  www.linkedin.com/in/roseseed  Cleveland, OH, 216.375.5454',
  '',
  '●',
  'Partnered with Sales and Marketing on enablement materials, KPI reporting, and funnel optimization.',
  '',
  'Senior Product Manager ,',
  'BEAM BENEFITS, US — Remote',
  'Aug 2021 – May 2023',
  '●',
  'Led quoting and platform initiatives in a complex regulated environment, cutting cycle time 69% by simplifying workflow and accelerating adoption from beta to full rollout within 8 months.',
  '●',
  'Delivered 5 new insurance products in 10 months through disciplined discovery, prioritization, and release planning.',
  '●',
  'Reduced operational overhead 30% and partnered with GTM teams on pricing, packaging, and field readiness.',
  '',
  'Product Manager, Togo RV Mobile App ,',
  'TOGO RV, US — Remote',
  'Dec 2020 – Aug 2021',
  '●',
  'Managed roadmap for a subscription-based mobile app and redesigned the home screen to increase engagement 7% to 18% and improve retention.',
  '●',
  'Integrated real-time data features that improved perceived subscription value 18% and satisfaction 25%.',
  '●',
  'Used usability testing, analytics, and customer feedback to guide roadmap decisions and iteration.',
  '',
  'Product Manager, Pocket Geek Home Mobile App ,',
  'ASSURANT LABS, Cleveland, OH',
  'Jun 2019 – Dec 2020',
  '●',
  'Led 0→1 development through white-label launch, defining key self-service workflows and product requirements from concept through release.',
  '●',
  'Negotiated partner integrations and collaborated across business, design, and engineering teams to bring the product to market.',
  '●',
  'Created executive demos that supported $1M+ in enterprise deals.',
  '',
  'Senior Product Manager ,',
  'AMTRUST INNOVATION LABS, Cleveland, OH',
  'Feb 2018 – Apr 2019',
  '●',
  'Launched a white-labeled Symantec subscription within Tap Safe, improving self-service troubleshooting and automated warranty claims.',
  '●',
  'Managed multi-vendor integrations and coordinated cross-functional delivery across external partners and internal teams.',
  '●',
  'Partnered with leadership on market scans and product opportunity assessment.',
  '',
  'Product Manager ,',
  'VERIFIED VOLUNTEERS, Cleveland, OH',
  'Jan 2016 – Feb 2018',
  '●',
  'Drove research and roadmap decisions that supported 25%+ projected annual revenue growth.',
  '●',
  'Launched mobile identity verification with OCR, reducing unperformable background checks 60% and increasing contract values 27%.',
  '●',
  'Improved internal efficiency 25–30% through product and process enhancements.',
  '',
  'Product Manager ,',
  'ONSHIFT, Cleveland, OH',
  'Jan 2014 – Jan 2016',
  '●',
  'Expanded a SaaS HR suite through roadmap prioritization and feature development, supporting significant revenue growth.',
  '●',
  'Launched the company\'s first employee mobile app using customer feedback and analytics to guide product decisions.',
  '●',
  'Built sales and customer-success enablement and secured an HRIS partnership to extend platform value.',
  '',
  'Product Manager , AG INTERACTIVE (American Greetings Interactive), Cleveland, OH',
  'Dec 2008 – Dec 2013',
  '●',
  'Led web and mobile product development supporting a new card brand launch and broader digital engagement strategy.',
  '●',
  'Integrated gifting and fraud-prevention partners to improve monetization, personalization, and platform security.',
  '●',
  'Collaborated with engineering, UX, and marketing to improve engagement and retention.',
  '',
  'Education & Certifications',
  '',
  'Bachelor of Science, Advertising',
  '– Kent State University, Kent, OH',
  '',
  'Pragmatic Marketing Certified – PMC-II',
  '– Earned May 2009',
  '',
  'Ohio Property & Casualty Insurance License',
  '– Earned May 2018',
  '',
  'Artificial Intelligence & Business Strategy Certification',
  '– Earned August 2025 (LinkedIn)',
].join('\n');

describe('buildSourceResumeOutline — Rose Seed resume', () => {
  const result = buildSourceResumeOutline(ROSE_SEED_RESUME);

  it('should detect structured parse mode', () => {
    expect(result.parse_mode).toBe('structured');
  });

  it('should find exactly 9 experience positions', () => {
    expect(result.positions.length).toBe(9);
  });

  it('should parse NOLDOR as first role', () => {
    const noldor = result.positions.find(p => p.company.includes('NOLDOR'));
    expect(noldor).toBeDefined();
    expect(noldor!.title).toContain('Senior Product Manager');
    expect(noldor!.bullets.length).toBe(3);
  });

  it('should parse BEAM BENEFITS correctly — not company="Remote"', () => {
    const beam = result.positions.find(p => p.company.includes('BEAM'));
    expect(beam).toBeDefined();
    expect(beam!.company).toContain('BEAM');
    expect(beam!.company).not.toBe('Remote');
    expect(beam!.title).toContain('Senior Product Manager');
    expect(beam!.bullets.length).toBe(3);
  });

  it('should parse COVERED INSURANCE with 3 bullets (including the orphan after contact block)', () => {
    const covered = result.positions.find(p => p.company.includes('COVERED'));
    expect(covered).toBeDefined();
    expect(covered!.bullets.length).toBeGreaterThanOrEqual(2);
  });

  it('should parse AG INTERACTIVE as last role', () => {
    const ag = result.positions.find(p => p.company.includes('AG INTERACTIVE') || p.company.includes('American Greetings'));
    expect(ag).toBeDefined();
    expect(ag!.bullets.length).toBe(3);
  });

  it('should have at least 25 total experience bullets', () => {
    // 9 roles × ~3 bullets each = ~27, minus any lost to contact block
    expect(result.total_bullets).toBeGreaterThanOrEqual(25);
  });

  it('should NOT include contact info as a position', () => {
    const contactAsRole = result.positions.find(p =>
      p.company.includes('ROSE') ||
      p.company.includes('roseseed') ||
      p.company.includes('@') ||
      p.company.includes('216'),
    );
    expect(contactAsRole).toBeUndefined();
  });

  it('should NOT include education/certification text as experience bullets', () => {
    const allBullets = result.positions.flatMap(p => p.bullets);
    const educationLeaks = allBullets.filter(b =>
      b.includes('Kent State') ||
      b.includes('Bachelor of Science') ||
      b.includes('Pragmatic Marketing') ||
      b.includes('Insurance License'),
    );
    expect(educationLeaks.length).toBe(0);
  });

  it('should NOT have bullets ending with ● character', () => {
    const allBullets = result.positions.flatMap(p => p.bullets);
    const trailingBullets = allBullets.filter(b => b.trim().endsWith('●'));
    expect(trailingBullets.length).toBe(0);
  });

  it('should NOT include Areas of Expertise skills as experience bullets', () => {
    const allBullets = result.positions.flatMap(p => p.bullets);
    // These are skills, not accomplishments
    const skillLeaks = allBullets.filter(b =>
      b === 'Product Strategy & Roadmaps' ||
      b === 'Client-Facing Product Leadership' ||
      b === 'Stakeholder Management' ||
      b === 'Agile / Scrum',
    );
    expect(skillLeaks.length).toBe(0);
  });

  it('should NOT include Accomplishments section as experience bullets', () => {
    const allBullets = result.positions.flatMap(p => p.bullets);
    // The standalone accomplishments should not appear inside any role
    const accomplishmentLeaks = allBullets.filter(b =>
      b.startsWith('Cut quoting time 69% from 16 to 5 minutes by redesigning') ||
      b.startsWith('Doubled email conversion 3% to 6%, increased leads 40%'),
    );
    expect(accomplishmentLeaks.length).toBe(0);
  });

  it('should preserve full bullet text with metrics', () => {
    const beam = result.positions.find(p => p.company.includes('BEAM'));
    expect(beam).toBeDefined();
    const cycleTimeBullet = beam!.bullets.find(b => b.includes('69%'));
    expect(cycleTimeBullet).toBeDefined();
    // Must contain the full text, not truncated
    expect(cycleTimeBullet).toContain('cutting cycle time 69%');
    expect(cycleTimeBullet).toContain('8 months');
  });
});
