# FirstSourceTeam Design System

> The first outplacement firm built for the people who use it.

This design system captures the visual, content and interaction language of **FirstSourceTeam** (FST) — a Minneapolis-based career transition & executive outplacement firm. Use it to prototype marketing pages, web app screens, iOS app screens, and slides in a way that looks and feels native to the brand.

## Source material
- **Live website:** https://www.firstsourceteam.com/careers (production site fetched April 2026)
- **Production stylesheet:** extracted from `_next/static/chunks/0j2xktywn2_p6.css` — saved as `scraps/site.css` (CSS variables, type ramp, color tokens are lifted verbatim where possible).
- **CareerIQ app:** https://careeriq.app (referenced as the proprietary AI platform product)
- **Sibling brand:** FirstSourceWealth — integrated financial services arm
- No codebase or Figma file was provided; all design decisions backfill from the production CSS + live site content.

## Products represented
1. **Marketing website** (`firstsourceteam.com/careers`) — warm editorial feel, converts employers and individuals.
2. **Web app** (`CareerIQ`) — AI-powered job search / resume / application tracker. Cooler, product-blue surfaces.
3. **iOS app** — companion to CareerIQ for coach check-ins, application status, messages on the go.
4. **Slide template** — for internal pitches, client reports, webinar decks.

## Index — what's in this folder

| File / Folder | Purpose |
|---|---|
| `README.md` | This file — brand overview, foundations, tone, iconography |
| `SKILL.md` | Agent-Skill frontmatter — for Claude Code compatibility |
| `colors_and_type.css` | All CSS variables + semantic element styles. Import this first. |
| `fonts/` | Licensed woff2 subsets (Playfair Display, Bree Serif, Inter, IBM Plex Mono) + alternates (Lora, DM Sans, Source Serif 4, Fraunces) pulled from the live site |
| `assets/` | Logos (`logo-fst.svg`, favicon), client logos, hero imagery, illustrations |
| `preview/` | Per-card HTML specimens that populate the Design System tab |
| `ui_kits/website/` | Marketing website UI kit — hero, bento, nav, footer, testimonial rail |
| `ui_kits/webapp/` | CareerIQ web app UI kit — sidebar, agent pipeline, composer |
| `ui_kits/ios/` | iOS app UI kit — native-looking screens in an iPhone frame |
| `slides/` | 16:9 slide template examples (title, content, comparison, quote, bento, close) |
| `scraps/` | Raw extracted material (CSS, debug HTML) — reference only |

---

## CONTENT FUNDAMENTALS

FirstSourceTeam's voice is **confident, critical, and humane.** It takes aim at the outplacement industry ("Outplacement was broken. We built the alternative.") and is unafraid to name enemies — legacy incumbents, box-checking HR programs, misaligned incentives. But it never condescends to the person in transition; the participant is the hero.

### Tone snapshot
- **Confident, not cocky.** Short declarative sentences. "Not a checkbox — a system that gets people hired."
- **Editorial, almost essayistic.** Long-form paragraphs sit comfortably next to numeric proof points. "Most career services hand you a template and wish you luck."
- **Specific, numeric, unflinching.** "4.9 / 174 reviews. 19 yrs. 100K+ jobseekers placed." They quote a competitor's review score ("1.7/5") and their own in one breath.
- **Warm toward individuals, sharp toward the system.** "We turn our clients into fans of us, and you."

### Casing
- **Sentence case everywhere** for headlines, subheads, buttons. Never Title Case headlines. Never ALL CAPS except for short eyebrow/kicker labels (≤ 3 words).
- Em-dashes — used liberally — to append qualifiers rather than period-chop.
- Section titles end with a period as if a full thought: *"Outplacement was broken. We built the alternative."*

### Pronouns
- **We / Our** for FST collectively. *We use AI to scale...* *We redesigned what it means...*
- **You / Your** when addressing employers and HR buyers directly. *Your people. Your brand. Your team.*
- **They / their / the participant** when referring to the job seeker inside employer-facing copy. Reinforces FST's "built for the user, not the buyer" positioning.

