# CareerIQ Visual Direction

## Current Read

The app is carrying several visual systems at once:

- A dark glass workspace: black/slate backgrounds, translucent cards, radial lighting, pale-blue accents.
- A cool light SaaS variant: white/cool-gray surfaces with standard blue actions.
- Document and resume surfaces: white paper, Tailwind blues/grays, and job-specific status colors.
- The imported FirstSourceTeam system: warm cream paper, deep teal/navy, CareerIQ blue, editorial typography, and softer brand restraint.

Those systems are individually understandable, but together they make the product feel less intentional than the underlying functionality deserves. The app should feel like a high-trust executive career workspace, not a marketing site, not a generic SaaS dashboard, and not a dark technical cockpit.

## Recommendation

Adopt a "warm executive workspace" direction.

Do not mirror the FirstSourceTeam marketing design one-for-one. Borrow the warmth, trust, restraint, and brand colors, but adapt them to a dense, repeat-use product where users are writing, comparing, reviewing, and making decisions under stress.

This is the strongest direction because the core user is not shopping casually. They may be newly laid off, senior, anxious, and time constrained. The interface should feel steady, smart, and humane while making the next effective action obvious.

## Design Principles

- Use color as product guidance, not decoration.
- Make the default product experience light and warm. Keep dark mode optional later, not primary.
- Keep resume and letter previews paper-like, readable, and print-adjacent.
- Use one clear primary action color across the app.
- Use workflow accents consistently so users learn the system.
- Reduce glass, radial lighting, and decorative gradients on work surfaces.
- Keep cards quiet and scannable. Avoid nested card stacks.
- Use typography for clarity first, editorial warmth second.

## Brand Relationship

FirstSourceTeam should be the parent brand influence, not a strict product skin.

What to borrow:

- Warm paper foundation.
- Deep teal/navy for structure and authority.
- CareerIQ blue for product action and progress.
- Sober borders, soft shadows, mature spacing.
- Humane editorial tone.

What to avoid inside the app:

- Using Playfair Display everywhere.
- Making every screen feel like a branded brochure.
- Cream-on-cream pages with low contrast.
- Overly restrained color that makes progress, priority, and status hard to scan.
- Decorative gradients or atmospheric backgrounds competing with content.

## Recommended Palette Roles

The product needs a small set of colors with jobs:

- Foundation: warm off-white / paper.
- Main surface: white or very light warm neutral.
- Structure: deep teal/navy for sidebar, top hierarchy, and serious headings.
- Primary action: slate CareerIQ blue, not bright SaaS blue.
- Success / ready: moss green.
- Attention / needs input: umber or amber-brown.
- Risk / blocker: controlled red.
- Networking / relationship cues: graphite, umber, or a restrained plum-gray, used sparingly.

The important rule is not the exact hex values yet. The important rule is that each color owns a meaning and does not wander.

## Anti-Pastel Rule

Avoid Easter egg status fills.

Pastel green, yellow, lavender, and pink boxes make the product feel like the same vibe-coded app pattern showing up everywhere. They are friendly, but they are not executive, operational, or serious enough for this product.

For status and workflow color, prefer:

- Warm neutral card backgrounds.
- Colored left rails, top hairlines, dots, icons, or checkmarks.
- Stronger selected borders.
- Darker status text.
- Small low-saturation tints only inside compact chips, never as large card fields.

The color should feel mineral and grounded: slate, moss, umber, oxblood, deep teal, graphite. If a tint is used, it should be close to warm gray or paper, not candy.

## Contrast Rule

The product must work for a broad outplacement audience, not only senior executives in a polished demo. Assume many users are 45-60+, under stress, reading dense career material, and switching between desktop and mobile.

That means color contrast should be stronger than a typical modern SaaS palette:

- Structure and action colors must be clearly different at a glance.
- Status colors must be dark enough to work as text, rails, icons, and borders.
- Selected states should use more than background tint: border weight, checkmark, rail, or icon.
- Primary buttons should meet accessible contrast with white text.
- Low-contrast gray labels should be reserved for true secondary information only.

The visual direction should feel confident, not muted. The key is richer contrast without returning to bright candy colors.

## Workflow Accent System

Use subtle room-level accents so the app becomes easier to understand at a glance:

- Profile: teal, for identity and foundation.
- Resume: slate blue, for creation and optimization.
- Jobs: moss green, for opportunity and search.
- Networking: umber/ochre, for relationships and outreach.
- Interviews: graphite or deep slate, for preparation and performance.
- Applications/timeline: neutral with status colors, so the timeline does not become visually chaotic.

These accents should appear in active nav states, small section markers, progress bars, chips, and empty-state illustrations. They should not become large page backgrounds.

## Typography Direction

Use Inter or the current product sans for most app UI. It is the right choice for scanning, forms, tables, filters, and writing tools.

Use FirstSourceTeam editorial fonts selectively:

- Playfair Display: marketing pages, onboarding moments, maybe a small number of high-emotion headings.
- Bree Serif: short coaching callouts or branded moments, if it remains legible.
- IBM Plex Mono: metrics, timestamps, score labels, and compact metadata.

Do not make the core workspace depend on display typography. The product must feel credible after two hours of actual use, not just in a hero screenshot.

## Screen-Level Application

Workspace shell:

- Move from dark glass to warm-light workspace.
- Keep left navigation strong and stable.
- Use color only for active room, progress, and actionable states.

Resume builder:

- Keep the document preview white/paper-like.
- Make editing panels calmer, with stronger hierarchy between current recommendation, evidence, and final text.
- Use slate blue for "apply improvement" and umber for "needs user proof."

Cover letters and messages:

- Give writing surfaces a composed editorial feel.
- Make tone, evidence strength, and next action easy to scan.
- Avoid surrounding long-form writing with dark chrome.

Jobs and Insider Jobs:

- Use green/moss for opportunity and search completion.
- Use clear, high-contrast selected states for companies and filters.
- Separate onsite, hybrid, and remote requirements visually if the backend requires separate runs.

Networking:

- Use warmer relationship cues.
- Make outreach status human-readable: draft, ready, sent, follow-up due, replied.

Timeline:

- Use status color sparingly.
- Prioritize legibility, dates, next steps, and risk.

## Implementation Plan

Phase 1: Token alignment

- Add a warm CareerIQ theme token layer.
- Map existing variables to the new palette rather than replacing every component manually.
- Keep hard-coded resume/document colors isolated until after the shell stabilizes.

Phase 2: Product shell pilot

- Apply the new tokens to workspace shell, sidebar, cards, buttons, chips, and global backgrounds.
- Remove or greatly reduce radial lighting and glass effects in the default theme.
- Test desktop and mobile screenshots on Dashboard, Jobs, Insider Jobs, Resume, Networking, and Timeline.

Phase 3: Feature-level color cleanup

- Replace hard-coded component colors with semantic tokens.
- Standardize selected, hover, active, disabled, success, warning, and risk states.
- Create compact visual examples for form controls, cards, statuses, and writing panels.

Phase 4: Editorial polish

- Add selective brand typography.
- Tune empty states, first-run guidance, and high-emotion moments.
- Avoid redesigning every screen at once; validate the actual user path first.

## My Preferred Next Move

Create a small visual prototype of the warm executive workspace theme before committing the whole app to it.

The prototype should cover:

- Workspace dashboard.
- Resume/writing surface.
- Insider Jobs selection/filter surface.
- Networking/outreach surface.
- Mobile workspace navigation.

This gives us a concrete before/after decision and avoids drifting into a full repaint without proof.
