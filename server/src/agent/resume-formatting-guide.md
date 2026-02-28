# EXECUTIVE RESUME BUILDER: FORMATTING & STRUCTURE GUIDE

## Complete Specifications for Resume Document Generation

---

## I. AGENT MISSION & QUALITY STANDARDS

### A. Primary Objective

Create production-quality, ATS-optimized executive resume DOCX documents for mid-to-upper level professionals aged 45+ (average 53-56). This agent owns document structure, formatting, section organization, and export specifications. Content (bullet text, summaries, accomplishments) is authored by upstream agents.

### B. Quality Bar

- **Production-ready** — paid product quality, zero formatting errors
- **ATS-optimized** — must pass iCIMS, Workday, Greenhouse, Lever, Taleo (98%+ of Fortune 500 use ATS; 75% of resumes are filtered before a human sees them)
- **DOCX primary** — highest ATS parsing success rate; PDF secondary via browser print
- **Professional appearance** — clean, sophisticated, executive-level

### C. Target Audience

- **Experience Level**: 10-25+ years
- **Typical Roles**: VP, SVP, Director, C-Suite
- **Page Length**: 2-3 pages

---

## II. FILE FORMAT & EXPORT

### A. DOCX (Primary)

- 95%+ parsing success across all major ATS (confirmed 2025-2026)
- Allows recruiter editing
- Native text extraction
- **Always create DOCX first as the master document**

### B. PDF (Secondary)

- Must be text-based (selectable/copyable text) — NOT image-based
- Generated via browser `window.print()` on the WYSIWYG preview
- Text-based PDFs from "Save as PDF" parse nearly as well as DOCX on modern ATS

### C. Export Requirements

- File size under 2MB
- Filename: `Firstname_Lastname_Company_Resume.docx`
- No password protection, macros, form fields, embedded objects, comments, or track changes

---

## III. DOCUMENT FORMATTING SPECIFICATIONS

### A. Margins

| Setting | Value | Notes |
|---------|-------|-------|
| **Default** | 1.0 inch (720 twips) all sides | Professional standard |
| **Minimum** | 0.75 inch (540 twips) | Only if space critically needed |
| **Absolute minimum** | 0.5 inch (360 twips) | Use rarely |

Left/right margins MUST be identical. Top/bottom margins MUST be identical.

### B. Typography

**Approved ATS-Safe Fonts:**

| Font | Best For |
|------|----------|
| **Calibri** (recommended) | Technology, consulting, modern industries |
| **Arial** (recommended) | Universal, clean |
| Helvetica | Modern industries |
| Verdana | Screen readability |
| Times New Roman | Traditional industries (finance, legal, healthcare) |
| Georgia | Traditional industries |
| Garamond | Traditional industries |

**Font Size Hierarchy (in half-points for docx library):**

| Element | Size | Half-points | Style |
|---------|------|-------------|-------|
| Name | 18-24pt | 36-48 | Bold |
| Section Headings | 12-14pt | 24-28 | Bold, optional ALL CAPS |
| Job Titles | 11-12pt | 22-24 | Bold |
| Company Names | 10-11pt | 20-22 | Regular or Semi-Bold |
| Body Text / Bullets | 10-11pt | 20-22 | Regular (10pt minimum) |
| Contact Info | 10-11pt | 20-22 | Regular |