### Do / Don't
| Do | Don't |
|---|---|
| "Unlimited coaching until placed." | "Industry-leading coaching solutions." |
| "Deployed in 48 hours." | "Rapid time-to-value." |
| "Every resume rewritten from scratch." | "AI-powered resume optimization." |
| "1.7/5 — that's how participants rate the world's largest outplacement firm." | Coy comparisons. Name names. |
| Ship short proof points as numeric chips (4.9 / 19 yrs / 100K+). | Hand-wavy marketing adjectives. |

### Emoji / exclamation
- **No emoji** in product surfaces, marketing, or decks. Not a single one across the live site.
- **Exclamation points** are essentially absent — conviction comes from the period, not the exclaim.
- **Unicode dashes** (em-dash `—`) used constantly as the voice's primary punctuation.

### Numeric proof patterns
- Big-number chip + short qualifier: **4.9** over "174 reviews"; **3x** over "Faster placement vs. national average for executives 45+"; **100K+** over "Jobseekers placed."
- Always pair the number with a source or denominator.

---

## VISUAL FOUNDATIONS

FST's visual language is **warm editorial meets serious business** — a cream paper background (`#fcf9f5`) with a Playfair Display display serif, sober navy-teal primary (`#003147`), and a CareerIQ product blue (`#46A1EC`) reserved for the SaaS/product surfaces. It should read closer to a thoughtful independent magazine than a SaaS marketing page.

### Colors — *see `preview/colors-*.html` cards*
| Token | Hex | Role |
|---|---|---|
| `--fst-bg` | `#fcf9f5` | Default page — warm cream, never pure white |
| `--fst-bg-alt` | `#f7f3ed` | Alternating band |
| `--fst-bg-warm` | `#f2ede5` | Deeper band, under editorial callouts |
| `--fst-surface` | `#ffffff` | Cards, modals (the only time true white is allowed) |
| `--fst-heading` | `#111110` | Headlines — ink, warm-tinted |
| `--fst-text` | `#1f292e` | Body |
| `--fst-muted` | `#394b52` | Secondary text |
| `--fst-accent` | `#003147` | Primary brand — deep teal/navy (links, primary btns in marketing) |
| `--fst-career` | `#46A1EC` | CareerIQ product blue (buttons, chips, progress in the app) |
| `--fst-bg-dark` | `#0f1729` | Dark heroes, wealth product surfaces |
| `--fst-border` | `#e5e2db` | Warm paper divider |

### Typography — *see `preview/type-*.html` cards*
- **Display / Headlines:** `Playfair Display`, weights 500–700, tight tracking (`-0.03em`), line-height `1.05–1.15`. Used for H1/H2/H3 throughout marketing.
- **Secondary display / Feature callout:** `Bree Serif` 400 — the chunky, friendly slab sits in bento-card titles and some feature headers.
- **Body / UI:** `Inter` 400/500/600 — all paragraphs, buttons, nav, form fields.
- **Mono:** `IBM Plex Mono` — numerics, code-like chips, agent pipeline step labels.
- **Also present** (unused in our kit but loaded by site): Lora, Source Serif 4, Fraunces, DM Sans. Treat as available secondary options, not primary.

### Spacing & layout
- **8-pt base** soft grid — 4/8/12/16/24/32/48/64/96/128. Marketing sections breathe at 96–128px vertical.
- **Max content width ~1200–1280px**, centered, with generous gutters.
- **Bento grids** are a signature pattern — cards of mixed sizes, always separated by the `--fst-border` warm hairline and rounded at `16px`.
- **Fixed top nav**, ~72px tall, on `--fst-bg` with a 1px bottom border on scroll — never a backdrop blur.

### Backgrounds / imagery vibe
- **Warm cream** is the default — never a gradient, never a pattern, no hand-drawn illustration.
- **Full-bleed photographic hero** on key pages only (hero woman at the whiteboard, coaching session, remote-phone). Photos are **warm, naturally-lit documentary style** — real people, slight film grain, never overlit stock.
- **Satellite / textural images** (e.g. `bento-satellite.jpg`) show up in bento cards as moody full-bleed panels with overlay text.
- **Wealth / dark sibling** surfaces flip to `#0f1729`–`#0b1120` navy — otherwise no dark mode.
- **No emoji, no illustrated icons, no gradients, no SVG abstract "waves."**