**Rules:**
- Use 1 font family maximum (the docx library's `font` property on TextRun)
- Bold/italic for emphasis only — use sparingly
- Consistent sizing throughout

### C. Spacing (in twips; 1pt = 20 twips)

| Element | Spacing | Twips |
|---------|---------|-------|
| Line spacing | 1.0 to 1.15 | Use `line: 240` (single) or `line: 276` (1.15) |
| After each bullet | 3-6pt | 60-120 |
| Between sections | 12-24pt | 240-480 |
| Before section headings | 12-18pt | 240-360 |
| After section headings | 6-12pt | 120-240 |
| Between job entries | 12-18pt | 240-360 |

### D. Bullet Points

**ATS-Safe Bullet Styles:**
- Standard round bullet (default in docx `bullet: { level: 0 }`) — **safest, use this**
- Dash (-) — acceptable
- Square bullet — acceptable

**Forbidden:** arrows, check marks, stars, emoji, wingdings, any fancy symbols

**Formatting:**
- Left-aligned with hanging indent (0.25-0.5 inches = 180-360 twips)
- 1-2 lines per bullet maximum (3 lines absolute max)
- 4-8 bullets per role (varies by recency)

### E. Color

**Safest:** Black text (#000000) on white background

**Acceptable:** Black body text + ONE accent color for section headings only:
- Dark blue: #003366 or #0066CC
- Dark gray: #333333 or #444444

**Forbidden:**
- More than 2 total colors
- Colored backgrounds or shading
- Reversed text (white on dark)
- Low-contrast combinations

---

## IV. ATS COMPATIBILITY — CONFIRMED RULES (2025-2026)

### A. ATS-Killing Elements (ABSOLUTELY FORBIDDEN)

All of the following have been **independently confirmed** as still problematic across iCIMS, Workday, Greenhouse, Lever, and Taleo:

| Element | Why It Fails |
|---------|-------------|
| **Tables** | Content read out of order or dropped entirely |
| **Text boxes** | Content invisible to ATS parser |
| **Headers/footers with contact info on page 1** | 25% of ATS systems miss contact info in headers (TopResume study) |
| **Images, graphics, logos, icons** | ATS cannot "see" visual elements |
| **Charts, progress bars, skill ratings** | Completely unparseable |
| **Photos/headshots** | Ignored by ATS, potential bias trigger |
| **QR codes** | Not parsed |
| **Fancy/decorative fonts** | May not render; breaks parsing |
| **Creative section headings** | ATS looks for standard terminology |
| **Multiple colors (>2)** | Can break parsing of colored text |

### B. ATS-Safe Elements

| Element | Notes |
|---------|-------|
| Bold text | Safe for emphasis |
| Italic text | Use sparingly |
| UPPERCASE headings | Optional, ATS reads fine |
| Simple bullets | Standard round, dash, square only |
| Horizontal lines (1-2pt solid) | Safe via paragraph borders |
| Underline | Use sparingly |
| Hyperlinks as visible URLs | ATS does NOT parse hidden link text — always show full URL |

### C. Standard Section Headings (use these exact terms)

ATS systems look for these specific keywords. While modern NLP-powered ATS can recognize some variations, standard terminology remains safest:

- Contact Information
- Professional Summary / Executive Summary / Profile
- Professional Experience / Work Experience / Employment History
- Education / Education & Certifications
- Core Competencies / Technical Skills / Areas of Expertise / Professional Skills
- Selected Accomplishments / Career Highlights / Key Achievements
- Certifications / Professional Certifications
- Publications
- Awards / Awards & Honors
- Professional Affiliations

### D. Date Formats (ATS-Compatible)

- **MM/YYYY** (03/2023 - Present) — most compatible
- **Month YYYY** (March 2023 - Present) — acceptable
- **YYYY only** for positions 15+ years ago (2005 - 2008)

---

## V. PAGE LENGTH & STRUCTURE

### A. Length by Experience Level

| Experience | Ideal Length | Notes |
|-----------|-------------|-------|
| 10-15 years | 2 pages | Can extend to 3 if necessary |
| 15-25+ years / C-Suite | 2-3 pages | 3 pages increasingly acceptable |
| **Never** | <1.5 pages | Appears sparse |
| **Never** | >4 pages | Poor prioritization |

### B. Page Break Rules

**Page 1 Strategy** — treat as standalone "branded calling card":
- MUST include: Name & Contact, Professional Summary, Core Competencies, and either Selected Accomplishments or start of Experience
- Assume recruiter may not read beyond page 1

**Page 2-3 Header:**
- Include name and contact in smaller font (10pt)
- Format: `John Smith; john.smith@email.com; (555) 123-4567; Page 2`

**Break Positioning:**
- NEVER break within a job entry — use `keepNext: true` on job title paragraphs and `keepLines: true` on job entry groups
- NEVER strand a single bullet on new page (widow/orphan control via `widowControl: true`)
- Break between job entries or between major sections
- If final page has <1/3 content, edit down to previous page (unless that would require margins <0.75" or font <10pt)

---

## VI. SECTION INVENTORY

### Required Sections (must always appear)

1. **Header / Contact Information**
2. **Professional Summary / Executive Summary**
3. **Professional Experience / Work History**
4. **Education**

### Highly Recommended

5. **Core Competencies / Professional Skills / Areas of Expertise**
6. **Certifications & Licenses** (if applicable)

### Optional (include only when substantive & relevant)

7. **Selected Accomplishments / Career Highlights** (4-6 cross-career bullets)
8. **Technical Proficiencies** (separate section for highly technical roles only)
9. **Awards & Honors** (industry-significant only, not internal company awards)
10. **Publications** (major industry journals/media only, minimum 3 items)
11. **Patents** (for technical executives with registered patents)
12. **Professional Affiliations** (only if 3+ substantive memberships)
13. **Languages** (only if fluent/business proficient in 2+ languages)
14. **Earlier Career** (condensed summary of positions 15-20+ years ago)

### Emerging Sections (use selectively)

15. **AI Tools & Technologies** (only for executives with genuine AI/ML expertise)
16. **Working Knowledge Of** (secondary skills — use cautiously for 45+ executives)

### Never Include

- Objective Statement
- "References Available Upon Request"
- Personal Information (age, birthdate, marital status, photo, SSN)
- Hobbies/Interests (unless directly business-relevant)
- High school (if college degree present)
- Salary history / requirements

### Clarifications

- Board positions and advisory roles belong in Professional Experience, not a separate section
- Speaking engagements combine with Publications if truly substantive (3+ major items)
- Digital transformation initiatives are bullet points within Professional Experience, not sections

---

## VII. THE 8 EXECUTIVE RESUME TEMPLATES

### Template Selection Matrix

| Condition | Template |
|-----------|----------|
| Finance, legal, healthcare, manufacturing, insurance | **1: Classic Achievement-Focused** |
| Technology, startups, consulting, digital, fast-growth | **2: Modern Skills-First** |
| C-Suite or seeking board positions | **3: Executive Strategic Hybrid** |
| CTO, CIO, VP Engineering, VP Product, R&D | **4: Specialized/Technical** |
| Turnaround, transformation, restructuring, change mgmt | **5: Transformation/Change Leader** |
| Non-profit, foundation, social impact, NGO, philanthropy | **6: Non-Profit Mission-Driven** |
| General Counsel, CCO, regulatory affairs, compliance, legal | **7: Legal & Regulatory Executive** |
| CMO, VP Marketing, Chief Digital Officer, VP Product, brand | **8: Creative & Digital Executive** |
| **Default when uncertain** | **1: Classic Achievement-Focused** |

### Template 1: Classic Achievement-Focused

**Best for:** Traditional industries, executives 45+ with strong track record, conservative environments

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2-3 pages |
| Font | Times New Roman or Georgia |
| Body size | 11pt (22 half-points) |
| Heading size | 12-14pt (24-28 half-points) |
| Name size | 20-22pt (40-44 half-points) |
| Color | Black + optional dark blue #003366 headings |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (3-5 sentences)
3. Core Competencies (10-15 skills, bullet-separated flowing text)
4. Selected Accomplishments (4-6 bullets)
5. Professional Experience (reverse chronological)
6. Education & Certifications
7. Professional Affiliations (if 3+ memberships)
8. Awards & Honors (if applicable)
9. Publications (if applicable)

**Design Elements:**
- 1pt black horizontal line below name
- Section headings: Bold, ALL CAPS optional, with bottom border
- Dates right-aligned at job entry level

### Template 2: Modern Skills-First

**Best for:** Technology executives, digital transformation leaders, career changers, fast-growth companies

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2 pages ideal |
| Font | Calibri or Arial |
| Body size | 10-11pt |
| Heading size | 12-14pt |
| Name size | 22-24pt |
| Color | Black + dark blue #0066CC or dark gray #333333 headings |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (3-4 sentences, concise)
3. Core Competencies (15-18 skills in 3 themed categories)
4. AI Tools & Technologies (if applicable)
5. Professional Experience (4-6 bullets per role)
6. Selected Accomplishments (3-5 bullets)
7. Education & Certifications
8. Working Knowledge Of (secondary skills, if applicable)
9. Professional Affiliations (brief)

### Template 3: Executive Strategic Hybrid

**Best for:** C-suite, board-seeking candidates, 15-25+ years experience, governance roles

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2-3 pages |
| Font | Times New Roman, Garamond, or Georgia |
| Body size | 11pt |
| Name size | 20-22pt |
| Color | Black + optional dark gray #666666 dividers |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact — executive presence)
2. Executive Profile (4-5 sentences, governance-focused)
3. Areas of Expertise (12-15 competencies, strategic domain categories)
4. Leadership Achievements (6-8 bullets, board-level impact)
5. Executive Experience (3-5 bullets per role, strategic focus)
6. Education & Executive Credentials
7. Professional Affiliations (industry leadership positions)
8. Publications (if applicable)
9. Awards & Honors (if applicable)
10. Earlier Career (condensed, 1-2 lines per role for 15+ year old positions)

**Design Elements:**
- Generous spacing (18-24pt between sections)
- Elegant horizontal lines (1pt dark gray) as dividers
- Company descriptors include size/scope (e.g., "$2B healthcare system")

### Template 4: Specialized/Technical Executive

**Best for:** CTO, CIO, VP Engineering, VP Product, R&D executives

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2-3 pages |
| Font | Arial, Calibri, or Helvetica |
| Body size | 10-11pt |
| Name size | 22-24pt |
| Color | Black + dark blue #003399 for technical section headings |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (technical leadership + business impact)
3. Core Competencies (15-18 skills, blend technical + strategic + leadership)
4. Selected Accomplishments (4-6 bullets, technical initiatives with business outcomes)
5. Professional Experience (balance technical depth with strategic leadership)
6. AI Tools & Technologies (prominent, 12-15 items)
7. Technical Proficiencies (categorized: Languages & Frameworks, Platforms & Infrastructure, Methodologies & Tools)
8. Patents / Intellectual Property (if 3+ patents)
9. Education & Certifications
10. Publications / Conference Presentations
11. Professional Affiliations (IEEE, ACM, etc.)

### Template 5: Transformation/Change Leader

**Best for:** Turnaround executives, restructuring specialists, M&A integration, change management

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2 pages (tight and impactful) |
| Font | Calibri or Arial |
| Body size | 10-11pt |
| Name size | 22-24pt |
| Color | Black + bold accent #003366 or #333333 |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (transformation-focused language)
3. Core Competencies (weighted toward change management, transformation)
4. Transformation Highlights (5-7 bullets, before/after metrics mandatory, Challenge -> Action -> Result format)
5. Professional Experience (heavy emphasis on change initiatives)
6. Education & Certifications (include Prosci, Kotter, etc.)
7. Professional Affiliations (Turnaround Management Association, etc.)
8. Awards & Honors (if transformation-related)

**Design Elements:**
- Bold, action-oriented aesthetic
- Section headings: 13-14pt Bold ALL CAPS with accent color
- Strong before/after formatting: "Increased from X to Y" or "Reduced X by Y%"

### Template 6: Non-Profit Mission-Driven

**Best for:** Executive Directors, VP of Programs, Chief Development Officers, foundation leaders, social impact executives, NGO and philanthropy roles

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2 pages |
| Font | Garamond |
| Body size | 11pt |
| Heading size | 12-14pt |
| Name size | 20-22pt |
| Color | Black + teal #1A6B6B for section headings |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (mission-alignment language — lead with the cause, follow with scope)
3. Areas of Impact (10-14 competencies framed around impact domains: e.g., "Community Development", "Grant Management", "Stakeholder Engagement")
4. Selected Accomplishments (4-6 bullets; metrics: lives served, funds raised, programs launched, partnerships formed)
5. Professional Experience (emphasize mission outcomes alongside operational scale)
6. Education & Certifications
7. Board & Advisory Roles (if applicable — prominent for non-profit sector)
8. Professional Affiliations (sector associations: AFP, AAMFT, etc.)

**Design Elements:**
- Understated, clean aesthetic — gravitas without flash
- Garamond conveys institutional credibility without corporate stiffness
- Impact metrics formatted as: "Served 12,000+ families annually" or "Raised $47M over 5 years"
- Board & Advisory Roles section treated with same weight as Experience

**Writing Guidance:**
- Lead with the mission, not the organization name
- Use sector language: "beneficiaries", "stakeholders", "programmatic outcomes", "theory of change"
- Avoid corporate buzzwords (synergy, leverage, scalability) — use mission-driven equivalents
- Quantify both financial stewardship (budget managed) and human impact (people served, outcomes achieved)

### Template 7: Legal & Regulatory Executive

**Best for:** General Counsel, Chief Legal Officer, Chief Compliance Officer, VP Regulatory Affairs, Senior Partners transitioning to in-house, regulatory executives

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2-3 pages |
| Font | Times New Roman |
| Body size | 11pt |
| Heading size | 12-14pt |
| Name size | 20-22pt |
| Color | Black + dark navy #0D2B55 for section headings |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (jurisdictions, regulatory domains, leadership scope)
3. Core Practice Areas (10-14 competencies: specific regulatory frameworks, legal disciplines, and risk domains)
4. Selected Accomplishments (4-6 bullets: legal wins, regulatory clearances, risk reduction metrics, settlements avoided, policy outcomes)
5. Professional Experience (balance legal outcomes with business impact — avoid legalese in descriptions)
6. Bar Admissions & Jurisdictions (dedicated section: list each state/jurisdiction bar admission and year)
7. Education (JD at top, undergraduate below; include law review, moot court, honors if within last 20 years)
8. Certifications & Licenses (CIPP, CISA, CFE, or other relevant compliance/regulatory credentials)
9. Professional Affiliations (ABA sections, industry associations, regulatory bodies)

**Design Elements:**
- Conservative, formal layout — reflects legal profession's institutional norms
- Times New Roman signals tradition and credibility appropriate to the bar
- Bar Admissions section must be clearly visible — a key credential for in-house roles
- Avoid decorative elements — substance over style

**Writing Guidance:**
- Lead bullets with outcomes, not activities: "Resolved $120M antitrust exposure" not "Managed antitrust litigation"
- Name specific regulatory frameworks: GDPR, CCPA, HIPAA, SOX, FCPA, SEC Rule 10b-5
- Quantify risk mitigation: "$500M in regulatory fines avoided", "Zero material weaknesses over 7 years"
- For GC roles, emphasize business partnership alongside legal expertise
- Never use legalese in bullets — write for business audiences, not legal colleagues

### Template 8: Creative & Digital Executive

**Best for:** CMO, VP of Marketing, Chief Digital Officer, VP of Product, Chief Brand Officer, VP of Growth, digital transformation leaders in consumer-facing industries

| Property | Value |
|----------|-------|
| Layout | Single column |
| Length | 2 pages ideal (2-3 acceptable for 20+ year careers) |
| Font | Calibri |
| Body size | 10-11pt |
| Heading size | 12-14pt |
| Name size | 22-24pt |
| Color | Black + slate blue #3A5A8C for section headings |
| Margins | 1.0 inch all sides |

**Section Order:**
1. Header (Name & Contact)
2. Professional Summary (brand voice, digital scope, growth orientation)
3. Core Competencies (15-18 skills across 3 categories: Brand & Creative, Digital & Growth, Leadership & Strategy)
4. Selected Accomplishments (5-7 bullets; emphasis on brand metrics, campaign ROI, user acquisition, revenue attribution, digital transformation milestones)
5. Professional Experience (balance creative vision with business outcomes — always attach metrics)
6. Education & Certifications (include relevant digital credentials: Google Analytics, HubSpot, Salesforce, etc.)
7. Professional Affiliations (AMA, MMA, industry boards, advisory roles)

**Design Elements:**
- Modern, clean aesthetic — slightly bolder heading weight than Classic templates
- Calibri keeps the resume ATS-safe while feeling contemporary
- Competencies organized into 3 thematic categories (not a flat list) to signal strategic breadth
- Metrics should be prominent and specific: "3.2M app downloads", "$180M media budget", "42% CAC reduction"

**Writing Guidance:**
- Lead with brand and business outcomes — never lead with creative awards alone
- Quantify digital impact: DAU/MAU growth, conversion rate improvements, ROAS, LTV/CAC ratios
- Include platform fluency where genuinely relevant: Salesforce, Adobe Experience Cloud, Google/Meta Ads ecosystem
- Balance creative leadership ("redefined brand identity") with financial accountability ("within $2M budget")
- For CDO roles, emphasize technology stack decisions alongside transformation outcomes

---

## VIII. SECTION FORMATTING SPECIFICATIONS

### Section 1: Header / Contact Information

**Format:**
```
JOHN SMITH
City, State; (555) 123-4567; john.smith@email.com; linkedin.com/in/johnsmith
```

**Implementation:**
- Name: 18-24pt Bold, centered (`AlignmentType.CENTER`)
- Contact line: 10-11pt Regular, centered, single line
- Separators: semicolons or commas between contact elements (never vertical bars)
- LinkedIn: full URL visible (ATS does NOT parse hidden link text)
- Location: City, State only (NO street address)
- Placement: document body on page 1, NOT in Word header
- Horizontal rule after contact line (1-2pt `BorderStyle.SINGLE`)
- 12-18pt spacing after before next section

**Never include:** photos, full street address, multiple phone/email, icons

### Section 2: Professional Summary

**Format:** 3-5 sentences (60-100 words), single flowing paragraph (no bullets)

**Implementation:**
- Heading: "PROFESSIONAL SUMMARY" or "EXECUTIVE SUMMARY" — 12-14pt Bold
- Body: 10-11pt Regular, 1.15 line spacing, left-aligned
- 12-18pt spacing after before next section

### Section 3: Core Competencies / Skills

**Recommended format — flowing text with bullet separators:**
```
Strategic Planning - P&L Management - M&A Integration - Change Management -
Team Building & Leadership - Business Process Improvement - Digital Transformation
```

**Implementation:**
- Skills as continuous flowing text with bullet separators (middle dot, comma, or semicolon)
- Natural text wrapping creates visual 2-3 column effect
- Maintains single-column structure (100% ATS-safe)
- 10-15 skills typical, up to 20 maximum
- Line spacing: 1.15-1.3 for readability

**Categorized variant** (for Templates 2, 3, 4):
- Category subheadings: 11pt Bold
- Skills under each category: 10-11pt with bullet separators
- 6-8pt spacing between categories

**Never use:** tables, text boxes, multi-column layout, icons/graphics

### Section 4: Selected Accomplishments

**Implementation:**
- Heading: "SELECTED ACCOMPLISHMENTS" or "CAREER HIGHLIGHTS" — 12-14pt Bold
- Bullets: standard round, 10-11pt body text
- Hanging indent: 0.25-0.5 inches (180-360 twips via `indent: { left: 360, hanging: 360 }`)
- 3-6pt after each bullet
- 4-6 bullets total, 1-2 lines each

### Section 5: Professional Experience

**Structure per job entry:**
```
JOB TITLE                                                    MM/YYYY - Present
Company Name (descriptor if not well-known), City, State

[Optional: 1-2 sentence scope/context paragraph]

- Achievement bullet 1
- Achievement bullet 2
```

**Implementation:**

| Element | Format | docx Properties |
|---------|--------|----------------|
| Job Title | 11-12pt Bold | `bold: true, size: 22-24` + `keepNext: true` |
| Company + Location | 10-11pt Regular | `size: 20-22, color: '666666'` |
| Dates | 10pt Regular, right-aligned or inline | |
| Context paragraph | 10-11pt Regular, 1-3 lines max | Not bulleted |
| Achievement bullets | 10-11pt, hanging indent | `bullet: { level: 0 }` |

**Bullets per role by recency:**
- Current/most recent: 6-8 bullets
- 2-5 years ago: 4-6 bullets
- 5-10 years ago: 3-5 bullets
- 10-15 years ago: 1-3 bullets

**Spacing:** 12-18pt between complete job entries

### Section 6: Education

**Format:**
```
Master of Business Administration (MBA), Finance
University of Chicago Booth School of Business, Chicago, IL, 2005
```

**Rules:**
- Reverse chronological (most recent first)
- 6-8pt between degrees
- Remove graduation year if 20+ years ago (exception: Ivy League/top MBA — prestige outweighs age signal)
- Never include high school if college degree present

### Section 7: Certifications

**Format:**
```
Project Management Professional (PMP), Project Management Institute, 2018
Lean Six Sigma Black Belt, American Society for Quality, 2016
```

- List only current/active certifications
- Order: most relevant first OR most recent first
- Can be combined with Education: "EDUCATION & CERTIFICATIONS"

### Section 8: Earlier Career (condensed)

**For positions 15-20+ years ago:**

Brief entries:
```
Senior Manager, ABC Corporation (Chicago, IL), 2003 - 2008
- Led operations team of 25 employees with $15M budget
```

Or list format (no bullets):
```
Senior Operations Manager, XYZ Manufacturing (Detroit, MI), 2002 - 2008
Production Supervisor, ABC Industries (Chicago, IL), 1998 - 2002
```

---

## IX. AGE DISCRIMINATION PROTECTIONS (45+ EXECUTIVES)

### Remove

- Graduation dates 20+ years ago (unless Ivy League/top MBA)
- Phrases like "30 years of experience" or "extensive career spanning decades"
- Outdated technology (MS-DOS, Lotus 1-2-3, AS/400, Windows 95)
- Detailed positions from 1980s-1990s (condense to Earlier Career)
- "References available upon request"
- Full street address
- Objective statements

### Emphasize

- Recent achievements (last 5-10 years get 70-80% of content)
- Modern technologies: AI, cloud, SaaS, data analytics
- Current methodologies: Agile, Design Thinking, Data-Driven Decision Making
- Digital transformation examples
- LinkedIn URL (shows digital presence)
- Recent certifications (shows continuous learning)

### Date Handling

| Recency | Format |
|---------|--------|
| 0-10 years | MM/YYYY |
| 10-15 years | Month YYYY or YYYY only |
| 15+ years | YYYY only |
| 20+ years | Condense to Earlier Career with YYYY only |

---

## X. DOCX IMPLEMENTATION SPECIFICATIONS

These are specific to the `docx` npm library v9.5.3 used in our export system.

### A. Document Structure

```typescript
new Document({
  creator: 'Resume Agent',
  title: `${contactInfo.name} Resume`,
  styles: { paragraphStyles: [...] },  // Define reusable styles
  sections: [{
    properties: {
      page: {
        margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 1 inch
      },
    },
    headers: {
      default: new Header({ ... }), // Name + contact on pages 2+
    },
    children: [...paragraphs],
  }],
})
```

### B. Paragraph Styles to Define

| Style Name | Size | Bold | Spacing Before | Spacing After | Other |
|-----------|------|------|---------------|---------------|-------|
| ResumeName | 40-48 (20-24pt) | true | 0 | 40 | Centered |
| ContactLine | 20-22 (10-11pt) | false | 0 | 80 | Centered, color #666666 |
| SectionHeading | 24-28 (12-14pt) | true | 240-360 | 120-240 | ALL CAPS, bottom border |
| JobTitle | 22-24 (11-12pt) | true | 240 | 40 | `keepNext: true` |
| CompanyLine | 20-22 (10-11pt) | false | 0 | 40 | color #666666 |
| BulletItem | 20-22 (10-11pt) | false | 0 | 60-120 | Hanging indent, bullet |
| BodyText | 20-22 (10-11pt) | false | 0 | 120 | |

### C. Key docx Features to Use

| Feature | Property | Purpose |
|---------|----------|---------|
| Keep with next | `keepNext: true` | Prevent job title separating from company |
| Keep lines together | `keepLines: true` | Keep job entry together |
| Widow/orphan control | `widowControl: true` | Prevent single-line page breaks |
| Hanging indent | `indent: { left: 360, hanging: 360 }` | Bullet alignment |
| Page break | `pageBreakBefore: true` | Force section to new page |
| Horizontal rule | `border: { bottom: { style: BorderStyle.SINGLE, size: 1-2 } }` | Section dividers |

### D. Page 2+ Headers

```typescript
headers: {
  default: new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({ text: `${name}; ${email}; ${phone}; Page `, size: 20, font: 'Calibri', color: '999999' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 20, font: 'Calibri', color: '999999' }),
        ],
      }),
    ],
  }),
}
```

Note: Use `titlePage: true` in section properties to suppress header on page 1 (contact info goes in document body instead).

### E. Skills as Flowing Visual Columns

```typescript
new Paragraph({
  spacing: { after: 120 },
  children: [
    new TextRun({ text: skills.join(' \u2022 '), size: 20, font: 'Calibri' }),
    // \u2022 = bullet separator
  ],
})
```

This creates a visually multi-column appearance while maintaining single-column ATS-safe structure.

### F. Document Metadata

```typescript
new Document({
  title: `${contactInfo.name} Resume`,
  creator: 'Resume Agent',
  description: `Resume for ${contactInfo.name}`,
  ...
})
```

---

## XI. QUALITY ASSURANCE CHECKLIST

### Formatting Consistency
- [ ] Single font family used throughout
- [ ] Consistent font sizes (name > headings > subheadings > body)
- [ ] Consistent bullet style throughout
- [ ] Consistent date format throughout
- [ ] Consistent spacing between sections
- [ ] Margins identical on opposing sides
- [ ] No orphaned bullets (single bullet stranded on new page)

### ATS Compatibility
- [ ] Single-column layout
- [ ] NO tables, text boxes, images, graphics, icons, charts
- [ ] NO headers/footers with critical info on page 1
- [ ] Standard section headings used
- [ ] Simple bullets only
- [ ] Standard fonts only
- [ ] Contact info in document body on page 1
- [ ] LinkedIn as visible full URL (not hidden hyperlink)

### Page Structure
- [ ] 2-3 pages appropriate for experience level
- [ ] Page 1 stands alone with key information
- [ ] No short final page (<1/3 content)
- [ ] Page breaks don't split job entries
- [ ] Name & contact in header on pages 2-3
- [ ] `keepNext` applied to job title paragraphs
- [ ] `keepLines` applied to job entry groups

### Age 45+ Protections
- [ ] Old graduation dates removed (unless prestigious school)
- [ ] No "years of experience" phrases
- [ ] Outdated technology skills removed
- [ ] Modern skills/technologies included
- [ ] Last 5-10 years get 70-80% of content
- [ ] Old positions condensed to Earlier Career

### Export
- [ ] DOCX opens correctly in Word
- [ ] Filename: `Firstname_Lastname_Company_Resume.docx`
- [ ] File size under 2MB
- [ ] No passwords, protection, or restrictions

---

## XII. COMMON MISTAKES TO AVOID

1. Using tables for any section layout
2. Multiple font families (max 1)
3. Inconsistent spacing between sections
4. Margins <0.5 inch (cramped appearance)
5. Font size <10pt (unreadable)
6. Mixing bullet styles throughout document
7. Headers/footers with contact info on page 1
8. Text boxes for any content
9. Manual spacing with multiple returns (use paragraph spacing settings)
10. Mixing date formats (MM/YYYY in some places, Month Year in others)
11. Inconsistent job title formatting
12. Breaking job entries across page breaks
13. More than 2 colors total
14. Fancy decorative elements
15. Using icons instead of visible text (phone icon, email icon, etc.)
16. Hiding URLs behind hyperlink text

---

**END OF GUIDE**

This document provides all technical specifications needed to format professional executive resumes. Content creation (actual text, bullets, descriptions) is handled by upstream agents. This guide governs document structure, visual formatting, section organization, and ATS compatibility.