### Animation
- Easings pulled from CSS: `--fst-ease-standard`, `--fst-ease-emphasized`, `--fst-ease-decelerate`, `--fst-ease-organic`.
- Durations: `0.3s` / `0.5s` / `0.8s` / `1.2s` — editorial pacing, never snappy.
- **Fades + subtle translate-up** on enter. Never bounces. Never springs. Never staggered gimmicks.

### Hover / press
- **Links** go from `--fst-accent` to `--fst-career` with a 0.3s colour transition (text underline stays).
- **Primary buttons** darken ~4% on hover; translate-y by 0 (no lift). Active: translate-y `+1px`, no scale.
- **Cards** lift `0 8px 24px rgba(17,17,16,0.08)` (`--fst-shadow-md`) on hover, 500ms `standard` easing. No scale > 1.02 ever.

### Borders & shadows
- **Borders** are 1px, `--fst-border` (warm paper hairline). Never 2px. Never colored except in dark mode / focus.
- **Focus ring** uses `--fst-accent-muted` (accent at 12% alpha) with 3px spread — warm, not neon.
- **Shadow system** (`--fst-shadow-sm/md/lg`) is always warm-black (`rgba(17,17,16,*)`), soft, never hard-edged.
- **Inner shadows** on cards: `inset 0 1px 0 rgba(255,255,255,0.5)` — a tiny highlight line.

### Corner radii
- `4 / 8 / 12 / 16 / 24 / 999`. Default for cards is `16px`. Buttons `8px`. Pill-shape only for category chips and the logo cloud avatars.

### Card anatomy
- Surface: `--fst-surface` (`#fff`) on `--fst-bg` cream.
- 1px border `--fst-border`.
- Radius `16px`.
- Shadow: `--fst-shadow-sm` at rest, `--fst-shadow-md` on hover.
- Padding `32px` (`--fst-space-6`).
- Titles in Playfair Display 24–32px; body in Inter 16–18px.

### Transparency & blur
- **Rarely.** A `rgba(252,249,245,0.85)` scroll-aware nav header. No glassmorphism elsewhere.
- Overlay gradients on full-bleed photo heroes: linear, dark-from-bottom (`rgba(17,17,16,0.6) → transparent`) for copy legibility. Protection gradient, not decoration.

### Color vibe of imagery
- **Warm, documentary, human.** Skin tones look real. Natural light, mid-contrast. Never cool/teal-graded. Never b&w. Slight paper-grain energy. Stock avoided except for Unsplash editorial portraits.

---

## ICONOGRAPHY

**FST uses almost no iconography in its marketing.** The live site is text-first: headlines, paragraphs, numbers, photos. Where icons appear:
- **Lucide-style 1.5px stroke SVGs** in the web app for navigation (search, arrow-right, check, clock, user). We substitute [Lucide](https://lucide.dev) as the icon set — it's the closest match to the web app's stroke weight and style.
- **Client company logos** (IBM, Google, Boeing, Siemens, Wells Fargo, Michelin, Walgreens, DoD) are the primary "icon" — used in logo-cloud rails to prove credibility. Stored in `assets/logos-clients/`.
- **FST wordmark** (`assets/logo-fst.svg`) — Playfair Display serif letters, first two letters in `--fst-heading` (warm black), last one in `--fst-career` (blue).
- **Favicon** (`assets/favicon.png`) — "FST" monogram in the same 2-color split.

### Rules
- No emoji. Ever.
- No decorative unicode glyphs except the em-dash (`—`) and multiplication sign (`×`) in dimensions.
- No brand-owned illustration system. Leave placeholders if a concept calls for one; ask the user for real material.
- If an icon is needed and not in Lucide, **ask** before inventing one.

#### Substitution flagged
- **FST wordmark SVG** is a *reconstruction* of the site's serif wordmark (the production logo is set as text in Playfair Display with the T recolored). It should pass as native — but if you have a vector logo file, please drop it in `assets/` and we'll swap it.
- **Icon library**: we point to Lucide as a CDN fallback. If the brand adopts a specific icon set later, replace references in `ui_kits/*`.

---

## Asks / next steps

See the last section of `SKILL.md` for how agents should use this system.
